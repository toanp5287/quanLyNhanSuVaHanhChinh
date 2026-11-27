import api, { USER_KEY } from "../services/api.js";
import { getUiAccess } from "../utils/uiAccess.js";

const MODULE_LABELS = {
  M00_SYSTEM: "Hệ thống & Tài khoản",
  M01_HR: "Hồ sơ & Hợp đồng",
  M02_ATTENDANCE: "Chấm công & Giải trình",
  M03_LEAVE: "Nghỉ phép",
  M04_INSURANCE: "Bảo hiểm & Chế độ",
  M05_P3_SALARY: "Lương hiệu quả P3",
  M06_PAYROLL: "Tiền lương & Thuế",
  M07_RECRUIT: "Tuyển dụng & Onboard",
  M08_TRAINING: "Đào tạo",
  M09_EVAL: "Đánh giá nhân viên",
  M10_ASSET: "Trang thiết bị & Tài sản",
  M12_BI: "Báo cáo quản trị (BI)",
};

const ACTION_LABELS = {
  VIEW: "Xem",
  CREATE: "Tạo",
  UPDATE: "Cập nhật",
  APPROVE: "Duyệt",
  MANAGE: "Quản lý",
  LOCK: "Chốt",
  EXECUTE: "Thực thi",
};

const ACTION_TONES = {
  VIEW: "bg-surface-container-highest text-on-surface-variant border-outline-variant",
  CREATE: "bg-secondary-container text-on-secondary-container border-secondary-fixed-dim",
  UPDATE: "bg-secondary-container text-on-secondary-container border-secondary-fixed-dim",
  APPROVE: "bg-[#dcfce7] text-[#166534] border-[#86efac]",
  MANAGE: "bg-primary-fixed text-on-primary-fixed border-primary-fixed-dim",
  LOCK: "bg-error-container text-on-error-container border-[#ffb4ab]",
  EXECUTE: "bg-error-container text-on-error-container border-[#ffb4ab]",
};

const SCOPE_LABELS = {
  ALL: "Tất cả",
  DEPARTMENT: "Phòng ban",
  SELF: "Bản thân",
};

const ACTION_ICONS = {
  VIEW: "visibility",
  CREATE: "add",
  UPDATE: "edit",
  APPROVE: "fact_check",
  MANAGE: "admin_panel_settings",
  LOCK: "lock",
  EXECUTE: "bolt",
};

const MODULE_ICONS = {
  M00_SYSTEM: "settings",
  M01_HR: "badge",
  M02_ATTENDANCE: "schedule",
  M03_LEAVE: "event_available",
  M04_INSURANCE: "health_and_safety",
  M05_P3_SALARY: "payments",
  M06_PAYROLL: "account_balance_wallet",
  M07_RECRUIT: "person_add",
  M08_TRAINING: "school",
  M09_EVAL: "fact_check",
  M10_ASSET: "devices",
  M11_ESS: "person",
  M12_BI: "insights",
};

const icon = (name, className = "text-[18px]") =>
  `<span class="material-symbols-outlined ${className}" aria-hidden="true">${name}</span>`;

const state = {
  roles: [],
  modules: [],
  matrix: {},
  originalMatrix: {},
  draftMatrix: {},
  originalScopes: {},
  draftScopes: {},
  totals: { roles: 0, permissions: 0, assignments: 0 },
  search: "",
  moduleFilter: "ALL",
  actionFilter: "ALL",
  collapsed: new Set(),
  viewMode: "role",
  selectedRoleId: null,
  loading: false,
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const normalizeText = (value) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const unwrap = (response) => response?.data?.data ?? response?.data ?? {};

const getErrorMessage = (error) =>
  error?.response?.data?.message || error?.message || "Không thể kết nối máy chủ";

let toastTimer = null;

const showToast = (message, type = "success") => {
  document.getElementById("rbacToast")?.remove();
  window.clearTimeout(toastTimer);
  const toast = document.createElement("div");
  toast.id = "rbacToast";
  toast.className = `fixed bottom-20 right-5 z-[260] max-w-sm rounded-xl border border-white/10 px-4 py-3 font-body-sm text-body-sm shadow-xl ${
    type === "error"
      ? "bg-error-container text-on-error-container"
      : "bg-inverse-surface text-inverse-on-surface"
  }`;
  toast.textContent = message;
  document.body.appendChild(toast);
  toastTimer = window.setTimeout(() => toast.remove(), 3600);
};

let tooltipLayer = null;
let tooltipBound = false;

const getTooltipLayer = () => {
  if (!tooltipLayer || !document.body.contains(tooltipLayer)) {
    tooltipLayer = document.createElement("div");
    tooltipLayer.id = "rbacTooltipLayer";
    tooltipLayer.className = "pointer-events-none fixed left-0 top-0 z-[400] max-w-[320px] rounded-lg border border-white/10 bg-inverse-surface px-2.5 py-1.5 font-body-sm text-body-sm leading-snug text-inverse-on-surface opacity-0 shadow-xl transition-opacity duration-100";
    tooltipLayer.style.visibility = "hidden";
    document.body.appendChild(tooltipLayer);
  }
  return tooltipLayer;
};

const hideTooltip = () => {
  if (!tooltipLayer) return;
  tooltipLayer.style.opacity = "0";
  tooltipLayer.style.visibility = "hidden";
};

const showTooltip = (target) => {
  const text = target.dataset.tooltip;
  if (!text) return hideTooltip();

  const tip = getTooltipLayer();
  tip.textContent = text;
  tip.style.visibility = "hidden";
  tip.style.opacity = "0";
  tip.style.left = "-9999px";
  tip.style.top = "-9999px";

  const rect = target.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  let top = rect.top - tipRect.height - 8;
  if (top < 8) top = rect.bottom + 8;
  left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));

  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  tip.style.visibility = "visible";
  tip.style.opacity = "1";
};

const handleTooltipEvent = (event) => {
  const root = document.getElementById("rbacApp");
  if (!root) return hideTooltip();

  const target = event.target instanceof Element ? event.target.closest("[data-tooltip]") : null;
  if (!target || !root.contains(target)) return hideTooltip();

  if (event.type === "mouseout" || event.type === "focusout") {
    if (event.relatedTarget && target.contains(event.relatedTarget)) return;
    hideTooltip();
    return;
  }

  showTooltip(target);
};

