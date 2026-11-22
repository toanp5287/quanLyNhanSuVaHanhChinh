import historyHtml from "../pages/lich-su-cham-cong.html?raw";
import api from "../services/api.js";

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const STATUS_LABELS = {
  PRESENT: "Có mặt",
  LATE: "Muộn / về sớm",
  MISSING: "Thiếu giờ ra",
  LEAVE: "Nghỉ phép",
  ABSENT: "Vắng mặt",
  IN_PROGRESS: "Đang làm việc",
  UNMARKED: "Chưa điểm danh",
};
const STATUS_STYLES = {
  PRESENT: "bg-emerald-50 border-emerald-200 text-emerald-800",
  LATE: "bg-amber-50 border-amber-200 text-amber-900",
  MISSING: "bg-amber-50 border-amber-200 text-amber-900",
  LEAVE: "bg-sky-50 border-sky-200 text-sky-800",
  ABSENT: "bg-red-50 border-red-200 text-red-700",
  IN_PROGRESS: "bg-indigo-50 border-indigo-200 text-indigo-800",
  UNMARKED: "bg-surface-container-low border-outline-variant text-on-surface-variant",
};

const currentMonth = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());

const todayString = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const shiftMonth = (month, delta) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

const daysInMonth = (month) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const total = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: total }, (_, index) =>
    `${month}-${String(index + 1).padStart(2, "0")}`,
  );
};

const weekdayLabel = (date) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "UTC",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));

const number = (value, suffix = "") =>
  Number(value || 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 }) + suffix;

const statusOf = (day) => {
  const attendance = day?.attendance;
  const leave = day?.leave;
  if (leave && !attendance?.check_in) return "LEAVE";
  if (!attendance) return "UNMARKED";
  const raw = String(attendance.status || "");
  if (["MISSING_CHECKOUT", "MISSING_OUT"].includes(raw)) return "MISSING";
  if (raw === "ABSENT") return "ABSENT";
  if (raw === "IN_PROGRESS") return "IN_PROGRESS";
  if (Number(attendance.late_minutes) > 0 || Number(attendance.early_leave_minutes) > 0) return "LATE";
  if (attendance.check_in) return "PRESENT";
  return "UNMARKED";
};

const buildDay = (date, data) => {
  const attendance = data?.rows?.find((row) => row.work_date === date) || null;
  const leave = data?.leaves?.find((row) => row.work_date === date) || null;
  const day = { date, attendance, leave };
  return { ...day, status: statusOf(day) };
};

const tooltipOf = (day) => {
  const lines = [`${weekdayLabel(day.date)}: ${STATUS_LABELS[day.status]}`];
  lines.push(`Giờ vào: ${day.attendance?.check_in || "—"}`);
  lines.push(`Giờ ra: ${day.attendance?.check_out || "—"}`);
  if (day.attendance?.shift_code) {
    lines.push(`Ca: ${day.attendance.shift_code} (${day.attendance.start_time || "—"} – ${day.attendance.end_time || "—"})`);
  }
  if (day.leave) {
    lines.push(`Nghỉ: ${day.leave.leave_type || "Nghỉ phép"}${day.leave.reason ? ` • ${day.leave.reason}` : ""}`);
  }
  if (day.attendance?.note) lines.push(`Ghi chú: ${day.attendance.note}`);
  return lines.join("\n");
};

