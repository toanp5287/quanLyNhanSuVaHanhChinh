import requestApprovalsHtml from "../pages/request-approvals.html?raw";
import api from "../services/api.js";
import { getCurrentUser, logout } from "../services/auth.service.js";
import { setupShell } from "./home.js";
import {
  ACTIVE_STATUSES,
  REQUEST_TYPES,
  STATUS_META,
} from "./employee-requests.js";

const STATUS_ROUTES = {
  ALL: "#/duyet-don",
  PENDING_DEPARTMENT: "#/duyet-don/can-duyet",
  PENDING_HR: "#/duyet-don/da-chuyen-hr",
  WAITING_EMPLOYEE_UPDATE: "#/duyet-don/cho-bo-sung",
  PENDING_DIRECTOR: "#/duyet-don/cho-giam-doc",
  PROCESSED: "#/duyet-don/da-xu-ly",
  APPROVED: "#/duyet-don/da-duyet",
  REJECTED: "#/duyet-don/tu-choi",
};

const HASH_STATUS_ALIASES = {
  "#/duyet-don/cho-xu-ly": "PENDING_HR",
};

const state = {
  requests: [],
  status: "ALL",
  type: "",
  keyword: "",
  requestSeq: 0,
  searchTimer: null,
  rejectId: null,
  updateId: null,
  currentUser: null,
};

const ROLE_CONFIG = {
  MANAGER: {
    title: "Đơn cần duyệt",
    subtitle: "Xem và phê duyệt đơn từ của nhân viên trong phạm vi quản lý.",
    defaultStatus: "PENDING_DEPARTMENT",
    tabs: [
      { key: "ALL", label: "Tất cả" },
      { key: "PENDING_DEPARTMENT", label: "Cần duyệt", statuses: ["PENDING_DEPARTMENT"] },
      { key: "PENDING_HR", label: "Đã chuyển HR", statuses: ["PENDING_HR"] },
      { key: "WAITING_EMPLOYEE_UPDATE", label: "Chờ bổ sung", statuses: ["WAITING_EMPLOYEE_UPDATE"] },
      { key: "PENDING_DIRECTOR", label: "Chờ GĐ", statuses: ["PENDING_DIRECTOR"] },
      { key: "APPROVED", label: "Đã duyệt", statuses: ["APPROVED"] },
      { key: "REJECTED", label: "Từ chối", statuses: ["REJECTED"] },
    ],
    summary: ["PENDING_DEPARTMENT", "PENDING_HR", "APPROVED", "REJECTED"],
  },
  HR_ADMIN: {
    title: "Đơn chờ HR xử lý",
    subtitle: "Kiểm tra hồ sơ, yêu cầu bổ sung hoặc chuyển đơn sang Giám đốc.",
    defaultStatus: "PENDING_HR",
    tabs: [
      { key: "ALL", label: "Tất cả" },
      { key: "PENDING_HR", label: "Chờ xử lý", statuses: ["PENDING_HR"] },
      { key: "WAITING_EMPLOYEE_UPDATE", label: "Chờ bổ sung", statuses: ["WAITING_EMPLOYEE_UPDATE"] },
      { key: "PROCESSED", label: "Đã xử lý", statuses: ["PENDING_DIRECTOR", "APPROVED"] },
      { key: "REJECTED", label: "Từ chối", statuses: ["REJECTED"] },
    ],
    summary: ["PENDING_HR", "WAITING_EMPLOYEE_UPDATE", "PROCESSED", "REJECTED"],
  },
  DIRECTOR: {
    title: "Đơn cần ý kiến Giám đốc",
    subtitle: "Xem và ra quyết định cuối cùng cho đơn nghỉ việc.",
    defaultStatus: "PENDING_DIRECTOR",
    tabs: [
      { key: "ALL", label: "Tất cả" },
      { key: "PENDING_DIRECTOR", label: "Cần duyệt", statuses: ["PENDING_DIRECTOR"] },
      { key: "APPROVED", label: "Đã duyệt", statuses: ["APPROVED"] },
      { key: "REJECTED", label: "Từ chối", statuses: ["REJECTED"] },
    ],
    summary: ["PENDING_DIRECTOR", "APPROVED", "REJECTED"],
  },
};

