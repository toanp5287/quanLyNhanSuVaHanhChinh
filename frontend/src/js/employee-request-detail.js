import employeeRequestDetailHtml from "../pages/employee-request-detail.html?raw";
import api from "../services/api.js";
import {
  getCurrentUser,
  hasPermission,
  logout,
} from "../services/auth.service.js";
import { setupShell } from "./home.js";
import {
  REQUEST_TYPES,
  STATUS_META,
} from "./employee-requests.js";

const ACTION_META = {
  SUBMIT: { label: "Gửi đơn", icon: "send", color: "text-primary bg-primary-fixed" },
  APPROVE: { label: "Phê duyệt", icon: "check_circle", color: "text-emerald-700 bg-emerald-100" },
  REJECT: { label: "Từ chối", icon: "cancel", color: "text-red-700 bg-red-100" },
  REQUEST_UPDATE: { label: "Yêu cầu bổ sung", icon: "fact_check", color: "text-orange-700 bg-orange-100" },
  RESUBMIT: { label: "Gửi lại hồ sơ", icon: "send", color: "text-indigo-700 bg-indigo-100" },
  CHECK: { label: "Kiểm tra hồ sơ", icon: "fact_check", color: "text-blue-700 bg-blue-100" },
  RECEIVE: { label: "Tiếp nhận hồ sơ bổ sung", icon: "inventory_2", color: "text-emerald-700 bg-emerald-100" },
};

const APPROVAL_STAGE_META = {
  SUBMIT: { label: "Nhân viên gửi đơn", icon: "person", color: "text-primary bg-primary-fixed" },
  RESUBMIT: { label: "Nhân viên gửi lại hồ sơ", icon: "person", color: "text-indigo-700 bg-indigo-100" },
  CHECK: { label: "HR kiểm tra hồ sơ", icon: "fact_check", color: "text-blue-700 bg-blue-100" },
  RECEIVE: { label: "HR tiếp nhận bổ sung", icon: "inventory_2", color: "text-emerald-700 bg-emerald-100" },
  REQUEST_UPDATE: { label: "HR yêu cầu bổ sung", icon: "fact_check", color: "text-orange-700 bg-orange-100" },
};

const APPROVER_ROLES = ["MANAGER", "DIRECTOR", "HR_ADMIN"];

const WORK_STATUS_LABEL = {
  WORKING: "Đang làm việc",
  MATERNITY: "Nghỉ thai sản",
  RESIGNED: "Đã nghỉ việc",
};

const CONTRACT_STATUS_META = {
  ACTIVE: { label: "Hiệu lực", badge: "bg-emerald-100 text-emerald-700" },
  EXPIRING_SOON: { label: "Sắp hết hạn", badge: "bg-amber-100 text-amber-700" },
  EXPIRED: { label: "Hết hạn", badge: "bg-red-100 text-red-700" },
  TERMINATED: { label: "Chấm dứt", badge: "bg-surface-container-high text-on-surface-variant" },
};

const LEAVE_STATUS_META = {
  PENDING: { label: "Chờ duyệt", badge: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "Đã duyệt", badge: "bg-emerald-100 text-emerald-700" },
  REJECTED: { label: "Từ chối", badge: "bg-red-100 text-red-700" },
};

const state = {
  request: null,
  requestSeq: 0,
  currentUser: null,
};

