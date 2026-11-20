import employeesHtml from "../pages/employees.html?raw";
import api from "../services/api.js";
import {
  getCurrentUser,
  hasPermission,
  logout,
} from "../services/auth.service.js";
import { setupShell } from "./home.js";

const MODES = {
  all: {
    title: "Tất cả nhân viên",
    status: "ALL",
    subtitle:
      "Danh sách nhân sự theo phạm vi dữ liệu được cấp cho tài khoản của bạn.",
  },
  working: {
    title: "Nhân viên đang làm",
    status: "ACTIVE",
    subtitle:
      "Bao gồm nhân viên đang làm việc và nhân viên đang nghỉ thai sản.",
  },
  resigned: {
    title: "Nhân viên đã nghỉ",
    status: "RESIGNED",
    subtitle: "Hồ sơ lưu trữ của nhân sự đã nghỉ việc để tra cứu khi cần.",
  },
};

const MODE_HASHES = {
  all: "#/nhan-vien",
  working: "#/nhan-vien/dang-lam",
  resigned: "#/nhan-vien/da-nghi",
};

const STATUS_META = {
  WORKING: {
    label: "Đang làm việc",
    badge: "bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  MATERNITY: {
    label: "Thai sản",
    badge: "bg-sky-50 text-sky-700",
    dot: "bg-sky-500",
  },
  RESIGNED: {
    label: "Đã nghỉ",
    badge: "bg-surface-container-high text-on-surface-variant",
    dot: "bg-outline",
  },
};

const STATUS_FILTER_LABELS = {
  ALL: "Tất cả trạng thái",
  ACTIVE: "Đang làm (gồm thai sản)",
  WORKING: "Đang làm việc",
  MATERNITY: "Thai sản",
  RESIGNED: "Đã nghỉ",
};

const GENDER_LABELS = {
  MALE: "Nam",
  FEMALE: "Nữ",
  OTHER: "Khác",
};

const SCOPE_LABELS = {
  ALL: "Toàn công ty",
  DEPARTMENT: "Phòng ban của tôi",
  SELF: "Chỉ hồ sơ của tôi",
};

const state = {
  mode: "all",
  status: "ALL",
  keyword: "",
  departmentId: "",
  positionId: "",
  birthMonth: "",
  showSalary: true,
  scope: "ALL",
  summary: { total: 0, working: 0, maternity: 0, resigned: 0 },
  options: { departments: [], positions: [] },
  employees: [],
  requestSeq: 0,
  searchTimer: null,
  resetFaceTarget: null,
};

let modalKeyHandler = null;