const SUMMARY_META = {
  PENDING_DEPARTMENT: {
    label: "Cần duyệt",
    description: "Đơn chờ ý kiến quản lý.",
    icon: "pending_actions",
    countClass: "text-amber-600",
    iconClass: "bg-amber-100 text-amber-700",
    hoverClass: "hover:border-amber-300",
  },
  PENDING_HR: {
    label: "Chờ xử lý",
    description: "Đơn chờ HR kiểm tra hồ sơ.",
    icon: "forward_to_inbox",
    countClass: "text-blue-700",
    iconClass: "bg-blue-100 text-blue-700",
    hoverClass: "hover:border-blue-300",
  },
  WAITING_EMPLOYEE_UPDATE: {
    label: "Chờ bổ sung",
    description: "Đơn chờ nhân viên cập nhật.",
    icon: "fact_check",
    countClass: "text-orange-600",
    iconClass: "bg-orange-100 text-orange-700",
    hoverClass: "hover:border-orange-300",
  },
  PROCESSED: {
    label: "Đã xử lý",
    description: "Đơn đã chuyển hoặc hoàn tất.",
    icon: "task_alt",
    countClass: "text-emerald-700",
    iconClass: "bg-emerald-100 text-emerald-700",
    hoverClass: "hover:border-emerald-300",
  },
  APPROVED: {
    label: "Đã duyệt",
    description: "Đơn hoàn tất phê duyệt.",
    icon: "check_circle",
    countClass: "text-emerald-700",
    iconClass: "bg-emerald-100 text-emerald-700",
    hoverClass: "hover:border-emerald-300",
  },
  REJECTED: {
    label: "Từ chối",
    description: "Đơn không được phê duyệt.",
    icon: "cancel",
    countClass: "text-red-600",
    iconClass: "bg-red-100 text-red-600",
    hoverClass: "hover:border-red-300",
  },
};

const currentConfig = () =>
  ROLE_CONFIG[state.currentUser?.role_id] || ROLE_CONFIG.MANAGER;

export const getApprovalStatusFromHash = (
  hash = window.location.hash,
) => {
  if (HASH_STATUS_ALIASES[hash]) return HASH_STATUS_ALIASES[hash];
  const entry = Object.entries(STATUS_ROUTES).find(
    ([, route]) => route === hash,
  );
  return entry ? entry[0] : "ALL";
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
  const notice = document.getElementById("requestApprovalsNotice");
  if (!notice) return;
  notice.textContent = message;
  notice.className = isError
    ? "flex items-start gap-space-sm rounded-lg border px-space-md py-space-sm font-body-sm text-body-sm border-error/30 bg-error-container text-on-error-container"
    : "flex items-start gap-space-sm rounded-lg border px-space-md py-space-sm font-body-sm text-body-sm border-primary/30 bg-primary-fixed text-on-primary-fixed";
};

const hideNotice = () => {
  const notice = document.getElementById("requestApprovalsNotice");
  if (!notice) return;
  notice.textContent = "";
  notice.className = "hidden";
};

const ensureViewMounted = () => {
  if (!window.__HRM_SPA__) return;

  const main = document.querySelector("main");
  if (!main) return;

  const doc = new DOMParser().parseFromString(
    requestApprovalsHtml,
    "text/html",
  );
  const view = doc.querySelector("main > div");
  const modalIds = ["modal-reject-request", "modal-request-update"];
  const modals = modalIds
    .map((id) => doc.getElementById(id))
    .filter(Boolean);
  if (!view) return;

  main.innerHTML = "";
  modalIds.forEach((id) => document.getElementById(id)?.remove());
  main.appendChild(document.importNode(view, true));
  modals.forEach((modal) =>
    document.body.appendChild(document.importNode(modal, true)),
  );
};

