import api from "../services/api.js";

const STATUS_META = {
  ACTIVE: { label: "Hiện hành", badge: "bg-emerald-50 text-emerald-700" },
  EXPIRING_SOON: { label: "Sắp hết hạn", badge: "bg-amber-50 text-amber-700" },
  EXPIRED: { label: "Quá hạn", badge: "bg-red-50 text-red-700" },
};

const state = {
  mounted: false,
  loading: false,
  keyword: "",
  departmentId: "",
  contractType: "",
  status: "ALL",
  expiringWithinDays: 90,
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 0,
  candidates: [],
  error: "",
  requestSeq: 0,
};

let viewHandlers = {};

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const fmtDate = (v) => {
  if (!v) return "-";
  const [y, m, d] = String(v).slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "-";
};
const fmtMoney = (v) => {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  return Number.isFinite(n) ? `${new Intl.NumberFormat("vi-VN").format(n)} ₫` : "-";
};
const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

const statusOf = (item) => {
  const c = item?.contract || {};
  if (c.display_status) return c.display_status;
  const days = Number(c.days_until_end);
  if (!Number.isFinite(days)) return c.status || "ACTIVE";
  if (days < 0) return "EXPIRED";
  return days <= state.expiringWithinDays ? "EXPIRING_SOON" : "ACTIVE";
};

const getFilters = () => {
  const params = { page: state.page, limit: state.limit, expiring_within_days: state.expiringWithinDays };
  if (state.keyword) params.keyword = state.keyword;
  if (state.departmentId) params.department_id = state.departmentId;
  if (state.contractType) params.contract_type = state.contractType;
  if (state.status !== "ALL") params.status = state.status;
  return params;
};

const renderStats = () => {
  const counts = { ALL: state.total, ACTIVE: 0, EXPIRING_SOON: 0, EXPIRED: 0 };
  state.candidates.forEach((item) => { const s = statusOf(item); if (counts[s] !== undefined) counts[s] += 1; });
  setText("crStatTotal", String(state.total));
  setText("crStatActive", String(counts.ACTIVE));
  setText("crStatExpiring", String(counts.EXPIRING_SOON));
  setText("crStatExpired", String(counts.EXPIRED));
  const note = document.getElementById("crStatNote");
  if (note) note.textContent = "Chỉ gồm HĐ xác định thời hạn trong khoảng lọc. Tổng = toàn bộ ứng viên khớp bộ lọc; Hiện hành/Sắp hết hạn/Quá hạn = đếm trên trang hiện tại (tối đa 10 dòng). Trạng thái suy từ ngày hết hạn, không dùng số liệu trang Hợp đồng.";
};

const renderPagination = () => {
  setText("crPageInfo", `Trang ${state.totalPages ? state.page : 0}/${state.totalPages} - ${state.total} hồ sơ`);
  const prev = document.getElementById("crPrevPage");
  const next = document.getElementById("crNextPage");
  if (prev) prev.disabled = state.loading || state.page <= 1;
  if (next) next.disabled = state.loading || state.totalPages === 0 || state.page >= state.totalPages;
};