export const getEmployeeRequestIdFromHash = (
  hash = window.location.hash,
) => {
  const match = hash.match(
    /^#\/(?:don-tu|duyet-don|hr-don-tu|giam-doc-don-tu)\/(\d+)$/,
  );
  return match ? Number(match[1]) : null;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatDate = (value) => {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  if (!year || !month || !day) return escapeHtml(value);
  return `${day}/${month}/${year}`;
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatMoney = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (Number.isNaN(number)) return escapeHtml(value);
  return `${new Intl.NumberFormat("vi-VN").format(number)} đ`;
};

const errorMessage = (reason, fallback) =>
  reason?.response?.data?.message || fallback;

const setText = (selector, value) => {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
};

const showNotice = (message, isError = false) => {
  const notice = document.getElementById("employeeRequestDetailNotice");
  if (!notice) return;
  notice.textContent = message;
  notice.className = isError
    ? "flex items-start gap-space-sm rounded-lg border px-space-md py-space-sm font-body-sm text-body-sm border-error/30 bg-error-container text-on-error-container"
    : "flex items-start gap-space-sm rounded-lg border px-space-md py-space-sm font-body-sm text-body-sm border-primary/30 bg-primary-fixed text-on-primary-fixed";
};

const hideNotice = () => {
  const notice = document.getElementById("employeeRequestDetailNotice");
  if (!notice) return;
  notice.textContent = "";
  notice.className = "hidden";
};

const ensureViewMounted = () => {
  if (!window.__HRM_SPA__) return;

  const main = document.querySelector("main");
  if (!main) return;

  const doc = new DOMParser().parseFromString(
    employeeRequestDetailHtml,
    "text/html",
  );
  const view = doc.querySelector("main > div");
  if (!view) return;

  main.innerHTML = "";
  main.appendChild(document.importNode(view, true));
};

const statusBadge = (status) => {
  const meta = STATUS_META[status] || {
    label: status || "—",
    badge: "bg-surface-container-high text-on-surface-variant",
  };
  return `<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-label-sm text-label-sm ${meta.badge}">
    <span class="w-1.5 h-1.5 rounded-full bg-current opacity-70"></span>
    ${escapeHtml(meta.label)}
  </span>`;
};

const statusLabel = (status) => STATUS_META[status]?.label || status || "—";

const approvalStage = (action, request) => {
  if (action.action === "APPROVE" || action.action === "REJECT") {
    const decision = action.action === "REJECT" ? "từ chối" : "phê duyệt";
    if (action.from_status === "PENDING_DEPARTMENT") {
      return {
        label: `Quản lý ${decision}`,
        icon: decision === "từ chối" ? "cancel" : "check_circle",
        color: decision === "từ chối" ? "text-red-700 bg-red-100" : "text-emerald-700 bg-emerald-100",
      };
    }
    if (action.from_status === "PENDING_HR") {
      const isForward =
        action.action === "APPROVE" && request.request_type === "RESIGNATION";
      return {
        label: isForward ? "HR trình Giám đốc" : `HR ${decision}`,
        icon: isForward ? "forward_to_inbox" : decision === "từ chối" ? "cancel" : "check_circle",
        color: isForward ? "text-blue-700 bg-blue-100" : decision === "từ chối" ? "text-red-700 bg-red-100" : "text-emerald-700 bg-emerald-100",
      };
    }
    if (action.from_status === "PENDING_DIRECTOR") {
      return {
        label: `Giám đốc ${decision}`,
        icon: decision === "từ chối" ? "cancel" : "check_circle",
        color: decision === "từ chối" ? "text-red-700 bg-red-100" : "text-purple-700 bg-purple-100",
      };
    }
  }

  return (
    APPROVAL_STAGE_META[action.action] || {
      label: ACTION_META[action.action]?.label || action.action || "Hoạt động",
      icon: "history",
      color: "bg-surface-container-high text-on-surface-variant",
    }
  );
};

const buildProgressSteps = (request) => {
  const steps = [
    { label: "Gửi đơn", statuses: ["DRAFT", "PENDING_DEPARTMENT", "PENDING_HR", "WAITING_EMPLOYEE_UPDATE", "PENDING_DIRECTOR", "APPROVED"] },
    { label: "Quản lý duyệt", statuses: ["PENDING_DEPARTMENT", "PENDING_HR", "WAITING_EMPLOYEE_UPDATE", "PENDING_DIRECTOR", "APPROVED"] },
    { label: "HR kiểm tra", statuses: ["PENDING_HR", "WAITING_EMPLOYEE_UPDATE", "PENDING_DIRECTOR", "APPROVED"] },
  ];

  if (request.request_type === "RESIGNATION") {
    steps.push({
      label: "Giám đốc duyệt",
      statuses: ["PENDING_DIRECTOR", "APPROVED"],
    });
  }

  steps.push({ label: "Hoàn tất", statuses: ["APPROVED"] });

  let currentIndex = steps.findIndex((step) =>
    step.statuses.includes(request.status),
  );
  if (request.status === "DRAFT") currentIndex = 0;
  if (request.status === "REJECTED" || request.status === "CANCELLED") {
    currentIndex = -1;
  }

  return steps.map((step, index) => {
    const done =
      currentIndex >= 0 &&
      (index < currentIndex ||
        (request.status === "APPROVED" && index === currentIndex));
    const current = index === currentIndex;
    const cancelled = currentIndex === -1 && index === 0;

    return `
      <div class="flex-1 min-w-[140px] flex flex-col gap-space-xs">
        <div class="h-1.5 rounded-full ${
          done || cancelled
            ? "bg-emerald-500"
            : current
              ? "bg-primary"
              : "bg-surface-container-high"
        }"></div>
        <div class="flex items-center gap-1.5">
          <span class="w-6 h-6 rounded-full flex items-center justify-center ${
            done || cancelled
              ? "bg-emerald-100 text-emerald-700"
              : current
                ? "bg-primary-fixed text-on-primary-fixed"
                : "bg-surface-container-high text-on-surface-variant"
          }">
            <span class="material-symbols-outlined text-[15px]">${
              done ? "check" : current ? "radio_button_checked" : "radio_button_unchecked"
            }</span>
          </span>
          <span class="font-label-md text-label-md ${
            current ? "text-primary font-bold" : "text-on-surface-variant"
          }">${escapeHtml(step.label)}</span>
        </div>
      </div>
    `;
  });
};

const safeUrl = (value) => {
  const url = String(value || "");
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  return "";
};

const renderAttachments = (request) => {
  const list = document.getElementById("detailAttachmentList");
  const count = document.getElementById("detailAttachmentCount");
  if (!list) return;

  const attachments = Array.isArray(request.attachments) ? request.attachments : [];
  if (count) {
    count.textContent = `${attachments.length} file`;
  }

  if (!attachments.length) {
    list.innerHTML = `
      <div class="rounded border border-dashed border-surface-variant px-space-md py-space-md text-center text-on-surface-variant font-body-sm text-body-sm">
        Chưa có file đính kèm. Backend hiện chưa cung cấp API tải lên/tải xuống file cho đơn từ.
      </div>
    `;
    return;
  }

  list.innerHTML = attachments
    .map((file) => {
      const url = safeUrl(
        file.file_url || file.url || file.download_url || file.file_path,
      );
      const name = escapeHtml(file.file_name || file.original_name || "File đính kèm");
      if (!url) {
        return `<div class="flex items-center justify-between gap-space-sm rounded border border-surface-variant px-space-md py-space-sm">
          <span class="font-body-sm text-body-sm text-on-surface">${name}</span>
          <span class="font-label-sm text-label-sm text-on-surface-variant">Không có đường dẫn tải</span>
        </div>`;
      }

      return `<a
        class="flex items-center justify-between gap-space-sm rounded border border-surface-variant hover:bg-surface-container-low px-space-md py-space-sm transition-colors"
        href="${escapeHtml(url)}"
        target="_blank"
        rel="noopener noreferrer"
        download="${name}"
      >
        <span class="flex items-center gap-space-xs min-w-0">
          <span class="material-symbols-outlined text-primary shrink-0">description</span>
          <span class="font-body-sm text-body-sm text-on-surface truncate">${name}</span>
        </span>
        <span class="inline-flex items-center gap-1 font-label-sm text-label-sm text-primary shrink-0">
          <span class="material-symbols-outlined text-[16px]">download</span>
          Tải xuống
        </span>
      </a>`;
    })
    .join("");
};

const renderApprovalHistory = (request) => {
  const container = document.getElementById("detailApprovalHistory");
  if (!container) return;

  const timeline = Array.isArray(request.timeline) ? request.timeline : [];
  if (!timeline.length) {
    container.innerHTML = `
      <p class="font-body-sm text-body-sm text-on-surface-variant">Chưa có lịch sử duyệt các cấp.</p>
    `;
    return;
  }

  container.innerHTML = timeline
    .map((action, index) => {
      const stage = approvalStage(action, request);
      const meta = ACTION_META[action.action] || {
        label: action.action || "Hoạt động",
        icon: "history",
      };

      return `
        <div class="relative pl-9 pb-space-md last:pb-0">
          ${
            index < timeline.length - 1
              ? `<span class="absolute left-[11px] top-7 bottom-0 w-px bg-surface-variant"></span>`
              : ""
          }
          <span class="absolute left-0 top-0 w-6 h-6 rounded-full flex items-center justify-center ${stage.color}">
            <span class="material-symbols-outlined text-[15px]">${stage.icon}</span>
          </span>
          <div class="flex flex-wrap items-center justify-between gap-space-xs">
            <p class="font-body-md text-body-md font-semibold text-on-surface">
              ${escapeHtml(stage.label)}
            </p>
            <span class="font-label-sm text-label-sm text-on-surface-variant">${formatDateTime(action.created_at)}</span>
          </div>
          <p class="font-label-sm text-label-sm text-on-surface-variant">
            ${escapeHtml(action.actor_name || "Hệ thống")} • ${escapeHtml(meta.label)}
          </p>
          <p class="font-label-sm text-label-sm text-on-surface-variant mt-0.5">
            ${escapeHtml(statusLabel(action.from_status))} → ${escapeHtml(statusLabel(action.to_status))}
          </p>
          ${
            action.comment
              ? `<p class="whitespace-pre-wrap font-body-sm text-body-sm text-on-surface mt-1">${escapeHtml(action.comment)}</p>`
              : ""
          }
        </div>
      `;
    })
    .join("");
};

const renderResubmitSection = (request) => {
  const box = document.getElementById("detailUpdateBox");
  if (!box) return;

  const isWaiting = request.status === "WAITING_EMPLOYEE_UPDATE";
  box.classList.toggle("hidden", !isWaiting);

  if (!isWaiting) return;

  const timeline = Array.isArray(request.timeline) ? request.timeline : [];
  const updateAction = [...timeline]
    .reverse()
    .find((action) => action.action === "REQUEST_UPDATE");

  setText(
    "#detailUpdateContent",
    updateAction?.comment ||
      "HR đã yêu cầu bổ sung hồ sơ. Vui lòng cập nhật nội dung và gửi lại đơn.",
  );
};

const canViewHrProfile = () =>
  state.currentUser?.role_id === "HR_ADMIN" &&
  (hasPermission("HR.PROFILE_MANAGE", state.currentUser) ||
    hasPermission("HR.PROFILE_VIEW", state.currentUser));

const renderHrActions = (request) => {
  const section = document.getElementById("detailHrActionsSection");
  const isSelf =
    Number(request.employee_id) === Number(state.currentUser?.employee_id);
  const visible =
    canViewHrProfile() && request.status === "PENDING_HR" && !isSelf;
  section?.classList.toggle("hidden", !visible);
  if (!visible) return;

  setText(
    "#btnHrForwardDetail",
    request.request_type === "RESIGNATION" ? "Trình Giám đốc" : "Duyệt đơn",
  );

  const hasSupplement =
    request.has_pending_supplement === true ||
    Number(request.has_pending_supplement) === 1;
  document.getElementById("btnHrReceiveDetail")?.classList.toggle("hidden", !hasSupplement);
};

const renderDirectorActions = (request) => {
  const section = document.getElementById("detailDirectorActionsSection");
  if (!section) return;

  const isSelf =
    Number(request.employee_id) === Number(state.currentUser?.employee_id);
  const visible =
    state.currentUser?.role_id === "DIRECTOR" &&
    request.status === "PENDING_DIRECTOR" &&
    !isSelf;

  section.classList.toggle("hidden", !visible);
};

const runDetailHrAction = async (action, button, message) => {
  const id = state.request?.id;
  if (!id) return;

  hideNotice();
  const originalHtml = button.innerHTML;
  button.disabled = true;
  button.innerHTML = "<span>Đang xử lý...</span>";

  try {
    const response = await api.post(`/employee-requests/${id}/${action}`, {
      note: "",
    });
    const nextStatus = response.data?.data?.status;
    const successMessage =
      nextStatus === "PENDING_DIRECTOR"
        ? `Đã trình Giám đốc đơn #${id}.`
        : message(`#${id}`);
    showNotice(successMessage, false);
    await loadDetail(id);
  } catch (error) {
    showNotice(
      error.response?.data?.message || "Không thể thực hiện thao tác. Vui lòng thử lại.",
      true,
    );
  } finally {
    button.disabled = false;
    button.innerHTML = originalHtml;
  }
};

const runDirectorApprove = async (button) => {
  const id = state.request?.id;
  if (!id) return;

  hideNotice();
  const originalHtml = button.innerHTML;
  button.disabled = true;
  button.innerHTML = "<span>Đang duyệt...</span>";

  try {
    await api.post(`/employee-requests/${id}/approve`, {
      note: "Giám đốc phê duyệt",
    });
    await loadDetail(id);
    showNotice(`Đã duyệt đơn #${id}.`, false);
  } catch (error) {
    showNotice(errorMessage(error, "Không thể duyệt đơn. Vui lòng thử lại."), true);
  } finally {
    button.disabled = false;
    button.innerHTML = originalHtml;
  }
};

const showDirectorRejectError = (message) => {
  const error = document.getElementById("directorRejectError");
  if (!error) return;
  error.textContent = message;
  error.classList.remove("hidden");
};

const hideDirectorRejectError = () => {
  const error = document.getElementById("directorRejectError");
  if (!error) return;
  error.textContent = "";
  error.classList.add("hidden");
};

const openDirectorRejectModal = () => {
  const modal = document.getElementById("modal-director-reject-request");
  const form = document.getElementById("directorRejectRequestForm");
  if (!modal || !form) return;

  form.reset();
  hideDirectorRejectError();
  setText("#directorRejectSubtitle", `Đơn #${state.request?.id ?? "—"}`);
  modal.classList.remove("hidden");
  modal.classList.add("flex");
};

const closeDirectorRejectModal = () => {
  const modal = document.getElementById("modal-director-reject-request");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
};

const submitDirectorReject = async (event) => {
  event.preventDefault();
  const id = state.request?.id;
  if (!id) return;

  hideDirectorRejectError();
  const reason = document.getElementById("directorRejectReason")?.value.trim();
  if (!reason) {
    showDirectorRejectError("Vui lòng nhập lý do từ chối.");
    return;
  }

  const button = document.getElementById("btnConfirmDirectorReject");
  const originalHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = "<span>Đang gửi...</span>";
  }

  try {
    await api.post(`/employee-requests/${id}/reject`, {
      reject_reason: reason,
    });
    closeDirectorRejectModal();
    await loadDetail(id);
    showNotice(`Đã từ chối đơn #${id}.`, false);
  } catch (error) {
    showDirectorRejectError(
      errorMessage(error, "Không thể từ chối đơn. Vui lòng thử lại."),
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }
};

const fetchProfileByEmployee = async (request) => {
  const code = request.employee_code || request.employee_code_at_submit;
  const response = await api.get("/employees", {
    params: {
      status: "ALL",
      ...(code ? { keyword: code } : {}),
    },
  });
  const employees = response.data?.data?.employees || [];
  return (
    employees.find(
      (employee) => Number(employee.id) === Number(request.employee_id),
    ) ||
    employees.find((employee) => employee.employee_code === code) ||
    null
  );
};

const fetchContractsByEmployee = async (request) => {
  const code = request.employee_code || request.employee_code_at_submit;
  const response = await api.get("/contracts", {
    params: code ? { keyword: code } : {},
  });
  const contracts = response.data?.data?.contracts || [];
  return contracts.filter(
    (contract) =>
      Number(contract.employee_id) === Number(request.employee_id) ||
      contract.employee_code === code,
  );
};

const fetchLeaveBalance = async (request) => {
  const response = await api.get("/leave/balances", {
    params: {
      employee_id: request.employee_id,
      year: new Date().getFullYear(),
    },
  });
  const data = response.data?.data;
  return Array.isArray(data) ? data[0] || null : data || null;
};

const fetchLeaveRequests = async (request) => {
  const response = await api.get("/leave/requests", {
    params: { employee_id: request.employee_id },
  });
  const data = response.data?.data;
  return Array.isArray(data) ? data : [];
};

const settledValue = (result, fallback = null) =>
  result?.status === "fulfilled" ? result.value : fallback;

const settledError = (result, fallback) =>
  result?.status === "rejected" ? errorMessage(result.reason, fallback) : null;

const hrNoteBlock = (title, message) => `
  <div class="rounded-lg border border-surface-variant p-space-md">
    <h3 class="font-label-lg text-label-lg font-bold text-on-surface mb-1">${escapeHtml(title)}</h3>
    <p class="font-body-sm text-body-sm text-on-surface-variant">${escapeHtml(message)}</p>
  </div>
`;

const renderHrInfoBlock = (employee, error) => {
  if (error) return hrNoteBlock("Thông tin hồ sơ", error);
  if (!employee) {
    return hrNoteBlock("Thông tin hồ sơ", "Không tìm thấy hồ sơ nhân viên tương ứng.");
  }

  const rows = [
    ["Họ tên", employee.full_name],
    ["Mã nhân viên", employee.employee_code],
    ["Chức danh", employee.position_title || employee.position_name],
    ["Phòng ban", employee.department_name],
    [
      "Trạng thái",
      WORK_STATUS_LABEL[employee.work_status] || employee.work_status,
    ],
    ["Ngày vào làm", formatDate(employee.hire_date)],
    ["Điện thoại", employee.phone],
    ["Email", employee.email],
    ["Cấp bậc", employee.grade_level],
    ["CCCD/Hộ chiếu", employee.citizen_id],
  ];

  return `
    <div class="rounded-lg border border-surface-variant p-space-md">
      <h3 class="font-label-lg text-label-lg font-bold text-on-surface mb-space-sm">
        Thông tin hồ sơ
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-space-md">
        ${rows
          .map(
            ([label, value]) => `
              <div>
                <p class="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">${escapeHtml(label)}</p>
                <p class="font-body-md text-body-md text-on-surface font-semibold">${escapeHtml(value ?? "—")}</p>
              </div>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
};

const renderHrContractsBlock = (contracts, error, canView) => {
  if (!canView) {
    return hrNoteBlock(
      "Hợp đồng lao động",
      "Bạn không có quyền xem hợp đồng của nhân viên.",
    );
  }
  if (error) return hrNoteBlock("Hợp đồng lao động", error);

  const rows = (contracts || [])
    .slice()
    .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))
    .slice(0, 3);

  if (!rows.length) {
    return hrNoteBlock("Hợp đồng lao động", "Không có hợp đồng nào được ghi nhận.");
  }

  return `
    <div class="rounded-lg border border-surface-variant p-space-md">
      <h3 class="font-label-lg text-label-lg font-bold text-on-surface mb-space-sm">
        Hợp đồng lao động gần đây
      </h3>
      <div class="flex flex-col gap-space-xs">
        ${rows
          .map((contract) => {
            const meta = CONTRACT_STATUS_META[contract.status] || {
              label: contract.status || "—",
              badge: "bg-surface-container-high text-on-surface-variant",
            };
            return `
              <div class="flex items-center justify-between gap-space-sm rounded bg-surface-container-low px-space-sm py-space-xs">
                <div>
                  <p class="font-body-md text-body-md font-semibold text-on-surface">
                    ${escapeHtml(contract.contract_code || "Hợp đồng")} • ${escapeHtml(contract.contract_type || "—")}
                  </p>
                  <p class="font-label-sm text-label-sm text-on-surface-variant">
                    ${formatDate(contract.start_date)} — ${formatDate(contract.end_date)} • ${formatMoney(contract.signed_salary)}
                  </p>
                </div>
                <span class="inline-flex items-center rounded-full px-2 py-0.5 font-label-sm text-label-sm ${meta.badge}">
                  ${escapeHtml(meta.label)}
                </span>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
};

