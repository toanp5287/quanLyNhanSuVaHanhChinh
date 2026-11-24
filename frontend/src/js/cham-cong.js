import attendanceHtml from "../pages/cham-cong.html?raw";
import api from "../services/api.js";
import { getCurrentUser, hasPermission } from "../services/auth.service.js";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const number = value => Number(value || 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const time = value => value ? String(value).slice(0, 5) : "—";
const apiErrorMessage = error => {
  if (error.response?.data?.message) return error.response.data.message;
  if (error.response?.status === 404) return "Máy chủ chưa có API chấm công này. Vui lòng khởi động lại backend để cập nhật phiên bản mới.";
  if (error.response?.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (error.response?.status === 403) return "Bạn không có quyền truy cập chức năng chấm công này.";
  if (error.code === "ECONNABORTED") return "Máy chủ phản hồi quá lâu. Vui lòng bấm Làm mới để thử lại.";
  if (error.response) return `Máy chủ không xử lý được yêu cầu chấm công (HTTP ${error.response.status}).`;
  return "Không thể kết nối máy chủ. Vui lòng kiểm tra backend đang chạy và địa chỉ API.";
};
const dailyStatus = row => row.leave_paid != null ? "LEAVE" : !row.log_id ? "UNMARKED" : row.status;
const labels = { VALID: "Hợp lệ", LATE: "Đi muộn", ABSENT: "Vắng không phép", MISSING_CHECKOUT: "Thiếu giờ ra", EXPLAINED: "Đã giải trình", LEAVE: "Nghỉ phép đã duyệt", UNMARKED: "Chưa điểm danh", OPEN: "Đang mở", LOCKED: "Đã khóa" };
const badge = status => `<span class="rounded px-2 py-1 text-xs font-semibold ${["VALID", "OPEN", "EXPLAINED"].includes(status) ? "bg-emerald-50 text-emerald-800" : ["ABSENT", "LOCKED"].includes(status) ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-900"}">${escapeHtml(labels[status] || status || "—")}</span>`;

export function initChamCong(user = getCurrentUser(), initialTab = "daily") {
  const main = document.querySelector("main");
  if (!main) return;
  const doc = new DOMParser().parseFromString(attendanceHtml, "text/html");
  main.replaceChildren(doc.getElementById("attendanceWorkspace"));
  const root = document.getElementById("attendanceWorkspace");
  const el = id => root.querySelector(`#attendance${id}`);
  const state = { tab: initialTab, rows: [], page: 1, loading: false, busy: false, request: 0, failed: false };
  const canManage = hasPermission("ATT.SHIFT_OT_MANAGE", user) && ["ALL", "DEPARTMENT"].includes(user?.data_scope);
  const canMark = canManage && ["MANAGER", "CB_PAYROLL", "HR_ADMIN", "SUPER_ADMIN"].includes(user?.role_id);
  el("Date").value = today();
  el("Month").value = today().slice(0, 7);
  el("Scope").textContent = ({ ALL: "Phạm vi dữ liệu: Toàn công ty", DEPARTMENT: "Phạm vi dữ liệu: Phòng ban của bạn", SELF: "Phạm vi dữ liệu: Cá nhân" })[user?.data_scope] || "";

  function notice(message, error = false) {
    el("Notice").textContent = message;
    el("Notice").className = message ? `rounded p-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}` : "hidden";
  }
  const filtered = () => {
    const search = el("Search").value.trim().toLocaleLowerCase("vi");
    return state.rows.filter(row => (!search || `${row.employee_code} ${row.full_name}`.toLocaleLowerCase("vi").includes(search))
      && (!el("Department").value || String(row.department_id) === el("Department").value)
      && (!el("Status").value || (state.tab === "daily" ? dailyStatus(row) : row.status) === el("Status").value));
  };
  function render() {
    const daily = state.tab === "daily";
    const rows = filtered();
    const size = Number(el("PageSize").value);
    const pages = Math.max(1, Math.ceil(rows.length / size));
    state.page = Math.min(state.page, pages);
    el("DateLabel").classList.toggle("hidden", !daily);
    el("MonthLabel").classList.toggle("hidden", daily);
    root.querySelectorAll("[data-tab]").forEach(button => {
      const active = button.dataset.tab === state.tab;
      button.className = `rounded px-4 py-2 text-sm font-semibold ${active ? "bg-primary text-white" : "bg-white text-on-surface-variant"}`;
      button.setAttribute("aria-selected", String(active));
    });
    el("TableTitle").textContent = daily ? `Bảng điểm danh ngày ${el("Date").value}` : `Tổng hợp công tháng ${el("Month").value}`;
    const metrics = daily ? [
      ["Nhân sự", rows.length], ["Có mặt", rows.filter(row => row.log_id && Number(row.work_unit) > 0 && row.source !== "LEAVE_SYNC").length],
      ["Đi muộn", rows.filter(row => Number(row.late_minutes) > 0).length], ["Chưa điểm danh", rows.filter(row => dailyStatus(row) === "UNMARKED").length],
    ] : [["Nhân sự", rows.length], ["Công thực tế", rows.reduce((sum, row) => sum + Number(row.actual_work_days || 0), 0)],
      ["Công tính lương", rows.reduce((sum, row) => sum + Number(row.total_payable_days || 0), 0)], ["Đã khóa", rows.filter(row => row.status === "LOCKED").length]];
    el("Metrics").innerHTML = metrics.map(([label, value]) => `<div class="bg-white rounded-xl p-4 shadow-sm"><p class="text-sm text-on-surface-variant">${label}</p><p class="text-2xl font-bold text-primary mt-2">${state.loading || state.failed ? "—" : number(value)}</p></div>`).join("");
    const columns = daily ? ["Mã NV", "Họ tên", "Phòng ban", "Ca / Giờ vào – ra", "Muộn / Sớm (phút)", "Công", "Trạng thái", "Nguồn", "Thao tác"]
      : ["Mã NV", "Họ tên", "Phòng ban", "Công chuẩn", "Thực tế", "Nghỉ có lương", "Nghỉ không lương", "Công tính lương", "Muộn (lần / phút)", "OT 150% / 200% / 300%", "Trạng thái"];
    el("Head").innerHTML = `<tr>${columns.map(label => `<th class="px-4 py-3 font-semibold">${label}</th>`).join("")}</tr>`;
    el("Body").innerHTML = state.loading || state.failed || !rows.length ? `<tr><td colspan="${columns.length}" class="p-10 text-center text-on-surface-variant">${state.loading ? "Đang tải dữ liệu…" : state.failed ? "Không thể tải dữ liệu. Bấm Làm mới để thử lại." : "Không có dữ liệu phù hợp với bộ lọc."}</td></tr>` : rows.slice((state.page - 1) * size, state.page * size).map(row => {
      let cells = [escapeHtml(row.employee_code), `<span class="font-semibold">${escapeHtml(row.full_name)}</span>`, escapeHtml(row.department_name || "—")];
      if (daily) {
        const status = dailyStatus(row);
        const actions = canMark && status === "UNMARKED" && row.month_status !== "LOCKED" && el("Date").value <= today()
          ? [ ["PRESENT", "Đủ công"], ["HALF", "Nửa ngày"], ["ABSENT", "Vắng"] ].map(([type, label]) => `<button data-mark="${type}" data-employee="${Number(row.employee_id)}" class="border rounded px-2 py-1 mr-1 hover:bg-surface-container-low">${label}</button>`).join("")
          : row.month_status === "LOCKED" ? badge("LOCKED") : "—";
        cells.push(`${escapeHtml(row.shift_code || "—")}<div class="text-xs text-on-surface-variant mt-1">${time(row.check_in)} – ${time(row.check_out)}</div>`, `${number(row.late_minutes)} / ${number(row.early_leave_minutes)}`, row.log_id ? number(row.work_unit) : "—",
          status === "LEAVE" ? `<span class="bg-sky-50 text-sky-800 rounded px-2 py-1 text-xs">${Number(row.leave_paid) ? "Nghỉ phép có lương" : "Nghỉ không lương"}</span>` : badge(status), escapeHtml(row.source || (status === "LEAVE" ? "LEAVE_SYNC" : "—")), actions);
      } else {
        cells.push(row.id ? number(row.standard_days) : number(state.standardDays), ...["actual_work_days", "paid_leave_days", "unpaid_leave_days", "total_payable_days"].map(key => row.id ? number(row[key]) : "—"), `${number(row.late_count)} / ${number(row.total_late_minutes)}`, `${number(row.ot_hours_150)} / ${number(row.ot_hours_200)} / ${number(row.ot_hours_300)}`, `${badge(row.status)}${!row.id ? '<div class="text-xs mt-1 text-on-surface-variant">Chưa tổng hợp</div>' : ""}`);
      }
      return `<tr class="hover:bg-surface-container-low/60">${cells.map(cell => `<td class="px-4 py-3">${cell}</td>`).join("")}</tr>`;
    }).join("");
    el("Actions").innerHTML = daily ? canMark ? '<button data-action="mark-all" class="bg-primary text-white rounded px-3 py-2 text-sm">Điểm danh tất cả người chưa chấm</button>' : ""
      : canManage ? '<button data-action="recalculate" class="border rounded px-3 py-2 text-sm">Tính & tổng hợp lại</button><button data-action="lock" class="bg-primary text-white rounded px-3 py-2 text-sm">Chốt & khóa bảng công</button>' : "";
    el("Count").textContent = `${rows.length ? (state.page - 1) * size + 1 : 0}–${Math.min(state.page * size, rows.length)} / ${rows.length} nhân viên`;
    el("Page").textContent = `${state.page} / ${pages}`;
    root.querySelector('[data-action="previous"]').disabled = state.page <= 1;
    root.querySelector('[data-action="next"]').disabled = state.page >= pages;
    root.querySelectorAll("[data-mark], #attendanceActions button, [data-action='export']").forEach(button => { button.disabled = state.busy || state.loading || state.failed; button.classList.toggle("opacity-50", button.disabled); });
    root.querySelectorAll("input, select, [data-tab], [data-action='refresh'], [data-action='reset']").forEach(control => { control.disabled = state.busy; });
  }
  async function load() {
    const request = ++state.request;
    state.loading = true; state.failed = false; state.rows = []; render();
    try {
      const daily = state.tab === "daily";
      const response = await api.get(daily ? "/attendance/logs" : "/timesheets", { params: daily ? { date: el("Date").value } : { month: el("Month").value } });
      if (!root.isConnected || request !== state.request) return;
      state.rows = response.data.data.rows; state.standardDays = response.data.data.standard_days;
      const selected = el("Department").value;
      const departments = new Map(state.rows.filter(row => row.department_id).map(row => [String(row.department_id), row.department_name]));
      el("Department").innerHTML = '<option value="">Tất cả phòng ban</option>' + [...departments].map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join("");
      if (departments.has(selected)) el("Department").value = selected;
      el("Updated").textContent = `Cập nhật lúc ${new Date().toLocaleTimeString("vi-VN")} • ${daily ? "Giờ vào/ra theo máy chủ" : "Bản ghi chưa tổng hợp được đánh dấu trong bảng"}`;
    } catch (error) { if (request === state.request && root.isConnected) { state.failed = true; notice(apiErrorMessage(error), true); } }
    finally { if (request === state.request && root.isConnected) { state.loading = false; render(); } }
  }
  function setTab(tab) {
    if (state.busy) return;
    state.tab = tab; state.page = 1;
    const values = tab === "daily" ? ["UNMARKED", "VALID", "LATE", "ABSENT", "LEAVE", "MISSING_CHECKOUT", "EXPLAINED"] : ["OPEN", "LOCKED"];
    el("Status").innerHTML = '<option value="">Tất cả trạng thái</option>' + values.map(value => `<option value="${value}">${labels[value]}</option>`).join("");
    notice(""); load();
  }
  async function confirmAction(message) {
    const dialog = el("Confirm");
    el("ConfirmText").textContent = message;
    dialog.returnValue = "cancel";
    return new Promise(resolve => { dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true }); dialog.showModal(); });
  }
  async function mutate(action, employeeId, type) {
    if (state.busy || state.loading || state.failed) return;
    state.busy = true; render();
    const date = el("Date").value, month = el("Month").value, department = el("Department").value;
    try {
      const message = action === "lock" ? `Khóa bảng công ${month} cho ${department ? "phòng ban đang chọn" : "toàn bộ phạm vi quản lý"}? Sau khi khóa, không thể sửa công trong kỳ.`
        : action === "mark-all" ? `Ghi nhận đủ công ngày ${date} cho tất cả nhân viên chưa chấm thuộc ${department ? "phòng ban đang chọn" : "phạm vi quản lý"}? Thao tác áp dụng cả nhân viên ngoài trang hiện tại; bỏ qua người có đơn nghỉ đã duyệt.`
        : action === "mark" ? `Điểm danh ${type === "PRESENT" ? "đủ công" : type === "HALF" ? "nửa ngày" : "vắng không phép"} ngày ${date} cho ${state.rows.find(row => Number(row.employee_id) === employeeId)?.full_name || "nhân viên"}?`
        : `Tổng hợp lại công, nghỉ phép và OT tháng ${month}?`;
      if (!await confirmAction(message) || !root.isConnected) return;
      const path = action === "mark" ? "/attendance/quick-mark" : action === "mark-all" ? "/attendance/quick-mark-all" : `/timesheets/${action}`;
      const response = await api.post(path, { date, month, department_id: department || null, employee_id: employeeId, type });
      notice(`${response.data.message} (${response.data.data?.count || 0} nhân viên).`);
      await load();
    } catch (error) { notice(apiErrorMessage(error), true); }
    finally { state.busy = false; if (root.isConnected) render(); }
  }
  function exportCsv() {
    const daily = state.tab === "daily";
    const fields = daily ? ["employee_code", "full_name", "department_name", "check_in", "check_out", "work_unit", "late_minutes", "early_leave_minutes", "status", "source"]
      : ["employee_code", "full_name", "department_name", "standard_days", "actual_work_days", "paid_leave_days", "unpaid_leave_days", "total_payable_days", "late_count", "total_late_minutes", "ot_hours_150", "ot_hours_200", "ot_hours_300", "status"];
    const headers = daily ? ["Mã NV", "Họ tên", "Phòng ban", "Giờ vào", "Giờ ra", "Công", "Phút muộn", "Phút về sớm", "Trạng thái", "Nguồn"] : ["Mã NV", "Họ tên", "Phòng ban", "Công chuẩn", "Công thực tế", "Nghỉ có lương", "Nghỉ không lương", "Công tính lương", "Lần muộn", "Phút muộn", "OT 150%", "OT 200%", "OT 300%", "Trạng thái"];
    const quote = value => `"${String(value ?? "").replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
    const records = filtered().map(row => fields.map(field => field === "status" ? labels[daily ? dailyStatus(row) : row.status] : row[field]));
    const url = URL.createObjectURL(new Blob(["\uFEFF", [headers, ...records].map(row => row.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `cham-cong-${daily ? el("Date").value : el("Month").value}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  root.addEventListener("click", event => {
    const button = event.target.closest("button"); if (!button || button.disabled) return;
    if (button.dataset.tab) { if (button.dataset.tab !== state.tab) setTab(button.dataset.tab); return; }
    if (button.dataset.mark) { mutate("mark", Number(button.dataset.employee), button.dataset.mark); return; }
    const action = button.dataset.action;
    if (["mark-all", "recalculate", "lock"].includes(action)) mutate(action);
    if (action === "refresh" && !state.busy) { notice(""); load(); }
    if (action === "export") exportCsv();
    if (action === "previous" || action === "next") { state.page += action === "previous" ? -1 : 1; render(); }
    if (action === "reset") { el("Search").value = ""; el("Department").value = ""; el("Status").value = ""; state.page = 1; render(); }
  });
  for (const id of ["Search", "Department", "Status", "PageSize"]) el(id).addEventListener(id === "Search" ? "input" : "change", () => { state.page = 1; render(); });
  for (const id of ["Date", "Month"]) el(id).addEventListener("change", () => { state.page = 1; notice(""); load(); });
  setTab(initialTab);
}
