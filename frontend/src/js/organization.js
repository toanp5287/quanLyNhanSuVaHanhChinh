import organizationHtml from "../pages/organization.html?raw";
import api from "../services/api.js";
import {
  getCurrentUser,
  hasPermission,
  logout,
} from "../services/auth.service.js";
import { setupShell } from "./home.js";

const TAB_META = {
  chart: {
    title: "Sơ đồ phòng ban",
    subtitle:
      "Cơ cấu tổ chức, thứ bậc phòng ban, định biên và mức sử dụng nhân sự thực tế.",
    route: "#/so-do-phong-ban",
  },
  departments: {
    title: "Phòng ban & Định biên",
    subtitle:
      "Danh mục phòng ban, phòng ban cấp trên và tỷ lệ nhân sự trên định biên tối đa.",
    route: "#/so-do-phong-ban/phong-ban",
  },
  positions: {
    title: "Chức vụ, JD & Khung lương",
    subtitle:
      "Danh mục chức vụ, ngạch bậc, mô tả công việc và khung lương định mức.",
    route: "#/so-do-phong-ban/chuc-vu",
  },
};

const SCOPE_LABELS = {
  ALL: "Toàn công ty",
  DEPARTMENT: "Phòng của tôi và các phòng trực thuộc",
  SELF: "Chỉ hồ sơ của tôi",
};

const GRADE_STYLES = {
  "C-LEVEL": "bg-purple-50 text-purple-700",
  M1: "bg-sky-50 text-sky-700",
  M2: "bg-indigo-50 text-indigo-700",
  S1: "bg-emerald-50 text-emerald-700",
  S2: "bg-teal-50 text-teal-700",
  S3: "bg-lime-50 text-lime-700",
};

const DEFAULT_GRADE_LEVELS = ["C-LEVEL", "M1", "M2", "S1", "S2", "S3"];

const state = {
  tab: "chart",
  keyword: "",
  departmentId: "",
  scope: "ALL",
  canManage: false,
  canViewSalary: false,
  leadership: [],
  summary: {
    departments: 0,
    positions: 0,
    active_employees: 0,
    headcount_limit: 0,
    utilization_percent: 0,
  },
  departments: [],
  expandedDepartments: new Set(),
  positions: [],
  options: { departments: [], grade_levels: [] },
  departmentFormMode: "create",
  editingDepartment: null,
  positionFormMode: "create",
  editingPosition: null,
  jdPosition: null,
  departmentDetail: null,
  detailRequestSeq: 0,
  requestSeq: 0,
  searchTimer: null,
};

let modalKeyHandler = null;

