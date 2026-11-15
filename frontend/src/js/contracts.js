import contractsHtml from "../pages/contracts.html?raw";
import api from "../services/api.js";
import {
  getCurrentUser,
  hasPermission,
  logout,
} from "../services/auth.service.js";
import { setupShell } from "./home.js";

const STATUS_META = {
  ALL: {
    title: "Tất cả hợp đồng",
    subtitle:
      "Quản lý hợp đồng lao động, thời hạn và mức lương ghi trên hợp đồng.",
    route: "#/hop-dong",
  },
  ACTIVE: {
    title: "Hợp đồng hiện hành",
    subtitle: "Danh sách hợp đồng đang có hiệu lực tại công ty.",
    route: "#/hop-dong/hien-hanh",
  },
  EXPIRING_SOON: {
    title: "Hợp đồng sắp hết hạn",
    subtitle: "Các hợp đồng sắp hết hạn, cần gia hạn hoặc tái ký.",
    route: "#/hop-dong/sap-het-han",
  },
  EXPIRED: {
    title: "Hợp đồng quá hạn",
    subtitle: "Các hợp đồng đã quá ngày kết thúc và cần xử lý.",
    route: "#/hop-dong/qua-han",
  },
  TERMINATED: {
    title: "Hợp đồng đã thanh lý",
    subtitle: "Hồ sơ hợp đồng đã chấm dứt hiệu lực để tra cứu khi cần.",
    route: "#/hop-dong/da-thanh-ly",
  },
};