const renderHrLeaveBlock = (balance, leaves, balanceError, leaveError, canView) => {
  if (!canView) {
    return hrNoteBlock(
      "Quỹ phép & đơn nghỉ",
      "Bạn không có quyền xem quỹ phép của nhân viên.",
    );
  }

  const balanceContent = balanceError
    ? `<p class="font-body-sm text-body-sm text-error">${escapeHtml(balanceError)}</p>`
    : balance
      ? `
        <div class="grid grid-cols-3 gap-space-xs">
          ${[
            ["Quỹ năm", balance.annual_quota],
            ["Đã dùng", balance.used_days],
            ["Còn lại", balance.remaining_days],
          ]
            .map(
              ([label, value]) => `
                <div class="rounded bg-surface-container-low px-space-sm py-space-xs text-center">
                  <p class="font-label-sm text-label-sm text-on-surface-variant">${escapeHtml(label)}</p>
                  <p class="font-headline-sm text-headline-sm font-bold text-on-surface">${value ?? "—"}</p>
                </div>
              `,
            )
            .join("")}
        </div>
      `
      : `<p class="font-body-sm text-body-sm text-on-surface-variant">Chưa có dữ liệu quỹ phép cho năm hiện tại.</p>`;

  const leaveContent = leaveError
    ? `<p class="font-body-sm text-body-sm text-error">${escapeHtml(leaveError)}</p>`
    : (leaves || []).length
      ? `
        <div class="flex flex-col gap-space-xs">
          ${[...leaves]
            .sort((a, b) => String(b.from_date).localeCompare(String(a.from_date)))
            .slice(0, 3)
            .map((leave) => {
              const meta = LEAVE_STATUS_META[leave.status] || {
                label: leave.status || "—",
                badge: "bg-surface-container-high text-on-surface-variant",
              };
              return `
                <div class="flex items-center justify-between gap-space-sm rounded bg-surface-container-low px-space-sm py-space-xs">
                  <div>
                    <p class="font-body-md text-body-md font-semibold text-on-surface">
                      ${escapeHtml(leave.request_code || leave.leave_type || "Đơn nghỉ")}
                    </p>
                    <p class="font-label-sm text-label-sm text-on-surface-variant">
                      ${formatDate(leave.from_date)} — ${formatDate(leave.to_date)} • ${leave.total_days ?? "—"} ngày
                    </p>
                  </div>
                  <span class="inline-flex items-center rounded-full px-2 py-0.5 font-label-sm text-label-sm ${meta.badge}">
                    ${escapeHtml(meta.label)}
                  </span>
                </div>
              `;
            })
            .join("")}
        </div>
      `
      : `<p class="font-body-sm text-body-sm text-on-surface-variant">Không có đơn nghỉ nào được ghi nhận.</p>`;

  return `
    <div class="rounded-lg border border-surface-variant p-space-md">
      <h3 class="font-label-lg text-label-lg font-bold text-on-surface mb-space-sm">
        Quỹ phép & đơn nghỉ gần đây
      </h3>
      <div class="flex flex-col gap-space-sm">
        ${balanceContent}
        ${leaveContent}
      </div>
    </div>
  `;
};

