import api from "../services/api.js";
import myProfileHtml from "../pages/my-profile.html?raw";
import {
  getCurrentUser,
  hasPermission,
} from "../services/auth.service.js";
import { setupShell } from "./home.js";

const PROFILE_PERMISSION = "ESS.SELF_PROFILE";

const WORK_STATUS = {
  WORKING: { label: "Đang làm việc", classes: "bg-emerald-50 text-emerald-800" },
  MATERNITY: { label: "Nghỉ thai sản", classes: "bg-amber-50 text-amber-900" },
  RESIGNED: { label: "Đã nghỉ việc", classes: "bg-surface-container-high text-on-surface-variant" },
};

const CONTRACT_STATUS = {
  ACTIVE: { label: "Hiện hành", classes: "bg-emerald-50 text-emerald-800" },
  EXPIRING_SOON: { label: "Sắp hết hạn", classes: "bg-amber-50 text-amber-900" },
  EXPIRED: { label: "Quá hạn", classes: "bg-red-50 text-red-700" },
  TERMINATED: { label: "Đã thanh lý", classes: "bg-surface-container-high text-on-surface-variant" },
};

const ACTION_TYPE = {
  ONBOARDING: "Tiếp nhận / Onboarding",
  PROMOTION: "Bổ nhiệm",
  TRANSFER: "Điều chuyển",
  SALARY_REVIEW: "Điều chỉnh lương",
  MATERNITY_LEAVE: "Nghỉ thai sản",
  RESIGNATION: "Nghỉ việc",
};

const RECORD_TYPE = {
  REWARD: { label: "Khen thưởng", classes: "bg-emerald-50 text-emerald-800" },
  DISCIPLINE: { label: "Kỷ luật", classes: "bg-red-50 text-red-700" },
};

const RECORD_STATUS = {
  ACTIVE: { label: "Đang áp dụng", classes: "bg-emerald-50 text-emerald-800" },
  INACTIVE: { label: "Ngừng áp dụng", classes: "bg-surface-container-high text-on-surface-variant" },
  APPROVED: { label: "Đã duyệt", classes: "bg-emerald-50 text-emerald-800" },
  PENDING: { label: "Chờ duyệt", classes: "bg-amber-50 text-amber-900" },
};

const ROLE_LABELS = {
  SUPER_ADMIN: "Quản trị hệ thống (IT Admin)",
  DIRECTOR: "Ban Giám đốc (BOD / CEO)",
  HR_ADMIN: "Quản lý Nhân sự (HR)",
  CB_PAYROLL: "Chuyên viên C&B (Lương & BHXH)",
  OFFICE_ADMIN: "Quản lý Hành chính (Admin)",
  MANAGER: "Trưởng bộ phận (Manager)",
  EMPLOYEE: "Nhân viên (Employee)",
};

const state = {
  profile: null,
  bound: false,
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
  if (!year || !month || !day) return "—";
  return `${day}/${month}/${year}`;
};

const formatCurrency = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (Number.isNaN(number)) return "—";
  return `${number.toLocaleString("vi-VN")} ₫`;
};

const formatSignedCurrency = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (Number.isNaN(number)) return "—";
  const sign = number > 0 ? "+" : number < 0 ? "-" : "";
  return `${sign}${Math.abs(number).toLocaleString("vi-VN")} ₫`;
};

