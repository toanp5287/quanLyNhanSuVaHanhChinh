import attendanceHtml from "../pages/cham-cong.html?raw";
import api from "../services/api.js";
import { getCurrentUser, hasPermission } from "../services/auth.service.js";

const escapeHtml = value =>
  String(value ?? "").replace(/[&<>"']/g, char =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char],
  );
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const number = value =>
  Number(value || 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const time = value => (value ? String(value).slice(0, 5) : "—");
const timeInput = value => (value ? String(value).slice(0, 5) : "");
const dateTime = value => {
  if (!value) return "—";
  if (value instanceof Date)
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      dateStyle: "short",
      timeStyle: "short",
    }).format(value);
  return String(value).replace("T", " ").slice(0, 16);
};
const apiErrorMessage = error => {
  if (error.response?.data?.message) return error.response.data.message;
  if (error.response?.status === 404)
    return "Máy chủ chưa có API chấm công này. Vui lòng khởi động lại backend.";
  if (error.response?.status === 401)
    return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (error.response?.status === 403)
    return "Bạn không có quyền truy cập chức năng chấm công này.";
  if (error.code === "ECONNABORTED")
    return "Máy chủ phản hồi quá lâu. Vui lòng bấm Làm mới để thử lại.";
  if (error.response)
    return `Máy chủ không xử lý được yêu cầu chấm công (HTTP ${error.response.status}).`;
  return "Không thể kết nối máy chủ. Vui lòng kiểm tra backend đang chạy.";
};

const STATUS_LABELS = {
  VALID: "Hợp lệ",
  ON_TIME: "Đúng giờ",
  LATE: "Đi muộn / về sớm",
  ABSENT: "Vắng không phép",
  MISSING_CHECKOUT: "Thiếu giờ ra",
  MISSING_OUT: "Thiếu giờ ra",
  IN_PROGRESS: "Đang làm việc",
  LEAVE_SYNC: "Nghỉ phép đã duyệt",
  UNMARKED: "Chưa điểm danh",
  EXPLAINED: "Đã giải trình",
  OPEN: "Đang mở",
  LOCKED: "Đã khóa",
};
const SOURCE_LABELS = {
  FACE_ID: "FaceID",
  MANUAL_ADJUST: "Điều chỉnh / giải trình",
  LEAVE_SYNC: "Đồng bộ nghỉ phép",
  RAW_SCAN: "Thủ công",
};
const LEAVE_LABELS = {
  FULL_DAY: "Nghỉ cả ngày",
  MORNING: "Nghỉ sáng",
  AFTERNOON: "Nghỉ chiều",
  LATE_EARLY_EXEMPT: "Miễn muộn/sớm",
};
const OT_LABELS = {
  WEEKDAY: "Ngày thường",
  WEEKEND: "Cuối tuần",
  HOLIDAY: "Ngày lễ",
};
const dailyStatus = row =>
  row.leave_paid != null ? "LEAVE_SYNC" : !row.log_id ? "UNMARKED" : row.status;
const badge = status => {
  const value = status || "—";
  const tone = ["VALID", "OPEN", "EXPLAINED"].includes(value)
    ? "bg-emerald-50 text-emerald-800"
    : ["ABSENT", "LOCKED"].includes(value)
      ? "bg-red-50 text-red-700"
      : ["LEAVE_SYNC", "FACE_ID"].includes(value)
        ? "bg-sky-50 text-sky-800"
        : "bg-amber-50 text-amber-900";
  return `<span class="rounded px-2 py-1 text-xs font-semibold ${tone}">${escapeHtml(STATUS_LABELS[value] || SOURCE_LABELS[value] || value)}</span>`;
};
const section = (title, content) =>
  `<div class="mb-5"><h4 class="text-sm font-bold text-primary mb-2">${title}</h4>${content}</div>`;
const kv = (label, value) =>
  `<div><p class="text-xs text-on-surface-variant">${label}</p><p class="text-sm font-semibold mt-1">${value || "—"}</p></div>`;
const grid = items =>
  `<div class="grid grid-cols-2 md:grid-cols-4 gap-4">${items.map(([label, value]) => kv(label, value)).join("")}</div>`;

