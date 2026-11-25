import api from "../services/api.js";
import informationHtml from "../pages/information.html?raw";

const SCOPE_LABELS = {
  COMPANY: "Toàn công ty",
  DEPARTMENT: "Phòng ban",
  INDIVIDUAL: "Cá nhân",
  ROLE: "Theo vai trò",
};

const PRIORITY_LABELS = {
  CRITICAL: "Khẩn cấp",
  HIGH: "Quan trọng",
  MEDIUM: "Trung bình",
  LOW: "Thông tin chung",
};

const PRIORITY_STYLES = {
  CRITICAL: "bg-error text-white",
  HIGH: "bg-tertiary text-on-tertiary",
  MEDIUM: "bg-secondary text-on-secondary",
  LOW: "bg-surface-container-high text-on-surface-variant",
};

const TYPE_META = {
  BULLETIN: { icon: "newspaper", label: "Bản tin" },
  POLICY: { icon: "gavel", label: "Quy chế" },
  HR: { icon: "badge", label: "Nhân sự" },
  SYSTEM: { icon: "bolt", label: "Hệ thống" },
  LEAVE: { icon: "event_available", label: "Nghỉ phép" },
  PAYROLL: { icon: "payments", label: "Lương" },
};

const FALLBACK_BULLETINS = [
  {
    id: "demo-company",
    title: "Cập nhật nội quy làm việc hybrid từ tháng 06/2026",
    message:
      "Ban Giám đốc phê duyệt chế độ 2 ngày WFH/tuần kèm xác thực GPS di động, áp dụng cho toàn thể nhân sự.",
    type: "BULLETIN",
    audience_scope: "COMPANY",
    priority: "HIGH",
    created_at: "2026-05-15T08:30:00",
    is_read: false,
  },
  {
    id: "demo-department",
    title: "Kế hoạch sinh hoạt định kỳ của phòng ban",
    message:
      "Thông báo dành riêng cho nhân sự thuộc phòng ban: lịch họp, báo cáo tiến độ và hoạt động nội bộ tháng này.",
    type: "BULLETIN",
    audience_scope: "DEPARTMENT",
    priority: "MEDIUM",
    created_at: "2026-05-12T09:15:00",
    is_read: false,
  },
  {
    id: "demo-individual",
    title: "Kiểm tra lại thông tin hồ sơ nhân sự",
    message:
      "Đây là thông báo cá nhân gửi trực tiếp đến tài khoản của bạn. Vui lòng rà soát thông tin trước ngày 30/05/2026.",
    type: "HR",
    audience_scope: "INDIVIDUAL",
    priority: "LOW",
    created_at: "2026-05-10T14:00:00",
    is_read: true,
  },
];

const CHAPTERS = [
  {
    title: "CHƯƠNG I: Thời giờ làm việc & Nghỉ ngơi",
    range: "Điều 1 - 8",
    body: "08 giờ/ngày, 40 giờ/tuần (Thứ Hai - Thứ Sáu). Check-in linh hoạt 08:00 - 08:30. Nghỉ giữa ca 12:00 - 13:00.",
  },
  {
    title: "CHƯƠNG II: Trật tự nơi làm việc & Thẻ nhận diện",
    range: "Điều 9 - 15",
    body: "Đeo thẻ nhân viên gắn chip IoT RFID, trang phục lịch sự, ngày thứ Sáu Smart-Casual, không quấy rối hay phân biệt đối xử.",
  },
  {
    title: "CHƯƠNG III: An toàn, Vệ sinh lao động & PCCC",
    range: "Điều 16 - 22",
    body: "Cấm hút thuốc và chất kích thích trong tòa nhà, tuân thủ chỉ dẫn PCCC, khám sức khỏe định kỳ hàng năm do công ty chi trả.",
  },
  {
    title: "CHƯƠNG IV: Bí mật kinh doanh & ISO 27001",
    range: "Điều 23 - 30",
    body: "Bảo mật mã nguồn, dữ liệu khách hàng và mức lương cá nhân; không dùng USB chưa kiểm duyệt; bắt buộc 2FA trên toàn bộ tài khoản nội bộ.",
  },
  {
    title: "CHƯƠNG V: Kỷ luật lao động & Trách nhiệm vật chất",
    range: "Điều 31 - 42",
    body: "Áp dụng 4 hình thức kỷ luật theo Điều 124 BLLĐ 2019; bồi thường trách nhiệm vật chất theo trình tự giám định của Hội đồng kỷ luật và Công đoàn.",
  },
];

