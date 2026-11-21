import employeeRequestsHtml from "../pages/employee-requests.html?raw";
import api from "../services/api.js";
import { getCurrentUser, logout } from "../services/auth.service.js";
import { setupShell } from "./home.js";

export const ACTIVE_STATUSES = [
  "DRAFT",
  "PENDING_DEPARTMENT",
  "PENDING_HR",
  "WAITING_EMPLOYEE_UPDATE",
  "PENDING_DIRECTOR",
];

export const REQUEST_TYPES = {
  RESIGNATION: "Đơn xin nghỉ việc",
  TEMPORARY_LEAVE: "Đơn xin tạm nghỉ",
};

export const STATUS_META = {
  DRAFT: {
    label: "Nháp",
    badge: "bg-surface-container-high text-on-surface-variant",
  },
  PENDING_DEPARTMENT: {
    label: "Chờ quản lý duyệt",
    badge: "bg-amber-100 text-amber-700",
  },
  PENDING_HR: {
    label: "Chờ HR duyệt",
    badge: "bg-blue-100 text-blue-700",
  },
  WAITING_EMPLOYEE_UPDATE: {
    label: "Chờ bổ sung hồ sơ",
    badge: "bg-orange-100 text-orange-700",
  },
  PENDING_DIRECTOR: {
    label: "Chờ Giám đốc duyệt",
    badge: "bg-indigo-100 text-indigo-700",
  },
  APPROVED: {
    label: "Đã duyệt",
    badge: "bg-emerald-100 text-emerald-700",
  },
  REJECTED: {
    label: "Từ chối",
    badge: "bg-red-100 text-red-700",
  },
  CANCELLED: {
    label: "Đã hủy",
    badge: "bg-surface-container-high text-on-surface-variant",
  },
};

const state = {
  requests: [],
  summary: {},
  type: "ALL",
  status: "ALL",
  keyword: "",
  fromDate: "",
  toDate: "",
  requestSeq: 0,
  searchTimer: null,
  formType: "RESIGNATION",
};

export const getEmployeeRequestTypeFromHash = (
  hash = window.location.hash,
) => {
  if (hash === "#/don-tu/nghi-viec") return "RESIGNATION";
  if (hash === "#/don-tu/tam-nghi") return "TEMPORARY_LEAVE";
  return "ALL";
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
  const notice = document.getElementById("employeeRequestsNotice");
  if (!notice) return;

  notice.textContent = message;
  notice.className = isError
    ? "flex items-start gap-space-sm rounded-lg border px-space-md py-space-sm font-body-sm text-body-sm border-error/30 bg-error-container text-on-error-container"
    : "flex items-start gap-space-sm rounded-lg border px-space-md py-space-sm font-body-sm text-body-sm border-primary/30 bg-primary-fixed text-on-primary-fixed";
};

const hideNotice = () => {
  const notice = document.getElementById("employeeRequestsNotice");
  if (!notice) return;
  notice.textContent = "";
  notice.className = "hidden";
};

const ensureViewMounted = () => {
  if (!window.__HRM_SPA__) return;

  const main = document.querySelector("main");
  if (!main) return;

  const doc = new DOMParser().parseFromString(employeeRequestsHtml, "text/html");
  const view = doc.querySelector("main > div");
  const modal = doc.getElementById("modal-employee-request-form");
  if (!view) return;

  main.innerHTML = "";
  document.getElementById("modal-employee-request-form")?.remove();
  main.appendChild(document.importNode(view, true));
  if (modal) document.body.appendChild(document.importNode(modal, true));
};

const visibleRequests = () => {
  if (state.status !== "PENDING_GROUP") return state.requests;
  return state.requests.filter((row) => ACTIVE_STATUSES.includes(row.status));
};

const renderSummary = () => {
  setText("#countRequestAll", String(state.summary.total ?? 0));
  setText("#countRequestPending", String(state.summary.pending ?? 0));
  setText("#countRequestApproved", String(state.summary.approved ?? 0));
  setText("#countRequestRejected", String(state.summary.rejected ?? 0));
};

const renderStatusCards = () => {
  document.querySelectorAll("[data-request-status]").forEach((card) => {
    const selected = card.getAttribute("data-request-status") === state.status;
    card.classList.toggle("border-primary", selected);
    card.classList.toggle("border-transparent", !selected);
  });
};