const getInitials = (fullName) => {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "--";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[parts.length - 2][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const statusBadge = (map, value) => {
  const meta = map[value] || {
    label: value || "—",
    classes: "bg-surface-container-high text-on-surface-variant",
  };

  return `<span class="inline-flex items-center px-2 py-0.5 rounded font-label-sm text-label-sm font-semibold ${meta.classes}">${escapeHtml(meta.label)}</span>`;
};

const emptyRow = (colspan) =>
  `<tr><td class="px-space-sm py-4 text-center text-on-surface-variant" colspan="${colspan}">Chưa có dữ liệu</td></tr>`;

const showToast = (message, type = "success") => {
  document.getElementById("hrmToast")?.remove();

  const toast = document.createElement("div");
  toast.id = "hrmToast";
  toast.className = `fixed bottom-5 right-5 z-[200] max-w-sm rounded-lg px-4 py-3 font-body-sm text-body-sm shadow-lg ${
    type === "error"
      ? "bg-error text-on-error"
      : "bg-inverse-surface text-inverse-on-surface"
  }`;
  toast.textContent = message;
  document.body.appendChild(toast);

  window.setTimeout(() => toast.remove(), 2800);
};

const showNotice = (message) => {
  const notice = document.getElementById("profileNotice");
  if (!notice) return;

  notice.textContent = message;
  notice.className =
    "flex items-start gap-space-sm rounded-lg border border-error-container bg-error-container text-on-error-container px-space-md py-space-sm font-body-sm text-body-sm";
};

const hideNotice = () => {
  const notice = document.getElementById("profileNotice");
  if (!notice) return;

  notice.textContent = "";
  notice.className =
    "hidden items-start gap-space-sm rounded-lg border px-space-md py-space-sm font-body-sm text-body-sm";
};

const setField = (name, value) => {
  document.querySelectorAll(`[data-field="${name}"]`).forEach((element) => {
    element.textContent = value === null || value === undefined || value === ""
      ? "—"
      : String(value);
  });
};

const renderProfile = (data) => {
  state.profile = data;

  const employee = data.employee || {};
  const contracts = data.contracts || [];
  const workHistories = data.work_histories || [];
  const dependents = data.dependents || [];
  const rewards = data.rewards_disciplines || [];

  setField("employee_code", employee.employee_code);
  setField("full_name", employee.full_name);
  setField("gender", employee.gender);
  setField("dob", formatDate(employee.dob));
  setField("phone", employee.phone);
  setField("email", employee.email);
  setField("address", employee.address);
  setField("citizen_id", employee.citizen_id);
  setField("tax_code", employee.tax_code);
  setField("bank_account", employee.bank_account);
  setField("bank_name", employee.bank_name);
  setField("hire_date", formatDate(employee.hire_date));
  setField("work_status", WORK_STATUS[employee.work_status]?.label || employee.work_status);

  setField("department_name", employee.department_name);
  setField("department_code", employee.department_code);
  setField("position_title", employee.position_title);
  setField("position_code", employee.position_code);
  setField("grade_level", employee.grade_level);
  setField("job_description", employee.job_description || "Chưa cập nhật");
  setField("job_requirements", employee.job_requirements || "Chưa cập nhật");
  setField("base_salary", formatCurrency(employee.base_salary));
  setField("insurance_salary", formatCurrency(employee.insurance_salary));
  setField("position_allowance", formatCurrency(employee.position_allowance));
  setField("meal_fuel_allowance", formatCurrency(employee.meal_fuel_allowance));
  setField("dependents_count", `${Number(employee.dependents_count || 0)} người`);
  setField(
    "salary_range",
    employee.min_salary && employee.max_salary
      ? `${formatCurrency(employee.min_salary)} - ${formatCurrency(employee.max_salary)}`
      : "—",
  );

  document.getElementById("heroInitials").textContent = getInitials(employee.full_name);
  document.getElementById("heroFullName").textContent = employee.full_name || "—";
  document.getElementById("heroPosition").textContent = employee.position_title
    ? `${employee.position_title}${employee.position_code ? ` (${employee.position_code} • ${employee.grade_level || "—"})` : ""}`
    : "—";
  document.getElementById("heroDepartment").textContent = employee.department_name
    ? `${employee.department_name}${employee.department_code ? ` (${employee.department_code})` : ""}`
    : "—";

  const statusBadgeEl = document.getElementById("profileStatusBadge");
  const workStatus =
    WORK_STATUS[employee.work_status] || {
      label: employee.work_status || "Chưa xác định",
      classes: "bg-surface-container-high text-on-surface-variant",
    };
  statusBadgeEl.className = `inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-sm text-label-sm font-semibold ${workStatus.classes}`;
  statusBadgeEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-current opacity-70"></span>${escapeHtml(workStatus.label)}`;

  document.getElementById("profileEmployeeCodeBadge").textContent =
    `MÃ NV: ${employee.employee_code || "—"}`;

  document.getElementById("statContracts").textContent = String(contracts.length);
  document.getElementById("statWorkHistories").textContent = String(workHistories.length);
  document.getElementById("statDependents").textContent = String(
    dependents.filter((item) => item.status === "ACTIVE").length,
  );
  document.getElementById("statRewards").textContent = String(rewards.length);

  document.getElementById("contractsCount").textContent = `${contracts.length} bản ghi`;
  document.getElementById("workHistoriesCount").textContent = `${workHistories.length} bản ghi`;
  document.getElementById("dependentsCount").textContent = `${dependents.length} bản ghi`;
  document.getElementById("rewardsCount").textContent = `${rewards.length} bản ghi`;

  renderContracts(contracts);
  renderWorkHistories(workHistories);
  renderDependents(dependents);
  renderRewards(rewards);
};

const renderContracts = (rows) => {
  const body = document.getElementById("contractsBody");
  if (!body) return;

  body.innerHTML = rows.length
    ? rows
        .map(
          (row) => `
            <tr class="hover:bg-surface-container-low align-top">
              <td class="px-space-sm py-2 font-mono whitespace-nowrap">${escapeHtml(row.contract_code)}</td>
              <td class="px-space-sm py-2">${escapeHtml(row.contract_type)}</td>
              <td class="px-space-sm py-2 whitespace-nowrap">${formatDate(row.start_date)}</td>
              <td class="px-space-sm py-2 whitespace-nowrap">${formatDate(row.end_date)}</td>
              <td class="px-space-sm py-2 whitespace-nowrap font-semibold">${formatCurrency(row.signed_salary)}</td>
              <td class="px-space-sm py-2 whitespace-nowrap">${formatCurrency(row.insurance_salary)}</td>
              <td class="px-space-sm py-2 whitespace-nowrap">${statusBadge(CONTRACT_STATUS, row.status)}</td>
              <td class="px-space-sm py-2 min-w-[160px]">${escapeHtml(row.note || "—")}</td>
            </tr>
          `,
        )
        .join("")
    : emptyRow(8);
};

const renderWorkHistories = (rows) => {
  const body = document.getElementById("workHistoriesBody");
  if (!body) return;

  body.innerHTML = rows.length
    ? rows
        .map((row) => {
          const department =
            row.from_department_name && row.to_department_name && row.from_department_name !== row.to_department_name
              ? `${escapeHtml(row.from_department_name)} → ${escapeHtml(row.to_department_name)}`
              : escapeHtml(row.to_department_name || row.from_department_name || "—");

          const position =
            row.from_position_title && row.to_position_title && row.from_position_title !== row.to_position_title
              ? `${escapeHtml(row.from_position_title)} → ${escapeHtml(row.to_position_title)}`
              : escapeHtml(row.to_position_title || row.from_position_title || "—");

          return `
            <tr class="hover:bg-surface-container-low align-top">
              <td class="px-space-sm py-2 font-mono whitespace-nowrap">${escapeHtml(row.decision_code)}</td>
              <td class="px-space-sm py-2 whitespace-nowrap">${escapeHtml(ACTION_TYPE[row.action_type] || row.action_type || "—")}</td>
              <td class="px-space-sm py-2 min-w-[180px]">${department}</td>
              <td class="px-space-sm py-2 min-w-[150px]">${position}</td>
              <td class="px-space-sm py-2 whitespace-nowrap">${formatCurrency(row.old_salary)} → ${formatCurrency(row.new_salary)}</td>
              <td class="px-space-sm py-2 whitespace-nowrap">${formatDate(row.effective_date)}</td>
              <td class="px-space-sm py-2 min-w-[180px]">${escapeHtml(row.note || "—")}</td>
            </tr>
          `;
        })
        .join("")
    : emptyRow(7);
};

const renderDependents = (rows) => {
  const body = document.getElementById("dependentsBody");
  if (!body) return;

  body.innerHTML = rows.length
    ? rows
        .map(
          (row) => `
            <tr class="hover:bg-surface-container-low align-top">
              <td class="px-space-sm py-2 font-semibold whitespace-nowrap">${escapeHtml(row.full_name)}</td>
              <td class="px-space-sm py-2 whitespace-nowrap">${escapeHtml(row.relationship || "—")}</td>
              <td class="px-space-sm py-2 whitespace-nowrap">${formatDate(row.dob)}</td>
              <td class="px-space-sm py-2 font-mono whitespace-nowrap">${escapeHtml(row.citizen_or_birth_cert || "—")}</td>
              <td class="px-space-sm py-2 font-mono whitespace-nowrap">${escapeHtml(row.tax_code || "—")}</td>
              <td class="px-space-sm py-2 whitespace-nowrap">${formatDate(row.deduction_start)}</td>
              <td class="px-space-sm py-2 whitespace-nowrap">${formatDate(row.deduction_end)}</td>
              <td class="px-space-sm py-2 whitespace-nowrap">${statusBadge(RECORD_STATUS, row.status)}</td>
            </tr>
          `,
        )
        .join("")
    : emptyRow(8);
};

const renderRewards = (rows) => {
  const body = document.getElementById("rewardsBody");
  if (!body) return;

  body.innerHTML = rows.length
    ? rows
        .map((row) => {
          const amount = Number(row.amount);
          const amountClass = amount < 0 ? "text-red-700" : "text-emerald-700";

          return `
            <tr class="hover:bg-surface-container-low align-top">
              <td class="px-space-sm py-2 font-mono whitespace-nowrap">${escapeHtml(row.decision_code)}</td>
              <td class="px-space-sm py-2 whitespace-nowrap">${statusBadge(RECORD_TYPE, row.record_type)}</td>
              <td class="px-space-sm py-2 min-w-[240px]">
                <span class="font-semibold block">${escapeHtml(row.title)}</span>
                <span class="text-on-surface-variant block">${escapeHtml(row.reason || "—")}</span>
              </td>
              <td class="px-space-sm py-2 whitespace-nowrap font-semibold ${amountClass}">${formatSignedCurrency(row.amount)}</td>
              <td class="px-space-sm py-2 whitespace-nowrap">${escapeHtml(row.applied_month || "—")}</td>
              <td class="px-space-sm py-2 whitespace-nowrap">${formatDate(row.decision_date)}</td>
              <td class="px-space-sm py-2 whitespace-nowrap">${statusBadge(RECORD_STATUS, row.status)}</td>
            </tr>
          `;
        })
        .join("")
    : emptyRow(7);
};

const loadProfile = async () => {
  hideNotice();

  try {
    const response = await api.get("/my-profile");
    renderProfile(response.data.data);
  } catch (error) {
    const message =
      error.response?.data?.message ||
      "Không thể tải hồ sơ cá nhân, vui lòng thử lại";
    showNotice(message);
    showToast(message, "error");
  }
};

const fillContactForm = () => {
  const employee = state.profile?.employee || {};

  document.getElementById("inputPhone").value = employee.phone || "";
  document.getElementById("inputAddress").value = employee.address || "";
  document.getElementById("inputBankAccount").value = employee.bank_account || "";
  document.getElementById("inputBankName").value = employee.bank_name || "";
};

const setModalTab = (tab) => {
  const modal = document.getElementById("modal-self-update");
  if (!modal) return;

  modal.querySelectorAll("[data-tab]").forEach((button) => {
    const active = button.getAttribute("data-tab") === tab;
    button.className = `h-9 px-space-md rounded font-label-lg text-label-lg transition-colors ${
      active
        ? "bg-primary text-on-primary"
        : "text-on-surface-variant hover:bg-surface-container-high"
    }`;
  });

  document
    .getElementById("contactForm")
    ?.classList.toggle("hidden", tab !== "contact");
  document
    .getElementById("contactForm")
    ?.classList.toggle("flex", tab === "contact");
  document
    .getElementById("passwordForm")
    ?.classList.toggle("hidden", tab !== "password");
  document
    .getElementById("passwordForm")
    ?.classList.toggle("flex", tab === "password");
};

const openModal = (tab = "contact") => {
  const modal = document.getElementById("modal-self-update");
  if (!modal) return;

  if (tab === "contact") {
    fillContactForm();
  } else {
    document.getElementById("passwordForm")?.reset();
  }

  setModalTab(tab);
  modal.classList.remove("hidden");
  modal.classList.add("flex");
};

const closeModal = () => {
  const modal = document.getElementById("modal-self-update");
  if (!modal) return;

  modal.classList.add("hidden");
  modal.classList.remove("flex");
};

const withButtonLoading = async (button, loadingLabel, task) => {
  const original = button.innerHTML;
  button.disabled = true;
  button.classList.add("opacity-70", "cursor-not-allowed");
  button.textContent = loadingLabel;

  try {
    await task();
  } finally {
    button.disabled = false;
    button.classList.remove("opacity-70", "cursor-not-allowed");
    button.innerHTML = original;
  }
};

const bindModal = () => {
  const modal = document.getElementById("modal-self-update");
  if (!modal) return;

  document.getElementById("btnEditContact")?.addEventListener("click", () => openModal("contact"));
  document.getElementById("btnChangePassword")?.addEventListener("click", () => openModal("password"));

  modal.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", closeModal);
  });

  modal.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.getAttribute("data-tab");
      if (tab === "contact") fillContactForm();
      setModalTab(tab);
    });
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) {
      closeModal();
    }
  });

  document.getElementById("contactForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = document.getElementById("contactSubmit");
    const payload = {
      phone: document.getElementById("inputPhone").value.trim(),
      address: document.getElementById("inputAddress").value.trim(),
      bank_account: document.getElementById("inputBankAccount").value.trim(),
      bank_name: document.getElementById("inputBankName").value.trim(),
    };

    if (payload.phone && !/^[0-9+\-().\s]{8,20}$/.test(payload.phone)) {
      showToast("Số điện thoại không hợp lệ", "error");
      return;
    }

    await withButtonLoading(button, "Đang lưu...", async () => {
      try {
        const response = await api.put("/my-profile/contact", payload);
        closeModal();
        await loadProfile();
        showToast(response.data.message || "Cập nhật thông tin thành công");
      } catch (error) {
        showToast(
          error.response?.data?.message || "Không thể cập nhật thông tin",
          "error",
        );
      }
    });
  });

  document.getElementById("passwordForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = document.getElementById("passwordSubmit");
    const currentPassword = document.getElementById("inputCurrentPassword").value;
    const newPassword = document.getElementById("inputNewPassword").value;
    const confirmPassword = document.getElementById("inputConfirmPassword").value;

    if (!currentPassword || !newPassword) {
      showToast("Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới", "error");
      return;
    }

    if (newPassword.length < 6) {
      showToast("Mật khẩu mới phải có tối thiểu 6 ký tự", "error");
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast("Xác nhận mật khẩu mới không khớp", "error");
      return;
    }

    if (newPassword === currentPassword) {
      showToast("Mật khẩu mới phải khác mật khẩu hiện tại", "error");
      return;
    }

    await withButtonLoading(button, "Đang cập nhật...", async () => {
      try {
        const response = await api.put("/my-profile/password", {
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        });
        document.getElementById("passwordForm").reset();
        closeModal();
        showToast(response.data.message || "Đổi mật khẩu thành công");
      } catch (error) {
        showToast(
          error.response?.data?.message || "Không thể đổi mật khẩu",
          "error",
        );
      }
    });
  });
};