const countsByStatus = () => {
  const raw = { ALL: state.requests.length };
  state.requests.forEach((row) => {
    raw[row.status] = (raw[row.status] || 0) + 1;
  });

  const counts = { ...raw };
  currentConfig().tabs.forEach((tab) => {
    counts[tab.key] = tab.statuses
      ? tab.statuses.reduce((total, status) => total + (raw[status] || 0), 0)
      : state.requests.length;
  });
  return counts;
};

const visibleRequests = () => {
  const keyword = state.keyword.toLowerCase();
  const activeTab = currentConfig().tabs.find(
    (tab) => tab.key === state.status,
  );

  return state.requests.filter((row) => {
    if (activeTab?.statuses && !activeTab.statuses.includes(row.status)) {
      return false;
    }
    if (state.type && row.request_type !== state.type) return false;
    if (!keyword) return true;

    const haystack = [
      row.id,
      row.title,
      row.reason,
      row.employee_code,
      row.full_name,
      row.department_name,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(keyword);
  });
};

const renderScopeBadge = (user) => {
  const badge = document.getElementById("requestApprovalsScopeBadge");
  if (!badge) return;

  const labels = {
    ALL: "Toàn hệ thống",
    DEPARTMENT: "Phòng ban & trực thuộc",
    SELF: "Cá nhân",
  };
  const scope = labels[user?.data_scope] || "Cá nhân";
  const department = user?.department_name
    ? ` • ${escapeHtml(user.department_name)}`
    : "";

  badge.innerHTML = `
    <span class="material-symbols-outlined text-[14px]">domain</span>
    Phạm vi: ${escapeHtml(scope)}${department}
  `;
};

const renderSummary = () => {
  const container = document.getElementById("requestApprovalSummary");
  if (!container) return;

  const counts = countsByStatus();
  container.innerHTML = currentConfig()
    .summary.map((key) => {
      const meta = SUMMARY_META[key] || {};
      const active = key === state.status;
      return `
        <button
          class="text-left bg-surface-container-lowest rounded-lg p-space-md shadow-sm border ${active ? "border-primary" : "border-transparent"} ${meta.hoverClass || ""} transition-colors"
          data-approval-status="${key}"
          type="button"
        >
          <div class="flex items-start justify-between gap-space-sm">
            <div>
              <span class="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block">${escapeHtml(meta.label || key)}</span>
              <span class="font-headline-lg text-headline-lg ${meta.countClass || ""} font-bold">${counts[key] || 0}</span>
            </div>
            <span class="w-9 h-9 rounded flex items-center justify-center ${meta.iconClass || ""}">
              <span class="material-symbols-outlined text-[20px]">${escapeHtml(meta.icon || "description")}</span>
            </span>
          </div>
          <p class="font-body-sm text-body-sm text-on-surface-variant mt-1">${escapeHtml(meta.description || "")}</p>
        </button>
      `;
    })
    .join("");
};

const renderTabs = () => {
  const container = document.getElementById("requestApprovalTabs");
  if (!container) return;

  const counts = countsByStatus();
  container.innerHTML = currentConfig()
    .tabs.map((tab) => {
      const active = tab.key === state.status;
      return `
        <button
          class="approval-tab h-9 px-space-sm rounded-t-lg font-label-md text-label-md flex items-center gap-1.5 border-b-2 ${active ? "border-primary text-primary font-bold" : "border-transparent text-on-surface-variant hover:text-primary"} transition-colors"
          data-approval-tab="${tab.key}"
          type="button"
        >
          <span>${escapeHtml(tab.label)}</span>
          <span class="rounded-full bg-surface-container-high px-1.5 text-[11px] font-semibold">${counts[tab.key] || 0}</span>
        </button>
      `;
    })
    .join("");
};

const renderRows = () => {
  const tbody = document.getElementById("requestApprovalsBody");
  if (!tbody) return;

  const rows = visibleRequests();
  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td class="px-3 py-8 text-center text-on-surface-variant" colspan="9">
          Không có đơn từ nào phù hợp với phân loại hiện tại.
        </td>
      </tr>
    `;
    setText("#requestApprovalsResultInfo", "Không có đơn để hiển thị");
    return;
  }

  tbody.innerHTML = rows
    .map((row) => {
      const status = STATUS_META[row.status] || {
        label: row.status || "—",
        badge: "bg-surface-container-high text-on-surface-variant",
      };
      const isSelf =
        Number(row.employee_id) === Number(state.currentUser?.employee_id);
      const hasSupplement =
        row.has_pending_supplement === true ||
        Number(row.has_pending_supplement) === 1;
      const role = state.currentUser?.role_id;
      const canManagerApprove =
        role === "MANAGER" && row.status === "PENDING_DEPARTMENT" && !isSelf;
      const canHrProcess =
        role === "HR_ADMIN" && row.status === "PENDING_HR" && !isSelf;
      const canDirectorApprove =
        role === "DIRECTOR" && row.status === "PENDING_DIRECTOR" && !isSelf;
      const canApprove =
        canManagerApprove || canHrProcess || canDirectorApprove;
      const approveLabel =
        row.request_type === "RESIGNATION" && canHrProcess
          ? "Trình GĐ"
          : role === "MANAGER"
            ? "Đồng ý"
            : "Duyệt";

      return `
        <tr class="hover:bg-surface-container-low transition-colors">
          <td class="px-3 py-3 font-semibold text-on-surface">#${escapeHtml(row.id)}</td>
          <td class="px-3 py-3 text-on-surface">${escapeHtml(REQUEST_TYPES[row.request_type] || row.request_type || "—")}</td>
          <td class="px-3 py-3 min-w-[220px]">
            <p class="font-medium text-on-surface truncate">${escapeHtml(row.title)}</p>
            <p class="font-body-sm text-body-sm text-on-surface-variant truncate" title="${escapeHtml(row.reason)}">${escapeHtml(row.reason)}</p>
          </td>
          <td class="px-3 py-3">
            <p class="font-medium text-on-surface">${escapeHtml(row.full_name)}</p>
            <p class="font-label-sm text-label-sm text-on-surface-variant">${escapeHtml(row.employee_code)}</p>
          </td>
          <td class="px-3 py-3 text-on-surface-variant">${escapeHtml(row.department_name || "—")}</td>
          <td class="px-3 py-3 whitespace-nowrap text-on-surface-variant">${formatDate(row.start_date)}</td>
          <td class="px-3 py-3 text-center">
            <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-label-sm text-label-sm ${status.badge}">
              <span class="w-1.5 h-1.5 rounded-full bg-current opacity-70"></span>
              ${escapeHtml(status.label)}
            </span>
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-on-surface-variant">${formatDateTime(row.submitted_at)}</td>
          <td class="px-3 py-3 text-center">
            <div class="flex items-center justify-center gap-1 flex-wrap">
              ${
                canApprove
                  ? `<button
                      class="h-8 px-space-sm rounded bg-primary text-on-primary hover:bg-primary-container font-label-sm text-label-sm"
                       data-approve-request-id="${escapeHtml(row.id)}"
                       type="button"
                     >${approveLabel}</button>
                     <button
                       class="h-8 px-space-sm rounded border border-error/40 text-error hover:bg-error-container font-label-sm text-label-sm"
                       data-reject-request-id="${escapeHtml(row.id)}"
                       type="button"
                     >Từ chối</button>`
                   : ""
               }
               ${
                 canHrProcess
                   ? `<button
                        class="h-8 px-space-sm rounded border border-blue-300 text-blue-700 hover:bg-blue-50 font-label-sm text-label-sm"
                        data-check-request-id="${escapeHtml(row.id)}"
                        type="button"
                      >Kiểm tra</button>
                      ${
                        hasSupplement
                          ? `<button
                              class="h-8 px-space-sm rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 font-label-sm text-label-sm"
                              data-receive-request-id="${escapeHtml(row.id)}"
                              type="button"
                            >Tiếp nhận</button>`
                          : ""
                      }
                      <button
                        class="h-8 px-space-sm rounded border border-orange-400 text-orange-700 hover:bg-orange-50 font-label-sm text-label-sm"
                        data-request-update-id="${escapeHtml(row.id)}"
                        type="button"
                      >Yêu cầu bổ sung</button>`
                   : ""
               }
              <button
                class="h-8 px-space-sm rounded border border-surface-variant text-primary hover:bg-primary-fixed font-label-sm text-label-sm"
                data-view-approval-id="${escapeHtml(row.id)}"
                type="button"
              >Lịch sử</button>
            </div>
            ${
              isSelf && ACTIVE_STATUSES.includes(row.status)
                ? `<p class="font-label-sm text-label-sm text-on-surface-variant mt-1">Đơn do bạn tạo</p>`
                : ""
            }
          </td>
        </tr>
      `;
    })
    .join("");

  setText(
    "#requestApprovalsResultInfo",
    `Hiển thị ${rows.length} / ${state.requests.length} đơn trong phạm vi phụ trách`,
  );
};

const renderAll = () => {
  renderSummary();
  renderTabs();
  renderRows();
};

const renderTableLoading = () => {
  const tbody = document.getElementById("requestApprovalsBody");
  if (!tbody) return;
  tbody.innerHTML = `
    <tr>
      <td class="px-3 py-8 text-center text-on-surface-variant" colspan="9">Đang tải danh sách đơn cần duyệt...</td>
    </tr>
  `;
};

const renderTableError = (message) => {
  const tbody = document.getElementById("requestApprovalsBody");
  if (!tbody) return;
  tbody.innerHTML = `
    <tr>
      <td class="px-3 py-8 text-center text-error" colspan="9">${escapeHtml(message)}</td>
    </tr>
  `;
};

const loadRequests = async () => {
  const sequence = ++state.requestSeq;
  hideNotice();
  renderTableLoading();

  try {
    const response = await api.get("/employee-requests");
    if (sequence !== state.requestSeq) return;

    const payload = response.data?.data || {};
    state.requests = Array.isArray(payload.requests) ? payload.requests : [];

    renderAll();
    setText(
      "#requestApprovalsUpdatedAt",
      `Cập nhật lúc ${new Date().toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      })}`,
    );
  } catch (error) {
    if (sequence !== state.requestSeq) return;

    const message =
      error.response?.data?.message ||
      "Không thể tải danh sách đơn cần duyệt. Vui lòng thử lại.";
    showNotice(message, true);
    renderTableError(message);
    setText("#requestApprovalsResultInfo", "Không thể tải dữ liệu");
  }
};

const setStatus = (status) => {
  state.status = status || "ALL";
  const route = STATUS_ROUTES[state.status] || STATUS_ROUTES.ALL;
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${route}`,
  );
  renderAll();
};

