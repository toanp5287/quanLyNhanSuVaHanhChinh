import employeeRequestDetailHtml from "../pages/employee-request-detail.html?raw";
import api from "../services/api.js";
import { getCurrentUser, logout } from "../services/auth.service.js";
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
};

const state = {
  request: null,
  requestSeq: 0,
  currentUser: null,
};

export const getEmployeeRequestIdFromHash = (
  hash = window.location.hash,
) => {
  const match = hash.match(/^#\/don-tu\/(\d+)$/);
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

const renderTimeline = (request) => {
  const container = document.getElementById("detailTimeline");
  if (!container) return;

  const timeline = Array.isArray(request.timeline) ? request.timeline : [];
  if (!timeline.length) {
    container.innerHTML = `
      <p class="font-body-sm text-body-sm text-on-surface-variant">Chưa có lịch sử xử lý.</p>
    `;
    return;
  }

  container.innerHTML = timeline
    .map((action) => {
      const meta = ACTION_META[action.action] || {
        label: action.action || "Hoạt động",
        icon: "history",
        color: "bg-surface-container-high text-on-surface-variant",
      };

      return `
        <div class="flex items-start gap-space-sm">
          <span class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${meta.color}">
            <span class="material-symbols-outlined text-[18px]">${meta.icon}</span>
          </span>
          <div class="min-w-0 flex-1 pb-space-sm border-b border-surface-variant last:border-b-0">
            <div class="flex flex-wrap items-center justify-between gap-space-xs">
              <p class="font-body-md text-body-md font-semibold text-on-surface">${escapeHtml(meta.label)}</p>
              <span class="font-label-sm text-label-sm text-on-surface-variant">${formatDateTime(action.created_at)}</span>
            </div>
            <p class="font-label-sm text-label-sm text-on-surface-variant">
              ${escapeHtml(action.actor_name || "Hệ thống")}
              ${action.from_status || action.to_status ? ` • ${escapeHtml(action.from_status || "—")} → ${escapeHtml(action.to_status || "—")}` : ""}
            </p>
            ${action.comment ? `<p class="whitespace-pre-wrap font-body-sm text-body-sm text-on-surface mt-1">${escapeHtml(action.comment)}</p>` : ""}
          </div>
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
  renderTimeline(request);
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
  const approverRoles = ["MANAGER", "DIRECTOR", "HR_ADMIN"];
  const fromApprovals = approverRoles.includes(user?.role_id);
  const backHash = fromApprovals ? "#/duyet-don" : "#/don-tu";
  const backButton = document.getElementById("btnBackEmployeeRequests");

  if (backButton) {
    backButton.innerHTML = `
      <span class="material-symbols-outlined text-[15px]">arrow_back</span>
      <span>${fromApprovals ? "Trung tâm phê duyệt" : "Danh sách đơn từ"}</span>
    `;
  }

  bindOnce(backButton, "click", () => {
    window.location.hash = backHash;
  });
  bindOnce(document.getElementById("btnReloadEmployeeRequestDetail"), "click", () => {
    loadDetail(id);
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
