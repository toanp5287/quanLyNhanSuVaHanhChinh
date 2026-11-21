import requestApprovalsHtml from "../pages/request-approvals.html?raw";
import api from "../services/api.js";
import { getCurrentUser, logout } from "../services/auth.service.js";
import { setupShell } from "./home.js";
import { REQUEST_TYPES, STATUS_META } from "./employee-requests.js";

const STATUS_ROUTES = {
  ALL: "#/duyet-don",
  PENDING_DEPARTMENT: "#/duyet-don/can-duyet",
  PENDING_HR: "#/duyet-don/da-chuyen-hr",
  WAITING_EMPLOYEE_UPDATE: "#/duyet-don/cho-bo-sung",
  PENDING_DIRECTOR: "#/duyet-don/cho-giam-doc",
  APPROVED: "#/duyet-don/da-duyet",
  REJECTED: "#/duyet-don/tu-choi",
};

const state = {
  requests: [],
  status: "ALL",
  type: "",
  keyword: "",
  requestSeq: 0,
  searchTimer: null,
  rejectId: null,
  currentUser: null,
};

export const getApprovalStatusFromHash = (
  hash = window.location.hash,
) => {
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
  const modal = doc.getElementById("modal-reject-request");
  if (!view) return;

  main.innerHTML = "";
  document.getElementById("modal-reject-request")?.remove();
  main.appendChild(document.importNode(view, true));
  if (modal) document.body.appendChild(document.importNode(modal, true));
};

const countsByStatus = () => {
  const counts = { ALL: state.requests.length };
  state.requests.forEach((row) => {
    counts[row.status] = (counts[row.status] || 0) + 1;
  });
  return counts;
};

const visibleRequests = () => {
  const keyword = state.keyword.toLowerCase();

  return state.requests.filter((row) => {
    if (state.status !== "ALL" && row.status !== state.status) return false;
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

const renderSummary = () => {
  const counts = countsByStatus();
  setText("#countApprovalPendingDepartment", String(counts.PENDING_DEPARTMENT || 0));
  setText("#countApprovalPendingHr", String(counts.PENDING_HR || 0));
  setText("#countApprovalApproved", String(counts.APPROVED || 0));
  setText("#countApprovalRejected", String(counts.REJECTED || 0));
};

const renderTabs = () => {
  const counts = countsByStatus();
  document.querySelectorAll("[data-approval-tab]").forEach((tab) => {
    const status = tab.getAttribute("data-approval-tab");
    const active = status === state.status;
    tab.classList.toggle("border-primary", active);
    tab.classList.toggle("text-primary", active);
    tab.classList.toggle("font-bold", active);
    tab.classList.toggle("border-transparent", !active);
    tab.classList.toggle("text-on-surface-variant", !active);
  });
  document.querySelectorAll("[data-approval-count]").forEach((badge) => {
    const status = badge.getAttribute("data-approval-count");
    badge.textContent = String(counts[status] || 0);
  });
  document.querySelectorAll("[data-approval-status]").forEach((card) => {
    const active = card.getAttribute("data-approval-status") === state.status;
    card.classList.toggle("border-primary", active);
    card.classList.toggle("border-transparent", !active);
  });
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
      const canApprove = row.status === "PENDING_DEPARTMENT" && !isSelf;

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
                    >Duyệt</button>
                    <button
                      class="h-8 px-space-sm rounded border border-error/40 text-error hover:bg-error-container font-label-sm text-label-sm"
                      data-reject-request-id="${escapeHtml(row.id)}"
                      type="button"
                    >Từ chối</button>`
                  : ""
              }
              <button
                class="h-8 px-space-sm rounded border border-surface-variant text-primary hover:bg-primary-fixed font-label-sm text-label-sm"
                data-view-approval-id="${escapeHtml(row.id)}"
                type="button"
              >Xem</button>
            </div>
            ${
              isSelf && row.status === "PENDING_DEPARTMENT"
                ? `<p class="font-label-sm text-label-sm text-on-surface-variant mt-1">Đơn của bạn</p>`
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

const openRejectModal = (id) => {
  const modal = document.getElementById("modal-reject-request");
  const form = document.getElementById("rejectRequestForm");
  if (!modal || !form) return;

  state.rejectId = id;
  form.reset();
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

const approveRequest = async (id) => {
  hideNotice();
  try {
    await api.post(`/employee-requests/${id}/approve`, {
      note: "Phê duyệt",
    });
    showNotice(`Đã duyệt đơn #${id}.`, false);
    await loadRequests();
  } catch (error) {
    showNotice(
      error.response?.data?.message || "Không thể duyệt đơn. Vui lòng thử lại.",
      true,
    );
  }
};

const submitReject = async (event) => {
  event.preventDefault();
  if (!state.rejectId) return;

  const reason = document.getElementById("rejectRequestReason")?.value.trim();
  if (!reason) {
    showNotice("Vui lòng nhập lý do từ chối.", true);
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
    showNotice(
      error.response?.data?.message || "Không thể từ chối đơn. Vui lòng thử lại.",
      true,
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
      approveRequest(approveButton.getAttribute("data-approve-request-id"));
      return;
    }

    const rejectButton = event.target.closest("[data-reject-request-id]");
    if (rejectButton) {
      openRejectModal(rejectButton.getAttribute("data-reject-request-id"));
      return;
    }

    const viewButton = event.target.closest("[data-view-approval-id]");
    if (viewButton) {
      window.location.hash = `#/don-tu/${viewButton.getAttribute("data-view-approval-id")}`;
    }
  });

  document.querySelectorAll("[data-approval-tab]").forEach((tab) => {
    bindOnce(tab, "click", () => {
      setStatus(tab.getAttribute("data-approval-tab") || "ALL");
    });
  });
  document.querySelectorAll("[data-approval-status]").forEach((card) => {
    bindOnce(card, "click", () => {
      setStatus(card.getAttribute("data-approval-status") || "ALL");
    });
  });

  bindOnce(document.getElementById("btnCloseRejectRequest"), "click", closeRejectModal);
  bindOnce(document.getElementById("btnCancelRejectRequest"), "click", closeRejectModal);
  bindOnce(document.getElementById("rejectRequestForm"), "submit", submitReject);

  const modal = document.getElementById("modal-reject-request");
  bindOnce(modal, "click", (event) => {
    if (event.target === modal) closeRejectModal();
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
  state.status = status || "ALL";
  state.type = "";
  state.keyword = "";

  const search = document.getElementById("requestApprovalSearch");
  if (search) search.value = "";
  const type = document.getElementById("filterApprovalRequestType");
  if (type) type.value = "";

  bindEvents();
  renderTabs();
  loadRequests();
};