const renderBody = () => {
  const body = document.getElementById("crBody");
  if (!body) return;
  if (state.loading) {
    body.innerHTML = `<tr><td colspan="9" class="px-3 py-8 text-center text-on-surface-variant">Đang tải danh sách tái ký...</td></tr>`;
    return;
  }
  if (state.error) {
    body.innerHTML = `<tr><td colspan="9" class="px-3 py-8 text-center text-error">${esc(state.error)}</td></tr>`;
    return;
  }
  if (!state.candidates.length) {
    body.innerHTML = `<tr><td colspan="9" class="px-3 py-8 text-center text-on-surface-variant">Không có hợp đồng cần xem xét tái ký.</td></tr>`;
    return;
  }
  body.innerHTML = state.candidates.map((item) => {
    const c = item.contract || {};
    const e = item.employee || {};
    const review = item.renewal_review || {};
    const statusKey = statusOf(item);
    const meta = STATUS_META[statusKey] || { label: statusKey, badge: "bg-surface-container-high text-on-surface-variant" };
    const days = c.days_until_end;
    const daysText = days === null || days === undefined ? "-" : days < 0 ? `Quá ${Math.abs(days)} ngày` : `Còn ${days} ngày`;
    const count = review.definite_term_signed_count;
    return `<tr class="hover:bg-surface-container-low/50">
      <td class="px-3 py-2 font-medium text-primary">${esc(c.contract_code || "-")}</td>
      <td class="px-3 py-2"><div class="font-medium text-on-surface">${esc(e.full_name || "-")}</div><div class="text-label-sm text-on-surface-variant">${esc(e.employee_code || "-")}</div></td>
      <td class="px-3 py-2 text-on-surface-variant">${esc(e.department?.name || "-")}</td>
      <td class="px-3 py-2 text-on-surface-variant">${esc(c.contract_type || "-")}</td>
      <td class="px-3 py-2 whitespace-nowrap">${fmtDate(c.end_date)}<div class="text-label-sm text-on-surface-variant">${esc(daysText)}</div></td>
      <td class="px-3 py-2"><span class="inline-flex px-2 py-0.5 rounded-full text-label-sm ${meta.badge}">${esc(meta.label)}</span></td>
      <td class="px-3 py-2 text-center">${count === null || count === undefined ? "-" : esc(count)}</td>
      <td class="px-3 py-2 text-right whitespace-nowrap">${fmtMoney(c.signed_salary)}</td>
      <td class="px-3 py-2"><div class="flex items-center justify-center gap-1">
        <button type="button" class="cr-action px-2 py-1 rounded text-label-sm bg-surface-container-high hover:bg-surface-container-highest" data-action="view-contract" data-id="${esc(c.id)}">Xem HĐ</button>
        <button type="button" class="cr-action px-2 py-1 rounded text-label-sm bg-surface-container-high hover:bg-surface-container-highest" data-action="view-employee" data-id="${esc(c.id)}">Xem NV</button>
        <button type="button" class="cr-action px-2 py-1 rounded text-label-sm bg-primary text-on-primary hover:bg-primary-container" data-action="start" data-id="${esc(c.id)}">Bắt đầu</button>
      </div></td>
    </tr>`;
  }).join("");
};
const render = () => {
  renderStats();
  renderPagination();
  renderBody();
};