const renderHrProfile = async (request) => {
  const section = document.getElementById("detailHrProfileSection");
  const content = document.getElementById("detailHrProfileContent");
  if (!section || !content || !canViewHrProfile()) {
    section?.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  setText(
    "#detailHrProfileEmployee",
    `${request.full_name_at_submit || request.full_name || "—"} (${request.employee_code_at_submit || request.employee_code || "—"})`,
  );
  content.innerHTML = `
    <p class="font-body-sm text-body-sm text-on-surface-variant">Đang tải hồ sơ liên quan...</p>
  `;

  const sequence = state.requestSeq;
  const canViewContracts = hasPermission(
    "HR.CONTRACT_MANAGE",
    state.currentUser,
  );
  const canViewLeave = hasPermission("ESS.SELF_PROFILE", state.currentUser);

  const [profileResult, contractsResult, balanceResult, leaveResult] =
    await Promise.allSettled([
      fetchProfileByEmployee(request),
      canViewContracts ? fetchContractsByEmployee(request) : Promise.resolve(null),
      canViewLeave ? fetchLeaveBalance(request) : Promise.resolve(null),
      canViewLeave ? fetchLeaveRequests(request) : Promise.resolve([]),
    ]);

  if (sequence !== state.requestSeq) return;

  content.innerHTML = [
    renderHrInfoBlock(
      settledValue(profileResult),
      settledError(profileResult, "Không thể tải hồ sơ nhân viên."),
    ),
    renderHrContractsBlock(
      settledValue(contractsResult, []),
      settledError(contractsResult, "Không thể tải hợp đồng lao động."),
      canViewContracts,
    ),
    renderHrLeaveBlock(
      settledValue(balanceResult),
      settledValue(leaveResult, []),
      settledError(balanceResult, "Không thể tải quỹ phép."),
      settledError(leaveResult, "Không thể tải đơn nghỉ."),
      canViewLeave,
    ),
  ].join("");
};

const renderDetail = (request) => {
  state.request = request;

  const loading = document.getElementById("employeeRequestDetailLoading");
  const content = document.getElementById("employeeRequestDetailContent");
  loading?.classList.add("hidden");
  content?.classList.remove("hidden");

  setText("#employeeRequestDetailTitle", request.title || "Chi tiết đơn từ");
  setText("#employeeRequestDetailCode", `#${request.id}`);
  setText(
    "#employeeRequestDetailUpdatedAt",
    `Cập nhật lúc ${formatDateTime(request.updated_at)}`,
  );

  const statusEl = document.getElementById("employeeRequestDetailStatus");
  if (statusEl) statusEl.innerHTML = statusBadge(request.status);

  setText("#detailType", REQUEST_TYPES[request.request_type] || request.request_type || "—");

  const employeeName =
    request.full_name_at_submit || request.full_name || "—";
  const employeeCode =
    request.employee_code_at_submit || request.employee_code || "—";
  const departmentName =
    request.department_name_at_submit || request.department_name || "—";

  setText("#detailEmployee", `${employeeName} (${employeeCode})`);
  setText("#detailDepartment", departmentName);
  setText("#detailStartDate", formatDate(request.start_date));
  setText(
    "#detailEndDate",
    formatDate(
      request.request_type === "RESIGNATION"
        ? request.last_working_date
        : request.end_date,
    ),
  );
  setText("#detailSubmittedAt", formatDateTime(request.submitted_at));
  setText("#detailReason", request.reason || "—");

  const documentSection = document.getElementById("detailDocumentSection");
  const hasDocument = Boolean(
    request.document_title ||
      request.document_content_html ||
      request.document_content_json,
  );
  documentSection?.classList.toggle("hidden", !hasDocument);
  if (hasDocument) {
    const templateLabels = {
      resignation: "Đơn xin nghỉ việc",
      "temporary-leave": "Đơn xin tạm nghỉ",
    };
    setText("#detailDocumentTitle", request.document_title || "Văn bản đính kèm");
    setText(
      "#detailDocumentTemplate",
      templateLabels[request.document_template_code] ||
        request.document_template_code ||
        "Văn bản",
    );
    const documentContent = document.getElementById("detailDocumentContent");
    if (documentContent) {
      documentContent.innerHTML =
        request.document_content_html ||
        `<p class="text-on-surface-variant">Văn bản đã được lưu kèm đơn (${escapeHtml(request.document_title || "văn bản")}).</p>`;
    }
  }

  renderHrActions(request);
  renderDirectorActions(request);
  renderHrProfile(request);

  const progress = document.getElementById("detailProgress");
  if (progress) progress.innerHTML = buildProgressSteps(request).join("");

  const timeline = Array.isArray(request.timeline) ? request.timeline : [];
  const rejectAction = [...timeline]
    .reverse()
    .find((action) => action.action === "REJECT");
  const rejectionBox = document.getElementById("detailRejectionBox");
  rejectionBox?.classList.toggle("hidden", !rejectAction);
  setText("#detailRejectionReason", rejectAction?.comment || "");

  renderResubmitSection(request);
  renderAttachments(request);
  renderApprovalHistory(request);
};

const loadDetail = async (id) => {
  const sequence = ++state.requestSeq;
  hideNotice();

  const loading = document.getElementById("employeeRequestDetailLoading");
  const content = document.getElementById("employeeRequestDetailContent");
  loading?.classList.remove("hidden");
  content?.classList.add("hidden");

  try {
    const response = await api.get(`/employee-requests/${id}`);
    if (sequence !== state.requestSeq) return;

    const data = response.data?.data;
    if (!data) throw new Error("Không có dữ liệu chi tiết đơn");

    renderDetail(data);
  } catch (error) {
    if (sequence !== state.requestSeq) return;

    const message =
      error.response?.data?.message || "Không thể tải chi tiết đơn từ.";
    showNotice(message, true);
    loading.textContent = message;
  }
};

const bindOnce = (element, event, handler) => {
  if (!element || element.dataset.bound === "1") return;
  element.dataset.bound = "1";
  element.addEventListener(event, handler);
};

const submitResubmit = async (event, id) => {
  event.preventDefault();
  hideNotice();

  const responseNote = document.getElementById("detailResponseNote")?.value.trim();
  const reason = document.getElementById("detailUpdatedReason")?.value.trim();

  if (!responseNote) {
    showNotice("Vui lòng nhập nội dung bổ sung.", true);
    return;
  }

  const button = document.getElementById("btnResubmitEmployeeRequest");
  const originalHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = "<span>Đang gửi...</span>";
  }

  try {
    await api.post(`/employee-requests/${id}/resubmit`, {
      response_note: responseNote,
      reason: reason || undefined,
    });
    await loadDetail(id);
  } catch (error) {
    showNotice(
      error.response?.data?.message || "Không thể gửi lại hồ sơ. Vui lòng thử lại.",
      true,
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }
};

const bindEvents = (id, user) => {
  const fromApprovals = APPROVER_ROLES.includes(user?.role_id);
  const isHr = user?.role_id === "HR_ADMIN";
  const isDirector = user?.role_id === "DIRECTOR";
  const backHash = isDirector
    ? "#/giam-doc-don-tu"
    : isHr
      ? "#/hr-don-tu"
      : fromApprovals
        ? "#/duyet-don"
        : "#/don-tu";
  const backButton = document.getElementById("btnBackEmployeeRequests");

  if (backButton) {
    const backLabel = isDirector
      ? "Đơn chờ Giám đốc duyệt"
      : isHr
        ? "Đơn chờ HR xử lý"
        : fromApprovals
          ? "Trung tâm phê duyệt"
          : "Danh sách đơn từ";
    backButton.innerHTML = `
      <span class="material-symbols-outlined text-[15px]">arrow_back</span>
      <span>${backLabel}</span>
    `;
  }

  bindOnce(backButton, "click", () => {
    window.location.hash = backHash;
  });
  bindOnce(document.getElementById("btnReloadEmployeeRequestDetail"), "click", () => {
    loadDetail(id);
  });
  bindOnce(document.getElementById("btnHrCheckDetail"), "click", (event) => {
    runDetailHrAction("check", event.currentTarget, (label) => `Đã kiểm tra hồ sơ đơn ${label}.`);
  });
  bindOnce(document.getElementById("btnHrReceiveDetail"), "click", (event) => {
    runDetailHrAction("receive", event.currentTarget, (label) => `Đã tiếp nhận hồ sơ bổ sung đơn ${label}.`);
  });
  bindOnce(document.getElementById("btnHrForwardDetail"), "click", (event) => {
    runDetailHrAction("approve", event.currentTarget, (label) => `Đã duyệt đơn ${label}.`);
  });
  bindOnce(document.getElementById("btnDirectorApproveDetail"), "click", (event) => {
    runDirectorApprove(event.currentTarget);
  });
  bindOnce(document.getElementById("btnDirectorRejectDetail"), "click", openDirectorRejectModal);
  bindOnce(document.getElementById("btnCloseDirectorReject"), "click", closeDirectorRejectModal);
  bindOnce(document.getElementById("btnCancelDirectorReject"), "click", closeDirectorRejectModal);
  bindOnce(document.getElementById("directorRejectRequestForm"), "submit", submitDirectorReject);

  const rejectModal = document.getElementById("modal-director-reject-request");
  bindOnce(rejectModal, "click", (event) => {
    if (event.target === rejectModal) closeDirectorRejectModal();
  });

  bindOnce(document.getElementById("detailResubmitForm"), "submit", (event) => {
    submitResubmit(event, id);
  });
};

export const initEmployeeRequestDetail = (
  user = getCurrentUser(),
  id,
) => {
  if (!user) {
    logout();
    return;
  }
  if (!id) {
    window.location.hash = "#/don-tu";
    return;
  }

  ensureViewMounted();
  if (!window.__HRM_SPA__) setupShell(user);

  state.currentUser = user;
  bindEvents(id, user);
  loadDetail(id);
};