const DOCUMENTS = [
  {
    id: "QC-2026-01",
    code: "#QC-2026-01",
    badge: "Phê chuẩn Sở LĐ-TB&XH",
    version: "Bản v4.2",
    title: "Nội quy Lao động Doanh nghiệp số 01/2026/NQLĐ-HRM",
    summary:
      "Bộ quy tắc ứng xử, kỷ luật lao động, thời giờ làm việc, an toàn vệ sinh công nghiệp và trách nhiệm vật chất.",
    footer: "98.2% nhân sự đã ký • Hiệu lực: 01/06/2026",
    detailTitle: "NỘI QUY LAO ĐỘNG HỢP NHẤT DOANH NGHIỆP NĂM 2026",
    detailMeta: "Số hiệu: 01/2026/NQLĐ-HRM • Cơ quan ban hành: Ban Điều Hành • Người ký: Tổng Giám Đốc",
    verification:
      "Nguyễn Tuấn Anh (NV-7719) đã ký cam kết điện tử ngày 12/05/2026 lúc 09:15:20 • Mã xác thực #SIGN-883921",
    chapters: CHAPTERS,
    file: "Noi_Quy_Lao_Dong_2026_Signed_Stamp.pdf",
    fileMeta: "Bản scan có dấu đỏ • 3.8 MB • Tải lên 10/05/2026",
  },
  {
    id: "CS-2026-08",
    code: "#CS-2026-08",
    badge: "Nghị định 13/2023/NĐ-CP",
    title: "Chính sách Bảo vệ Dữ liệu Cá nhân & An toàn Thông tin",
    summary:
      "Quy định quyền riêng tư nhân sự, bảo mật thông tin định danh nội bộ, khách hàng và hệ thống máy chủ HRM.",
    footer: "Bắt buộc 100% tuân thủ • Khối CNTT & Toàn công ty",
    detailTitle: "CHÍNH SÁCH BẢO VỆ DỮ LIỆU CÁ NHÂN & AN TOÀN THÔNG TIN",
    detailMeta: "Số hiệu: 08/2026/CS-BVDL • Cơ quan ban hành: Ban CNTT • Áp dụng: Toàn công ty",
    file: "Chinh_Sach_Bao_Mat_2026.pdf",
    fileMeta: "Bản phê duyệt • 2.1 MB • Tải lên 28/04/2026",
  },
  {
    id: "QD-2026-14",
    code: "#QD-2026-14",
    badge: "Mới ban hành",
    title: "Quy định Hạn mức Làm thêm giờ (OT) & Phụ cấp ca đêm 2026",
    summary:
      "Điều chỉnh định mức giờ làm thêm tối đa 40h/tháng, hệ số lương 150% - 200% - 300% theo quy định pháp luật.",
    footer: "Ban C&B & Khối Vận hành • 12/05/2026",
    detailTitle: "QUY ĐỊNH HẠN MỨC LÀM THÊM GIỜ & PHỤ CẤP CA ĐÊM 2026",
    detailMeta: "Số hiệu: 14/2026/QD-CB • Cơ quan ban hành: Ban C&B • Hiệu lực: 01/06/2026",
    file: "Quy_Dinh_OT_2026.pdf",
    fileMeta: "Bản ký duyệt • 1.4 MB • Tải lên 12/05/2026",
  },
  {
    id: "TB-2026-22",
    code: "#TB-2026-22",
    badge: "Văn hóa & Công đoàn",
    title: "Thông báo Lịch nghỉ Lễ & Hoạt động Team Building Hè 2026",
    summary:
      "Kế hoạch nghỉ mát thường niên tại Đà Nẵng, thời gian đăng ký phòng và danh sách nhân sự ứng trực hệ thống.",
    footer: "188/248 xác nhận tham gia • 08/05/2026",
    detailTitle: "THÔNG BÁO LỊCH NGHỈ LỄ & TEAM BUILDING HÈ 2026",
    detailMeta: "Số hiệu: 22/2026/TB-CĐ • Cơ quan ban hành: Công đoàn • Địa điểm: Đà Nẵng",
    file: "Thong_Bao_Team_Building_2026.pdf",
    fileMeta: "Thông báo chính thức • 980 KB • Tải lên 08/05/2026",
  },
  {
    id: "QC-2025-05",
    code: "#QC-2025-05",
    badge: "Hành chính - IT",
    title: "Quy chế Sử dụng Tài sản, Thiết bị Laptop & Thẻ định danh IoT",
    summary:
      "Hướng dẫn bàn giao tài sản, kiểm kê thiết bị bán niên và quy định bồi hoàn khi làm thất lạc thiết bị làm việc.",
    footer: "Cập nhật kỳ Q1/2026 • v2.1",
    detailTitle: "QUY CHẾ SỬ DỤNG TÀI SẢN & THIẾT BỊ ĐỊNH DANH IoT",
    detailMeta: "Số hiệu: 05/2025/QC-HC • Cơ quan ban hành: Ban Hành chính • Cập nhật: Q1/2026",
    file: "Quy_Che_Tai_San_IoT_v2.1.pdf",
    fileMeta: "Bản cập nhật • 1.8 MB • Tải lên 15/01/2026",
  },
];

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