const renderRows = () => {
  const tbody = document.getElementById("employeeRequestsBody");
  if (!tbody) return;

  const rows = visibleRequests();
  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td class="px-3 py-8 text-center text-on-surface-variant" colspan="10">
          Không có đơn từ nào phù hợp với bộ lọc hiện tại.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = rows
    .map((row) => {
      const typeLabel = REQUEST_TYPES[row.request_type] || row.request_type || "—";
      const status = STATUS_META[row.status] || {
        label: row.status || "—",
        badge: "bg-surface-container-high text-on-surface-variant",
      };
      const endDate =
        row.request_type === "RESIGNATION"
          ? row.last_working_date
          : row.end_date;

      return `
        <tr class="hover:bg-surface-container-low transition-colors">
          <td class="px-3 py-3 font-semibold text-on-surface">#${escapeHtml(row.id)}</td>
          <td class="px-3 py-3 text-on-surface">${escapeHtml(typeLabel)}</td>
          <td class="px-3 py-3 min-w-[240px]">
            <p class="font-medium text-on-surface truncate">${escapeHtml(row.title)}</p>
            <p class="font-body-sm text-body-sm text-on-surface-variant truncate" title="${escapeHtml(row.reason)}">${escapeHtml(row.reason)}</p>
          </td>
          <td class="px-3 py-3">
            <p class="font-medium text-on-surface">${escapeHtml(row.full_name)}</p>
            <p class="font-label-sm text-label-sm text-on-surface-variant">${escapeHtml(row.employee_code)}</p>
          </td>
          <td class="px-3 py-3 text-on-surface-variant">${escapeHtml(row.department_name || "—")}</td>
          <td class="px-3 py-3 whitespace-nowrap text-on-surface-variant">${formatDate(row.start_date)}</td>
          <td class="px-3 py-3 whitespace-nowrap text-on-surface-variant">${formatDate(endDate)}</td>
          <td class="px-3 py-3 text-center">
            <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-label-sm text-label-sm ${status.badge}">
              <span class="w-1.5 h-1.5 rounded-full bg-current opacity-70"></span>
              ${escapeHtml(status.label)}
            </span>
          </td>
          <td class="px-3 py-3 whitespace-nowrap text-on-surface-variant">${formatDateTime(row.submitted_at)}</td>
          <td class="px-3 py-3 text-center">
            <button
              class="h-8 px-space-sm rounded border border-surface-variant text-primary hover:bg-primary-fixed font-label-sm text-label-sm inline-flex items-center gap-1"
              data-view-request-id="${escapeHtml(row.id)}"
              type="button"
            >
              <span class="material-symbols-outlined text-[16px]">visibility</span>
              <span>Xem</span>
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
};

const renderTableLoading = () => {
  const tbody = document.getElementById("employeeRequestsBody");
  if (!tbody) return;
  tbody.innerHTML = `
    <tr>
      <td class="px-3 py-8 text-center text-on-surface-variant" colspan="10">Đang tải danh sách đơn từ...</td>
    </tr>
  `;
};

const renderTableError = (message) => {
  const tbody = document.getElementById("employeeRequestsBody");
  if (!tbody) return;
  tbody.innerHTML = `
    <tr>
      <td class="px-3 py-8 text-center text-error" colspan="10">${escapeHtml(message)}</td>
    </tr>
  `;
};

const loadRequests = async () => {
  const sequence = ++state.requestSeq;
  hideNotice();
  renderTableLoading();

  try {
    const params = {};
    if (state.type !== "ALL") params.request_type = state.type;
    if (state.status !== "ALL" && state.status !== "PENDING_GROUP") {
      params.status = state.status;
    }
    if (state.keyword) params.keyword = state.keyword;
    if (state.fromDate) params.from_date = state.fromDate;
    if (state.toDate) params.to_date = state.toDate;

    const response = await api.get("/employee-requests", { params });
    if (sequence !== state.requestSeq) return;

    const payload = response.data?.data || {};
    state.requests = Array.isArray(payload.requests) ? payload.requests : [];
    state.summary = payload.summary || state.summary;

    renderSummary();
    renderStatusCards();
    renderRows();

    const typeLabel =
      state.type === "ALL"
        ? "tất cả loại đơn"
        : REQUEST_TYPES[state.type] || state.type;

    setText(
      "#employeeRequestsSubtitle",
      `Danh sách ${typeLabel} trong phạm vi dữ liệu của bạn.`,
    );
    setText(
      "#employeeRequestsResultInfo",
      `Hiển thị ${visibleRequests().length} / ${state.summary.total ?? state.requests.length} đơn`,
    );
    setText(
      "#employeeRequestsUpdatedAt",
      `Cập nhật lúc ${new Date().toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      })}`,
    );
  } catch (error) {
    if (sequence !== state.requestSeq) return;

    const message =
      error.response?.data?.message ||
      "Không thể tải danh sách đơn từ. Vui lòng thử lại.";

    showNotice(message, true);
    renderTableError(message);
    setText("#employeeRequestsResultInfo", "Không thể tải dữ liệu");
  }
};

const bindOnce = (element, event, handler) => {
  if (!element || element.dataset.bound === "1") return;
  element.dataset.bound = "1";
  element.addEventListener(event, handler);
};

const setStatus = (value) => {
  state.status = value;
  const select = document.getElementById("filterEmployeeRequestStatus");
  if (select) select.value = value;
  renderStatusCards();
  loadRequests();
};

const setFormError = (message) => {
  const error = document.getElementById("employeeRequestFormError");
  if (!error) return;
  error.textContent = message;
  error.classList.remove("hidden");
};

const hideFormError = () => {
  const error = document.getElementById("employeeRequestFormError");
  if (!error) return;
  error.textContent = "";
  error.classList.add("hidden");
};

const openCreateForm = (type) => {
  const modal = document.getElementById("modal-employee-request-form");
  const form = document.getElementById("employeeRequestForm");
  if (!modal || !form) return;

  state.formType = type;
  const isResignation = type === "RESIGNATION";

  setText(
    "#employeeRequestFormTitle",
    isResignation ? "Gửi đơn xin nghỉ việc" : "Gửi đơn xin tạm nghỉ",
  );
  setText(
    "#employeeRequestFormSubtitle",
    isResignation
      ? "Khai báo ngày bắt đầu nghỉ và ngày làm việc cuối."
      : "Khai báo thời gian tạm nghỉ và lý do.",
  );

  document
    .getElementById("employeeRequestLastWorkingGroup")
    ?.classList.toggle("hidden", !isResignation);
  document
    .getElementById("employeeRequestEndGroup")
    ?.classList.toggle("hidden", isResignation);
  document.getElementById("employeeRequestLastWorkingDate").required = isResignation;
  document.getElementById("employeeRequestEndDate").required = !isResignation;
  setText(
    'label[for="employeeRequestStartDate"]',
    isResignation ? "Ngày bắt đầu nghỉ *" : "Ngày bắt đầu tạm nghỉ *",
  );

  form.reset();
  setText("#employeeRequestReasonCount", "0 / 5000");
  hideFormError();
  modal.classList.remove("hidden");
  modal.classList.add("flex");
};

const closeCreateForm = () => {
  const modal = document.getElementById("modal-employee-request-form");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
};

const submitCreateForm = async (event) => {
  event.preventDefault();
  hideFormError();

  const isResignation = state.formType === "RESIGNATION";
  const reason = document.getElementById("employeeRequestReason")?.value.trim();
  const startDate = document.getElementById("employeeRequestStartDate")?.value;
  const lastWorkingDate = document.getElementById("employeeRequestLastWorkingDate")?.value;
  const endDate = document.getElementById("employeeRequestEndDate")?.value;

  if (!reason) {
    setFormError("Vui lòng nhập lý do gửi đơn.");
    return;
  }
  if (!startDate) {
    setFormError("Vui lòng chọn ngày bắt đầu.");
    return;
  }

  let endpoint = "/employee-requests/resignation";
  let payload = {};

  if (isResignation) {
    if (!lastWorkingDate) {
      setFormError("Vui lòng chọn ngày làm việc cuối.");
      return;
    }
    if (lastWorkingDate < startDate) {
      setFormError("Ngày làm việc cuối không được trước ngày bắt đầu nghỉ.");
      return;
    }
    payload = {
      title: "Đơn xin nghỉ việc",
      reason,
      start_date: startDate,
      last_working_date: lastWorkingDate,
    };
  } else {
    if (!endDate) {
      setFormError("Vui lòng chọn ngày kết thúc tạm nghỉ.");
      return;
    }
    if (endDate < startDate) {
      setFormError("Ngày kết thúc tạm nghỉ không được trước ngày bắt đầu.");
      return;
    }
    endpoint = "/employee-requests/temporary-leave";
    payload = {
      title: "Đơn xin tạm nghỉ",
      reason,
      start_date: startDate,
      end_date: endDate,
    };
  }

  const button = document.getElementById("btnSubmitEmployeeRequest");
  const originalHtml = button?.innerHTML || "";
  if (button) {
    button.disabled = true;
    button.innerHTML = "<span>Đang gửi...</span>";
  }

  try {
    const response = await api.post(endpoint, payload);
    closeCreateForm();
    const data = response.data?.data || {};
    showNotice(`Đã gửi ${data.request_type === "TEMPORARY_LEAVE" ? "đơn xin tạm nghỉ" : "đơn xin nghỉ việc"} #${data.id || ""}.`, false);
    loadRequests();
  } catch (error) {
    setFormError(
      error.response?.data?.message || "Không thể gửi đơn. Vui lòng thử lại.",
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }
};

