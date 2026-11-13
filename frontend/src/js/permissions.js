import api from "../services/api.js";

const MODULE_LABELS = {
  M00_SYSTEM: "Hệ thống & Tài khoản",
  M01_HR: "Quản trị Nhân sự & Hồ sơ",
  M02_ATTENDANCE: "Chấm công & Ca kíp",
  M03_LEAVE: "Quản lý Nghỉ phép",
  M04_INSURANCE: "Bảo hiểm & Chế độ",
  M05_P3_SALARY: "Lương hiệu quả P3",
  M06_PAYROLL: "Tiền lương & Thuế",
  M07_RECRUIT: "Tuyển dụng & Onboard",
  M08_TRAINING: "Đào tạo",
  M09_EVAL: "Đánh giá nhân viên",
  M10_ASSET: "Trang thiết bị & Tài sản",
  M12_BI: "Báo cáo quản trị (BI)",
};

const MODULE_ICONS = {
  M00_SYSTEM: "settings",
  M01_HR: "group",
  M02_ATTENDANCE: "calendar_month",
  M03_LEAVE: "beach_access",
  M04_INSURANCE: "shield",
  M05_P3_SALARY: "military_tech",
  M06_PAYROLL: "payments",
  M07_RECRUIT: "person_search",
  M08_TRAINING: "school",
  M09_EVAL: "rate_review",
  M10_ASSET: "inventory_2",
  M12_BI: "summarize",
};

const ROLE_ICONS = {
  SUPER_ADMIN: "admin_panel_settings",
  DIRECTOR: "workspace_premium",
  HR_ADMIN: "manage_accounts",
  CB_PAYROLL: "account_balance",
  OFFICE_ADMIN: "domain",
  MANAGER: "supervisor_account",
  EMPLOYEE: "person",
};

const ACTION_LABELS = {
  VIEW: "Xem",
  CREATE: "Tạo",
  MANAGE: "Quản lý",
  APPROVE: "Duyệt",
  LOCK: "Chốt",
};

const ACTION_ICONS = {
  VIEW: "visibility",
  CREATE: "add_circle",
  MANAGE: "tune",
  APPROVE: "task_alt",
  LOCK: "lock",
};

const SCOPE_LABELS = {
  ALL: "Toàn công ty",
  DEPARTMENT: "Phòng ban",
  SELF: "Cá nhân",
};

const PROTECTED_PERMISSION = "P01";

const state = {
  roles: [],
  permissions: [],
  totals: { roles: 0, permissions: 0, assignments: 0 },
  selectedRoleId: null,
  draft: new Set(),
  original: new Set(),
  dirty: false,
  search: "",
  loading: false,
};

const escapeHtml = (value) => {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const getSelectedRole = () => {
  return state.roles.find((role) => role.id === state.selectedRoleId) || null;
};

const isSameSet = (first, second) => {
  if (first.size !== second.size) return false;
  return Array.from(first).every((item) => second.has(item));
};

const getPermissionsByModule = () => {
  const groups = new Map();

  state.permissions.forEach((permission) => {
    if (!groups.has(permission.module_code)) {
      groups.set(permission.module_code, []);
    }

    groups.get(permission.module_code).push(permission);
  });

  return groups;
};

const getErrorMessage = (error) => {
  return (
    error.response?.data?.message ||
    "Không thể kết nối máy chủ, vui lòng thử lại"
  );
};

const permissionHint = (permission) => {
  return [
    permission.name,
    `${permission.permission_code}`,
    `Loại: ${ACTION_LABELS[permission.action] || permission.action}`,
  ].join("\n");
};

let toastTimer = null;

const showToast = (message, type = "success") => {
  document.getElementById("permissionsToast")?.remove();
  window.clearTimeout(toastTimer);

  const toast = document.createElement("div");
  toast.id = "permissionsToast";
  toast.className = `fixed bottom-5 right-5 z-[100] max-w-sm rounded-lg shadow-lg px-4 py-3 font-body-sm text-body-sm ${
    type === "error"
      ? "bg-error-container text-on-error-container"
      : "bg-inverse-surface text-inverse-on-surface"
  }`;
  toast.textContent = message;
  document.body.appendChild(toast);

  toastTimer = window.setTimeout(() => toast.remove(), 2800);
};

let hintEl = null;

const initTooltip = () => {
  if (hintEl) return;

  hintEl = document.createElement("div");
  hintEl.className =
    "fixed z-[120] hidden pointer-events-none max-w-[260px] rounded-md bg-inverse-surface text-inverse-on-surface px-2.5 py-1.5 text-[12px] leading-snug whitespace-pre-line shadow-lg";
  document.body.appendChild(hintEl);

  const position = (target) => {
    const rect = target.getBoundingClientRect();
    const dir = target.getAttribute("data-hint-dir") || "top";
    hintEl.style.transform = "";
    hintEl.style.left = "0px";
    hintEl.style.top = "0px";

    const width = hintEl.offsetWidth;
    const height = hintEl.offsetHeight;

    let left;
    let top;

    if (dir === "right") {
      left = rect.right + 8;
      top = rect.top + rect.height / 2 - height / 2;
    } else if (dir === "bottom") {
      left = rect.left + rect.width / 2 - width / 2;
      top = rect.bottom + 8;
    } else {
      left = rect.left + rect.width / 2 - width / 2;
      top = rect.top - height - 8;
    }

    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - height - 8));

    hintEl.style.left = `${left}px`;
    hintEl.style.top = `${top}px`;
  };

  document.addEventListener("mouseover", (event) => {
    const target = event.target.closest("[data-hint]");
    if (!target) return;

    hintEl.textContent = target.getAttribute("data-hint");
    hintEl.classList.remove("hidden");
    position(target);
  });

  document.addEventListener("mouseout", (event) => {
    const target = event.target.closest("[data-hint]");
    if (target && !target.contains(event.relatedTarget)) {
      hintEl.classList.add("hidden");
    }
  });

  window.addEventListener("scroll", () => hintEl.classList.add("hidden"), true);
  window.addEventListener("resize", () => hintEl.classList.add("hidden"));
};

