import {
  getCurrentUser,
  hasAnyPermission,
  hasPermission,
  logout,
  updateCurrentUser,
} from "../services/auth.service.js";
import api from "../services/api.js";
import { Human } from "@vladmandic/human";

const ROLE_LABELS = {
  SUPER_ADMIN: "Quản trị hệ thống (IT Admin)",
  DIRECTOR: "Ban Giám đốc (BOD / CEO)",
  HR_ADMIN: "Quản lý Nhân sự (HR)",
  CB_PAYROLL: "Chuyên viên C&B (Lương & BHXH)",
  OFFICE_ADMIN: "Quản lý Hành chính (Admin)",
  MANAGER: "Trưởng bộ phận (Manager)",
  EMPLOYEE: "Nhân viên (Employee)",
};

const CARD_PERMISSIONS = {
  "Tất cả nhân viên": ["HR.PROFILE_VIEW"],
  "Nhân viên đang làm": ["HR.PROFILE_VIEW"],
  "Nhân viên đã nghỉ": ["HR.PROFILE_VIEW"],
  "Hợp đồng lao động": ["HR.CONTRACT_MANAGE"],
  "Sơ đồ phòng ban": ["HR.PROFILE_VIEW"],
  "Bảng chấm công tháng": ["ATT.VIEW"],
  "Phân ca làm việc": ["ATT.SHIFT_OT_MANAGE"],
  "Dữ liệu máy chấm công": ["ATT.VIEW"],
  "Làm thêm giờ (OT)": ["ATT.SHIFT_OT_MANAGE"],
  "Giải trình đi muộn/về sớm": ["ATT.VIEW"],
  "Quỹ phép năm": ["LEAVE.QUOTA_MANAGE", "LEAVE.VIEW_REQUEST"],
  "Đơn xin nghỉ phép": ["LEAVE.VIEW_REQUEST", "LEAVE.APPROVE"],
  "Tạo & Kết chuyển phép": ["LEAVE.QUOTA_MANAGE"],
  "Nghỉ bù làm thêm": ["LEAVE.VIEW_REQUEST"],
  "Hồ sơ BHXH / BHYT": ["INS.BHXH_MANAGE"],
  "Báo tăng / Báo giảm BH": ["INS.BHXH_MANAGE"],
  "Chế độ Thai sản & Ốm đau": ["INS.MATERNITY_ACCIDENT"],
  "Bảo hiểm sức khỏe": ["INS.BHXH_MANAGE"],
  "Thưởng theo KPI/OKR": ["P3.VIEW", "P3.CALCULATE_APPROVE"],
  "Hoa hồng kinh doanh": ["P3.VIEW", "P3.CALCULATE_APPROVE"],
  "Lương khoán sản phẩm": ["P3.VIEW", "P3.CALCULATE_APPROVE"],
  "Quỹ thưởng dự án": ["P3.CALCULATE_APPROVE"],
  "Bảng tính lương tháng": ["PAY.RUN_PAYROLL"],
  "Quy chế & Thang bảng lương": ["PAY.VIEW_OWN_PAYSLIP"],
  "Thuế TNCN & Giảm trừ": ["PAY.RUN_PAYROLL"],
  "Khen thưởng & Kỷ luật": ["HR.REWARD_DISCIPLINE"],
  "Phiếu lương (Payslip)": ["PAY.VIEW_OWN_PAYSLIP"],
  "Yêu cầu tuyển dụng": ["REC.MANAGE"],
  "Kho ứng viên (CV)": ["REC.MANAGE"],
  "Lịch phỏng vấn & Đánh giá": ["REC.MANAGE"],
  "Tiếp nhận Onboarding": ["REC.MANAGE"],
  "Kế hoạch đào tạo": ["TRN.MANAGE"],
  "Khóa học trực tuyến": ["TRN.VIEW_JOIN", "TRN.MANAGE"],
  "Thi sát hạch & Chứng chỉ": ["TRN.MANAGE"],
  "Tài liệu & Cam kết đào tạo": ["TRN.VIEW_JOIN", "TRN.MANAGE"],
  "Thiết lập mục tiêu KPI": ["EVAL.SELF_ASSESS", "EVAL.REVIEW_9BOX"],
  "Đánh giá năng lực 360": ["EVAL.REVIEW_9BOX"],
  "Ma trận nhân tài 9-Box": ["EVAL.REVIEW_9BOX"],
  "Đánh giá HĐ thử việc": ["EVAL.REVIEW_9BOX"],
  "Danh mục trang thiết bị": ["ASSET.ALLOCATE_MANAGE", "ASSET.VIEW_OWN"],
  "Cấp phát & Bàn giao": ["ASSET.ALLOCATE_MANAGE"],
  "Thu hồi khi nghỉ việc": ["ASSET.ALLOCATE_MANAGE"],
  "Báo hỏng & Đền bù": ["ASSET.VIEW_OWN", "ASSET.ALLOCATE_MANAGE"],
  "Cổng thông tin cá nhân": [],
  "Tạo đơn từ trực tuyến": ["LEAVE.VIEW_REQUEST"],
  "Trung tâm Phê duyệt": ["LEAVE.APPROVE", "ATT.SHIFT_OT_MANAGE"],
  "Bản tin & Nội quy công ty": [],
  "Dashboard Biến động nhân sự": ["BI.DASHBOARD_VIEW"],
  "Báo cáo Chi phí quỹ lương": ["BI.DASHBOARD_VIEW"],
  "Báo cáo Chuyên cần & OT": ["BI.DASHBOARD_VIEW"],
  "Báo cáo Hiệu quả tuyển dụng": ["BI.DASHBOARD_VIEW"],
};

const NAV_PERMISSIONS = {
  "menu-launcher": [],
  "nhan-su": ["HR.PROFILE_VIEW"],
  "lich-bieu": [],
  "nghi-phep": ["LEAVE.VIEW_REQUEST", "LEAVE.APPROVE", "LEAVE.QUOTA_MANAGE"],
  "bao-hiem": ["INS.BHXH_MANAGE", "INS.MATERNITY_ACCIDENT"],
  "khen-thuong": ["HR.REWARD_DISCIPLINE", "P3.VIEW", "P3.CALCULATE_APPROVE"],
  "tien-luong": ["PAY.VIEW_OWN_PAYSLIP", "PAY.RUN_PAYROLL", "P3.VIEW"],
  "tuyen-dung": ["REC.MANAGE"],
  "dao-tao": ["TRN.VIEW_JOIN", "TRN.MANAGE"],
  "danh-gia": ["EVAL.SELF_ASSESS", "EVAL.REVIEW_9BOX"],
  "tai-san": ["ASSET.VIEW_OWN", "ASSET.ALLOCATE_MANAGE"],
  "bao-cao": ["BI.DASHBOARD_VIEW"],
};

