import shiftHtml from "../pages/quan-ly-ca-lam.html?raw";
import api from "../services/api.js";
import { getCurrentUser, hasPermission } from "../services/auth.service.js";

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char],
  );

const time = (value) => (value ? String(value).slice(0, 5) : "-");
const timeInput = (value) => (value ? String(value).slice(0, 5) : "");

const apiErrorMessage = (error) => {
  if (error.response?.data?.message) return error.response.data.message;
  if (error.response?.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (error.response?.status === 403) return "Bạn không có quyền thực hiện thao tác này.";
  if (error.response?.status === 404) return "Máy chủ chưa có API quản lý ca làm. Vui lòng khởi động lại backend.";
  if (error.response?.status === 409) return "Dữ liệu bị trùng hoặc xung đột. Vui lòng kiểm tra lại.";
  if (error.response) return `Máy chủ không xử lý được yêu cầu (HTTP ${error.response.status}).`;
  return "Không thể kết nối máy chủ. Vui lòng kiểm tra backend đang chạy.";
};

export function initQuanLyCaLam(user = getCurrentUser()) {
  const main = document.querySelector("main");
  if (!main) return;
  const doc = new DOMParser().parseFromString(shiftHtml, "text/html");
  main.replaceChildren(doc.getElementById("shiftWorkspace"));
  const root = document.getElementById("shiftWorkspace");
  if (!root) return;
  const q = (sel) => root.querySelector(sel);
  const qa = (sel) => Array.from(root.querySelectorAll(sel));

  const canManage = hasPermission("ATT.SHIFT_OT_MANAGE", user);
  const state = {
    tab: "shifts",
    shifts: [],
    assignments: [],
    employees: [],
    departments: [],
    busy: false,
  };

  const setNotice = (message = "", type = "info") => {
    const box = q("#shiftNotice");
    if (!box) return;
    if (!message) {
      box.className = "hidden rounded p-3 text-sm";
      box.textContent = "";
      return;
    }
    const tone =
      type === "error"
        ? "bg-red-50 text-red-700 border border-red-200"
        : type === "success"
          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
          : "bg-sky-50 text-sky-800 border border-sky-200";
    box.className = `rounded p-3 text-sm ${tone}`;
    box.textContent = message;
  };

  const setBusy = (busy) => {
    state.busy = busy;
    qa("button, input, select").forEach((el) => {
      if (el.dataset.keepEnabled === "1") return;
      if (el.closest("#shiftForm") || el.closest("#assignForm") || el.id === "btnNewShift" || el.id === "btnNewAssign") {
        el.disabled = busy || !canManage;
      } else {
        el.disabled = busy;
      }
    });
  };

  const setTab = (tab) => {
    state.tab = tab;
    qa("[data-tab]").forEach((btn) => {
      const active = btn.dataset.tab === tab;
      btn.className = `rounded px-4 py-2 text-sm font-semibold ${active ? "bg-primary text-white" : "bg-surface-container-low text-on-surface hover:bg-surface-container"}`;
      btn.setAttribute("aria-selected", String(active));
    });
    qa("[data-panel]").forEach((panel) => {
      panel.classList.toggle("hidden", panel.dataset.panel !== tab);
    });
  };

  const renderShifts = () => {
    const tbody = q("#shiftTableBody");
    if (!tbody) return;
    if (!state.shifts.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-6 text-center text-on-surface-variant">Chưa có ca làm việc nào.</td></tr>`;
      return;
    }
    tbody.innerHTML = state.shifts
      .map((s) => {
        const grace = s.grace_period_minutes ?? s.grace_period ?? s.grace_minutes ?? 0;
        const active = Number(s.is_active);
        const isDefault = Number(s.is_default);
        const status = `<div class="flex flex-col gap-1 items-start">
          <span class="rounded px-2 py-1 text-xs font-semibold ${active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}">${active ? "Đang áp dụng" : "Ngừng áp dụng"}</span>
          ${isDefault ? '<span class="rounded px-2 py-1 text-xs font-semibold bg-sky-50 text-sky-800">Mặc định</span>' : ""}
        </div>`;
        const actions = canManage
          ? `<div class="flex justify-end gap-3 whitespace-nowrap">
              <button data-edit-shift="${s.id}" class="text-primary hover:underline font-medium">Sửa</button>
              <button data-del-shift="${s.id}" class="text-rose-700 hover:underline font-medium">Xóa</button>
            </div>`
          : `<span class="text-on-surface-variant">Chỉ xem</span>`;
        return `<tr class="hover:bg-surface-container-low/50 align-top">
          <td class="px-4 py-3">
            <div class="font-semibold text-on-surface">${escapeHtml(s.code)}</div>
            <div class="text-xs text-on-surface-variant mt-0.5">${escapeHtml(s.name)}</div>
          </td>
          <td class="px-4 py-3 whitespace-nowrap">
            <div class="font-medium">${time(s.start_time)} - ${time(s.end_time)}</div>
            <div class="text-xs text-on-surface-variant mt-0.5">Nghỉ: ${time(s.break_start)} - ${time(s.break_end)}</div>
          </td>
          <td class="px-4 py-3 text-xs sm:text-sm">
            <div>Vào: <span class="font-medium">${time(s.checkin_start)}</span> → <span class="font-medium">${time(s.checkin_end)}</span></div>
            <div class="mt-0.5">Ra: <span class="font-medium">${time(s.checkout_start)}</span> → <span class="font-medium">${time(s.checkout_end)}</span></div>
          </td>
          <td class="px-4 py-3 text-xs sm:text-sm">
            <div>Ân hạn: <span class="font-medium">${escapeHtml(grace)} phút</span></div>
            <div class="text-on-surface-variant mt-0.5">Mốc đúng giờ: ${time(s.allowed_limit_time || s.start_time)} (sau mốc này tính đi muộn)</div>
          </td>
          <td class="px-4 py-3 text-xs sm:text-sm">
            <div>OT tối thiểu: <span class="font-medium">${escapeHtml(s.min_ot_minutes ?? 0)} phút</span></div>
            <div class="text-on-surface-variant mt-0.5">${escapeHtml(s.standard_hours ?? 8)} giờ/ngày • ${escapeHtml(s.workday_value ?? s.standard_work_units ?? 1)} công</div>
          </td>
          <td class="px-4 py-3">${status}</td>
          <td class="px-4 py-3 text-right">${actions}</td>
        </tr>`;
      })
      .join("");
  };

  const fillShiftForm = (shift = null) => {
    q("#shiftId").value = shift?.id || "";
    q("#shiftCode").value = shift?.code || "";
    q("#shiftName").value = shift?.name || "";
    q("#shiftStart").value = timeInput(shift?.start_time) || "08:00";
    q("#shiftEnd").value = timeInput(shift?.end_time) || "17:30";
    q("#shiftCheckinStart").value = timeInput(shift?.checkin_start) || "";
    q("#shiftCheckinEnd").value = timeInput(shift?.checkin_end) || "";
    q("#shiftCheckoutStart").value = timeInput(shift?.checkout_start) || "";
    q("#shiftCheckoutEnd").value = timeInput(shift?.checkout_end) || "";
    q("#shiftBreakStart").value = timeInput(shift?.break_start) || "12:00";
    q("#shiftBreakEnd").value = timeInput(shift?.break_end) || "13:30";
    q("#shiftGrace").value = shift?.grace_period_minutes ?? shift?.grace_period ?? shift?.grace_minutes ?? 15;
    q("#shiftMinOt").value = shift?.min_ot_minutes ?? 30;
    q("#shiftStandardHours").value = shift?.standard_hours ?? 8;
    q("#shiftWorkdayValue").value = String(shift?.workday_value ?? shift?.standard_work_units ?? 1);
    q("#shiftIsDefault").checked = Boolean(Number(shift?.is_default));
    q("#shiftIsActive").checked = shift ? Boolean(Number(shift?.is_active)) : true;
    q("#shiftFormTitle").textContent = shift ? `Sửa ca: ${shift.code}` : "Thêm ca làm việc";
  };

  const openShiftForm = (shift = null) => {
    if (!canManage) return;
    fillShiftForm(shift);
    q("#shiftFormWrap")?.classList.remove("hidden");
    q("#shiftFormWrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const closeShiftForm = () => {
    q("#shiftFormWrap")?.classList.add("hidden");
    fillShiftForm(null);
  };

  const renderAssignments = () => {
    const tbody = q("#assignTableBody");
    if (!tbody) return;
    if (!state.assignments.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-6 text-center text-on-surface-variant">Chưa có phân ca nào.</td></tr>`;
      return;
    }
    tbody.innerHTML = state.assignments
      .map((a) => {
        const actions = canManage
          ? `<button data-edit-assign="${a.id}" class="text-primary hover:underline mr-3">Sửa</button><button data-del-assign="${a.id}" class="text-error hover:underline">Xóa</button>`
          : `<span class="text-on-surface-variant">Chỉ xem</span>`;
        return `<tr class="hover:bg-surface-container-low/50">
          <td class="px-4 py-3 font-semibold">${escapeHtml(a.employee_code || "")}</td>
          <td class="px-4 py-3">${escapeHtml(a.full_name || "")}</td>
          <td class="px-4 py-3">${escapeHtml(a.department_name || "-")}</td>
          <td class="px-4 py-3">${escapeHtml(a.shift_code || "")} - ${escapeHtml(a.shift_name || "")}</td>
          <td class="px-4 py-3">${time(a.start_time)} - ${time(a.end_time)}</td>
          <td class="px-4 py-3">${escapeHtml(a.effective_from || "-")}</td>
          <td class="px-4 py-3">${escapeHtml(a.effective_to || "Không giới hạn")}</td>
          <td class="px-4 py-3 text-right">${actions}</td>
        </tr>`;
      })
      .join("");
  };

  const renderSelectOptions = () => {
    const empEl = q("#assignEmployee");
    const shiftEl = q("#assignShift");
    if (empEl) {
      empEl.innerHTML = ['<option value="">-- Chọn nhân viên --</option>'].concat(
        state.employees.map((e) => `<option value="${e.id}">${escapeHtml(e.employee_code || "")} - ${escapeHtml(e.full_name || "")}${e.department_name ? ` (${escapeHtml(e.department_name)})` : ""}</option>`),
      ).join("");
    }
    if (shiftEl) {
      const active = state.shifts.filter((s) => Number(s.is_active));
      shiftEl.innerHTML = (active.length ? ['<option value="">-- Chọn ca --</option>'] : ['<option value="">-- Chưa có ca hoạt động --</option>']).concat(
        active.map((s) => `<option value="${s.id}">${escapeHtml(s.code)} - ${escapeHtml(s.name)} (${time(s.start_time)}-${time(s.end_time)})</option>`),
      ).join("");
    }
    const filterEmp = q("#assignFilterEmployee");
    if (filterEmp) {
      const prev = filterEmp.value;
      filterEmp.innerHTML = '<option value="">Tất cả nhân viên</option>' + state.employees.map((e) => `<option value="${e.id}">${escapeHtml(e.employee_code || "")} - ${escapeHtml(e.full_name || "")}</option>`).join("");
      if (prev) filterEmp.value = prev;
    }
    const filterShift = q("#assignFilterShift");
    if (filterShift) {
      const prev = filterShift.value;
      filterShift.innerHTML = '<option value="">Tất cả ca</option>' + state.shifts.map((s) => `<option value="${s.id}">${escapeHtml(s.code)} - ${escapeHtml(s.name)}</option>`).join("");
      if (prev) filterShift.value = prev;
    }
    const filterDept = q("#assignFilterDept");
    if (filterDept) {
      const prev = filterDept.value;
      const deptMap = new Map();
      state.departments.forEach((d) => deptMap.set(String(d.id), d.department_name || d.name || d.department_code || `PB ${d.id}`));
      state.employees.forEach((e) => { if (e.department_id && !deptMap.has(String(e.department_id))) deptMap.set(String(e.department_id), e.department_name || `PB ${e.department_id}`); });
      filterDept.innerHTML = '<option value="">Tất cả phòng ban</option>' + [...deptMap.entries()].map(([id, name]) => `<option value="${id}">${escapeHtml(name)}</option>`).join("");
      if (prev) filterDept.value = prev;
    }
  };

  const openAssignForm = (assign = null) => {
    if (!canManage) return;
    q("#assignId").value = assign?.id || "";
    q("#assignEmployee").value = assign?.employee_id || "";
    q("#assignShift").value = assign?.shift_id || "";
    q("#assignFrom").value = assign?.effective_from || new Date().toISOString().slice(0, 10);
    q("#assignTo").value = assign?.effective_to || "";
    q("#assignFormTitle").textContent = assign ? "Sửa phân ca" : "Phân ca nhân viên";
    q("#assignFormWrap")?.classList.remove("hidden");
    q("#assignFormWrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const closeAssignForm = () => {
    q("#assignFormWrap")?.classList.add("hidden");
    if (q("#assignId")) q("#assignId").value = "";
    q("#assignForm")?.reset();
  };

  const loadShifts = async () => {
    const res = await api.get("/attendance/shifts");
    state.shifts = Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : [];
  };

  const loadAssignments = async () => {
    const params = {};
    const emp = q("#assignFilterEmployee")?.value;
    const sh = q("#assignFilterShift")?.value;
    const dept = q("#assignFilterDept")?.value;
    if (emp) params.employee_id = emp;
    if (sh) params.shift_id = sh;
    if (dept) params.department_id = dept;
    const res = await api.get("/attendance/shift-assignments", { params });
    state.assignments = Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : [];
  };

  const loadLookups = async () => {
    try {
      const res = await api.get("/employees");
      const data = res.data?.data ?? res.data;
      state.employees = Array.isArray(data) ? data : Array.isArray(data?.employees) ? data.employees : [];
      if (Array.isArray(data?.filters?.departments)) state.departments = data.filters.departments;
    } catch (e) {
      state.employees = [];
      if (e.response?.status === 403) setNotice("Không có quyền xem danh sách nhân viên (HR.PROFILE_VIEW). Vẫn có thể xem/sửa ca làm việc.", "info");
      else throw e;
    }
    try {
      if (!state.departments.length) {
        const res = await api.get("/departments");
        state.departments = Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : [];
      }
    } catch {
      /* ignore */
    }
  };

  const refreshAll = async ({ showSuccess = false } = {}) => {
    if (state.busy) return;
    try {
      setBusy(true);
      setNotice("");
      await Promise.all([loadShifts(), loadLookups()]);
      await loadAssignments();
      renderShifts();
      renderSelectOptions();
      renderAssignments();
      if (showSuccess) setNotice("Đã tải dữ liệu quản lý ca làm.", "success");
    } catch (e) {
      setNotice(apiErrorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  q("#shiftTabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (btn) setTab(btn.dataset.tab);
  });
  q("#btnNewShift")?.addEventListener("click", () => openShiftForm(null));
  q("#btnCancelShift")?.addEventListener("click", closeShiftForm);
  q("#btnResetShift")?.addEventListener("click", () => {
    const id = q("#shiftId").value;
    const shift = state.shifts.find((item) => String(item.id) === String(id));
    fillShiftForm(shift || null);
  });
  q("#shiftTableBody")?.addEventListener("click", async (e) => {
    const editBtn = e.target.closest("[data-edit-shift]");
    const delBtn = e.target.closest("[data-del-shift]");
    if (!canManage) return;

    if (editBtn) {
      const shift = state.shifts.find((s) => String(s.id) === String(editBtn.dataset.editShift));
      if (shift) openShiftForm(shift);
      return;
    }

    if (delBtn) {
      const shift = state.shifts.find((s) => String(s.id) === String(delBtn.dataset.delShift));
      const label = shift ? `${shift.code} - ${shift.name}` : `#${delBtn.dataset.delShift}`;
      if (!window.confirm(`Xóa ca làm việc "${label}"?\n\nNếu ca đã được phân công hoặc đã phát sinh dữ liệu chấm công, hệ thống sẽ từ chối xóa (hãy chuyển sang "Ngừng áp dụng").`)) return;
      try {
        setBusy(true);
        await api.delete(`/attendance/shifts/${delBtn.dataset.delShift}`);
        setNotice("Đã xóa ca làm việc.", "success");
        await loadShifts();
        renderShifts();
        renderAssignments();
        if (String(q("#shiftId")?.value || "") === String(delBtn.dataset.delShift)) closeShiftForm();
      } catch (err) {
        setNotice(apiErrorMessage(err), "error");
      } finally {
        setBusy(false);
      }
    }
  });
  q("#shiftForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!canManage || state.busy) return;
    const id = q("#shiftId").value;
    const payload = {
      code: q("#shiftCode").value.trim().toUpperCase(),
      name: q("#shiftName").value.trim(),
      start_time: q("#shiftStart").value,
      end_time: q("#shiftEnd").value,
      checkin_start: q("#shiftCheckinStart").value || null,
      checkin_end: q("#shiftCheckinEnd").value || null,
      checkout_start: q("#shiftCheckoutStart").value || null,
      checkout_end: q("#shiftCheckoutEnd").value || null,
      break_start: q("#shiftBreakStart").value || null,
      break_end: q("#shiftBreakEnd").value || null,
      grace_period: Number(q("#shiftGrace").value || 0),
      grace_period_minutes: Number(q("#shiftGrace").value || 0),
      min_ot_minutes: Number(q("#shiftMinOt").value || 0),
      standard_hours: Number(q("#shiftStandardHours").value || 8),
      workday_value: Number(q("#shiftWorkdayValue").value || 1),
      is_default: q("#shiftIsDefault").checked ? 1 : 0,
      is_active: q("#shiftIsActive").checked ? 1 : 0,
    };
    try {
      setBusy(true);
      if (id) await api.put(`/attendance/shifts/${id}`, payload);
      else await api.post("/attendance/shifts", payload);
      setNotice(id ? "Đã cập nhật ca làm việc." : "Đã tạo ca làm việc.", "success");
      closeShiftForm();
      await loadShifts();
      renderShifts();
      renderSelectOptions();
    } catch (err) {
      setNotice(apiErrorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  });

  q("#btnNewAssign")?.addEventListener("click", () => openAssignForm(null));
  q("#btnCancelAssign")?.addEventListener("click", closeAssignForm);
  q("#btnResetAssign")?.addEventListener("click", () => {
    const id = q("#assignId").value;
    const assignment = state.assignments.find((item) => String(item.id) === String(id));
    if (assignment) openAssignForm(assignment);
    else q("#assignForm")?.reset();
  });
  q("#btnRefreshAssign")?.addEventListener("click", () => refreshAll({ showSuccess: true }));
  q("[data-action='refresh']")?.addEventListener("click", () => refreshAll({ showSuccess: true }));
  ["#assignFilterEmployee", "#assignFilterShift", "#assignFilterDept"].forEach((sel) => {
    q(sel)?.addEventListener("change", async () => {
      try { setBusy(true); await loadAssignments(); renderAssignments(); } catch (e) { setNotice(apiErrorMessage(e), "error"); } finally { setBusy(false); }
    });
  });

  q("#assignTableBody")?.addEventListener("click", async (e) => {
    const editBtn = e.target.closest("[data-edit-assign]");
    const delBtn = e.target.closest("[data-del-assign]");
    if (editBtn) {
      const a = state.assignments.find((x) => String(x.id) === String(editBtn.dataset.editAssign));
      if (a) openAssignForm(a);
      return;
    }
    if (delBtn && canManage) {
      if (!window.confirm("Xóa phân ca này?")) return;
      try {
        setBusy(true);
        await api.delete(`/attendance/shift-assignments/${delBtn.dataset.delAssign}`);
        setNotice("Đã xóa phân ca.", "success");
        await loadAssignments();
        renderAssignments();
      } catch (err) {
        setNotice(apiErrorMessage(err), "error");
      } finally {
        setBusy(false);
      }
    }
  });

  q("#assignForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!canManage || state.busy) return;
    const id = q("#assignId").value;
    const payload = {
      employee_id: Number(q("#assignEmployee").value),
      shift_id: Number(q("#assignShift").value),
      effective_from: q("#assignFrom").value,
      effective_to: q("#assignTo").value || null,
    };
    try {
      setBusy(true);
      if (id) await api.put(`/attendance/shift-assignments/${id}`, payload);
      else await api.post("/attendance/shift-assignments", payload);
      setNotice(id ? "Đã cập nhật phân ca." : "Đã phân ca cho nhân viên.", "success");
      closeAssignForm();
      await loadAssignments();
      renderAssignments();
    } catch (err) {
      setNotice(apiErrorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  });

  if (q("#shiftScope")) {
    q("#shiftScope").textContent = canManage
      ? "Bạn có quyền tạo/sửa ca làm việc và phân ca."
      : "Chế độ chỉ xem: tra cứu danh mục ca và phân ca được phép.";
  }
  if (!canManage) {
    q("#btnNewShift")?.classList.add("hidden");
    q("#btnNewAssign")?.classList.add("hidden");
  }

  setTab("shifts");
  fillShiftForm(null);
  refreshAll();
}