const statCard = (icon, iconClass, label, valueId, hint) => {
  return `
    <div class="flex items-center gap-space-md bg-surface-container-lowest rounded p-space-md shadow-sm" data-hint="${escapeHtml(hint)}" data-hint-dir="bottom">
      <div class="w-10 h-10 rounded ${iconClass} flex items-center justify-center shrink-0">
        <span class="material-symbols-outlined text-[24px]">${icon}</span>
      </div>
      <div class="flex flex-col min-w-0">
        <span id="${valueId}" class="text-on-surface font-headline-lg text-headline-lg font-bold leading-none">0</span>
        <span class="text-on-surface-variant font-label-sm text-label-sm mt-1 truncate">${label}</span>
      </div>
    </div>
  `;
};

const iconButton = (id, icon, hint) => {
  return `
    <button id="${id}" type="button" class="w-9 h-9 rounded-full bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface shadow-sm flex items-center justify-center transition-colors" data-hint="${escapeHtml(hint)}" data-hint-dir="bottom">
      <span class="material-symbols-outlined text-[20px]">${icon}</span>
    </button>
  `;
};

const renderShell = () => {
  const main = document.querySelector("main");
  if (!main) return;

  main.innerHTML = `
    <div id="permissionsApp" class="flex flex-col w-full gap-space-md">
      <div class="flex items-center justify-between gap-space-sm">
        <div class="flex items-center gap-space-xs text-on-surface-variant font-label-md text-label-md flex-wrap min-w-0">
          <span class="flex items-center gap-1 shrink-0">
            <span class="material-symbols-outlined text-[16px]">settings</span>
            Hệ thống &amp; Cấu hình
          </span>
          <span class="text-outline-variant">/</span>
          <span class="text-on-surface font-headline-sm text-headline-sm truncate">Phân quyền &amp; Vai trò</span>
        </div>
        <div class="flex items-center gap-space-sm shrink-0">
          <span id="permissionSaveStatus" class="font-label-sm text-label-sm text-outline hidden sm:inline">Đang tải...</span>
          ${iconButton("permissionsReloadBtn", "refresh", "Làm mới dữ liệu")}
          ${iconButton("permissionsSaveBtn", "save", "Lưu thay đổi phân quyền")}
        </div>
      </div>

      <div class="grid grid-cols-2 xl:grid-cols-4 gap-space-md">
        ${statCard("vpn_key", "bg-primary-fixed text-primary", "Vai trò", "statRoles", "Tổng số vai trò trong hệ thống")}
        ${statCard("rule", "bg-secondary-fixed text-secondary", "Quyền", "statPermissions", "Tổng số quyền có thể gán")}
        ${statCard("how_to_reg", "bg-tertiary-fixed text-tertiary", "Lượt gán", "statAssignments", "Tổng lượt gán quyền trên các vai trò")}
        ${statCard("fact_check", "bg-[#dcfce7] text-[#166534]", "Đang chọn", "statSelected", "Số quyền của vai trò đang chọn")}
      </div>

      <div class="grid grid-cols-12 gap-space-md items-start">
        <div class="col-span-12 xl:col-span-3 bg-surface-container-lowest rounded shadow-sm flex flex-col overflow-hidden">
          <div class="p-space-md flex flex-col gap-space-xs">
            <span class="text-on-surface font-headline-sm text-headline-sm">Vai trò</span>
            <div class="relative w-full">
              <span class="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline text-[18px]">search</span>
              <input id="roleSearch" class="w-full h-8 pl-8 pr-3 rounded bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary transition-all" placeholder="Tìm vai trò..." type="text" />
            </div>
          </div>
          <div id="roleList" class="flex flex-col max-h-[560px] overflow-y-auto"></div>
        </div>

        <div class="col-span-12 xl:col-span-9 flex flex-col gap-space-md min-w-0">
          <div id="roleDetail" class="bg-surface-container-lowest rounded shadow-sm p-space-md"></div>
          <div id="permissionMatrix" class="grid grid-cols-1 2xl:grid-cols-2 gap-space-md"></div>
        </div>
      </div>
    </div>
  `;
};