const ACTION_BUTTONS = {
  SUPER_ADMIN: [
    {
      label: "Cấp phát / Thu hồi thiết bị",
      icon: "inventory",
      permission: "ASSET.ALLOCATE_MANAGE",
    },
    {
      label: "Kiểm tra log máy chấm công",
      icon: "fingerprint",
      permission: "ATT.VIEW",
    },
  ],
  DIRECTOR: [
    {
      label: "Duyệt Bảng lương tổng",
      icon: "fact_check",
      permission: "PAY.RUN_PAYROLL",
    },
    {
      label: "Duyệt Quỹ thưởng P3",
      icon: "price_check",
      permission: "P3.CALCULATE_APPROVE",
    },
    {
      label: "Duyệt Đơn nghỉ phép",
      icon: "approval",
      permission: "LEAVE.APPROVE",
    },
    {
      label: "Duyệt Định biên Tuyển dụng",
      icon: "person_add",
      permission: "REC.MANAGE",
    },
  ],
  HR_ADMIN: [
    {
      label: "+ Thêm nhân viên",
      icon: "person_add",
      permission: "HR.PROFILE_MANAGE",
    },
    {
      label: "Sửa hồ sơ & lương cá nhân",
      icon: "edit_note",
      permission: "HR.PROFILE_MANAGE",
    },
    {
      label: "Tạo/Gia hạn hợp đồng",
      icon: "history_edu",
      permission: "HR.CONTRACT_MANAGE",
    },
    {
      label: "Khởi tạo phép năm",
      icon: "event_available",
      permission: "LEAVE.QUOTA_MANAGE",
    },
    {
      label: "Tiếp nhận Onboard",
      icon: "how_to_reg",
      permission: "REC.MANAGE",
    },
    {
      label: "Tạo khóa đào tạo",
      icon: "school",
      permission: "TRN.MANAGE",
    },
  ],
  CB_PAYROLL: [
    {
      label: "Chốt bảng công",
      icon: "task_alt",
      permission: "ATT.SHIFT_OT_MANAGE",
    },
    {
      label: "Báo tăng/giảm BHXH",
      icon: "health_and_safety",
      permission: "INS.BHXH_MANAGE",
    },
    {
      label: "Tính thưởng P3",
      icon: "calculate",
      permission: "P3.CALCULATE_APPROVE",
    },
    {
      label: "Chạy bảng lương tháng & Thuế TNCN",
      icon: "payments",
      permission: "PAY.RUN_PAYROLL",
    },
  ],
  OFFICE_ADMIN: [
    {
      label: "Nhập kho thiết bị",
      icon: "add_box",
      permission: "ASSET.ALLOCATE_MANAGE",
    },
    {
      label: "Cấp phát / Thu hồi & Tính đền bù thiết bị",
      icon: "swap_horiz",
      permission: "ASSET.ALLOCATE_MANAGE",
    },
    {
      label: "Ghi nhận Tai nạn lao động",
      icon: "report",
      permission: "INS.MATERNITY_ACCIDENT",
    },
  ],
  MANAGER: [
    {
      label: "Phân ca & Duyệt OT phòng mình",
      icon: "schedule",
      permission: "ATT.SHIFT_OT_MANAGE",
    },
    {
      label: "Duyệt đơn nghỉ phép nhân viên trong phòng",
      icon: "approval",
      permission: "LEAVE.APPROVE",
    },
    {
      label: "Chấm điểm KPI cấp dưới",
      icon: "rate_review",
      permission: "EVAL.REVIEW_9BOX",
    },
    {
      label: "Đề xuất tuyển dụng",
      icon: "person_search",
      permission: "REC.MANAGE",
    },
  ],
  EMPLOYEE: [
    {
      label: "+ Tạo đơn xin nghỉ phép",
      icon: "event_note",
      permission: "LEAVE.VIEW_REQUEST",
    },
    {
      label: "Tự đánh giá KPI",
      icon: "fact_check",
      permission: "EVAL.SELF_ASSESS",
    },
    {
      label: "Báo hỏng thiết bị",
      icon: "report_problem",
      permission: "ASSET.VIEW_OWN",
    },
  ],
};

const ACTION_CATEGORY = {
  "Cấp phát / Thu hồi thiết bị": 10,
  "Kiểm tra log máy chấm công": 2,
  "Duyệt Bảng lương tổng": 6,
  "Duyệt Quỹ thưởng P3": 5,
  "Duyệt Đơn nghỉ phép": 3,
  "Duyệt Định biên Tuyển dụng": 7,
  "+ Thêm nhân viên": 1,
  "Sửa hồ sơ & lương cá nhân": 1,
  "Tạo/Gia hạn hợp đồng": 1,
  "Khởi tạo phép năm": 3,
  "Tiếp nhận Onboard": 7,
  "Tạo khóa đào tạo": 8,
  "Chốt bảng công": 2,
  "Báo tăng/giảm BHXH": 4,
  "Tính thưởng P3": 5,
  "Chạy bảng lương tháng & Thuế TNCN": 6,
  "Nhập kho thiết bị": 10,
  "Cấp phát / Thu hồi & Tính đền bù thiết bị": 10,
  "Ghi nhận Tai nạn lao động": 4,
  "Phân ca & Duyệt OT phòng mình": 2,
  "Duyệt đơn nghỉ phép nhân viên trong phòng": 3,
  "Chấm điểm KPI cấp dưới": 9,
  "Đề xuất tuyển dụng": 7,
  "+ Tạo đơn xin nghỉ phép": 3,
  "Tự đánh giá KPI": 9,
  "Báo hỏng thiết bị": 10,
};

const escapeHtml = (value) => {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const setupHeaderUser = (user) => {
  const button = document.getElementById("userMenuBtn");
  const dropdown = document.getElementById("userMenuDropdown");
  if (!button || !dropdown) return;

  const roleLabel = ROLE_LABELS[user.role_id] || user.role_name || user.role_id;

  dropdown.innerHTML = `
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-full bg-primary-container text-on-primary flex items-center justify-center shrink-0">
        <span class="material-symbols-outlined text-[22px]">account_circle</span>
      </div>
      <div class="min-w-0">
        <p class="font-body-lg text-body-lg font-bold truncate">${escapeHtml(user.full_name)}</p>
        <p class="font-label-md text-label-md text-on-surface-variant">${escapeHtml(user.employee_code)}</p>
      </div>
    </div>
    <div class="mt-3 pt-3 border-t border-surface-variant space-y-1.5 font-body-sm text-body-sm">
      <p><span class="text-on-surface-variant">Phòng ban:</span> <span class="font-medium">${escapeHtml(user.department_name || "-")}</span></p>
      <p><span class="text-on-surface-variant">Vị trí:</span> <span class="font-medium">${escapeHtml(user.position_title || "-")}</span></p>
      <p><span class="text-on-surface-variant">Vai trò:</span> <span class="font-medium">${escapeHtml(roleLabel)}</span></p>
    </div>
  `;

  if (button.dataset.bound === "1") return;
  button.dataset.bound = "1";

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    dropdown.classList.toggle("hidden");
  });

  document.addEventListener("click", (event) => {
    if (dropdown.classList.contains("hidden")) return;
    if (!dropdown.contains(event.target) && !button.contains(event.target)) {
      dropdown.classList.add("hidden");
    }
  });
};