const bindTooltipEvents = () => {
  if (tooltipBound) return;
  tooltipBound = true;
  document.addEventListener("mouseover", handleTooltipEvent);
  document.addEventListener("mouseout", handleTooltipEvent);
  document.addEventListener("focusin", handleTooltipEvent);
  document.addEventListener("focusout", handleTooltipEvent);
  window.addEventListener("scroll", hideTooltip, true);
  window.addEventListener("resize", hideTooltip);
  window.addEventListener("hashchange", hideTooltip);
};

const isLocked = (role) => Boolean(role?.is_locked) || role?.id === "SUPER_ADMIN";

const allPermissions = () => state.modules.flatMap((module) => module.permissions || []);

const visibleModules = () => {
  const query = normalizeText(state.search.trim());
  return state.modules
    .filter((module) => state.moduleFilter === "ALL" || module.module_code === state.moduleFilter)
    .map((module) => ({
      ...module,
      permissions: (module.permissions || []).filter((permission) => {
        if (state.actionFilter !== "ALL" && permission.action !== state.actionFilter) return false;
        if (!query) return true;
        return normalizeText(
          `${permission.id} ${permission.permission_code} ${permission.name} ${permission.action}`,
        ).includes(query);
      }),
    }))
    .filter((module) => module.permissions.length > 0);
};

const countChanges = () => {
  let permissions = 0;
  const permissionRoles = new Set();
  const changedCells = new Set();
  const permissionIds = new Set(allPermissions().map((permission) => permission.id));

  state.roles.forEach((role) => {
    if (isLocked(role)) return;
    const original = new Set(state.originalMatrix[role.id] || []);
    const draft = new Set(state.draftMatrix[role.id] || []);

    permissionIds.forEach((permissionId) => {
      if (original.has(permissionId) !== draft.has(permissionId)) {
        permissions += 1;
        permissionRoles.add(role.id);
        changedCells.add(`${role.id}:${permissionId}`);
      }
    });

    if (state.originalScopes[role.id] !== state.draftScopes[role.id]) {
      permissionRoles.add(role.id);
    }
  });

  const scopes = state.roles.filter(
    (role) =>
      !isLocked(role) && state.originalScopes[role.id] !== state.draftScopes[role.id],
  ).length;

  return {
    permissions,
    scopes,
    roles: permissionRoles.size,
    total: permissions + scopes,
    changedCells,
  };
};

const getSelectedRole = () => state.roles.find((role) => role.id === state.selectedRoleId) || null;

const countRoleChanges = (roleId) => {
  if (!roleId || isLocked(state.roles.find((role) => role.id === roleId))) return 0;
  const original = new Set(state.originalMatrix[roleId] || []);
  const draft = new Set(state.draftMatrix[roleId] || []);
  const permissionIds = new Set(allPermissions().map((permission) => permission.id));
  let changed = 0;
  permissionIds.forEach((permissionId) => {
    if (original.has(permissionId) !== draft.has(permissionId)) changed += 1;
  });
  if (state.originalScopes[roleId] !== state.draftScopes[roleId]) changed += 1;
  return changed;
};

const setPermission = (roleId, permissionId, enabled) => {
  const role = state.roles.find((item) => item.id === roleId);
  if (!role || isLocked(role)) return;
  const draft = new Set(state.draftMatrix[roleId] || []);
  if (enabled) draft.add(permissionId);
  else draft.delete(permissionId);
  state.draftMatrix[roleId] = [...draft];
};

const setModulePermissions = (roleId, permissions, enabled) => {
  const role = state.roles.find((item) => item.id === roleId);
  if (!role || isLocked(role)) return;
  const draft = new Set(state.draftMatrix[roleId] || []);
  permissions.forEach((permission) => {
    if (enabled) draft.add(permission.id);
    else draft.delete(permission.id);
  });
  state.draftMatrix[roleId] = [...draft];
};

const styles = `
  <style>
    .rbac-shell .rbac-icon-btn { position: relative; width: 2rem; height: 2rem; flex: 0 0 2rem; display: inline-flex; align-items: center; justify-content: center; border-radius: .5rem; border: 1px solid #c2c6d3; background: #f4f3f7; color: #424751; transition: all .15s ease; }
    .rbac-shell .rbac-icon-btn:hover { background: #e9e7eb; color: #003877; }
    .rbac-shell .rbac-legend-icon { position: relative; display: inline-flex; width: 1.75rem; height: 1.75rem; align-items: center; justify-content: center; border-radius: .5rem; transition: background .15s ease; }
    .rbac-shell .rbac-legend-icon:hover { background: #e9e7eb; }
    .rbac-shell .rbac-role-chip { position: relative; }
    .rbac-shell .rbac-toggle-icon { position: relative; display: inline-flex; width: 2.25rem; height: 2.25rem; flex-shrink: 0; align-items: center; justify-content: center; border-radius: .5rem; transition: transform .15s ease, background .15s ease; }
    .rbac-shell .rbac-toggle-icon:hover { transform: scale(1.06); }
    .rbac-shell .rbac-tooltip { position: relative; }
    .rbac-shell .rbac-filter-pill { border-radius: 9999px; border: 1px solid #c2c6d3; padding: 5px 11px; font-size: 11px; font-weight: 500; color: #424751; background: #ffffff; transition: all .15s ease; }
    .rbac-shell .rbac-filter-pill:hover { background: #f4f3f7; color: #1a1b1e; }
    .rbac-shell .rbac-filter-pill.active { border-color: #0b4f9e; background: #0b4f9e; color: #ffffff; }
    .rbac-shell .rbac-table thead th { position: sticky; top: 0; z-index: 20; background: #f4f3f7; }
    .rbac-shell .rbac-table thead th:first-child { left: 0; z-index: 30; background: #f4f3f7; }
    .rbac-shell .rbac-table td:first-child { position: sticky; left: 0; z-index: 10; background: #ffffff; }
    .rbac-shell .rbac-module-row td:first-child { background: #f4f3f7; }
    .rbac-shell .rbac-table tbody tr:hover td:first-child { background: #f4f3f7; }
    .rbac-shell .rbac-check { width: 1rem; height: 1rem; accent-color: #003877; cursor: pointer; }
    .rbac-shell .rbac-lock { position: relative; display: inline-flex; width: 1.75rem; height: 1.75rem; align-items: center; justify-content: center; border-radius: .5rem; border: 1px solid #f0c000; background: #fff4d6; color: #8a5a00; }
    .rbac-shell .rbac-scope { width: 88px; border-radius: .25rem; border: 1px solid #c2c6d3; background: #ffffff; padding: 2px 4px; font-size: 10px; color: #424751; }
    .rbac-shell .rbac-group-check { position: relative; display: inline-flex; }
    .rbac-shell .rbac-scope-role { min-width: 118px; border-radius: .25rem; border: 1px solid #c2c6d3; background: #ffffff; padding: 6px 8px; font-size: 12px; color: #1a1b1e; }
  </style>
`;