export function initLichSuChamCong() {
  const main = document.querySelector("main");
  if (!main) return;

  const doc = new DOMParser().parseFromString(historyHtml, "text/html");
  main.replaceChildren(doc.getElementById("historyWorkspace"));
  const root = document.getElementById("historyWorkspace");
  const el = (id) => root.querySelector(`#history${id}`);
  const state = {
    month: currentMonth(),
    data: null,
    loading: false,
    selected: null,
    request: 0,
  };

  const notice = (message, error = false) => {
    const node = el("Notice");
    node.textContent = message;
    node.className = message
      ? `rounded p-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`
      : "hidden";
  };

  const renderMonthButtons = () => {
    const [year] = state.month.split("-");
    el("MonthButtons").innerHTML = Array.from({ length: 12 }, (_, index) => {
      const value = `${year}-${String(index + 1).padStart(2, "0")}`;
      const active = value === state.month;
      return `<button type="button" data-month="${value}" class="rounded px-2.5 py-1 text-xs font-semibold ${active ? "bg-primary text-white" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"}">T${index + 1}</button>`;
    }).join("");
  };

  const renderMetrics = () => {
    const days = daysInMonth(state.month).map((date) => buildDay(date, state.data));
    const metrics = [
      ["Ngày có mặt", days.filter((day) => day.attendance?.check_in).length],
      ["Đi muộn / về sớm", days.filter((day) => day.status === "LATE").length],
      ["Thiếu giờ ra", days.filter((day) => day.status === "MISSING").length],
      ["Nghỉ phép", days.filter((day) => day.status === "LEAVE").length],
      ["Tổng công", number(days.reduce((sum, day) => sum + Number(day.attendance?.total_workday || 0), 0))],
      ["OT duyệt (giờ)", number(days.reduce((sum, day) => sum + Number(day.attendance?.approved_ot_hours || 0), 0))],
    ];
    el("Metrics").innerHTML = metrics
      .map(
        ([label, value]) =>
          `<div class="bg-white rounded-xl p-4 shadow-sm"><p class="text-xs text-on-surface-variant">${label}</p><p class="text-xl font-bold text-primary mt-1">${state.loading ? "—" : value}</p></div>`,
      )
      .join("");
  };

  const renderDetail = (day) => {
    const attendance = day?.attendance;
    const leave = day?.leave;
    if (!day) {
      el("Detail").innerHTML = `<p class="text-sm text-on-surface-variant">Chọn hoặc di chuột vào một ngày trên lịch để xem chi tiết.</p>`;
      return;
    }
    const fields = [
      ["Ngày", weekdayLabel(day.date)],
      ["Trạng thái", STATUS_LABELS[day.status]],
      ["Giờ vào", attendance?.check_in || "—"],
      ["Giờ ra", attendance?.check_out || "—"],
      ["Ca làm việc", attendance?.shift_code ? `${attendance.shift_code} (${attendance.start_time || "—"} – ${attendance.end_time || "—"})` : "—"],
      ["Muộn / về sớm", `${number(attendance?.late_minutes)} / ${number(attendance?.early_leave_minutes)} phút`],
      ["Giờ công", number(attendance?.actual_work_hours, " giờ")],
      ["Công tính lương", number(attendance?.total_workday)],
      ["OT duyệt", number(attendance?.approved_ot_hours, " giờ")],
      ["Nghỉ phép", leave ? `${leave.leave_type || "Nghỉ phép"}${leave.reason ? ` • ${leave.reason}` : ""}` : "—"],
      ["Ghi chú", attendance?.note || "—"],
    ];
    el("Detail").innerHTML = fields
      .map(
        ([label, value]) =>
          `<div class="py-2 border-b border-outline-variant/60 last:border-0"><p class="text-xs text-on-surface-variant">${label}</p><p class="text-sm font-semibold mt-0.5">${escapeHtml(value)}</p></div>`,
      )
      .join("");
  };

  const markSelected = () => {
    root.querySelectorAll("[data-day]").forEach((cell) => {
      cell.classList.toggle("ring-2", cell.dataset.day === state.selected);
      cell.classList.toggle("ring-primary", cell.dataset.day === state.selected);
    });
  };

  const selectDay = (date) => {
    const day = buildDay(date, state.data);
    state.selected = date;
    renderDetail(day);
    markSelected();
  };

  const renderCalendar = () => {
    const container = el("Calendar");
    const [year, monthNumber] = state.month.split("-").map(Number);
    const leading = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
    const blanks = leading === 0 ? 6 : leading - 1;
    const cells = [
      ...WEEKDAYS.map(
        (label) =>
          `<div class="text-center text-xs font-bold text-on-surface-variant py-1">${label}</div>`,
      ),
      ...Array.from({ length: blanks }, () => `<div></div>`),
      ...daysInMonth(state.month).map((date) => {
        const day = buildDay(date, state.data);
        const checkIn = day.attendance?.check_in || "";
        return `<button type="button" data-day="${date}" title="${escapeHtml(tooltipOf(day))}"
          class="min-h-[78px] rounded border p-2 text-left flex flex-col gap-1 transition hover:brightness-95 ${STATUS_STYLES[day.status]} ${date === state.selected ? "ring-2 ring-primary" : ""}">
          <span class="text-sm font-bold">${Number(date.slice(-2))}</span>
          <span class="text-[11px] font-semibold">${escapeHtml(checkIn || STATUS_LABELS[day.status])}</span>
          <span class="text-[10px] opacity-80">${escapeHtml(STATUS_LABELS[day.status])}</span>
        </button>`;
      }),
    ];
    container.innerHTML = cells.join("");
    el("CalendarTitle").textContent = `Tháng ${monthNumber}/${year}`;
  };

  const renderTable = () => {
    const columns = ["Ngày", "Thứ", "Giờ vào", "Giờ ra", "Ca", "Trạng thái", "Muộn / Sớm", "Công", "OT", "Ghi chú"];
    el("TableHead").innerHTML = `<tr>${columns.map((label) => `<th class="px-4 py-3 font-semibold">${label}</th>`).join("")}</tr>`;
    const days = daysInMonth(state.month).map((date) => buildDay(date, state.data));
    el("Count").textContent = `${days.length} ngày trong tháng`;
    el("TableBody").innerHTML = days
      .map((day) => {
        const attendance = day.attendance;
        return `<tr data-row-day="${day.date}" class="cursor-pointer hover:bg-surface-container-low/60">
          <td class="px-4 py-3 font-semibold">${day.date}</td>
          <td class="px-4 py-3">${escapeHtml(weekdayLabel(day.date).split(",")[0])}</td>
          <td class="px-4 py-3 font-semibold text-primary">${escapeHtml(attendance?.check_in || "—")}</td>
          <td class="px-4 py-3">${escapeHtml(attendance?.check_out || "—")}</td>
          <td class="px-4 py-3">${escapeHtml(attendance?.shift_code || "—")}</td>
          <td class="px-4 py-3"><span class="rounded px-2 py-1 text-xs font-semibold ${STATUS_STYLES[day.status]}">${escapeHtml(STATUS_LABELS[day.status])}</span></td>
          <td class="px-4 py-3">${number(attendance?.late_minutes)} / ${number(attendance?.early_leave_minutes)}</td>
          <td class="px-4 py-3">${number(attendance?.total_workday)}</td>
          <td class="px-4 py-3">${number(attendance?.approved_ot_hours)}</td>
          <td class="px-4 py-3">${escapeHtml(day.leave?.reason || attendance?.note || "—")}</td>
        </tr>`;
      })
      .join("");
  };

  const render = () => {
    const employee = state.data?.employee;
    el("Employee").textContent = employee
      ? `${employee.employee_code} • ${employee.full_name}${employee.department_name ? ` • ${employee.department_name}` : ""}`
      : "";
    el("Month").value = state.month;
    renderMonthButtons();
    renderMetrics();
    renderCalendar();
    renderTable();
    if (!state.selected || !state.selected.startsWith(state.month)) {
      const preferred = todayString();
      state.selected = daysInMonth(state.month).includes(preferred)
        ? preferred
        : daysInMonth(state.month).find((date) => buildDay(date, state.data).attendance?.check_in) ||
          daysInMonth(state.month)[0];
    }
    renderDetail(buildDay(state.selected, state.data));
    markSelected();
  };

  const load = async () => {
    const request = ++state.request;
    state.loading = true;
    notice("");
    render();
    try {
      const response = await api.get("/attendance/my-history", {
        params: { month: state.month },
      });
      if (request !== state.request) return;
      state.data = response.data?.data || null;
      state.loading = false;
      render();
    } catch (error) {
      if (request !== state.request) return;
      state.loading = false;
      notice(
        error.response?.data?.message ||
          "Không thể tải lịch sử chấm công. Vui lòng thử lại.",
        true,
      );
      render();
    }
  };

  const setMonth = (month) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month === state.month) return;
    state.month = month;
    state.selected = null;
    load();
  };

  el("Month").addEventListener("change", (event) => setMonth(event.target.value));
  el("Prev").addEventListener("click", () => setMonth(shiftMonth(state.month, -1)));
  el("Next").addEventListener("click", () => setMonth(shiftMonth(state.month, 1)));
  el("Refresh").addEventListener("click", load);
  el("MonthButtons").addEventListener("click", (event) => {
    const button = event.target.closest("[data-month]");
    if (button) setMonth(button.dataset.month);
  });
  el("Calendar").addEventListener("mouseover", (event) => {
    const cell = event.target.closest("[data-day]");
    if (cell && cell.dataset.day !== state.selected) selectDay(cell.dataset.day);
  });
  el("Calendar").addEventListener("focusin", (event) => {
    const cell = event.target.closest("[data-day]");
    if (cell) selectDay(cell.dataset.day);
  });
  el("Calendar").addEventListener("click", (event) => {
    const cell = event.target.closest("[data-day]");
    if (cell) selectDay(cell.dataset.day);
  });
  el("TableBody").addEventListener("click", (event) => {
    const row = event.target.closest("[data-row-day]");
    if (row) selectDay(row.dataset.rowDay);
  });

  load();
}