export function initChamCong(user = getCurrentUser(), initialTab = "daily") {
  const main = document.querySelector("main");
  if (!main) return;
  const doc = new DOMParser().parseFromString(attendanceHtml, "text/html");
  main.replaceChildren(doc.getElementById("attendanceWorkspace"));
  const root = document.getElementById("attendanceWorkspace");
  const el = id => root.querySelector(`#attendance${id}`);
  const state = {
    tab: initialTab,
    rows: [],
    page: 1,
    loading: false,
    busy: false,
    failed: false,
    request: 0,
    standardDays: 0,
    detail: null,
    detailLoading: false,
  };
  const canManage =
    hasPermission("ATT.SHIFT_OT_MANAGE", user) &&
    ["ALL", "DEPARTMENT"].includes(user?.data_scope);
  const canMark =
    canManage &&
    ["MANAGER", "CB_PAYROLL", "HR_ADMIN", "SUPER_ADMIN"].includes(user?.role_id);
  el("Date").value = today();
  el("Month").value = today().slice(0, 7);
  el("Scope").textContent =
    ({
      ALL: "Phạm vi dữ liệu: Toàn công ty",
      DEPARTMENT: "Phạm vi dữ liệu: Phòng ban của bạn",
      SELF: "Phạm vi dữ liệu: Cá nhân",
    })[user?.data_scope] || "";

  function notice(message, error = false) {
    el("Notice").textContent = message;
    el("Notice").className = message
      ? `rounded p-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`
      : "hidden";
  }

  function filtered() {
    const search = el("Search").value.trim().toLocaleLowerCase("vi");
    const department = el("Department").value;
    const status = el("Status").value;
    const source = el("Source").value;
    return state.rows.filter(row => {
      const haystack = `${row.employee_code} ${row.full_name} ${row.username || ""} ${row.department_name || ""}`.toLocaleLowerCase("vi");
      const rowStatus = state.tab === "daily" ? dailyStatus(row) : row.status;
      const rowSource = row.source || "";
      return (
        (!search || haystack.includes(search)) &&
        (!department || String(row.department_id) === department) &&
        (!status || rowStatus === status) &&
        (!source || rowSource === source)
      );
    });
  }

  function setControlsDisabled(disabled) {
    const controls = root.querySelectorAll(
      "#attendanceDate,#attendanceMonth,#attendanceSearch,#attendanceDepartment,#attendanceStatus,#attendanceSource,#attendancePageSize,[data-tab],[data-action='refresh'],[data-action='export'],[data-action='reset'],[data-action='previous'],[data-action='next'],#attendanceActions button,#attendanceBody button",
    );
    controls.forEach(control => {
      control.disabled = disabled || (control.id === "attendanceSource" && state.tab !== "daily");
      control.classList.toggle("opacity-50", control.disabled);
    });
  }

  function render() {
    const daily = state.tab === "daily";
    const rows = filtered();
    const size = Number(el("PageSize").value);
    const pages = Math.max(1, Math.ceil(rows.length / size));
    state.page = Math.min(state.page, pages);
    el("DateLabel").classList.toggle("hidden", !daily);
    el("MonthLabel").classList.toggle("hidden", daily);
    el("SourceLabel").classList.toggle("hidden", !daily);
    el("Source").disabled = !daily || state.busy || state.loading;
    root.querySelectorAll("[data-tab]").forEach(button => {
      const active = button.dataset.tab === state.tab;
      button.className = `rounded px-4 py-2 text-sm font-semibold ${active ? "bg-primary text-white" : "bg-white text-on-surface-variant"}`;
      button.setAttribute("aria-selected", String(active));
    });
    el("TableTitle").textContent = daily
      ? `Bảng chấm công ngày ${el("Date").value}`
      : `Tổng hợp công tháng ${el("Month").value}`;
    const metrics = daily
      ? [
          ["Nhân sự", rows.length],
          ["Có giờ vào", rows.filter(row => row.check_in).length],
          ["Đi muộn", rows.filter(row => Number(row.late_minutes) > 0).length],
          ["Thiếu giờ ra", rows.filter(row => dailyStatus(row) === "MISSING_CHECKOUT").length],
          ["Nghỉ phép", rows.filter(row => dailyStatus(row) === "LEAVE_SYNC").length],
          ["Chưa điểm danh", rows.filter(row => dailyStatus(row) === "UNMARKED").length],
          ["Tổng công lương", rows.reduce((sum, row) => sum + Number(row.total_workday || 0), 0)],
          ["OT duyệt (giờ)", rows.reduce((sum, row) => sum + Number(row.approved_ot_hours || 0), 0)],
        ]
      : [
          ["Nhân sự", rows.length],
          ["Công chuẩn", rows.reduce((sum, row) => sum + Number(row.standard_days || state.standardDays || 0), 0)],
          ["Công thực tế", rows.reduce((sum, row) => sum + Number(row.actual_work_days || 0), 0)],
          ["Công tính lương", rows.reduce((sum, row) => sum + Number(row.total_payable_days || 0), 0)],
          ["Muộn (lần)", rows.reduce((sum, row) => sum + Number(row.late_count || 0), 0)],
          ["Muộn (phút)", rows.reduce((sum, row) => sum + Number(row.total_late_minutes || 0), 0)],
          ["OT 150/200/300%", rows.reduce((sum, row) => sum + Number(row.ot_hours_150 || 0) + Number(row.ot_hours_200 || 0) + Number(row.ot_hours_300 || 0), 0)],
          ["Đã khóa", rows.filter(row => row.status === "LOCKED").length],
        ];
    el("Metrics").innerHTML = metrics
      .map(
        ([label, value]) =>
          `<div class="bg-white rounded-xl p-4 shadow-sm"><p class="text-sm text-on-surface-variant">${label}</p><p class="text-2xl font-bold text-primary mt-2">${state.loading || state.failed ? "—" : number(value)}</p></div>`,
      )
      .join("");
    const columns = daily
      ? [
          "Nhân viên",
          "Phòng ban",
          "Ca làm việc",
          "Giờ vào",
          "Giờ ra",
          "Muộn / Sớm",
          "Giờ công / OT thô",
          "Công thực / nghỉ / lương",
          "OT duyệt",
          "Nghỉ phép",
          "Nguồn",
          "Trạng thái",
          "Ghi chú / giải trình",
          "Nhật ký quét",
          "Thao tác",
        ]
      : [
          "Mã NV",
          "Họ tên",
          "Phòng ban",
          "Công chuẩn",
          "Thực tế",
          "Nghỉ có lương",
          "Nghỉ không lương",
          "Công tính lương",
          "Muộn (lần / phút)",
          "OT 150 / 200 / 300%",
          "Trạng thái",
        ];
    el("Head").innerHTML = `<tr>${columns.map(label => `<th class="px-4 py-3 font-semibold">${label}</th>`).join("")}</tr>`;
    const emptyText = state.loading
      ? "Đang tải dữ liệu…"
      : state.failed
        ? "Không thể tải dữ liệu. Bấm Làm mới để thử lại."
        : "Không có dữ liệu phù hợp với bộ lọc.";
    const visible = rows.slice((state.page - 1) * size, state.page * size);
    el("Body").innerHTML = !visible.length
      ? `<tr><td colspan="${columns.length}" class="p-10 text-center text-on-surface-variant">${emptyText}</td></tr>`
      : visible
          .map(row => {
            if (!daily) {
              const standard = row.id ? row.standard_days : state.standardDays;
              const cells = [
                escapeHtml(row.employee_code),
                `<span class="font-semibold">${escapeHtml(row.full_name)}</span>`,
                escapeHtml(row.department_name || "—"),
                number(standard),
                row.id ? number(row.actual_work_days) : "—",
                row.id ? number(row.paid_leave_days) : "—",
                row.id ? number(row.unpaid_leave_days) : "—",
                row.id ? `<span class="font-semibold">${number(row.total_payable_days)}</span>` : "—",
                row.id ? `${number(row.late_count)} / ${number(row.total_late_minutes)}` : "—",
                row.id ? `${number(row.ot_hours_150)} / ${number(row.ot_hours_200)} / ${number(row.ot_hours_300)}` : "—",
                `${badge(row.status)}${row.id ? "" : '<div class="text-xs mt-1 text-on-surface-variant">Chưa tổng hợp</div>'}`,
              ];
              return `<tr class="hover:bg-surface-container-low/60">${cells.map(cell => `<td class="px-4 py-3">${cell}</td>`).join("")}</tr>`;
            }
            const status = dailyStatus(row);
            const employee = `<div class="font-semibold">${escapeHtml(row.full_name)}</div><div class="text-xs text-on-surface-variant mt-1">${escapeHtml(row.employee_code)}${row.username ? ` • ${escapeHtml(row.username)}` : ""}</div>`;
            const shift = row.shift_code
              ? `<div class="font-semibold">${escapeHtml(row.shift_code)}</div><div class="text-xs text-on-surface-variant mt-1">${time(row.start_time)} – ${time(row.end_time)}${row.grace_period != null ? ` • grace ${number(row.grace_period)}p` : ""}</div>`
              : "—";
            const checkIn = row.check_in
              ? `<div class="font-semibold">${time(row.check_in)}</div><div class="text-xs text-on-surface-variant mt-1">${escapeHtml(row.check_in_ip || "—")}${row.device_info ? ` • ${escapeHtml(row.device_info)}` : ""}</div>`
              : "—";
            const checkOut = row.check_out
              ? `<div class="font-semibold">${time(row.check_out)}</div><div class="text-xs text-on-surface-variant mt-1">${escapeHtml(row.check_out_ip || "—")}</div>`
              : "—";
            const late = row.log_id
              ? `${number(row.late_minutes)} / ${number(row.early_leave_minutes)}${Number(row.exempt_minutes) > 0 ? `<div class="text-xs text-sky-700 mt-1">Miễn ${number(row.exempt_minutes)}p</div>` : ""}`
              : "—";
            const hours = row.log_id
              ? `${number(row.actual_work_hours)} giờ<div class="text-xs text-on-surface-variant mt-1">OT thô ${number(row.raw_ot_minutes)}p</div>`
              : "—";
            const workday = row.log_id
              ? `${number(row.base_workday)} / ${number(row.paid_leave_workday)} / <span class="font-semibold">${number(row.total_workday)}</span>`
              : row.leave_paid != null
                ? `Nghỉ ${number(row.paid_leave_workday)} công`
                : "—";
            const approvedOt = row.log_id
              ? `${number(row.approved_ot_hours)}h<div class="text-xs text-on-surface-variant mt-1">hệ số ${number(row.ot_rate)}</div>`
              : "—";
            const leave = row.leave_paid != null
              ? `<div>${escapeHtml(LEAVE_LABELS[row.leave_type] || row.leave_type || "Nghỉ phép")}</div><div class="text-xs text-on-surface-variant mt-1">${number(row.paid_leave_workday)} công${row.leave_reason ? ` • ${escapeHtml(row.leave_reason)}` : ""}</div>`
              : "—";
            const note = row.explanation
              ? escapeHtml(row.explanation.reason || "Đã giải trình")
              : row.note
                ? escapeHtml(String(row.note).replace(/^\[EXPLAIN_JSON\].*/, "Đã giải trình"))
                : "—";
            const scans = `${number(row.face_scan_count)} vào / ${number(row.face_out_count)} ra<div class="text-xs text-on-surface-variant mt-1">${row.face_score ? `${(Number(row.face_score) * 100).toFixed(1)}%` : "—"}</div>`;
            const markActions =
              canMark &&
              status === "UNMARKED" &&
              row.month_status !== "LOCKED" &&
              el("Date").value <= today()
                ? `<button data-mark="PRESENT" data-employee="${Number(row.employee_id)}" class="border rounded px-2 py-1 mr-1">Đủ</button><button data-mark="HALF" data-employee="${Number(row.employee_id)}" class="border rounded px-2 py-1 mr-1">Nửa ngày</button><button data-mark="ABSENT" data-employee="${Number(row.employee_id)}" class="border rounded px-2 py-1">Vắng</button>`
                : "";
            const actions = `<button data-detail="${Number(row.employee_id)}" class="border border-primary text-primary rounded px-2 py-1 mr-1">Chi tiết</button>${markActions}${row.month_status === "LOCKED" ? badge("LOCKED") : ""}`;
            const cells = [
              employee,
              escapeHtml(row.department_name || "—"),
              shift,
              checkIn,
              checkOut,
              late,
              hours,
              workday,
              approvedOt,
              leave,
              row.source ? escapeHtml(SOURCE_LABELS[row.source] || row.source) : "—",
              badge(status),
              note,
              scans,
              actions,
            ];
            return `<tr class="hover:bg-surface-container-low/60">${cells.map(cell => `<td class="px-4 py-3 align-top">${cell}</td>`).join("")}</tr>`;
          })
          .join("");
    el("Actions").innerHTML = daily
      ? `${canManage ? '<button data-action="recalculate-day" class="border rounded px-3 py-2 text-sm">Tính công ngày</button>' : ""}${canMark ? '<button data-action="mark-all" class="bg-primary text-white rounded px-3 py-2 text-sm">Điểm danh người chưa chấm</button>' : ""}`
      : canManage
        ? '<button data-action="recalculate" class="border rounded px-3 py-2 text-sm">Tính công tháng</button><button data-action="lock" class="bg-primary text-white rounded px-3 py-2 text-sm">Chốt & khóa bảng công</button>'
        : "";
    el("Count").textContent = `${rows.length ? (state.page - 1) * size + 1 : 0}–${Math.min(state.page * size, rows.length)} / ${rows.length} nhân viên`;
    el("Page").textContent = `${state.page} / ${pages}`;
    root.querySelector('[data-action="previous"]').disabled = state.page <= 1;
    root.querySelector('[data-action="next"]').disabled = state.page >= pages;
    setControlsDisabled(state.busy || state.loading || state.failed);
  }

  async function load() {
    const request = ++state.request;
    state.loading = true;
    state.failed = false;
    state.rows = [];
    state.page = 1;
    render();
    try {
      const daily = state.tab === "daily";
      const response = await api.get(daily ? "/attendance/logs" : "/timesheets", {
        params: daily ? { date: el("Date").value } : { month: el("Month").value },
      });
      if (!root.isConnected || request !== state.request) return;
      state.rows = response.data.data.rows || [];
      state.standardDays = response.data.data.standard_days || 0;
      const selected = el("Department").value;
      const departments = new Map(
        state.rows
          .filter(row => row.department_id)
          .map(row => [String(row.department_id), row.department_name]),
      );
      el("Department").innerHTML =
        '<option value="">Tất cả phòng ban</option>' +
        [...departments]
          .map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`)
          .join("");
      if (departments.has(selected)) el("Department").value = selected;
      el("Updated").textContent = `Cập nhật lúc ${new Date().toLocaleTimeString("vi-VN")} • ${daily ? "Giờ vào/ra lấy từ máy chủ theo giờ Việt Nam" : "Bản ghi chưa tổng hợp được đánh dấu trong bảng"}`;
    } catch (error) {
      if (request === state.request && root.isConnected) {
        state.failed = true;
        notice(apiErrorMessage(error), true);
      }
    } finally {
      if (request === state.request && root.isConnected) {
        state.loading = false;
        render();
      }
    }
  }

  function setTab(tab) {
    if (state.busy) return;
    state.tab = tab;
    state.page = 1;
    const daily = tab === "daily";
    const statuses = daily
      ? ["UNMARKED", "VALID", "ON_TIME", "LATE", "ABSENT", "MISSING_CHECKOUT", "LEAVE_SYNC", "EXPLAINED", "IN_PROGRESS"]
      : ["OPEN", "LOCKED"];
    el("Status").innerHTML =
      '<option value="">Tất cả trạng thái</option>' +
      statuses.map(value => `<option value="${value}">${STATUS_LABELS[value]}</option>`).join("");
    el("Source").innerHTML =
      '<option value="">Tất cả nguồn</option>' +
      Object.entries(SOURCE_LABELS)
        .map(([value, label]) => `<option value="${value}">${label}</option>`)
        .join("");
    notice("");
    load();
  }

  async function confirmAction(message) {
    const dialog = el("Confirm");
    el("ConfirmText").textContent = message;
    dialog.returnValue = "cancel";
    return new Promise(resolve => {
      dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
      dialog.showModal();
    });
  }

  async function mutate(action, employeeId, type) {
    if (state.busy || state.loading || state.failed) return;
    state.busy = true;
    render();
    const date = el("Date").value;
    const month = el("Month").value;
    const department = el("Department").value;
    try {
      const employee = state.rows.find(row => Number(row.employee_id) === Number(employeeId));
      const messages = {
        lock: `Khóa bảng công ${month} cho ${department ? "phòng ban đang chọn" : "toàn bộ phạm vi quản lý"}? Sau khi khóa không thể sửa công trong kỳ.`,
        "mark-all": `Ghi nhận đủ công ngày ${date} cho nhân viên chưa chấm thuộc ${department ? "phòng ban đang chọn" : "phạm vi quản lý"}? Nhân viên có đơn nghỉ đã duyệt sẽ được bỏ qua.`,
        "recalculate-day": `Tính lại giờ vào/ra, muộn/sớm, công và OT ngày ${date}? Bản ghi tháng đã khóa sẽ được bỏ qua.`,
        mark: `Điểm danh ${type === "PRESENT" ? "đủ công" : type === "HALF" ? "nửa ngày" : "vắng không phép"} ngày ${date} cho ${employee?.full_name || "nhân viên"}?`,
        recalculate: `Tổng hợp lại công, nghỉ phép và OT tháng ${month}?`,
      };
      if (!await confirmAction(messages[action]) || !root.isConnected) return;
      const paths = {
        mark: "/attendance/quick-mark",
        "mark-all": "/attendance/quick-mark-all",
        "recalculate-day": "/attendance/recalculate-date",
        recalculate: "/timesheets/recalculate",
        lock: "/timesheets/lock",
      };
      const response = await api.post(paths[action], {
        date,
        month,
        department_id: department || null,
        employee_id: employeeId,
        type,
      });
      notice(`${response.data.message}${response.data.data?.count != null ? ` (${response.data.data.count} nhân viên)` : ""}.`);
      await load();
    } catch (error) {
      notice(apiErrorMessage(error), true);
    } finally {
      state.busy = false;
      if (root.isConnected) render();
    }
  }

  function exportCsv() {
    const daily = state.tab === "daily";
    const fields = daily
      ? ["employee_code", "full_name", "department_name", "shift_code", "check_in", "check_out", "late_minutes", "early_leave_minutes", "actual_work_hours", "base_workday", "paid_leave_workday", "total_workday", "raw_ot_minutes", "approved_ot_hours", "ot_rate", "leave_type", "leave_reason", "source", "status", "note", "face_scan_count", "face_out_count", "face_score", "check_in_ip", "check_out_ip", "device_info"]
      : ["employee_code", "full_name", "department_name", "standard_days", "actual_work_days", "paid_leave_days", "unpaid_leave_days", "total_payable_days", "late_count", "total_late_minutes", "ot_hours_150", "ot_hours_200", "ot_hours_300", "status"];
    const headers = daily
      ? ["Mã NV", "Họ tên", "Phòng ban", "Ca", "Giờ vào", "Giờ ra", "Phút muộn", "Phút sớm", "Giờ công", "Công thực", "Công nghỉ", "Công lương", "OT thô (p)", "OT duyệt (h)", "Hệ số OT", "Loại nghỉ", "Lý do nghỉ", "Nguồn", "Trạng thái", "Ghi chú", "Số lần vào", "Số lần ra", "Face score", "IP vào", "IP ra", "Thiết bị"]
      : ["Mã NV", "Họ tên", "Phòng ban", "Công chuẩn", "Công thực tế", "Nghỉ có lương", "Nghỉ không lương", "Công tính lương", "Lần muộn", "Phút muộn", "OT 150%", "OT 200%", "OT 300%", "Trạng thái"];
    const quote = value =>
      `"${String(value ?? "").replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
    const records = filtered().map(row =>
      fields.map(field => {
        if (field === "status")
          return STATUS_LABELS[daily ? dailyStatus(row) : row.status] || "";
        if (field === "source") return SOURCE_LABELS[row.source] || row.source || "";
        return row[field];
      }),
    );
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", [headers, ...records].map(row => row.map(quote).join(",")).join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `quan-ly-cham-cong-${daily ? el("Date").value : el("Month").value}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const detailVisible = () => !el("DetailModal").classList.contains("hidden");
  const openDetail = () => {
    el("DetailModal").classList.remove("hidden");
    el("DetailModal").classList.add("flex");
  };
  const closeDetail = () => {
    el("DetailModal").classList.add("hidden");
    el("DetailModal").classList.remove("flex");
    state.detail = null;
  };
  const detailLoading = message => {
    state.detailLoading = true;
    el("DetailTitle").textContent = "Chi tiết chấm công";
    el("DetailSubtitle").textContent = message;
    el("DetailBody").innerHTML = `<p class="text-sm text-on-surface-variant">${escapeHtml(message)}</p>`;
  };

  function renderDetail(data) {
    state.detail = data;
    state.detailLoading = false;
    const attendance = data.attendance || {};
    const shift = data.shift || {};
    el("DetailTitle").textContent = `${data.employee.employee_code} • ${data.employee.full_name}`;
    el("DetailSubtitle").textContent = `${data.date} • ${data.employee.department_name || "—"} • ${STATUS_LABELS[attendance.status] || attendance.status || "Chưa có bản ghi"}`;
    const scanRows = data.scans.length
      ? `<table class="w-full text-sm"><thead class="bg-surface-container-low"><tr><th class="px-3 py-2 text-left">Thời gian</th><th class="px-3 py-2 text-left">Loại</th><th class="px-3 py-2 text-left">ĐiểmFace</th><th class="px-3 py-2 text-left">IP</th><th class="px-3 py-2 text-left">Thiết bị</th><th class="px-3 py-2 text-left">Kết quả</th></tr></thead><tbody>${data.scans.map(scan => `<tr class="border-b"><td class="px-3 py-2">${escapeHtml(scan.scan_time)}</td><td class="px-3 py-2">${escapeHtml(scan.scan_type)}</td><td class="px-3 py-2">${scan.face_score ? `${(Number(scan.face_score) * 100).toFixed(1)}%` : "—"}</td><td class="px-3 py-2">${escapeHtml(scan.ip_address || "—")}</td><td class="px-3 py-2">${escapeHtml(scan.device_info || "—")}</td><td class="px-3 py-2">${scan.is_valid ? "Hợp lệ" : escapeHtml(scan.reject_reason || "Từ chối")}</td></tr>`).join("")}</tbody></table>`
      : '<p class="text-sm text-on-surface-variant">Chưa có nhật ký quét cho ngày này.</p>';
    const leaveRows = data.leaves.length
      ? data.leaves.map(leave => `<div class="border rounded p-3 mb-2"><p class="text-sm font-semibold">${escapeHtml(LEAVE_LABELS[leave.leave_type] || leave.leave_type)} • ${number(leave.paid_workday)} công${Number(leave.exempt_minutes) > 0 ? ` • miễn ${number(leave.exempt_minutes)} phút` : ""}</p><p class="text-xs text-on-surface-variant mt-1">${escapeHtml(leave.reason || "—")} • duyệt lúc ${escapeHtml(leave.approved_at || "—")}</p></div>`).join("")
      : '<p class="text-sm text-on-surface-variant">Không có đơn nghỉ phép được duyệt.</p>';
    const otRows = data.overtimes.length
      ? data.overtimes.map(ot => `<div class="border rounded p-3 mb-2"><p class="text-sm font-semibold">${escapeHtml(OT_LABELS[ot.ot_type] || ot.ot_type)} • ${time(ot.start_time)} – ${time(ot.end_time)} • hệ số ${number(ot.ot_rate)}</p><p class="text-xs text-on-surface-variant mt-1">${escapeHtml(ot.reason || "—")} • duyệt lúc ${escapeHtml(ot.approved_at || "—")}</p></div>`).join("")
      : '<p class="text-sm text-on-surface-variant">Không có OT được duyệt.</p>';
    const editable = data.editable && canManage;
    const editPanel = editable
      ? `<div class="grid md:grid-cols-2 gap-4">
          <label class="text-sm">Giờ vào<input id="attendanceDetailCheckIn" type="time" value="${timeInput(attendance.check_in)}" class="block w-full rounded border px-3 py-2 mt-1" /></label>
          <label class="text-sm">Giờ ra<input id="attendanceDetailCheckOut" type="time" value="${timeInput(attendance.check_out)}" class="block w-full rounded border px-3 py-2 mt-1" /></label>
          <label class="text-sm md:col-span-2">Ghi chú<textarea id="attendanceDetailNote" rows="3" class="block w-full rounded border px-3 py-2 mt-1">${escapeHtml(attendance.note || "")}</textarea></label>
        </div><div class="flex gap-2 mt-4"><button data-action="detail-save" class="bg-primary text-white rounded px-4 py-2 text-sm">Lưu chỉnh sửa</button><button data-action="detail-reload" class="border rounded px-4 py-2 text-sm">Tải lại</button></div>`
      : `<p class="text-sm text-on-surface-variant">${data.editable ? "Bạn không có quyền chỉnh sửa bản ghi này." : "Tháng công đã bị khóa, không thể chỉnh sửa."}</p>`;
    el("DetailBody").innerHTML = [
      section("Thông tin chấm công", grid([
        ["Ngày công", data.date],
        ["Ca làm việc", shift.shift_code ? `${escapeHtml(shift.shift_code)} • ${escapeHtml(shift.name || "")}` : "—"],
        ["Giờ ca", shift.start_time ? `${time(shift.start_time)} – ${time(shift.end_time)}` : "—"],
        ["Giờ vào", time(attendance.check_in)],
        ["Giờ ra", time(attendance.check_out)],
        ["Trạng thái", badge(attendance.status)],
        ["IP vào / ra", `${escapeHtml(attendance.check_in_ip || "—")} / ${escapeHtml(attendance.check_out_ip || "—")}`],
        ["Nguồn", SOURCE_LABELS[attendance.source] || attendance.source || "—"],
      ])),
      section("Kết quả tính công", grid([
        ["Muộn", `${number(attendance.late_minutes)} phút`],
        ["Về sớm", `${number(attendance.early_leave_minutes)} phút`],
        ["Giờ công thực tế", `${number(attendance.actual_work_hours)} giờ`],
        ["OT thô", `${number(attendance.raw_ot_minutes)} phút`],
        ["Công thực tế", number(attendance.base_workday)],
        ["Công nghỉ có lương", number(attendance.paid_leave_workday)],
        ["Công tính lương", number(attendance.total_workday)],
        ["OT duyệt", `${number(attendance.approved_ot_hours)} giờ • hệ số ${number(attendance.ot_rate)}`],
      ])),
      section("Giải trình", attendance.explanation
        ? `<div class="border rounded p-3"><p class="text-sm font-semibold">${escapeHtml(attendance.explanation.reason || "Đã giải trình")}</p><p class="text-xs text-on-surface-variant mt-1">Trạng thái: ${escapeHtml(attendance.explanation.status || "—")}</p></div>`
        : '<p class="text-sm text-on-surface-variant">Không có giải trình.</p>'),
      section("Nghỉ phép / OT đã duyệt", `<div class="grid md:grid-cols-2 gap-4"><div>${leaveRows}</div><div>${otRows}</div></div>`),
      section("Nhật ký quét", scanRows),
      section("Chỉnh sửa chấm công", editPanel),
    ].join("");
  }

  async function loadDetail(employeeId) {
    openDetail();
    detailLoading("Đang tải chi tiết chấm công…");
    try {
      const response = await api.get("/attendance/detail", {
        params: { employee_id: employeeId, date: el("Date").value },
      });
      if (!root.isConnected || !detailVisible()) return;
      renderDetail(response.data.data);
    } catch (error) {
      if (detailVisible()) el("DetailBody").innerHTML = `<p class="text-sm text-red-700">${escapeHtml(apiErrorMessage(error))}</p>`;
    } finally {
      state.detailLoading = false;
    }
  }

  async function saveDetail() {
    if (!state.detail?.editable || !canManage || state.busy) return;
    const checkIn = root.querySelector("#attendanceDetailCheckIn")?.value || "";
    const checkOut = root.querySelector("#attendanceDetailCheckOut")?.value || "";
    const note = root.querySelector("#attendanceDetailNote")?.value || "";
    if (!await confirmAction(`Lưu giờ vào ${time(checkIn)} / giờ ra ${time(checkOut)} cho ${state.detail.employee.full_name} ngày ${state.detail.date}? Hệ thống sẽ tính lại công và OT.`)) return;
    state.busy = true;
    try {
      const response = await api.put("/attendance/manual", {
        employee_id: state.detail.employee.id,
        date: state.detail.date,
        check_in: checkIn,
        check_out: checkOut,
        note,
      });
      if (!root.isConnected) return;
      notice(response.data.message);
      await load();
      if (detailVisible()) renderDetail(response.data.data);
    } catch (error) {
      notice(apiErrorMessage(error), true);
    } finally {
      state.busy = false;
      if (root.isConnected) render();
    }
  }

  root.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (button.dataset.tab) {
      if (button.dataset.tab !== state.tab) setTab(button.dataset.tab);
      return;
    }
    if (button.dataset.detail) {
      loadDetail(Number(button.dataset.detail));
      return;
    }
    if (button.dataset.mark) {
      mutate("mark", Number(button.dataset.employee), button.dataset.mark);
      return;
    }
    if (["mark-all", "recalculate", "recalculate-day", "lock"].includes(action)) {
      mutate(action);
      return;
    }
    if (action === "refresh") {
      notice("");
      load();
    } else if (action === "export") {
      exportCsv();
    } else if (action === "reset") {
      el("Search").value = "";
      el("Department").value = "";
      el("Status").value = "";
      el("Source").value = "";
      state.page = 1;
      render();
    } else if (action === "previous" || action === "next") {
      state.page += action === "previous" ? -1 : 1;
      render();
    } else if (action === "detail-close") {
      closeDetail();
    } else if (action === "detail-save") {
      saveDetail();
    } else if (action === "detail-reload") {
      loadDetail(state.detail.employee.id);
    }
  });
  for (const id of ["Search", "Department", "Status", "Source", "PageSize"])
    el(id).addEventListener(id === "Search" ? "input" : "change", () => {
      state.page = 1;
      render();
    });
  for (const id of ["Date", "Month"])
    el(id).addEventListener("change", () => {
      state.page = 1;
      notice("");
      load();
    });
  window.addEventListener("hashchange", closeDetail);
  window.addEventListener("pagehide", closeDetail);
  setTab(initialTab);
}
