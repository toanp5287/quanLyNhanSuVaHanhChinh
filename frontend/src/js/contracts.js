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
  PENDING_APPROVAL: {
    title: "Hợp đồng chờ Giám đốc duyệt",
    subtitle: "Danh sách hợp đồng đã được HR gửi và đang chờ quyết định.",
    route: "#/hop-dong/cho-duyet",
  },
  REJECTED: {
    title: "Hợp đồng bị Giám đốc từ chối",
    subtitle: "Danh sách hợp đồng cần HR chỉnh sửa và gửi duyệt lại.",
    route: "#/hop-dong/bi-tu-choi",
  },
  PENDING_SIGN: {
    title: "Hợp đồng chờ ký chính thức",
    subtitle: "Danh sách hợp đồng đã được Giám đốc phê duyệt và chờ người có thẩm quyền ký.",
    route: "#/hop-dong/cho-ky",
  },
  SIGNED: {
    title: "Hợp đồng đã ký chính thức",
    subtitle: "Danh sách hợp đồng đã hoàn tất ký nội bộ và lưu bản chính thức.",
    route: "#/hop-dong/da-ky",
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
  DRAFT: { label: "Bản nháp", badge: "bg-surface-container-high text-on-surface-variant", dot: "bg-outline" },
  PENDING_APPROVAL: { label: "Chờ duyệt", badge: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  REJECTED: { label: "Bị từ chối", badge: "bg-red-50 text-red-700", dot: "bg-red-500" },
  APPROVED: { label: "Chờ ký", badge: "bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  SIGNED: { label: "Đã ký", badge: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  ACTIVE: { label: "Hiện hành", badge: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  EXPIRING_SOON: { label: "Sắp hết hạn", badge: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  EXPIRED: { label: "Quá hạn", badge: "bg-red-50 text-red-700", dot: "bg-red-500" },
  TERMINATED: { label: "Đã thanh lý", badge: "bg-surface-container-high text-on-surface-variant", dot: "bg-outline" },
};

const APPROVAL_ACTION_META = {
  CREATE: { label: "Tạo hợp đồng", badge: "bg-surface-container-high text-on-surface-variant", dot: "bg-outline" },
  EDIT_SAVE_DOCX: { label: "Lưu chỉnh sửa DOCX", badge: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  SUBMIT_APPROVAL: { label: "Gửi duyệt", badge: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  DIRECTOR_APPROVE: { label: "Giám đốc phê duyệt", badge: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  DIRECTOR_REJECT: { label: "Giám đốc từ chối", badge: "bg-red-50 text-red-700", dot: "bg-red-500" },
  SIGN_OFFICIAL: { label: "Ký chính thức", badge: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  SIGN_REVISION_REQUEST: { label: "Yêu cầu chỉnh sửa sau duyệt", badge: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  TERMINATE: { label: "Thanh lý hợp đồng", badge: "bg-surface-container-high text-on-surface-variant", dot: "bg-outline" },
  FILE_UPLOAD: { label: "Upload file hợp đồng", badge: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  FILE_REPLACE: { label: "Thay thế file hợp đồng", badge: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  FILE_DELETE: { label: "Xóa file hợp đồng", badge: "bg-red-50 text-red-700", dot: "bg-red-500" },
};

const APPROVAL_STATE_META = {
  DRAFT: { label: "Bản nháp", badge: "bg-surface-container-high text-on-surface-variant" },
  REWORK_REQUIRED: { label: "Chờ gửi lại", badge: "bg-amber-50 text-amber-700" },
  PENDING_APPROVAL: { label: "Đang chờ duyệt", badge: "bg-blue-50 text-blue-700" },
  REJECTED: { label: "Bị từ chối", badge: "bg-red-50 text-red-700" },
  APPROVED: { label: "Chờ ký chính thức", badge: "bg-sky-50 text-sky-700" },
  SIGNED: { label: "Đã ký chính thức", badge: "bg-emerald-50 text-emerald-700" },
};

const getApprovalDisplayState = (approval) =>
  approval?.reworkRequired && approval?.state === "DRAFT"
    ? "REWORK_REQUIRED"
    : approval?.state || "DRAFT";

const SUBMISSION_STATUS_META = {
  PENDING_APPROVAL: { label: "Đang chờ duyệt", badge: "bg-blue-50 text-blue-700" },
  APPROVED: { label: "Đã duyệt", badge: "bg-emerald-50 text-emerald-700" },
  REJECTED: { label: "Bị từ chối", badge: "bg-red-50 text-red-700" },
  SUPERSEDED: { label: "Đã thay thế", badge: "bg-surface-container-high text-on-surface-variant" },
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

const DRAFT_CONTRACT_TYPES = [
  { value: "INTERNSHIP", label: "Hợp đồng thực tập" },
  { value: "PROBATION", label: "Hợp đồng thử việc" },
  { value: "FIXED_TERM", label: "Hợp đồng xác định thời hạn" },
  { value: "INDEFINITE", label: "Hợp đồng không xác định thời hạn" },
];

const TEMPLATE_DOWNLOAD_NAMES = {
  INTERNSHIP: "Mau_hop_dong_thuc_tap.docx",
  PROBATION: "Mau_hop_dong_thu_viec.docx",
  FIXED_TERM: "Mau_hop_dong_xac_dinh_thoi_han.docx",
  INDEFINITE: "Mau_hop_dong_khong_xac_dinh_thoi_han.docx",
};

const state = {
  status: "ALL",
  keyword: "",
  departmentId: "",
  contractType: "",
  scope: "ALL",
  summary: { total: 0, active: 0, expiring: 0, expired: 0, terminated: 0, pending: 0, rejected: 0, pending_sign: 0, signed: 0 },
  options: { departments: [], contract_types: [], employees: [], renewable_contracts: [] },
  contracts: [],
  canManage: false,
  canApprove: false,
  canSign: false,
  currentUser: null,
  reviewDecision: "APPROVE",
  suggestedCode: "",
  formMode: "create",
  formBaseContract: null,
  contractTemplates: [],
  templatePreview: null,
  selectedEmployee: null,
  creationMethod: "FROM_TEMPLATE",
  templateUploadReplace: false,
  terminateContract: null,
  detailContract: null,
  detailFile: null,
  detailHistory: [],
  detailSubmissions: [],
  detailVersions: [],
  detailApproval: null,
  detailPermissions: null,
  detailSigning: null,
  detailTab: "info",
  detailViewer: {
    type: null,
    mode: "view",
    url: null,
    page: 1,
    pages: 1,
    scale: 1,
    loading: false,
    error: "",
  },
  detailDocEditor: null,
  detailOnlyOfficeScript: "",
  templateEditor: { scriptUrl: "", editor: null, generation: 0 },
  detailLoading: false,
  detailError: "",
  detailLoadSeq: 0,
  requestSeq: 0,
  searchTimer: null,
};

let modalKeyHandler = null;
let contractOpenHandlerBound = false;

export const getContractStatusFromHash = (hash = window.location.hash) => {
  if (hash === STATUS_META.PENDING_APPROVAL.route) return "PENDING_APPROVAL";
  if (hash === STATUS_META.REJECTED.route) return "REJECTED";
  if (hash === STATUS_META.PENDING_SIGN.route) return "PENDING_SIGN";
  if (hash === STATUS_META.SIGNED.route) return "SIGNED";
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

const isIndefiniteType = (contractType) => {
  const value = String(contractType || "").trim().toUpperCase();
  return (
    value === "INDEFINITE" ||
    value === "FREELANCE" ||
    value.toLowerCase().includes("không xác định")
  );
};

const getDefaultEndDate = (startDate, contractType) => {
  if (!startDate || isIndefiniteType(contractType)) return "";

  const value = String(contractType || "").trim().toUpperCase();
  if (value === "PROBATION" || contractType.includes("60 ngày")) {
    return addDays(startDate, 60);
  }
  if (value === "INTERNSHIP") return addMonths(startDate, 3);
  if (value === "FIXED_TERM_3Y") return addMonths(startDate, 36);
  if (value === "FIXED_TERM" || value === "FIXED_TERM_1Y") {
    return addMonths(startDate, 12);
  }

  const monthMatch = String(contractType).match(/(\d+)\s*tháng/);
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
  const signModal = doc.getElementById("modal-contract-sign");
  const signingRevisionModal = doc.getElementById("modal-contract-signing-revision");

  state.templateEditor.generation += 1;
  destroyTemplateEditor();
  main.innerHTML = "";
  document.getElementById("modal-contract-form")?.remove();
  document.getElementById("modal-contract-terminate")?.remove();
  document.getElementById("modal-contract-detail")?.remove();
  document.getElementById("modal-contract-sign")?.remove();
  document.getElementById("modal-contract-signing-revision")?.remove();

  if (view) main.appendChild(document.importNode(view, true));
  if (formModal) document.body.appendChild(document.importNode(formModal, true));
  if (terminateModal) {
    document.body.appendChild(document.importNode(terminateModal, true));
  }
  if (detailModal) {
    document.body.appendChild(document.importNode(detailModal, true));
  }
  if (signModal) {
    document.body.appendChild(document.importNode(signModal, true));
  }
  if (signingRevisionModal) {
    document.body.appendChild(document.importNode(signingRevisionModal, true));
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
  setText("#countContractPending", String(state.summary.pending || 0));
  setText("#countContractRejected", String(state.summary.rejected || 0));
  setText("#countContractPendingSign", String(state.summary.pending_sign || 0));
  setText("#countContractSigned", String(state.summary.signed || 0));
  setText("#countTabAll", String(state.summary.total));
  setText("#countTabActive", String(state.summary.active));
  setText("#countTabExpiring", String(state.summary.expiring));
  setText("#countTabExpired", String(state.summary.expired));
  setText("#countTabTerminated", String(state.summary.terminated));
  setText("#countTabPending", String(state.summary.pending || 0));
  setText("#countTabRejected", String(state.summary.rejected || 0));
  setText("#countTabPendingSign", String(state.summary.pending_sign || 0));
  setText("#countTabSigned", String(state.summary.signed || 0));
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

  const pendingCard = document.getElementById("contractPendingCard");
  if (pendingCard) {
    pendingCard.classList.toggle("hidden", !state.canApprove);
  }

  const pendingTab = document.getElementById("contractPendingTab");
  if (pendingTab) {
    pendingTab.classList.toggle("hidden", !state.canApprove);
  }

  const rejectedCard = document.getElementById("contractRejectedCard");
  if (rejectedCard) {
    rejectedCard.classList.toggle("hidden", !state.canManage);
  }

  const rejectedTab = document.getElementById("contractRejectedTab");
  if (rejectedTab) {
    rejectedTab.classList.toggle("hidden", !state.canManage);
  }

  const pendingSignCard = document.getElementById("contractPendingSignCard");
  if (pendingSignCard) {
    pendingSignCard.classList.toggle("hidden", !state.canSign);
  }

  const pendingSignTab = document.getElementById("contractPendingSignTab");
  if (pendingSignTab) {
    pendingSignTab.classList.toggle("hidden", !state.canSign);
  }

  const signedCard = document.getElementById("contractSignedCard");
  if (signedCard) {
    signedCard.classList.toggle("hidden", !state.canSign);
  }

  const signedTab = document.getElementById("contractSignedTab");
  if (signedTab) {
    signedTab.classList.toggle("hidden", !state.canSign);
  }
};

const renderRows = () => {
  const tbody = document.getElementById("contractsBody");
  if (!tbody) return;

  if (!state.contracts.length) {
    tbody.innerHTML = `
      <tr>
        <td class="px-3 py-10 text-center text-on-surface-variant" colspan="13">
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
      const approvalStatus = contract.approval_status || "DRAFT";
      const isPending = approvalStatus === "PENDING_APPROVAL";
      const isPendingSign = approvalStatus === "APPROVED";
      const isSigned = approvalStatus === "SIGNED";
      const statusKey = ["PENDING_APPROVAL", "REJECTED", "APPROVED", "SIGNED"].includes(
        approvalStatus,
      )
        ? approvalStatus
        : contract.status;
      const status = STATUS_BADGES[statusKey] || STATUS_BADGES.TERMINATED;
      const isRejected = approvalStatus === "REJECTED";
      const note = contract.note
        ? `<span title="${escapeHtml(contract.note)}">${escapeHtml(truncate(contract.note))}</span>`
        : '<span class="text-on-surface-variant">—</span>';
      const rejectionNote = isRejected
        ? `<div class="mt-1 text-error font-label-sm text-label-sm" title="${escapeHtml(contract.rejection_reason || "")}">Lý do: ${escapeHtml(truncate(contract.rejection_reason || "—"))}</div>
           ${contract.revision_request ? `<div class="mt-0.5 text-amber-700 font-label-sm text-label-sm" title="${escapeHtml(contract.revision_request)}">Yêu cầu: ${escapeHtml(truncate(contract.revision_request))}</div>` : ""}`
        : "";
      const submittedCell = isPending
        ? `<div class="whitespace-nowrap">${escapeHtml(formatDateTime(contract.submitted_at))}</div>
           <div class="mt-1 font-label-sm text-label-sm text-blue-700">Vòng ${escapeHtml(contract.approval_round || 1)}${contract.submitted_by_name ? ` • ${escapeHtml(contract.submitted_by_name)}` : ""}</div>`
        : isPendingSign
          ? `<div class="whitespace-nowrap">${escapeHtml(formatDateTime(contract.approved_at))}</div>
             <div class="mt-1 font-label-sm text-label-sm text-sky-700">Đã duyệt${contract.approver_name ? ` • ${escapeHtml(contract.approver_name)}` : ""}</div>`
          : isSigned
            ? `<div class="whitespace-nowrap">${escapeHtml(formatDateTime(contract.signed_at))}</div>
               <div class="mt-1 font-label-sm text-label-sm text-emerald-700">${escapeHtml(contract.signed_by_name || "Đã ký")}${contract.signed_version_no ? ` • v${escapeHtml(contract.signed_version_no)}` : ""}</div>`
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

      const reviewAction =
        state.canApprove && isPending
          ? `<button type="button" class="w-8 h-8 rounded hover:bg-primary-fixed text-primary flex items-center justify-center" data-contract-action="review" data-contract-id="${escapeHtml(contract.id)}" title="Phê duyệt hợp đồng">
              <span class="material-symbols-outlined text-[18px]">fact_check</span>
            </button>`
          : "";

      const reworkAction =
        state.canManage && isRejected
          ? `<button type="button" class="w-8 h-8 rounded hover:bg-amber-50 text-amber-700 flex items-center justify-center" data-contract-action="rework" data-contract-id="${escapeHtml(contract.id)}" title="Chỉnh sửa theo yêu cầu">
              <span class="material-symbols-outlined text-[18px]">edit_document</span>
            </button>`
          : "";

      const signAction =
        state.canSign && isPendingSign && !contract.signed_at
          ? `<button type="button" class="w-8 h-8 rounded hover:bg-emerald-50 text-emerald-700 flex items-center justify-center" data-contract-action="sign" data-contract-id="${escapeHtml(contract.id)}" title="Ký chính thức hợp đồng">
              <span class="material-symbols-outlined text-[18px]">draw</span>
            </button>`
          : "";

      const actions = `<div class="flex items-center justify-center gap-1">
        <button type="button" class="w-8 h-8 rounded hover:bg-surface-container-high text-primary flex items-center justify-center" data-contract-action="view" data-contract-id="${escapeHtml(contract.id)}" title="Xem chi tiết hợp đồng">
          <span class="material-symbols-outlined text-[18px]">visibility</span>
        </button>
        ${reworkAction}
        ${reviewAction}
        ${signAction}
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
          <td class="px-3 py-3">${submittedCell}</td>
          <td class="px-3 py-3 text-right whitespace-nowrap">${formatCurrency(contract.signed_salary)}</td>
          <td class="px-3 py-3 text-right whitespace-nowrap">${formatCurrency(contract.insurance_salary)}</td>
          <td class="px-3 py-3 text-center">
            <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-label-sm text-label-sm ${status.badge}">
              <span class="w-1.5 h-1.5 rounded-full ${status.dot}"></span>
              ${status.label}
            </span>
          </td>
          <td class="px-3 py-3 text-on-surface-variant max-w-[220px]">${note}${rejectionNote}</td>
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
      <td class="px-3 py-10 text-center text-on-surface-variant" colspan="13">
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
      <td class="px-3 py-10 text-center" colspan="13">
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
          `<option value="${escapeHtml(employee.id)}" data-employee-code="${escapeHtml(employee.employee_code)}">${escapeHtml(employee.employee_code)} - ${escapeHtml(employee.full_name)}${
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
  const options =
    state.formMode === "create"
      ? DRAFT_CONTRACT_TYPES.map((type) => ({ value: type.value, label: type.label }))
      : getContractTypes().map((type) => ({ value: type, label: type }));

  select.innerHTML =
    '<option value="">Chọn loại hợp đồng</option>' +
    options
      .map(
        (type) =>
          `<option value="${escapeHtml(type.value)}">${escapeHtml(type.label)}</option>`,
      )
      .join("");

  if ([...select.options].some((option) => option.value === current)) {
    select.value = current;
  }
};

const EMPLOYEE_INFO_FIELDS = [
  ["contractEmployeeCode", "employee_code"],
  ["contractEmployeeName", "full_name"],
  ["contractDob", "dob"],
  ["contractAddress", "address"],
  ["contractPhone", "phone"],
  ["contractEmail", "email"],
  ["contractDepartmentName", "department_name"],
  ["contractPositionName", "position_title"],
];

const normalizeGender = (value) => {
  const gender = String(value || "").trim().toUpperCase();
  if (["MALE", "NAM", "M"].includes(gender)) return "MALE";
  if (["FEMALE", "NU", "NỮ", "F"].includes(gender)) return "FEMALE";
  if (["OTHER", "KHAC", "KHÁC", "O"].includes(gender)) return "OTHER";
  return "";
};

const applyEmployeeSelection = (employeeId) => {
  const employee = (state.options.employees || []).find(
    (item) => String(item.id) === String(employeeId),
  );

  state.selectedEmployee = employee || null;

  EMPLOYEE_INFO_FIELDS.forEach(([elementId, field]) => {
    const element = document.getElementById(elementId);
    if (element) element.value = employee?.[field] || "";
  });

  const gender = document.getElementById("contractGender");
  if (gender) gender.value = normalizeGender(employee?.gender);

  const hint = document.getElementById("contractEmployeeInfoHint");
  if (hint) {
    hint.textContent = employee
      ? "Đã điền từ hồ sơ nhân sự, có thể bổ sung nếu thiếu"
      : "Tự động điền từ hồ sơ nhân sự";
  }

  setFormError("");
};

const formatFileSize = (bytes) => {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
};

const estimatePdfPages = (buffer) => {
  const text = new TextDecoder("latin1").decode(buffer);
  const matches = text.match(/\/Type\s*\/Page\b/g) || [];
  return Math.max(1, matches.length);
};

const getCurrentTemplateType = () =>
  document.getElementById("contractTemplateType")?.value ||
  document.getElementById("contractType")?.value ||
  DRAFT_CONTRACT_TYPES[2].value;

const getTemplateForType = (contractType) => {
  const matching = state.contractTemplates
    .filter((item) => item.contract_type === contractType)
    .sort((a, b) => Number(b.id) - Number(a.id));

  return matching.find((item) => item.has_file) || matching[0] || null;
};

const getTemplateDownloadName = (contractType, fallback = "Mau_hop_dong.docx") =>
  TEMPLATE_DOWNLOAD_NAMES[contractType] || fallback;

const renderTemplateFileCard = () => {
  const contractType = getCurrentTemplateType();
  const template = getTemplateForType(contractType);
  const hiddenSelect = document.getElementById("contractTemplateSelect");
  const fileName = document.getElementById("contractTemplateFileName");
  const meta = document.getElementById("contractTemplateFileMeta");
  const cardError = document.getElementById("contractTemplateCardError");
  const viewButton = document.getElementById("btnViewTemplateFile");
  const editButton = document.getElementById("btnEditTemplateFile");
  const saveButton = document.getElementById("btnSaveTemplateFile");
  const replaceButton = document.getElementById("btnReplaceTemplateFile");

  if (hiddenSelect) hiddenSelect.value = template?.id || "";
  if (fileName) fileName.textContent = template?.file_name || "Chưa có file mẫu";
  if (meta) {
    meta.textContent = template?.has_file
      ? `${template.file_format || "DOCX"} • ${formatFileSize(template.file_size)} • Cập nhật ${formatDateTime(template.file_updated_at)}`
      : template
        ? "Mẫu đã được lưu nhưng thiếu file. Vui lòng upload lại."
        : "Chưa có file mẫu cho loại hợp đồng này.";
  }
  if (cardError) cardError.textContent = "";

  [viewButton, editButton, saveButton, replaceButton].forEach((button) => {
    if (button) button.disabled = !template?.has_file;
  });
};

const syncSelectedTemplateType = () => {
  const contractType = getCurrentTemplateType();
  const hiddenType = document.getElementById("contractType");

  if (hiddenType) hiddenType.value = contractType;
  state.templatePreview = null;
  syncEndDateState({ compute: true });
  renderTemplateFileCard();
};

const loadContractTemplates = async () => {
  try {
    const response = await api.get("/contracts/templates");
    state.contractTemplates = Array.isArray(response.data?.templates)
      ? response.data.templates
      : [];
    renderTemplateFileCard();
  } catch (error) {
    state.contractTemplates = [];
    renderTemplateFileCard();
    setFormError(
      error.response?.data?.message ||
        "Không thể tải danh sách mẫu hợp đồng. Vui lòng thử lại.",
    );
  }
};

const ensureTemplatePreviewModal = () => {
  const existing = document.getElementById("modal-template-preview");
  if (existing) return existing;

  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="fixed inset-0 z-50 hidden items-center justify-center bg-black/50 p-space-md" id="modal-template-preview">
      <div class="w-full max-w-3xl rounded-xl bg-surface-container-lowest p-space-lg shadow-xl">
        <div class="flex items-center justify-between gap-space-md">
          <div>
            <h3 class="font-label-lg text-label-lg font-bold text-on-surface" id="templatePreviewTitle">Xem mẫu hợp đồng</h3>
            <p class="mt-1 font-body-sm text-body-sm text-on-surface-variant" id="templatePreviewFields"></p>
          </div>
          <button class="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors" data-template-preview-close type="button">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <pre class="mt-4 max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-surface-variant bg-surface-container-low p-space-md font-body-sm text-body-sm text-on-surface-variant" id="templatePreviewText"></pre>
      </div>
    </div>`,
  );

  const modal = document.getElementById("modal-template-preview");
  modal
    .querySelector("[data-template-preview-close]")
    ?.addEventListener("click", () => closeModal("modal-template-preview"));
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal("modal-template-preview");
  });

  return modal;
};

const showTemplatePreview = (preview) => {
  ensureTemplatePreviewModal();

  const title = document.getElementById("templatePreviewTitle");
  const fields = document.getElementById("templatePreviewFields");
  const text = document.getElementById("templatePreviewText");

  if (title) title.textContent = preview.template?.name || "Xem mẫu hợp đồng";
  if (fields) {
    const labels = (preview.placeholders || []).map(
      (item) => `${item.label}${item.mapped ? "" : " (chưa map)"}`,
    );
    fields.textContent = labels.length
      ? `Trường tự điền: ${labels.join(", ")}`
      : "Mẫu không có trường cần điền.";
  }
  if (text) text.textContent = preview.text || "Không trích xuất được nội dung mẫu.";

  openModal("modal-template-preview");
};

const loadTemplatePreview = async () => {
  const template = getTemplateForType(getCurrentTemplateType());
  if (!template?.has_file) {
    setFormError("Loại hợp đồng này chưa có file mẫu để xem.");
    return;
  }

  try {
    const response = await api.get(`/contracts/templates/${template.id}/preview`);
    state.templatePreview = response.data;
    showTemplatePreview(response.data);
  } catch (error) {
    setFormError(
      error.response?.data?.message ||
        "Không thể đọc nội dung mẫu hợp đồng. Vui lòng thử lại.",
    );
  }
};

const downloadTemplateFile = async (notify = true) => {
  const contractType = getCurrentTemplateType();
  const template = getTemplateForType(contractType);
  if (!template?.has_file) {
    setFormError("Loại hợp đồng này chưa có file mẫu để tải.");
    return;
  }

  try {
    const response = await api.get(`/contracts/templates/${template.id}/file`, {
      responseType: "blob",
      params: { _: Date.now() },
    });
    const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = getTemplateDownloadName(
      contractType,
      template.file_name || template.name || "Mau_hop_dong.docx",
    );
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
    if (notify) showToast("Đã tải file mẫu hợp đồng về máy");
  } catch (error) {
    setFormError(
      error.response?.data?.message ||
        "Không thể tải file mẫu hợp đồng. Vui lòng thử lại.",
    );
  }
};

const destroyTemplateEditor = () => {
  if (state.templateEditor.editor?.destroyEditor) {
    try {
      state.templateEditor.editor.destroyEditor();
    } catch {}
  }
  state.templateEditor.editor = null;
};

const closeTemplateEditor = () => {
  state.templateEditor.generation += 1;
  closeModal("modal-template-editor");
  destroyTemplateEditor();
  loadContractTemplates();
};

const ensureTemplateEditorModal = () => {
  const existing = document.getElementById("modal-template-editor");
  if (existing) return existing;

  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="fixed inset-0 z-[60] hidden items-center justify-center bg-black/60 p-space-md" id="modal-template-editor">
      <div class="w-full max-w-6xl h-[88vh] flex flex-col rounded-xl bg-surface-container-lowest shadow-xl">
        <div class="flex items-center justify-between gap-space-md px-space-lg py-space-md border-b border-surface-variant">
          <div>
            <h3 class="font-label-lg text-label-lg font-bold text-on-surface" id="templateEditorTitle">Chỉnh sửa mẫu hợp đồng</h3>
            <p class="mt-1 font-body-sm text-body-sm text-on-surface-variant" id="templateEditorStatus"></p>
          </div>
          <button class="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors" id="btnCloseTemplateEditor" type="button" aria-label="Đóng trình soạn thảo">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div class="flex-1 min-h-0 p-space-md">
          <div class="w-full h-full" id="contractTemplateOnlyOfficeEditor"></div>
        </div>
      </div>
    </div>`,
  );

  const modal = document.getElementById("modal-template-editor");
  document
    .getElementById("btnCloseTemplateEditor")
    ?.addEventListener("click", closeTemplateEditor);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeTemplateEditor();
  });

  return modal;
};

const openTemplateEditor = async () => {
  const template = getTemplateForType(getCurrentTemplateType());
  if (!template?.has_file) {
    setFormError("Loại hợp đồng này chưa có file mẫu để chỉnh sửa.");
    return;
  }

  setFormError("");
  ensureTemplateEditorModal();
  const status = document.getElementById("templateEditorStatus");
  const title = document.getElementById("templateEditorTitle");
  const generation = ++state.templateEditor.generation;
  const isCurrent = () =>
    generation === state.templateEditor.generation &&
    document.getElementById("modal-template-editor")?.classList.contains("flex");

  if (title) title.textContent = `Chỉnh sửa: ${template.file_name || template.name || "Mẫu hợp đồng"}`;
  if (status) status.textContent = "Đang mở trình soạn thảo ONLYOFFICE...";
  openModal("modal-template-editor");
  destroyTemplateEditor();

  try {
    const response = await api.get(
      `/contracts/templates/${template.id}/editor-config`,
      { params: { mode: "edit", _: Date.now() } },
    );
    if (!isCurrent()) return;

    const payload = response.data || {};
    if (!payload.editorScriptUrl) {
      throw new Error("ONLYOFFICE chưa được cấu hình");
    }
    state.templateEditor.scriptUrl = payload.editorScriptUrl;
    if (status) status.textContent = "Đang tải trình soạn thảo ONLYOFFICE...";

    await loadOnlyOfficeScript(state.templateEditor.scriptUrl);
    if (!isCurrent()) return;
    if (!window.DocsAPI?.DocEditor) {
      throw new Error("ONLYOFFICE chưa sẵn sàng");
    }

    const editorConfig = {
      ...(payload.config || {}),
      events: {
        onDocumentReady: () => {
          if (isCurrent() && status) {
            status.textContent = "Sẵn sàng chỉnh sửa. Nội dung sẽ được lưu lại hệ thống khi bạn lưu tài liệu.";
          }
        },
        onDocumentStateChange: (event) => {
          if (event?.data === false && isCurrent()) loadContractTemplates();
        },
        onError: (event) => {
          if (isCurrent() && status) {
            status.textContent =
              event?.data?.message || "Có lỗi xảy ra trong trình soạn thảo.";
          }
        },
      },
    };
    if (status) status.textContent = "Đang tải tài liệu...";
    state.templateEditor.editor = new window.DocsAPI.DocEditor(
      "contractTemplateOnlyOfficeEditor",
      editorConfig,
    );
  } catch (error) {
    if (isCurrent() && status) {
      status.textContent =
        error.response?.data?.message ||
        error.message ||
        "Không thể mở trình soạn thảo mẫu hợp đồng.";
    }
  }
};

const uploadTemplateFile = async (file, replace = false) => {
  if (!file) return;
  if (!/\.docx$/i.test(file.name)) {
    setFormError("Chỉ chấp nhận file mẫu định dạng .docx.");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    setFormError("File mẫu hợp đồng không được vượt quá 10MB.");
    return;
  }

  const formData = new FormData();
  formData.append("contract_type", getCurrentTemplateType());
  formData.append("replace", String(replace));
  formData.append("templateFile", file);

  try {
    setFormError("");
    const response = await api.post("/contracts/templates", formData, {
      headers: { "Content-Type": undefined },
    });
    showToast(
      response.data?.message ||
        (replace ? "Đã thay thế mẫu hợp đồng" : "Đã thêm mẫu hợp đồng"),
    );
    await loadContractTemplates();
  } catch (error) {
    if (
      error.response?.status === 409 &&
      error.response.data?.needs_replace &&
      !replace &&
      window.confirm(
        "Loại hợp đồng này đã có mẫu. Bạn có muốn thay thế mẫu hiện tại?",
      )
    ) {
      await uploadTemplateFile(file, true);
      return;
    }

    setFormError(
      error.response?.data?.message ||
        "Không thể upload mẫu hợp đồng. Vui lòng thử lại.",
    );
  }
};

const openTemplateFilePicker = (forceReplace = false) => {
  const input = document.getElementById("contractTemplateUploadInput");
  if (!input) return;

  state.templateUploadReplace = forceReplace;
  input.value = "";
  input.click();
};

const syncCreationMethodUI = () => {
  const templateWrap = document.getElementById("contractTemplateModeWrap");
  const uploadWrap = document.getElementById("contractUploadWrap");

  const isUpload = state.creationMethod === "UPLOAD_DOCX";
  templateWrap?.classList.toggle("hidden", isUpload);
  uploadWrap?.classList.toggle("hidden", !isUpload);
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
    "contractEmployeeCode",
    "contractEmployeeName",
    "contractDob",
    "contractGender",
    "contractAddress",
    "contractPhone",
    "contractEmail",
    "contractDepartmentName",
    "contractPositionName",
    "contractTemplateSelect",
    "contractTemplateType",
    "contractFileInput",
    "contractTemplateUploadInput",
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
  state.selectedEmployee = null;
  state.templatePreview = null;
  state.creationMethod = "FROM_TEMPLATE";

  const baseWrap = document.getElementById("contractBaseWrap");
  if (baseWrap) baseWrap.classList.add("hidden");

  document.getElementById("contractEmployeeInfoWrap")?.classList.remove("hidden");
  document.getElementById("contractCreationWrap")?.classList.remove("hidden");
  document.getElementById("contractTypeFieldWrap")?.classList.add("hidden");
  document.getElementById("contractStatusWrap")?.classList.add("hidden");

  const employee = document.getElementById("contractEmployee");
  if (employee) employee.disabled = false;

  const code = document.getElementById("contractCode");
  if (code) code.value = state.suggestedCode || "";

  populateFormTypeOptions();

  const templateType = document.getElementById("contractTemplateType");
  if (templateType) templateType.value = "FIXED_TERM";
  syncSelectedTemplateType();

  const fromTemplate = document.getElementById("contractCreationFromTemplate");
  const upload = document.getElementById("contractCreationUpload");
  if (fromTemplate) fromTemplate.checked = state.creationMethod === "FROM_TEMPLATE";
  if (upload) upload.checked = state.creationMethod === "UPLOAD_DOCX";
  syncCreationMethodUI();

  const start = document.getElementById("contractStart");
  if (start) start.value = todayIso();

  syncEndDateState({ compute: true });

  const submit = document.getElementById("contractFormSubmit");
  if (submit) {
    submit.innerHTML =
      '<span class="material-symbols-outlined text-[18px]">save</span><span>Lưu bản nháp</span>';
  }

  setText("#contractFormTitle", "Tạo hợp đồng mới");
};

const fillRenewFields = (contract, { showBase = false } = {}) => {
  resetFormFields();
  setFormError("");

  state.formMode = "renew";
  state.formBaseContract = contract;
  state.selectedEmployee = null;

  document.getElementById("contractEmployeeInfoWrap")?.classList.add("hidden");
  document.getElementById("contractCreationWrap")?.classList.add("hidden");
  document.getElementById("contractTypeFieldWrap")?.classList.remove("hidden");
  document.getElementById("contractStatusWrap")?.classList.remove("hidden");

  const submit = document.getElementById("contractFormSubmit");
  if (submit) {
    submit.innerHTML =
      '<span class="material-symbols-outlined text-[18px]">save</span><span>Lưu hợp đồng</span>';
  }

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

  populateFormTypeOptions();

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
  loadContractTemplates();
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
  state.selectedEmployee = null;

  document.getElementById("contractEmployeeInfoWrap")?.classList.add("hidden");
  document.getElementById("contractCreationWrap")?.classList.add("hidden");
  document.getElementById("contractTypeFieldWrap")?.classList.remove("hidden");
  document.getElementById("contractStatusWrap")?.classList.remove("hidden");

  const submit = document.getElementById("contractFormSubmit");
  if (submit) {
    submit.innerHTML =
      '<span class="material-symbols-outlined text-[18px]">save</span><span>Lưu hợp đồng</span>';
  }

  populateFormTypeOptions();

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

const renderDetailTabs = () => {
  document.querySelectorAll("[data-contract-detail-tab]").forEach((button) => {
    const active = button.dataset.contractDetailTab === state.detailTab;
    button.className = active
      ? "h-9 px-space-md rounded-t-lg font-label-md text-label-md font-semibold transition-colors bg-primary text-on-primary"
      : "h-9 px-space-md rounded-t-lg font-label-md text-label-md font-semibold transition-colors text-on-surface-variant hover:bg-surface-container";
    button.setAttribute("aria-selected", String(active));
  });
};

const renderDetailInfoTab = (contract) => {
  const status = STATUS_BADGES[contract.status] || STATUS_BADGES.TERMINATED;
  const remaining = getRemainingText(contract);
  const employeeMeta = [contract.position_title, contract.department_name]
    .filter(Boolean)
    .join(" • ");
  const latestSubmission = state.detailSubmissions[0] || null;
  const submittedAt =
    state.detailApproval?.submitted_at || latestSubmission?.submitted_at;
  const submittedBy =
    state.detailApproval?.submitted_by_name || latestSubmission?.submitted_by_name;
  const versionId =
    state.detailApproval?.version_id || latestSubmission?.version_id;

  return `
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

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-space-md">
        <section class="rounded-lg border border-surface-variant overflow-hidden">
          <div class="px-space-md py-space-sm bg-surface-container-low">
            <h4 class="font-label-lg text-label-lg font-bold text-on-surface">Thông tin nhân viên</h4>
          </div>
          <dl class="p-space-md grid grid-cols-1 sm:grid-cols-2 gap-space-md font-body-sm text-body-sm">
            <div>
              <dt class="font-label-sm text-label-sm text-on-surface-variant uppercase">Họ tên</dt>
              <dd class="mt-1 font-semibold text-on-surface">${escapeHtml(contract.full_name || "—")}</dd>
            </div>
            <div>
              <dt class="font-label-sm text-label-sm text-on-surface-variant uppercase">Mã nhân viên</dt>
              <dd class="mt-1 font-semibold text-on-surface">${escapeHtml(contract.employee_code || "—")}</dd>
            </div>
            <div>
              <dt class="font-label-sm text-label-sm text-on-surface-variant uppercase">Phòng ban</dt>
              <dd class="mt-1 font-semibold text-on-surface">${escapeHtml(contract.department_name || "—")}</dd>
            </div>
            <div>
              <dt class="font-label-sm text-label-sm text-on-surface-variant uppercase">Chức vụ</dt>
              <dd class="mt-1 font-semibold text-on-surface">${escapeHtml(contract.position_title || "—")}</dd>
            </div>
            <div>
              <dt class="font-label-sm text-label-sm text-on-surface-variant uppercase">Email</dt>
              <dd class="mt-1 font-semibold text-on-surface break-all">${escapeHtml(contract.email || "—")}</dd>
            </div>
            <div>
              <dt class="font-label-sm text-label-sm text-on-surface-variant uppercase">Số điện thoại</dt>
              <dd class="mt-1 font-semibold text-on-surface">${escapeHtml(contract.phone || "—")}</dd>
            </div>
            <div>
              <dt class="font-label-sm text-label-sm text-on-surface-variant uppercase">Ngày sinh</dt>
              <dd class="mt-1 font-semibold text-on-surface">${formatDate(contract.dob)}</dd>
            </div>
            <div>
              <dt class="font-label-sm text-label-sm text-on-surface-variant uppercase">Giới tính</dt>
              <dd class="mt-1 font-semibold text-on-surface">${escapeHtml(contract.gender || "—")}</dd>
            </div>
            <div class="sm:col-span-2">
              <dt class="font-label-sm text-label-sm text-on-surface-variant uppercase">Địa chỉ</dt>
              <dd class="mt-1 font-semibold text-on-surface">${escapeHtml(contract.address || "—")}</dd>
            </div>
          </dl>
        </section>

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
              <dt class="font-label-sm text-label-sm text-on-surface-variant uppercase">Tên nhân viên</dt>
              <dd class="mt-1 font-semibold text-on-surface">${escapeHtml(contract.full_name || "—")}${contract.employee_code ? ` (${escapeHtml(contract.employee_code)})` : ""}</dd>
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
            <div>
              <dt class="font-label-sm text-label-sm text-on-surface-variant uppercase">Ngày tạo</dt>
              <dd class="mt-1 font-semibold text-on-surface">${formatDateTime(contract.created_at)}</dd>
            </div>
            <div>
              <dt class="font-label-sm text-label-sm text-on-surface-variant uppercase">Ngày gửi duyệt</dt>
              <dd class="mt-1 font-semibold text-on-surface">${submittedAt ? formatDateTime(submittedAt) : "—"}</dd>
            </div>
            <div>
              <dt class="font-label-sm text-label-sm text-on-surface-variant uppercase">Người gửi duyệt</dt>
              <dd class="mt-1 font-semibold text-on-surface">${escapeHtml(submittedBy || "—")}</dd>
            </div>
            <div>
              <dt class="font-label-sm text-label-sm text-on-surface-variant uppercase">Phiên bản file gửi duyệt</dt>
              <dd class="mt-1 font-semibold text-on-surface">${versionId ? `Phiên bản #${escapeHtml(versionId)}` : "—"}</dd>
            </div>
            <div class="sm:col-span-2 flex items-center justify-between gap-space-sm pt-space-sm border-t border-surface-container-high">
              <dt class="text-on-surface-variant">Lương ghi trên hợp đồng</dt>
              <dd class="font-headline-sm text-headline-sm font-bold text-primary">${formatCurrency(contract.signed_salary)}</dd>
            </div>
            <div class="sm:col-span-2 flex items-center justify-between gap-space-sm">
              <dt class="text-on-surface-variant">Lương đóng bảo hiểm</dt>
              <dd class="font-headline-sm text-headline-sm font-bold text-on-surface">${formatCurrency(contract.insurance_salary)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section class="rounded-lg border border-surface-variant p-space-md">
        <h4 class="font-label-lg text-label-lg font-bold text-on-surface mb-1">Ghi chú</h4>
        <p class="whitespace-pre-line font-body-sm text-body-sm text-on-surface-variant">${escapeHtml(contract.note || "Không có ghi chú.")}</p>
        ${latestSubmission?.note ? `<p class="mt-2 whitespace-pre-line font-body-sm text-body-sm text-on-surface-variant"><span class="font-semibold">Ghi chú khi gửi duyệt:</span> ${escapeHtml(latestSubmission.note)}</p>` : ""}
      </section>
    </div>
  `;
};

const renderApprovalNotice = () => {
  const approval = state.detailApproval || { state: "DRAFT", reason: "" };
  const displayState = getApprovalDisplayState(approval);
  const meta = APPROVAL_STATE_META[displayState] || APPROVAL_STATE_META.DRAFT;

  if (approval.state === "REJECTED") {
    return `
      <div class="rounded-lg border border-error/30 bg-error-container/30 p-space-md">
        <span class="inline-flex items-center rounded-full px-2 py-0.5 font-label-sm text-label-sm font-semibold ${meta.badge}">${meta.label}</span>
        <p class="mt-1 font-body-sm text-body-sm text-error">Lý do từ chối: ${escapeHtml(approval.reason || "Giám đốc đã từ chối hợp đồng.")}</p>
        <p class="mt-1 font-body-sm text-body-sm text-error">Yêu cầu chỉnh sửa: ${escapeHtml(approval.revisionRequest || "Vui lòng rà soát và cập nhật nội dung hợp đồng trước khi gửi lại.")}</p>
        <p class="mt-1 font-body-sm text-body-sm text-on-surface-variant">Người từ chối: ${escapeHtml(approval.rejectedByName || "Giám đốc")}${approval.rejectedAt ? ` • Thời gian: ${formatDateTime(approval.rejectedAt)}` : ""}</p>
      </div>`;
  }

  if (displayState === "REWORK_REQUIRED") {
    return `
      <div class="rounded-lg border border-amber-300 bg-amber-50 p-space-md">
        <span class="inline-flex items-center rounded-full px-2 py-0.5 font-label-sm text-label-sm font-semibold ${meta.badge}">${meta.label}</span>
        <p class="mt-1 font-body-sm text-body-sm text-amber-800">Hợp đồng đã được cập nhật phiên bản mới. Vui lòng gửi lại cho Giám đốc phê duyệt.</p>
      </div>`;
  }

  if (approval.state === "PENDING_APPROVAL" || approval.state === "APPROVED") {
    return `
      <div class="rounded-lg border border-surface-variant bg-surface-container-low p-space-md">
        <span class="inline-flex items-center rounded-full px-2 py-0.5 font-label-sm text-label-sm font-semibold ${meta.badge}">${meta.label}</span>
        <p class="mt-1 font-body-sm text-body-sm text-on-surface-variant">${approval.state === "PENDING_APPROVAL" ? "Không thể chỉnh sửa nội dung đang chờ duyệt." : "Không thể tự ý thay đổi nội dung đã duyệt."}</p>
        ${approval.submitted_at ? `<p class="mt-1 font-body-sm text-body-sm text-on-surface-variant">Người gửi: ${escapeHtml(approval.submitted_by_name || "—")} • Ngày gửi: ${formatDateTime(approval.submitted_at)}${approval.approval_round ? ` • Vòng ${approval.approval_round}` : ""}</p>` : ""}
      </div>`;
  }

  return "";
};

const renderVersionList = (submittedVersionId) => {
  const versions = state.detailVersions || [];
  if (!versions.length) return "";

  const latestId = Number(state.detailFile?.id);
  const rows = versions
    .map((version) => {
      const isLatest = Number(version.id) === latestId;
      const isSubmitted = Number(version.id) === Number(submittedVersionId);
      const isDocx = /\.docx$/i.test(version.file_name || "") || version.file_ext === "docx";
      return `
        <tr>
          <td class="px-3 py-2 whitespace-nowrap font-medium text-on-surface">v${escapeHtml(version.version_no || "—")}${isLatest ? '<span class="ml-1 rounded bg-primary-fixed px-1.5 py-0.5 text-[11px] font-semibold text-on-primary-fixed">Mới nhất</span>' : ""}${isSubmitted ? '<span class="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700">Đã gửi duyệt</span>' : ""}</td>
          <td class="px-3 py-2 text-on-surface-variant max-w-[220px] truncate" title="${escapeHtml(version.file_name || "")}">${escapeHtml(version.file_name || "—")}</td>
          <td class="px-3 py-2 whitespace-nowrap text-on-surface-variant">${formatFileSize(version.file_size)}</td>
          <td class="px-3 py-2 whitespace-nowrap text-on-surface-variant">${escapeHtml(version.uploaded_by_name || "—")}</td>
          <td class="px-3 py-2 whitespace-nowrap text-on-surface-variant">${formatDateTime(version.uploaded_at)}</td>
          <td class="px-3 py-2 text-center whitespace-nowrap">
            <button class="h-7 px-2 rounded bg-surface-container text-on-surface hover:bg-surface-container-high font-label-sm text-label-sm inline-flex items-center gap-1" type="button" data-version-action="download" data-version-id="${escapeHtml(version.id)}"><span class="material-symbols-outlined text-[15px]">download</span>Tải</button>
            ${isDocx ? `<button class="ml-1 h-7 px-2 rounded bg-surface-container text-on-surface hover:bg-surface-container-high font-label-sm text-label-sm inline-flex items-center gap-1" type="button" data-version-action="view" data-version-id="${escapeHtml(version.id)}"><span class="material-symbols-outlined text-[15px]">visibility</span>Xem</button>` : ""}
          </td>
        </tr>`;
    })
    .join("");

  return `
    <section class="flex flex-col gap-space-sm">
      <div class="flex items-center justify-between gap-space-sm">
        <h4 class="font-label-lg text-label-lg font-bold text-on-surface">Lịch sử phiên bản file</h4>
        <span class="font-label-sm text-label-sm text-on-surface-variant">${versions.length} phiên bản được lưu</span>
      </div>
      <div class="overflow-x-auto rounded-lg border border-surface-variant">
        <table class="w-full min-w-[760px] text-left font-body-sm text-body-sm">
          <thead class="bg-surface-container-low text-on-surface-variant">
            <tr>
              <th class="px-3 py-2 font-label-sm text-label-sm uppercase">Phiên bản</th>
              <th class="px-3 py-2 font-label-sm text-label-sm uppercase">Tên file</th>
              <th class="px-3 py-2 font-label-sm text-label-sm uppercase">Kích thước</th>
              <th class="px-3 py-2 font-label-sm text-label-sm uppercase">Người lưu</th>
              <th class="px-3 py-2 font-label-sm text-label-sm uppercase">Thời gian</th>
              <th class="px-3 py-2 font-label-sm text-label-sm uppercase text-center">Thao tác</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-variant">${rows}</tbody>
        </table>
      </div>
    </section>`;
};

const renderDetailFileTab = () => {
  const file = state.detailFile;
  const canEditFile = Boolean(state.detailPermissions?.canEdit);
  const approvalNotice = renderApprovalNotice();
  const latestSubmission = state.detailSubmissions[0] || null;
  const submittedVersionId =
    state.detailApproval?.version_id || latestSubmission?.version_id;
  const submittedVersion = (state.detailVersions || []).find(
    (version) => Number(version.id) === Number(submittedVersionId),
  );
  const uploadControl = canEditFile
    ? `
      <div class="rounded-lg border border-dashed border-outline-variant bg-surface-container-low p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
        <div>
          <p class="font-label-md text-label-md font-semibold text-on-surface">${file ? "Cập nhật / thay thế file hợp đồng" : "Upload file hợp đồng"}</p>
          <p class="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">Chấp nhận DOCX hoặc PDF, tối đa 15MB. File được lưu và liên kết theo mã hợp đồng.</p>
        </div>
        <button class="h-9 px-space-md rounded bg-primary text-on-primary hover:opacity-90 font-label-md text-label-md shrink-0" id="btnPickContractFile" type="button">Chọn file</button>
        <input class="hidden" type="file" id="contractFileUploadInput" accept=".docx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf" />
      </div>`
    : "";

  if (!file) {
    return `
      <div class="flex flex-col gap-space-md">
        <div class="rounded-lg border border-surface-variant p-space-lg text-center">
          <span class="material-symbols-outlined text-[34px] text-outline">description</span>
          <p class="mt-2 font-body-sm text-body-sm text-on-surface-variant">Hợp đồng này chưa có file DOCX/PDF đính kèm.</p>
        </div>
        ${approvalNotice}
        ${uploadControl}
        ${renderVersionList(submittedVersionId)}
      </div>
    `;
  }

  const isPdf = /\.pdf$/i.test(file.file_name || "") || file.mime_type === "application/pdf";
  const viewer = state.detailViewer;
  const viewerStage = viewer.loading
    ? `<div class="flex h-full items-center justify-center gap-2 text-on-surface-variant font-body-sm text-body-sm"><span class="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>Đang tải trình xem tài liệu...</div>`
    : viewer.error
      ? `<div class="flex h-full flex-col items-center justify-center gap-2 p-space-md text-center"><span class="material-symbols-outlined text-[30px] text-outline">error</span><p class="font-body-sm text-body-sm text-error">${escapeHtml(viewer.error)}</p><button class="h-9 px-space-md rounded bg-primary text-on-primary font-label-md text-label-md" type="button" data-viewer-action="reload">Thử lại</button></div>`
      : isPdf
        ? `<iframe class="w-full h-full border-0" title="Xem file hợp đồng" src="${escapeHtml(viewer.url || "")}#page=${viewer.page}&zoom=${Math.round(viewer.scale * 100)}"></iframe>`
        : `<div id="contractOnlyOfficeViewer" class="w-full h-full"></div>`;

  const viewerControls = `
    <div class="flex flex-wrap items-center gap-2 px-space-md py-space-sm border-b border-surface-variant bg-surface-container-low/60">
      <button class="w-8 h-8 rounded hover:bg-surface-container text-on-surface flex items-center justify-center" title="Phóng to" type="button" data-viewer-action="zoomIn"><span class="material-symbols-outlined text-[18px]">zoom_in</span></button>
      <button class="w-8 h-8 rounded hover:bg-surface-container text-on-surface flex items-center justify-center" title="Thu nhỏ" type="button" data-viewer-action="zoomOut"><span class="material-symbols-outlined text-[18px]">zoom_out</span></button>
      <span class="font-label-sm text-label-sm text-on-surface-variant" data-viewer-scale>${Math.round(viewer.scale * 100)}%</span>
      <span class="w-px h-5 bg-surface-variant mx-1"></span>
      <button class="w-8 h-8 rounded hover:bg-surface-container text-on-surface flex items-center justify-center" title="Trang trước" type="button" data-viewer-action="prevPage"><span class="material-symbols-outlined text-[18px]">chevron_left</span></button>
      <span class="font-label-sm text-label-sm text-on-surface-variant" data-viewer-page>${isPdf ? `Trang ${viewer.page} / ${viewer.pages}` : `Trang ${viewer.page}`}</span>
      <button class="w-8 h-8 rounded hover:bg-surface-container text-on-surface flex items-center justify-center" title="Trang sau" type="button" data-viewer-action="nextPage"><span class="material-symbols-outlined text-[18px]">chevron_right</span></button>
      <div class="flex-1"></div>
      ${canEditFile ? `<button class="h-8 px-space-sm rounded bg-primary text-on-primary hover:opacity-90 font-label-sm text-label-sm inline-flex items-center gap-1" type="button" data-viewer-action="edit"><span class="material-symbols-outlined text-[16px]">edit</span>Chỉnh sửa</button>` : ""}
      <button class="h-8 px-space-sm rounded bg-surface-container text-on-surface hover:bg-surface-container-high font-label-sm text-label-sm inline-flex items-center gap-1" type="button" data-detail-file-action="download"><span class="material-symbols-outlined text-[16px]">download</span>Tải file</button>
    </div>`;

  return `
    <div class="flex flex-col gap-space-md">
      ${approvalNotice}
      <section class="rounded-lg border border-surface-variant overflow-hidden">
        <div class="px-space-md py-space-sm bg-surface-container-low flex items-center justify-between gap-space-sm">
          <div class="min-w-0">
            <h4 class="font-label-lg text-label-lg font-bold text-on-surface">Xem nội dung hợp đồng</h4>
            <p class="font-body-sm text-body-sm text-on-surface-variant truncate">${escapeHtml(file.file_name || "—")} • ${formatFileSize(file.file_size)} • Cập nhật ${formatDateTime(file.uploaded_at)}</p>
            ${submittedVersionId ? `<p class="mt-0.5 font-label-sm text-label-sm text-blue-700">Phiên bản đã gửi duyệt: v${escapeHtml(submittedVersion?.version_no || "—")} (#${escapeHtml(submittedVersionId)})</p>` : ""}
          </div>
          <span class="inline-flex items-center rounded bg-primary-fixed px-2 py-0.5 font-label-sm text-label-sm font-bold text-on-primary-fixed uppercase shrink-0">${escapeHtml(file.file_ext || "file")}</span>
        </div>
        ${viewerControls}
        <div class="relative h-[65vh] min-h-[420px] bg-surface-container-low" id="contractDocumentStage">${viewerStage}</div>
      </section>
      ${uploadControl}
      ${renderVersionList(submittedVersionId)}
    </div>
  `;
};

const parseTimelineTime = (value) => {
  const text = String(value || "");
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]} ${iso[4]}:${iso[5]}`;
  const parts = text.split(" ");
  const date = parts[0] || "";
  const [day, month, year] = date.split("/");
  if (day && month && year) return `${year}-${month}-${day} ${parts[1] || ""}`;
  return text;
};

const renderApprovalTimeline = () => {
  const events = [];

  (state.detailSubmissions || []).forEach((submission) => {
    events.push({
      time: submission.submitted_at,
      title: `HR gửi duyệt vòng ${submission.approval_round || "—"}`,
      actor: submission.submitted_by_name,
      dot: "bg-blue-500",
      detail: submission.note || "",
    });

    if (
      submission.status === "REJECTED" ||
      submission.status === "APPROVED"
    ) {
      const rejected = submission.status === "REJECTED";
      events.push({
        time: rejected ? submission.rejected_at : submission.approved_at,
        title: rejected ? "Giám đốc từ chối" : "Giám đốc phê duyệt",
        actor: submission.approver_name,
        dot: rejected ? "bg-red-500" : "bg-emerald-500",
        detail: rejected
          ? [
              submission.rejection_reason
                ? `Lý do: ${submission.rejection_reason}`
                : "",
              submission.revision_request
                ? `Yêu cầu: ${submission.revision_request}`
                : "",
            ]
              .filter(Boolean)
              .join(" • ")
          : "Hợp đồng đã được phê duyệt",
      });
    }
  });

  (state.detailHistory || []).forEach((item) => {
    const meta = APPROVAL_ACTION_META[item.action] || {
      label: item.action || "Cập nhật",
      dot: "bg-outline",
    };
    events.push({
      time: item.created_at,
      title: meta.label,
      actor: item.actor_name,
      dot: meta.dot,
      detail: item.note || "",
    });
  });

  if (!events.length) return "";

  events.sort((a, b) =>
    parseTimelineTime(b.time).localeCompare(parseTimelineTime(a.time)),
  );

  return `
    <section class="flex flex-col gap-space-sm">
      <h4 class="font-label-lg text-label-lg font-bold text-on-surface">Tiến trình xử lý</h4>
      <div class="rounded-lg border border-surface-variant p-space-md">
        <ol class="relative ml-2 border-l border-surface-variant space-y-space-md">
          ${events
            .map(
              (event) => `
            <li class="ml-space-md relative">
              <span class="absolute -left-[25px] top-1 w-2.5 h-2.5 rounded-full ${event.dot}"></span>
              <p class="font-label-md text-label-md font-semibold text-on-surface">${escapeHtml(event.title)}</p>
              <p class="font-body-sm text-body-sm text-on-surface-variant">${formatDateTime(event.time)} • ${escapeHtml(event.actor || "Hệ thống")}</p>
              ${event.detail ? `<p class="mt-0.5 font-body-sm text-body-sm text-on-surface-variant whitespace-pre-line">${escapeHtml(event.detail)}</p>` : ""}
            </li>`,
            )
            .join("")}
        </ol>
      </div>
    </section>`;
};

const renderDetailHistoryTab = () => {
  const isRework = Boolean(state.detailApproval?.reworkRequired);
  const submitControl = state.detailPermissions?.canSubmit
    ? `
      <section class="rounded-lg border border-surface-variant p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
        <div>
          <p class="font-label-md text-label-md font-semibold text-on-surface">${isRework ? "Gửi lại hợp đồng cho Giám đốc phê duyệt" : "Gửi hợp đồng cho Giám đốc phê duyệt"}</p>
          <p class="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">${isRework ? "Hệ thống sẽ gửi phiên bản file mới nhất kèm lịch sử xử lý yêu cầu chỉnh sửa." : "Hệ thống sẽ kiểm tra dữ liệu và thông báo cho Giám đốc sau khi xác nhận."}</p>
        </div>
        <button class="h-9 px-space-md rounded bg-primary text-on-primary hover:opacity-90 font-label-md text-label-md inline-flex items-center gap-1.5 shrink-0" id="btnSubmitContractApproval" type="button">
          <span class="material-symbols-outlined text-[18px]">send</span>
          ${isRework ? "Gửi duyệt lại" : "Gửi Giám đốc duyệt"}
        </button>
      </section>`
    : state.detailPermissions?.canEdit
      ? `
      <div class="rounded-lg border border-surface-variant bg-surface-container-low p-space-md font-body-sm text-body-sm text-on-surface-variant">
        ${escapeHtml(state.detailPermissions.submitBlockReason || "Hợp đồng chưa đủ điều kiện gửi duyệt")}
      </div>`
      : "";

  const submissionRows = (state.detailSubmissions || [])
    .map((item) => {
      const meta = SUBMISSION_STATUS_META[item.status] || {
        label: item.status || "—",
        badge: "bg-surface-container-high text-on-surface-variant",
      };
      const details = [
        item.note ? `Ghi chú: ${item.note}` : "",
        item.previous_rejection_reason ? `Lý do lần trước: ${item.previous_rejection_reason}` : "",
        item.rejection_reason ? `Lý do: ${item.rejection_reason}` : "",
        item.revision_request ? `Yêu cầu: ${item.revision_request}` : "",
      ]
        .filter(Boolean)
        .join(" • ");

      return `
        <tr>
          <td class="px-3 py-3 whitespace-nowrap text-on-surface-variant">${formatDateTime(item.submitted_at)}</td>
          <td class="px-3 py-3 font-medium text-on-surface">${escapeHtml(item.submitted_by_name || "—")}</td>
          <td class="px-3 py-3 text-center text-on-surface">${escapeHtml(item.approval_round || "—")}</td>
          <td class="px-3 py-3 whitespace-nowrap text-on-surface-variant">${item.version_id ? `#${escapeHtml(item.version_id)}` : "—"}</td>
          <td class="px-3 py-3">
            <span class="inline-flex items-center rounded-full px-2 py-0.5 font-label-sm text-label-sm ${meta.badge}">${escapeHtml(meta.label)}</span>
          </td>
          <td class="px-3 py-3 text-on-surface-variant whitespace-pre-line">${escapeHtml(details || "—")}</td>
        </tr>
      `;
    })
    .join("");

  const rows = (state.detailHistory || [])
    .map((item) => {
      const meta = APPROVAL_ACTION_META[item.action] || {
        label: item.action || "Cập nhật",
        badge: "bg-surface-container-high text-on-surface-variant",
        dot: "bg-outline",
      };

      return `
        <tr>
          <td class="px-3 py-3 whitespace-nowrap text-on-surface-variant">${formatDateTime(item.created_at)}</td>
          <td class="px-3 py-3 font-medium text-on-surface">${escapeHtml(item.actor_name || "—")}</td>
          <td class="px-3 py-3">
            <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-label-sm text-label-sm ${meta.badge}">
              <span class="w-1.5 h-1.5 rounded-full ${meta.dot}"></span>
              ${meta.label}
            </span>
          </td>
          <td class="px-3 py-3 text-on-surface-variant whitespace-pre-line">${escapeHtml(item.note || "—")}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="flex flex-col gap-space-md">
      ${submitControl}
      ${renderApprovalTimeline()}
      ${
        submissionRows
          ? `<section class="flex flex-col gap-space-sm">
              <h4 class="font-label-lg text-label-lg font-bold text-on-surface">Lịch sử gửi duyệt</h4>
              <div class="overflow-x-auto rounded-lg border border-surface-variant">
                <table class="w-full min-w-[760px] text-left font-body-sm text-body-sm">
                  <thead class="bg-surface-container-low text-on-surface-variant">
                    <tr>
                      <th class="px-3 py-2 font-label-sm text-label-sm uppercase">Ngày gửi</th>
                      <th class="px-3 py-2 font-label-sm text-label-sm uppercase">Người gửi</th>
                      <th class="px-3 py-2 font-label-sm text-label-sm uppercase text-center">Vòng</th>
                      <th class="px-3 py-2 font-label-sm text-label-sm uppercase">Phiên bản file</th>
                      <th class="px-3 py-2 font-label-sm text-label-sm uppercase">Trạng thái</th>
                      <th class="px-3 py-2 font-label-sm text-label-sm uppercase">Ghi chú / quyết định</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-surface-variant">${submissionRows}</tbody>
                </table>
              </div>
            </section>`
          : ""
      }
      ${
        rows
          ? `<div class="overflow-x-auto rounded-lg border border-surface-variant">
              <table class="w-full min-w-[680px] text-left font-body-sm text-body-sm">
                <thead class="bg-surface-container-low text-on-surface-variant">
                  <tr>
                    <th class="px-3 py-2 font-label-sm text-label-sm uppercase">Thời gian</th>
                    <th class="px-3 py-2 font-label-sm text-label-sm uppercase">Người thực hiện</th>
                    <th class="px-3 py-2 font-label-sm text-label-sm uppercase">Trạng thái</th>
                    <th class="px-3 py-2 font-label-sm text-label-sm uppercase">Lý do / yêu cầu</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface-variant">${rows}</tbody>
              </table>
            </div>`
          : `<div class="rounded-lg border border-surface-variant p-space-lg text-center">
              <span class="material-symbols-outlined text-[34px] text-outline">history</span>
              <p class="mt-2 font-body-sm text-body-sm text-on-surface-variant">Chưa có lịch sử gửi duyệt cho hợp đồng này.</p>
            </div>`
      }
    </div>
  `;
};

const renderDetailSigningTab = () => {
  const signing = state.detailSigning || {};
  const signatures = Array.isArray(signing.signatures) ? signing.signatures : [];
  const official = signing.official_file || null;
  const canSign = Boolean(signing.can_sign || state.detailPermissions?.canSign);
  const canRequestRevision = Boolean(
    signing.can_request_revision || state.detailPermissions?.canRequestSigningRevision,
  );

  const statusNotice = official
    ? `<div class="rounded-lg border border-emerald-300 bg-emerald-50 p-space-md">
        <span class="inline-flex items-center rounded-full px-2 py-0.5 font-label-sm text-label-sm font-semibold bg-emerald-100 text-emerald-800">Đã ký chính thức</span>
        <p class="mt-1 font-body-sm text-body-sm text-emerald-900">Người ký: ${escapeHtml(official.signer_name || "—")} • ${formatDateTime(official.signed_at)} • Phiên bản v${escapeHtml(official.version_no || "—")}</p>
        <p class="mt-0.5 font-body-sm text-body-sm text-emerald-900">${escapeHtml(official.signature_method || "INTERNAL_CONFIRMATION")} — đây là xác nhận nội bộ, không phải chữ ký số.</p>
      </div>`
    : canSign
      ? `<div class="rounded-lg border border-sky-300 bg-sky-50 p-space-md">
          <span class="inline-flex items-center rounded-full px-2 py-0.5 font-label-sm text-label-sm font-semibold bg-sky-100 text-sky-800">Chờ ký chính thức</span>
          <p class="mt-1 font-body-sm text-body-sm text-sky-900">Giám đốc đã phê duyệt phiên bản v${escapeHtml(signing.approved_version_no || "—")}${signing.approved_version_id ? ` (#${escapeHtml(signing.approved_version_id)})` : ""}${signing.approver_name ? ` • ${escapeHtml(signing.approver_name)}` : ""}${signing.approved_at ? ` • ${formatDateTime(signing.approved_at)}` : ""}.</p>
          <p class="mt-0.5 font-body-sm text-body-sm text-sky-900">Hệ thống sẽ lưu lại bản đã duyệt làm bản chính thức và ghi nhận lịch sử ký. Đây là xác nhận nội bộ, không phải chữ ký số.</p>
          ${canRequestRevision ? '<p class="mt-0.5 font-body-sm text-body-sm text-sky-900">Nếu cần chỉnh sửa nội dung, hãy dùng nút yêu cầu chỉnh sửa để trả lại cho HR.</p>' : ""}
        </div>`
      : "";

  const officialSection = official
    ? `<section class="rounded-lg border border-surface-variant overflow-hidden">
        <div class="px-space-md py-space-sm bg-surface-container-low flex flex-wrap items-center justify-between gap-space-sm">
          <div class="min-w-0">
            <h4 class="font-label-lg text-label-lg font-bold text-on-surface">Bản hợp đồng chính thức</h4>
            <p class="font-body-sm text-body-sm text-on-surface-variant truncate">${escapeHtml(official.file_name || "—")} • ${escapeHtml(official.mime_type || "DOCX")} • Ký lúc ${formatDateTime(official.signed_at)}</p>
          </div>
          <button class="h-9 px-space-md rounded bg-primary text-on-primary hover:opacity-90 font-label-md text-label-md inline-flex items-center gap-1.5 shrink-0" type="button" data-signing-action="download-official">
            <span class="material-symbols-outlined text-[18px]">download</span>
            Tải bản chính thức
          </button>
        </div>
      </section>`
    : `<div class="rounded-lg border border-dashed border-outline-variant bg-surface-container-low p-space-lg text-center">
        <span class="material-symbols-outlined text-[34px] text-outline">draw</span>
        <p class="mt-2 font-body-sm text-body-sm text-on-surface-variant">Hợp đồng chưa có bản chính thức được ký.</p>
      </div>`;

  const signatureRows = signatures
    .map(
      (item) => `
        <tr>
          <td class="px-3 py-3 whitespace-nowrap text-on-surface-variant">${formatDateTime(item.signed_at)}</td>
          <td class="px-3 py-3 font-medium text-on-surface">${escapeHtml(item.signer_name || "—")}</td>
          <td class="px-3 py-3 text-on-surface-variant">${escapeHtml(item.signer_role || "—")}</td>
          <td class="px-3 py-3 text-center text-on-surface">${item.version_no ? `v${escapeHtml(item.version_no)}` : "—"}</td>
          <td class="px-3 py-3 text-on-surface-variant">${escapeHtml(item.signature_method || "—")}</td>
          <td class="px-3 py-3"><span class="inline-flex items-center rounded-full px-2 py-0.5 font-label-sm text-label-sm ${item.result === "SUCCESS" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}">${escapeHtml(item.result || "—")}</span></td>
          <td class="px-3 py-3 text-on-surface-variant whitespace-pre-line">${escapeHtml(item.transaction_ref || "—")}</td>
        </tr>`,
    )
    .join("");

  return `
    <div class="flex flex-col gap-space-md">
      ${statusNotice}
      ${officialSection}
      ${
        signatureRows
          ? `<section class="flex flex-col gap-space-sm">
              <h4 class="font-label-lg text-label-lg font-bold text-on-surface">Lịch sử ký hợp đồng</h4>
              <div class="overflow-x-auto rounded-lg border border-surface-variant">
                <table class="w-full min-w-[860px] text-left font-body-sm text-body-sm">
                  <thead class="bg-surface-container-low text-on-surface-variant">
                    <tr>
                      <th class="px-3 py-2 font-label-sm text-label-sm uppercase">Thời gian ký</th>
                      <th class="px-3 py-2 font-label-sm text-label-sm uppercase">Người ký</th>
                      <th class="px-3 py-2 font-label-sm text-label-sm uppercase">Vai trò</th>
                      <th class="px-3 py-2 font-label-sm text-label-sm uppercase text-center">Phiên bản</th>
                      <th class="px-3 py-2 font-label-sm text-label-sm uppercase">Phương thức</th>
                      <th class="px-3 py-2 font-label-sm text-label-sm uppercase">Kết quả</th>
                      <th class="px-3 py-2 font-label-sm text-label-sm uppercase">Mã tham chiếu</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-surface-variant">${signatureRows}</tbody>
                </table>
              </div>
            </section>`
          : ""
      }
    </div>
  `;
};

const renderContractDetail = () => {
  const contract = state.detailContract;

  setText("#contractDetailCode", contract?.contract_code || "—");
  setText("#contractDetailTitle", contract?.full_name || "Chi tiết hợp đồng");
  setText(
    "#contractDetailSubtitle",
    contract
      ? `${contract.contract_type || "—"} • ${contract.department_name || "Chưa xác định phòng ban"}`
      : "",
  );

  const statusElement = document.getElementById("contractDetailStatus");
  if (statusElement) {
    const displayState = getApprovalDisplayState(state.detailApproval);
    const status = contract
      ? STATUS_BADGES[displayState] ||
        STATUS_BADGES[contract.status] ||
        STATUS_BADGES.TERMINATED
      : null;
    const approvalMeta =
      APPROVAL_STATE_META[displayState] || APPROVAL_STATE_META.DRAFT;
    statusElement.innerHTML = status
      ? `<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-label-sm text-label-sm ${status.badge}">
          <span class="w-1.5 h-1.5 rounded-full ${status.dot}"></span>
          ${status.label}
        </span>
        <span class="inline-flex items-center rounded-full px-2 py-0.5 font-label-sm text-label-sm font-semibold ${approvalMeta.badge}">${approvalMeta.label}</span>`
      : "";
  }

  renderDetailTabs();

  const body = document.getElementById("contractDetailBody");
  if (body) {
    if (state.detailLoading) {
      body.innerHTML = `
        <div class="flex items-center justify-center gap-2 py-10 text-on-surface-variant font-body-sm text-body-sm">
          <span class="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
          Đang tải chi tiết hợp đồng...
        </div>`;
    } else if (state.detailError) {
      body.innerHTML = `
        <div class="rounded-lg border border-error/30 bg-error-container/30 p-space-md text-center">
          <p class="font-body-sm text-body-sm text-error">${escapeHtml(state.detailError)}</p>
          <button class="mt-3 h-9 px-space-md rounded bg-primary text-on-primary font-label-md text-label-md" type="button" data-detail-retry>Thử lại</button>
        </div>`;
    } else if (!contract) {
      body.innerHTML = "";
    } else if (state.detailTab === "file") {
      body.innerHTML = renderDetailFileTab();
    } else if (state.detailTab === "history") {
      body.innerHTML = renderDetailHistoryTab();
    } else if (state.detailTab === "signing") {
      body.innerHTML = renderDetailSigningTab();
    } else {
      body.innerHTML = renderDetailInfoTab(contract);
    }
  }

  const canAct =
    Boolean(contract) && state.canManage && contract.status !== "TERMINATED";
  const renewButton = document.getElementById("contractDetailRenew");
  const terminateButton = document.getElementById("contractDetailTerminate");

  for (const button of [renewButton, terminateButton]) {
    if (!button) continue;
    button.hidden = !canAct;
    button.classList.toggle("hidden", !canAct);
    button.classList.toggle("flex", canAct);
  }

  const canReview =
    Boolean(contract) &&
    Boolean(state.detailPermissions?.canApprove) &&
    state.detailApproval?.state === "PENDING_APPROVAL";
  const approveButton = document.getElementById("contractDetailApprove");
  const rejectButton = document.getElementById("contractDetailReject");

  for (const button of [approveButton, rejectButton]) {
    if (!button) continue;
    button.hidden = !canReview;
    button.classList.toggle("hidden", !canReview);
    button.classList.toggle("flex", canReview);
  }

  const canSign = Boolean(
    state.detailSigning?.can_sign || state.detailPermissions?.canSign,
  );
  const canRequestSigningRevision = Boolean(
    state.detailSigning?.can_request_revision ||
      state.detailPermissions?.canRequestSigningRevision,
  );
  const signButton = document.getElementById("contractDetailSign");
  const revisionButton = document.getElementById(
    "contractDetailRequestSigningRevision",
  );

  for (const button of [signButton, revisionButton]) {
    if (!button) continue;
    button.hidden = !canSign;
    button.classList.toggle("hidden", !canSign);
    button.classList.toggle("flex", canSign);
  }
  if (revisionButton) {
    revisionButton.hidden = !canRequestSigningRevision;
    revisionButton.classList.toggle("hidden", !canRequestSigningRevision);
    revisionButton.classList.toggle("flex", canRequestSigningRevision);
  }
};

const closeContractDetail = () => {
  state.detailLoadSeq += 1;
  destroyDocumentViewer();
  state.detailContract = null;
  state.detailFile = null;
  state.detailHistory = [];
  state.detailSubmissions = [];
  state.detailVersions = [];
  state.detailApproval = null;
  state.detailPermissions = null;
  state.detailSigning = null;
  state.detailError = "";
  state.detailLoading = false;
  closeModal("modal-contract-detail");
};

const openContractDetail = async (contractId, tab = "info") => {
  const numericId = Number(contractId);
  if (!Number.isInteger(numericId) || numericId <= 0) return;

  state.detailTab = ["info", "file", "history", "signing"].includes(tab) ? tab : "info";
  destroyDocumentViewer();
  state.detailContract = null;
  state.detailFile = null;
  state.detailHistory = [];
  state.detailSubmissions = [];
  state.detailVersions = [];
  state.detailApproval = null;
  state.detailPermissions = null;
  state.detailSigning = null;
  state.detailError = "";
  state.detailLoading = true;
  const sequence = ++state.detailLoadSeq;

  renderContractDetail();
  openModal("modal-contract-detail");

  try {
    const response = await api.get(`/contracts/${numericId}`);

    if (sequence !== state.detailLoadSeq) return;

    const payload = response.data || {};
    state.detailContract = payload.contract || null;
    state.detailFile = payload.file || null;
    state.detailHistory = Array.isArray(payload.history) ? payload.history : [];
    state.detailSubmissions = Array.isArray(payload.submissions)
      ? payload.submissions
      : [];
    state.detailVersions = Array.isArray(payload.versions) ? payload.versions : [];
    state.detailApproval = payload.approval || null;
    state.detailPermissions = payload.permissions || null;
    state.detailSigning = payload.signing || null;
    state.detailLoading = false;

    if (!state.detailContract) {
      state.detailError = "Không tìm thấy hợp đồng trong phạm vi được phép.";
    }
  } catch (error) {
    if (sequence !== state.detailLoadSeq) return;
    state.detailError =
      error.response?.data?.message ||
      "Không thể tải chi tiết hợp đồng. Vui lòng thử lại.";
    state.detailLoading = false;
  }

  renderContractDetail();

  if (!state.detailError && state.detailTab === "file" && state.detailFile) {
    loadDocumentViewer("view");
  }
};

const refreshContractDetail = (tab = state.detailTab) => {
  if (!state.detailContract) return Promise.resolve();
  return openContractDetail(state.detailContract.id, tab);
};

const destroyDocumentViewer = () => {
  if (state.detailDocEditor?.destroyEditor) {
    try {
      state.detailDocEditor.destroyEditor();
    } catch {}
  }
  state.detailDocEditor = null;

  if (state.detailViewer.url) {
    window.URL.revokeObjectURL(state.detailViewer.url);
  }

  state.detailViewer = {
    type: null,
    mode: "view",
    url: null,
    page: 1,
    pages: 1,
    scale: 1,
    loading: false,
    error: "",
  };
};

let onlyOfficeScriptPromise = null;
let onlyOfficeScriptUrl = "";

const loadOnlyOfficeScript = (url) => {
  if (!url) {
    return Promise.reject(new Error("ONLYOFFICE chưa được cấu hình"));
  }
  if (window.DocsAPI?.DocEditor) {
    return Promise.resolve();
  }
  if (onlyOfficeScriptPromise && onlyOfficeScriptUrl === url) {
    return onlyOfficeScriptPromise;
  }

  document
    .querySelectorAll("script[data-onlyoffice-api='true']")
    .forEach((element) => element.remove());
  onlyOfficeScriptUrl = url;
  const pending = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.dataset.onlyofficeApi = "true";
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) {
        script.remove();
        reject(error);
        return;
      }
      if (!window.DocsAPI?.DocEditor) {
        script.remove();
        reject(new Error("ONLYOFFICE tải xong nhưng DocsAPI chưa sẵn sàng"));
        return;
      }
      resolve();
    };
    const timeout = setTimeout(() => {
      finish(
        new Error(
          "Không thể tải ONLYOFFICE. Kiểm tra Document Server đang chạy và địa chỉ ONLYOFFICE_PUBLIC_URL.",
        ),
      );
    }, 15000);

    script.onload = () => finish();
    script.onerror = () =>
      finish(
        new Error(
          "Không thể tải ONLYOFFICE. Kiểm tra Document Server đang chạy và địa chỉ ONLYOFFICE_PUBLIC_URL.",
        ),
      );
    document.head.appendChild(script);
  }).finally(() => {
    if (onlyOfficeScriptPromise === pending) onlyOfficeScriptPromise = null;
  });
  onlyOfficeScriptPromise = pending;
  return pending;
};

const initOnlyOfficeEditor = async (config) => {
  const container = document.getElementById("contractOnlyOfficeViewer");
  if (!container) return;

  await loadOnlyOfficeScript(state.detailOnlyOfficeScript);
  if (!window.DocsAPI?.DocEditor) {
    throw new Error("ONLYOFFICE chưa sẵn sàng");
  }

  state.detailDocEditor = new window.DocsAPI.DocEditor(container.id, config);
};

const loadDocumentViewer = async (mode = "view", versionId = null) => {
  const file = state.detailFile;
  if (!file || !state.detailContract) return;

  destroyDocumentViewer();
  const isPdf =
    /\.pdf$/i.test(file.file_name || "") || file.mime_type === "application/pdf";
  const requestedMode =
    mode === "edit" && state.detailPermissions?.canEdit ? "edit" : "view";

  state.detailViewer = {
    ...state.detailViewer,
    type: isPdf ? "pdf" : "docx",
    mode: requestedMode,
    loading: true,
    error: "",
  };
  renderContractDetail();

  try {
    if (isPdf) {
      const blob = await fetchContractFileBlob();
      if (!blob) return;
      const pages = estimatePdfPages(await blob.arrayBuffer());
      state.detailViewer = {
        ...state.detailViewer,
        url: window.URL.createObjectURL(blob),
        pages,
        loading: false,
      };
      renderContractDetail();
      return;
    }

    const response = await api.get(
      `/contracts/${state.detailContract.id}/editor-config`,
      {
        params: {
          mode: requestedMode,
          ...(versionId ? { versionId } : {}),
        },
      },
    );
    const payload = response.data || {};
    state.detailOnlyOfficeScript = payload.editorScriptUrl || "";
    state.detailViewer = {
      ...state.detailViewer,
      mode: payload.mode || requestedMode,
      loading: false,
    };
    renderContractDetail();
    await initOnlyOfficeEditor(payload.config);
  } catch (error) {
    state.detailViewer = {
      ...state.detailViewer,
      loading: false,
      error:
        error.response?.data?.message ||
        error.message ||
        "Không thể mở trình xem tài liệu",
    };
    renderContractDetail();
  }
};

const adjustDocumentViewer = (action) => {
  const viewer = state.detailViewer;

  if (action === "reload") {
    loadDocumentViewer(viewer.mode);
    return;
  }

  if (action === "edit") {
    loadDocumentViewer("edit");
    return;
  }

  if (action === "zoomIn" || action === "zoomOut") {
    const step = action === "zoomIn" ? 0.1 : -0.1;
    state.detailViewer = {
      ...viewer,
      scale: Math.min(2, Math.max(0.6, Number((viewer.scale + step).toFixed(2)))),
    };
    const scaleLabel = document.querySelector("[data-viewer-scale]");
    if (scaleLabel) {
      scaleLabel.textContent = `${Math.round(state.detailViewer.scale * 100)}%`;
    }
    updateViewerMedia();
    return;
  }

  if (action === "prevPage" || action === "nextPage") {
    const maxPage = viewer.type === "pdf" ? viewer.pages : 999;
    const delta = action === "nextPage" ? 1 : -1;
    state.detailViewer = {
      ...viewer,
      page: Math.min(maxPage, Math.max(1, viewer.page + delta)),
    };
    const pageLabel = document.querySelector("[data-viewer-page]");
    if (pageLabel) {
      pageLabel.textContent =
        viewer.type === "pdf"
          ? `Trang ${state.detailViewer.page} / ${viewer.pages}`
          : `Trang ${state.detailViewer.page}`;
    }
    updateViewerMedia();
  }
};

const updateViewerMedia = () => {
  const viewer = state.detailViewer;

  if (viewer.type === "pdf") {
    const iframe = document.querySelector("#contractDocumentStage iframe");
    if (iframe) {
      iframe.src = `${viewer.url}#page=${viewer.page}&zoom=${Math.round(viewer.scale * 100)}`;
    }
    return;
  }

  const container = document.getElementById("contractOnlyOfficeViewer");
  if (container) container.style.zoom = String(viewer.scale);
  if (viewer.type === "docx") {
    state.detailDocEditor?.gotoPage?.(viewer.page);
  }
};

const fetchContractFileBlob = async () => {
  if (!state.detailContract) return null;
  const response = await api.get(
    `/contracts/${state.detailContract.id}/file`,
    {
      responseType: "blob",
      params: { _: Date.now() },
    },
  );
  return new Blob([response.data]);
};

const downloadBlobFile = (blob, fileName, objectUrl = null) => {
  const url = objectUrl || window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName || "hop-dong.docx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (!objectUrl) window.URL.revokeObjectURL(url);
};

const showDetailFileError = (error) => {
  state.detailError =
    error.response?.data?.message ||
    "Không thể xử lý file hợp đồng. Vui lòng thử lại.";
  renderContractDetail();
};

const viewContractDetailFile = async () => {
  state.detailTab = "file";
  renderContractDetail();
  await loadDocumentViewer("view");
};

const downloadContractDetailFile = async () => {
  try {
    const blob = await fetchContractFileBlob();
    if (!blob) return;
    downloadBlobFile(blob, state.detailFile?.file_name || "hop-dong.docx");
  } catch (error) {
    showDetailFileError(error);
  }
};

const handleVersionAction = async (action, versionId) => {
  const version = (state.detailVersions || []).find(
    (item) => String(item.id) === String(versionId),
  );
  if (!version || !state.detailContract) return;

  if (action === "view") {
    await loadDocumentViewer("view", version.id);
    return;
  }

  try {
    const response = await api.get(
      `/contracts/${state.detailContract.id}/versions/${version.id}/file`,
      { responseType: "blob" },
    );
    downloadBlobFile(new Blob([response.data]), version.file_name || "hop-dong.docx");
  } catch (error) {
    showDetailFileError(error);
  }
};

const uploadContractDetailFile = async (file) => {
  if (!state.detailContract || !file) return;

  if (!/\.(docx|pdf)$/i.test(file.name)) {
    showToast("Chỉ chấp nhận file hợp đồng định dạng .docx hoặc .pdf");
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    showToast("File hợp đồng không được vượt quá 15MB");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await api.post(
      `/contracts/${state.detailContract.id}/file`,
      formData,
      { headers: { "Content-Type": undefined } },
    );
    showToast(response.data?.message || "Đã lưu file hợp đồng");
    await refreshContractDetail("file");
  } catch (error) {
    showDetailFileError(error);
  }
};

const renderContractSubmitErrors = (errors = []) => {
  const container = document.getElementById("contractSubmitErrors");
  if (!container) return;

  if (!errors.length) {
    container.classList.add("hidden");
    container.innerHTML = "";
    return;
  }

  container.classList.remove("hidden");
  container.innerHTML = `
    <p class="font-label-md text-label-md font-bold text-error">Hợp đồng chưa đủ điều kiện gửi duyệt:</p>
    <ul class="mt-1 list-disc pl-5 space-y-0.5 font-body-sm text-body-sm text-error">
      ${errors.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>`;
};

const openContractSubmitModal = () => {
  const contract = state.detailContract;
  if (!contract) return;

  setText("#contractSubmitCode", contract.contract_code || "—");
  setText(
    "#contractSubmitEmployee",
    `${contract.full_name || "—"}${contract.employee_code ? ` (${contract.employee_code})` : ""}`,
  );
  const note = document.getElementById("contractSubmitNote");
  if (note) note.value = "";
  renderContractSubmitErrors([]);
  openModal("modal-contract-submit-approval");
};

const closeContractSubmitModal = () => {
  closeModal("modal-contract-submit-approval");
};

const confirmContractSubmission = async () => {
  if (!state.detailContract) return;

  const button = document.getElementById("btnConfirmContractSubmit");
  const note = document.getElementById("contractSubmitNote")?.value || "";
  if (button) button.disabled = true;
  renderContractSubmitErrors([]);

  try {
    const response = await api.post(
      `/contracts/${state.detailContract.id}/submit-approval`,
      { note: note.trim() },
    );
    showToast(response.data?.message || "Đã gửi hợp đồng cho Giám đốc phê duyệt");
    closeContractSubmitModal();
    await refreshContractDetail("history");
  } catch (error) {
    renderContractSubmitErrors(error.response?.data?.errors || []);
    showToast(
      error.response?.data?.message || "Không thể gửi hợp đồng. Vui lòng thử lại.",
    );
  } finally {
    if (button) button.disabled = false;
  }
};

const renderContractReviewErrors = (errors = []) => {
  const container = document.getElementById("contractReviewErrors");
  if (!container) return;

  if (!errors.length) {
    container.classList.add("hidden");
    container.innerHTML = "";
    return;
  }

  container.classList.remove("hidden");
  container.innerHTML = `
    <p class="font-label-md text-label-md font-bold text-error">Vui lòng kiểm tra lại:</p>
    <ul class="mt-1 list-disc pl-5 space-y-0.5 font-body-sm text-body-sm text-error">
      ${errors.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>`;
};

const openContractReviewModal = (decision) => {
  const contract = state.detailContract;
  if (!contract) return;

  state.reviewDecision = decision === "REJECT" ? "REJECT" : "APPROVE";
  const isReject = state.reviewDecision === "REJECT";

  setText(
    "#contractReviewTitle",
    isReject ? "Từ chối hợp đồng" : "Phê duyệt hợp đồng",
  );
  setText(
    "#contractReviewSubtitle",
    isReject
      ? "Cung cấp lý do và yêu cầu chỉnh sửa cho HR"
      : "Kiểm tra thông tin trước khi xác nhận",
  );
  setText("#contractReviewCode", contract.contract_code || "—");
  setText(
    "#contractReviewEmployee",
    `${contract.full_name || "—"}${contract.employee_code ? ` (${contract.employee_code})` : ""}`,
  );
  setText(
    "#contractReviewConfirmLabel",
    isReject ? "Xác nhận từ chối" : "Xác nhận phê duyệt",
  );
  setText(
    "#contractReviewConfirmIcon",
    isReject ? "cancel" : "fact_check",
  );
  const rejectionReasonInput = document.getElementById("contractRejectionReason");
  const revisionRequestInput = document.getElementById("contractRevisionRequest");
  if (rejectionReasonInput) rejectionReasonInput.value = "";
  if (revisionRequestInput) revisionRequestInput.value = "";

  const rejectFields = document.getElementById("contractRejectFields");
  if (rejectFields) {
    rejectFields.classList.toggle("hidden", !isReject);
    rejectFields.classList.toggle("flex", isReject);
  }
  renderContractReviewErrors([]);
  openModal("modal-contract-review");
};

const closeContractReviewModal = () => {
  closeModal("modal-contract-review");
};

const confirmContractReview = async () => {
  if (!state.detailContract) return;

  const decision = state.reviewDecision;
  const rejectionReason =
    document.getElementById("contractRejectionReason")?.value.trim() || "";
  const revisionRequest =
    document.getElementById("contractRevisionRequest")?.value.trim() || "";

  if (decision === "REJECT") {
    const errors = [];
    if (!rejectionReason) errors.push("Vui lòng nhập lý do từ chối hợp đồng");
    if (!revisionRequest) errors.push("Vui lòng nhập yêu cầu chỉnh sửa cho nhân viên");
    if (errors.length) {
      renderContractReviewErrors(errors);
      return;
    }
  }

  const button = document.getElementById("btnConfirmContractReview");
  if (button) button.disabled = true;
  renderContractReviewErrors([]);

  try {
    const endpoint = decision === "APPROVE" ? "approve" : "reject";
    const payload =
      decision === "APPROVE"
        ? {}
        : { rejectionReason, revisionRequest };
    const response = await api.post(
      `/contracts/${state.detailContract.id}/${endpoint}`,
      payload,
    );

    showToast(response.data?.message || "Đã cập nhật quyết định phê duyệt");
    closeContractReviewModal();
    await refreshContractDetail("history");
    await loadContracts(state.currentUser || getCurrentUser());
  } catch (error) {
    const errors = error.response?.data?.errors || [];
    renderContractReviewErrors(
      errors.length
        ? errors
        : [error.response?.data?.message || "Không thể cập nhật quyết định phê duyệt"],
    );
    showToast(
      error.response?.data?.message || "Không thể cập nhật quyết định phê duyệt",
    );
  } finally {
    if (button) button.disabled = false;
  }
};

const renderContractSignErrors = (errors = []) => {
  const container = document.getElementById("contractSignErrors");
  if (!container) return;

  if (!errors.length) {
    container.classList.add("hidden");
    container.innerHTML = "";
    return;
  }

  container.classList.remove("hidden");
  container.innerHTML = `
    <ul class="list-disc pl-5 space-y-0.5 font-body-sm text-body-sm text-error">
      ${errors.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>`;
};

const openContractSignModal = () => {
  const contract = state.detailContract;
  const signing = state.detailSigning;
  if (!contract || !signing?.can_sign) return;

  setText("#contractSignCode", contract.contract_code || "—");
  setText(
    "#contractSignEmployee",
    `${contract.full_name || "—"}${contract.employee_code ? ` (${contract.employee_code})` : ""}`,
  );
  setText(
    "#contractSignVersion",
    signing.approved_version_no
      ? `v${signing.approved_version_no}${signing.approved_version_id ? ` (#${signing.approved_version_id})` : ""}`
      : "—",
  );
  const confirmInput = document.getElementById("contractConfirmSignCheck");
  if (confirmInput) confirmInput.checked = false;
  const transactionRef = document.getElementById("contractSignTransactionRef");
  if (transactionRef) transactionRef.value = "";
  renderContractSignErrors([]);
  openModal("modal-contract-sign");
};

const closeContractSignModal = () => {
  closeModal("modal-contract-sign");
};

const confirmContractSign = async () => {
  if (!state.detailContract || !state.detailSigning?.can_sign) return;

  const confirmInput = document.getElementById("contractConfirmSignCheck");
  if (!confirmInput?.checked) {
    renderContractSignErrors(["Vui lòng xác nhận trước khi ký hợp đồng"]);
    return;
  }

  const button = document.getElementById("btnConfirmContractSign");
  if (button) button.disabled = true;
  renderContractSignErrors([]);

  try {
    const response = await api.post(`/contracts/${state.detailContract.id}/sign`, {
      confirm: true,
      transactionRef:
        document.getElementById("contractSignTransactionRef")?.value.trim() || "",
    });
    showToast(response.data?.message || "Đã ký chính thức hợp đồng");
    closeContractSignModal();
    await refreshContractDetail("signing");
    await loadContracts(state.currentUser || getCurrentUser());
  } catch (error) {
    const errors = error.response?.data?.errors || [];
    renderContractSignErrors(
      errors.length
        ? errors
        : [error.response?.data?.message || "Không thể ký hợp đồng. Vui lòng thử lại."],
    );
    showToast(
      error.response?.data?.message || "Không thể ký hợp đồng. Vui lòng thử lại.",
    );
  } finally {
    if (button) button.disabled = false;
  }
};

const renderContractSigningRevisionErrors = (errors = []) => {
  const container = document.getElementById("contractSigningRevisionErrors");
  if (!container) return;

  if (!errors.length) {
    container.classList.add("hidden");
    container.innerHTML = "";
    return;
  }

  container.classList.remove("hidden");
  container.innerHTML = `
    <ul class="list-disc pl-5 space-y-0.5 font-body-sm text-body-sm text-error">
      ${errors.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>`;
};

const openContractSigningRevisionModal = () => {
  const contract = state.detailContract;
  const signing = state.detailSigning;
  if (!contract || !signing?.can_request_revision) return;

  setText("#contractSigningRevisionCode", contract.contract_code || "—");
  setText(
    "#contractSigningRevisionEmployee",
    `${contract.full_name || "—"}${contract.employee_code ? ` (${contract.employee_code})` : ""}`,
  );
  const reason = document.getElementById("contractSigningRevisionReason");
  const request = document.getElementById("contractSigningRevisionRequest");
  if (reason) reason.value = "";
  if (request) request.value = "";
  renderContractSigningRevisionErrors([]);
  openModal("modal-contract-signing-revision");
};

const closeContractSigningRevisionModal = () => {
  closeModal("modal-contract-signing-revision");
};

const confirmContractSigningRevision = async () => {
  if (!state.detailContract || !state.detailSigning?.can_request_revision) return;

  const rejectionReason =
    document.getElementById("contractSigningRevisionReason")?.value.trim() || "";
  const revisionRequest =
    document.getElementById("contractSigningRevisionRequest")?.value.trim() || "";
  const errors = [];
  if (!rejectionReason) errors.push("Vui lòng nhập lý do yêu cầu chỉnh sửa");
  if (!revisionRequest) errors.push("Vui lòng nhập nội dung cần chỉnh sửa");
  if (errors.length) {
    renderContractSigningRevisionErrors(errors);
    return;
  }

  const button = document.getElementById("btnConfirmContractSigningRevision");
  if (button) button.disabled = true;
  renderContractSigningRevisionErrors([]);

  try {
    const response = await api.post(
      `/contracts/${state.detailContract.id}/request-signing-revision`,
      { rejectionReason, revisionRequest },
    );
    showToast(response.data?.message || "Đã gửi yêu cầu chỉnh sửa cho HR");
    closeContractSigningRevisionModal();
    await refreshContractDetail("history");
    await loadContracts(state.currentUser || getCurrentUser());
  } catch (error) {
    const errors = error.response?.data?.errors || [];
    renderContractSigningRevisionErrors(
      errors.length
        ? errors
        : [
            error.response?.data?.message ||
              "Không thể gửi yêu cầu chỉnh sửa. Vui lòng thử lại.",
          ],
    );
    showToast(
      error.response?.data?.message ||
        "Không thể gửi yêu cầu chỉnh sửa. Vui lòng thử lại.",
    );
  } finally {
    if (button) button.disabled = false;
  }
};

const downloadContractOfficialFile = async () => {
  if (!state.detailContract) return;
  try {
    const response = await api.get(
      `/contracts/${state.detailContract.id}/official-file`,
      { responseType: "blob", params: { _: Date.now() } },
    );
    downloadBlobFile(
      new Blob([response.data]),
      state.detailSigning?.official_file?.file_name || "hop-dong-chinh-thuc.docx",
    );
  } catch (error) {
    showDetailFileError(error);
  }
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
    state.canApprove = Boolean(payload.can_approve);
    state.canSign =
      Boolean(payload.can_sign) && hasPermission("HR.CONTRACT_SIGN", user);
    state.currentUser = user;

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

const submitDraftForm = async (user) => {
  const submitButton = document.getElementById("contractFormSubmit");
  const originalHtml = submitButton?.innerHTML || "";

  const valueOf = (id) =>
    String(document.getElementById(id)?.value || "").trim();

  const employeeId = valueOf("contractEmployee");
  const contractCode = valueOf("contractCode");
  const contractType = valueOf("contractTemplateType") || valueOf("contractType");
  const selectedTemplate = getTemplateForType(contractType);
  const startDate = valueOf("contractStart");
  const endDate = valueOf("contractEnd");
  const salary = valueOf("contractSalary");
  const allowance = valueOf("contractInsurance");
  const note = valueOf("contractNote");
  const templateId = selectedTemplate?.id ? String(selectedTemplate.id) : "";
  const file = document.getElementById("contractFileInput")?.files?.[0] || null;

  if (!employeeId) return setFormError("Vui lòng chọn nhân viên ký hợp đồng.");
  if (!valueOf("contractEmployeeCode")) {
    return setFormError("Mã nhân viên không được để trống.");
  }
  if (!valueOf("contractEmployeeName")) {
    return setFormError("Họ tên nhân viên không được để trống.");
  }
  if (!valueOf("contractDob")) {
    return setFormError("Ngày sinh nhân viên không được để trống.");
  }
  if (!valueOf("contractAddress")) {
    return setFormError("Địa chỉ nhân viên không được để trống.");
  }
  if (!valueOf("contractPhone")) {
    return setFormError("Số điện thoại nhân viên không được để trống.");
  }
  if (!contractCode) return setFormError("Mã hợp đồng không được để trống.");
  if (!contractType) return setFormError("Vui lòng chọn loại hợp đồng.");
  if (!startDate) return setFormError("Vui lòng chọn ngày bắt đầu.");
  if (!isIndefiniteType(contractType) && !endDate) {
    return setFormError("Vui lòng chọn ngày kết thúc của hợp đồng.");
  }
  if (endDate && endDate < startDate) {
    return setFormError("Ngày kết thúc phải sau ngày bắt đầu.");
  }
  if (salary === "" || Number(salary) < 0) {
    return setFormError("Lương ký hợp đồng không hợp lệ.");
  }
  if (allowance === "" || Number(allowance) < 0) {
    return setFormError("Lương đóng BHXH không hợp lệ.");
  }

  if (state.creationMethod === "FROM_TEMPLATE") {
    if (!templateId || !selectedTemplate?.has_file) {
      return setFormError("Loại hợp đồng này chưa có file mẫu. Vui lòng upload mẫu hoặc chọn Upload file DOCX.");
    }
  } else {
    if (!file) return setFormError("Vui lòng upload file hợp đồng DOCX.");
    if (!/\.docx$/i.test(file.name)) {
      return setFormError("Chỉ chấp nhận file hợp đồng định dạng .docx.");
    }
    if (file.size > 10 * 1024 * 1024) {
      return setFormError("File hợp đồng không được vượt quá 10MB.");
    }
  }

  const hiddenType = document.getElementById("contractType");
  if (hiddenType) hiddenType.value = contractType;

  const formData = new FormData();
  const fields = {
    employee_id: employeeId,
    contract_code: contractCode,
    contract_type: contractType,
    start_date: startDate,
    end_date: isIndefiniteType(contractType) ? "" : endDate,
    base_salary: salary,
    allowance,
    creation_method: state.creationMethod,
    template_id: state.creationMethod === "FROM_TEMPLATE" ? templateId : "",
    employee_code: valueOf("contractEmployeeCode"),
    employee_name: valueOf("contractEmployeeName"),
    employee_dob: valueOf("contractDob"),
    employee_gender: valueOf("contractGender"),
    employee_address: valueOf("contractAddress"),
    employee_phone: valueOf("contractPhone"),
    employee_email: valueOf("contractEmail"),
    employee_department: valueOf("contractDepartmentName"),
    employee_position: valueOf("contractPositionName"),
    note,
  };

  Object.entries(fields).forEach(([key, fieldValue]) => {
    formData.append(key, fieldValue);
  });

  if (state.creationMethod === "UPLOAD_DOCX" && file) {
    formData.append("file", file);
  }

  try {
    setFormError("");
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.innerHTML =
        '<span class="w-4 h-4 rounded-full border-2 border-on-primary border-t-transparent animate-spin"></span><span>Đang lưu...</span>';
    }

    await api.post("/contracts/draft", formData, {
      headers: { "Content-Type": undefined },
    });

    closeModal("modal-contract-form");
    showToast("Đã lưu hợp đồng ở dạng bản nháp");
    await loadContracts(user);
  } catch (error) {
    setFormError(
      error.response?.data?.message ||
        "Không thể lưu bản nháp hợp đồng. Vui lòng kiểm tra lại dữ liệu.",
    );
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML = originalHtml;
    }
  }
};

const submitContractForm = async (event, user) => {
  event.preventDefault();

  if (state.formMode === "create") {
    await submitDraftForm(user);
    return;
  }

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
    } else if (action === "review" || action === "rework") {
      openContractDetail(contract.id, "file");
    } else if (action === "sign") {
      openContractDetail(contract.id, "signing");
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

  document.getElementById("contractEmployee")?.addEventListener("change", (event) => {
    applyEmployeeSelection(event.target.value);
  });

  document.querySelectorAll('input[name="contractCreationMethod"]').forEach((radio) => {
    radio.addEventListener("change", (event) => {
      state.creationMethod = event.target.value;
      syncCreationMethodUI();
      setFormError("");
    });
  });

  document
    .getElementById("contractTemplateType")
    ?.addEventListener("change", syncSelectedTemplateType);

  document
    .getElementById("btnViewTemplateFile")
    ?.addEventListener("click", loadTemplatePreview);

  document
    .getElementById("btnEditTemplateFile")
    ?.addEventListener("click", openTemplateEditor);

  document
    .getElementById("btnSaveTemplateFile")
    ?.addEventListener("click", () => downloadTemplateFile());

  document
    .getElementById("btnReplaceTemplateFile")
    ?.addEventListener("click", () => openTemplateFilePicker(true));

  document
    .getElementById("btnPickTemplateUpload")
    ?.addEventListener("click", () => openTemplateFilePicker(false));

  document
    .getElementById("contractTemplateUploadInput")
    ?.addEventListener("change", (event) => {
      const file = event.target.files?.[0] || null;
      const replace = state.templateUploadReplace;
      state.templateUploadReplace = false;
      uploadTemplateFile(file, replace);
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

  document.querySelectorAll("[data-contract-detail-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextTab = button.dataset.contractDetailTab || "info";
      if (nextTab !== "file" && state.detailTab === "file") {
        destroyDocumentViewer();
      }
      state.detailTab = nextTab;
      state.detailError = "";
      renderContractDetail();
      if (nextTab === "file" && state.detailFile) {
        loadDocumentViewer("view");
      }
    });
  });

  document
    .getElementById("modal-contract-detail")
    ?.addEventListener("click", (event) => {
      if (event.target.closest("[data-detail-retry]")) {
        refreshContractDetail();
        return;
      }

      if (event.target.closest("#contractDetailApprove")) {
        openContractReviewModal("APPROVE");
        return;
      }

      if (event.target.closest("#contractDetailReject")) {
        openContractReviewModal("REJECT");
        return;
      }

      if (event.target.closest("#contractDetailSign")) {
        openContractSignModal();
        return;
      }

      if (event.target.closest("#contractDetailRequestSigningRevision")) {
        openContractSigningRevisionModal();
        return;
      }

      if (event.target.closest('[data-signing-action="download-official"]')) {
        downloadContractOfficialFile();
        return;
      }

      if (event.target.closest("#btnPickContractFile")) {
        document.getElementById("contractFileUploadInput")?.click();
        return;
      }

      if (event.target.closest("#btnSubmitContractApproval")) {
        openContractSubmitModal();
        return;
      }

      const viewerAction = event.target.closest("[data-viewer-action]");
      if (viewerAction) {
        adjustDocumentViewer(viewerAction.dataset.viewerAction);
        return;
      }

      const versionAction = event.target.closest("[data-version-action]");
      if (versionAction) {
        handleVersionAction(
          versionAction.dataset.versionAction,
          versionAction.dataset.versionId,
        );
        return;
      }

      const fileAction = event.target.closest("[data-detail-file-action]");
      if (!fileAction) return;

      if (fileAction.dataset.detailFileAction === "view") {
        viewContractDetailFile();
      } else if (fileAction.dataset.detailFileAction === "download") {
        downloadContractDetailFile();
      }
    });

  document
    .getElementById("modal-contract-detail")
    ?.addEventListener("change", (event) => {
      if (event.target.id !== "contractFileUploadInput") return;
      const file = event.target.files?.[0] || null;
      event.target.value = "";
      uploadContractDetailFile(file);
    });

  document
    .getElementById("btnCloseContractSubmit")
    ?.addEventListener("click", closeContractSubmitModal);
  document
    .getElementById("btnCancelContractSubmit")
    ?.addEventListener("click", closeContractSubmitModal);
  document
    .getElementById("btnConfirmContractSubmit")
    ?.addEventListener("click", confirmContractSubmission);
  document
    .getElementById("modal-contract-submit-approval")
    ?.addEventListener("click", (event) => {
      if (event.target.id === "modal-contract-submit-approval") {
        closeContractSubmitModal();
      }
    });

  document
    .getElementById("btnCloseContractReview")
    ?.addEventListener("click", closeContractReviewModal);
  document
    .getElementById("btnCancelContractReview")
    ?.addEventListener("click", closeContractReviewModal);
  document
    .getElementById("btnConfirmContractReview")
    ?.addEventListener("click", confirmContractReview);
  document
    .getElementById("modal-contract-review")
    ?.addEventListener("click", (event) => {
      if (event.target.id === "modal-contract-review") {
        closeContractReviewModal();
      }
    });

  document
    .getElementById("btnCloseContractSign")
    ?.addEventListener("click", closeContractSignModal);
  document
    .getElementById("btnCancelContractSign")
    ?.addEventListener("click", closeContractSignModal);
  document
    .getElementById("btnConfirmContractSign")
    ?.addEventListener("click", confirmContractSign);
  document
    .getElementById("modal-contract-sign")
    ?.addEventListener("click", (event) => {
      if (event.target.id === "modal-contract-sign") {
        closeContractSignModal();
      }
    });

  document
    .getElementById("btnCloseContractSigningRevision")
    ?.addEventListener("click", closeContractSigningRevisionModal);
  document
    .getElementById("btnCancelContractSigningRevision")
    ?.addEventListener("click", closeContractSigningRevisionModal);
  document
    .getElementById("btnConfirmContractSigningRevision")
    ?.addEventListener("click", confirmContractSigningRevision);
  document
    .getElementById("modal-contract-signing-revision")
    ?.addEventListener("click", (event) => {
      if (event.target.id === "modal-contract-signing-revision") {
        closeContractSigningRevisionModal();
      }
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
    if (document.getElementById("modal-template-editor")?.classList.contains("flex")) {
      closeTemplateEditor();
    }
    closeModal("modal-contract-form");
    closeModal("modal-contract-terminate");
    closeModal("modal-template-preview");
    closeContractSubmitModal();
    closeContractReviewModal();
    closeContractSignModal();
    closeContractSigningRevisionModal();
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
  state.canApprove = String(user?.role_id || "").toUpperCase() === "DIRECTOR";
  state.canSign = hasPermission("HR.CONTRACT_SIGN", user);
  state.currentUser = user;

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

  if (!contractOpenHandlerBound) {
    contractOpenHandlerBound = true;
    window.addEventListener("hrm:open-contract", (event) => {
      const contractId = Number(event.detail?.contractId);
      if (contractId) openContractDetail(contractId, "history");
    });
  }
};