const applyCategoryActions = (user) => {
  document.querySelectorAll(".hrm-module-actions").forEach((el) => el.remove());

  const actions = (ACTION_BUTTONS[user.role_id] || []).filter((action) =>
    hasPermission(action.permission, user),
  );

  const grouped = new Map();

  actions.forEach((action) => {
    const category = ACTION_CATEGORY[action.label];
    if (!category) return;

    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(action);
  });

  grouped.forEach((items, category) => {
    const content = document.querySelector(
      `.category-block[data-category="${category}"] .category-content`,
    );
    if (!content) return;

    const wrapper = document.createElement("div");
    wrapper.className =
      "hrm-module-actions flex flex-wrap gap-space-xs pb-space-sm mb-space-sm border-b border-surface-variant";
    wrapper.innerHTML = items
      .map(
        (action) => `
          <button type="button" class="hrm-action-btn h-9 px-space-md rounded bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md flex items-center gap-1.5 transition-colors" data-action="${escapeHtml(action.label)}">
            <span class="material-symbols-outlined text-[18px]">${escapeHtml(action.icon)}</span>
            ${escapeHtml(action.label)}
          </button>
        `,
      )
      .join("");

    content.insertBefore(wrapper, content.firstChild);
  });
};

const applyCardPermissions = (user) => {
  const cards = document.querySelectorAll(".action-card");

  cards.forEach((card) => {
    const title = card.getAttribute("data-title") || "";
    const requiredPermissions = CARD_PERMISSIONS[title];
    let allowed = true;

    if (Array.isArray(requiredPermissions) && requiredPermissions.length) {
      allowed = hasAnyPermission(requiredPermissions, user);
    }

    if (user.data_scope === "SELF") {
      if (["Nhân viên đang làm", "Nhân viên đã nghỉ", "Sơ đồ phòng ban"].includes(title)) {
        allowed = false;
      }

      if (title === "Tất cả nhân viên") {
        const heading = card.querySelector("h4");
        const description = card.querySelector("p");
        if (heading) heading.textContent = "Hồ sơ cá nhân & JD";
        if (description) description.textContent = "Thông tin cá nhân và mô tả công việc";
        card.setAttribute("data-title", "Hồ sơ cá nhân & JD");
      }
    }

    if (!allowed) {
      card.dataset.denied = "1";
      card.style.display = "none";
    } else {
      delete card.dataset.denied;
      card.style.display = "flex";
    }
  });

  document.querySelectorAll(".category-block").forEach((section) => {
    const visibleCards = Array.from(
      section.querySelectorAll(".action-card"),
    ).filter((card) => card.dataset.denied !== "1");

    const countBadge = section.querySelector(
      ".category-header span.bg-primary-fixed",
    );
    if (countBadge) countBadge.textContent = String(visibleCards.length);

    const hasActions = Boolean(section.querySelector(".hrm-module-actions"));
    section.style.display = visibleCards.length || hasActions ? "block" : "none";
  });
};

const applyNavPermissions = (user) => {
  document.querySelectorAll("aside nav a[data-path]").forEach((link) => {
    const path = link.getAttribute("data-path");
    const requiredPermissions = NAV_PERMISSIONS[path];
    let allowed = true;

    if (Array.isArray(requiredPermissions) && requiredPermissions.length) {
      allowed = hasAnyPermission(requiredPermissions, user);
    }

    if (!allowed) {
      link.style.display = "none";
    }
  });
};

const ensurePermissionsNav = (user) => {
  const nav = document.querySelector("aside nav");
  if (!nav || nav.querySelector('[data-path="phan-quyen"]')) return;

  if (user.role_id !== "SUPER_ADMIN") return;

  nav.insertAdjacentHTML(
    "beforeend",
    `
      <a class="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all" data-path="phan-quyen" href="#" title="Phân quyền" data-tooltip="Phân quyền" aria-label="Phân quyền">
        <span class="material-symbols-outlined text-[20px]">admin_panel_settings</span>
      </a>
    `,
  );
};

const showToast = (message, options = {}) => {
  const oldToast = document.getElementById(options.id || "hrmToast");
  if (oldToast) oldToast.remove();

  const toast = document.createElement("div");
  toast.id = options.id || "hrmToast";
  toast.className =
    options.className ||
    "fixed bottom-5 right-5 z-[100] max-w-sm rounded-lg bg-inverse-surface text-inverse-on-surface shadow-lg px-4 py-3 font-body-sm text-body-sm";
  toast.textContent = message;
  document.body.appendChild(toast);

  if (options.persistent !== true) {
    window.setTimeout(() => toast.remove(), options.duration || 2600);
  }
  return toast;
};

const FACE_CAPTURE_MODEL = "human-faceres1024-subjectlock-v3";
const FACE_SAMPLE_COUNT = 5;
const TRACK_CONFIG = {
  face: {
    enabled: true,
    detector: { modelPath: "blazeface.json", maxDetected: 4, rotation: true, minConfidence: 0.45, skipFrames: 0, skipTime: 0 },
    mesh: { enabled: false }, attention: { enabled: false }, iris: { enabled: false },
    description: { enabled: false }, antispoof: { enabled: false }, liveness: { enabled: false }, emotion: { enabled: false },
  },
  body: { enabled: false },
  hand: { enabled: false }, object: { enabled: false }, gesture: { enabled: false },
};
const RECOGNIZE_CONFIG = {
  face: {
    enabled: true,
    detector: { modelPath: "blazeface.json", maxDetected: 1, rotation: true, minConfidence: 0.5, skipFrames: 0, skipTime: 0 },
    mesh: { enabled: true }, attention: { enabled: false }, iris: { enabled: true },
    description: { enabled: true, skipFrames: 0, skipTime: 0 },
    antispoof: { enabled: true, skipFrames: 0, skipTime: 0 },
    liveness: { enabled: true, skipFrames: 0, skipTime: 0 }, emotion: { enabled: false },
  },
  body: { enabled: false }, hand: { enabled: false }, object: { enabled: false }, gesture: { enabled: true },
};

const human = new Human({
  modelBasePath: "https://cdn.jsdelivr.net/npm/@vladmandic/human/models/",
  cacheSensitivity: 0,
  ...TRACK_CONFIG,
});
let faceModelPromise;
let faceEnrollStream = null;
let faceEnrollDescriptor = null;
let faceEnrollTimer = null;

const stopFaceEnrollStream = () => {
  if (faceEnrollTimer) {
    clearTimeout(faceEnrollTimer);
    faceEnrollTimer = null;
  }
  if (faceEnrollStream) {
    faceEnrollStream.getTracks().forEach((t) => t.stop());
    faceEnrollStream = null;
  }
  const video = document.getElementById("faceEnrollVideo");
  if (video) video.srcObject = null;
};

const closeFaceEnrollModal = () => {
  faceEnrollSession++;
  stopFaceEnrollStream();
  faceEnrollDescriptor = null;
  const password = document.getElementById("faceEnrollPassword");
  if (password) password.value = "";
  const modal = document.getElementById("modal-faceid-enroll");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
};

window.addEventListener("hashchange", closeFaceEnrollModal);
window.addEventListener("pagehide", closeFaceEnrollModal);

const setFaceEnrollStatus = (text, hint) => {
  const status = document.getElementById("faceEnrollStatus");
  const hintEl = document.getElementById("faceEnrollHint");
  if (status && text) status.textContent = text;
  if (hintEl && hint) hintEl.textContent = hint;
};