const getScope = (item) => {
  const raw = String(item.audience_scope || item.payload?.scope || "").toUpperCase();
  if (SCOPE_LABELS[raw]) return raw;
  const legacy = String(item.payload?.target_type || "").toUpperCase();
  return legacy === "COMPANY" || legacy === "DEPARTMENT" ? legacy : "INDIVIDUAL";
};

const getPriority = (item) => {
  const raw = String(item.priority || "LOW").toUpperCase();
  return PRIORITY_LABELS[raw] ? raw : "LOW";
};

const getType = (item) => {
  const raw = String(item.type || "BULLETIN").toUpperCase();
  return TYPE_META[raw] || TYPE_META.BULLETIN;
};

let workspace = null;
let bulletins = [];
let selectedDocumentId = DOCUMENTS[0].id;

const markActiveNav = () => {
  document.querySelectorAll("[data-path]").forEach((element) => {
    element.classList.toggle("active", element.dataset.path === "thong-tin-noi-bo");
  });
};

const mountWorkspace = () => {
  const parsed = new DOMParser().parseFromString(informationHtml, "text/html");
  const page = parsed.getElementById("informationRoot");
  const main = document.querySelector("main");
  if (!page || !main) return false;

  main.replaceChildren(page);
  workspace = page;
  return true;
};

const renderBulletins = () => {
  if (!workspace) return;

  const list = workspace.querySelector("#informationBulletinList");
  const count = workspace.querySelector("#informationBulletinCount");
  const tabCount = workspace.querySelector("#informationTabCount");
  const search = workspace.querySelector("#informationSearch");
  const scopeFilter = workspace.querySelector("#informationFilterScope");
  const priorityFilter = workspace.querySelector("#informationFilterLevel");
  const yearFilter = workspace.querySelector("#informationFilterYear");
  if (!list || !count) return;

  const term = search?.value.trim().toLowerCase() || "";
  const scope = scopeFilter?.value || "";
  const priority = priorityFilter?.value || "";
  const year = yearFilter?.value || "";

  const visible = bulletins.filter((item) => {
    if (scope && getScope(item) !== scope) return false;
    if (priority && getPriority(item) !== priority) return false;
    if (year && !String(item.created_at || item.createdAt || "").startsWith(year))
      return false;
    if (!term) return true;
    return `${item.title || ""} ${item.message || ""}`.toLowerCase().includes(term);
  });

  count.textContent = `${visible.length} bản tin`;
  if (tabCount) tabCount.textContent = `${visible.length} thông báo`;

  if (!visible.length) {
    list.innerHTML = `
      <div class="lg:col-span-2 flex flex-col items-center justify-center py-space-xl text-center">
        <span class="material-symbols-outlined text-outline text-[40px]">campaign</span>
        <p class="mt-space-xs text-body-md font-body-md text-on-surface-variant">
          Không có thông báo nào phù hợp với bộ lọc hiện tại.
        </p>
      </div>`;
    return;
  }

  list.innerHTML = visible
    .map((item) => {
      const scope = getScope(item);
      const priority = getPriority(item);
      const type = getType(item);
      const createdAt = formatDate(item.created_at || item.createdAt);
      const unread = item.is_read
        ? ""
        : `<span class="inline-flex items-center gap-1 text-error font-semibold"><span class="w-1.5 h-1.5 rounded-full bg-error"></span>Chưa đọc</span>`;

      return `
        <article class="rounded-lg border border-outline-variant/40 bg-surface p-space-md transition-colors hover:border-primary-container">
          <div class="flex items-start justify-between gap-space-sm">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="px-2 py-0.5 rounded-full bg-primary-container text-on-primary-container font-label-sm text-label-sm font-semibold">${SCOPE_LABELS[scope]}</span>
              <span class="px-2 py-0.5 rounded-full ${PRIORITY_STYLES[priority]} font-label-sm text-label-sm font-semibold">${PRIORITY_LABELS[priority]}</span>
            </div>
            ${createdAt ? `<span class="shrink-0 font-label-sm text-label-sm text-outline">${createdAt}</span>` : ""}
          </div>
          <h3 class="mt-space-sm text-title-sm font-title-sm text-on-surface">${escapeHtml(item.title)}</h3>
          <p class="mt-1 text-body-sm font-body-sm text-on-surface-variant line-clamp-2">${escapeHtml(item.message)}</p>
          <div class="mt-space-md pt-space-sm border-t border-outline-variant/40 flex items-center justify-between gap-space-xs">
            <span class="inline-flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
              <span class="material-symbols-outlined text-[16px]">${type.icon}</span>
              ${type.label}
            </span>
            ${unread}
          </div>
        </article>`;
    })
    .join("");
};