const updateStats = () => {
  const role = getSelectedRole();
  const assignments = state.roles.reduce(
    (total, item) => total + item.permission_ids.length,
    0,
  );

  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  setText("statRoles", String(state.roles.length));
  setText("statPermissions", String(state.permissions.length));
  setText("statAssignments", String(assignments));
  setText("statSelected", `${state.draft.size}/${state.permissions.length}`);
};

const renderRoles = () => {
  const roleList = document.getElementById("roleList");
  if (!roleList) return;

  const query = state.search.trim().toLowerCase();
  const filtered = state.roles.filter((role) => {
    const haystack =
      `${role.id} ${role.name} ${role.description || ""}`.toLowerCase();
    return haystack.includes(query);
  });

  if (!filtered.length) {
    roleList.innerHTML = `
      <div class="p-space-md text-center font-body-sm text-body-sm text-on-surface-variant">
        Không tìm thấy vai trò
      </div>
    `;
    return;
  }

  roleList.innerHTML = filtered
    .map((role) => {
      const active = role.id === state.selectedRoleId;
      const permissionCount = active
        ? state.draft.size
        : role.permission_ids.length;
      const scope = SCOPE_LABELS[role.data_scope] || role.data_scope;
      const icon = ROLE_ICONS[role.id] || "badge";

      return `
        <button type="button" data-role-id="${escapeHtml(role.id)}" data-hint="${escapeHtml(
          `${role.name}\n${role.description || "Chưa có mô tả"}\nPhạm vi: ${scope} · ${role.user_count} người dùng`,
        )}" data-hint-dir="right" class="w-full text-left p-space-sm px-space-md border-b border-surface-variant last:border-b-0 transition-colors ${
          active ? "bg-secondary-fixed/40" : "hover:bg-surface-container-low"
        }">
          <div class="flex items-center gap-space-sm min-w-0">
            <div class="w-9 h-9 rounded ${
              active
                ? "bg-primary-container text-on-primary"
                : "bg-surface-container-high text-on-surface-variant"
            } flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-[20px]">${icon}</span>
            </div>
            <div class="min-w-0 flex-1">
              <span class="block font-headline-sm text-headline-sm truncate ${
                active ? "text-primary font-bold" : "text-on-surface"
              }">${escapeHtml(role.name)}</span>
              <span class="block font-body-sm text-body-sm text-on-surface-variant truncate">${permissionCount} quyền · ${role.user_count} người</span>
            </div>
            <span class="material-symbols-outlined text-[18px] ${
              active ? "text-primary" : "text-outline-variant"
            }">${active ? "chevron_right" : "more_horiz"}</span>
          </div>
        </button>
      `;
    })
    .join("");
};