export const ensureFaceModels = async () => {
  if (!faceModelPromise) faceModelPromise = (async () => {
    await human.load(TRACK_CONFIG);
    await human.load(RECOGNIZE_CONFIG);
  })().catch(error => { faceModelPromise = null; throw error; });
  await faceModelPromise;
};

const vectorSimilarity = (a, b) => {
  if (!a || !b || a.length !== b.length) return -1;
  const norm = Math.hypot(...a) * Math.hypot(...b);
  return norm ? a.reduce((sum, value, index) => sum + value * b[index], 0) / norm : -1;
};
const eyeRatio = face => {
  const distance = (a, b) => a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : NaN;
  const mesh = face.mesh || [];
  const eye = indices => {
    const [a, b, c, d, e, f] = indices.map(index => mesh[index]);
    return (distance(b, f) + distance(c, e)) / (2 * distance(a, d));
  };
  const meshRatios = [eye([33, 160, 158, 133, 153, 144]), eye([362, 385, 387, 263, 373, 380])];
  if (meshRatios.every(Number.isFinite)) return (meshRatios[0] + meshRatios[1]) / 2;
  const ratios = ["left", "right"].map(side => {
    const upper = face.annotations?.[`${side}EyeUpper0`], lower = face.annotations?.[`${side}EyeLower0`];
    if (!upper?.length || !lower?.length) return NaN;
    const width = Math.max(...[...upper, ...lower].map(p => p[0])) - Math.min(...[...upper, ...lower].map(p => p[0]));
    return Math.abs(upper.reduce((sum, p) => sum + p[1], 0) / upper.length - lower.reduce((sum, p) => sum + p[1], 0) / lower.length) / width;
  });
  return ratios.every(Number.isFinite) ? (ratios[0] + ratios[1]) / 2 : NaN;
};
export const detectEyeBlink = (face, gestures, state = {}, now = performance.now()) => {
  const ear = eyeRatio(face);
  const blinkGesture = (gestures || []).some(item => /blink (left|right) eye/i.test(typeof item === "string" ? item : item.gesture || ""));
  if (ear > 0.23 && !state.closedAt) state.open = true;
  if (state.open && (ear < 0.175 || blinkGesture) && !state.closedAt) state.closedAt = now;
  if (state.closedAt && now - state.closedAt > 900) { state.closedAt = null; state.open = false; }
  if (state.closedAt && ear > 0.22 && !blinkGesture) {
    const duration = now - state.closedAt;
    state.closedAt = null; state.open = true;
    return duration >= 60 && duration <= 900;
  }
  return false;
};

const boxCenter = (box) => [box[0] + box[2] / 2, box[1] + box[3] / 2];

const median = values => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const percentile = (values, fraction) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
};

const boxIoU = (a, b) => {
  const intersectionWidth = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const intersectionHeight = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  const intersection = intersectionWidth * intersectionHeight;
  const union = a[2] * a[3] + b[2] * b[3] - intersection;
  return union > 0 ? intersection / union : 0;
};

const expandBox = (box, factor, width, height) => {
  const [x, y, w, h] = box;
  const left = Math.max(0, x - w * (factor - 1) / 2);
  const top = Math.max(0, y - h * (factor - 1) / 2);
  return [left, top, Math.min(width - left, w * factor), Math.min(height - top, h * factor)];
};

const cropMetrics = (context, size) => {
  const pixels = context.getImageData(0, 0, size, size).data;
  const gray = new Float32Array(size * size);
  let brightness = 0;
  for (let index = 0, pixel = 0; index < gray.length; index++, pixel += 4) {
    gray[index] = 0.2126 * pixels[pixel] + 0.7152 * pixels[pixel + 1] + 0.0722 * pixels[pixel + 2];
    brightness += gray[index];
  }
  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const index = y * size + x;
      const laplacian = 4 * gray[index] - gray[index - 1] - gray[index + 1] - gray[index - size] - gray[index + size];
      sum += laplacian;
      sumSquares += laplacian * laplacian;
      count++;
    }
  }
  const mean = sum / count;
  return { brightness: brightness / gray.length, sharpness: Math.max(0, sumSquares / count - mean * mean) };
};

const drawFaceGuides = (canvas, video, subject, note) => {
  if (!canvas || !video.videoWidth || !video.clientWidth) return;
  const width = video.clientWidth;
  const height = video.clientHeight;
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, width, height);
  const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
  const offsetX = (width - video.videoWidth * scale) / 2;
  const offsetY = (height - video.videoHeight * scale) / 2;
  const displayBox = (box) => [offsetX + (video.videoWidth - box[0] - box[2]) * scale, offsetY + box[1] * scale, box[2] * scale, box[3] * scale];
  context.lineWidth = 2;
  context.setLineDash([8, 6]);
  context.strokeStyle = subject?.locked ? "rgba(251, 191, 36, 0.95)" : "rgba(148, 163, 184, 0.85)";
  const guide = displayBox([video.videoWidth * 0.3, video.videoHeight * 0.16, video.videoWidth * 0.4, video.videoHeight * 0.62]);
  context.strokeRect(guide[0], guide[1], guide[2], guide[3]);
  if (subject) {
    const person = displayBox(subject.personBox);
    const face = displayBox(subject.faceBox);
    context.strokeStyle = subject.locked ? "rgba(251, 191, 36, 0.95)" : "rgba(148, 163, 184, 0.8)";
    context.strokeRect(person[0], person[1], person[2], person[3]);
    context.setLineDash([]);
    context.strokeStyle = subject.locked ? "rgba(52, 211, 153, 1)" : "rgba(148, 163, 184, 0.9)";
    context.strokeRect(face[0], face[1], face[2], face[3]);
    context.font = "600 12px sans-serif";
    context.fillStyle = subject.locked ? "rgba(52, 211, 153, 1)" : "rgba(226, 232, 240, 0.95)";
    context.fillText(subject.locked ? "KHUÔN MẶT (đã khóa)" : "ĐANG XÁC ĐỊNH KHUÔN MẶT", Math.max(4, person[0]), Math.max(14, person[1] - 6));
  }
  context.setLineDash([]);
  if (note) {
    context.font = "600 12px sans-serif";
    const textWidth = context.measureText(note).width;
    const left = Math.max(0, (width - textWidth - 20) / 2);
    context.fillStyle = "rgba(0, 0, 0, 0.68)";
    context.fillRect(left, height - 34, textWidth + 20, 26);
    context.fillStyle = "rgba(255, 255, 255, 0.96)";
    context.fillText(note, left + 10, height - 16);
  }
};

const buildCandidates = (result, width, height) => {
  const faces = (result.face || []).filter(face => face?.box && Number(face.score) >= 0.45 && face.box[2] >= 40);
  return faces.map(face => ({
    personBox: expandBox(face.box, 2.2, width, height),
    faceBox: face.box,
    score: Number(face.score) || 0,
  })).sort((a, b) => b.score - a.score);
};