const showRejectError = (message) => {
  const error = document.getElementById("rejectRequestError");
  if (!error) return;
  error.textContent = message;
  error.classList.remove("hidden");
};

const hideRejectError = () => {
  const error = document.getElementById("rejectRequestError");
  if (!error) return;
  error.textContent = "";
  error.classList.add("hidden");
};

const openRejectModal = (id) => {
  const modal = document.getElementById("modal-reject-request");
  const form = document.getElementById("rejectRequestForm");
  if (!modal || !form) return;

  state.rejectId = id;
  form.reset();
  hideRejectError();
  setText("#rejectRequestSubtitle", `Đơn #${id}`);
  modal.classList.remove("hidden");
  modal.classList.add("flex");
};

const closeRejectModal = () => {
  const modal = document.getElementById("modal-reject-request");
  if (!modal) return;
  state.rejectId = null;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
};

const approveRequest = async (id, button) => {
  hideNotice();
  const originalHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = "<span>Đang xử lý...</span>";
  }

  try {
    const response = await api.post(`/employee-requests/${id}/approve`, {
      note: "Phê duyệt",
    });
    const nextStatus = response.data?.data?.status;
    const message =
      nextStatus === "PENDING_DIRECTOR"
        ? `Đã trình Giám đốc đơn #${id}.`
        : `Đã duyệt đơn #${id}.`;
    showNotice(message, false);
    await loadRequests();
  } catch (error) {
    showNotice(
      error.response?.data?.message || "Không thể duyệt đơn. Vui lòng thử lại.",
      true,
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }
};