const renderRoleBadge = (user) => {
  const badge = document.getElementById("profileRoleBadge");
  if (!badge) return;

  const roleLabel = ROLE_LABELS[user.role_id] || user.role_name || user.role_id;
  badge.textContent = roleLabel ? `Vai trò: ${roleLabel}` : "—";
};

const ensureViewMounted = () => {
  if (document.getElementById("myProfileRoot")) return true;

  const main = document.querySelector("main");
  if (!main) return false;

  const doc = new DOMParser().parseFromString(myProfileHtml, "text/html");
  const workspace = doc.querySelector("main > div");
  const modal = doc.querySelector("#modal-self-update");

  if (!workspace) return false;

  main.innerHTML = "";
  main.appendChild(document.importNode(workspace, true));

  if (modal) {
    document.getElementById("modal-self-update")?.remove();
    document.body.appendChild(document.importNode(modal, true));
  }

  return true;
};

export const initMyProfile = (providedUser) => {
  const user = providedUser || getCurrentUser();
  if (!user) return;

  if (window.__HRM_SPA__ && !ensureViewMounted()) return;

  setupShell(user);

  const root = document.getElementById("myProfileRoot");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  renderRoleBadge(user);

  if (!hasPermission(PROFILE_PERMISSION, user)) {
    document.getElementById("profileActions")?.classList.add("hidden");
    showNotice(
      "Tài khoản của bạn không được cấp quyền ESS.SELF_PROFILE nên không thể truy cập Cổng nhân viên.",
    );
    return;
  }

  bindModal();
  loadProfile();
};

if (!window.__HRM_SPA__ && document.getElementById("myProfileRoot")) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initMyProfile());
  } else {
    initMyProfile();
  }
}