const bindEvents = () => {
  bindOnce(document.getElementById("btnRefreshEmployeeRequests"), "click", () => {
    loadRequests();
  });

  bindOnce(document.getElementById("employeeRequestSearch"), "input", (event) => {
    state.keyword = event.target.value.trim();
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => loadRequests(), 300);
  });

  bindOnce(document.getElementById("filterEmployeeRequestType"), "change", (event) => {
    state.type = event.target.value || "ALL";
    loadRequests();
  });

  bindOnce(document.getElementById("filterEmployeeRequestStatus"), "change", (event) => {
    setStatus(event.target.value || "ALL");
  });

  bindOnce(document.getElementById("filterEmployeeRequestFromDate"), "change", (event) => {
    state.fromDate = event.target.value;
    loadRequests();
  });

  bindOnce(document.getElementById("filterEmployeeRequestToDate"), "change", (event) => {
    state.toDate = event.target.value;
    loadRequests();
  });

  document.querySelectorAll("[data-request-status]").forEach((card) => {
    bindOnce(card, "click", () => {
      setStatus(card.getAttribute("data-request-status") || "ALL");
    });
  });

  bindOnce(document.getElementById("employeeRequestsBody"), "click", (event) => {
    const button = event.target.closest("[data-view-request-id]");
    if (!button) return;
    window.location.hash = `#/don-tu/${button.getAttribute("data-view-request-id")}`;
  });

  bindOnce(document.getElementById("btnCreateResignation"), "click", () => {
    openCreateForm("RESIGNATION");
  });
  bindOnce(document.getElementById("btnCreateTemporaryLeave"), "click", () => {
    openCreateForm("TEMPORARY_LEAVE");
  });
  bindOnce(document.getElementById("btnCloseEmployeeRequestForm"), "click", closeCreateForm);
  bindOnce(document.getElementById("btnCancelEmployeeRequestForm"), "click", closeCreateForm);
  bindOnce(document.getElementById("employeeRequestForm"), "submit", submitCreateForm);
  bindOnce(document.getElementById("employeeRequestReason"), "input", (event) => {
    setText("#employeeRequestReasonCount", `${event.target.value.length} / 5000`);
  });

  const modal = document.getElementById("modal-employee-request-form");
  bindOnce(modal, "click", (event) => {
    if (event.target === modal) closeCreateForm();
  });
};

export const initEmployeeRequests = (
  user = getCurrentUser(),
  type = "ALL",
) => {
  if (!user) {
    logout();
    return;
  }

  ensureViewMounted();
  if (!window.__HRM_SPA__) setupShell(user);

  state.type = type || "ALL";
  state.status = "ALL";
  state.keyword = "";
  state.fromDate = "";
  state.toDate = "";

  const typeSelect = document.getElementById("filterEmployeeRequestType");
  if (typeSelect) typeSelect.value = state.type;

  const statusSelect = document.getElementById("filterEmployeeRequestStatus");
  if (statusSelect) statusSelect.value = state.status;

  const search = document.getElementById("employeeRequestSearch");
  if (search) search.value = "";

  const fromDate = document.getElementById("filterEmployeeRequestFromDate");
  if (fromDate) fromDate.value = "";

  const toDate = document.getElementById("filterEmployeeRequestToDate");
  if (toDate) toDate.value = "";

  bindEvents();
  renderStatusCards();
  loadRequests();
};
