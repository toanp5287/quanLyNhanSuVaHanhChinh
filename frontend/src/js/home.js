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

const human = new Human({
  modelBasePath: "https://cdn.jsdelivr.net/npm/@vladmandic/human/models/",
  cacheSensitivity: 0,
  face: { enabled: true, detector: { maxDetected: 2, rotation: true }, mesh: { enabled: true },
    iris: { enabled: true }, description: { enabled: true, skipFrames: 0, skipTime: 0 }, antispoof: { enabled: true, skipFrames: 0, skipTime: 0 }, liveness: { enabled: true, skipFrames: 0, skipTime: 0 },
    emotion: { enabled: false } },
  body: { enabled: false }, hand: { enabled: false }, object: { enabled: false }, gesture: { enabled: true },
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
  if (!faceModelPromise) faceModelPromise = (async () => { await human.load(); await human.warmup(); })().catch(error => { faceModelPromise = null; throw error; });
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

const faceBrightness = (video, box) => {
  if (!video.videoWidth || !video.videoHeight) return 0;
  const canvas = document.createElement("canvas");
  canvas.width = 32; canvas.height = 32;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(video, box[0], box[1], box[2], box[3], 0, 0, 32, 32);
  const pixels = context.getImageData(0, 0, 32, 32).data;
  let luminance = 0;
  for (let index = 0; index < pixels.length; index += 4) luminance += 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2];
  return luminance / (pixels.length / 4);
};

export const captureFaceSamples = async (video, onProgress = () => {}, isActive = () => true, onStage = () => {}) => {
  await ensureFaceModels();
  const frame = video.parentElement;
  frame.style.position = "relative";
  const overlay = document.createElement("div");
  overlay.className = "absolute inset-x-2 top-1/2 z-20 rounded-lg bg-black/80 px-3 py-3 text-center text-sm font-semibold text-white pointer-events-none";
  const instruction = document.createElement("p");
  const progress = document.createElement("progress");
  const faceOutline = document.createElement("div");
  faceOutline.className = "absolute z-10 border-2 border-emerald-400 rounded-lg pointer-events-none hidden";
  faceOutline.style.transform = "scaleX(-1)";
  progress.max = 5; progress.value = 0; progress.className = "mt-2 w-full h-2";
  overlay.append(instruction, progress); frame.append(faceOutline, overlay);
  const stageMessage = text => { instruction.textContent = text; onStage(text); };
  try {
  const samples = [];
  let stage = "ALIGN_FACE", stable = 0, lastCapture = 0, previousBox = null;
  const blinkState = {};
  const deadline = performance.now() + 60000;
  stageMessage("Căn chỉnh khuôn mặt: nhìn thẳng, đủ sáng và giữ yên.");
  while (performance.now() < deadline && samples.length < 5) {
    if (!isActive()) throw new Error("Đã dừng quét khuôn mặt.");
    const result = await human.detect(video);
    if (!isActive()) throw new Error("Đã dừng quét khuôn mặt.");
    const face = result.face?.length === 1 ? result.face[0] : null;
    const angle = face?.rotation?.angle;
    const center = angle && Math.abs(angle.yaw) < 0.25 && Math.abs(angle.pitch) < 0.25 && Math.abs(angle.roll) < 0.25;
    if (face?.box && video.videoWidth && video.videoHeight) {
      const [x, y, width, height] = face.box;
      const bounds = video.getBoundingClientRect();
      const scale = Math.max(bounds.width / video.videoWidth, bounds.height / video.videoHeight);
      const left = (bounds.width - video.videoWidth * scale) / 2 + x * scale;
      const top = (bounds.height - video.videoHeight * scale) / 2 + y * scale;
      Object.assign(faceOutline.style, { display: "block", left: `${left}px`, top: `${top}px`, width: `${width * scale}px`, height: `${height * scale}px` });
    } else faceOutline.style.display = "none";
    const box = face?.box;
    const inFrame = box && box[0] >= 0 && box[1] >= 0 && box[0] + box[2] <= video.videoWidth && box[1] + box[3] <= video.videoHeight;
    const brightness = face && inFrame ? faceBrightness(video, box) : 0;
    const quality = face && center && inFrame && face.box[2] >= 130 && face.score >= 0.80 && face.real >= 0.62 && face.live >= 0.62 && brightness >= 45;
    if (!quality) {
      stage = "ALIGN_FACE"; stable = 0; samples.length = 0; previousBox = null;
      blinkState.open = false; blinkState.closedAt = null;
      progress.value = 0;
      stageMessage(result.face?.length > 1 ? "Chỉ một người đứng trước camera." : !face ? "Đưa khuôn mặt vào giữa khung hình." : !inFrame ? "Đưa toàn bộ khuôn mặt vào trong khung hình." : brightness < 45 ? "Khuôn mặt thiếu sáng. Hãy hướng về phía nguồn sáng hoặc tăng ánh sáng." : face.box[2] < 130 ? "Đến gần camera hơn để khuôn mặt rõ nét." : "Nhìn thẳng vào camera và giữ khuôn mặt ổn định.");
    } else if (stage === "ALIGN_FACE") {
      const moved = previousBox && Math.hypot(face.box[0] - previousBox[0], face.box[1] - previousBox[1]) > face.box[2] * 0.12;
      stable = moved ? 1 : stable + 1; previousBox = [...face.box];
      if (stable >= 4) { stage = "WAIT_FOR_BLINK"; stageMessage("👁️ HÃY CHỚP MẮT 1 LẦN ĐỂ BẮT ĐẦU QUÉT KHUÔN MẶT"); }
    } else if (stage === "WAIT_FOR_BLINK") {
      if (detectEyeBlink(face, result.gesture, blinkState)) { stage = "CAPTURE_5_SAMPLES"; stageMessage("✅ Đã xác thực chớp mắt! Đang thu thập 5 mẫu sinh trắc học..."); }
    } else if (!center || !inFrame || brightness < 45 || face.score < 0.82 || face.real < 0.62 || face.live < 0.62) {
      stage = "ALIGN_FACE"; stable = 0; samples.length = 0; previousBox = null;
      blinkState.open = false; blinkState.closedAt = null;
      progress.value = 0;
      stageMessage("Mất khuôn mặt rõ trong lúc quét. Nhìn thẳng, giữ yên để quét lại từ đầu.");
    } else if (eyeRatio(face) > 0.22 && face.embedding?.length && performance.now() - lastCapture >= 160) {
      const values = Array.from(face.embedding);
      if (samples.length && vectorSimilarity(values, samples[0]) < 0.83) throw new Error("Mẫu khuôn mặt không ổn định. Vui lòng giữ thẳng mặt và quét lại!");
      samples.push(values); lastCapture = performance.now(); progress.value = samples.length;
      instruction.textContent = `Đang quét mẫu: ${samples.length}/5 (${samples.length * 20}%)`;
      onProgress(samples.length, 5);
    }
    if (samples.length < 5) await new Promise(resolve => setTimeout(resolve, 60));
  }
  if (samples.length < 5) throw new Error("Chưa nhận diện rõ khuôn mặt. Đứng gần hơn, nhìn thẳng và tăng ánh sáng rồi quét lại.");
  return { embeddings: samples, blink_verified: true };
  } finally { overlay.remove(); faceOutline.remove(); }
};

const captureFaceProbe = async (video, isActive = () => true, onStage = () => {}) => {
  await ensureFaceModels();
  const deadline = performance.now() + 12000;
  onStage("Nhìn thẳng vào camera để kiểm tra khuôn mặt đã được kích hoạt.");
  while (performance.now() < deadline) {
    if (!isActive()) throw new Error("Đã dừng kiểm tra khuôn mặt.");
    const result = await human.detect(video);
    if (!isActive()) throw new Error("Đã dừng kiểm tra khuôn mặt.");
    const face = result.face?.length === 1 ? result.face[0] : null;
    const box = face?.box;
    const angle = face?.rotation?.angle;
    const center = angle && Math.abs(angle.yaw) < 0.25 && Math.abs(angle.pitch) < 0.25 && Math.abs(angle.roll) < 0.25;
    const inFrame = box && box[0] >= 0 && box[1] >= 0 && box[0] + box[2] <= video.videoWidth && box[1] + box[3] <= video.videoHeight;
    const brightness = face && inFrame ? faceBrightness(video, box) : 0;
    if (face && center && inFrame && box[2] >= 130 && face.score >= 0.80 && face.real >= 0.62 && face.live >= 0.62 && brightness >= 45 && face.embedding?.length) {
      onStage("Đã thấy khuôn mặt rõ. Đang kiểm tra tài khoản đã kích hoạt.");
      return Array.from(face.embedding);
    }
    onStage(result.face?.length > 1 ? "Chỉ một người đứng trước camera." : !face ? "Đưa khuôn mặt vào giữa khung hình." : !inFrame ? "Đưa toàn bộ khuôn mặt vào trong khung hình." : brightness < 45 ? "Khuôn mặt thiếu sáng. Tăng ánh sáng rồi thử lại." : "Nhìn thẳng vào camera và giữ yên.");
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  throw new Error("Không kiểm tra được khuôn mặt. Hãy nhìn thẳng, đủ sáng và thử lại.");
};

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
    setFaceEnrollStatus("Đang kiểm tra khuôn mặt đã đăng ký", "Chỉ một người trước camera. Đang xác nhận khuôn mặt chưa được dùng cho tài khoản khác.");
    const embedding = await captureFaceProbe(video, () => session === faceEnrollSession && Boolean(faceEnrollStream?.active), text => setFaceEnrollStatus("Kiểm tra FaceID đã kích hoạt", text));
    if (session !== faceEnrollSession || !document.getElementById("modal-faceid-enroll")?.isConnected) return;
    await api.post("/attendance/check-face-owner", { embedding });
    if (session !== faceEnrollSession || !document.getElementById("modal-faceid-enroll")?.isConnected) return;
    if (startBtn) startBtn.querySelector("span:last-child").textContent = "Bắt đầu quét";
    setFaceEnrollStatus("Đang lấy 5 mẫu khuôn mặt...", "Chỉ một người trong khung hình, nhìn thẳng và giữ yên.");
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