const statCard = (iconName, label, valueId, iconClass) => `
  <div class="flex min-w-0 items-center gap-space-xs">
    <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${iconClass}">${icon(iconName, "text-[16px]")}</span>
    <div class="flex min-w-0 items-baseline gap-1">
      <span id="${valueId}" class="font-headline-sm text-headline-sm font-semibold text-on-surface">0</span>
      <span class="truncate font-label-sm text-label-sm text-on-surface-variant">${label}</span>
    </div>
  </div>
`;

const renderShell = () => {
  const main = document.querySelector("main");
  if (!main) return;

  bindTooltipEvents();
  hideTooltip();
  main.innerHTML = `
    <div id="rbacApp" class="rbac-shell flex flex-col gap-space-md font-body-md text-body-md text-on-surface">
      ${styles}
      <div class="flex flex-wrap items-start justify-between gap-space-md">
        <div class="flex items-center gap-space-md">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">${icon("shield", "text-[22px]")}</span>
          <div>
            <h1 class="font-headline-md text-headline-md font-bold text-on-surface">Bảng phân quyền động</h1>
            <p class="font-body-sm text-body-sm text-on-surface-variant">Chọn vai trò để chỉnh sửa · Di chuột vào icon để xem chú thích.</p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-space-xs">
          <div class="inline-flex rounded-lg border border-outline-variant/70 bg-surface-container-low p-0.5">
            <button type="button" data-action="view-mode" data-value="role" class="inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-label-md text-label-md transition-colors ${state.viewMode === "role" ? "bg-primary-container text-on-primary" : "text-on-surface-variant hover:text-primary"}">${icon("person", "text-[16px]")} Theo vai trò</button>
            <button type="button" data-action="view-mode" data-value="matrix" class="inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-label-md text-label-md transition-colors ${state.viewMode === "matrix" ? "bg-primary-container text-on-primary" : "text-on-surface-variant hover:text-primary"}">${icon("grid_view", "text-[16px]")} Ma trận</button>
          </div>
          <button type="button" data-action="expand-all" data-tooltip="Mở rộng tất cả" class="rbac-icon-btn">${icon("expand_more")}</button>
          <button type="button" data-action="collapse-all" data-tooltip="Thu gọn tất cả" class="rbac-icon-btn">${icon("expand_less")}</button>
          <button type="button" data-action="reload" data-tooltip="Tải lại dữ liệu" class="rbac-icon-btn">${icon("refresh")}</button>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-x-space-xl gap-y-space-sm rounded-xl border border-outline-variant/50 bg-surface-container-lowest/70 px-4 py-2.5">
        ${statCard("group", "Vai trò", "rbacStatRoles", "bg-primary-fixed text-primary")}
        ${statCard("key", "Quyền", "rbacStatPermissions", "bg-secondary-fixed text-on-secondary-fixed")}
        ${statCard("shield", "Lượt gán", "rbacStatAssignments", "bg-tertiary-fixed text-on-tertiary-fixed")}
        ${statCard("swap_horiz", "Thay đổi", "rbacStatChanges", "bg-[#dcfce7] text-[#166534]")}
      </div>

      <div id="rbacRoleChips" class="flex flex-wrap gap-space-xs"></div>

      <div class="sticky top-0 z-30 rounded-xl border border-outline-variant/70 bg-surface-container-lowest/95 p-space-md shadow-sm backdrop-blur-md">
        <div class="flex flex-wrap items-center gap-space-sm">
          <div class="relative min-w-[220px] flex-1">
            <span class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-outline">${icon("search", "text-[18px]")}</span>
            <input id="rbacSearch" type="text" value="${escapeHtml(state.search)}" placeholder="Tìm mã quyền, tên quyền hoặc phân hệ..." class="w-full h-9 pl-8 pr-3 rounded-lg bg-surface-container-low font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary" />
          </div>
          <select id="rbacModuleFilter" class="h-9 rounded-lg border border-outline-variant bg-surface-container-low px-3 font-body-md text-body-md text-on-surface focus:outline-none focus:ring-1 focus:ring-primary">
            <option value="ALL">Tất cả phân hệ</option>
            ${state.modules
              .map(
                (module) =>
                  `<option value="${escapeHtml(module.module_code)}" ${state.moduleFilter === module.module_code ? "selected" : ""}>${escapeHtml(module.module_label || module.module_code)}</option>`,
              )
              .join("")}
          </select>
          <div id="rbacActionFilters" class="flex flex-wrap items-center gap-space-xs"></div>
        </div>
        <div class="mt-space-sm flex flex-wrap items-center justify-between gap-space-sm border-t border-outline-variant/50 pt-space-sm">
          <div class="flex flex-wrap items-center gap-space-xs">
            <span class="rbac-legend-icon text-[#166534]" data-tooltip="Được phép: quyền đã được cấp cho vai trò này" aria-label="Được phép">${icon("check_circle", "text-[17px]")}</span>
            <span class="rbac-legend-icon text-[#8a5a00]" data-tooltip="Chưa lưu: thay đổi của bạn chưa được gửi lên máy chủ" aria-label="Chưa lưu">${icon("edit_note", "text-[17px]")}</span>
            <span class="rbac-legend-icon text-[#8a5a00]" data-tooltip="Không thể sửa: vai trò toàn quyền hệ thống" aria-label="Không thể sửa">${icon("lock", "text-[17px]")}</span>
            <span class="rbac-legend-icon text-on-surface-variant" data-tooltip="Phạm vi dữ liệu: Tất cả · Phòng ban · Bản thân" aria-label="Phạm vi dữ liệu">${icon("public", "text-[17px]")}</span>
          </div>
          <div id="rbacBulkActions" class="flex flex-wrap items-center gap-space-xs"></div>
        </div>
      </div>

      <div id="rbacTableArea" class="max-h-[64vh] overflow-auto rounded-xl border border-outline-variant/70 bg-surface-container-lowest shadow-sm"></div>
      <div id="rbacFloatingBar"></div>
    </div>
  `;

  const app = document.getElementById("rbacApp");
  if (app) {
    app.onclick = handleClick;
    app.onchange = handleChange;
    app.oninput = handleInput;
  }
};