export const renderContractRenewalSection = () => `
<section id="contractRenewalSection" class="bg-surface-container-lowest rounded-lg shadow-sm overflow-hidden border border-surface-variant">
  <div class="px-space-md py-space-md border-b border-surface-variant flex flex-col lg:flex-row lg:items-center justify-between gap-space-sm">
    <div>
      <h2 class="font-headline-sm text-headline-sm text-on-surface font-bold">Quản lý tái ký hợp đồng</h2>
      <p class="font-body-sm text-body-sm text-on-surface-variant">Danh sách read-only từ API ứng viên tái ký; chỉ HĐ xác định thời hạn trong khoảng lọc. Chưa tạo hồ sơ/quy trình.</p>
      <p id="crStatNote" class="font-label-sm text-label-sm text-on-surface-variant mt-1"></p>
    </div>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 min-w-[320px]">
      <div class="rounded bg-surface-container-low px-3 py-2"><div class="text-label-sm text-on-surface-variant">Tổng</div><div id="crStatTotal" class="font-headline-sm text-primary font-bold">0</div></div>
      <div class="rounded bg-emerald-50 px-3 py-2"><div class="text-label-sm text-emerald-700">Hiện hành</div><div id="crStatActive" class="font-headline-sm text-emerald-700 font-bold">0</div></div>
      <div class="rounded bg-amber-50 px-3 py-2"><div class="text-label-sm text-amber-700">Sắp hết hạn</div><div id="crStatExpiring" class="font-headline-sm text-amber-700 font-bold">0</div></div>
      <div class="rounded bg-red-50 px-3 py-2"><div class="text-label-sm text-red-700">Quá hạn</div><div id="crStatExpired" class="font-headline-sm text-red-700 font-bold">0</div></div>
    </div>
  </div>
  <div class="px-space-md py-space-sm border-b border-surface-variant flex flex-col xl:flex-row gap-space-sm xl:items-end">
    <div class="flex-1 grid grid-cols-1 md:grid-cols-5 gap-2">
      <label class="text-label-sm text-on-surface-variant">Tìm kiếm<input id="crKeyword" class="mt-1 w-full h-9 px-2 rounded border border-surface-variant bg-surface-container-lowest" placeholder="Mã HĐ, mã NV, tên NV"></label>
      <label class="text-label-sm text-on-surface-variant">Phòng ban<input id="crDepartmentId" class="mt-1 w-full h-9 px-2 rounded border border-surface-variant bg-surface-container-lowest" placeholder="Department ID"></label>
      <label class="text-label-sm text-on-surface-variant">Loại HĐ<input id="crContractType" class="mt-1 w-full h-9 px-2 rounded border border-surface-variant bg-surface-container-lowest" placeholder="Ví dụ: xác định thời hạn"></label>
      <label class="text-label-sm text-on-surface-variant">Trạng thái<select id="crStatus" class="mt-1 w-full h-9 px-2 rounded border border-surface-variant bg-surface-container-lowest"><option value="ALL">Tất cả</option><option value="ACTIVE">Hiện hành</option><option value="EXPIRING_SOON">Sắp hết hạn</option></select></label>
      <label class="text-label-sm text-on-surface-variant">Số ngày sắp hết hạn<input id="crDays" type="number" min="1" max="3650" value="90" class="mt-1 w-full h-9 px-2 rounded border border-surface-variant bg-surface-container-lowest"></label>
    </div>
    <div class="flex gap-2">
      <button id="crApply" type="button" class="h-9 px-3 rounded bg-primary text-on-primary font-label-md text-label-md">Lọc</button>
      <button id="crReset" type="button" class="h-9 px-3 rounded border border-surface-variant font-label-md text-label-md">Xóa lọc</button>
    </div>
  </div>
  <div class="overflow-x-auto">
    <table class="w-full text-left border-collapse">
      <thead><tr class="bg-surface-container-high text-on-surface font-label-md text-label-md uppercase tracking-wider">
        <th class="min-w-[120px] px-3 py-2.5">Mã HĐ</th><th class="min-w-[180px] px-3 py-2.5">Nhân viên</th><th class="min-w-[140px] px-3 py-2.5">Phòng ban</th><th class="min-w-[170px] px-3 py-2.5">Loại HĐ</th><th class="min-w-[130px] px-3 py-2.5">Ngày hết hạn</th><th class="min-w-[110px] px-3 py-2.5">Trạng thái</th><th class="min-w-[90px] px-3 py-2.5 text-center">Số lần ký</th><th class="min-w-[120px] px-3 py-2.5 text-right">Lương ký</th><th class="min-w-[220px] px-3 py-2.5 text-center">Thao tác</th>
      </tr></thead>
      <tbody id="crBody" class="font-body-sm text-body-sm divide-y divide-surface-container-high"></tbody>
    </table>
  </div>
  <div class="px-space-md py-space-sm bg-surface-container-low flex items-center justify-between gap-2 font-label-sm text-label-sm text-on-surface-variant">
    <span id="crPageInfo">Trang 0/0 - 0 hồ sơ</span>
    <div class="flex gap-2"><button id="crPrevPage" type="button" class="h-8 px-3 rounded border border-surface-variant disabled:opacity-50">Trước</button><button id="crNextPage" type="button" class="h-8 px-3 rounded border border-surface-variant disabled:opacity-50">Sau</button></div>
  </div>
</section>`;