export const getEmployeeModeFromHash = (hash = window.location.hash) => {
  if (hash === MODE_HASHES.working) return "working";
  if (hash === MODE_HASHES.resigned) return "resigned";
  return "all";
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatDate = (value) => {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  if (!year || !month || !day) return "—";
  return `${day}/${month}/${year}`;
};

const formatCurrency = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${new Intl.NumberFormat("vi-VN").format(number)} ₫`;
};

const getInitials = (fullName) => {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "--";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
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
  const notice = document.getElementById("employeesNotice");
  if (!notice) return;

  notice.className =
    "flex items-start gap-space-sm rounded-lg border border-error/40 bg-error-container text-on-error-container px-space-md py-space-sm font-body-sm text-body-sm";
  notice.innerHTML = `
    <span class="material-symbols-outlined text-[18px]">error</span>
    <span>${escapeHtml(message)}</span>
  `;
};

const hideNotice = () => {
  const notice = document.getElementById("employeesNotice");
  if (!notice) return;
  notice.className = "hidden";
  notice.innerHTML = "";
};

const ensureViewMounted = () => {
  if (!window.__HRM_SPA__) return;

  const main = document.querySelector("main");
  if (!main) return;

  const doc = new DOMParser().parseFromString(employeesHtml, "text/html");
  const view = doc.querySelector("main > div");
  const modal = doc.getElementById("modal-employee-detail");
  const resetModal = doc.getElementById("modal-reset-face");

  main.innerHTML = "";
  document.getElementById("modal-employee-detail")?.remove();
  document.getElementById("modal-reset-face")?.remove();

  if (view) main.appendChild(document.importNode(view, true));
  if (modal) document.body.appendChild(document.importNode(modal, true));
  if (resetModal) document.body.appendChild(document.importNode(resetModal, true));
};

const setText = (selector, text) => {
  const element = document.querySelector(selector);
  if (element) element.textContent = text;
};

const applyModeHeader = () => {
  const config = MODES[state.mode] || MODES.all;

  setText("#employeesTitle", config.title);
  setText("#employeesSubtitle", config.subtitle);

  document.querySelectorAll("[data-mode]").forEach((button) => {
    const isActive = button.getAttribute("data-mode") === state.mode;

    button.classList.toggle("border-primary-container", isActive);
    button.classList.toggle("ring-1", isActive);
    button.classList.toggle("ring-primary-container", isActive);
    button.classList.toggle("border-transparent", !isActive);
  });
};

const renderHeaderBadges = (user, total) => {
  setText("#employeesTotalBadge", `${total} nhân sự`);
  setText("#employeesScopeBadge", `Phạm vi: ${SCOPE_LABELS[state.scope] || "—"}`);
  setText("#employeesRoleBadge", user.role_name || user.role_id || "—");
};

const renderSummary = () => {
  setText("#countAll", String(state.summary.total));
  setText("#countWorking", String(state.summary.working + state.summary.maternity));
  setText("#countResigned", String(state.summary.resigned));
};

const renderDepartmentOptions = () => {
  const select = document.getElementById("filterDepartment");
  if (!select) return;

  const current = state.departmentId;
  select.innerHTML =
    '<option value="">Phòng ban: Tất cả</option>' +
    state.options.departments
      .map(
        (department) =>
          `<option value="${department.id}">${escapeHtml(department.name)} (${escapeHtml(department.department_code)})</option>`,
      )
      .join("");

  select.value = current;
};

const renderPositionOptions = () => {
  const select = document.getElementById("filterPosition");
  if (!select) return;

  const departmentId = Number(state.departmentId) || null;
  const positions = departmentId
    ? state.options.positions.filter(
        (position) => Number(position.department_id) === departmentId,
      )
    : state.options.positions;

  const current = state.positionId;
  select.innerHTML =
    '<option value="">Chức vụ: Tất cả</option>' +
    positions
      .map(
        (position) =>
          `<option value="${position.id}">${escapeHtml(position.title)} (${escapeHtml(position.position_code)})</option>`,
      )
      .join("");

  const stillExists = positions.some(
    (position) => String(position.id) === String(current),
  );
  select.value = stillExists ? current : "";
  if (!stillExists) state.positionId = "";
};

const renderChips = () => {
  const container = document.getElementById("employeesChips");
  if (!container) return;

  const chips = [];

  if (state.keyword) {
    chips.push({
      key: "keyword",
      label: `Từ khóa: "${state.keyword}"`,
    });
  }

  if (state.departmentId) {
    const department = state.options.departments.find(
      (item) => String(item.id) === String(state.departmentId),
    );
    chips.push({
      key: "department",
      label: `Phòng ban: ${department?.name || state.departmentId}`,
    });
  }

  if (state.positionId) {
    const position = state.options.positions.find(
      (item) => String(item.id) === String(state.positionId),
    );
    chips.push({
      key: "position",
      label: `Chức vụ: ${position?.title || state.positionId}`,
    });
  }

  if (state.status && state.status !== "ALL") {
    chips.push({
      key: "status",
      label: `Trạng thái: ${STATUS_FILTER_LABELS[state.status] || state.status}`,
    });
  }

  if (state.birthMonth) {
    chips.push({
      key: "birth",
      label: `Tháng sinh: ${state.birthMonth}`,
    });
  }

  if (!chips.length) {
    container.innerHTML =
      '<span class="text-on-surface-variant">Đang lọc theo:</span><span class="text-on-surface-variant italic">Chưa có bộ lọc bổ sung</span>';
    return;
  }

  container.innerHTML =
    '<span class="text-on-surface-variant">Đang lọc theo:</span>' +
    chips
      .map(
        (chip) => `
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container-lowest text-primary font-medium shadow-xs">
            ${escapeHtml(chip.label)}
            <button class="text-primary hover:text-error" data-clear-filter="${chip.key}" title="Bỏ lọc" type="button">
              <span class="material-symbols-outlined text-[14px]">close</span>
            </button>
          </span>
        `,
      )
      .join("") +
    '<button class="text-primary font-semibold hover:underline ml-1" data-clear-filter="all" type="button">Xóa tất cả</button>';
};

const renderStatusBadge = (status) => {
  const meta = STATUS_META[status] || {
    label: status || "—",
    badge: "bg-surface-container-high text-on-surface-variant",
    dot: "bg-outline",
  };

  return `
    <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full ${meta.badge} font-label-sm text-label-sm font-semibold">
      <span class="w-1.5 h-1.5 rounded-full ${meta.dot}"></span>
      ${escapeHtml(meta.label)}
    </span>
  `;
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const [date, time] = String(value).split(" ");
  return time ? `${formatDate(date)} ${time.slice(0, 5)}` : formatDate(date);
};

const faceStatusOf = (employee) =>
  employee.face_status || (employee.has_face_descriptor ? "ACTIVE" : "UNREGISTERED");

const renderFaceStatusBadge = (employee) => {
  const active = faceStatusOf(employee) === "ACTIVE";
  return `
    <div class="flex flex-col items-center gap-0.5">
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-label-sm text-label-sm font-semibold ${active ? "bg-emerald-50 text-emerald-800" : "bg-surface-container-high text-on-surface-variant"}">
        <span class="material-symbols-outlined text-[14px]">${active ? "verified" : "face_retouching_natural"}</span>
        ${active ? "Đã kích hoạt" : "Chưa kích hoạt"}
      </span>
      <span class="font-body-sm text-body-sm text-on-surface-variant">${active ? formatDateTime(employee.face_enrolled_at) : "—"}</span>
    </div>
  `;
};

const renderEmptyRow = () => {
  const body = document.getElementById("employeesBody");
  if (!body) return;

  body.innerHTML = `
    <tr>
      <td class="px-3 py-10 text-center" colspan="10">
        <div class="flex flex-col items-center gap-2 text-on-surface-variant">
          <span class="material-symbols-outlined text-[36px]">person_search</span>
          <p class="font-body-md text-body-md">Không tìm thấy nhân sự phù hợp với bộ lọc hiện tại.</p>
          <button class="text-primary font-semibold hover:underline" data-clear-filter="all" type="button">Xóa toàn bộ bộ lọc</button>
        </div>
      </td>
    </tr>
  `;
};

const renderTableError = (message) => {
  const body = document.getElementById("employeesBody");
  if (!body) return;

  body.innerHTML = `
    <tr>
      <td class="px-3 py-10 text-center" colspan="10">
        <div class="flex flex-col items-center gap-2 text-on-surface-variant">
          <span class="material-symbols-outlined text-[36px] text-error">cloud_off</span>
          <p class="font-body-md text-body-md">${escapeHtml(message)}</p>
          <button class="text-primary font-semibold hover:underline" data-action="retry" type="button">Thử lại</button>
        </div>
      </td>
    </tr>
  `;
};

const renderTable = (user) => {
  const body = document.getElementById("employeesBody");
  if (!body) return;

  if (!state.employees.length) {
    renderEmptyRow();
    return;
  }

  const canManage = hasPermission("HR.PROFILE_MANAGE", user);
  const canResetFace = user?.role_id === "SUPER_ADMIN" || canManage;
  const salaryCell = (employee) =>
    state.showSalary && employee.base_salary !== null && employee.base_salary !== undefined
      ? `<span class="font-medium text-on-surface">${formatCurrency(employee.base_salary)}</span>`
      : `<span class="inline-flex items-center gap-1 text-on-surface-variant" title="Lương bị ẩn theo phân quyền">
           <span class="material-symbols-outlined text-[15px]">lock</span>
           <span>•••</span>
         </span>`;

  body.innerHTML = state.employees
    .map(
      (employee) => `
        <tr class="hover:bg-surface-container-high transition-colors group">
          <td class="px-3 py-2.5 align-top">
            <span class="font-mono font-semibold text-on-surface">${escapeHtml(employee.employee_code)}</span>
          </td>
          <td class="px-3 py-2.5 align-top">
            <div class="flex items-center gap-2.5">
              <span class="w-8 h-8 rounded-full bg-primary-fixed text-primary flex items-center justify-center font-bold text-label-sm shrink-0">
                ${escapeHtml(getInitials(employee.full_name))}
              </span>
              <div class="flex flex-col min-w-0">
                <span class="font-semibold text-on-surface group-hover:text-primary transition-colors truncate">
                  ${escapeHtml(employee.full_name)}
                </span>
                <span class="font-body-sm text-body-sm text-on-surface-variant truncate">
                  ${escapeHtml(employee.email || "—")}
                </span>
              </div>
            </div>
          </td>
          <td class="px-3 py-2.5 align-top">
            ${escapeHtml(GENDER_LABELS[employee.gender] || "—")}
          </td>
          <td class="px-3 py-2.5 align-top whitespace-nowrap">
            ${formatDate(employee.dob)}
          </td>
          <td class="px-3 py-2.5 align-top">
            <div class="flex flex-col">
              <span class="text-on-surface truncate">${escapeHtml(employee.department_name || "—")}</span>
              <span class="font-mono text-[11px] text-on-surface-variant">${escapeHtml(employee.department_code || "")}</span>
            </div>
          </td>
          <td class="px-3 py-2.5 align-top">
            <div class="flex flex-col">
              <span class="text-on-surface truncate">${escapeHtml(employee.position_title || "—")}</span>
              <span class="font-body-sm text-body-sm text-on-surface-variant">
                Ngạch: ${escapeHtml(employee.grade_level || "—")}
              </span>
            </div>
          </td>
          <td class="px-3 py-2.5 align-top text-right whitespace-nowrap">
            ${salaryCell(employee)}
          </td>
          <td class="px-3 py-2.5 align-top text-center">
            ${renderStatusBadge(employee.work_status)}
          </td>
          <td class="px-3 py-2.5 align-top text-center">
            ${renderFaceStatusBadge(employee)}
          </td>
          <td class="px-3 py-2.5 align-top">
            <div class="flex items-center justify-center gap-1">
              <button
                class="w-7 h-7 rounded hover:bg-surface-container text-primary flex items-center justify-center"
                data-action="view"
                data-id="${employee.id}"
                title="Xem hồ sơ nhân sự"
                type="button"
              >
                <span class="material-symbols-outlined text-[18px]">visibility</span>
              </button>
              ${
                canManage
                  ? `<button
                       class="w-7 h-7 rounded hover:bg-surface-container text-on-surface-variant flex items-center justify-center"
                       data-action="edit"
                       data-id="${employee.id}"
                       title="Chỉnh sửa hồ sơ (sắp triển khai)"
                       type="button"
                      >
                        <span class="material-symbols-outlined text-[18px]">edit</span>
                      </button>`
                   : ""
               }
               ${
                 canResetFace && faceStatusOf(employee) === "ACTIVE"
                   ? `<button
                        class="w-7 h-7 rounded hover:bg-red-50 text-error flex items-center justify-center"
                        data-action="reset-face"
                        data-id="${employee.id}"
                        title="Reset FaceID"
                        type="button"
                      >
                        <span class="material-symbols-outlined text-[18px]">lock_reset</span>
                      </button>`
                   : ""
               }
            </div>
          </td>
        </tr>
      `,
    )
    .join("");
};

const detailItem = (label, value) => `
  <div class="flex flex-col gap-0.5">
    <span class="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">${escapeHtml(label)}</span>
    <span class="font-body-md text-body-md text-on-surface">${value}</span>
  </div>
`;

const openEmployeeDetail = (employee) => {
  const modal = document.getElementById("modal-employee-detail");
  if (!modal) return;

  setText("#employeeDetailTitle", employee.full_name || "Thông tin nhân sự");
  setText(
    "#employeeDetailSubtitle",
    `${employee.employee_code || "—"} • ${employee.department_name || "Chưa xếp phòng ban"}`,
  );

  const body = document.getElementById("employeeDetailBody");
  if (body) {
    const salary = state.showSalary
      ? formatCurrency(employee.base_salary)
      : `<span class="inline-flex items-center gap-1 text-on-surface-variant">
           <span class="material-symbols-outlined text-[15px]">lock</span>
           <span>••• (ẩn theo phân quyền)</span>
         </span>`;

    body.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center gap-space-md mb-space-md">
        <span class="w-14 h-14 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-bold font-headline-md text-headline-md shrink-0">
          ${escapeHtml(getInitials(employee.full_name))}
        </span>
        <div class="min-w-0">
          <h4 class="font-headline-md text-headline-md font-bold text-on-surface truncate">
            ${escapeHtml(employee.full_name)}
          </h4>
          <p class="font-body-sm text-body-sm text-on-surface-variant">
            ${escapeHtml(employee.position_title || "—")}
            ${employee.grade_level ? ` • Ngạch ${escapeHtml(employee.grade_level)}` : ""}
          </p>
          <div class="mt-1">${renderStatusBadge(employee.work_status)}</div>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
        ${detailItem("Mã nhân viên", escapeHtml(employee.employee_code || "—"))}
        ${detailItem("Giới tính", escapeHtml(GENDER_LABELS[employee.gender] || "—"))}
        ${detailItem("Ngày sinh", formatDate(employee.dob))}
        ${detailItem("Số điện thoại", escapeHtml(employee.phone || "—"))}
        ${detailItem("Email", escapeHtml(employee.email || "—"))}
        ${detailItem("CCCD", escapeHtml(employee.citizen_id || "—"))}
        ${detailItem("Phòng ban", `${escapeHtml(employee.department_name || "—")}${employee.department_code ? ` (${escapeHtml(employee.department_code)})` : ""}`)}
        ${detailItem("Chức vụ", escapeHtml(employee.position_title || "—"))}
        ${detailItem("Ngạch bậc", escapeHtml(employee.grade_level || "—"))}
        ${detailItem("Trạng thái FaceID", faceStatusOf(employee) === "ACTIVE" ? "Đã kích hoạt" : "Chưa kích hoạt")}
        ${detailItem("Ngày kích hoạt FaceID", formatDateTime(employee.face_enrolled_at))}
        ${detailItem("Lần Reset gần nhất", employee.face_reset_at ? `${formatDateTime(employee.face_reset_at)} — ${escapeHtml(employee.face_reset_reason || "—")}` : "—")}
        ${detailItem("Lương cơ bản", salary)}
        ${detailItem("Ngày vào làm", formatDate(employee.hire_date))}
        ${detailItem("Ngày nghỉ việc", formatDate(employee.resign_date))}
      </div>

      ${
        state.showSalary
          ? ""
          : `<div class="mt-space-md flex items-start gap-space-sm rounded-lg border border-surface-variant bg-surface-container-low px-space-md py-space-sm font-body-sm text-body-sm text-on-surface-variant">
               <span class="material-symbols-outlined text-[18px]">shield_lock</span>
               <span>Mức lương bị ẩn do tài khoản của bạn không có quyền xem dữ liệu lương.</span>
             </div>`
      }
    `;
  }

  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.body.classList.add("overflow-hidden");
};