const runHrAction = async (id, action, button, successMessage) => {
  hideNotice();
  const originalHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = "<span>Đang xử lý...</span>";
  }

  try {
    await api.post(`/employee-requests/${id}/${action}`, { note: "" });
    showNotice(successMessage(`#${id}`), false);
    await loadRequests();
  } catch (error) {
    showNotice(
      error.response?.data?.message || "Không thể thực hiện thao tác. Vui lòng thử lại.",
      true,
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }
};

const submitReject = async (event) => {
  event.preventDefault();
  if (!state.rejectId) return;

  hideRejectError();
  const reason = document.getElementById("rejectRequestReason")?.value.trim();
  if (!reason) {
    showRejectError("Vui lòng nhập lý do từ chối.");
    return;
  }

  const id = state.rejectId;
  const button = document.getElementById("btnConfirmRejectRequest");
  const originalHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = "<span>Đang xử lý...</span>";
  }

  try {
    await api.post(`/employee-requests/${id}/reject`, {
      reject_reason: reason,
    });
    closeRejectModal();
    showNotice(`Đã từ chối đơn #${id}.`, false);
    await loadRequests();
  } catch (error) {
    showRejectError(
      error.response?.data?.message || "Không thể từ chối đơn. Vui lòng thử lại.",
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }
};