const renderHead = () => `
  <tr class="font-label-sm text-label-sm text-on-surface-variant">
    <th class="min-w-[300px] border-b border-outline-variant px-4 py-3 text-left font-semibold">Quyền / Phân hệ</th>
    ${state.roles
      .map((role) => {
        const locked = isLocked(role);
        return `<th class="min-w-[165px] border-b border-l border-outline-variant px-3 py-3 text-left">
          <div class="flex items-center justify-between gap-space-xs">
            <div class="min-w-0">
              <div class="rbac-tooltip block truncate font-headline-sm text-headline-sm font-semibold text-on-surface" tabindex="0" data-tooltip="${escapeHtml(`${role.name} · ${role.id}`)}" aria-label="${escapeHtml(`${role.name} · ${role.id}`)}">${escapeHtml(role.name)}</div>
              <div class="rbac-tooltip truncate font-label-sm text-label-sm font-normal text-outline" tabindex="0" data-tooltip="${escapeHtml(`Mã vai trò: ${role.id}`)}" aria-label="${escapeHtml(`Mã vai trò: ${role.id}`)}">${escapeHtml(role.id)}</div>
            </div>
            <span class="shrink-0 rounded-full border border-outline-variant bg-surface-container-highest px-1.5 py-0.5 font-label-sm text-label-sm text-on-surface-variant">${Number(role.user_count || 0)} NV</span>
          </div>
          <div class="mt-2">
            ${
              locked
                ? `<span class="rbac-lock" data-tooltip="Toàn quyền hệ thống (không thể chỉnh sửa)">${icon("lock", "text-[14px]")}</span>`
                : `<select data-role-scope="${escapeHtml(role.id)}" class="rbac-scope">
                    ${Object.entries(SCOPE_LABELS)
                      .map(
                        ([value, label]) =>
                          `<option value="${value}" ${state.draftScopes[role.id] === value ? "selected" : ""}>${label}</option>`,
                      )
                      .join("")}
                  </select>`
            }
          </div>
        </th>`;
      })
      .join("")}
  </tr>
`;

const renderActionFilters = () => {
  const container = document.getElementById("rbacActionFilters");
  if (!container) return;
  const actions = ["ALL", ...new Set(allPermissions().map((permission) => permission.action).filter(Boolean))];
  container.innerHTML = actions
    .map(
      (action) =>
        `<button type="button" data-action="filter-action" data-value="${escapeHtml(action)}" class="rbac-filter-pill ${state.actionFilter === action ? "active" : ""}">${action === "ALL" ? "Tất cả" : escapeHtml(ACTION_LABELS[action] || action)}</button>`,
    )
    .join("");
};

const renderRoleChips = () => {
  const container = document.getElementById("rbacRoleChips");
  if (!container) return;
  if (!state.roles.length) {
    container.innerHTML = "";
    return;
  }

  const total = allPermissions().length;
  const permissionIds = new Set(allPermissions().map((permission) => permission.id));
  container.innerHTML = state.roles
    .map((role) => {
      const locked = isLocked(role);
      const selected = state.selectedRoleId === role.id;
      const granted = (state.draftMatrix[role.id] || []).filter((id) => permissionIds.has(id)).length;
      const changes = countRoleChanges(role.id);
      const roleDetail = `${role.id} · ${granted}/${total} quyền · ${SCOPE_LABELS[state.draftScopes[role.id]] || state.draftScopes[role.id]}`;

      return `<button type="button" data-action="select-role" data-value="${escapeHtml(role.id)}" data-tooltip="${escapeHtml(`${role.name} · ${roleDetail}${changes ? ` · ${changes} thay đổi` : ""}`)}" class="rbac-role-chip flex items-center gap-space-xs rounded-full border px-2.5 py-1.5 text-left transition-colors ${selected ? "border-primary bg-primary-fixed text-primary" : "border-outline-variant/70 bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low"}" aria-label="${escapeHtml(roleDetail)}">
        <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${locked ? "bg-[#fff4d6] text-[#8a5a00]" : "bg-secondary-container text-on-secondary-container"}">${icon(locked ? "lock" : "group", "text-[14px]")}</span>
        <span class="max-w-[130px] truncate font-label-md text-label-md font-semibold">${escapeHtml(role.name)}</span>
      </button>`;
    })
    .join("");
};