const updateTrackMetrics = (track, candidate, now, width, height) => {
  track.missed = 0;
  track.personBox = candidate.personBox;
  track.faceBox = track.faceBox
    ? track.faceBox.map((value, index) => value + (candidate.faceBox[index] - value) * 0.45)
    : candidate.faceBox;
  track.score = candidate.score;
  const [rawCenterX, rawCenterY] = boxCenter(track.personBox);
  const previous = track.history[track.history.length - 1];
  const elapsed = previous ? Math.max(16, now - previous.t) : 100;
  const centerX = previous ? previous.centerX + (rawCenterX - previous.centerX) * 0.3 : rawCenterX;
  const centerY = previous ? previous.centerY + (rawCenterY - previous.centerY) * 0.3 : rawCenterY;
  const smoothWidth = previous ? previous.width + (track.personBox[2] - previous.width) * 0.25 : track.personBox[2];
  const speed = previous ? Math.hypot(centerX - previous.centerX, centerY - previous.centerY) / elapsed * 1000 / width * 100 : 0;
  track.history.push({ t: now, centerX, centerY, width: smoothWidth, speed });
  if (track.history.length > 16) track.history.shift();
  const recent = track.history.filter(entry => entry.t >= now - 6000);
  const maxSpeed = percentile(recent.map(entry => entry.speed), 0.85);
  const widths = recent.map(entry => entry.width);
  const medianWidth = median(widths);
  const drift = medianWidth ? (percentile(widths, 0.9) - percentile(widths, 0.1)) / medianWidth : 1;
  const faceWidth = track.faceBox[2];
  const centered = centerX > width * 0.2 && centerX < width * 0.8;
  const faceInside = track.faceBox[0] >= 6 && track.faceBox[1] >= 6 && track.faceBox[0] + faceWidth <= width - 6 && track.faceBox[1] + track.faceBox[3] <= height - 6;
  const ready = recent.length >= 8 && maxSpeed <= 12 && drift <= 0.4 && faceWidth >= 100 && centered && faceInside;
  track.speed = speed;
  track.maxSpeedRecent = maxSpeed;
  track.drift = drift;
  track.stableFrames = ready ? recent.length : 0;
  track.moving = speed > 36 || maxSpeed > 24 || drift > 0.55;
  return track;
};

const trackSubject = (candidates, tracks, now, width, height) => {
  const active = tracks.filter(track => track.missed < 12);
  const used = new Set();
  for (const track of active) {
    let bestIndex = -1;
    let bestOverlap = 0;
    candidates.forEach((candidate, index) => {
      if (used.has(index)) return;
      const overlap = boxIoU(candidate.personBox, track.personBox);
      if (overlap > bestOverlap) { bestOverlap = overlap; bestIndex = index; }
    });
    if (bestIndex >= 0 && bestOverlap >= 0.18) {
      used.add(bestIndex);
      updateTrackMetrics(track, candidates[bestIndex], now, width, height);
    } else {
      track.missed += 1;
    }
  }
  candidates.forEach((candidate, index) => {
    if (used.has(index)) return;
    const track = {
      personBox: candidate.personBox,
      faceBox: candidate.faceBox,
      score: candidate.score,
      history: [],
      stableFrames: 0,
      missed: 0,
      locked: false,
      readyStreak: 0,
      fastFrames: 0,
      maxSpeed: 0,
      moving: false,
    };
    updateTrackMetrics(track, candidate, now, width, height);
    active.push(track);
  });
  const nextTracks = active.filter(track => track.missed < 12 || track.locked).slice(-6);
  let subject = nextTracks.find(track => track.locked && track.missed < 12);
  if (subject) {
    subject.maxSpeed = Math.max(subject.maxSpeed || 0, subject.maxSpeedRecent || 0);
    subject.fastFrames = (subject.speed || 0) > 30 ? subject.fastFrames + 1 : 0;
    subject.otherPersons = 0;
    if (subject.fastFrames >= 5 || subject.maxSpeedRecent > 40 || subject.missed >= 8) {
      subject.locked = false;
      subject.readyStreak = 0;
      subject.history.length = 0;
      subject.stableFrames = 0;
      subject = null;
    }
  }
  if (!subject) {
    const eligible = nextTracks
      .filter(track => track.missed === 0 && !track.moving && track.stableFrames >= 8)
      .sort((a, b) => (b.readyStreak - a.readyStreak) || (b.stableFrames - a.stableFrames) || (b.score - a.score));
    subject = eligible[0] || null;
    if (subject) {
      subject.readyStreak += 1;
      if (subject.readyStreak >= 2) {
        subject.locked = true;
        subject.lockedStableFrames = subject.stableFrames;
        subject.maxSpeed = 0;
      }
    }
  }
  const otherPersons = nextTracks.filter(track => track !== subject && track.missed === 0).length;
  if (subject) subject.otherPersons = otherPersons;
  const message = !subject
    ? candidates.length ? "Đang phân biệt người đứng yên và người đi qua. Giữ yên để khóa khuôn mặt." : "Đưa khuôn mặt vào khung hình, đứng yên để hệ thống tự tách mặt và khóa đúng người."
    : subject.locked
      ? otherPersons > 0 ? "Đã khóa đúng người quét. Người đi qua lại đang bị bỏ qua." : "Đã khóa đúng người quét. Giữ nguyên tư thế và nhìn thẳng vào camera."
      : otherPersons > 0 ? "Đang khóa người đứng yên. Người đi qua đang bị bỏ qua." : "Đứng yên đúng chỗ, nhìn thẳng vào camera để khóa người quét.";
  return { tracks: nextTracks, subject, otherPersons, speed: subject?.speed || 0, message };
};

const cropFaceRegion = (video, faceBox, canvas) => {
  const [centerX, centerY] = boxCenter(faceBox);
  const side = Math.min(Math.max(faceBox[2], faceBox[3]) * 1.9, Math.min(video.videoWidth, video.videoHeight));
  const x = Math.max(0, Math.min(centerX - side / 2, video.videoWidth - side));
  const y = Math.max(0, Math.min(centerY - side / 2, video.videoHeight - side));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(video, x, y, side, side, 0, 0, canvas.width, canvas.height);
  return context;
};

const buildCaptureMetadata = (state) => {
  const stats = state.stats;
  return {
    model: FACE_CAPTURE_MODEL,
    face_only: true,
    samples: state.samples.length || 1,
    quality: {
      min_score: stats.minScore,
      min_real: stats.minReal,
      min_live: stats.minLive,
      min_sharpness: stats.minSharpness,
      brightness_min: stats.brightnessMin,
      brightness_max: stats.brightnessMax,
      min_face_width: stats.minFaceWidth,
    },
    liveness: {
      blink_verified: state.blinks > 0,
      blink_count: state.blinks,
      min_real: stats.minReal,
      min_live: stats.minLive,
    },
    subject: {
      locked: true,
      stable_frames: state.subject?.lockedStableFrames || state.subject?.stableFrames || 0,
      max_speed: Math.round((state.subject?.maxSpeed || 0) * 100) / 100,
      rejected_moving_persons: state.rejectedOthers,
    },
  };
};