const showUpdateError = (message) => {
  const error = document.getElementById("requestUpdateError");
  if (!error) return;
  error.textContent = message;
  error.classList.remove("hidden");
};

const hideUpdateError = () => {
  const error = document.getElementById("requestUpdateError");
  if (!error) return;
  error.textContent = "";
  error.classList.add("hidden");
};

const openUpdateModal = (id) => {
  const modal = document.getElementById("modal-request-update");
  const form = document.getElementById("requestUpdateForm");
  if (!modal || !form) return;

  state.updateId = id;
  form.reset();
  hideUpdateError();
  setText("#requestUpdateSubtitle", `Đơn #${id}`);
  modal.classList.remove("hidden");
  modal.classList.add("flex");
};

const closeUpdateModal = () => {
  const modal = document.getElementById("modal-request-update");
  if (!modal) return;
  state.updateId = null;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
};

const submitUpdate = async (event) => {
  event.preventDefault();
  if (!state.updateId) return;

  hideUpdateError();
  const content = document.getElementById("requestUpdateContent")?.value.trim();
  if (!content) {
    showUpdateError("Vui lòng nhập nội dung cần bổ sung.");
    return;
  }

  const id = state.updateId;
  const button = document.getElementById("btnConfirmRequestUpdate");
  const originalHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = "<span>Đang gửi...</span>";
  }

  try {
    await api.post(`/employee-requests/${id}/request-update`, { content });
    closeUpdateModal();
    showNotice(`Đã gửi yêu cầu bổ sung cho đơn #${id}.`, false);
    await loadRequests();
  } catch (error) {
    showUpdateError(
      error.response?.data?.message ||
        "Không thể gửi yêu cầu bổ sung. Vui lòng thử lại.",
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }
};

const bindOnce = (element, event, handler) => {
  if (!element || element.dataset.bound === "1") return;
  element.dataset.bound = "1";
  element.addEventListener(event, handler);
};