const loadBulletins = async () => {
  try {
    const response = await api.get("/api/v1/notifications", {
      params: { limit: 100 },
    });
    const data = response?.data || {};
    const source =
      data.notifications || data.items || (Array.isArray(data) ? data : []);
    bulletins = Array.isArray(source) && source.length ? source : FALLBACK_BULLETINS;
  } catch (error) {
    bulletins = FALLBACK_BULLETINS;
  }

  renderBulletins();
};

const renderDocumentList = () => {
  if (!workspace) return;
  const list = workspace.querySelector("#documentMasterList");
  if (!list) return;

  list.innerHTML = DOCUMENTS.map(
    (doc) => `
      <button
        type="button"
        data-document-id="${doc.id}"
        class="w-full text-left rounded-lg p-space-sm border transition-colors ${
          doc.id === selectedDocumentId
            ? "bg-primary/5 border-primary-container"
            : "bg-transparent border-transparent hover:bg-surface-container-low"
        }"
      >
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm">${doc.code}</span>
          <span class="px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container font-label-sm text-label-sm">${escapeHtml(doc.badge)}</span>
          ${doc.version ? `<span class="font-label-sm text-label-sm text-outline">${doc.version}</span>` : ""}
        </div>
        <p class="mt-1.5 text-body-md font-body-md font-semibold text-on-surface leading-snug">${escapeHtml(doc.title)}</p>
        <p class="mt-0.5 text-body-sm font-body-sm text-on-surface-variant line-clamp-2">${escapeHtml(doc.summary)}</p>
        <p class="mt-1.5 font-label-sm text-label-sm text-outline">${escapeHtml(doc.footer)}</p>
      </button>`,
  ).join("");
};