const runFaceCapture = async (video, { onProgress = () => {}, onStage = () => {}, isActive = () => true, probeOnly = false, timeoutMs = 75000 }) => {
  await ensureFaceModels();
  const host = video.parentElement;
  video.style.transform = "scaleX(-1)";
  let guide = host?.querySelector("canvas[data-face-guide], #faceEnrollOverlay");
  if (!guide && host) {
    guide = document.createElement("canvas");
    guide.dataset.faceGuide = "1";
    guide.className = "absolute inset-0 w-full h-full pointer-events-none z-20";
    host.appendChild(guide);
  }
  const faceCanvas = document.createElement("canvas");
  faceCanvas.width = 320;
  faceCanvas.height = 320;
  const state = {
    subject: null,
    tracks: [],
    samples: [],
    blinks: 0,
    rejectedOthers: 0,
    lastCapture: 0,
    blinkState: {},
    stats: { minScore: null, minReal: null, minLive: null, minSharpness: null, brightnessMin: null, brightnessMax: null, minFaceWidth: null },
  };
  const updateMin = (key, value) => {
    state.stats[key] = state.stats[key] === null ? value : Math.min(state.stats[key], value);
  };
  const deadline = performance.now() + timeoutMs;
  try {
    while (performance.now() < deadline) {
      if (!isActive()) throw new Error("Đã dừng quét khuôn mặt.");
      const tracking = await human.detect(video, TRACK_CONFIG);
      if (!isActive()) throw new Error("Đã dừng quét khuôn mặt.");
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;
      const candidates = buildCandidates(tracking, width, height);
      const tracked = trackSubject(candidates, state.tracks, performance.now(), width, height);
      state.tracks = tracked.tracks;
      state.subject = tracked.subject;
      if (tracked.otherPersons > 0) state.rejectedOthers += 1;
      drawFaceGuides(guide, video, state.subject, tracked.message);
      if (!state.subject?.locked) {
        onStage(tracked.message);
        await new Promise(resolve => setTimeout(resolve, 60));
        continue;
      }
      const context = cropFaceRegion(video, state.subject.faceBox, faceCanvas);
      const recognition = await human.detect(faceCanvas, RECOGNIZE_CONFIG);
      if (!isActive()) throw new Error("Đã dừng quét khuôn mặt.");
      const face = recognition.face?.length === 1 ? recognition.face[0] : null;
      const metrics = cropMetrics(context, faceCanvas.width);
      const angle = face?.rotation?.angle;
      const facing = angle && Math.abs(angle.yaw) <= 0.22 && Math.abs(angle.pitch) <= 0.22 && Math.abs(angle.roll) <= 0.22;
      const box = face?.box;
      const boxValid = box && box[0] >= 10 && box[1] >= 10 && box[0] + box[2] <= 310 && box[1] + box[3] <= 310 && box[2] >= 130;
      if (face && Number(face.score) >= 0.7 && detectEyeBlink(face, recognition.gesture, state.blinkState)) state.blinks += 1;
      const quality = face && facing && eyeRatio(face) > 0.18 && boxValid && Number(face.score) >= 0.85 && Number(face.real) >= 0.7 && Number(face.live) >= 0.7 && metrics.brightness >= 50 && metrics.brightness <= 220 && metrics.sharpness >= 30 && (face.embedding?.length || 0) >= 512;
      if (!quality) {
        onStage(!face ? "Đang lấy lại nét khuôn mặt đã khóa." : !facing ? "Hướng mặt gần thẳng về camera." : metrics.sharpness < 30 ? "Khung hình hơi nhòe, đang chờ nét lại." : metrics.brightness < 50 ? "Khuôn mặt thiếu sáng. Hướng về phía nguồn sáng." : metrics.brightness > 220 ? "Ánh sáng quá chói. Giảm độ sáng rồi quét lại." : "Đang chờ khung hình khuôn mặt đạt chất lượng.");
        await new Promise(resolve => setTimeout(resolve, 60));
        continue;
      }
      updateMin("minScore", Number(face.score));
      updateMin("minReal", Number(face.real));
      updateMin("minLive", Number(face.live));
      updateMin("minSharpness", metrics.sharpness);
      updateMin("brightnessMin", metrics.brightness);
      state.stats.brightnessMax = Math.max(state.stats.brightnessMax ?? metrics.brightness, metrics.brightness);
      updateMin("minFaceWidth", box[2]);
      const values = Array.from(face.embedding);
      if (probeOnly) return { embedding: values, capture: buildCaptureMetadata(state) };
      if (!state.blinks) {
        onStage("Đã khóa đúng người quét. HÃY CHỚP MẮT 1 LẦN ĐỂ BẮT ĐẦU QUÉT");
        await new Promise(resolve => setTimeout(resolve, 60));
        continue;
      }
      if (performance.now() - state.lastCapture < 120) {
        await new Promise(resolve => setTimeout(resolve, 35));
        continue;
      }
      if (state.samples.length && vectorSimilarity(values, state.samples[0]) < 0.82) {
        onStage("Khung hình chưa khớp ổn định với các mẫu trước, đang thử lại.");
        await new Promise(resolve => setTimeout(resolve, 60));
        continue;
      }
      state.samples.push(values);
      state.lastCapture = performance.now();
      onProgress(state.samples.length, FACE_SAMPLE_COUNT);
      onStage(`Đang lấy mẫu khuôn mặt: ${state.samples.length}/${FACE_SAMPLE_COUNT}. Người đi qua lại đã được bỏ qua.`);
      if (state.samples.length === FACE_SAMPLE_COUNT)
        return { embeddings: state.samples, blink_verified: true, capture: buildCaptureMetadata(state) };
      await new Promise(resolve => setTimeout(resolve, 35));
    }
    throw new Error(probeOnly
      ? "Không khóa được đúng người quét. Đứng yên trước camera rồi thử lại."
      : "Không lấy đủ mẫu khuôn mặt. Đứng yên, nhìn thẳng, đủ sáng rồi quét lại.");
  } finally {
    guide?.getContext("2d").clearRect(0, 0, guide.width, guide.height);
  }
};

export const captureFaceSamples = async (video, onProgress = () => {}, isActive = () => true, onStage = () => {}) =>
  runFaceCapture(video, { onProgress, onStage, isActive, probeOnly: false, timeoutMs: 75000 });

const captureFaceProbe = async (video, isActive = () => true, onStage = () => {}) =>
  runFaceCapture(video, { onStage, isActive, probeOnly: true, timeoutMs: 25000 });


const showFaceEnrollConflict = (error, retryLabel = "Quét lại khuôn mặt") => {
  const conflict = error.response?.data?.conflict_employee;
  const code = error.response?.data?.error_code;
  if (!conflict || !["FACE_DUPLICATE_CONFLICT", "FACE_ALREADY_ACTIVATED"].includes(code)) return false;
  document.getElementById("faceEnrollConflict")?.remove();
  const warning = document.createElement("div");
  warning.id = "faceEnrollConflict";
  warning.className = "mt-3 rounded-lg border border-red-400 bg-red-50 p-3 text-sm text-red-900";
  warning.setAttribute("role", "alert");
  const title = document.createElement("p"); title.className = "font-bold"; title.textContent = "KHUÔN MẶT ĐÃ ĐƯỢC KÍCH HOẠT CHO TÀI KHOẢN KHÁC";
  warning.appendChild(title);
  for (const text of [`Mã hồ sơ: ${conflict.employee_code}`, `Họ tên: ${conflict.full_name}`, `Độ khớp: ${conflict.similarity_percent}%`, ...(conflict.matched_samples ? [`Mẫu đạt ngưỡng: ${conflict.matched_samples}`] : []), "Một khuôn mặt chỉ được dùng cho một tài khoản. Không cho phép quét hoặc gán cho tài khoản này."]) {
    const line = document.createElement("p"); line.textContent = text; warning.appendChild(line);
  }
  const retry = document.createElement("button"); retry.type = "button"; retry.textContent = retryLabel;
  retry.className = "mt-2 rounded border px-3 py-2 font-semibold"; retry.addEventListener("click", runFaceEnrollScan);
  warning.appendChild(retry);
  document.getElementById("faceEnrollHint")?.parentElement.appendChild(warning);
  setFaceEnrollStatus("Không cho phép kích hoạt khuôn mặt", error.response.data.message);
  showToast(error.response.data.message, { duration: 6000 });
  return true;
};