const bindEvents = () => {
  bindOnce(document.getElementById("btnRefreshRequestApprovals"), "click", loadRequests);

  bindOnce(document.getElementById("requestApprovalSearch"), "input", (event) => {
    state.keyword = event.target.value.trim();
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(renderRows, 250);
  });

  bindOnce(document.getElementById("filterApprovalRequestType"), "change", (event) => {
    state.type = event.target.value || "";
    renderRows();
  });

  bindOnce(document.getElementById("requestApprovalsBody"), "click", (event) => {
    const approveButton = event.target.closest("[data-approve-request-id]");
    if (approveButton) {
      approveRequest(
        approveButton.getAttribute("data-approve-request-id"),
        approveButton,
      );
      return;
    }

    const checkButton = event.target.closest("[data-check-request-id]");
    if (checkButton) {
      runHrAction(
        checkButton.getAttribute("data-check-request-id"),
        "check",
        checkButton,
        (label) => `Đã kiểm tra hồ sơ đơn ${label}.`,
      );
      return;
    }

    const receiveButton = event.target.closest("[data-receive-request-id]");
    if (receiveButton) {
      runHrAction(
        receiveButton.getAttribute("data-receive-request-id"),
        "receive",
        receiveButton,
        (label) => `Đã tiếp nhận hồ sơ bổ sung đơn ${label}.`,
      );
      return;
    }

    const rejectButton = event.target.closest("[data-reject-request-id]");
    if (rejectButton) {
      openRejectModal(rejectButton.getAttribute("data-reject-request-id"));
      return;
    }

    const updateButton = event.target.closest("[data-request-update-id]");
    if (updateButton) {
      openUpdateModal(updateButton.getAttribute("data-request-update-id"));
      return;
    }

    const viewButton = event.target.closest("[data-view-approval-id]");
    if (viewButton) {
      window.location.hash = `#/don-tu/${viewButton.getAttribute("data-view-approval-id")}`;
    }
  });

  bindOnce(document.getElementById("requestApprovalTabs"), "click", (event) => {
    const tab = event.target.closest("[data-approval-tab]");
    if (tab) setStatus(tab.getAttribute("data-approval-tab") || "ALL");
  });
  bindOnce(document.getElementById("requestApprovalSummary"), "click", (event) => {
    const card = event.target.closest("[data-approval-status]");
    if (card) setStatus(card.getAttribute("data-approval-status") || "ALL");
  });

  bindOnce(document.getElementById("btnCloseRejectRequest"), "click", closeRejectModal);
  bindOnce(document.getElementById("btnCancelRejectRequest"), "click", closeRejectModal);
  bindOnce(document.getElementById("rejectRequestForm"), "submit", submitReject);

  const rejectModal = document.getElementById("modal-reject-request");
  bindOnce(rejectModal, "click", (event) => {
    if (event.target === rejectModal) closeRejectModal();
  });

  bindOnce(document.getElementById("btnCloseRequestUpdate"), "click", closeUpdateModal);
  bindOnce(document.getElementById("btnCancelRequestUpdate"), "click", closeUpdateModal);
  bindOnce(document.getElementById("requestUpdateForm"), "submit", submitUpdate);

  const updateModal = document.getElementById("modal-request-update");
  bindOnce(updateModal, "click", (event) => {
    if (event.target === updateModal) closeUpdateModal();
  });
};

export const initRequestApprovals = (
  user = getCurrentUser(),
  status = "ALL",
) => {
  if (!user) {
    logout();
    return;
  }

  ensureViewMounted();
  if (!window.__HRM_SPA__) setupShell(user);

  state.currentUser = user;
  state.type = "";
  state.keyword = "";

  const config = currentConfig();
  state.status =
    status && status !== "ALL"
      ? status
      : config.tabs.some((tab) => tab.key === config.defaultStatus)
        ? config.defaultStatus
        : "ALL";

  setText("#requestApprovalsBreadcrumb", config.title);
  setText("#requestApprovalsTitle", config.title);
  setText("#requestApprovalsSubtitle", config.subtitle);

  const search = document.getElementById("requestApprovalSearch");
  if (search) search.value = "";
  const type = document.getElementById("filterApprovalRequestType");
  if (type) type.value = "";

  bindEvents();
  renderScopeBadge(user);
  renderAll();
  loadRequests();
};