const renderDetail = () => {
  const roleDetail = document.getElementById("roleDetail");
  if (!roleDetail) return;

  const role = getSelectedRole();

  if (!role) {
    roleDetail.innerHTML = `
      <p class="font-body-sm text-body-sm text-on-surface-variant">Chọn một vai trò để xem chi tiết.</p>
    `;
    return;
  }

  const scope = SCOPE_LABELS[role.data_scope] || role.data_scope;
  const icon = ROLE_ICONS[role.id] || "badge";

  roleDetail.innerHTML = `
    <div class="flex items-center gap-space-md">
      <div class="w-12 h-12 rounded bg-primary-container text-on-primary flex items-center justify-center shrink-0">
        <span class="material-symbols-outlined text-[28px]">${icon}</span>
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-space-xs">
          <span class="text-on-surface font-headline-md text-headline-md font-bold">${escapeHtml(role.name)}</span>
          <span class="px-2 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm">${escapeHtml(role.id)}</span>
          <span class="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm">${escapeHtml(scope)}</span>
        </div>
        <p class="text-on-surface-variant font-body-md text-body-md mt-0.5 truncate">${escapeHtml(role.description || "Chưa có mô tả cho vai trò này.")}</p>
      </div>
      <div class="flex items-center gap-space-xs shrink-0">
        <span id="rolePermissionCount" class="font-headline-sm text-headline-sm font-bold text-primary">${state.draft.size}/${state.permissions.length}</span>
        <button id="permissionSelectAll" type="button" class="w-8 h-8 rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-primary flex items-center justify-center transition-colors" data-hint="Chọn tất cả quyền" data-hint-dir="bottom">
          <span class="material-symbols-outlined text-[20px]">select_all</span>
        </button>
        <button id="permissionClearAll" type="button" class="w-8 h-8 rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-error flex items-center justify-center transition-colors" data-hint="Bỏ chọn tất cả quyền" data-hint-dir="bottom">
          <span class="material-symbols-outlined text-[20px]">deselect</span>
        </button>
      </div>
    </div>
  `;
};

const renderMatrix = () => {
  const matrix = document.getElementById("permissionMatrix");
  if (!matrix) return;

  const groups = getPermissionsByModule();
  const role = getSelectedRole();

  if (!role) {
    matrix.innerHTML = "";
    return;
  }

  matrix.innerHTML = Array.from(groups.entries())
    .map(([moduleCode, permissions]) => {
      const checkedCount = permissions.filter((permission) =>
        state.draft.has(permission.id),
      ).length;
      const allChecked = checkedCount === permissions.length;
      const moduleLabel = MODULE_LABELS[moduleCode] || moduleCode;
      const moduleIcon = MODULE_ICONS[moduleCode] || "folder";

      return `
        <section class="rounded border border-outline-variant bg-surface-container-lowest overflow-hidden">
          <div class="flex items-center justify-between gap-space-xs px-space-md py-space-sm bg-surface-container-low border-b border-outline-variant">
            <div class="flex items-center gap-2 min-w-0">
              <span class="material-symbols-outlined text-primary text-[20px] shrink-0">${moduleIcon}</span>
              <span class="font-headline-sm text-headline-sm text-on-surface font-bold truncate">${escapeHtml(moduleLabel)}</span>
              <span data-module-count="${escapeHtml(moduleCode)}" class="px-1.5 py-0.5 rounded-full bg-surface-container-lowest text-outline font-label-sm text-label-sm shrink-0">${checkedCount}/${permissions.length}</span>
            </div>
            <label class="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant cursor-pointer shrink-0" data-hint="Chọn/bỏ toàn bộ quyền trong module" data-hint-dir="bottom">
              <input type="checkbox" data-module-toggle="${escapeHtml(moduleCode)}" class="w-4 h-4 accent-primary rounded cursor-pointer" ${allChecked ? "checked" : ""} />
            </label>
          </div>
          <div class="flex flex-wrap gap-1.5 p-space-sm">
            ${permissions
              .map((permission) => {
                const checked = state.draft.has(permission.id);
                const locked =
                  state.selectedRoleId === "SUPER_ADMIN" &&
                  permission.id === PROTECTED_PERMISSION;
                const actionIcon =
                  ACTION_ICONS[permission.action] || "check_circle";

                return `
                  <label class="relative group flex flex-col items-center gap-1 w-[72px] rounded p-2 border transition-colors cursor-pointer ${
                    checked
                      ? "border-primary bg-primary-container/10"
                      : "border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low"
                  } ${locked ? "opacity-80" : ""}" data-hint="${escapeHtml(permissionHint(permission))}" data-hint-dir="top">
                    <input type="checkbox" data-permission-id="${escapeHtml(permission.id)}" class="sr-only" ${checked ? "checked" : ""} ${locked ? "disabled" : ""} />
                    <span class="material-symbols-outlined text-[22px] ${
                      checked ? "text-primary" : "text-on-surface-variant"
                    }">${actionIcon}</span>
                    <span class="w-full text-center font-label-sm text-label-sm truncate ${
                      checked ? "text-primary font-semibold" : "text-on-surface-variant"
                    }">${escapeHtml(permission.name)}</span>
                    ${
                      locked
                        ? '<span class="absolute top-0.5 right-0.5 material-symbols-outlined text-[13px] text-outline">lock</span>'
                        : ""
                    }
                  </label>
                `;
              })
              .join("")}
          </div>
        </section>
      `;
    })
    .join("");

  Array.from(groups.entries()).forEach(([moduleCode, permissions]) => {
    const toggle = matrix.querySelector(
      `input[data-module-toggle="${moduleCode}"]`,
    );
    if (!toggle) return;

    const checkedCount = permissions.filter((permission) =>
      state.draft.has(permission.id),
    ).length;

    toggle.indeterminate =
      checkedCount > 0 && checkedCount < permissions.length;
  });
};