const closeEmployeeDetail = () => {
  const modal = document.getElementById("modal-employee-detail");
  if (!modal) return;

  modal.classList.add("hidden");
  modal.classList.remove("flex");
  document.body.classList.remove("overflow-hidden");
};

const openResetFaceModal = (employee) => {
  const modal = document.getElementById("modal-reset-face");
  if (!modal) return;
  state.resetFaceTarget = employee;
  setText("#resetFaceEmployeeInfo", `${employee.employee_code} — ${employee.full_name}`);
  setText("#resetFaceError", "");
  const reason = document.getElementById("resetFaceReason");
  if (reason) reason.value = "";
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.body.classList.add("overflow-hidden");
  reason?.focus();
};

const closeResetFaceModal = () => {
  const modal = document.getElementById("modal-reset-face");
  if (!modal) return;
  state.resetFaceTarget = null;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  document.body.classList.remove("overflow-hidden");
};

const submitResetFace = async (user) => {
  const target = state.resetFaceTarget;
  if (!target) return;
  const reason = document.getElementById("resetFaceReason")?.value.trim() || "";
  setText("#resetFaceError", "");
  if (reason.length < 5 || reason.length > 255) {
    setText("#resetFaceError", "Lý do Reset phải có từ 5 đến 255 ký tự.");
    return;
  }
  const button = document.getElementById("resetFaceConfirm");
  if (button) button.disabled = true;
  try {
    await api.post(`/employees/${target.id}/reset-face`, { reason });
    closeResetFaceModal();
    closeEmployeeDetail();
    showToast("Reset FaceID thành công. Nhân viên có thể đăng ký lại.");
    loadEmployees(user);
  } catch (error) {
    setText("#resetFaceError", error.response?.data?.message || "Không thể Reset FaceID. Vui lòng thử lại.");
  } finally {
    if (button) button.disabled = false;
  }
};

