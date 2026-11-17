import {
  getCurrentUser,
  hasAnyPermission,
  hasPermission,
  logout,
  updateCurrentUser,
} from "../services/auth.service.js";
import api from "../services/api.js";

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

const FACE_MODEL_URL =
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/";
let faceModelsLoaded = false;
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
  if (!window.faceapi) throw new Error("Không tải được thư viện FaceID. Kiểm tra kết nối mạng và thử lại.");
  if (faceModelsLoaded) return;
  await Promise.all([
    window.faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
    window.faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_MODEL_URL),
    window.faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL),
  ]);
  faceModelsLoaded = true;
};

const detectFaceDescriptor = async (video) => {
  if (!video || video.readyState < 2) return null;
  const options = new window.faceapi.TinyFaceDetectorOptions({
    inputSize: 224,
    scoreThreshold: 0.5,
  });
  const results = await window.faceapi
    .detectAllFaces(video, options)
    .withFaceLandmarks(true)
    .withFaceDescriptors();
  if (!Array.isArray(results) || !results.length) return null;
  if (results.length > 1) throw new Error("Có nhiều người trong khung hình. Chỉ một người đứng trước camera.");
  const result = results[0];
  if (!result || !result.detection || result.detection.score < 0.8 || result.detection.box.width < video.videoWidth * 0.18 || result.detection.box.height < video.videoHeight * 0.2) return null;
  return result.descriptor || null;
};

export const captureFaceSamples = async (video, onProgress = () => {}, isActive = () => true) => {
  await ensureFaceModels();
  const samples = [];
  for (let attempt = 0; attempt < 30 && samples.length < 5; attempt++) {
    if (!isActive()) throw new Error("Đã dừng quét khuôn mặt.");
    const descriptor = await detectFaceDescriptor(video);
    if (!isActive()) throw new Error("Đã dừng quét khuôn mặt.");
    if (descriptor) {
      const values = Array.from(descriptor);
      if (samples.length && window.faceapi.euclideanDistance(values, samples[0]) >= 0.32) throw new Error("Khuôn mặt thay đổi trong lúc quét. Vui lòng quét lại với một người duy nhất.");
      samples.push(values);
      onProgress(samples.length, 5);
    }
    if (samples.length < 5) await new Promise(resolve => setTimeout(resolve, 220));
  }
  if (samples.length < 5) throw new Error("Chưa nhận diện rõ khuôn mặt. Đứng gần hơn, nhìn thẳng và tăng ánh sáng rồi quét lại.");
  return samples;
};

let faceEnrollSession = 0;
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

  const video = document.getElementById("faceEnrollVideo");
  const session = ++faceEnrollSession;
  try {
    if (!faceEnrollStream?.active) throw new Error("Camera chưa sẵn sàng. Vui lòng cho phép camera rồi mở lại cửa sổ.");
    setFaceEnrollStatus("Đang lấy 5 mẫu khuôn mặt...", "Chỉ một người trong khung hình, nhìn thẳng và giữ yên.");
    faceEnrollDescriptor = await captureFaceSamples(video, (count, total) => setFaceEnrollStatus(`Đang lấy mẫu khuôn mặt ${count}/${total}...`), () => session === faceEnrollSession && Boolean(faceEnrollStream?.active));
    setFaceEnrollStatus("Đã lấy đủ 5 mẫu khuôn mặt", "Nhập mật khẩu tài khoản để xác nhận lưu mẫu. Hệ thống sẽ kiểm tra FaceID trùng với nhân viên khác.");
    if (saveBtn) { saveBtn.disabled = false; saveBtn.classList.remove("hidden"); saveBtn.classList.add("flex"); }
  } catch (error) {
    if (session === faceEnrollSession) setFaceEnrollStatus(error.message, "Không lưu mẫu khi camera hoặc nhận diện chưa đạt yêu cầu.");
  } finally { if (startBtn && session === faceEnrollSession) startBtn.disabled = false; }
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
  if (startBtn) startBtn.disabled = false;

  const video = document.getElementById("faceEnrollVideo");
  const fallback = document.getElementById("faceEnrollFallback");
  fallback?.classList.add("hidden");
  video?.classList.remove("hidden");
  setFaceEnrollStatus("Chuẩn bị quét khuôn mặt...", "Đang yêu cầu quyền truy cập camera.");

  stopFaceEnrollStream();
  const session = ++faceEnrollSession;
  let password = document.getElementById("faceEnrollPassword");
  if (!password) {
    const label = document.createElement("label");
    label.className = "block mt-3 text-sm";
    label.textContent = "Mật khẩu tài khoản để xác nhận FaceID";
    password = document.createElement("input");
    password.id = "faceEnrollPassword"; password.type = "password"; password.autocomplete = "current-password";
    password.className = "block w-full border rounded px-3 py-2 mt-1";
    label.appendChild(password);
    document.getElementById("faceEnrollHint")?.parentElement.appendChild(label);
  }
  password.value = "";
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("no-media");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
    if (session !== faceEnrollSession || !modal.isConnected) { stream.getTracks().forEach(track => track.stop()); return; }
    faceEnrollStream = stream;
    if (video) {
      video.srcObject = faceEnrollStream;
      await video.play();
    }
    setFaceEnrollStatus("Camera sẵn sàng", "Nhấn Bắt đầu quét để thu nhận mẫu khuôn mặt.");
  } catch {
    if (session !== faceEnrollSession) return;
    stopFaceEnrollStream();
    fallback?.classList.remove("hidden");
    video?.classList.add("hidden");
    setFaceEnrollStatus(
      "Không truy cập được Webcam",
      "Cần webcam thật để đăng ký FaceID. Cho phép camera trong trình duyệt và mở lại cửa sổ.",
    );
    if (startBtn) startBtn.disabled = true;
  }
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
    await api.put("/my-profile/face-descriptor", {
      face_samples: faceEnrollDescriptor,
      current_password: document.getElementById("faceEnrollPassword")?.value,
    });
    const average = faceEnrollDescriptor[0].map((_, index) => faceEnrollDescriptor.reduce((sum, sample) => sum + sample[index], 0) / faceEnrollDescriptor.length);
    const updated = updateCurrentUser({
      face_descriptor: JSON.stringify(average),
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
    showToast(
      error.response?.data?.message || "Không thể lưu mẫu khuôn mặt, vui lòng thử lại.",
    );
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
  document.getElementById("faceEnrollStart")?.addEventListener("click", () => {
    runFaceEnrollScan();
  });
  document.getElementById("faceEnrollSave")?.addEventListener("click", saveFaceDescriptor);
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

  if (!needsFace) return;
  if (sessionStorage.getItem("hrm_face_prompted") === "1") return;
  sessionStorage.setItem("hrm_face_prompted", "1");

  showToast(
    "Tài khoản của bạn chưa có mẫu khuôn mặt FaceID. Vui lòng bấm \"Cập nhật khuôn mặt\" để đăng ký.",
    {
      id: "hrmFaceMissingToast",
      duration: 6000,
      className:
        "fixed bottom-5 right-5 z-[100] max-w-sm rounded-lg bg-amber-500 text-white shadow-lg px-4 py-3 font-body-sm text-body-sm flex items-start gap-2",
    },
  );
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