const STATUS_BADGES = {
  ACTIVE: { label: "Hiện hành", badge: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  EXPIRING_SOON: { label: "Sắp hết hạn", badge: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  EXPIRED: { label: "Quá hạn", badge: "bg-red-50 text-red-700", dot: "bg-red-500" },
  TERMINATED: { label: "Đã thanh lý", badge: "bg-surface-container-high text-on-surface-variant", dot: "bg-outline" },
};

const SCOPE_LABELS = {
  ALL: "Toàn công ty",
  DEPARTMENT: "Phòng ban của tôi",
  SELF: "Chỉ hồ sơ của tôi",
};

const DEFAULT_CONTRACT_TYPES = [
  "Không xác định thời hạn",
  "Xác định thời hạn (12 tháng)",
  "Xác định thời hạn (24 tháng)",
  "Xác định thời hạn (36 tháng)",
  "Hợp đồng thử việc (60 ngày)",
];

const state = {
  status: "ALL",
  keyword: "",
  departmentId: "",
  contractType: "",
  scope: "ALL",
  summary: { total: 0, active: 0, expiring: 0, expired: 0, terminated: 0 },
  options: { departments: [], contract_types: [], employees: [], renewable_contracts: [] },
  contracts: [],
  canManage: false,
  suggestedCode: "",
  formMode: "create",
  formBaseContract: null,
  terminateContract: null,
  detailContract: null,
  requestSeq: 0,
  searchTimer: null,
};

let modalKeyHandler = null;

export const getContractStatusFromHash = (hash = window.location.hash) => {
  if (hash === STATUS_META.ACTIVE.route) return "ACTIVE";
  if (hash === STATUS_META.EXPIRING_SOON.route) return "EXPIRING_SOON";
  if (hash === STATUS_META.EXPIRED.route) return "EXPIRED";
  if (hash === STATUS_META.TERMINATED.route) return "TERMINATED";
  return "ALL";
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
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${new Intl.NumberFormat("vi-VN").format(number)} ₫`;
};

const truncate = (value, length = 60) => {
  const text = String(value ?? "");
  return text.length > length ? `${text.slice(0, length)}…` : text;
};

const todayIso = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toIsoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (isoDate, days) => {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
};

const addMonths = (isoDate, months) => {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1 + months, day);
  if (date.getDate() !== day) date.setDate(0);
  return toIsoDate(date);
};

const isIndefiniteType = (contractType) =>
  String(contractType || "").toLowerCase().includes("không xác định");

const getDefaultEndDate = (startDate, contractType) => {
  if (!startDate || isIndefiniteType(contractType)) return "";
  if (contractType.includes("60 ngày")) return addDays(startDate, 60);

  const monthMatch = contractType.match(/(\d+)\s*tháng/);
  const months = monthMatch ? Number(monthMatch[1]) : 12;
  return addMonths(startDate, months);
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
  const notice = document.getElementById("contractsNotice");
  if (!notice) return;

  notice.className =
    "flex items-start gap-space-sm rounded-lg border border-error/40 bg-error-container text-on-error-container px-space-md py-space-sm font-body-sm text-body-sm";
  notice.innerHTML = `
    <span class="material-symbols-outlined text-[18px]">error</span>
    <span>${escapeHtml(message)}</span>
  `;
};

const hideNotice = () => {
  const notice = document.getElementById("contractsNotice");
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

  const doc = new DOMParser().parseFromString(contractsHtml, "text/html");
  const view = doc.querySelector("main > div");
  const formModal = doc.getElementById("modal-contract-form");
  const terminateModal = doc.getElementById("modal-contract-terminate");
  const detailModal = doc.getElementById("modal-contract-detail");

  main.innerHTML = "";
  document.getElementById("modal-contract-form")?.remove();
  document.getElementById("modal-contract-terminate")?.remove();
  document.getElementById("modal-contract-detail")?.remove();

  if (view) main.appendChild(document.importNode(view, true));
  if (formModal) document.body.appendChild(document.importNode(formModal, true));
  if (terminateModal) {
    document.body.appendChild(document.importNode(terminateModal, true));
  }
  if (detailModal) {
    document.body.appendChild(document.importNode(detailModal, true));
  }
};

const applyStatusHeader = () => {
  const config = STATUS_META[state.status] || STATUS_META.ALL;
  setText("#contractsTitle", config.title);
  setText("#contractsSubtitle", config.subtitle);

  document.querySelectorAll("[data-contract-tab]").forEach((button) => {
    const isActive = button.getAttribute("data-contract-tab") === state.status;
    button.classList.toggle("border-primary-container", isActive);
    button.classList.toggle("border-transparent", !isActive);
    button.classList.toggle("text-primary", isActive);
    button.classList.toggle("text-on-surface-variant", !isActive);
    button.classList.toggle("font-semibold", isActive);
  });

  document.querySelectorAll("[data-contract-status]").forEach((card) => {
    const isActive = card.getAttribute("data-contract-status") === state.status;
    card.classList.toggle("ring-1", isActive);
    card.classList.toggle("ring-primary-container", isActive);
    card.classList.toggle("border-transparent", !isActive);
  });
};

const renderHeaderBadges = (user, total) => {
  setText("#contractsTotalBadge", `${total} hợp đồng`);
  setText("#contractsScopeBadge", `Phạm vi: ${SCOPE_LABELS[state.scope] || "—"}`);
  setText("#contractsRoleBadge", user.role_name || user.role_id || "—");
};

const renderSummary = () => {
  setText("#countContractActive", String(state.summary.active));
  setText("#countContractExpiring", String(state.summary.expiring));
  setText("#countContractExpired", String(state.summary.expired));
  setText("#countContractTerminated", String(state.summary.terminated));
  setText("#countTabAll", String(state.summary.total));
  setText("#countTabActive", String(state.summary.active));
  setText("#countTabExpiring", String(state.summary.expiring));
  setText("#countTabExpired", String(state.summary.expired));
  setText("#countTabTerminated", String(state.summary.terminated));
};

const renderDepartmentOptions = () => {
  const select = document.getElementById("filterContractDepartment");
  if (!select) return;

  const current = state.departmentId;
  select.innerHTML =
    '<option value="">Phòng ban: Tất cả</option>' +
    (state.options.departments || [])
      .map(
        (department) =>
          `<option value="${escapeHtml(department.id)}">${escapeHtml(department.name)}</option>`,
      )
      .join("");

  if ([...select.options].some((option) => option.value === current)) {
    select.value = current;
  }
};

const getContractTypes = () =>
  [...new Set([...(state.options.contract_types || []), ...DEFAULT_CONTRACT_TYPES])];

const renderTypeOptions = () => {
  const select = document.getElementById("filterContractType");
  if (!select) return;

  const current = state.contractType;
  select.innerHTML =
    '<option value="">Loại HĐ: Tất cả</option>' +
    getContractTypes()
      .map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`)
      .join("");

  if ([...select.options].some((option) => option.value === current)) {
    select.value = current;
  }
};

const renderChips = () => {
  const container = document.getElementById("contractsChips");
  if (!container) return;

  const chips = [];
  const clearButton = (key, label) => `
    <button type="button" class="inline-flex items-center gap-1 rounded-full bg-primary-fixed px-2 py-0.5 text-on-primary-fixed hover:opacity-80 transition-opacity" data-clear-contract-filter="${key}">
      <span>${escapeHtml(label)}</span>
      <span class="material-symbols-outlined text-[14px]">close</span>
    </button>
  `;

  if (state.status !== "ALL") {
    chips.push(clearButton("status", `Trạng thái: ${STATUS_META[state.status].title}`));
  }

  if (state.keyword) {
    chips.push(clearButton("keyword", `Từ khóa: ${state.keyword}`));
  }

  if (state.departmentId) {
    const department = (state.options.departments || []).find(
      (item) => String(item.id) === String(state.departmentId),
    );
    chips.push(clearButton("department", `Phòng ban: ${department?.name || state.departmentId}`));
  }

  if (state.contractType) {
    chips.push(clearButton("type", `Loại HĐ: ${state.contractType}`));
  }

  container.innerHTML = `<span class="text-on-surface-variant">Đang lọc theo:</span>${
    chips.length
      ? chips.join("")
      : '<span class="text-on-surface-variant italic">Chưa có bộ lọc bổ sung</span>'
  }`;
};

const renderPermissionControls = () => {
  const buttons = [
    "btnCreateContract",
    "btnRenewContract",
    "btnTerminateContract",
  ];

  buttons.forEach((id) => {
    const button = document.getElementById(id);
    if (button) button.hidden = !state.canManage;
  });
};

const renderRows = () => {
  const tbody = document.getElementById("contractsBody");
  if (!tbody) return;

  if (!state.contracts.length) {
    tbody.innerHTML = `
      <tr>
        <td class="px-3 py-10 text-center text-on-surface-variant" colspan="12">
          <div class="flex flex-col items-center gap-2">
            <span class="material-symbols-outlined text-[34px] text-outline">contract</span>
            <span>Không có hợp đồng phù hợp với bộ lọc hiện tại.</span>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = state.contracts
    .map((contract) => {
      const status = STATUS_BADGES[contract.status] || STATUS_BADGES.TERMINATED;
      const note = contract.note
        ? `<span title="${escapeHtml(contract.note)}">${escapeHtml(truncate(contract.note))}</span>`
        : '<span class="text-on-surface-variant">—</span>';

      const manageActions =
        state.canManage && contract.status !== "TERMINATED"
          ? `<button type="button" class="w-8 h-8 rounded hover:bg-surface-container-high text-primary flex items-center justify-center" data-contract-action="renew" data-contract-id="${escapeHtml(contract.id)}" title="Gia hạn / Tái ký">
              <span class="material-symbols-outlined text-[18px]">autorenew</span>
            </button>
            <button type="button" class="w-8 h-8 rounded hover:bg-error-container text-error flex items-center justify-center" data-contract-action="terminate" data-contract-id="${escapeHtml(contract.id)}" title="Thanh lý hợp đồng">
              <span class="material-symbols-outlined text-[18px]">contract_delete</span>
            </button>`
          : "";

      const actions = `<div class="flex items-center justify-center gap-1">
        <button type="button" class="w-8 h-8 rounded hover:bg-surface-container-high text-primary flex items-center justify-center" data-contract-action="view" data-contract-id="${escapeHtml(contract.id)}" title="Xem chi tiết hợp đồng">
          <span class="material-symbols-outlined text-[18px]">visibility</span>
        </button>
        ${manageActions}
      </div>`;

      return `
        <tr class="cursor-pointer hover:bg-surface-container-low/60 transition-colors" data-contract-id="${escapeHtml(contract.id)}" title="Nhấn để xem chi tiết hợp đồng">
          <td class="px-3 py-3">
            <span class="font-label-md text-label-md font-semibold text-primary">${escapeHtml(contract.contract_code)}</span>
          </td>
          <td class="px-3 py-3 text-on-surface-variant">${escapeHtml(contract.employee_code)}</td>
          <td class="px-3 py-3 font-medium text-on-surface">${escapeHtml(contract.full_name)}</td>
          <td class="px-3 py-3 text-on-surface-variant">${escapeHtml(contract.department_name || "—")}</td>
          <td class="px-3 py-3 text-on-surface-variant">${escapeHtml(contract.contract_type)}</td>
          <td class="px-3 py-3 whitespace-nowrap">${formatDate(contract.start_date)}</td>
          <td class="px-3 py-3 whitespace-nowrap">${formatDate(contract.end_date)}</td>
          <td class="px-3 py-3 text-right whitespace-nowrap">${formatCurrency(contract.signed_salary)}</td>
          <td class="px-3 py-3 text-right whitespace-nowrap">${formatCurrency(contract.insurance_salary)}</td>
          <td class="px-3 py-3 text-center">
            <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-label-sm text-label-sm ${status.badge}">
              <span class="w-1.5 h-1.5 rounded-full ${status.dot}"></span>
              ${status.label}
            </span>
          </td>
          <td class="px-3 py-3 text-on-surface-variant max-w-[220px]">${note}</td>
          <td class="px-3 py-3 text-center">${actions}</td>
        </tr>
      `;
    })
    .join("");
};

const renderTableLoading = () => {
  const tbody = document.getElementById("contractsBody");
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td class="px-3 py-10 text-center text-on-surface-variant" colspan="12">
        <span class="inline-flex items-center gap-2">
          <span class="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin"></span>
          Đang tải danh sách hợp đồng...
        </span>
      </td>
    </tr>
  `;
};

const renderTableError = (message) => {
  const tbody = document.getElementById("contractsBody");
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td class="px-3 py-10 text-center" colspan="12">
        <div class="flex flex-col items-center gap-2 text-error">
          <span class="material-symbols-outlined text-[32px]">error</span>
          <span>${escapeHtml(message)}</span>
          <button type="button" class="mt-2 h-8 px-3 rounded bg-primary text-on-primary font-label-md text-label-md" data-contract-retry>
            Thử lại
          </button>
        </div>
      </td>
    </tr>
  `;
};

const getRenewableContracts = () => {
  const source =
    state.options.renewable_contracts?.length > 0
      ? state.options.renewable_contracts
      : state.contracts.filter(
          (contract) =>
            ["ACTIVE", "EXPIRING_SOON", "EXPIRED"].includes(contract.status),
        );

  return [...source].sort((a, b) =>
    String(a.employee_code).localeCompare(String(b.employee_code)),
  );
};

const getTerminableContracts = () => {
  const map = new Map();

  [...(state.options.renewable_contracts || []), ...state.contracts].forEach(
    (contract) => {
      if (contract.status !== "TERMINATED") map.set(contract.id, contract);
    },
  );

  return [...map.values()].sort((a, b) =>
    String(a.employee_code).localeCompare(String(b.employee_code)),
  );
};

const populateEmployeeOptions = () => {
  const select = document.getElementById("contractEmployee");
  if (!select) return;

  const current = select.value;
  select.innerHTML =
    '<option value="">Chọn nhân viên</option>' +
    (state.options.employees || [])
      .map(
        (employee) =>
          `<option value="${escapeHtml(employee.id)}">${escapeHtml(employee.employee_code)} - ${escapeHtml(employee.full_name)}${
            employee.work_status === "RESIGNED" ? " (đã nghỉ)" : ""
          }</option>`,
      )
      .join("");

  if ([...select.options].some((option) => option.value === current)) {
    select.value = current;
  }
};

const populateFormTypeOptions = () => {
  const select = document.getElementById("contractType");
  if (!select) return;

  const current = select.value;
  select.innerHTML =
    '<option value="">Chọn loại hợp đồng</option>' +
    getContractTypes()
      .map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`)
      .join("");

  if ([...select.options].some((option) => option.value === current)) {
    select.value = current;
  }
};

const populateBaseOptions = () => {
  const select = document.getElementById("contractBase");
  if (!select) return;

  const current = select.value;
  select.innerHTML =
    '<option value="">Chọn hợp đồng</option>' +
    getRenewableContracts()
      .map((contract) => {
        const status = STATUS_BADGES[contract.status] || STATUS_BADGES.TERMINATED;
        return `<option value="${escapeHtml(contract.id)}">${escapeHtml(contract.contract_code)} - ${escapeHtml(contract.employee_code)} - ${escapeHtml(contract.full_name)} (${status.label})</option>`;
      })
      .join("");

  if ([...select.options].some((option) => option.value === current)) {
    select.value = current;
  }
};

const populateTerminateOptions = () => {
  const select = document.getElementById("terminateContractSelect");
  if (!select) return;

  const current = select.value;
  select.innerHTML =
    '<option value="">Chọn hợp đồng</option>' +
    getTerminableContracts()
      .map(
        (contract) =>
          `<option value="${escapeHtml(contract.id)}">${escapeHtml(contract.contract_code)} - ${escapeHtml(contract.employee_code)} - ${escapeHtml(contract.full_name)}</option>`,
      )
      .join("");

  if ([...select.options].some((option) => option.value === current)) {
    select.value = current;
  }
};

const hydrateFormOptions = () => {
  populateEmployeeOptions();
  populateFormTypeOptions();
  populateBaseOptions();
  populateTerminateOptions();
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

const setFormError = (message) => {
  const errorBox = document.getElementById("contractFormError");
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

const setTerminateError = (message) => {
  const errorBox = document.getElementById("terminateError");
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

const syncEndDateState = ({ compute = false } = {}) => {
  const type = document.getElementById("contractType")?.value || "";
  const start = document.getElementById("contractStart")?.value || "";
  const end = document.getElementById("contractEnd");
  if (!end) return;

  if (isIndefiniteType(type)) {
    end.value = "";
    end.disabled = true;
    return;
  }

  end.disabled = false;

  if (compute && start && !end.value) {
    end.value = getDefaultEndDate(start, type);
  }
};

const resetFormFields = () => {
  const fields = [
    "contractBase",
    "contractEmployee",
    "contractCode",
    "contractType",
    "contractStart",
    "contractEnd",
    "contractSalary",
    "contractInsurance",
    "contractNote",
  ];

  fields.forEach((id) => {
    const field = document.getElementById(id);
    if (field) field.value = "";
  });

  const status = document.getElementById("contractStatus");
  if (status) status.value = "ACTIVE";

  const employee = document.getElementById("contractEmployee");
  if (employee) employee.disabled = false;

  const end = document.getElementById("contractEnd");
  if (end) end.disabled = false;
};

const fillCreateForm = () => {
  resetFormFields();
  setFormError("");

  state.formMode = "create";
  state.formBaseContract = null;

  const baseWrap = document.getElementById("contractBaseWrap");
  if (baseWrap) baseWrap.classList.add("hidden");

  const employee = document.getElementById("contractEmployee");
  if (employee) employee.disabled = false;

  const code = document.getElementById("contractCode");
  if (code) code.value = state.suggestedCode || "";

  const type = document.getElementById("contractType");
  if (type) type.value = DEFAULT_CONTRACT_TYPES[1];

  const start = document.getElementById("contractStart");
  if (start) start.value = todayIso();

  syncEndDateState({ compute: true });

  setText("#contractFormTitle", "Tạo hợp đồng mới");
};

const fillRenewFields = (contract, { showBase = false } = {}) => {
  resetFormFields();
  setFormError("");

  state.formMode = "renew";
  state.formBaseContract = contract;

  const baseWrap = document.getElementById("contractBaseWrap");
  if (baseWrap) baseWrap.classList.toggle("hidden", !showBase);

  const base = document.getElementById("contractBase");
  if (base) base.value = showBase ? String(contract.id) : "";

  const employee = document.getElementById("contractEmployee");
  if (employee) {
    employee.value = String(contract.employee_id);
    employee.disabled = true;
  }

  const code = document.getElementById("contractCode");
  if (code) code.value = state.suggestedCode || "";

  const type = document.getElementById("contractType");
  if (type) type.value = contract.contract_type || "";

  const start = document.getElementById("contractStart");
  const startDate = contract.end_date ? addDays(contract.end_date, 1) : todayIso();
  if (start) start.value = startDate;

  const end = document.getElementById("contractEnd");
  if (end) end.value = getDefaultEndDate(startDate, contract.contract_type);

  syncEndDateState();

  const salary = document.getElementById("contractSalary");
  if (salary) salary.value = contract.signed_salary ?? "";

  const insurance = document.getElementById("contractInsurance");
  if (insurance) insurance.value = contract.insurance_salary ?? "";

  const status = document.getElementById("contractStatus");
  if (status) status.value = "ACTIVE";

  const note = document.getElementById("contractNote");
  if (note) note.value = `Gia hạn từ ${contract.contract_code}`;

  setText("#contractFormTitle", "Gia hạn / Tái ký hợp đồng");
};

const openCreateForm = () => {
  hydrateFormOptions();
  fillCreateForm();
  openModal("modal-contract-form");
};

const openRenewForm = (contract) => {
  hydrateFormOptions();
  fillRenewFields(contract, { showBase: false });
  openModal("modal-contract-form");
};

const openRenewPicker = () => {
  hydrateFormOptions();
  fillCreateForm();

  state.formMode = "renew";
  state.formBaseContract = null;

  const baseWrap = document.getElementById("contractBaseWrap");
  if (baseWrap) baseWrap.classList.remove("hidden");

  const employee = document.getElementById("contractEmployee");
  if (employee) employee.disabled = true;

  setText("#contractFormTitle", "Gia hạn / Tái ký hợp đồng");
  openModal("modal-contract-form");
};

const renderTerminateSummary = (contract) => {
  const container = document.getElementById("terminateSummary");
  if (!container) return;

  if (!contract) {
    container.innerHTML =
      '<p class="text-on-surface-variant font-body-sm text-body-sm">Chưa chọn hợp đồng.</p>';
    return;
  }

  const status = STATUS_BADGES[contract.status] || STATUS_BADGES.TERMINATED;

  container.innerHTML = `
    <div class="flex items-start justify-between gap-space-sm">
      <div>
        <p class="font-label-md text-label-md font-semibold text-primary">${escapeHtml(contract.contract_code)}</p>
        <p class="font-body-sm text-body-sm text-on-surface">${escapeHtml(contract.employee_code)} - ${escapeHtml(contract.full_name)}</p>
      </div>
      <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-label-sm text-label-sm ${status.badge}">
        <span class="w-1.5 h-1.5 rounded-full ${status.dot}"></span>
        ${status.label}
      </span>
    </div>
    <div class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1 font-body-sm text-body-sm text-on-surface-variant">
      <span>Loại: ${escapeHtml(contract.contract_type)}</span>
      <span>Thời hạn: ${formatDate(contract.start_date)} - ${formatDate(contract.end_date)}</span>
      <span>Lương ký HĐ: ${formatCurrency(contract.signed_salary)}</span>
      <span>Lương đóng BHXH: ${formatCurrency(contract.insurance_salary)}</span>
    </div>
  `;
};

const openTerminate = (contract) => {
  hydrateFormOptions();
  state.terminateContract = contract;

  const selectWrap = document.getElementById("terminateSelectWrap");
  if (selectWrap) selectWrap.classList.add("hidden");

  const select = document.getElementById("terminateContractSelect");
  if (select) select.value = String(contract.id);

  setTerminateError("");
  renderTerminateSummary(contract);
  openModal("modal-contract-terminate");
};

const openTerminatePicker = () => {
  hydrateFormOptions();
  state.terminateContract = null;

  const selectWrap = document.getElementById("terminateSelectWrap");
  if (selectWrap) selectWrap.classList.remove("hidden");

  const select = document.getElementById("terminateContractSelect");
  if (select) select.value = "";

  setTerminateError("");
  renderTerminateSummary(null);
  openModal("modal-contract-terminate");
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

const getDaysDifference = (isoDate) => {
  if (!isoDate) return null;
  const target = new Date(`${String(isoDate).slice(0, 10)}T00:00:00`);
  const today = new Date(`${todayIso()}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
};

const getDurationText = (startDate, endDate) => {
  if (!startDate || !endDate) return "Không xác định thời hạn";
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "—";
  const days = Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / 86400000),
  );
  return `${days} ngày`;
};

const getRemainingText = (contract) => {
  if (contract.status === "TERMINATED") {
    return {
      label: "Đã thanh lý",
      className: "text-on-surface-variant",
    };
  }

  if (!contract.end_date) {
    return {
      label: "Không thời hạn",
      className: "text-sky-700",
    };
  }

  const days = getDaysDifference(contract.end_date);
  if (days === null) return { label: "—", className: "text-on-surface-variant" };
  if (days < 0) {
    return {
      label: `Quá hạn ${Math.abs(days)} ngày`,
      className: "text-red-600",
    };
  }
  if (days === 0) {
    return { label: "Hết hạn hôm nay", className: "text-red-600" };
  }
  if (days <= 30) {
    return { label: `Còn ${days} ngày`, className: "text-amber-600" };
  }
  return { label: `Còn ${days} ngày`, className: "text-emerald-700" };
};

const renderContractDetail = (contract) => {
  const status = STATUS_BADGES[contract.status] || STATUS_BADGES.TERMINATED;
  const remaining = getRemainingText(contract);
  const employeeMeta = [contract.position_title, contract.department_name]
    .filter(Boolean)
    .join(" • ");

  setText("#contractDetailCode", contract.contract_code);
  setText("#contractDetailTitle", contract.full_name || "Chi tiết hợp đồng");
  setText(
    "#contractDetailSubtitle",
    `${contract.contract_type} • ${contract.department_name || "Chưa xác định phòng ban"}`,
  );

  const statusElement = document.getElementById("contractDetailStatus");
  if (statusElement) {
    statusElement.innerHTML = `<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-label-sm text-label-sm ${status.badge}">
      <span class="w-1.5 h-1.5 rounded-full ${status.dot}"></span>
      ${status.label}
    </span>`;
  }

  const body = document.getElementById("contractDetailBody");
  if (body) {
    body.innerHTML = `
      <div class="flex flex-col gap-space-md">
        <div class="rounded-lg border border-surface-variant bg-surface-container-low p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
          <div class="flex items-center gap-space-md min-w-0">
            <span class="w-12 h-12 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center font-headline-sm text-headline-sm font-bold shrink-0">${escapeHtml(getInitials(contract.full_name))}</span>
            <div class="min-w-0">
              <p class="font-headline-sm text-headline-sm font-bold text-on-surface truncate">${escapeHtml(contract.full_name || "—")}</p>
              <p class="font-body-sm text-body-sm text-on-surface-variant">${escapeHtml(contract.employee_code || "—")}${employeeMeta ? ` • ${escapeHtml(employeeMeta)}` : ""}</p>
              <div class="mt-1 flex flex-wrap items-center gap-space-sm font-label-sm text-label-sm text-on-surface-variant">
                <span class="inline-flex items-center gap-1"><span class="material-symbols-outlined text-[15px]">mail</span>${escapeHtml(contract.email || "—")}</span>
                <span class="inline-flex items-center gap-1"><span class="material-symbols-outlined text-[15px]">call</span>${escapeHtml(contract.phone || "—")}</span>
              </div>
            </div>
          </div>
          <div class="text-left sm:text-right shrink-0">
            <p class="font-label-sm text-label-sm text-on-surface-variant uppercase">Thời hạn còn lại</p>
            <p class="font-headline-sm text-headline-sm font-bold ${remaining.className}">${remaining.label}</p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-space-md">
          <section class="rounded-lg border border-surface-variant overflow-hidden">
            <div class="px-space-md py-space-sm bg-surface-container-low">
              <h4 class="font-label-lg text-label-lg font-bold text-on-surface">Thông tin hợp đồng</h4>
            </div>
            <dl class="p-space-md grid grid-cols-1 sm:grid-cols-2 gap-space-md font-body-sm text-body-sm">
              <div>
                <dt class="font-label-sm text-label-sm text-on-surface-variant uppercase">Mã hợp đồng</dt>
                <dd class="mt-1 font-semibold text-on-surface">${escapeHtml(contract.contract_code)}</dd>
              </div>
              <div>
                <dt class="font-label-sm text-label-sm text-on-surface-variant uppercase">Loại hợp đồng</dt>
                <dd class="mt-1 font-semibold text-on-surface">${escapeHtml(contract.contract_type)}</dd>
              </div>
              <div>
                <dt class="font-label-sm text-label-sm text-on-surface-variant uppercase">Ngày bắt đầu</dt>
                <dd class="mt-1 font-semibold text-on-surface">${formatDate(contract.start_date)}</dd>
              </div>
              <div>
                <dt class="font-label-sm text-label-sm text-on-surface-variant uppercase">Ngày kết thúc</dt>
                <dd class="mt-1 font-semibold text-on-surface">${contract.end_date ? formatDate(contract.end_date) : "Không xác định"}</dd>
              </div>
              <div>
                <dt class="font-label-sm text-label-sm text-on-surface-variant uppercase">Thời hạn hợp đồng</dt>
                <dd class="mt-1 font-semibold text-on-surface">${getDurationText(contract.start_date, contract.end_date)}</dd>
              </div>
              <div>
                <dt class="font-label-sm text-label-sm text-on-surface-variant uppercase">Trạng thái</dt>
                <dd class="mt-1"><span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-label-sm text-label-sm ${status.badge}">${status.label}</span></dd>
              </div>
            </dl>
          </section>

          <section class="rounded-lg border border-surface-variant overflow-hidden">
            <div class="px-space-md py-space-sm bg-surface-container-low">
              <h4 class="font-label-lg text-label-lg font-bold text-on-surface">Thông tin tài chính</h4>
            </div>
            <dl class="p-space-md flex flex-col gap-space-md font-body-sm text-body-sm">
              <div class="flex items-center justify-between gap-space-sm pb-space-sm border-b border-surface-container-high">
                <dt class="text-on-surface-variant">Lương ghi trên hợp đồng</dt>
                <dd class="font-headline-sm text-headline-sm font-bold text-primary">${formatCurrency(contract.signed_salary)}</dd>
              </div>
              <div class="flex items-center justify-between gap-space-sm pb-space-sm border-b border-surface-container-high">
                <dt class="text-on-surface-variant">Lương đóng bảo hiểm</dt>
                <dd class="font-headline-sm text-headline-sm font-bold text-on-surface">${formatCurrency(contract.insurance_salary)}</dd>
              </div>
              <div class="flex items-center justify-between gap-space-sm">
                <dt class="text-on-surface-variant">Phòng ban</dt>
                <dd class="font-semibold text-on-surface text-right">${escapeHtml(contract.department_name || "—")}</dd>
              </div>
              <div class="flex items-center justify-between gap-space-sm">
                <dt class="text-on-surface-variant">Chức vụ</dt>
                <dd class="font-semibold text-on-surface text-right">${escapeHtml(contract.position_title || "—")}</dd>
              </div>
            </dl>
          </section>
        </div>

        <section class="rounded-lg border border-surface-variant p-space-md">
          <h4 class="font-label-lg text-label-lg font-bold text-on-surface mb-1">Ghi chú</h4>
          <p class="whitespace-pre-line font-body-sm text-body-sm text-on-surface-variant">${escapeHtml(contract.note || "Không có ghi chú.")}</p>
        </section>
      </div>
    `;
  }

  const canAct = state.canManage && contract.status !== "TERMINATED";
  const renewButton = document.getElementById("contractDetailRenew");
  const terminateButton = document.getElementById("contractDetailTerminate");

  for (const button of [renewButton, terminateButton]) {
    if (!button) continue;
    button.hidden = !canAct;
    button.classList.toggle("hidden", !canAct);
    button.classList.toggle("flex", canAct);
  }
};

const closeContractDetail = () => {
  state.detailContract = null;
  closeModal("modal-contract-detail");
};

const openContractDetail = (contractId) => {
  const contract = state.contracts.find(
    (item) => String(item.id) === String(contractId),
  );
  if (!contract) return;

  state.detailContract = contract;
  renderContractDetail(contract);
  openModal("modal-contract-detail");
};

const loadContracts = async (user) => {
  const sequence = ++state.requestSeq;
  hideNotice();
  renderTableLoading();

  try {
    const params = {};

    if (state.status !== "ALL") params.status = state.status;
    if (state.keyword) params.keyword = state.keyword;
    if (state.departmentId) params.department_id = state.departmentId;
    if (state.contractType) params.contract_type = state.contractType;

    const response = await api.get("/contracts", { params });

    if (sequence !== state.requestSeq) return;

    const payload = response.data || {};

    state.contracts = Array.isArray(payload.contracts) ? payload.contracts : [];
    state.summary = payload.summary || state.summary;
    state.options = payload.filters || state.options;
    state.scope = payload.data_scope || "ALL";
    state.suggestedCode = payload.suggested_contract_code || state.suggestedCode;
    state.canManage =
      Boolean(payload.can_manage) &&
      hasPermission("HR.CONTRACT_MANAGE", user) &&
      hasPermission("HR.PROFILE_MANAGE", user);

    renderDepartmentOptions();
    renderTypeOptions();
    renderSummary();
    renderRows();
    renderChips();
    renderPermissionControls();
    hydrateFormOptions();
    renderHeaderBadges(user, state.contracts.length);
    applyStatusHeader();

    setText(
      "#contractsResultInfo",
      `Hiển thị ${state.contracts.length} / ${state.summary.total} hợp đồng trong phạm vi`,
    );
    setText(
      "#contractsUpdatedAt",
      `Cập nhật lúc ${new Date().toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      })}`,
    );
  } catch (error) {
    if (sequence !== state.requestSeq) return;

    const message =
      error.response?.data?.message ||
      "Không thể tải danh sách hợp đồng. Vui lòng thử lại.";

    showNotice(message);
    renderTableError(message);
    setText("#contractsResultInfo", "Không thể tải dữ liệu");
  }
};

const setStatus = (user, status) => {
  if (!STATUS_META[status]) return;

  state.status = status;

  const route = STATUS_META[status].route;
  if (window.location.hash !== route) {
    window.history.replaceState(null, "", route);
  }

  applyStatusHeader();
  loadContracts(user);
};

const clearFilter = (user, key) => {
  if (key === "all" || key === "status") {
    state.keyword = "";
    state.departmentId = "";
    state.contractType = "";

    const search = document.getElementById("contractSearch");
    const department = document.getElementById("filterContractDepartment");
    const type = document.getElementById("filterContractType");

    if (search) search.value = "";
    if (department) department.value = "";
    if (type) type.value = "";

    renderDepartmentOptions();
    renderTypeOptions();
    setStatus(user, "ALL");
    return;
  }

  if (key === "keyword") {
    state.keyword = "";
    const input = document.getElementById("contractSearch");
    if (input) input.value = "";
  }

  if (key === "department") {
    state.departmentId = "";
    const select = document.getElementById("filterContractDepartment");
    if (select) select.value = "";
  }

  if (key === "type") {
    state.contractType = "";
    const select = document.getElementById("filterContractType");
    if (select) select.value = "";
  }

  loadContracts(user);
};

const submitContractForm = async (event, user) => {
  event.preventDefault();

  const submitButton = document.getElementById("contractFormSubmit");
  const originalHtml = submitButton?.innerHTML || "";
  const employeeId = document.getElementById("contractEmployee")?.value;
  const contractCode = document.getElementById("contractCode")?.value.trim();
  const contractType = document.getElementById("contractType")?.value;
  const startDate = document.getElementById("contractStart")?.value;
  const endDate = document.getElementById("contractEnd")?.value;
  const signedSalary = document.getElementById("contractSalary")?.value;
  const insuranceSalary = document.getElementById("contractInsurance")?.value;
  const status = document.getElementById("contractStatus")?.value;
  const note = document.getElementById("contractNote")?.value.trim();

  if (state.formMode === "renew" && !state.formBaseContract) {
    setFormError("Vui lòng chọn hợp đồng cần gia hạn hoặc tái ký.");
    return;
  }

  if (!employeeId) return setFormError("Vui lòng chọn nhân viên ký hợp đồng.");
  if (!contractCode) return setFormError("Mã hợp đồng không được để trống.");
  if (!contractType) return setFormError("Vui lòng chọn loại hợp đồng.");
  if (!startDate) return setFormError("Vui lòng chọn ngày bắt đầu.");
  if (!isIndefiniteType(contractType) && !endDate) {
    return setFormError("Vui lòng chọn ngày kết thúc của hợp đồng.");
  }
  if (endDate && endDate < startDate) {
    return setFormError("Ngày kết thúc phải sau ngày bắt đầu.");
  }
  if (signedSalary === "" || Number(signedSalary) < 0) {
    return setFormError("Lương ký hợp đồng không hợp lệ.");
  }
  if (insuranceSalary === "" || Number(insuranceSalary) < 0) {
    return setFormError("Lương đóng BHXH không hợp lệ.");
  }

  const payload = {
    employee_id: Number(employeeId),
    contract_code: contractCode,
    contract_type: contractType,
    start_date: startDate,
    end_date: isIndefiniteType(contractType) ? null : endDate,
    signed_salary: Number(signedSalary),
    insurance_salary: Number(insuranceSalary),
    status,
    note: note || null,
  };

  if (state.formMode === "renew" && state.formBaseContract) {
    payload.replaces_contract_id = state.formBaseContract.id;
  }

  try {
    setFormError("");
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.innerHTML =
        '<span class="w-4 h-4 rounded-full border-2 border-on-primary border-t-transparent animate-spin"></span><span>Đang lưu...</span>';
    }

    await api.post("/contracts", payload);

    closeModal("modal-contract-form");
    showToast(
      state.formMode === "renew"
        ? "Đã tạo hợp đồng gia hạn thành công"
        : "Đã tạo hợp đồng lao động thành công",
    );
    await loadContracts(user);
  } catch (error) {
    setFormError(
      error.response?.data?.message ||
        "Không thể lưu hợp đồng. Vui lòng kiểm tra lại dữ liệu.",
    );
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML = originalHtml;
    }
  }
};

const confirmTerminate = async (user) => {
  if (!state.terminateContract) {
    setTerminateError("Vui lòng chọn hợp đồng cần thanh lý.");
    return;
  }

  const button = document.getElementById("terminateConfirm");
  const originalHtml = button?.innerHTML || "";

  try {
    setTerminateError("");

    if (button) {
      button.disabled = true;
      button.innerHTML =
        '<span class="w-4 h-4 rounded-full border-2 border-on-error border-t-transparent animate-spin"></span><span>Đang xử lý...</span>';
    }

    await api.put(`/contracts/${state.terminateContract.id}/terminate`);

    closeModal("modal-contract-terminate");
    showToast("Đã thanh lý hợp đồng lao động");
    state.terminateContract = null;
    await loadContracts(user);
  } catch (error) {
    setTerminateError(
      error.response?.data?.message ||
        "Không thể thanh lý hợp đồng. Vui lòng thử lại.",
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }
};

const bindEvents = (user) => {
  document.querySelectorAll("[data-contract-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      setStatus(user, button.getAttribute("data-contract-tab"));
    });
  });

  document.querySelectorAll("[data-contract-status]").forEach((card) => {
    card.addEventListener("click", () => {
      setStatus(user, card.getAttribute("data-contract-status"));
    });
  });

  document.getElementById("contractSearch")?.addEventListener("input", (event) => {
    const value = event.target.value;

    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      state.keyword = value.trim();
      loadContracts(user);
    }, 300);
  });

  document
    .getElementById("filterContractDepartment")
    ?.addEventListener("change", (event) => {
      state.departmentId = event.target.value;
      loadContracts(user);
    });

  document
    .getElementById("filterContractType")
    ?.addEventListener("change", (event) => {
      state.contractType = event.target.value;
      loadContracts(user);
    });

  document
    .getElementById("btnResetContractFilters")
    ?.addEventListener("click", () => clearFilter(user, "all"));

  document
    .getElementById("btnRefreshContracts")
    ?.addEventListener("click", () => loadContracts(user));

  document
    .getElementById("btnCreateContract")
    ?.addEventListener("click", openCreateForm);

  document
    .getElementById("btnRenewContract")
    ?.addEventListener("click", openRenewPicker);

  document
    .getElementById("btnTerminateContract")
    ?.addEventListener("click", openTerminatePicker);

  document.getElementById("contractsChips")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-clear-contract-filter]");
    if (!button) return;
    clearFilter(user, button.getAttribute("data-clear-contract-filter"));
  });

  document.getElementById("contractsBody")?.addEventListener("click", (event) => {
    if (event.target.closest("[data-contract-retry]")) {
      loadContracts(user);
      return;
    }

    const button = event.target.closest("[data-contract-action]");
    const row = event.target.closest("tr[data-contract-id]");
    const contractId = button
      ? button.getAttribute("data-contract-id")
      : row?.getAttribute("data-contract-id");

    if (!contractId) return;

    const contract = [
      ...state.contracts,
      ...(state.options.renewable_contracts || []),
    ].find((item) => String(item.id) === String(contractId));
    if (!contract) return;

    const action = button?.getAttribute("data-contract-action") || "view";

    if (action === "view") {
      openContractDetail(contract.id);
    } else if (action === "renew") {
      closeContractDetail();
      openRenewForm(contract);
    } else {
      closeContractDetail();
      openTerminate(contract);
    }
  });

  document.getElementById("contractForm")?.addEventListener("submit", (event) => {
    submitContractForm(event, user);
  });

  document.getElementById("contractType")?.addEventListener("change", () => {
    syncEndDateState({ compute: true });
  });

  document.getElementById("contractStart")?.addEventListener("change", () => {
    syncEndDateState({ compute: true });
  });

  document.getElementById("contractBase")?.addEventListener("change", (event) => {
    const contract = getRenewableContracts().find(
      (item) => String(item.id) === String(event.target.value),
    );

    if (!contract) {
      state.formBaseContract = null;
      return;
    }

    fillRenewFields(contract, { showBase: true });
  });

  document
    .getElementById("terminateContractSelect")
    ?.addEventListener("change", (event) => {
      const contract = getTerminableContracts().find(
        (item) => String(item.id) === String(event.target.value),
      );

      state.terminateContract = contract || null;
      renderTerminateSummary(contract);
    });

  document
    .getElementById("contractFormClose")
    ?.addEventListener("click", () => closeModal("modal-contract-form"));
  document
    .getElementById("contractFormCancel")
    ?.addEventListener("click", () => closeModal("modal-contract-form"));
  document
    .getElementById("terminateClose")
    ?.addEventListener("click", () => closeModal("modal-contract-terminate"));
  document
    .getElementById("terminateCancel")
    ?.addEventListener("click", () => closeModal("modal-contract-terminate"));
  document
    .getElementById("terminateConfirm")
    ?.addEventListener("click", () => confirmTerminate(user));

  document
    .getElementById("contractDetailClose")
    ?.addEventListener("click", closeContractDetail);
  document
    .getElementById("contractDetailDismiss")
    ?.addEventListener("click", closeContractDetail);
  document
    .getElementById("contractDetailRenew")
    ?.addEventListener("click", () => {
      const contract = state.detailContract;
      if (!contract) return;
      closeContractDetail();
      openRenewForm(contract);
    });
  document
    .getElementById("contractDetailTerminate")
    ?.addEventListener("click", () => {
      const contract = state.detailContract;
      if (!contract) return;
      closeContractDetail();
      openTerminate(contract);
    });

  document.getElementById("modal-contract-form")?.addEventListener("click", (event) => {
    if (event.target.id === "modal-contract-form") closeModal("modal-contract-form");
  });

  document
    .getElementById("modal-contract-terminate")
    ?.addEventListener("click", (event) => {
      if (event.target.id === "modal-contract-terminate") {
        closeModal("modal-contract-terminate");
      }
    });

  document
    .getElementById("modal-contract-detail")
    ?.addEventListener("click", (event) => {
      if (event.target.id === "modal-contract-detail") {
        closeContractDetail();
      }
    });

  if (modalKeyHandler) document.removeEventListener("keydown", modalKeyHandler);
  modalKeyHandler = (event) => {
    if (event.key !== "Escape") return;
    closeModal("modal-contract-form");
    closeModal("modal-contract-terminate");
    closeContractDetail();
  };
  document.addEventListener("keydown", modalKeyHandler);
};

export const initContracts = (user = getCurrentUser(), status = "ALL") => {
  if (!user) {
    logout();
    return;
  }

  ensureViewMounted();

  if (!window.__HRM_SPA__) setupShell(user);

  state.status = STATUS_META[status] ? status : "ALL";
  state.keyword = "";
  state.departmentId = "";
  state.contractType = "";
  state.canManage =
    hasPermission("HR.CONTRACT_MANAGE", user) &&
    hasPermission("HR.PROFILE_MANAGE", user);

  const search = document.getElementById("contractSearch");
  const department = document.getElementById("filterContractDepartment");
  const type = document.getElementById("filterContractType");

  if (search) search.value = "";
  if (department) department.value = "";
  if (type) type.value = "";

  applyStatusHeader();
  renderHeaderBadges(user, 0);
  renderPermissionControls();
  bindEvents(user);
  loadContracts(user);
};