const setLoading = (loading) => {
  const body = document.getElementById("employeesBody");
  if (!body) return;

  if (loading) {
    body.innerHTML = `
      <tr>
        <td class="px-3 py-10 text-center text-on-surface-variant" colspan="10">
          <span class="inline-flex items-center gap-2">
            <span class="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
            Đang tải danh sách nhân sự...
          </span>
        </td>
      </tr>
    `;
  }
};

const buildParams = () => {
  const params = {};

  if (state.keyword) params.keyword = state.keyword;
  if (state.departmentId) params.department_id = state.departmentId;
  if (state.positionId) params.position_id = state.positionId;
  if (state.status && state.status !== "ALL") params.status = state.status;
  if (state.birthMonth) params.birth_month = state.birthMonth;

  return params;
};

const loadEmployees = async (user) => {
  const sequence = ++state.requestSeq;

  setLoading(true);
  hideNotice();

  try {
    const response = await api.get("/employees", { params: buildParams() });
    if (sequence !== state.requestSeq) return;

    const payload = response.data || {};

    state.employees = Array.isArray(payload.employees) ? payload.employees : [];
    state.summary = payload.summary || state.summary;
    state.options = payload.filters || state.options;
    state.showSalary = Boolean(payload.show_salary);
    state.scope = payload.data_scope || "ALL";

    renderDepartmentOptions();
    renderPositionOptions();
    renderSummary();
    renderTable(user);
    renderChips();
    renderHeaderBadges(user, state.employees.length);
    setText(
      "#employeesResultInfo",
      `Hiển thị ${state.employees.length} / ${state.summary.total} nhân sự trong phạm vi`,
    );
    setText(
      "#employeesUpdatedAt",
      `Cập nhật lúc ${new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`,
    );
  } catch (error) {
    if (sequence !== state.requestSeq) return;

    const message =
      error.response?.data?.message ||
      "Không thể tải danh sách nhân sự. Vui lòng thử lại.";

    showNotice(message);
    renderTableError(message);
    setText("#employeesResultInfo", "Không thể tải dữ liệu");
  }
};