const renderBulkActions = () => {
  const container = document.getElementById("rbacBulkActions");
  if (!container) return;

  const role = getSelectedRole();
  if (state.viewMode === "matrix" || !role || isLocked(role)) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <button type="button" data-action="select-visible" data-tooltip="Chọn tất cả quyền đang hiển thị cho vai trò này" class="rbac-icon-btn" aria-label="Chọn quyền đang hiện">${icon("done_all")}</button>
    <button type="button" data-action="clear-visible" data-tooltip="Bỏ tất cả quyền đang hiển thị cho vai trò này" class="rbac-icon-btn" aria-label="Bỏ quyền đang hiện">${icon("remove_done")}</button>
  `;
};

const renderRolePanel = () => {
  const area = document.getElementById("rbacTableArea");
  if (!area) return;

  const role = getSelectedRole();
  if (!role) {
    area.innerHTML = `<div class="px-4 py-12 text-center font-body-md text-body-md text-outline">Chọn một vai trò ở phía trên để bắt đầu.</div>`;
    return;
  }

  const modules = visibleModules();
  const locked = isLocked(role);
  const permissionIds = new Set(allPermissions().map((permission) => permission.id));
  const granted = (state.draftMatrix[role.id] || []).filter((id) => permissionIds.has(id)).length;
  const total = permissionIds.size;
  const changes = countChanges();

  const header = `<div class="border-b border-outline-variant/50 bg-surface-container-lowest px-5 py-4">
    <div class="flex flex-wrap items-center justify-between gap-space-md">
      <div class="flex min-w-0 items-center gap-space-md">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-fixed text-primary">${icon("badge", "text-[20px]")}</span>
        <div class="min-w-0">
          <div class="truncate font-headline-md text-headline-md font-bold text-on-surface">${escapeHtml(role.name)}</div>
          <div class="truncate font-label-sm text-label-sm text-on-surface-variant">${escapeHtml(role.id)} · ${Number(role.user_count || 0)} nhân viên · ${granted}/${total} quyền</div>
        </div>
      </div>
      ${
        locked
          ? `<span class="inline-flex items-center gap-1 rounded-lg bg-[#fff4d6] px-3 py-2 font-label-md text-label-md text-[#8a5a00]" data-tooltip="Toàn quyền hệ thống, không thể chỉnh sửa">${icon("lock", "text-[16px]")} Toàn quyền hệ thống</span>`
          : `<label class="flex items-center gap-space-xs font-label-sm text-label-sm text-on-surface-variant">
              ${icon("public", "text-[16px]")} Phạm vi
              <select data-role-scope="${escapeHtml(role.id)}" class="rbac-scope-role">
                ${Object.entries(SCOPE_LABELS)
                  .map(
                    ([value, label]) =>
                      `<option value="${value}" ${state.draftScopes[role.id] === value ? "selected" : ""}>${label}</option>`,
                  )
                  .join("")}
              </select>
            </label>`
      }
    </div>
  </div>`;

  if (!modules.length) {
    area.innerHTML = `${header}<div class="px-4 py-12 text-center font-body-md text-body-md text-outline">Không có quyền nào khớp bộ lọc.</div>`;
    return;
  }

  const cards = modules
    .map((module) => {
      const collapsed = state.collapsed.has(module.module_code);
      const selectedCount = module.permissions.filter((permission) =>
        (state.draftMatrix[role.id] || []).includes(permission.id),
      ).length;
      const allSelected = selectedCount === module.permissions.length && selectedCount > 0;
      const moduleIcon = MODULE_ICONS[module.module_code] || "widgets";
      const moduleLabel = module.module_label || module.module_code;

      const rows = collapsed
        ? ""
        : module.permissions
            .map((permission) => {
              const enabled = (state.draftMatrix[role.id] || []).includes(permission.id);
              const dirty = changes.changedCells.has(`${role.id}:${permission.id}`);
              const actionIcon = ACTION_ICONS[permission.action] || "check_small";
              const actionLabel = ACTION_LABELS[permission.action] || permission.action || "—";
              const fullMeta = `${permission.id} · ${permission.permission_code} · ${actionLabel}`;
              const toggle = locked
                ? `<span class="rbac-legend-icon text-[#166534]" data-tooltip="Toàn quyền hệ thống">${icon("lock", "text-[18px]")}</span>`
                : `<button type="button" data-action="toggle-permission" data-role-id="${escapeHtml(role.id)}" data-permission-id="${escapeHtml(permission.id)}" aria-pressed="${enabled}" data-tooltip="${enabled ? "Được phép — nhấn để bỏ quyền" : "Không được phép — nhấn để cấp quyền"}" class="rbac-toggle-icon ${enabled ? "bg-primary-fixed text-primary" : "bg-surface-container-low text-outline"}">${icon(enabled ? "check_circle" : "radio_button_unchecked", "text-[21px]")}</button>`;

              return `<div class="flex items-start justify-between gap-space-md px-5 py-3.5 transition-colors hover:bg-surface-container-low/40">
                <div class="flex min-w-0 items-start gap-space-md">
                  <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${enabled ? "bg-secondary-fixed text-on-secondary-fixed" : "bg-surface-container-low text-outline"}">${icon(actionIcon, "text-[17px]")}</span>
                  <div class="min-w-0">
                    <div class="flex items-center gap-space-xs">
                      <span class="rbac-tooltip truncate font-body-md text-body-md font-medium text-on-surface" tabindex="0" data-tooltip="${escapeHtml(permission.name)}" aria-label="${escapeHtml(permission.name)}">${escapeHtml(permission.name)}</span>
                      ${dirty ? `<span class="rbac-legend-icon !h-5 !w-5 text-[#8a5a00]" data-tooltip="Thay đổi chưa lưu">${icon("edit_note", "text-[13px]")}</span>` : ""}
                    </div>
                    <div class="rbac-tooltip mt-0.5 flex flex-wrap items-center gap-space-xs font-label-sm text-label-sm text-outline" tabindex="0" data-tooltip="${escapeHtml(fullMeta)}" aria-label="${escapeHtml(fullMeta)}">
                      <span>${escapeHtml(permission.id)}</span><span>·</span><span>${escapeHtml(permission.permission_code)}</span><span>·</span><span>${escapeHtml(actionLabel)}</span>
                    </div>
                  </div>
                </div>
                ${toggle}
              </div>`;
            })
            .join("");

      return `<section class="overflow-hidden rounded-xl border bg-surface-container-lowest transition-colors ${collapsed ? "border-outline-variant/50" : "border-outline-variant shadow-sm ring-1 ring-outline-variant/20"}">
        <div class="flex items-center justify-between gap-space-md px-5 py-4">
          <button type="button" data-action="toggle-module" data-module="${escapeHtml(module.module_code)}" class="flex min-w-0 items-center gap-space-md text-left">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-fixed text-primary">${icon(moduleIcon, "text-[19px]")}</span>
            <span class="min-w-0">
              <span class="rbac-tooltip block truncate font-headline-sm text-headline-sm font-semibold text-on-surface" tabindex="0" data-tooltip="${escapeHtml(moduleLabel)}" aria-label="${escapeHtml(moduleLabel)}">${escapeHtml(moduleLabel)}</span>
              <span class="block truncate font-label-sm text-label-sm text-outline">${escapeHtml(module.module_code)} · ${module.permissions.length} quyền</span>
            </span>
            <span class="shrink-0 text-outline">${icon(collapsed ? "chevron_right" : "expand_more", "text-[18px]")}</span>
          </button>
          <div class="flex shrink-0 items-center gap-space-xs">
            <span class="rounded-full bg-surface-container-low px-2 py-1 font-label-sm text-label-sm text-on-surface-variant">${selectedCount}/${module.permissions.length}</span>
            ${
              locked
                ? ""
                : `<button type="button" data-action="toggle-module-permissions" data-module="${escapeHtml(module.module_code)}" data-role-id="${escapeHtml(role.id)}" data-tooltip="${allSelected ? "Bỏ chọn cả nhóm" : "Chọn cả nhóm"}" class="rbac-icon-btn" aria-label="${allSelected ? "Bỏ chọn cả nhóm" : "Chọn cả nhóm"}">${icon(allSelected ? "remove_done" : "done_all")}</button>`
            }
          </div>
        </div>
        ${collapsed ? "" : `<div class="border-t border-outline-variant/40">${rows}</div>`}
      </section>`;
    })
    .join("");

  area.innerHTML = `${header}<div class="flex flex-col gap-space-md p-space-md xl:p-space-xl">${cards}</div>`;
};

const renderTable = () => {
  const area = document.getElementById("rbacTableArea");
  if (!area) return;

  area.innerHTML = `<table class="rbac-table w-full border-collapse text-left" style="min-width:${Math.max(1000, 300 + state.roles.length * 165)}px"><thead>${renderHead()}</thead><tbody id="rbacBody"></tbody></table>`;
  const body = document.getElementById("rbacBody");
  if (!body) return;
  const modules = visibleModules();
  const changes = countChanges();

  if (!modules.length) {
    body.innerHTML = `<tr><td colspan="${state.roles.length + 1}" class="px-4 py-12 text-center font-body-md text-body-md text-outline">Không có quyền nào khớp bộ lọc.</td></tr>`;
    return;
  }

  body.innerHTML = modules
    .map((module) => {
      const collapsed = state.collapsed.has(module.module_code);
      const totalCount = (
        state.modules.find((item) => item.module_code === module.module_code)?.permissions || []
      ).length;
      const moduleHeader = `
        <tr class="rbac-module-row bg-surface-container-low">
          <td class="border-b border-outline-variant px-4 py-3">
            <button type="button" data-action="toggle-module" data-module="${escapeHtml(module.module_code)}" class="flex items-center gap-space-xs text-left font-headline-sm text-headline-sm font-semibold text-on-surface hover:text-primary">
              <span class="text-outline">${icon(collapsed ? "chevron_right" : "expand_more", "text-[16px]")}</span>
              <span class="rbac-tooltip min-w-0 truncate" tabindex="0" data-tooltip="${escapeHtml(`${module.module_code} · ${module.module_label || module.module_code}`)}" aria-label="${escapeHtml(`${module.module_code} · ${module.module_label || module.module_code}`)}">${escapeHtml(module.module_code)} · ${escapeHtml(module.module_label || module.module_code)}</span>
              <span class="rounded-full border border-outline-variant bg-surface-container-lowest px-1.5 py-0.5 font-label-sm text-label-sm text-on-surface-variant">${module.permissions.length}/${totalCount} quyền</span>
            </button>
          </td>
          ${state.roles
            .map((role) => {
              if (isLocked(role)) {
                return `<td class="border-b border-l border-outline-variant px-3 py-3 text-center"><span class="rbac-lock" data-tooltip="Toàn quyền hệ thống (không thể chỉnh sửa)">${icon("lock", "text-[14px]")}</span></td>`;
              }
              const selected = module.permissions.filter((permission) =>
                (state.draftMatrix[role.id] || []).includes(permission.id),
              ).length;
              const checked = selected === module.permissions.length && selected > 0;
              return `<td class="border-b border-l border-outline-variant px-3 py-3 text-center">
                <span class="rbac-group-check rbac-tooltip" data-tooltip="Chọn hoặc bỏ tất cả quyền đang hiển thị trong nhóm" aria-label="Chọn hoặc bỏ tất cả quyền đang hiển thị trong nhóm">
                  <input type="checkbox" class="rbac-check" data-group-module="${escapeHtml(module.module_code)}" data-role-id="${escapeHtml(role.id)}" ${checked ? "checked" : ""} />
                </span>
              </td>`;
            })
            .join("")}
        </tr>
      `;

      if (collapsed) return moduleHeader;

      const rows = module.permissions
        .map((permission) => {
          const cells = state.roles
            .map((role) => {
              if (isLocked(role)) {
                return `<td class="border-b border-l border-outline-variant/70 px-3 py-2 text-center"><span class="rbac-lock" data-tooltip="Toàn quyền hệ thống (không thể chỉnh sửa)">${icon("lock", "text-[14px]")}</span></td>`;
              }
              const checked = (state.draftMatrix[role.id] || []).includes(permission.id);
              const dirty = changes.changedCells.has(`${role.id}:${permission.id}`);
              return `<td class="border-b border-l border-outline-variant/70 px-3 py-2 text-center ${dirty ? "bg-[#fff4d6] ring-1 ring-inset ring-[#e0a800]" : ""}">
                <input type="checkbox" class="rbac-check" data-permission-id="${escapeHtml(permission.id)}" data-role-id="${escapeHtml(role.id)}" ${checked ? "checked" : ""} />
              </td>`;
            })
            .join("");

          const tone = ACTION_TONES[permission.action] || ACTION_TONES.VIEW;
          const actionLabel = ACTION_LABELS[permission.action] || permission.action || "—";
          const fullMeta = `${permission.id} · ${permission.permission_code} · ${actionLabel}`;
          return `<tr class="transition-colors hover:bg-surface-container-low/60">
            <td class="border-b border-outline-variant/70 px-4 py-2">
              <div class="rbac-tooltip truncate font-body-md text-body-md font-medium text-on-surface" tabindex="0" data-tooltip="${escapeHtml(permission.name)}" aria-label="${escapeHtml(permission.name)}">${escapeHtml(permission.name)}</div>
              <div class="rbac-tooltip mt-0.5 flex flex-wrap items-center gap-space-xs font-label-sm text-label-sm text-on-surface-variant" tabindex="0" data-tooltip="${escapeHtml(fullMeta)}" aria-label="${escapeHtml(fullMeta)}">
                <span>${escapeHtml(permission.id)}</span><span>·</span><span>${escapeHtml(permission.permission_code)}</span>
                <span class="rounded-full border px-1.5 py-0.5 ${tone}">${escapeHtml(actionLabel)}</span>
              </div>
            </td>
            ${cells}
          </tr>`;
        })
        .join("");

      return moduleHeader + rows;
    })
    .join("");

  body.querySelectorAll("input[data-group-module]").forEach((input) => {
    const moduleCode = input.dataset.groupModule;
    const roleId = input.dataset.roleId;
    const module = modules.find((item) => item.module_code === moduleCode);
    if (!module) return;
    const selected = module.permissions.filter((permission) =>
      (state.draftMatrix[roleId] || []).includes(permission.id),
    ).length;
    input.indeterminate = selected > 0 && selected < module.permissions.length;
  });
};

const renderMatrix = () => {
  hideTooltip();
  renderRoleChips();
  renderBulkActions();
  if (state.viewMode === "role") renderRolePanel();
  else renderTable();
};

const renderStats = () => {
  const changes = countChanges();
  const setValue = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  };
  setValue("rbacStatRoles", state.roles.length);
  setValue("rbacStatPermissions", allPermissions().length);
  setValue("rbacStatAssignments", Object.values(state.matrix).reduce((sum, ids) => sum + ids.length, 0));
  setValue("rbacStatChanges", changes.total);
};

const renderFloatingBar = () => {
  const bar = document.getElementById("rbacFloatingBar");
  if (!bar) return;
  const changes = countChanges();
  if (!changes.total) {
    bar.innerHTML = "";
    return;
  }

  const scopeText = changes.scopes ? ` · ${changes.scopes} phạm vi` : "";
  bar.innerHTML = `
    <div class="fixed bottom-5 left-1/2 z-[250] flex -translate-x-1/2 items-center gap-space-md rounded-xl border border-white/10 bg-inverse-surface px-4 py-3 shadow-xl">
      <span class="h-2 w-2 rounded-full bg-[#ffb020]"></span>
      <span class="font-label-md text-label-md text-inverse-on-surface">Đang thay đổi ${changes.permissions} quyền trên ${changes.roles} vai trò${scopeText}</span>
      <button type="button" data-action="undo" class="inline-flex items-center gap-space-xs rounded-lg border border-white/20 px-3 py-1.5 font-label-md text-label-md text-inverse-on-surface hover:bg-white/10">${icon("undo", "text-[16px]")} Hoàn tác</button>
      <button type="button" data-action="save" class="inline-flex items-center gap-space-xs rounded-lg bg-primary px-3 py-1.5 font-label-md text-label-md text-on-primary hover:bg-primary-container">${icon("save", "text-[16px]")} ${state.loading ? "Đang lưu..." : "Lưu phân quyền"}</button>
    </div>
  `;
};

const renderAll = () => {
  renderActionFilters();
  renderMatrix();
  renderStats();
  renderFloatingBar();
};

const refreshDraftUi = () => {
  renderMatrix();
  renderStats();
  renderFloatingBar();
};

const buildStateFromData = (data) => {
  state.roles = data.roles ||[];
  state.modules = data.modules || [];
  state.matrix = data.matrix || {};
  state.totals = data.totals || state.totals;

  state.originalMatrix = {};
  state.draftMatrix = {};
  state.originalScopes = {};
  state.draftScopes = {};

  state.roles.forEach((role) => {
    const ids = [...new Set(state.matrix[role.id] || role.permission_ids || [])];
    state.originalMatrix[role.id] = ids;
    state.draftMatrix[role.id] = [...ids];
    state.originalScopes[role.id] = role.data_scope;
    state.draftScopes[role.id] = role.data_scope;
  });

  if (!state.roles.some((role) => role.id === state.selectedRoleId)) {
    state.selectedRoleId = state.roles.find((role) => !isLocked(role))?.id || state.roles[0]?.id || null;
  }

  if (!state.collapsed.size && state.modules.length) {
    state.modules.forEach((module, index) => {
      if (index > 0) state.collapsed.add(module.module_code);
    });
  }
};

const loadData = async ({ silent = false } = {}) => {
  try {
    state.loading = true;
    const response = await api.get("/rbac/matrix");
    const data = unwrap(response);
    buildStateFromData(data);
    renderShell();
    renderAll();
    if (!silent) showToast("Đã tải ma trận phân quyền");
  } catch (error) {
    showToast(getErrorMessage(error), "error");
  } finally {
    state.loading = false;
    renderFloatingBar();
  }
};

const refreshSession = async () => {
  try {
    const response = await api.get("/auth/me");
    const user = response?.data?.user;
    if (user) {
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
      window.dispatchEvent(new CustomEvent("hrm:user-updated", { detail: user }));
    }
  } catch {
    showToast("Đã lưu phân quyền nhưng không thể làm mới phiên người dùng", "error");
  }
};

const saveChanges = async () => {
  const changes = countChanges();
  if (!changes.total || state.loading) return;

  state.loading = true;
  renderFloatingBar();

  try {
    const tasks = [];

    state.roles.forEach((role) => {
      if (isLocked(role)) return;
      const original = new Set(state.originalMatrix[role.id] || []);
      const draft = new Set(state.draftMatrix[role.id] || []);
      const permissionChanged = original.size !== draft.size || [...original].some((id) => !draft.has(id));
      if (permissionChanged) {
        tasks.push(
          api.put(`/rbac/roles/${encodeURIComponent(role.id)}/permissions`, {
            permission_ids: [...draft],
          }),
        );
      }

      if (state.originalScopes[role.id] !== state.draftScopes[role.id]) {
        tasks.push(
          api.patch(`/rbac/roles/${encodeURIComponent(role.id)}/scope`, {
            data_scope: state.draftScopes[role.id],
          }),
        );
      }
    });

    await Promise.all(tasks);
    await loadData({ silent: true });
    await refreshSession();
    showToast("Đã lưu phân quyền và làm mới phiên người dùng");
  } catch (error) {
    showToast(getErrorMessage(error), "error");
  } finally {
    state.loading = false;
    renderFloatingBar();
  }
};

const undoChanges = () => {
  state.roles.forEach((role) => {
    state.draftMatrix[role.id] = [...(state.originalMatrix[role.id] || [])];
    state.draftScopes[role.id] = state.originalScopes[role.id];
  });
  refreshDraftUi();
};

const handleClick = (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;

  if (action === "view-mode") {
    const nextMode = button.dataset.value;
    if (nextMode !== "role" && nextMode !== "matrix") return;
    state.viewMode = nextMode;
    renderShell();
    renderAll();
    return;
  }

  if (action === "select-role") {
    state.selectedRoleId = button.dataset.value || state.selectedRoleId;
    state.viewMode = "role";
    renderShell();
    renderAll();
    return;
  }

  if (action === "toggle-permission") {
    const roleId = button.dataset.roleId;
    const permissionId = button.dataset.permissionId;
    const role = state.roles.find((item) => item.id === roleId);
    if (!role || isLocked(role)) return;
    setPermission(roleId, permissionId, !(state.draftMatrix[roleId] || []).includes(permissionId));
    refreshDraftUi();
    return;
  }

  if (action === "toggle-module-permissions") {
    const roleId = button.dataset.roleId;
    const moduleCode = button.dataset.module;
    const role = state.roles.find((item) => item.id === roleId);
    const module = visibleModules().find((item) => item.module_code === moduleCode);
    if (!role || isLocked(role) || !module) return;
    const allSelected = module.permissions.every((permission) =>
      (state.draftMatrix[roleId] || []).includes(permission.id),
    );
    setModulePermissions(roleId, module.permissions, !allSelected);
    refreshDraftUi();
    return;
  }

  if (action === "select-visible" || action === "clear-visible") {
    const role = getSelectedRole();
    if (!role || isLocked(role)) return;
    const permissions = visibleModules().flatMap((module) => module.permissions);
    setModulePermissions(role.id, permissions, action === "select-visible");
    refreshDraftUi();
    return;
  }

  if (action === "filter-action") {
    state.actionFilter = button.dataset.value || "ALL";
    renderActionFilters();
    renderMatrix();
    return;
  }

  if (action === "toggle-module") {
    const moduleCode = button.dataset.module;
    if (state.viewMode === "role") {
      const wasCollapsed = state.collapsed.has(moduleCode);
      state.collapsed = new Set(state.modules.map((module) => module.module_code));
      if (wasCollapsed) state.collapsed.delete(moduleCode);
    } else if (state.collapsed.has(moduleCode)) {
      state.collapsed.delete(moduleCode);
    } else {
      state.collapsed.add(moduleCode);
    }
    renderMatrix();
    return;
  }

  if (action === "expand-all") {
    state.collapsed.clear();
    renderMatrix();
    return;
  }

  if (action === "collapse-all") {
    state.modules.forEach((module) => state.collapsed.add(module.module_code));
    renderMatrix();
    return;
  }

  if (action === "reload") {
    if (countChanges().total && !window.confirm("Có thay đổi chưa lưu. Tải lại sẽ bỏ các thay đổi này?")) return;
    loadData();
    return;
  }

  if (action === "undo") {
    undoChanges();
    return;
  }

  if (action === "save") {
    saveChanges();
  }
};

const handleChange = (event) => {
  const target = event.target;

  if (target.matches("[data-role-scope]")) {
    const roleId = target.dataset.roleScope;
    const role = state.roles.find((item) => item.id === roleId);
    if (!role || isLocked(role)) return;
    state.draftScopes[roleId] = target.value;
    refreshDraftUi();
    return;
  }

  if (target.matches("[data-group-module]")) {
    const roleId = target.dataset.roleId;
    const moduleCode = target.dataset.groupModule;
    const role = state.roles.find((item) => item.id === roleId);
    if (!role || isLocked(role)) return;

    const module = visibleModules().find((item) => item.module_code === moduleCode);
    if (!module) return;

    setModulePermissions(roleId, module.permissions, target.checked);
    refreshDraftUi();
    return;
  }

  if (target.matches("[data-permission-id]")) {
    const roleId = target.dataset.roleId;
    const permissionId = target.dataset.permissionId;
    const role = state.roles.find((item) => item.id === roleId);
    if (!role || isLocked(role)) return;

    setPermission(roleId, permissionId, target.checked);
    refreshDraftUi();
  }
};

const handleInput = (event) => {
  if (event.target.id === "rbacSearch") {
    state.search = event.target.value || "";
    renderMatrix();
    return;
  }

  if (event.target.id === "rbacModuleFilter") {
    state.moduleFilter = event.target.value || "ALL";
    renderMatrix();
  }
};

const setActiveNav = () => {
  document.querySelectorAll("aside nav a[data-path]").forEach((link) => {
    const active = link.getAttribute("data-path") === "phan-quyen";
    link.classList.toggle("bg-secondary-fixed", active);
    link.classList.toggle("text-on-secondary-fixed", active);
    link.classList.toggle("font-bold", active);
    link.classList.toggle("text-on-surface-variant", !active);
  });
};

export const initPermissions = (user) => {
  if (!user || !getUiAccess(user).canManageSystem) {
    window.location.hash = "";
    return;
  }

  renderShell();
  setActiveNav();
  loadData({ silent: true });
};