const updateModuleToggles = () => {
  const groups = getPermissionsByModule();

  groups.forEach((permissions, moduleCode) => {
    const toggle = document.querySelector(
      `input[data-module-toggle="${moduleCode}"]`,
    );
    if (!toggle) return;

    const checkedCount = permissions.filter((permission) =>
      state.draft.has(permission.id),
    ).length;

    toggle.checked = checkedCount === permissions.length;
    toggle.indeterminate =
      checkedCount > 0 && checkedCount < permissions.length;

    const countBadge = document.querySelector(
      `[data-module-count="${moduleCode}"]`,
    );
    if (countBadge) {
      countBadge.textContent = `${checkedCount}/${permissions.length}`;
    }
  });
};

const updateSaveState = () => {
  const saveButton = document.getElementById("permissionsSaveBtn");
  const reloadButton = document.getElementById("permissionsReloadBtn");
  const status = document.getElementById("permissionSaveStatus");

  if (saveButton) {
    saveButton.disabled = state.loading || !state.dirty;
    saveButton.classList.toggle("opacity-50", state.loading || !state.dirty);
    saveButton.classList.toggle("cursor-not-allowed", state.loading || !state.dirty);
  }

  if (reloadButton) {
    reloadButton.disabled = state.loading;
    reloadButton.classList.toggle("opacity-50", state.loading);
  }

  if (status) {
    status.textContent = state.loading
      ? "Đang xử lý..."
      : state.dirty
        ? "Có thay đổi chưa lưu"
        : "Đã đồng bộ";
    status.className = `font-label-sm text-label-sm ${
      state.dirty ? "text-error font-semibold" : "text-outline"
    } ${state.loading ? "text-outline font-normal" : ""} hidden sm:inline`;
  }
};

const refreshDraftUi = () => {
  state.dirty = !isSameSet(state.draft, state.original);

  const rolePermissionCount = document.getElementById("rolePermissionCount");
  if (rolePermissionCount) {
    rolePermissionCount.textContent = `${state.draft.size}/${state.permissions.length}`;
  }

  updateStats();
  updateSaveState();
  updateModuleToggles();
  renderRoles();
};

const selectRole = (roleId, { force = false } = {}) => {
  if (roleId === state.selectedRoleId) return;

  if (!force && state.dirty) {
    const confirmed = window.confirm(
      "Bạn có thay đổi chưa lưu. Bỏ thay đổi và chuyển vai trò khác?",
    );
    if (!confirmed) return;
  }

  const role = state.roles.find((item) => item.id === roleId);
  if (!role) return;

  state.selectedRoleId = role.id;
  state.original = new Set(role.permission_ids);
  state.draft = new Set(role.permission_ids);
  state.dirty = false;

  renderRoles();
  renderDetail();
  renderMatrix();
  updateStats();
  updateSaveState();
};

const renderAll = () => {
  renderRoles();
  renderDetail();
  renderMatrix();
  updateStats();
  updateSaveState();
};

const loadData = async ({ confirmDiscard = false } = {}) => {
  if (confirmDiscard && state.dirty) {
    const confirmed = window.confirm(
      "Bạn có thay đổi chưa lưu. Làm mới sẽ bỏ các thay đổi này?",
    );
    if (!confirmed) return;
  }

  try {
    state.loading = true;
    updateSaveState();

    const response = await api.get("/permissions/matrix");
    const data = response.data?.data || {};

    state.roles = data.roles || [];
    state.permissions = data.permissions || [];
    state.totals = data.totals || state.totals;

    const exists = state.roles.some(
      (role) => role.id === state.selectedRoleId,
    );

    if (!exists) {
      state.selectedRoleId = state.roles[0]?.id || null;
    }

    const role = getSelectedRole();
    state.original = new Set(role?.permission_ids || []);
    state.draft = new Set(role?.permission_ids || []);
    state.dirty = false;

    renderAll();
  } catch (error) {
    showToast(getErrorMessage(error), "error");
  } finally {
    state.loading = false;
    updateSaveState();
  }
};