let faceEnrollSession = 0;
const activeSession = session => session === faceEnrollSession && Boolean(document.getElementById("modal-faceid-enroll")?.isConnected);
const runFaceEnrollScan = async () => {
  const saveBtn = document.getElementById("faceEnrollSave");
  const startBtn = document.getElementById("faceEnrollStart");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.classList.add("hidden");
    saveBtn.classList.remove("flex");
  }
  if (startBtn) startBtn.disabled = true;
  faceEnrollDescriptor = null;
  document.getElementById("faceEnrollConflict")?.remove();

  const video = document.getElementById("faceEnrollVideo");
  const session = ++faceEnrollSession;
  try {
    if (!faceEnrollStream?.active) throw new Error("Camera chưa sẵn sàng. Vui lòng cho phép camera rồi mở lại cửa sổ.");
    setFaceEnrollStatus("Đang khóa khuôn mặt", "Hệ thống tự tách khuôn mặt để quét, kể cả khi người quét đứng cả thân trong khung hình. Người đi qua lại sẽ bị bỏ qua.");
    const probe = await captureFaceProbe(video, () => session === faceEnrollSession && Boolean(faceEnrollStream?.active), text => setFaceEnrollStatus("Kiểm tra FaceID đã kích hoạt", text));
    if (session !== faceEnrollSession || !document.getElementById("modal-faceid-enroll")?.isConnected) return;
    await api.post("/attendance/check-face-owner", { embedding: probe.embedding, capture: probe.capture });
    if (session !== faceEnrollSession || !document.getElementById("modal-faceid-enroll")?.isConnected) return;
    if (startBtn) startBtn.querySelector("span:last-child").textContent = "Bắt đầu quét";
    setFaceEnrollStatus("Đang lấy 5 mẫu khuôn mặt...", "Giữ nguyên người đã khóa, nhìn thẳng và chớp mắt khi được yêu cầu.");
    faceEnrollDescriptor = await captureFaceSamples(video, (count, total) => setFaceEnrollStatus(`Đang quét mẫu: ${count}/${total} (${Math.round(count / total * 100)}%)`), () => session === faceEnrollSession && Boolean(faceEnrollStream?.active), text => setFaceEnrollStatus(text));
    if (!activeSession(session)) return;
    setFaceEnrollStatus("Đã lấy đủ 5 mẫu khuôn mặt", "Bấm Lưu mẫu khuôn mặt để cập nhật FaceID. Hệ thống sẽ kiểm tra trùng với nhân viên khác.");
    if (saveBtn) { saveBtn.disabled = false; saveBtn.classList.remove("hidden"); saveBtn.classList.add("flex"); }
  } catch (error) {
    if (session !== faceEnrollSession) return;
    if (showFaceEnrollConflict(error, "Thử khuôn mặt khác")) {
      if (startBtn) startBtn.querySelector("span:last-child").textContent = "Thử khuôn mặt khác";
      return;
    }
    setFaceEnrollStatus(error.message, "Không lưu mẫu khi camera hoặc nhận diện chưa đạt yêu cầu.");
  } finally { if (startBtn && session === faceEnrollSession) startBtn.disabled = false; }
};

const enableFaceEnrollCamera = async () => {
  const video = document.getElementById("faceEnrollVideo");
  const fallback = document.getElementById("faceEnrollFallback");
  const cameraError = document.getElementById("faceEnrollCameraError");
  const startBtn = document.getElementById("faceEnrollStart");
  const session = faceEnrollSession;
  stopFaceEnrollStream();
  fallback?.classList.add("hidden");
  video?.classList.remove("hidden");
  setFaceEnrollStatus("Đang mở camera...", "Cho phép trình duyệt sử dụng webcam nếu được hỏi.");
  if (startBtn) startBtn.disabled = true;
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera cần trang HTTPS hoặc localhost và trình duyệt hỗ trợ webcam.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    if (session !== faceEnrollSession || !document.getElementById("modal-faceid-enroll")?.isConnected) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    faceEnrollStream = stream;
    if (!video) throw new Error("Không tìm thấy vùng hiển thị camera.");
    video.srcObject = stream;
    await video.play();
    if (session !== faceEnrollSession) return;
    setFaceEnrollStatus("Camera sẵn sàng", "Nhấn Bắt đầu quét để thu nhận mẫu khuôn mặt.");
    if (startBtn) { startBtn.disabled = false; startBtn.querySelector("span:last-child").textContent = "Bắt đầu quét"; }
  } catch (error) {
    if (session !== faceEnrollSession) return;
    stopFaceEnrollStream();
    const messages = {
      NotAllowedError: "Trình duyệt đang chặn quyền camera. Hãy cho phép camera trong biểu tượng quyền trang web rồi thử lại.",
      NotFoundError: "Không tìm thấy webcam được kết nối với thiết bị.",
      NotReadableError: "Webcam đang được ứng dụng khác sử dụng hoặc không thể khởi động.",
      OverconstrainedError: "Webcam không hỗ trợ cấu hình yêu cầu. Hãy thử lại với camera mặc định.",
      SecurityError: "Camera chỉ hoạt động trên HTTPS hoặc localhost.",
    };
    const message = messages[error.name] || error.message || "Không thể mở webcam. Kiểm tra kết nối và quyền camera rồi thử lại.";
    if (cameraError) cameraError.textContent = message;
    fallback?.classList.remove("hidden");
    video?.classList.add("hidden");
    setFaceEnrollStatus("Không thể bật camera", message);
    if (startBtn) { startBtn.disabled = false; startBtn.querySelector("span:last-child").textContent = "Thử bật camera lại"; }
  }
};