export const getOrganizationTabFromHash = (hash = window.location.hash) => {
  if (hash === TAB_META.departments.route) return "departments";
  if (hash === TAB_META.positions.route) return "positions";
  return "chart";
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatCurrency = (value) => {
  if (!state.canViewSalary) return "Không có quyền xem";
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${new Intl.NumberFormat("vi-VN").format(number)} ₫`;
};

const truncate = (value, length = 90) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length)}…` : text;
};

const showToast = (message) => {
  document.getElementById("hrmToast")?.remove();

  const toast = document.createElement("div");
  toast.id = "hrmToast";
  toast.className =
    "fixed bottom-5 right-5 z-[120] max-w-sm rounded-lg bg-inverse-surface text-inverse-on-surface shadow-lg px-4 py-3 font-body-sm text-body-sm";
  toast.textContent = message;
  document.body.appendChild(toast);

  window.setTimeout(() => toast.remove(), 2800);
};

const showNotice = (message) => {
  const notice = document.getElementById("organizationNotice");
  if (!notice) return;

  notice.className =
    "flex items-start gap-space-sm rounded-lg border border-error/40 bg-error-container text-on-error-container px-space-md py-space-sm font-body-sm text-body-sm";
  notice.innerHTML = `
    <span class="material-symbols-outlined text-[18px]">error</span>
    <span>${escapeHtml(message)}</span>
  `;
};

const hideNotice = () => {
  const notice = document.getElementById("organizationNotice");
  if (!notice) return;
  notice.className = "hidden";
  notice.innerHTML = "";
};

const setText = (selector, text) => {
  const element = document.querySelector(selector);
  if (element) element.textContent = text;
};

const ensureViewMounted = () => {
  if (!window.__HRM_SPA__) return;

  const main = document.querySelector("main");
  if (!main) return;

  const doc = new DOMParser().parseFromString(organizationHtml, "text/html");
  const view = doc.querySelector("main > div");
  const modals = [
    "modal-department-form",
    "modal-position-form",
    "modal-jd-detail",
    "modal-department-detail",
  ].map((id) => doc.getElementById(id));

  main.innerHTML = "";
  modals.forEach((modal) => {
    if (modal) document.getElementById(modal.id)?.remove();
  });

  if (view) main.appendChild(document.importNode(view, true));
  modals.forEach((modal) => {
    if (modal) document.body.appendChild(document.importNode(modal, true));
  });
};

const openModal = (id) => {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.classList.add("flex");
};

const closeModal = (id) => {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
};

const setFormError = (id, message) => {
  const errorBox = document.getElementById(id);
  if (!errorBox) return;

  if (!message) {
    errorBox.className =
      "hidden items-start gap-space-sm rounded-lg border border-error/40 bg-error-container text-on-error-container px-space-md py-space-sm font-body-sm text-body-sm";
    errorBox.innerHTML = "";
    return;
  }

  errorBox.className =
    "flex items-start gap-space-sm rounded-lg border border-error/40 bg-error-container text-on-error-container px-space-md py-space-sm font-body-sm text-body-sm";
  errorBox.innerHTML = `
    <span class="material-symbols-outlined text-[18px]">error</span>
    <span>${escapeHtml(message)}</span>
  `;
};

const applyTabHeader = () => {
  const meta = TAB_META[state.tab] || TAB_META.chart;

  setText("#organizationTitle", meta.title);
  setText("#organizationSubtitle", meta.subtitle);

  document.querySelectorAll("[data-org-tab]").forEach((button) => {
    const isActive = button.getAttribute("data-org-tab") === state.tab;
    button.classList.toggle("border-primary-container", isActive);
    button.classList.toggle("border-transparent", !isActive);
    button.classList.toggle("text-primary", isActive);
    button.classList.toggle("text-on-surface-variant", !isActive);
    button.classList.toggle("font-semibold", isActive);
  });

  const chartSection = document.getElementById("orgChartSection");
  const departmentsSection = document.getElementById("orgDepartmentsSection");
  const positionsSection = document.getElementById("orgPositionsSection");

  chartSection?.classList.toggle("hidden", state.tab !== "chart");
  departmentsSection?.classList.toggle("hidden", state.tab !== "departments");
  positionsSection?.classList.toggle("hidden", state.tab !== "positions");

  const createDepartment = document.getElementById("btnCreateDepartment");
  const createPosition = document.getElementById("btnCreatePosition");

  if (createDepartment) {
    createDepartment.hidden = !state.canManage || state.tab === "positions";
  }

  if (createPosition) {
    createPosition.hidden = !state.canManage || state.tab !== "positions";
  }
};

const renderHeaderBadges = (user) => {
  setText(
    "#organizationTotalBadge",
    `${state.summary.departments} phòng ban • ${state.summary.positions} chức vụ`,
  );
  setText(
    "#organizationScopeBadge",
    `Phạm vi: ${SCOPE_LABELS[state.scope] || "—"}`,
  );
  setText("#organizationRoleBadge", user.role_name || user.role_id || "—");
};

const renderSummary = () => {
  setText("#orgCountDepartments", String(state.summary.departments));
  setText("#orgCountPositions", String(state.summary.positions));
  setText("#orgCountEmployees", String(state.summary.active_employees));
  setText("#orgUtilization", `${state.summary.utilization_percent}%`);

  setText(
    "#orgUtilizationHint",
    state.summary.headcount_limit > 0
      ? `${state.summary.active_employees} / ${state.summary.headcount_limit} định biên`
      : "Chưa đặt định biên tối đa",
  );

  setText("#countTabChart", String(state.summary.departments));
  setText("#countTabDepartments", String(state.summary.departments));
  setText("#countTabPositions", String(state.summary.positions));
};

const getDepartmentMap = () =>
  new Map(state.departments.map((department) => [department.id, department]));

const compareDepartments = (a, b) => (a.order_index ?? a.id) - (b.order_index ?? b.id);
const comparePositions = (a, b) => {
  const departments = getDepartmentMap();
  return compareDepartments(departments.get(a.department_id) || { id: 0 }, departments.get(b.department_id) || { id: 0 })
    || DEFAULT_GRADE_LEVELS.indexOf(a.grade_level) - DEFAULT_GRADE_LEVELS.indexOf(b.grade_level) || a.id - b.id;
};

const getDescendantIds = (departmentId) => {
  const descendants = new Set();
  let changed = true;

  while (changed) {
    changed = false;

    state.departments.forEach((department) => {
      if (
        department.parent_id !== null &&
        (department.parent_id === departmentId ||
          descendants.has(department.parent_id)) &&
        !descendants.has(department.id)
      ) {
        descendants.add(department.id);
        changed = true;
      }
    });
  }

  return descendants;
};

const getScopedDepartments = () => {
  if (!state.departmentId) return [...state.departments];

  const departmentId = Number(state.departmentId);
  const ids = new Set([departmentId, ...getDescendantIds(departmentId)]);

  return state.departments.filter((department) => ids.has(department.id));
};

const getFilteredDepartments = () => {
  const scoped = getScopedDepartments();
  if (!state.keyword) return scoped;

  const keyword = state.keyword.toLowerCase();
  const scopedMap = new Map(scoped.map((department) => [department.id, department]));
  const matched = new Set();

  scoped.forEach((department) => {
    const text = `${department.department_code} ${department.name}`.toLowerCase();
    if (text.includes(keyword)) matched.add(department.id);
  });

  state.positions.forEach((position) => {
    if (!scopedMap.has(position.department_id)) return;

    const text =
      `${position.position_code} ${position.title} ${position.job_description} ${position.job_requirements}`.toLowerCase();
    if (text.includes(keyword)) matched.add(position.department_id);
  });

  let changed = true;
  while (changed) {
    changed = false;

    scoped.forEach((department) => {
      if (
        matched.has(department.id) &&
        department.parent_id !== null &&
        scopedMap.has(department.parent_id) &&
        !matched.has(department.parent_id)
      ) {
        matched.add(department.parent_id);
        changed = true;
      }
    });
  }

  return scoped.filter((department) => matched.has(department.id));
};

const getFilteredPositions = () => {
  const scoped = getScopedDepartments();
  const scopedIds = new Set(scoped.map((department) => department.id));
  const scopedMap = new Map(scoped.map((department) => [department.id, department]));
  const keyword = state.keyword.toLowerCase();

  return state.positions.filter((position) => {
    if (!scopedIds.has(position.department_id)) return false;
    if (!keyword) return true;

    const department = scopedMap.get(position.department_id);
    const text =
      `${position.position_code} ${position.title} ${department?.department_code || ""} ${department?.name || ""} ${position.job_description} ${position.job_requirements}`.toLowerCase();

    return text.includes(keyword);
  });
};

const getHeadcountProgress = (department) => {
  const active = Number(department.active_count || 0);
  const limit = Number(department.headcount_limit || 0);

  if (limit <= 0) {
    return {
      ratio: 0,
      width: 0,
      bar: "bg-outline-variant",
      text: "text-on-surface-variant",
      label: `${active} / chưa đặt`,
    };
  }

  const ratio = active / limit;
  const width = Math.min(100, Math.round(ratio * 100));

  if (ratio > 1) {
    return {
      ratio,
      width,
      bar: "bg-red-500",
      text: "text-red-600",
      label: `${active} / ${limit}`,
    };
  }

  if (ratio >= 0.9) {
    return {
      ratio,
      width,
      bar: "bg-amber-500",
      text: "text-amber-600",
      label: `${active} / ${limit}`,
    };
  }

  return {
    ratio,
    width,
    bar: "bg-emerald-500",
    text: "text-emerald-700",
    label: `${active} / ${limit}`,
  };
};

const progressHtml = (department, compact = false) => {
  const progress = getHeadcountProgress(department);

  return `
    <div class="flex items-center gap-2 ${compact ? "min-w-[140px]" : "w-full"}">
      <div class="flex-1 h-2 rounded-full bg-surface-container-high overflow-hidden">
        <div class="h-full rounded-full ${progress.bar}" style="width: ${progress.width}%"></div>
      </div>
      <span class="font-label-sm text-label-sm ${progress.text} whitespace-nowrap">${progress.label}</span>
    </div>
  `;
};

const renderDepartmentOptions = () => {
  const filter = document.getElementById("filterOrgDepartment");
  if (filter) {
    const current = state.departmentId;
    filter.innerHTML =
      '<option value="">Phòng ban: Tất cả</option>' +
      state.options.departments
        .map(
          (department) =>
             `<option value="${escapeHtml(department.id)}">${"— ".repeat(department.depth || 0)}${escapeHtml(department.department_code)} - ${escapeHtml(department.name)}</option>`,
        )
        .join("");

    if ([...filter.options].some((option) => option.value === current)) {
      filter.value = current;
    } else {
      state.departmentId = "";
      filter.value = "";
    }
  }

  renderDepartmentParentOptions();
  renderPositionDepartmentOptions();
};

const renderDepartmentParentOptions = () => {
  const select = document.getElementById("departmentParent");
  if (!select) return;

  const current = select.value;
  const excluded = new Set();

  if (
    state.departmentFormMode === "edit" &&
    state.editingDepartment
  ) {
    excluded.add(state.editingDepartment.id);
    getDescendantIds(state.editingDepartment.id).forEach((id) =>
      excluded.add(id),
    );
  }

  const options = state.options.departments.filter(
    (department) => !excluded.has(department.id),
  );

  const lockedParent = state.departmentFormMode === "edit" && state.editingDepartment?.can_reparent === false;
  select.disabled = lockedParent;
  select.innerHTML =
    (state.scope === "ALL" ? '<option value="">Không có cấp trên (cấp gốc)</option>' : '<option value="">Chọn phòng ban cấp trên</option>') +
    (lockedParent && state.editingDepartment.parent_id && !options.some(item => item.id === state.editingDepartment.parent_id)
      ? `<option value="${escapeHtml(state.editingDepartment.parent_id)}">${escapeHtml(state.editingDepartment.parent_name || "Phòng ban cấp trên")}</option>` : "") +
    options
      .map(
        (department) =>
          `<option value="${escapeHtml(department.id)}">${escapeHtml(department.department_code)} - ${escapeHtml(department.name)}</option>`,
      )
      .join("");

  if ([...select.options].some((option) => option.value === current)) {
    select.value = current;
  }
};

const renderPositionDepartmentOptions = () => {
  const select = document.getElementById("positionDepartment");
  if (!select) return;

  const current = select.value;
  select.innerHTML =
    '<option value="">Chọn phòng ban</option>' +
    state.options.departments
      .map(
        (department) =>
          `<option value="${escapeHtml(department.id)}">${escapeHtml(department.department_code)} - ${escapeHtml(department.name)}</option>`,
      )
      .join("");

  if ([...select.options].some((option) => option.value === current)) {
    select.value = current;
  }
};

const renderGradeOptions = () => {
  const select = document.getElementById("positionGrade");
  if (!select) return;

  const current = select.value;
  const grades =
    state.options.grade_levels?.length > 0
      ? state.options.grade_levels
      : DEFAULT_GRADE_LEVELS;

  select.innerHTML =
    '<option value="">Chọn ngạch bậc</option>' +
    grades
      .map((grade) => `<option value="${escapeHtml(grade)}">${escapeHtml(grade)}</option>`)
      .join("");

  if ([...select.options].some((option) => option.value === current)) {
    select.value = current;
  }
};

const renderChips = () => {
  const container = document.getElementById("orgChips");
  if (!container) return;

  const chips = [];
  const clearButton = (key, label) => `
    <button type="button" class="inline-flex items-center gap-1 rounded-full bg-primary-fixed px-2 py-0.5 text-on-primary-fixed hover:opacity-80 transition-opacity" data-clear-org-filter="${key}">
      <span>${escapeHtml(label)}</span>
      <span class="material-symbols-outlined text-[14px]">close</span>
    </button>
  `;

  if (state.keyword) {
    chips.push(clearButton("keyword", `Từ khóa: ${state.keyword}`));
  }

  if (state.departmentId) {
    const department = state.options.departments.find(
      (item) => String(item.id) === String(state.departmentId),
    );
    chips.push(
      clearButton(
        "department",
        `Phòng ban: ${department?.name || state.departmentId}`,
      ),
    );
  }

  container.innerHTML = `<span class="text-on-surface-variant">Đang lọc theo:</span>${
    chips.length
      ? chips.join("")
      : '<span class="text-on-surface-variant italic">Chưa có bộ lọc bổ sung</span>'
  }`;
};

const renderChart = () => {
  const container = document.getElementById("orgChart");
  if (!container) return;

  const departments = getFilteredDepartments();

  if (!departments.length) {
    container.innerHTML = `
      <div class="rounded-lg border border-dashed border-surface-variant p-space-lg text-center text-on-surface-variant">
        <span class="material-symbols-outlined text-[34px] text-outline">account_tree</span>
        <p class="mt-1">Không có phòng ban phù hợp với bộ lọc hiện tại.</p>
      </div>
    `;
    return;
  }

  const map = new Map(departments.map((department) => [department.id, department]));
  const childrenMap = new Map();
  const roots = [];

  departments
    .slice()
    .sort(compareDepartments)
    .forEach((department) => {
      if (department.parent_id && map.has(department.parent_id)) {
        if (!childrenMap.has(department.parent_id)) {
          childrenMap.set(department.parent_id, []);
        }
        childrenMap.get(department.parent_id).push(department);
      } else {
        roots.push(department);
      }
    });

  const renderNode = (department, depth = 0) => {
    if (depth > 12) return "";

    const children = childrenMap.get(department.id) || [];
    const canCollapse = children.length > 0;
    const expanded = !canCollapse || state.expandedDepartments.has(String(department.id));
    const progress = getHeadcountProgress(department);
    const editButton = state.canManage && department.can_manage
      ? `<button type="button" class="w-8 h-8 rounded hover:bg-surface-container-high text-primary flex items-center justify-center" data-edit-department="${escapeHtml(department.id)}" title="Sửa phòng ban">
          <span class="material-symbols-outlined text-[18px]">edit</span>
        </button>`
      : "";

    return `
      <div class="relative">
        <div
          class="group/card cursor-pointer rounded-lg border border-surface-variant bg-surface-container-lowest shadow-sm p-space-md hover:border-primary-container hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-all"
          data-view-department="${escapeHtml(department.id)}"
          role="button"
          tabindex="0"
          aria-label="Xem chi tiết ${escapeHtml(department.name)}"
          title="Nhấn để xem thành viên và chức vụ"
        >
          <div class="flex items-start justify-between gap-space-sm">
            <div class="min-w-0">
               <span class="inline-flex items-center rounded bg-primary-fixed px-2 py-0.5 font-label-sm text-label-sm text-on-primary-fixed font-semibold">Cấp ${(department.depth || 0) + 1} · ${escapeHtml(department.department_code)}</span>
              <h3 class="mt-1 font-headline-sm text-headline-sm font-bold text-on-surface truncate group-hover/card:text-primary transition-colors">${escapeHtml(department.name)}</h3>
            </div>
            ${editButton}
          </div>
          <div class="mt-3 flex flex-col gap-1.5">
            <p class="font-label-md text-label-md font-semibold text-on-surface">${escapeHtml(department.manager?.full_name || "Chưa phân công người đứng đầu")}</p>
            <p class="font-label-sm text-label-sm text-on-surface-variant">${escapeHtml(department.manager?.position_title || "Người phụ trách phòng ban")}</p>
            <p class="font-label-sm text-label-sm text-on-surface-variant">${department.parent_name ? `Trực thuộc: ${escapeHtml(department.parent_name)}` : "Phòng ban cấp gốc"}</p>
            <span class="font-label-sm text-label-sm text-primary">${department.can_manage ? "Được quản lý trong phạm vi phụ trách" : "Chỉ xem cơ cấu và thành viên"}</span>
            ${progressHtml(department)}
            <div class="flex items-center justify-between gap-space-sm font-label-sm text-label-sm text-on-surface-variant">
              <span class="inline-flex items-center gap-1">
                <span class="material-symbols-outlined text-[15px]">badge</span>
                ${department.position_count} chức vụ
              </span>
              <span class="inline-flex items-center gap-1 ${progress.text}">
                <span class="material-symbols-outlined text-[15px]">groups</span>
                ${department.active_count} nhân sự
              </span>
            </div>
          </div>
          <div class="mt-2 pt-2 border-t border-surface-container-high flex items-center justify-between font-label-sm text-label-sm text-primary">
            <span>Xem thành viên &amp; chức vụ</span>
            <span class="material-symbols-outlined text-[17px] group-hover/card:translate-x-0.5 transition-transform">chevron_right</span>
          </div>
        </div>
        ${
          children.length
            ? `${canCollapse ? `<button type="button"
                id="org-toggle-${escapeHtml(department.id)}"
                class="mt-2 inline-flex items-center gap-1 rounded px-3 py-2 text-primary hover:bg-surface-container-high font-label-sm text-label-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                data-toggle-department="${escapeHtml(department.id)}"
                aria-expanded="${expanded}"
                aria-controls="org-children-${escapeHtml(department.id)}">
                <span class="material-symbols-outlined text-[20px]" aria-hidden="true">${expanded ? "expand_less" : "expand_more"}</span>
                ${expanded ? "Thu gọn" : "Hiện"} ${children.length} phòng ban trực thuộc
              </button>` : ""}
              <div id="org-children-${escapeHtml(department.id)}" class="${expanded ? "grid" : "hidden"} ml-5 mt-2 pl-4 border-l-2 border-surface-variant grid-cols-1 xl:grid-cols-3 gap-3">
                ${expanded ? children.map((child) => renderNode(child, depth + 1)).join("") : ""}
              </div>`
            : ""
        }
      </div>
    `;
  };

  container.innerHTML = `
    <div class="overflow-x-auto pb-2">
      <div class="min-w-[300px] space-y-3">
        <div class="rounded-lg border border-primary-container bg-primary-fixed p-space-md">
          <p class="font-label-md text-label-md font-bold text-on-primary-fixed">${state.scope === "ALL" ? "Ban giám đốc" : "Phạm vi phụ trách"}</p>
          ${state.leadership.map(leader => `<p class="mt-1 text-body-sm">${escapeHtml(leader.full_name)} · ${escapeHtml(leader.position_title || "Ban giám đốc")}</p>`).join("")}
          <p class="mt-1 text-body-sm">${state.scope === "ALL" ? "Ban giám đốc → Phòng quản lý → Bộ phận trực thuộc → Nhân viên" : "Hiển thị phòng được giao và các phòng trực thuộc theo tuyến quản lý"}</p>
        </div>
        ${roots.map((department) => renderNode(department)).join("")}
      </div>
    </div>
  `;
};

const renderDepartmentsTable = () => {
  const tbody = document.getElementById("orgDepartmentsBody");
  if (!tbody) return;

  const departments = getFilteredDepartments().slice().sort(compareDepartments);

  if (!departments.length) {
    tbody.innerHTML = `
      <tr>
        <td class="px-3 py-10 text-center text-on-surface-variant" colspan="6">
          Không có phòng ban phù hợp với bộ lọc hiện tại.
        </td>
      </tr>
    `;
  } else {
    const map = getDepartmentMap();

    tbody.innerHTML = departments
      .map((department) => {
        const parent = department.parent_id
          ? map.get(department.parent_id)
          : null;
        const progress = getHeadcountProgress(department);
        const editButton = state.canManage
          ? `<button type="button" class="w-8 h-8 rounded hover:bg-surface-container-high text-primary inline-flex items-center justify-center" data-edit-department="${escapeHtml(department.id)}" title="Sửa phòng ban">
              <span class="material-symbols-outlined text-[18px]">edit</span>
            </button>`
          : "";

        return `
          <tr class="cursor-pointer hover:bg-surface-container-low/60 transition-colors" data-view-department="${escapeHtml(department.id)}" title="Nhấn để xem chi tiết phòng ban">
            <td class="px-3 py-3">
              <span class="font-label-md text-label-md font-semibold text-primary">${escapeHtml(department.department_code)}</span>
            </td>
            <td class="px-3 py-3 font-medium text-on-surface"><div style="padding-left:${Math.min(department.depth || 0, 8) * 16}px">${department.depth ? "↳ " : ""}${escapeHtml(department.name)}<p class="font-label-sm text-label-sm text-on-surface-variant">Cấp ${(department.depth || 0) + 1} · ${escapeHtml(department.manager?.full_name || "Chưa có người đứng đầu")}</p></div></td>
            <td class="px-3 py-3 text-on-surface-variant">${parent ? `${escapeHtml(parent.department_code)} - ${escapeHtml(parent.name)}` : "Cấp gốc"}</td>
            <td class="px-3 py-3">
              ${progressHtml(department, true)}
              <span class="font-label-sm text-label-sm ${progress.text}">${department.headcount_limit > 0 ? `${Math.round(progress.ratio * 100)}% định biên` : "Chưa đặt định biên"}</span>
            </td>
            <td class="px-3 py-3 text-center">${department.position_count}</td>
            <td class="px-3 py-3">
              <div class="flex items-center justify-center gap-1">
                <button type="button" class="w-8 h-8 rounded hover:bg-surface-container-high text-primary inline-flex items-center justify-center" data-view-department="${escapeHtml(department.id)}" title="Xem thành viên và chức vụ">
                  <span class="material-symbols-outlined text-[18px]">visibility</span>
                </button>
                ${editButton}
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  setText(
    "#orgDepartmentsResultInfo",
    `Hiển thị ${departments.length} / ${state.departments.length} phòng ban trong phạm vi`,
  );
};

const renderPositionsTable = () => {
  const tbody = document.getElementById("orgPositionsBody");
  if (!tbody) return;

  const positions = getFilteredPositions().slice().sort(comparePositions);

  if (!positions.length) {
    tbody.innerHTML = `
      <tr>
        <td class="px-3 py-10 text-center text-on-surface-variant" colspan="8">
          Không có chức vụ phù hợp với bộ lọc hiện tại.
        </td>
      </tr>
    `;
  } else {
    tbody.innerHTML = positions
      .map((position) => {
        const gradeStyle =
          GRADE_STYLES[position.grade_level] ||
          "bg-surface-container-high text-on-surface-variant";
        const viewButton = `<button type="button" class="w-8 h-8 rounded hover:bg-surface-container-high text-primary inline-flex items-center justify-center" data-view-jd="${escapeHtml(position.id)}" title="Xem JD">
            <span class="material-symbols-outlined text-[18px]">visibility</span>
          </button>`;
        const editButton = state.canManage
          ? `<button type="button" class="w-8 h-8 rounded hover:bg-surface-container-high text-primary inline-flex items-center justify-center" data-edit-position="${escapeHtml(position.id)}" title="Sửa chức vụ & JD">
              <span class="material-symbols-outlined text-[18px]">edit</span>
            </button>`
          : "";

        return `
          <tr class="hover:bg-surface-container-low/60 transition-colors">
            <td class="px-3 py-3">
              <span class="font-label-md text-label-md font-semibold text-primary">${escapeHtml(position.position_code)}</span>
            </td>
            <td class="px-3 py-3 font-medium text-on-surface">${escapeHtml(position.title)}</td>
            <td class="px-3 py-3 text-on-surface-variant">${escapeHtml(position.department_name || "—")}</td>
            <td class="px-3 py-3 text-center">
              <span class="inline-flex rounded-full px-2 py-0.5 font-label-sm text-label-sm ${gradeStyle}">${escapeHtml(position.grade_level)}</span>
            </td>
            <td class="px-3 py-3 whitespace-nowrap">${formatCurrency(position.min_salary)} - ${formatCurrency(position.max_salary)}</td>
            <td class="px-3 py-3 text-right whitespace-nowrap">${formatCurrency(position.position_allowance)}</td>
            <td class="px-3 py-3 text-on-surface-variant max-w-[320px]">
              <span title="${escapeHtml(position.job_description)}">${escapeHtml(truncate(position.job_description))}</span>
            </td>
            <td class="px-3 py-3">
              <div class="flex items-center justify-center gap-1">
                ${viewButton}
                ${editButton}
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  setText(
    "#orgPositionsResultInfo",
    `Hiển thị ${positions.length} / ${state.positions.length} chức vụ trong phạm vi`,
  );
};

const renderAll = (user) => {
  renderHeaderBadges(user);
  renderSummary();
  renderDepartmentOptions();
  renderGradeOptions();
  renderChips();
  renderChart();
  renderDepartmentsTable();
  renderPositionsTable();
  applyTabHeader();
};

const loadOrganization = async (user) => {
  const sequence = ++state.requestSeq;
  hideNotice();

  try {
    const response = await api.get("/organization");
    if (sequence !== state.requestSeq) return;

    const payload = response.data || {};

    state.departments = Array.isArray(payload.departments)
      ? payload.departments
      : [];
    state.positions = Array.isArray(payload.positions) ? payload.positions : [];
    state.summary = payload.summary || state.summary;
    state.options = payload.options || state.options;
    state.scope = payload.data_scope || "ALL";
    state.canViewSalary = Boolean(payload.can_view_salary);
    state.leadership = payload.leadership || [];
    state.expandedDepartments = new Set(state.departments.map(department => String(department.id)));
    state.canManage =
      Boolean(payload.can_manage) &&
      hasPermission("HR.PROFILE_MANAGE", user);

    renderAll(user);

    setText(
      "#orgUpdatedAt",
      `Cập nhật lúc ${new Date().toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      })}`,
    );
  } catch (error) {
    if (sequence !== state.requestSeq) return;

    const message =
      error.response?.data?.message ||
      "Không thể tải cơ cấu tổ chức. Vui lòng thử lại.";

    showNotice(message);
    const chart = document.getElementById("orgChart");
    if (chart) {
      chart.innerHTML = `<p class="text-error">${escapeHtml(message)}</p>`;
    }
    setText("#orgUpdatedAt", "Không thể tải dữ liệu");
  }
};

const setTab = (user, tab) => {
  if (!TAB_META[tab]) return;

  state.tab = tab;

  const route = TAB_META[tab].route;
  if (window.location.hash !== route) {
    window.history.replaceState(null, "", route);
  }

  applyTabHeader();
  renderAll(user);
};

const resetFilters = (user) => {
  state.keyword = "";
  state.departmentId = "";

  const search = document.getElementById("orgSearch");
  const department = document.getElementById("filterOrgDepartment");

  if (search) search.value = "";
  if (department) department.value = "";

  renderAll(user);
};

const clearFilter = (user, key) => {
  if (key === "all") {
    resetFilters(user);
    return;
  }

  if (key === "keyword") {
    state.keyword = "";
    const input = document.getElementById("orgSearch");
    if (input) input.value = "";
  }

  if (key === "department") {
    state.departmentId = "";
    const select = document.getElementById("filterOrgDepartment");
    if (select) select.value = "";
  }

  renderAll(user);
};

const resetDepartmentForm = () => {
  const fields = [
    "departmentCode",
    "departmentName",
    "departmentParent",
    "departmentHeadcount",
  ];

  fields.forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.value = "";
  });

  setFormError("departmentFormError", "");
};

const openCreateDepartment = () => {
  if (!state.canManage) return;
  state.departmentFormMode = "create";
  state.editingDepartment = null;

  resetDepartmentForm();
  renderDepartmentParentOptions();

  const headcount = document.getElementById("departmentHeadcount");
  if (headcount) headcount.value = "0";

  setText("#departmentFormTitle", "Thêm phòng ban");
  openModal("modal-department-form");
};

const openEditDepartment = (departmentId) => {
  const department = state.departments.find(
    (item) => String(item.id) === String(departmentId),
  );
  if (!department || !state.canManage || !department.can_manage) return;

  state.departmentFormMode = "edit";
  state.editingDepartment = department;

  resetDepartmentForm();

  const code = document.getElementById("departmentCode");
  const name = document.getElementById("departmentName");
  const parent = document.getElementById("departmentParent");
  const headcount = document.getElementById("departmentHeadcount");

  if (code) code.value = department.department_code;
  if (name) name.value = department.name;
  if (headcount) headcount.value = String(department.headcount_limit);

  renderDepartmentParentOptions();
  if (parent) parent.value = department.parent_id ? String(department.parent_id) : "";

  setText("#departmentFormTitle", "Sửa phòng ban");
  openModal("modal-department-form");
};

const submitDepartmentForm = async (event, user) => {
  event.preventDefault();

  const button = document.getElementById("departmentFormSubmit");
  const originalHtml = button?.innerHTML || "";
  const departmentCode = document
    .getElementById("departmentCode")
    ?.value.trim();
  const name = document.getElementById("departmentName")?.value.trim();
  const parentId = document.getElementById("departmentParent")?.value;
  const headcountValue = document.getElementById("departmentHeadcount")?.value;

  if (!departmentCode) {
    return setFormError("departmentFormError", "Mã phòng ban không được để trống.");
  }

  if (!name) {
    return setFormError("departmentFormError", "Tên phòng ban không được để trống.");
  }

  const payload = {
    department_code: departmentCode,
    name,
    parent_id: parentId ? Number(parentId) : null,
    headcount_limit: headcountValue === "" ? 0 : Number(headcountValue),
  };

  try {
    setFormError("departmentFormError", "");

    if (button) {
      button.disabled = true;
      button.innerHTML =
        '<span class="w-4 h-4 rounded-full border-2 border-on-primary border-t-transparent animate-spin"></span><span>Đang lưu...</span>';
    }

    if (state.departmentFormMode === "edit") {
      await api.put(`/organization/departments/${state.editingDepartment.id}`, payload);
    } else {
      await api.post("/organization/departments", payload);
    }

    closeModal("modal-department-form");
    showToast(
      state.departmentFormMode === "edit"
        ? "Đã cập nhật phòng ban"
        : "Đã thêm phòng ban thành công",
    );
    await loadOrganization(user);
  } catch (error) {
    setFormError(
      "departmentFormError",
      error.response?.data?.message ||
        "Không thể lưu phòng ban. Vui lòng kiểm tra lại dữ liệu.",
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }
};

const resetPositionForm = () => {
  const fields = [
    "positionDepartment",
    "positionCode",
    "positionTitle",
    "positionGrade",
    "positionAllowance",
    "positionMinSalary",
    "positionMaxSalary",
    "positionDescription",
    "positionRequirements",
  ];

  fields.forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.value = "";
  });

  setFormError("positionFormError", "");
};

const openCreatePosition = () => {
  state.positionFormMode = "create";
  state.editingPosition = null;

  resetPositionForm();
  renderPositionDepartmentOptions();
  renderGradeOptions();

  const department = document.getElementById("positionDepartment");
  if (department && state.departmentId) {
    department.value = state.departmentId;
  }

  setText("#positionFormTitle", "Thêm chức vụ & JD");
  openModal("modal-position-form");
};

const openEditPosition = (positionId) => {
  const position = state.positions.find(
    (item) => String(item.id) === String(positionId),
  );
  if (!position) return;

  state.positionFormMode = "edit";
  state.editingPosition = position;

  resetPositionForm();
  renderPositionDepartmentOptions();
  renderGradeOptions();

  const department = document.getElementById("positionDepartment");
  const code = document.getElementById("positionCode");
  const title = document.getElementById("positionTitle");
  const grade = document.getElementById("positionGrade");
  const allowance = document.getElementById("positionAllowance");
  const minSalary = document.getElementById("positionMinSalary");
  const maxSalary = document.getElementById("positionMaxSalary");
  const description = document.getElementById("positionDescription");
  const requirements = document.getElementById("positionRequirements");

  if (department) department.value = String(position.department_id);
  if (code) code.value = position.position_code;
  if (title) title.value = position.title;
  if (grade) grade.value = position.grade_level;
  if (allowance) allowance.value = String(position.position_allowance ?? 0);
  if (minSalary) minSalary.value = String(position.min_salary ?? 0);
  if (maxSalary) maxSalary.value = String(position.max_salary ?? 0);
  if (description) description.value = position.job_description || "";
  if (requirements) requirements.value = position.job_requirements || "";

  setText("#positionFormTitle", "Sửa chức vụ & JD");
  openModal("modal-position-form");
};

const submitPositionForm = async (event, user) => {
  event.preventDefault();

  const button = document.getElementById("positionFormSubmit");
  const originalHtml = button?.innerHTML || "";
  const departmentId = document.getElementById("positionDepartment")?.value;
  const positionCode = document.getElementById("positionCode")?.value.trim();
  const title = document.getElementById("positionTitle")?.value.trim();
  const gradeLevel = document.getElementById("positionGrade")?.value;
  const allowance = document.getElementById("positionAllowance")?.value;
  const minSalary = document.getElementById("positionMinSalary")?.value;
  const maxSalary = document.getElementById("positionMaxSalary")?.value;
  const description = document
    .getElementById("positionDescription")
    ?.value.trim();
  const requirements = document
    .getElementById("positionRequirements")
    ?.value.trim();

  if (!departmentId) {
    return setFormError("positionFormError", "Vui lòng chọn phòng ban.");
  }
  if (!positionCode) {
    return setFormError("positionFormError", "Mã chức vụ không được để trống.");
  }
  if (!title) {
    return setFormError("positionFormError", "Tên chức vụ không được để trống.");
  }
  if (!gradeLevel) {
    return setFormError("positionFormError", "Vui lòng chọn ngạch bậc.");
  }
  if (minSalary === "" || maxSalary === "") {
    return setFormError("positionFormError", "Vui lòng nhập khung lương.");
  }
  if (Number(maxSalary) < Number(minSalary)) {
    return setFormError(
      "positionFormError",
      "Lương tối đa phải lớn hơn hoặc bằng lương tối thiểu.",
    );
  }
  if (!description) {
    return setFormError(
      "positionFormError",
      "Mô tả công việc không được để trống.",
    );
  }
  if (!requirements) {
    return setFormError(
      "positionFormError",
      "Yêu cầu năng lực không được để trống.",
    );
  }

  const payload = {
    department_id: Number(departmentId),
    position_code: positionCode,
    title,
    grade_level: gradeLevel,
    position_allowance: allowance === "" ? 0 : Number(allowance),
    min_salary: Number(minSalary),
    max_salary: Number(maxSalary),
    job_description: description,
    job_requirements: requirements,
  };

  try {
    setFormError("positionFormError", "");

    if (button) {
      button.disabled = true;
      button.innerHTML =
        '<span class="w-4 h-4 rounded-full border-2 border-on-primary border-t-transparent animate-spin"></span><span>Đang lưu...</span>';
    }

    if (state.positionFormMode === "edit") {
      await api.put(`/organization/positions/${state.editingPosition.id}`, payload);
    } else {
      await api.post("/organization/positions", payload);
    }

    closeModal("modal-position-form");
    showToast(
      state.positionFormMode === "edit"
        ? "Đã cập nhật chức vụ & JD"
        : "Đã thêm chức vụ & JD thành công",
    );
    await loadOrganization(user);
  } catch (error) {
    setFormError(
      "positionFormError",
      error.response?.data?.message ||
        "Không thể lưu chức vụ. Vui lòng kiểm tra lại dữ liệu.",
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }
};

const openJdDetail = (positionId) => {
  const position = state.positions.find(
    (item) => String(item.id) === String(positionId),
  );
  if (!position) return;

  state.jdPosition = position;

  setText("#jdDetailTitle", `${position.position_code} - ${position.title}`);
  setText(
    "#jdDetailSubtitle",
    `${position.department_name || "—"} • Ngạch ${position.grade_level}`,
  );

  const body = document.getElementById("jdDetailBody");
  if (body) {
    body.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-space-sm mb-space-md">
        <div class="rounded-lg bg-surface-container-low p-space-sm">
          <span class="block font-label-sm text-label-sm text-on-surface-variant uppercase">Khung lương</span>
          <span class="font-label-md text-label-md font-semibold text-on-surface">${formatCurrency(position.min_salary)} - ${formatCurrency(position.max_salary)}</span>
        </div>
        <div class="rounded-lg bg-surface-container-low p-space-sm">
          <span class="block font-label-sm text-label-sm text-on-surface-variant uppercase">Phụ cấp chức vụ</span>
          <span class="font-label-md text-label-md font-semibold text-on-surface">${formatCurrency(position.position_allowance)}</span>
        </div>
        <div class="rounded-lg bg-surface-container-low p-space-sm">
          <span class="block font-label-sm text-label-sm text-on-surface-variant uppercase">Ngạch bậc</span>
          <span class="font-label-md text-label-md font-semibold text-on-surface">${escapeHtml(position.grade_level)}</span>
        </div>
      </div>
      <div class="flex flex-col gap-space-md">
        <div>
          <h4 class="font-label-lg text-label-lg font-semibold text-on-surface mb-1">Mô tả công việc (JD)</h4>
          <p class="whitespace-pre-line text-body-md text-on-surface-variant leading-6">${escapeHtml(position.job_description)}</p>
        </div>
        <div>
          <h4 class="font-label-lg text-label-lg font-semibold text-on-surface mb-1">Yêu cầu năng lực</h4>
          <p class="whitespace-pre-line text-body-md text-on-surface-variant leading-6">${escapeHtml(position.job_requirements)}</p>
        </div>
      </div>
    `;
  }

  const editButton = document.getElementById("jdDetailEdit");
  if (editButton) editButton.hidden = !state.canManage;

  openModal("modal-jd-detail");
};

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("vi-VN");
};

const getInitials = (name) => {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(-2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
};

const MEMBER_STATUS = {
  WORKING: { label: "Đang làm việc", className: "bg-emerald-50 text-emerald-700" },
  MATERNITY: { label: "Nghỉ thai sản", className: "bg-pink-50 text-pink-700" },
};

const setDepartmentDetailLoading = (department) => {
  setText("#departmentDetailCode", department?.department_code || "—");
  setText("#departmentDetailTitle", department?.name || "Chi tiết phòng ban");
  setText("#departmentDetailMeta", "Đang tải...");
  setText(
    "#departmentDetailSubtitle",
    "Thành viên, chức vụ và phòng ban trực thuộc",
  );

  const editButton = document.getElementById("departmentDetailEdit");
  if (editButton) editButton.hidden = true;

  const body = document.getElementById("departmentDetailBody");
  if (body) {
    body.innerHTML = `
      <div class="animate-pulse space-y-space-md">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-space-sm">
          ${Array.from({ length: 4 })
            .map(
              () =>
                '<div class="h-24 rounded-lg bg-surface-container-high"></div>',
            )
            .join("")}
        </div>
        <div class="h-64 rounded-lg bg-surface-container-high"></div>
        <div class="h-48 rounded-lg bg-surface-container-high"></div>
      </div>
    `;
  }
};

const renderDepartmentDetail = (data) => {
  const department = data.department;
  const members = data.members || [];
  const positions = data.positions || [];
  const children = data.children || [];
  const progress = getHeadcountProgress(department);

  setText("#departmentDetailCode", department.department_code);
  setText("#departmentDetailTitle", department.name);
  setText(
    "#departmentDetailMeta",
    department.parent_name
      ? `Thuộc ${department.parent_code} - ${department.parent_name}`
      : "Phòng ban cấp gốc",
  );
  setText(
    "#departmentDetailSubtitle",
    `Đứng đầu: ${department.manager?.full_name || "Chưa phân công"} • ${department.active_count} nhân sự • ${children.length} phòng ban trực thuộc`,
  );

  const editButton = document.getElementById("departmentDetailEdit");
  if (editButton) editButton.hidden = !state.canManage || !department.can_manage;

  const memberStatus = (status) =>
    MEMBER_STATUS[status] || {
      label: status || "—",
      className: "bg-surface-container-high text-on-surface-variant",
    };

  const memberRows = members.length
    ? members
        .map((member) => {
          const status = memberStatus(member.work_status);
          return `
            <tr class="hover:bg-surface-container-low/60 transition-colors">
              <td class="px-3 py-3">
                <div class="flex items-center gap-space-sm min-w-[190px]">
                  <span class="w-9 h-9 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center font-label-md text-label-md font-bold shrink-0">${escapeHtml(getInitials(member.full_name))}</span>
                  <div class="min-w-0">
                    <p class="font-label-md text-label-md font-semibold text-on-surface truncate">${escapeHtml(member.full_name)}</p>
                    <p class="font-label-sm text-label-sm text-on-surface-variant">${escapeHtml(member.employee_code)}${Number(member.id) === Number(department.manager_id) ? " · Người đứng đầu" : ""}</p>
                    <p class="font-label-sm text-label-sm text-primary">${member.data_scope === "ALL" ? "Quản lý toàn công ty" : member.data_scope === "DEPARTMENT" ? "Quản lý phòng và đơn vị trực thuộc" : "Nhân viên · phạm vi cá nhân"}</p>
                    <p class="font-label-sm text-label-sm text-on-surface-variant">Báo cáo: ${escapeHtml(member.manager_name || "Không có cấp trên")}</p>
                  </div>
                </div>
              </td>
              <td class="px-3 py-3 text-on-surface-variant">
                ${member.position_title ? `${escapeHtml(member.position_code || "")} - ${escapeHtml(member.position_title)}` : '<span class="italic">Chưa gán chức vụ</span>'}
              </td>
              <td class="px-3 py-3 text-center">
                ${member.grade_level ? `<span class="inline-flex rounded-full px-2 py-0.5 font-label-sm text-label-sm ${GRADE_STYLES[member.grade_level] || "bg-surface-container-high text-on-surface-variant"}">${escapeHtml(member.grade_level)}</span>` : "—"}
              </td>
              <td class="px-3 py-3 text-on-surface-variant min-w-[180px]">
                <p class="truncate">${escapeHtml(member.email || "—")}</p>
                <p class="font-label-sm text-label-sm">${escapeHtml(member.phone || "—")}</p>
              </td>
              <td class="px-3 py-3 text-on-surface-variant whitespace-nowrap">${formatDate(member.hire_date)}</td>
              <td class="px-3 py-3 text-center">
                <span class="inline-flex rounded-full px-2 py-0.5 font-label-sm text-label-sm ${status.className}">${escapeHtml(status.label)}</span>
              </td>
            </tr>
          `;
        })
        .join("")
    : `
      <tr>
        <td class="px-3 py-8 text-center text-on-surface-variant" colspan="6">
          <span class="material-symbols-outlined text-[30px] text-outline">group_off</span>
          <p class="mt-1">Phòng ban chưa có nhân sự đang làm việc.</p>
        </td>
      </tr>
    `;

  const positionCards = positions.length
    ? positions
        .map((position) => {
          const gradeStyle =
            GRADE_STYLES[position.grade_level] ||
            "bg-surface-container-high text-on-surface-variant";
          const editAction = state.canManage
            ? `<button type="button" class="h-8 px-2 rounded hover:bg-surface-container-high text-primary inline-flex items-center gap-1 font-label-sm text-label-sm" data-edit-position="${escapeHtml(position.id)}">
                <span class="material-symbols-outlined text-[16px]">edit</span>
                Sửa
              </button>`
            : "";

          return `
            <div class="rounded-lg border border-surface-variant bg-surface-container-lowest p-space-md flex flex-col gap-space-xs hover:border-primary-container transition-colors">
              <div class="flex items-start justify-between gap-space-sm">
                <div class="min-w-0">
                  <span class="font-label-sm text-label-sm font-semibold text-primary">${escapeHtml(position.position_code)}</span>
                  <h4 class="font-label-lg text-label-lg font-bold text-on-surface truncate">${escapeHtml(position.title)}</h4>
                </div>
                <span class="inline-flex rounded-full px-2 py-0.5 font-label-sm text-label-sm shrink-0 ${gradeStyle}">${escapeHtml(position.grade_level)}</span>
              </div>
              <p class="font-label-sm text-label-sm text-on-surface-variant">Khung lương: <span class="font-semibold text-on-surface">${formatCurrency(position.min_salary)} - ${formatCurrency(position.max_salary)}</span></p>
              <p class="font-label-sm text-label-sm text-on-surface-variant">Phụ cấp: <span class="font-semibold text-on-surface">${formatCurrency(position.position_allowance)}</span></p>
              <p class="text-body-sm text-on-surface-variant leading-5 line-clamp-2">${escapeHtml(truncate(position.job_description, 120))}</p>
              <div class="mt-auto pt-2 border-t border-surface-container-high flex items-center justify-end gap-1">
                ${editAction}
                <button type="button" class="h-8 px-2 rounded hover:bg-surface-container-high text-primary inline-flex items-center gap-1 font-label-sm text-label-sm" data-view-jd="${escapeHtml(position.id)}">
                  <span class="material-symbols-outlined text-[16px]">visibility</span>
                  Xem JD
                </button>
              </div>
            </div>
          `;
        })
        .join("")
    : `
      <div class="rounded-lg border border-dashed border-surface-variant p-space-lg text-center text-on-surface-variant">
        <span class="material-symbols-outlined text-[28px] text-outline">work_off</span>
        <p class="mt-1">Phòng ban chưa có chức vụ nào.</p>
      </div>
    `;

  const childCards = children.length
    ? children
        .map(
          (child) => `
            <button type="button" class="text-left rounded-lg border border-surface-variant bg-surface-container-lowest p-space-sm hover:border-primary-container hover:shadow-sm transition-all" data-open-department="${escapeHtml(child.id)}">
              <div class="flex items-center justify-between gap-space-sm">
                <span class="font-label-sm text-label-sm font-semibold text-primary">${escapeHtml(child.department_code)}</span>
                <span class="material-symbols-outlined text-[16px] text-outline">chevron_right</span>
              </div>
              <p class="mt-1 font-label-md text-label-md font-semibold text-on-surface truncate">${escapeHtml(child.name)}</p>
              <p class="mt-1 font-label-sm text-label-sm text-on-surface-variant">${child.active_count} nhân sự • ${child.position_count} chức vụ</p>
            </button>
          `,
        )
        .join("")
    : "";

  const body = document.getElementById("departmentDetailBody");
  if (!body) return;

  body.innerHTML = `
    <div class="flex flex-col gap-space-lg">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-space-sm">
        <div class="rounded-lg bg-surface-container-low p-space-sm">
          <span class="font-label-sm text-label-sm text-on-surface-variant uppercase block">Nhân sự</span>
          <p class="mt-1 font-headline-md text-headline-md font-bold text-on-surface">${department.active_count}</p>
          <div class="mt-2">${progressHtml(department)}</div>
        </div>
        <div class="rounded-lg bg-surface-container-low p-space-sm">
          <span class="font-label-sm text-label-sm text-on-surface-variant uppercase block">Định biên</span>
          <p class="mt-1 font-headline-md text-headline-md font-bold text-on-surface">${department.headcount_limit || "—"}</p>
          <p class="mt-1 font-label-sm text-label-sm ${progress.text}">${department.headcount_limit > 0 ? `${Math.round(progress.ratio * 100)}% sử dụng` : "Chưa đặt định biên"}</p>
        </div>
        <div class="rounded-lg bg-surface-container-low p-space-sm">
          <span class="font-label-sm text-label-sm text-on-surface-variant uppercase block">Chức vụ</span>
          <p class="mt-1 font-headline-md text-headline-md font-bold text-on-surface">${positions.length}</p>
          <p class="mt-1 font-label-sm text-label-sm text-on-surface-variant">JD và khung lương</p>
        </div>
        <div class="rounded-lg bg-surface-container-low p-space-sm">
          <span class="font-label-sm text-label-sm text-on-surface-variant uppercase block">Trực thuộc</span>
          <p class="mt-1 font-headline-md text-headline-md font-bold text-on-surface">${children.length}</p>
          <p class="mt-1 font-label-sm text-label-sm text-on-surface-variant">Phòng ban con</p>
        </div>
      </div>

      <section class="rounded-lg border border-surface-variant overflow-hidden">
        <div class="px-space-md py-space-sm bg-surface-container-low flex items-center justify-between gap-space-sm">
          <div>
            <h4 class="font-label-lg text-label-lg font-bold text-on-surface">Thành viên phòng ban</h4>
            <p class="font-label-sm text-label-sm text-on-surface-variant">Nhân sự đang làm việc trực tiếp tại phòng ban</p>
          </div>
          <span class="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2 py-0.5 font-label-sm text-label-sm text-on-surface-variant">
            <span class="material-symbols-outlined text-[15px]">groups</span>
            ${members.length} thành viên
          </span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-surface-container-lowest text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">
                <th class="min-w-[210px] px-3 py-2.5">Nhân sự</th>
                <th class="min-w-[200px] px-3 py-2.5">Chức vụ</th>
                <th class="min-w-[90px] px-3 py-2.5 text-center">Ngạch</th>
                <th class="min-w-[200px] px-3 py-2.5">Liên hệ</th>
                <th class="min-w-[120px] px-3 py-2.5">Ngày vào</th>
                <th class="min-w-[130px] px-3 py-2.5 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-container-high font-body-sm text-body-sm">
              ${memberRows}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div class="flex items-center justify-between gap-space-sm mb-space-sm">
          <div>
            <h4 class="font-label-lg text-label-lg font-bold text-on-surface">Chức vụ &amp; JD</h4>
            <p class="font-label-sm text-label-sm text-on-surface-variant">Danh mục chức vụ đang áp dụng tại phòng ban</p>
          </div>
          <span class="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2 py-0.5 font-label-sm text-label-sm text-on-surface-variant">
            <span class="material-symbols-outlined text-[15px]">badge</span>
            ${positions.length} chức vụ
          </span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
          ${positionCards}
        </div>
      </section>

      ${
        children.length
          ? `<section>
              <div class="flex items-center justify-between gap-space-sm mb-space-sm">
                <div>
                  <h4 class="font-label-lg text-label-lg font-bold text-on-surface">Phòng ban trực thuộc</h4>
                  <p class="font-label-sm text-label-sm text-on-surface-variant">Nhấn để xem chi tiết phòng ban con</p>
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-space-sm">
                ${childCards}
              </div>
            </section>`
          : ""
      }
    </div>
  `;
};

const openDepartmentDetail = async (departmentId) => {
  const department = state.departments.find(
    (item) => String(item.id) === String(departmentId),
  );
  if (!department) return;

  state.departmentDetail = null;
  setDepartmentDetailLoading(department);
  openModal("modal-department-detail");

  const requestId = ++state.detailRequestSeq;

  try {
    const response = await api.get(`/organization/departments/${departmentId}`);
    if (requestId !== state.detailRequestSeq) return;

    state.departmentDetail = response.data || null;
    if (state.departmentDetail?.department) {
      renderDepartmentDetail(state.departmentDetail);
    }
  } catch (error) {
    if (requestId !== state.detailRequestSeq) return;

    const message =
      error.response?.data?.message ||
      "Không thể tải chi tiết phòng ban. Vui lòng thử lại.";

    const body = document.getElementById("departmentDetailBody");
    if (body) {
      body.innerHTML = `
        <div class="rounded-lg border border-error/40 bg-error-container text-on-error-container p-space-md flex flex-col items-center gap-space-sm text-center">
          <span class="material-symbols-outlined text-[30px]">error</span>
          <p>${escapeHtml(message)}</p>
          <button type="button" class="h-8 px-space-md rounded bg-error text-on-error font-label-sm text-label-sm" data-retry-department="${escapeHtml(departmentId)}">Thử lại</button>
        </div>
      `;
    }
  }
};

const closeDepartmentDetail = () => {
  state.detailRequestSeq += 1;
  closeModal("modal-department-detail");
};

const bindEvents = (user) => {
  document.querySelectorAll("[data-org-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      setTab(user, button.getAttribute("data-org-tab"));
    });
  });

  document.getElementById("orgSearch")?.addEventListener("input", (event) => {
    const value = event.target.value;

    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      state.keyword = value.trim();
      renderAll(user);
    }, 250);
  });

  document
    .getElementById("filterOrgDepartment")
    ?.addEventListener("change", (event) => {
      state.departmentId = event.target.value;
      renderAll(user);
    });

  document
    .getElementById("btnResetOrgFilters")
    ?.addEventListener("click", () => resetFilters(user));

  document
    .getElementById("btnRefreshOrganization")
    ?.addEventListener("click", () => loadOrganization(user));

  document
    .getElementById("btnCreateDepartment")
    ?.addEventListener("click", openCreateDepartment);

  document
    .getElementById("btnCreatePosition")
    ?.addEventListener("click", openCreatePosition);

  document.getElementById("orgChips")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-clear-org-filter]");
    if (!button) return;
    clearFilter(user, button.getAttribute("data-clear-org-filter"));
  });

  document.getElementById("orgChart")?.addEventListener("click", (event) => {
    const toggleButton = event.target.closest("[data-toggle-department]");
    if (toggleButton) {
      const id = toggleButton.getAttribute("data-toggle-department");
      if (state.expandedDepartments.has(id)) {
        state.expandedDepartments.delete(id);
      } else {
        state.expandedDepartments.add(id);
      }
      renderChart();
      document.getElementById(`org-toggle-${id}`)?.focus();
      return;
    }

    const editButton = event.target.closest("[data-edit-department]");
    if (editButton) {
      openEditDepartment(editButton.getAttribute("data-edit-department"));
      return;
    }

    const card = event.target.closest("[data-view-department]");
    if (!card) return;
    openDepartmentDetail(card.getAttribute("data-view-department"));
  });

  document.getElementById("orgChart")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest("[data-edit-department]")) return;

    const card = event.target.closest("[data-view-department]");
    if (!card) return;

    event.preventDefault();
    openDepartmentDetail(card.getAttribute("data-view-department"));
  });

  document
    .getElementById("orgDepartmentsBody")
    ?.addEventListener("click", (event) => {
      const editButton = event.target.closest("[data-edit-department]");
      if (editButton) {
        openEditDepartment(editButton.getAttribute("data-edit-department"));
        return;
      }

      const row = event.target.closest("[data-view-department]");
      if (!row) return;
      openDepartmentDetail(row.getAttribute("data-view-department"));
    });

  document
    .getElementById("orgPositionsBody")
    ?.addEventListener("click", (event) => {
      const editButton = event.target.closest("[data-edit-position]");
      if (editButton) {
        openEditPosition(editButton.getAttribute("data-edit-position"));
        return;
      }

      const viewButton = event.target.closest("[data-view-jd]");
      if (!viewButton) return;
      openJdDetail(viewButton.getAttribute("data-view-jd"));
    });

  document
    .getElementById("departmentDetailBody")
    ?.addEventListener("click", (event) => {
      const editDepartmentButton = event.target.closest(
        "[data-edit-department]",
      );
      if (editDepartmentButton) {
        closeDepartmentDetail();
        openEditDepartment(
          editDepartmentButton.getAttribute("data-edit-department"),
        );
        return;
      }

      const editPositionButton = event.target.closest("[data-edit-position]");
      if (editPositionButton) {
        closeDepartmentDetail();
        openEditPosition(editPositionButton.getAttribute("data-edit-position"));
        return;
      }

      const childButton = event.target.closest("[data-open-department]");
      if (childButton) {
        openDepartmentDetail(childButton.getAttribute("data-open-department"));
        return;
      }

      const jdButton = event.target.closest("[data-view-jd]");
      if (jdButton) {
        openJdDetail(jdButton.getAttribute("data-view-jd"));
        return;
      }

      const retryButton = event.target.closest("[data-retry-department]");
      if (retryButton) {
        openDepartmentDetail(
          retryButton.getAttribute("data-retry-department"),
        );
      }
    });

  document
    .getElementById("departmentForm")
    ?.addEventListener("submit", (event) => submitDepartmentForm(event, user));

  document
    .getElementById("positionForm")
    ?.addEventListener("submit", (event) => submitPositionForm(event, user));

  document
    .getElementById("departmentFormClose")
    ?.addEventListener("click", () => closeModal("modal-department-form"));
  document
    .getElementById("departmentFormCancel")
    ?.addEventListener("click", () => closeModal("modal-department-form"));
  document
    .getElementById("positionFormClose")
    ?.addEventListener("click", () => closeModal("modal-position-form"));
  document
    .getElementById("positionFormCancel")
    ?.addEventListener("click", () => closeModal("modal-position-form"));
  document
    .getElementById("jdDetailClose")
    ?.addEventListener("click", () => closeModal("modal-jd-detail"));
  document
    .getElementById("jdDetailDismiss")
    ?.addEventListener("click", () => closeModal("modal-jd-detail"));
  document
    .getElementById("departmentDetailClose")
    ?.addEventListener("click", closeDepartmentDetail);
  document
    .getElementById("departmentDetailDismiss")
    ?.addEventListener("click", closeDepartmentDetail);

  document.getElementById("jdDetailEdit")?.addEventListener("click", () => {
    if (!state.jdPosition) return;
    closeModal("modal-jd-detail");
    openEditPosition(state.jdPosition.id);
  });

  document
    .getElementById("departmentDetailEdit")
    ?.addEventListener("click", () => {
      const departmentId = state.departmentDetail?.department?.id;
      if (!departmentId) return;
      closeDepartmentDetail();
      openEditDepartment(departmentId);
    });

  document
    .getElementById("modal-department-form")
    ?.addEventListener("click", (event) => {
      if (event.target.id === "modal-department-form") {
        closeModal("modal-department-form");
      }
    });

  document
    .getElementById("modal-position-form")
    ?.addEventListener("click", (event) => {
      if (event.target.id === "modal-position-form") {
        closeModal("modal-position-form");
      }
    });

  document
    .getElementById("modal-jd-detail")
    ?.addEventListener("click", (event) => {
      if (event.target.id === "modal-jd-detail") {
        closeModal("modal-jd-detail");
      }
    });

  document
    .getElementById("modal-department-detail")
    ?.addEventListener("click", (event) => {
      if (event.target.id === "modal-department-detail") {
        closeDepartmentDetail();
      }
    });

  if (modalKeyHandler) document.removeEventListener("keydown", modalKeyHandler);
  modalKeyHandler = (event) => {
    if (event.key !== "Escape") return;
    closeModal("modal-department-form");
    closeModal("modal-position-form");
    closeModal("modal-jd-detail");
    closeDepartmentDetail();
  };
  document.addEventListener("keydown", modalKeyHandler);
};

export const initOrganization = (user = getCurrentUser(), tab = "chart") => {
  if (!user) {
    logout();
    return;
  }

  ensureViewMounted();

  if (!window.__HRM_SPA__) setupShell(user);

  state.tab = TAB_META[tab] ? tab : "chart";
  state.keyword = "";
  state.departmentId = "";
  state.canManage = false;
  state.canViewSalary = false;
  state.departments = [];
  state.positions = [];
  state.leadership = [];
  state.scope = user.data_scope || "SELF";

  const search = document.getElementById("orgSearch");
  const department = document.getElementById("filterOrgDepartment");

  if (search) search.value = "";
  if (department) department.value = "";

  applyTabHeader();
  renderHeaderBadges(user);
  bindEvents(user);
  loadOrganization(user);
};