const savePermissions = async () => {
  const role = getSelectedRole();

  if (!role || !state.dirty || state.loading) return;

  try {
    state.loading = true;
    updateSaveState();

    const response = await api.put(`/permissions/roles/${role.id}`, {
      permission_ids: Array.from(state.draft),
    });

    const savedIds = response.data?.data?.permission_ids || Array.from(state.draft);

    role.permission_ids = savedIds;
    state.original = new Set(savedIds);
    state.draft = new Set(savedIds);
    state.dirty = false;

    renderAll();
    showToast(`Đã lưu phân quyền cho ${role.name}`);
  } catch (error) {
    showToast(getErrorMessage(error), "error");
  } finally {
    state.loading = false;
    updateSaveState();
  }
};

const selectAllPermissions = () => {
  state.permissions.forEach((permission) => {
    state.draft.add(permission.id);
  });

  if (state.selectedRoleId === "SUPER_ADMIN") {
    state.draft.add(PROTECTED_PERMISSION);
  }

  renderMatrix();
  refreshDraftUi();
};

const clearAllPermissions = () => {
  state.draft.clear();

  if (state.selectedRoleId === "SUPER_ADMIN") {
    state.draft.add(PROTECTED_PERMISSION);
  }

  renderMatrix();
  refreshDraftUi();
};

const bindEvents = () => {
  const roleSearch = document.getElementById("roleSearch");
  const roleList = document.getElementById("roleList");
  const matrix = document.getElementById("permissionMatrix");

  roleSearch?.addEventListener("input", (event) => {
    state.search = event.target.value;
    renderRoles();
  });

  roleList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-role-id]");
    if (!button) return;

    selectRole(button.getAttribute("data-role-id"));
  });

  matrix?.addEventListener("change", (event) => {
    const moduleToggle = event.target.closest(
      "input[data-module-toggle]",
    );

    if (moduleToggle) {
      const moduleCode = moduleToggle.getAttribute("data-module-toggle");
      const permissions = state.permissions.filter(
        (permission) => permission.module_code === moduleCode,
      );

      permissions.forEach((permission) => {
        if (moduleToggle.checked) {
          state.draft.add(permission.id);
        } else if (
          !(
            state.selectedRoleId === "SUPER_ADMIN" &&
            permission.id === PROTECTED_PERMISSION
          )
        ) {
          state.draft.delete(permission.id);
        }
      });

      renderMatrix();
      refreshDraftUi();
      return;
    }

    const checkbox = event.target.closest(
      "input[data-permission-id]",
    );
    if (!checkbox) return;

    const permissionId = checkbox.getAttribute("data-permission-id");

    if (checkbox.checked) {
      state.draft.add(permissionId);
    } else if (
      !(
        state.selectedRoleId === "SUPER_ADMIN" &&
        permissionId === PROTECTED_PERMISSION
      )
    ) {
      state.draft.delete(permissionId);
    }

    renderMatrix();
    refreshDraftUi();
  });

  document
    .getElementById("permissionsSaveBtn")
    ?.addEventListener("click", savePermissions);

  document
    .getElementById("permissionsReloadBtn")
    ?.addEventListener("click", () => loadData({ confirmDiscard: true }));

  document
    .getElementById("permissionSelectAll")
    ?.addEventListener("click", selectAllPermissions);

  document
    .getElementById("permissionClearAll")
    ?.addEventListener("click", clearAllPermissions);
};

const setActiveNav = () => {
  document.querySelectorAll("aside nav a[data-path]").forEach((link) => {
    const active = link.getAttribute("data-path") === "phan-quyen";
    link.classList.toggle("bg-secondary-fixed", active);
    link.classList.toggle("text-on-secondary-fixed", active);
    link.classList.toggle("font-bold", active);
    link.classList.toggle("text-on-surface-variant", !active);
    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
};

export const initPermissions = (user) => {
  if (!user || user.role_id !== "SUPER_ADMIN") {
    window.location.hash = "";
    return;
  }

  renderShell();
  initTooltip();
  setActiveNav();
  bindEvents();
  loadData();
};