const clearFilter = (key) => {
  if (key === "all") {
    state.keyword = "";
    state.departmentId = "";
    state.positionId = "";
    state.birthMonth = "";
    state.status = MODES[state.mode].status;

    const search = document.getElementById("employeeSearch");
    const department = document.getElementById("filterDepartment");
    const position = document.getElementById("filterPosition");
    const status = document.getElementById("filterStatus");
    const birthMonth = document.getElementById("filterBirthMonth");

    if (search) search.value = "";
    if (department) department.value = "";
    if (position) position.value = "";
    if (status) status.value = state.status;
    if (birthMonth) birthMonth.value = "";

    renderPositionOptions();
    return;
  }

  if (key === "keyword") {
    state.keyword = "";
    const input = document.getElementById("employeeSearch");
    if (input) input.value = "";
  }

  if (key === "department") {
    state.departmentId = "";
    state.positionId = "";
    const select = document.getElementById("filterDepartment");
    if (select) select.value = "";
    renderPositionOptions();
  }

  if (key === "position") {
    state.positionId = "";
    const select = document.getElementById("filterPosition");
    if (select) select.value = "";
  }

  if (key === "status") {
    state.status = MODES[state.mode].status;
    const select = document.getElementById("filterStatus");
    if (select) select.value = state.status;
  }

  if (key === "birth") {
    state.birthMonth = "";
    const select = document.getElementById("filterBirthMonth");
    if (select) select.value = "";
  }
};