export const openFaceEnrollModal = async () => {
  const modal = document.getElementById("modal-faceid-enroll");
  if (!modal) return;

  modal.classList.remove("hidden");
  modal.classList.add("flex");
  faceEnrollDescriptor = null;
  const saveBtn = document.getElementById("faceEnrollSave");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.classList.add("hidden");
    saveBtn.classList.remove("flex");
  }
  const startBtn = document.getElementById("faceEnrollStart");
  if (startBtn) { startBtn.disabled = false; startBtn.querySelector("span:last-child").textContent = "Xác nhận mật khẩu"; }
  document.getElementById("faceEnrollConflict")?.remove();

  document.getElementById("faceEnrollPasswordStep")?.classList.remove("hidden");
  const cameraStep = document.getElementById("faceEnrollCameraStep");
  cameraStep?.classList.add("hidden");
  cameraStep?.classList.remove("flex");
  document.getElementById("faceEnrollCameraError").textContent = "";
  const video = document.getElementById("faceEnrollVideo");
  const fallback = document.getElementById("faceEnrollFallback");
  fallback?.classList.add("hidden");
  video?.classList.remove("hidden");
  setFaceEnrollStatus("Xác nhận mật khẩu để tiếp tục", "Camera sẽ chỉ được bật sau khi mật khẩu được xác nhận.");

  stopFaceEnrollStream();
  document.getElementById("faceEnrollPassword").value = "";
  ++faceEnrollSession;
};

const saveFaceDescriptor = async () => {
  if (!faceEnrollDescriptor) {
    showToast("Chưa có mẫu khuôn mặt, vui lòng quét lại.");
    return;
  }
  const saveBtn = document.getElementById("faceEnrollSave");
  const original = saveBtn?.innerHTML;
  try {
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = "<span>Đang lưu...</span>";
    }
    const response = await api.post("/attendance/register-face", {
      ...faceEnrollDescriptor,
      current_password: document.getElementById("faceEnrollPassword")?.value,
    });
    const updated = updateCurrentUser({
      has_face_descriptor: true,
    });
    closeFaceEnrollModal();
    showToast("Cập nhật mẫu khuôn mặt FaceID thành công.");
    const btn = document.getElementById("btnFaceEnrollHeader");
    if (btn) {
      btn.classList.add("hidden");
      btn.classList.remove("flex");
    }
    document.getElementById("hrmFaceMissingToast")?.remove();
    if (updated) setupHeaderUser(updated);
    window.dispatchEvent(new CustomEvent("hrm:face-updated", { detail: updated }));
  } catch (error) {
    if (!showFaceEnrollConflict(error)) {
      showToast(error.response?.data?.message || "Không thể lưu mẫu khuôn mặt, vui lòng thử lại.");
    }
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      if (original) saveBtn.innerHTML = original;
    }
  }
};

export const bindFaceEnrollModal = () => {
  const modal = document.getElementById("modal-faceid-enroll");
  if (!modal || modal.dataset.bound === "1") return;
  modal.dataset.bound = "1";

  document.getElementById("faceEnrollClose")?.addEventListener("click", closeFaceEnrollModal);
  document.getElementById("faceEnrollCancel")?.addEventListener("click", closeFaceEnrollModal);
  document.getElementById("faceEnrollStart")?.addEventListener("click", async () => {
    const password = document.getElementById("faceEnrollPassword").value;
    if (!password) { setFaceEnrollStatus("Cần nhập mật khẩu", "Nhập mật khẩu tài khoản để xác nhận FaceID."); document.getElementById("faceEnrollPassword").focus(); return; }
    const cameraStep = document.getElementById("faceEnrollCameraStep");
    if (cameraStep.classList.contains("hidden")) {
      const startBtn = document.getElementById("faceEnrollStart");
      const session = faceEnrollSession;
      startBtn.disabled = true;
      try {
        await api.post("/attendance/verify-face-password", { current_password: password });
        if (session !== faceEnrollSession) return;
        document.getElementById("faceEnrollPasswordStep").classList.add("hidden");
        cameraStep.classList.remove("hidden"); cameraStep.classList.add("flex");
        startBtn.disabled = false;
        startBtn.querySelector("span:last-child").textContent = "Bật camera";
        setFaceEnrollStatus("Đã xác nhận mật khẩu", "Bấm Bật camera để cho phép webcam và tiếp tục đăng ký.");
      } catch (error) {
        if (session !== faceEnrollSession) return;
        startBtn.disabled = false;
        setFaceEnrollStatus(error.response?.data?.message || "Không xác nhận được mật khẩu", "Kiểm tra mật khẩu tài khoản rồi thử lại.");
      }
      return;
    }
    if (!faceEnrollStream?.active) { enableFaceEnrollCamera(); return; }
    runFaceEnrollScan();
  });
  document.getElementById("faceEnrollSave")?.addEventListener("click", saveFaceDescriptor);
  document.getElementById("faceEnrollPassword")?.addEventListener("keydown", event => {
    if (event.key === "Enter") document.getElementById("faceEnrollStart")?.click();
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeFaceEnrollModal();
  });
};

const promptFaceEnrollmentIfMissing = (user) => {
  const headerBtn = document.getElementById("btnFaceEnrollHeader");
  const needsFace = Boolean(user?.employee_id) && !user?.has_face_descriptor;

  if (headerBtn) {
    if (needsFace) {
      headerBtn.classList.remove("hidden");
      headerBtn.classList.add("flex");
      if (headerBtn.dataset.bound !== "1") {
        headerBtn.dataset.bound = "1";
        headerBtn.addEventListener("click", openFaceEnrollModal);
      }
    } else {
      headerBtn.classList.add("hidden");
      headerBtn.classList.remove("flex");
    }
  }

  bindFaceEnrollModal();

  if (!needsFace) {
    document.getElementById("hrmFaceMissingToast")?.remove();
    return;
  }

  showToast(
    "Tài khoản chưa kích hoạt điểm danh khuôn mặt. Bấm vào đây để đăng ký FaceID.",
    {
      id: "hrmFaceMissingToast",
      duration: 6000,
      className:
        "fixed bottom-5 right-5 z-[100] max-w-sm rounded-lg bg-amber-500 text-white shadow-lg px-4 py-3 font-body-sm text-body-sm flex items-start gap-2",
    },
  );
  const toast = document.getElementById("hrmFaceMissingToast");
  if (toast) {
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.tabIndex = 0;
    toast.style.cursor = "pointer";
    toast.title = "Mở đăng ký FaceID";
    toast.addEventListener("click", openFaceEnrollModal, { once: true });
    toast.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") openFaceEnrollModal();
    });
  }
};

const bindActions = () => {
    document.getElementById("logoutBtn")?.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("hrm:logout-request"));
    });

  document.querySelectorAll(".hrm-action-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.getAttribute("data-action") || "thao tác";
      showToast(`Đã ghi nhận yêu cầu: ${action}`);
    });
  });
};

export const setupShell = (user = getCurrentUser()) => {
  if (!user) {
    logout();
    return;
  }

  document.getElementById("hrmUserContext")?.remove();
  document.getElementById("hrmActionBar")?.remove();
  const mountedFaceModal = document.querySelector("#app #modal-faceid-enroll");
  if (mountedFaceModal) {
    document.querySelectorAll("body > #modal-faceid-enroll").forEach(modal => modal.remove());
    document.body.appendChild(mountedFaceModal);
  }

  setupHeaderUser(user);
  ensurePermissionsNav(user);
  applyNavPermissions(user);
  bindActions();
  promptFaceEnrollmentIfMissing(user);
};

export const initHome = (user = getCurrentUser()) => {
  if (!user) {
    logout();
    return;
  }

  const workspace = document.getElementById("launcherWorkspace");
  if (!workspace) return;

  setupShell(user);
  applyCategoryActions(user);
  applyCardPermissions(user);
};