async function loadCandidates() {
  const seq = ++state.requestSeq;
  state.loading = true;
  state.error = "";
  render();
  try {
    const res = await api.get("/contract-renewals/candidates", { params: getFilters() });
    if (seq !== state.requestSeq) return;
    const payload = res.data || {};
    const pagination = payload.pagination || {};
    state.candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    state.total = Number(pagination.total ?? payload.total ?? state.candidates.length) || 0;
    state.page = Number(pagination.page ?? state.page) || 1;
    state.limit = Number(pagination.limit ?? state.limit) || 10;
    state.totalPages = Number(pagination.total_pages ?? (state.total ? Math.ceil(state.total / state.limit) : 0)) || 0;
  } catch (error) {
    if (seq !== state.requestSeq) return;
    state.error = error.response?.data?.message || "Không thể tải danh sách ứng viên tái ký.";
    state.candidates = [];
    state.total = 0;
    state.totalPages = 0;
  } finally {
    if (seq === state.requestSeq) {
      state.loading = false;
      render();
    }
  }
}
function readFiltersFromUi() {
  state.keyword = document.getElementById("crKeyword")?.value.trim() || "";
  state.departmentId = document.getElementById("crDepartmentId")?.value.trim() || "";
  state.contractType = document.getElementById("crContractType")?.value.trim() || "";
  state.status = document.getElementById("crStatus")?.value || "ALL";
  const days = Number(document.getElementById("crDays")?.value || 90);
  state.expiringWithinDays = Number.isFinite(days) && days > 0 ? Math.min(3650, Math.floor(days)) : 90;
}

function bindEvents() {
  if (state.mounted) return;
  const section = document.getElementById("contractRenewalSection");
  if (!section) return;
  state.mounted = true;
  section.addEventListener("click", async (event) => {
    const actionBtn = event.target.closest("[data-action]");
    if (actionBtn) {
      const action = actionBtn.getAttribute("data-action");
      const id = actionBtn.getAttribute("data-id");
      if (action === "start") {
        window.alert("Chức năng Bắt đầu quy trình tái ký sẽ được triển khai ở TASK tiếp theo. Chưa tạo hồ sơ tái ký.");
        return;
      }
      const item = state.candidates.find((x) => String(x?.contract?.id) === String(id));
      if (action === "view-contract") {
        if (item && viewHandlers.onViewContract) viewHandlers.onViewContract(item);
        else window.alert("Không tìm thấy thông tin hợp đồng ứng viên tái ký.");
      }
      if (action === "view-employee") {
        if (item && viewHandlers.onViewEmployee) viewHandlers.onViewEmployee(item);
        else window.alert("Không tìm thấy thông tin nhân viên ứng viên tái ký.");
      }
      return;
    }
    if (event.target.id === "crApply") { readFiltersFromUi(); state.page = 1; await loadCandidates(); }
    if (event.target.id === "crReset") {
      state.keyword = ""; state.departmentId = ""; state.contractType = ""; state.status = "ALL"; state.expiringWithinDays = 90; state.page = 1;
      ["crKeyword", "crDepartmentId", "crContractType"].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
      const st = document.getElementById("crStatus"); if (st) st.value = "ALL";
      const days = document.getElementById("crDays"); if (days) days.value = "90";
      await loadCandidates();
    }
    if (event.target.id === "crPrevPage" && state.page > 1) { state.page -= 1; await loadCandidates(); }
    if (event.target.id === "crNextPage" && state.page < state.totalPages) { state.page += 1; await loadCandidates(); }
  });
}

const setRenewalSectionVisible = (visible) => {
  const mount = document.getElementById("contractRenewalMount");
  mount?.classList.toggle("hidden", !visible);
};

export function initContractRenewalSection(handlers = {}) {
  viewHandlers = handlers || {};
  bindEvents();
}

export function hideContractRenewalSection() {
  setRenewalSectionVisible(false);
}

export async function showContractRenewalSection() {
  bindEvents();
  const section = document.getElementById("contractRenewalSection");
  if (!section) return;
  setRenewalSectionVisible(true);
  section.scrollIntoView({ behavior: "smooth", block: "start" });
  await loadCandidates();
}

export function resetContractRenewalSectionState() {
  state.mounted = false;
  state.loading = false;
  state.error = "";
  state.requestSeq += 1;
}