const bindEvents = (user) => {
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.getAttribute("data-mode");
      if (!MODES[mode]) return;

      state.mode = mode;
      state.status = MODES[mode].status;

      const statusSelect = document.getElementById("filterStatus");
      if (statusSelect) statusSelect.value = state.status;

      if (window.location.hash !== MODE_HASHES[mode]) {
        window.history.replaceState(null, "", MODE_HASHES[mode]);
      }

      applyModeHeader();
      loadEmployees(user);
    });
  });

  document.getElementById("employeeSearch")?.addEventListener("input", (event) => {
    const value = event.target.value;

    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      state.keyword = value.trim();
      loadEmployees(user);
    }, 300);
  });

  document.getElementById("filterDepartment")?.addEventListener("change", (event) => {
    state.departmentId = event.target.value;
    state.positionId = "";

    const positionSelect = document.getElementById("filterPosition");
    if (positionSelect) positionSelect.value = "";

    renderPositionOptions();
    loadEmployees(user);
  });

  document.getElementById("filterPosition")?.addEventListener("change", (event) => {
    state.positionId = event.target.value;
    loadEmployees(user);
  });

  document.getElementById("filterStatus")?.addEventListener("change", (event) => {
    state.status = event.target.value;

    if (state.status === "RESIGNED") state.mode = "resigned";
    else if (state.status === "WORKING" || state.status === "MATERNITY" || state.status === "ACTIVE") {
      state.mode = "working";
    } else {
      state.mode = "all";
    }

    if (window.location.hash !== MODE_HASHES[state.mode]) {
      window.history.replaceState(null, "", MODE_HASHES[state.mode]);
    }

    applyModeHeader();
    loadEmployees(user);
  });

  document.getElementById("filterBirthMonth")?.addEventListener("change", (event) => {
    state.birthMonth = event.target.value;
    loadEmployees(user);
  });

  document.getElementById("btnResetFilters")?.addEventListener("click", () => {
    clearFilter("all");
    loadEmployees(user);
  });

  document.getElementById("btnRefreshEmployees")?.addEventListener("click", () => {
    loadEmployees(user);
  });

  document.getElementById("btnAddEmployee")?.addEventListener("click", () => {
    showToast("Chức năng thêm nhân viên mới sẽ được triển khai ở bước tiếp theo.");
  });

  const tbody = document.getElementById("employeesBody");
  tbody?.addEventListener("click", (event) => {
    const clearButton = event.target.closest("[data-clear-filter]");
    if (clearButton) {
      clearFilter(clearButton.getAttribute("data-clear-filter"));
      loadEmployees(user);
      return;
    }

    const actionButton = event.target.closest("button[data-action]");
    if (!actionButton) return;

    if (actionButton.getAttribute("data-action") === "retry") {
      loadEmployees(user);
      return;
    }

    const employee = state.employees.find(
      (item) => String(item.id) === String(actionButton.getAttribute("data-id")),
    );
    if (!employee) return;

    if (actionButton.getAttribute("data-action") === "view") {
      openEmployeeDetail(employee);
    } else if (actionButton.getAttribute("data-action") === "edit") {
      showToast("Chức năng chỉnh sửa hồ sơ sẽ được triển khai ở bước tiếp theo.");
    } else if (actionButton.getAttribute("data-action") === "reset-face") {
      openResetFaceModal(employee);
    }
  });

  document.getElementById("resetFaceClose")?.addEventListener("click", closeResetFaceModal);
  document.getElementById("resetFaceCancel")?.addEventListener("click", closeResetFaceModal);
  document.getElementById("resetFaceConfirm")?.addEventListener("click", () => submitResetFace(user));
  document.getElementById("modal-reset-face")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeResetFaceModal();
  });

  document.getElementById("employeesChips")?.addEventListener("click", (event) => {
    const clearButton = event.target.closest("[data-clear-filter]");
    if (!clearButton) return;

    clearFilter(clearButton.getAttribute("data-clear-filter"));
    loadEmployees(user);
  });

  document.getElementById("employeeDetailClose")?.addEventListener("click", closeEmployeeDetail);
  document.getElementById("employeeDetailDismiss")?.addEventListener("click", closeEmployeeDetail);

  const modal = document.getElementById("modal-employee-detail");
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) closeEmployeeDetail();
  });

  if (modalKeyHandler) document.removeEventListener("keydown", modalKeyHandler);
  modalKeyHandler = (event) => {
    if (event.key !== "Escape") return;
    if (!document.getElementById("modal-reset-face")?.classList.contains("hidden")) closeResetFaceModal();
    else closeEmployeeDetail();
  };
  document.addEventListener("keydown", modalKeyHandler);
};

export const initEmployees = (user = getCurrentUser(), mode = "all") => {
  if (!user) {
    logout();
    return;
  }

  ensureViewMounted();

  if (!window.__HRM_SPA__) setupShell(user);

  state.mode = MODES[mode] ? mode : "all";
  state.status = MODES[state.mode].status;
  state.keyword = "";
  state.departmentId = "";
  state.positionId = "";
  state.birthMonth = "";

  const statusSelect = document.getElementById("filterStatus");
  if (statusSelect) statusSelect.value = state.status;

  const addButton = document.getElementById("btnAddEmployee");
  if (addButton) addButton.hidden = !hasPermission("HR.PROFILE_MANAGE", user);

  applyModeHeader();
  renderHeaderBadges(user, 0);
  bindEvents(user);
  loadEmployees(user);
};