const renderDocumentDetail = () => {
  if (!workspace) return;
  const container = workspace.querySelector("#documentDetail");
  if (!container) return;

  const doc = DOCUMENTS.find((item) => item.id === selectedDocumentId) || DOCUMENTS[0];
  const chapters = doc.chapters?.length
    ? doc.chapters
        .map(
          (chapter) => `
            <div class="rounded-lg bg-surface p-space-md">
              <div class="flex flex-wrap items-center justify-between gap-space-xs">
                <span class="font-label-lg text-label-lg font-semibold text-primary">${escapeHtml(chapter.title)}</span>
                <span class="font-label-sm text-label-sm text-on-surface-variant">${chapter.range}</span>
              </div>
              <p class="mt-1 text-body-sm font-body-sm text-on-surface">${escapeHtml(chapter.body)}</p>
            </div>`,
        )
        .join("")
    : `<div class="rounded-lg bg-surface p-space-md text-body-sm font-body-sm text-on-surface">${escapeHtml(doc.summary)}</div>`;

  container.innerHTML = `
    <div class="flex flex-wrap items-center gap-space-xs">
      <span class="px-2 py-0.5 rounded bg-primary text-on-primary font-label-sm text-label-sm font-semibold">${doc.code}</span>
      <span class="px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container font-label-sm text-label-sm">${escapeHtml(doc.badge)}</span>
      ${doc.version ? `<span class="font-label-sm text-label-sm text-outline">${doc.version}</span>` : ""}
    </div>

    <h2 class="mt-space-md font-headline-sm text-headline-sm text-on-surface font-bold">${escapeHtml(doc.detailTitle)}</h2>
    <p class="mt-1 text-body-sm font-body-sm text-on-surface-variant">${escapeHtml(doc.detailMeta)}</p>

    ${
      doc.verification
        ? `<div class="mt-space-md rounded-lg bg-emerald-50 p-space-md flex items-start gap-space-sm">
            <span class="material-symbols-outlined text-emerald-600 text-[22px]">verified_user</span>
            <div>
              <p class="font-label-lg text-label-lg font-semibold text-emerald-900">Xác thực tuân thủ: ĐÃ HOÀN TẤT</p>
              <p class="mt-0.5 text-body-sm font-body-sm text-emerald-800">${escapeHtml(doc.verification)}</p>
            </div>
          </div>`
        : ""
    }

    <div class="mt-space-md">
      <h3 class="font-headline-sm text-headline-sm text-on-surface font-semibold">Nội dung chính</h3>
      <div class="mt-space-sm flex flex-col gap-space-xs">${chapters}</div>
    </div>

    <div class="mt-space-md rounded-lg border border-outline-variant/40 p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
      <div class="flex items-center gap-space-sm min-w-0">
        <span class="material-symbols-outlined text-red-600 text-[26px] shrink-0">picture_as_pdf</span>
        <div class="min-w-0">
          <p class="text-body-md font-body-md font-semibold text-on-surface truncate">${escapeHtml(doc.file)}</p>
          <p class="text-body-sm font-body-sm text-on-surface-variant">${escapeHtml(doc.fileMeta)}</p>
        </div>
      </div>
      <button type="button" class="h-9 px-space-md rounded bg-primary text-on-primary font-label-sm text-label-sm font-medium inline-flex items-center gap-1.5 shrink-0">
        <span class="material-symbols-outlined text-[16px]">download</span>
        Tải văn bản
      </button>
    </div>
  `;
};

const selectDocument = (id) => {
  selectedDocumentId = id;
  renderDocumentList();
  renderDocumentDetail();
};

const setTab = (tab) => {
  if (!workspace) return;

  const bulletinPanel = workspace.querySelector("#informationBulletinPanel");
  const documentPanel = workspace.querySelector("#informationDocumentPanel");

  workspace.querySelectorAll("[data-info-tab]").forEach((button) => {
    const isActive = button.dataset.infoTab === tab;
    button.classList.toggle("bg-surface-container-lowest", isActive);
    button.classList.toggle("text-primary", isActive);
    button.classList.toggle("shadow-sm", isActive);
    button.classList.toggle("text-on-surface-variant", !isActive);
    button.classList.toggle("info-tab-active", isActive);
  });

  bulletinPanel?.classList.toggle("hidden", tab === "document");
  documentPanel?.classList.toggle("hidden", tab !== "document");
  documentPanel?.classList.toggle("grid", tab === "document");

  renderBulletins();
};

const bindEvents = () => {
  if (!workspace) return;

  workspace.querySelectorAll("[data-info-tab]").forEach((button) => {
    button.addEventListener("click", () => setTab(button.dataset.infoTab));
  });

  workspace.querySelector("#informationSearch")?.addEventListener("input", renderBulletins);
  workspace.querySelector("#informationFilterScope")?.addEventListener("change", renderBulletins);
  workspace.querySelector("#informationFilterLevel")?.addEventListener("change", renderBulletins);
  workspace.querySelector("#informationFilterYear")?.addEventListener("change", renderBulletins);
  workspace.querySelector("#informationResetFilters")?.addEventListener("click", () => {
    const search = workspace.querySelector("#informationSearch");
    const scope = workspace.querySelector("#informationFilterScope");
    const priority = workspace.querySelector("#informationFilterLevel");
    const year = workspace.querySelector("#informationFilterYear");
    if (search) search.value = "";
    if (scope) scope.value = "";
    if (priority) priority.value = "";
    if (year) year.value = "";
    renderBulletins();
  });

  workspace.querySelector("#documentMasterList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-document-id]");
    if (button) selectDocument(button.dataset.documentId);
  });
};

export const initInformation = () => {
  markActiveNav();
  if (!mountWorkspace()) return;

  renderDocumentList();
  renderDocumentDetail();
  bindEvents();
  setTab("bulletin");
  loadBulletins();
  document.getElementById("appContent")?.scrollTo?.({ top: 0, behavior: "smooth" });
};
