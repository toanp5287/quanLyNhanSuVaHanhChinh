import shiftHtml from "../pages/quan-ly-ca-lam.html?raw";
import api from "../services/api.js";
import { getCurrentUser, hasPermission } from "../services/auth.service.js";

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char],
  );

const isBlankTimeValue = (value) => {
  const text = String(value ?? "").trim();
  return !text || /^[-–—:.\s]*(AM|PM|SA|CH|NG)?$/i.test(text);
};
const time = (value) => (isBlankTimeValue(value) ? "-" : String(value).slice(0, 5));
const timeInput = (value) => (isBlankTimeValue(value) ? "" : String(value).slice(0, 5));
const formTime = (value) => (isBlankTimeValue(value) ? null : String(value).trim());
const checkinEndLabel = (shift) =>
  isBlankTimeValue(shift?.checkin_end) ? "Không giới hạn" : time(shift.checkin_end);
const workdayValue = (shift) => {
  const value = Number(shift?.workday_value ?? shift?.standard_work_units ?? 1);
  return value === 0.5 ? 0.5 : 1;
};

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
    policies: [],
    kioskConfig: null,
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
      if (el.closest("#shiftForm") || el.closest("#assignForm") || el.closest("#policyForm") || el.closest("#kioskConfigForm") || ["btnNewShift", "btnNewAssign", "btnNewPolicy"].includes(el.id)) {
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
        const standardHours = Number(s.standard_hours ?? 8) || 8;
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
            <div>Vào: <span class="font-medium">${time(s.checkin_start)}</span> → <span class="font-medium">${checkinEndLabel(s)}</span></div>
            <div class="mt-0.5">Ra: <span class="font-medium">${time(s.checkout_start)}</span> → <span class="font-medium">${time(s.checkout_end)}</span></div>
          </td>
          <td class="px-4 py-3 text-xs sm:text-sm">
            <div>Ân hạn: <span class="font-medium">${escapeHtml(grace)} phút</span></div>
            <div class="text-on-surface-variant mt-0.5">Mốc đúng giờ: ${time(s.allowed_limit_time || s.start_time)} (sau mốc này tính đi muộn)</div>
          </td>
          <td class="px-4 py-3 text-xs sm:text-sm">
            <div>OT tối thiểu: <span class="font-medium">${escapeHtml(s.min_ot_minutes ?? 0)} phút</span></div>
            <div class="text-on-surface-variant mt-0.5">${standardHours} giờ/ngày • ${workdayValue(s)} công${active ? "" : " (ca ngừng áp dụng)"}</div>
          </td>
          <td class="px-4 py-3">${status}</td>
          <td class="px-4 py-3 text-right">${actions}</td>
        </tr>`;
      })
      .join("");
  };

  const renderPolicyOptions = () => {
    const select = q("#shiftPolicy");
    if (!select) return;
    const previous = select.value;
    select.innerHTML =
      '<option value="">Quy chế mặc định</option>' +
      state.policies
        .map((policy) => `<option value="${policy.id}">${escapeHtml(policy.code)} - ${escapeHtml(policy.name)}</option>`)
        .join("");
    select.value = previous;
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
    q("#shiftWorkdayValue").value = String(workdayValue(shift));
    q("#shiftHasBreak").checked = shift ? Boolean(Number(shift?.has_break ?? 1)) : true;
    q("#shiftRequireBreakPunch").checked = Boolean(Number(shift?.require_break_punch));
    q("#shiftIsOvernight").checked = Boolean(Number(shift?.is_overnight));
    q("#shiftAllowCheckoutAnytime").checked = shift
      ? Boolean(Number(shift?.allow_checkout_anytime ?? 1))
      : true;
    q("#shiftCheckinOpenBefore").value = shift?.checkin_open_before_min ?? 120;
    q("#shiftWorkingDays").value = shift?.working_days
      ? typeof shift.working_days === "string"
        ? shift.working_days
        : JSON.stringify(shift.working_days)
      : "";
    renderPolicyOptions();
    q("#shiftPolicy").value = shift?.policy_id || "";
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
    const shiftSelect = q("#assignShift");
    const assignedShift = assign
      ? state.shifts.find((s) => String(s.id) === String(assign.shift_id))
      : null;
    if (shiftSelect && assignedShift && !Number(assignedShift.is_active)) {
      const option = document.createElement("option");
      option.value = String(assignedShift.id);
      option.textContent = `${assignedShift.code} - ${assignedShift.name} (ngừng áp dụng)`;
      option.dataset.inactive = "1";
      if (!Array.from(shiftSelect.options).some((item) => item.value === option.value)) {
        shiftSelect.appendChild(option);
      }
    }
    shiftSelect.value = assign?.shift_id || "";
    q("#assignFrom").value = assign?.effective_from || new Date().toISOString().slice(0, 10);
    q("#assignTo").value = assign?.effective_to || "";
    q("#assignFormTitle").textContent = assign ? "Sửa phân ca" : "Phân ca nhân viên";
    q("#assignFormWrap")?.classList.remove("hidden");
    q("#assignFormWrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const closeAssignForm = () => {
    q("#assignFormWrap")?.classList.add("hidden");
    if (q("#assignId")) q("#assignId").value = "";
    qa("#assignShift option[data-inactive='1']").forEach((option) => option.remove());
    q("#assignForm")?.reset();
  };

  const loadShifts = async () => {
    const res = await api.get("/attendance/shifts");
    state.shifts = Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : [];
  };

  const loadPolicies = async () => {
    try {
      const res = await api.get("/attendance/policies");
      state.policies = Array.isArray(res.data?.data) ? res.data.data : [];
    } catch (e) {
      if (e.response?.status !== 403) throw e;
      state.policies = [];
    }
  };

  const loadKioskConfig = async () => {
    try {
      const res = await api.get("/attendance/kiosk-config");
      state.kioskConfig = res.data?.data || null;
    } catch (e) {
      if (e.response?.status !== 403) throw e;
      state.kioskConfig = null;
    }
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

  const renderPolicies = () => {
    const tbody = q("#policyTableBody");
    if (!tbody) return;
    if (!state.policies.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-6 text-center text-on-surface-variant">Chưa có quy chế tính công.</td></tr>`;
      return;
    }
    tbody.innerHTML = state.policies
      .map((policy) => {
        const rules = policy.rules || policy.rules_json || {};
        const mode = rules.work_day_mode === "CUSTOM_TIERS" ? "CUSTOM_TIERS" : "PRO_RATA";
        const summary = `${mode === "PRO_RATA" ? `Bước ${rules.pro_rata?.round_step ?? 0.25} công` : `${(rules.tiers || []).length} bậc công`}${rules.late_penalty?.enabled ? ` • Phạt muộn: ${(rules.late_penalty.tiers || []).length} bậc` : " • Không phạt muộn"}`;
        const actions = canManage
          ? `<button data-edit-policy="${policy.id}" class="text-primary hover:underline mr-3">Sửa</button><button data-del-policy="${policy.id}" class="text-error hover:underline">Xóa</button>`
          : `<span class="text-on-surface-variant">Chỉ xem</span>`;
        return `<tr><td class="px-4 py-3"><div class="font-semibold">${escapeHtml(policy.code)}</div><div class="text-xs text-on-surface-variant">${escapeHtml(policy.name)}</div></td><td class="px-4 py-3">${mode}${Number(policy.is_default) ? ' <span class="rounded bg-sky-50 px-2 py-1 text-xs text-sky-800">Mặc định</span>' : ""}</td><td class="px-4 py-3 text-xs">${escapeHtml(summary)}</td><td class="px-4 py-3 text-right">${actions}</td></tr>`;
      })
      .join("");
  };

  const DEFAULT_PENALTY_TIERS = [
    { from_minute: 16, to_minute: 30, amount: 100000, max_workday: null, label: "Muộn 16–30 phút" },
    { from_minute: 31, to_minute: 60, amount: 200000, max_workday: 0.75, label: "Muộn 31–60 phút" },
    { from_minute: 61, to_minute: null, amount: 300000, max_workday: 0.5, label: "Muộn trên 60 phút" },
  ];

  const penaltyTierRow = (tier = {}) => `
    <tr data-penalty-tier>
      <td class="px-2 py-2"><input data-field="from" type="number" min="0" step="1" value="${escapeHtml(tier.from_minute ?? 0)}" class="w-20 rounded border px-2 py-1" /></td>
      <td class="px-2 py-2"><input data-field="to" type="number" min="0" step="1" placeholder="Trở lên" value="${escapeHtml(tier.to_minute ?? "")}" class="w-28 rounded border px-2 py-1" /></td>
      <td class="px-2 py-2"><input data-field="amount" type="number" min="0" step="1000" value="${escapeHtml(tier.amount ?? 0)}" class="w-32 rounded border px-2 py-1" /></td>
      <td class="px-2 py-2"><input data-field="max" type="number" min="0" max="1" step="0.05" placeholder="Không giới hạn" value="${escapeHtml(tier.max_workday ?? "")}" class="w-28 rounded border px-2 py-1" /></td>
      <td class="px-2 py-2"><input data-field="label" maxlength="255" value="${escapeHtml(tier.label || "")}" class="w-40 rounded border px-2 py-1" /></td>
      <td class="px-2 py-2"><button type="button" data-remove-penalty class="text-error hover:underline">Xóa</button></td>
    </tr>`;

  const renderPenaltyTiers = (tiers = []) => {
    const body = q("#penaltyTiersBody");
    if (!body) return;
    body.innerHTML = (tiers.length ? tiers : DEFAULT_PENALTY_TIERS).map(penaltyTierRow).join("");
  };

  const readPenaltyTiers = () =>
    qa("[data-penalty-tier]").map((row) => {
      const field = (name) => row.querySelector(`[data-field="${name}"]`)?.value ?? "";
      const to = String(field("to")).trim();
      const max = String(field("max")).trim();
      return {
        from_minute: Math.max(0, Number(field("from")) || 0),
        to_minute: to === "" ? null : Math.max(0, Number(to) || 0),
        amount: Math.max(0, Number(field("amount")) || 0),
        max_workday: max === "" ? null : Math.max(0, Math.min(1, Number(max) || 0)),
        label: String(field("label")).trim(),
      };
    });

  const validatePenaltyTiers = (tiers) => {
    for (let index = 0; index < tiers.length; index += 1) {
      const tier = tiers[index];
      if (tier.to_minute !== null && tier.to_minute <= tier.from_minute)
        return `Bậc phạt thứ ${index + 1}: phút kết thúc phải lớn hơn phút bắt đầu.`;
      if (index > 0) {
        const previous = tiers[index - 1];
        if (previous.to_minute === null || tier.from_minute <= previous.to_minute)
          return "Các bậc phạt đi muộn bị chồng lấn khoảng phút.";
      }
    }
    return null;
  };

  const buildPolicyRules = () => ({
    work_day_mode: q("#policyMode").value,
    pro_rata: {
      round_step: Number(q("#policyRoundStep").value || 0.25),
      round_method: q("#policyRoundMethod").value,
    },
    tiers: (() => {
      try {
        const parsed = JSON.parse(q("#policyTiers").value || "[]");
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })(),
    grace_late_minutes: Number(q("#policyGrace").value || 0),
    late_penalty: {
      enabled: q("#policyPenaltyEnabled").checked,
      tiers: readPenaltyTiers(),
    },
  });

  let previewTimer = null;
  const previewPenalty = () => {
    const resultEl = q("#penaltyTestResult");
    if (!resultEl) return;
    const minutes = Number(q("#penaltyTestMinutes")?.value ?? 0);
    if (!q("#policyPenaltyEnabled")?.checked) {
      resultEl.textContent = "Quy chế phạt đang tắt.";
      resultEl.className = "text-sm font-semibold text-on-surface-variant";
      return;
    }
    const validation = validatePenaltyTiers(readPenaltyTiers());
    if (validation) {
      resultEl.textContent = validation;
      resultEl.className = "text-sm font-semibold text-error";
      return;
    }
    clearTimeout(previewTimer);
    previewTimer = setTimeout(async () => {
      try {
        const res = await api.post("/attendance/policies/preview-penalty", {
          rules: buildPolicyRules(),
          minutes,
        });
        const data = res.data?.data || {};
        resultEl.textContent = data.note
          ? `${data.amount ? `${Number(data.amount).toLocaleString("vi-VN")}đ • ` : ""}${data.note}`
          : "Không có bậc phạt phù hợp.";
        resultEl.className = `text-sm font-semibold ${data.matched ? "text-primary" : "text-on-surface-variant"}`;
      } catch (err) {
        resultEl.textContent = apiErrorMessage(err);
        resultEl.className = "text-sm font-semibold text-error";
      }
    }, 250);
  };

  const fillPolicyForm = (policy = null) => {
    const rules = policy?.rules || policy?.rules_json || {};
    q("#policyId").value = policy?.id || "";
    q("#policyCode").value = policy?.code || "";
    q("#policyName").value = policy?.name || "";
    q("#policyMode").value = rules.work_day_mode === "CUSTOM_TIERS" ? "CUSTOM_TIERS" : "PRO_RATA";
    q("#policyRoundStep").value = rules.pro_rata?.round_step ?? 0.25;
    q("#policyRoundMethod").value = rules.pro_rata?.round_method || "ROUND";
    q("#policyGrace").value = rules.grace_late_minutes ?? 5;
    q("#policyTiers").value = JSON.stringify(
      rules.tiers || [{ min_hours: 7.5, work_day: 1, label: "Đủ công" }],
      null,
      2,
    );
    q("#policyPenaltyEnabled").checked = Boolean(rules.late_penalty?.enabled);
    renderPenaltyTiers(rules.late_penalty?.tiers || []);
    q("#penaltyTestResult").textContent = "Nhập số phút đi muộn để xem kết quả.";
    q("#policyIsDefault").checked = Boolean(Number(policy?.is_default));
    q("#policyFormTitle").textContent = policy ? `Sửa quy chế: ${policy.code}` : "Thêm quy chế";
  };

  const fillKioskConfigForm = () => {
    const config = state.kioskConfig || {};
    q("#kioskPunchMode").value = config.punch_mode || "AUTO_SMART";
    q("#kioskAntiDouble").value = config.anti_double_punch_minutes ?? 3;
    q("#kioskConfirmSeconds").value = config.checkout_confirm_seconds ?? 2;
    q("#kioskRepeatPolicy").value = config.checkout_repeat_policy || "OVERWRITE_LATEST";
    q("#kioskRequireCheckin").checked = Boolean(Number(config.require_checkin_for_checkout ?? 1));
    q("#kioskShowWorkday").checked = Boolean(Number(config.show_estimated_workday ?? 1));
    q("#kioskNetworkConfig").value = JSON.stringify(config.network_config || {
      strict_ip: false,
      allowed_ips: [],
      exempt_department_ids: [],
      exempt_employee_ids: [],
    }, null, 2);
  };

  const refreshAll = async ({ showSuccess = false } = {}) => {
    if (state.busy) return;
    try {
      setBusy(true);
      setNotice("");
      await Promise.all([loadShifts(), loadLookups(), loadPolicies(), loadKioskConfig()]);
      await loadAssignments();
      renderShifts();
      renderSelectOptions();
      renderAssignments();
      renderPolicyOptions();
      renderPolicies();
      fillKioskConfigForm();
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
      checkin_start: formTime(q("#shiftCheckinStart").value),
      checkin_end: formTime(q("#shiftCheckinEnd").value),
      checkout_start: formTime(q("#shiftCheckoutStart").value),
      checkout_end: formTime(q("#shiftCheckoutEnd").value),
      break_start: formTime(q("#shiftBreakStart").value),
      break_end: formTime(q("#shiftBreakEnd").value),
      grace_period: Number(q("#shiftGrace").value || 0),
      grace_period_minutes: Number(q("#shiftGrace").value || 0),
      min_ot_minutes: Number(q("#shiftMinOt").value || 0),
      standard_hours: Number(q("#shiftStandardHours").value || 8),
      standard_work_hours: Number(q("#shiftStandardHours").value || 8),
      workday_value: Number(q("#shiftWorkdayValue").value || 1),
      has_break: q("#shiftHasBreak").checked ? 1 : 0,
      require_break_punch: q("#shiftRequireBreakPunch").checked ? 1 : 0,
      is_overnight: q("#shiftIsOvernight").checked ? 1 : 0,
      allow_checkout_anytime: q("#shiftAllowCheckoutAnytime").checked ? 1 : 0,
      checkin_open_before_min: Number(q("#shiftCheckinOpenBefore").value || 0),
      checkin_close_after_min: null,
      working_days: q("#shiftWorkingDays").value.trim() || null,
      policy_id: q("#shiftPolicy").value || null,
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

  q("#btnNewPolicy")?.addEventListener("click", () => {
    if (!canManage) return;
    fillPolicyForm(null);
    q("#policyFormWrap")?.classList.remove("hidden");
  });
  q("#btnCancelPolicy")?.addEventListener("click", () => q("#policyFormWrap")?.classList.add("hidden"));
  q("#btnCancelPolicyEdit")?.addEventListener("click", () => q("#policyFormWrap")?.classList.add("hidden"));
  q("#btnAddPenaltyTier")?.addEventListener("click", () => {
    q("#penaltyTiersBody")?.insertAdjacentHTML("beforeend", penaltyTierRow({ from_minute: "", to_minute: "", amount: 0, max_workday: null, label: "" }));
    previewPenalty();
  });
  q("#penaltyTiersBody")?.addEventListener("click", (e) => {
    if (!e.target.closest("[data-remove-penalty]")) return;
    e.target.closest("[data-penalty-tier]")?.remove();
    previewPenalty();
  });
  q("#penaltyTiersBody")?.addEventListener("input", previewPenalty);
  q("#policyPenaltyEnabled")?.addEventListener("change", previewPenalty);
  q("#penaltyTestMinutes")?.addEventListener("input", previewPenalty);
  q("#policyTableBody")?.addEventListener("click", async (e) => {
    if (!canManage) return;
    const edit = e.target.closest("[data-edit-policy]");
    const del = e.target.closest("[data-del-policy]");
    if (edit) {
      const policy = state.policies.find((p) => String(p.id) === String(edit.dataset.editPolicy));
      if (policy) {
        fillPolicyForm(policy);
        q("#policyFormWrap")?.classList.remove("hidden");
      }
      return;
    }
    if (del) {
      const policy = state.policies.find((p) => String(p.id) === String(del.dataset.delPolicy));
      if (!window.confirm(`Xóa quy chế "${policy?.code || del.dataset.delPolicy}"?`)) return;
      try {
        setBusy(true);
        await api.delete(`/attendance/policies/${del.dataset.delPolicy}`);
        setNotice("Đã xóa quy chế tính công.", "success");
        await loadPolicies();
        renderPolicies();
        renderPolicyOptions();
      } catch (err) {
        setNotice(apiErrorMessage(err), "error");
      } finally {
        setBusy(false);
      }
    }
  });
  q("#policyForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!canManage || state.busy) return;
    let tiers;
    try {
      tiers = JSON.parse(q("#policyTiers").value || "[]");
      if (!Array.isArray(tiers)) throw new Error("invalid");
    } catch {
      setNotice("Các bậc công phải là JSON mảng hợp lệ.", "error");
      return;
    }
    const rules = buildPolicyRules();
    const penaltyError = validatePenaltyTiers(rules.late_penalty.tiers);
    if (penaltyError) {
      setNotice(penaltyError, "error");
      return;
    }
    const payload = {
      code: q("#policyCode").value.trim().toUpperCase(),
      name: q("#policyName").value.trim(),
      is_default: q("#policyIsDefault").checked ? 1 : 0,
      rules,
    };
    const id = q("#policyId").value;
    try {
      setBusy(true);
      if (id) await api.put(`/attendance/policies/${id}`, payload);
      else await api.post("/attendance/policies", payload);
      setNotice(id ? "Đã cập nhật quy chế." : "Đã tạo quy chế.", "success");
      q("#policyFormWrap")?.classList.add("hidden");
      await loadPolicies();
      renderPolicies();
      renderPolicyOptions();
    } catch (err) {
      setNotice(apiErrorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  });
  q("#btnResetKiosk")?.addEventListener("click", fillKioskConfigForm);
  q("#kioskConfigForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!canManage || state.busy) return;
    const parseConfigJson = (value, fallback) => {
      try {
        const parsed = JSON.parse(value || "{}");
        return parsed && typeof parsed === "object" ? parsed : fallback;
      } catch {
        return fallback;
      }
    };
    const payload = {
      punch_mode: q("#kioskPunchMode").value,
      require_checkin_for_checkout: q("#kioskRequireCheckin").checked ? 1 : 0,
      anti_double_punch_minutes: Number(q("#kioskAntiDouble").value || 0),
      checkout_repeat_policy: q("#kioskRepeatPolicy").value,
      checkout_confirm_seconds: Number(q("#kioskConfirmSeconds").value || 0),
      show_estimated_workday: q("#kioskShowWorkday").checked ? 1 : 0,
      network_config: parseConfigJson(q("#kioskNetworkConfig").value, {}),
    };
    try {
      setBusy(true);
      const res = await api.put("/attendance/kiosk-config", payload);
      state.kioskConfig = res.data?.data || payload;
      setNotice("Đã lưu cấu hình máy chấm công.", "success");
      fillKioskConfigForm();
    } catch (err) {
      setNotice(apiErrorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  });

  if (q("#shiftScope")) {
    q("#shiftScope").textContent = canManage
      ? "Bạn có quyền tạo/sửa ca làm việc, phân ca, quy chế tính công và cấu hình kiosk."
      : "Chế độ chỉ xem: tra cứu danh mục ca, phân ca, quy chế và cấu hình kiosk.";
  }
  if (!canManage) {
    q("#btnNewShift")?.classList.add("hidden");
    q("#btnNewAssign")?.classList.add("hidden");
    q("#btnNewPolicy")?.classList.add("hidden");
  }

  setTab("shifts");
  fillShiftForm(null);
  refreshAll();
}
