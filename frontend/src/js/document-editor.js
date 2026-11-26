import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import CharacterCount from "@tiptap/extension-character-count";
import { TextStyleKit } from "@tiptap/extension-text-style";
import {
  AlignmentType,
  BorderStyle,
  Document as DocxDocument,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph as DocxParagraph,
  Table as DocxTable,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
  convertInchesToTwip,
} from "docx";
import documentEditorHtml from "../pages/document-editor.html?raw";
import { setupShell } from "./home.js";
import { getCurrentUser, hasPermission, logout } from "../services/auth.service.js";
import api from "../services/api.js";

const DEFAULT_CONTENT = `
  <h2 style="text-align:center">BIÊN BẢN BÀN GIAO CÔNG VIỆC VÀ TÀI SẢN</h2>
  <p style="text-align:center">Số: ...................................</p>
  <p><strong>Người giao:</strong> ............................................................</p>
  <p><strong>Người nhận:</strong> ............................................................</p>
  <p><strong>Ngày bàn giao:</strong> ........................................................</p>
  <p><strong>1. Nội dung bàn giao</strong></p>
  <p>Nhập nội dung công việc, hồ sơ, tài liệu và tài sản bàn giao tại đây.</p>
  <table>
    <tbody>
      <tr><th>STT</th><th>Nội dung</th><th>Số lượng</th><th>Ghi chú</th></tr>
      <tr><td>1</td><td></td><td></td><td></td></tr>
      <tr><td>2</td><td></td><td></td><td></td></tr>
      <tr><td>3</td><td></td><td></td><td></td></tr>
    </tbody>
  </table>
  <p><strong>2. Kết luận</strong></p>
  <p>Hai bên đã kiểm tra và thống nhất bàn giao các nội dung nêu trên.</p>
  <p style="text-align:right">Ngày ...... tháng ...... năm ..........</p>
`;

const DEFAULT_FONT_FAMILY = "Times New Roman, Times, serif";
const DEFAULT_FONT_SIZE = "13pt";
const DEFAULT_LINE_HEIGHT = "1.5";
const DEFAULT_MARGINS = { top: 20, right: 18, bottom: 20, left: 18 };
const VERSION_LIMIT = 30;
const FILE_DB_NAME = "hrm-document-editor-files";
const FILE_STORE_NAME = "official-files";
const REQUEST_CONTEXT_KEY = "hrm.documentEditor.requestContext";
const REQUEST_DOCUMENT_DRAFT_KEY = "hrm.employeeRequest.documentDraft";
const REQUEST_FORM_DRAFT_KEY = "hrm.employeeRequest.formDraft";
const REQUEST_RETURN_KEY = "hrm.employeeRequest.reopenForm";
const ROLE_CAPABILITIES = {
  SUPER_ADMIN: { view: true, edit: true, export: true, manage: true },
  HR_ADMIN: { view: true, edit: true, export: true, manage: true },
  DIRECTOR: { view: true, edit: false, export: true, manage: false },
  OFFICE_ADMIN: { view: true, edit: false, export: true, manage: false },
  MANAGER: { view: true, edit: false, export: false, manage: false },
  EMPLOYEE: { view: true, edit: false, export: false, manage: false },
  CB_PAYROLL: { view: true, edit: false, export: false, manage: false },
};
const DEFAULT_CAPABILITIES = { view: true, edit: false, export: false, manage: false };
const DOCX_BULLET_REFERENCE = "hrm-bullet-list";
const DOCX_ORDERED_REFERENCE = "hrm-ordered-list";
const DOCX_ALIGNMENTS = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};
const DOCX_HEADING_LEVELS = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};
const REQUEST_TYPE_LABELS = {
  RESIGNATION: "Nghỉ việc",
  TEMPORARY_LEAVE: "Tạm nghỉ",
};
const REQUEST_STATUS_LABELS = {
  PENDING_DEPARTMENT: "Chờ Trưởng bộ phận duyệt",
  PENDING_HR: "Chờ HR xử lý",
  WAITING_EMPLOYEE_UPDATE: "Chờ nhân viên bổ sung",
  PENDING_DIRECTOR: "Chờ Giám đốc duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
  CANCELLED: "Đã hủy",
};
const DOCUMENT_TEMPLATES = [
  {
    id: "handover",
    name: "Biên bản bàn giao công việc",
    description: "Bàn giao công việc, hồ sơ và tài sản khi nhân viên nghỉ hoặc chuyển việc.",
    title: "Biên bản bàn giao công việc và tài sản",
    number: "BB-BG",
    content: `
      <h2 style="text-align:center">BIÊN BẢN BÀN GIAO CÔNG VIỆC VÀ TÀI SẢN</h2>
      <p style="text-align:center">Số: {{document.number}}</p>
      <p><strong>Người giao:</strong> {{employee.full_name}} — {{employee.employee_code}}</p>
      <p><strong>Phòng ban / Chức vụ:</strong> {{employee.department_name}} / {{employee.position_name}}</p>
      <p><strong>Người nhận:</strong> ...........................................................</p>
      <p><strong>Ngày bàn giao:</strong> {{document.date}}</p>
      <p><strong>1. Nội dung bàn giao</strong></p>
      <table>
        <tbody>
          <tr><th>STT</th><th>Nội dung</th><th>Số lượng</th><th>Ghi chú</th></tr>
          <tr><td>1</td><td></td><td></td><td></td></tr>
          <tr><td>2</td><td></td><td></td><td></td></tr>
          <tr><td>3</td><td></td><td></td><td></td></tr>
        </tbody>
      </table>
      <p><strong>2. Kết luận</strong></p>
      <p>Hai bên đã kiểm tra và thống nhất bàn giao các nội dung nêu trên.</p>
      <p style="text-align:right">{{document.date_long}}</p>
    `,
  },
  {
    id: "resignation",
    name: "Đơn xin nghỉ việc",
    description: "Đơn nhân viên gửi Ban Giám đốc, tự động lấy thông tin từ đơn nghỉ việc.",
    title: "Đơn xin nghỉ việc",
    number: "ĐON-NV",
    content: `
      <h2 style="text-align:center">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br>Độc lập — Tự do — Hạnh phúc</h2>
      <p style="text-align:center">---o0o---</p>
      <h2 style="text-align:center">ĐƠN XIN NGHỈ VIỆC</h2>
      <p style="text-align:center">Số: {{document.number}}</p>
      <p>Kính gửi: Ban Giám đốc Công ty</p>
      <p>Tôi tên <strong>{{employee.full_name}}</strong>, mã nhân viên <strong>{{employee.employee_code}}</strong>, công tác tại <strong>{{employee.department_name}}</strong> với chức vụ <strong>{{employee.position_name}}</strong>.</p>
      <p>Qua <strong>{{request.title}}</strong> đã gửi ngày {{request.submitted_date}}, tôi xin chấm dứt hợp đồng lao động kể từ ngày <strong>{{request.last_working_date}}</strong>.</p>
      <p><strong>Lý do:</strong> {{request.reason}}</p>
      <p>Tôi cam kết bàn giao đầy đủ công việc, hồ sơ và tài sản theo quy định trước ngày chấm dứt hợp đồng.</p>
      <p>Kính đề nghị Ban Giám đốc xem xét và giải quyết.</p>
      <p style="text-align:right">{{document.date_long}}</p>
      <p style="text-align:right"><strong>Người làm đơn</strong></p>
      <p style="text-align:right">{{employee.full_name}}</p>
    `,
  },
  {
    id: "termination-minutes",
    name: "Biên bản thanh lý hợp đồng",
    description: "Ghi nhận việc thanh lý hợp đồng, bàn giao và nghĩa vụ thanh toán.",
    title: "Biên bản thanh lý hợp đồng lao động",
    number: "BB-TL",
    content: `
      <h2 style="text-align:center">BIÊN BẢN THANH LÝ HỢP ĐỒNG LAO ĐỘNG</h2>
      <p style="text-align:center">Số: {{document.number}}</p>
      <p>Căn cứ đơn từ số <strong>{{request.id}}</strong> ngày {{request.submitted_date}} của nhân viên <strong>{{employee.full_name}}</strong>.</p>
      <p>Hôm nay, vào ngày {{document.date}}, tại trụ sở Công ty, chúng tôi gồm:</p>
      <p><strong>Đại diện Công ty:</strong> ................................................</p>
      <p><strong>Nhân viên:</strong> {{employee.full_name}} — {{employee.employee_code}}</p>
      <p><strong>Phòng ban / Chức vụ:</strong> {{employee.department_name}} / {{employee.position_name}}</p>
      <p><strong>Ngày vào làm:</strong> {{employee.hire_date}}</p>
      <p><strong>Ngày chấm dứt:</strong> {{request.last_working_date}}</p>
      <p><strong>Lý do chấm dứt:</strong> {{request.reason}}</p>
      <p><strong>1. Bàn giao công việc và tài sản</strong></p>
      <table>
        <tbody>
          <tr><th>STT</th><th>Nội dung bàn giao</th><th>Tình trạng</th><th>Ghi chú</th></tr>
          <tr><td>1</td><td>Hồ sơ, tài liệu công việc</td><td>Đã bàn giao</td><td></td></tr>
          <tr><td>2</td><td>Thiết bị, tài sản công ty</td><td>Đã bàn giao</td><td></td></tr>
          <tr><td>3</td><td>Công việc đang thực hiện</td><td>Đã bàn giao</td><td></td></tr>
        </tbody>
      </table>
      <p><strong>2. Nghĩa vụ thanh toán</strong></p>
      <p>Công ty thanh toán đầy đủ tiền lương, phụ cấp và các khoản phải trả khác cho nhân viên theo quy định.</p>
      <p>Biên bản được lập thành 02 bản, có giá trị như nhau.</p>
      <p style="text-align:right">{{document.date_long}}</p>
    `,
  },
  {
    id: "temporary-leave",
    name: "Đơn xin tạm nghỉ",
    description: "Đơn xin tạm nghỉ có thời gian và lý do lấy từ đơn từ.",
    title: "Đơn xin tạm nghỉ",
    number: "ĐON-TN",
    content: `
      <h2 style="text-align:center">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br>Độc lập — Tự do — Hạnh phúc</h2>
      <p style="text-align:center">---o0o---</p>
      <h2 style="text-align:center">ĐƠN XIN TẠM NGHỈ</h2>
      <p style="text-align:center">Số: {{document.number}}</p>
      <p>Kính gửi: Trưởng bộ phận / Ban Giám đốc</p>
      <p>Tôi tên <strong>{{employee.full_name}}</strong>, mã nhân viên <strong>{{employee.employee_code}}</strong>, thuộc phòng ban <strong>{{employee.department_name}}</strong>.</p>
      <p>Tôi xin tạm nghỉ từ ngày <strong>{{request.start_date}}</strong> đến ngày <strong>{{request.end_date}}</strong>.</p>
      <p><strong>Lý do:</strong> {{request.reason}}</p>
      <p>Trong thời gian tạm nghỉ, tôi đã bàn giao công việc cho đồng nghiệp được phân công và sẽ quay lại làm việc đúng hạn.</p>
      <p style="text-align:right">{{document.date_long}}</p>
      <p style="text-align:right"><strong>Người làm đơn</strong></p>
      <p style="text-align:right">{{employee.full_name}}</p>
    `,
  },
  {
    id: "termination-decision",
    name: "Quyết định chấm dứt hợp đồng",
    description: "Quyết định chính thức dựa trên đơn từ đã được phê duyệt.",
    title: "Quyết định chấm dứt hợp đồng lao động",
    number: "QD-CĐ",
    content: `
      <h2 style="text-align:center">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br>Độc lập — Tự do — Hạnh phúc</h2>
      <p style="text-align:center">---o0o---</p>
      <h2 style="text-align:center">QUYẾT ĐỊNH CHẤM DỨT HỢP ĐỒNG LAO ĐỘNG</h2>
      <p style="text-align:center">Số: {{document.number}}</p>
      <p><strong>Đại diện Công ty:</strong> ................................................</p>
      <p>Căn cứ đơn từ số <strong>{{request.id}}</strong> và kết quả phê duyệt <strong>{{request.status_label}}</strong>.</p>
      <p><strong>QUYẾT ĐỊNH:</strong></p>
      <p>Đình chỉ và chấm dứt hợp đồng lao động đối với ông/bà <strong>{{employee.full_name}}</strong>, mã nhân viên <strong>{{employee.employee_code}}</strong>, phòng ban <strong>{{employee.department_name}}</strong>, chức vụ <strong>{{employee.position_name}}</strong>, kể từ ngày <strong>{{request.last_working_date}}</strong>.</p>
      <p>Lý do chấm dứt: {{request.reason}}.</p>
      <p>Bộ phận Nhân sự thực hiện thủ tục thanh lý hợp đồng, bàn giao công việc và thanh toán các khoản phải trả theo quy định.</p>
      <p style="text-align:right">{{document.date_long}}</p>
      <p style="text-align:right"><strong>Đại diện Công ty</strong></p>
    `,
  },
];

let editor = null;
let state = {
  user: null,
  can: { ...DEFAULT_CAPABILITIES },
  bound: false,
  employees: [],
  requests: [],
  activeDocumentId: null,
  activeVersionId: null,
  restoredVersionNumber: null,
  lastEditedBy: null,
  lastEditedAt: null,
  selectedOfficialFileId: null,
  viewingFileId: null,
  viewerObjectUrl: null,
  dirty: false,
  requestContext: null,
  requestDraft: null,
};
let pageMargins = { ...DEFAULT_MARGINS };

const draftKey = () => `hrm.document-editor.${state.user?.user_id || "guest"}`;
const libraryKey = () => `hrm.document-editor.library.${state.user?.user_id || "guest"}`;

function currentEditorIdentity() {
  const user = state.user || {};
  return {
    user_id: user.user_id || null,
    employee_code: user.employee_code || "",
    edited_by: user.full_name || user.username || user.employee_code || "Người dùng chưa xác định",
    edited_at: new Date().toISOString(),
  };
}

function resolveCapabilities(user) {
  const base = ROLE_CAPABILITIES[user?.role_id] || DEFAULT_CAPABILITIES;
  const managerPermission = hasPermission("HR.PROFILE_MANAGE", user) || user?.role_id === "SUPER_ADMIN";
  return {
    view: true,
    edit: base.edit || managerPermission,
    export: base.export || managerPermission,
    manage: base.manage || managerPermission,
  };
}

function roleInList(roleId, value) {
  const roles = String(value || "")
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);
  if (!roles.length) return true;
  return Boolean(roleId) && roles.includes(roleId);
}

function resolveDocumentCapabilities(document = {}) {
  const user = state.user || {};
  const base = resolveCapabilities(user);
  const elevated = user.role_id === "SUPER_ADMIN" || hasPermission("HR.PROFILE_MANAGE", user);
  const owner = Boolean(user.user_id) && Number(document.owner_user_id) === Number(user.user_id);
  const viewAll =
    elevated ||
    base.manage ||
    ["DIRECTOR", "OFFICE_ADMIN"].includes(user.role_id) ||
    user.data_scope === "ALL" ||
    owner ||
    document.visibility === "ALL" ||
    (document.visibility === "DEPARTMENT" &&
      Boolean(user.department_id) &&
      Number(document.department_id) === Number(user.department_id)) ||
    (document.visibility === "ROLE" && roleInList(user.role_id, document.allowed_roles));

  return {
    view: Boolean(base.view && viewAll),
    edit: Boolean(base.edit || elevated || owner || roleInList(user.role_id, document.can_edit_roles)),
    export: Boolean(base.export || elevated || roleInList(user.role_id, document.can_export_roles)),
    manage: Boolean(base.manage || elevated),
  };
}

function applyDocumentCapabilities(capabilities) {
  if (!capabilities) return;
  state.can = {
    view: Boolean(capabilities.view),
    edit: Boolean(capabilities.view && capabilities.edit),
    export: Boolean(capabilities.view && capabilities.export),
    manage: Boolean(capabilities.view && capabilities.manage),
  };
  applyPermissionUi();
}

function normalizeVersion(version = {}, index = 0) {
  const fallbackTime = version.edited_at || version.created_at || new Date().toISOString();
  return {
    ...version,
    id: version.id || `version-${Date.now()}-${index}`,
    version_number: Number(version.version_number) || index + 1,
    title: version.title || "Văn bản chưa đặt tên",
    number: version.number || "",
    template_id: version.template_id || null,
    margins: { ...DEFAULT_MARGINS, ...(version.margins || {}) },
    content: version.content || null,
    edited_by: version.edited_by || version.created_by || "Không rõ",
    edited_at: fallbackTime,
    created_by: version.created_by || version.edited_by || "Không rõ",
    created_at: version.created_at || fallbackTime,
    note: version.note || "",
  };
}

function normalizeDocumentEntry(entry = {}) {
  const fallbackTime = entry.updated_at || entry.created_at || new Date().toISOString();
  const storedVersions = Array.isArray(entry.versions) ? entry.versions : [];
  const versions = storedVersions.map(normalizeVersion).sort((a, b) => b.version_number - a.version_number);
  if (!versions.length && entry.content) {
    versions.push(
      normalizeVersion(
        {
          id: entry.current_version_id || `version-${entry.id || "initial"}`,
          version_number: 1,
          title: entry.title,
          number: entry.number,
          template_id: entry.template_id,
          margins: entry.margins,
          content: entry.content,
          edited_by: entry.updated_by || entry.created_by || "Không rõ",
          edited_at: fallbackTime,
          created_by: entry.created_by || entry.updated_by || "Không rõ",
          created_at: entry.created_at || fallbackTime,
          note: "Phiên bản đầu tiên",
        },
        0,
      ),
    );
  }
  const latest = versions[0];
  return {
    ...entry,
    created_at: entry.created_at || latest?.created_at || fallbackTime,
    created_by: entry.created_by || latest?.edited_by || "Không rõ",
    updated_at: entry.updated_at || latest?.edited_at || fallbackTime,
    updated_by: entry.updated_by || latest?.edited_by || "Không rõ",
    current_version_id: entry.current_version_id || latest?.id || null,
    versions,
  };
}

function renderAuditInfo() {
  const editorName = state.lastEditedBy || "Chưa rõ";
  const editedAt = state.lastEditedAt ? formatSavedAt(state.lastEditedAt) : "chưa có thay đổi";
  const version = state.restoredVersionNumber ? ` • đang xem phiên bản #${state.restoredVersionNumber}` : "";
  setText("#documentEditorAuditInfo", `Người chỉnh sửa: ${editorName} • Thời gian: ${editedAt}${version}`);
}

function setText(selector, text) {
  const element = document.querySelector(selector);
  if (element) element.textContent = text;
}

function normalizeSelectValue(select, value, fallback) {
  if (!select || !value) return fallback;
  const normalized = String(value).replace(/["']/g, "").trim().toLowerCase();
  const matched = Array.from(select.options).find(
    (option) => option.value.replace(/["']/g, "").trim().toLowerCase() === normalized,
  );
  return matched ? matched.value : fallback;
}

function clampMargin(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(50, Math.max(0, number));
}

function readPageMargins() {
  return {
    top: clampMargin(document.getElementById("documentEditorMarginTop")?.value, DEFAULT_MARGINS.top),
    right: clampMargin(document.getElementById("documentEditorMarginRight")?.value, DEFAULT_MARGINS.right),
    bottom: clampMargin(document.getElementById("documentEditorMarginBottom")?.value, DEFAULT_MARGINS.bottom),
    left: clampMargin(document.getElementById("documentEditorMarginLeft")?.value, DEFAULT_MARGINS.left),
  };
}

function writePageMargins(margins = DEFAULT_MARGINS) {
  const values = { ...DEFAULT_MARGINS, ...margins };
  const inputs = {
    top: document.getElementById("documentEditorMarginTop"),
    right: document.getElementById("documentEditorMarginRight"),
    bottom: document.getElementById("documentEditorMarginBottom"),
    left: document.getElementById("documentEditorMarginLeft"),
  };
  Object.entries(inputs).forEach(([side, input]) => {
    if (input) input.value = values[side];
  });
  pageMargins = values;
  applyPageMargins();
}

function applyPageMargins() {
  const sheet = document.querySelector(".a4-sheet");
  if (!sheet) return;
  sheet.style.setProperty("--a4-margin-top", `${pageMargins.top}mm`);
  sheet.style.setProperty("--a4-margin-right", `${pageMargins.right}mm`);
  sheet.style.setProperty("--a4-margin-bottom", `${pageMargins.bottom}mm`);
  sheet.style.setProperty("--a4-margin-left", `${pageMargins.left}mm`);
}

function readSavedDocuments() {
  try {
    const parsed = JSON.parse(localStorage.getItem(libraryKey()) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeDocumentEntry) : [];
  } catch (error) {
    return [];
  }
}

function writeSavedDocuments(documents) {
  try {
    localStorage.setItem(libraryKey(), JSON.stringify(documents));
    return true;
  } catch (error) {
    showNotice("Không thể lưu thư viện văn bản. Kiểm tra dung lượng lưu trữ của trình duyệt.", true);
    return false;
  }
}

function isBackendId(value) {
  return /^\d+$/.test(String(value || ""));
}

function apiErrorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

function readSessionJson(key) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function writeSessionJson(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    showNotice("Không thể lưu dữ liệu tạm trên trình duyệt.", true);
    return false;
  }
}

function mapServerVersion(version = {}, index = 0) {
  return normalizeVersion(
    {
      id: version.id,
      version_number: version.version_number || index + 1,
      title: version.title,
      number: version.document_number || version.number || "",
      template_id: version.template_code || version.template_id || null,
      margins: {
        top: version.margin_top ?? DEFAULT_MARGINS.top,
        right: version.margin_right ?? DEFAULT_MARGINS.right,
        bottom: version.margin_bottom ?? DEFAULT_MARGINS.bottom,
        left: version.margin_left ?? DEFAULT_MARGINS.left,
      },
      content: version.content_json || version.content || null,
      edited_by: version.editor_name_snapshot || version.edited_by || "Không rõ",
      edited_at: version.edited_at || version.created_at || new Date().toISOString(),
      created_by: version.editor_name_snapshot || version.created_by || "Không rõ",
      created_at: version.created_at || version.edited_at || new Date().toISOString(),
      note: version.change_note || version.note || "",
    },
    index,
  );
}

function mapServerDocument(document = {}) {
  const versions = (document.versions || [])
    .map(mapServerVersion)
    .sort((a, b) => b.version_number - a.version_number);
  if (!versions.length && document.current_version) {
    versions.push(mapServerVersion(document.current_version, 0));
  }
  const currentVersionId = document.current_version_id || versions[0]?.id || null;
  const current =
    versions.find((version) => String(version.id) === String(currentVersionId)) || versions[0];

  return normalizeDocumentEntry({
    id: document.id,
    title: document.title || current?.title || "Văn bản chưa đặt tên",
    number: document.document_number || current?.number || "",
    template_id: document.template_code || current?.template_id || null,
    content: current?.content || null,
    margins: current?.margins || DEFAULT_MARGINS,
    created_at: document.created_at,
    created_by: document.created_by,
    updated_at: document.updated_at,
    updated_by: document.updated_by,
    current_version_id: currentVersionId,
    versions,
    status: document.status,
    visibility: document.visibility,
    owner_user_id: document.owner_user_id,
    can_edit_roles: document.can_edit_roles,
    can_export_roles: document.can_export_roles,
    allowed_roles: document.allowed_roles,
    department_id: document.department_id,
    capabilities: resolveDocumentCapabilities(document),
    synced_at: new Date().toISOString(),
  });
}

function mergeDocuments(mappedDocuments) {
  const merged = new Map(
    readSavedDocuments().map((document) => [String(document.id), document]),
  );
  mappedDocuments.forEach((document) => merged.set(String(document.id), document));
  return Array.from(merged.values());
}

async function syncDocumentsFromServer(silent = false) {
  try {
    const response = await api.get("/documents", { params: { limit: 50 } });
    const rows = response.data?.data || [];
    const mapped = await Promise.all(
      rows.map(async (row) => {
        try {
          const detail = await api.get(`/documents/${row.id}`);
          return mapServerDocument(detail.data?.data || row);
        } catch (error) {
          return mapServerDocument(row);
        }
      }),
    );
    if (!writeSavedDocuments(mergeDocuments(mapped).slice(0, 50))) return false;
    const active = mapped.find(
      (document) => String(document.id) === String(state.activeDocumentId),
    );
    if (active) applyDocumentCapabilities(active.capabilities);
    else if (state.activeDocumentId && isBackendId(state.activeDocumentId)) {
      state.activeDocumentId = null;
      state.activeVersionId = null;
      applyDocumentCapabilities(resolveCapabilities(state.user));
    }
    renderSavedDocuments();
    renderDocumentVersions();
    if (!silent) showNotice(`Đã đồng bộ ${mapped.length} văn bản từ máy chủ.`);
    return true;
  } catch (error) {
    if (!silent) showNotice(apiErrorMessage(error, "Không thể đồng bộ văn bản từ máy chủ."), true);
    return false;
  }
}

async function syncDocumentFromServer(id) {
  try {
    const response = await api.get(`/documents/${id}`);
    const mapped = mapServerDocument(response.data?.data || {});
    if (!writeSavedDocuments(mergeDocuments([mapped]).slice(0, 50))) return null;
    applyDocumentCapabilities(mapped.capabilities);
    renderSavedDocuments();
    renderDocumentVersions();
    return mapped;
  } catch (error) {
    showNotice(apiErrorMessage(error, "Không thể tải văn bản từ máy chủ."), true);
    return null;
  }
}

let fileDbPromise = null;

function openFileDatabase() {
  if (!window.indexedDB) return Promise.reject(new Error("IndexedDB không khả dụng"));
  if (fileDbPromise) return fileDbPromise;
  fileDbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(FILE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FILE_STORE_NAME)) {
        const store = database.createObjectStore(FILE_STORE_NAME, { keyPath: "id" });
        store.createIndex("user_id", "user_id", { unique: false });
        store.createIndex("created_at", "created_at", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Không thể mở kho file"));
  });
  return fileDbPromise;
}

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Thao tác kho file thất bại"));
  });
}

function transactionAsPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Giao dịch kho file thất bại"));
    transaction.onabort = () => reject(transaction.error || new Error("Giao dịch kho file bị hủy"));
  });
}

async function putOfficialFile(record) {
  const database = await openFileDatabase();
  const transaction = database.transaction(FILE_STORE_NAME, "readwrite");
  transaction.objectStore(FILE_STORE_NAME).put(record);
  await transactionAsPromise(transaction);
  return record;
}

async function listOfficialFiles() {
  const database = await openFileDatabase();
  const transaction = database.transaction(FILE_STORE_NAME, "readonly");
  const records = await requestAsPromise(transaction.objectStore(FILE_STORE_NAME).getAll());
  return records
    .filter((record) => String(record.user_id) === String(state.user?.user_id))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

async function getOfficialFile(id) {
  const database = await openFileDatabase();
  const transaction = database.transaction(FILE_STORE_NAME, "readonly");
  return requestAsPromise(
    transaction.objectStore(FILE_STORE_NAME).get(isBackendId(id) ? Number(id) : id),
  );
}

async function removeOfficialFile(id) {
  const database = await openFileDatabase();
  const transaction = database.transaction(FILE_STORE_NAME, "readwrite");
  transaction.objectStore(FILE_STORE_NAME).delete(isBackendId(id) ? Number(id) : id);
  await transactionAsPromise(transaction);
}

function buildDocumentPayload() {
  const meta = getDocumentMeta();
  return {
    ...meta,
    page_size: "A4",
    margins: { ...pageMargins },
    content: editor.getJSON(),
  };
}

function formatSavedAt(value) {
  if (!value) return "";
  return `${formatDate(value)} ${formatTime(value)}`;
}

function renderSavedDocuments() {
  const select = document.getElementById("documentEditorSavedDocSelect");
  if (!select) return;
  const documents = readSavedDocuments();
  select.innerHTML = documents.length
    ? documents
        .map(
          (document) =>
            `<option value="${escapeHtml(document.id)}">${escapeHtml(document.title || "Văn bản chưa đặt tên")} — ${escapeHtml(formatSavedAt(document.updated_at || document.created_at))}</option>`,
        )
        .join("")
    : '<option value="">Chưa có văn bản đã lưu</option>';
  if (
    state.activeDocumentId &&
    documents.some((document) => String(document.id) === String(state.activeDocumentId))
  ) {
    select.value = String(state.activeDocumentId);
  }
  setText("#documentEditorSavedCount", `${documents.length} văn bản`);
  const openButton = document.getElementById("btnOpenSavedDocument");
  const deleteButton = document.getElementById("btnDeleteSavedDocument");
  if (openButton) openButton.disabled = !select.value;
  if (deleteButton) deleteButton.disabled = !select.value;
}

function renderDocumentVersions() {
  const select = document.getElementById("documentEditorVersionSelect");
  const entry = readSavedDocuments().find((document) => document.id === state.activeDocumentId);
  const versions = entry?.versions || [];
  setText("#documentEditorVersionCount", `${versions.length} phiên bản`);
  if (!select) return;

  select.innerHTML = versions.length
    ? versions
        .map(
          (version) =>
            `<option value="${escapeHtml(version.id)}">#${escapeHtml(version.version_number)} • ${escapeHtml(version.edited_by)} • ${escapeHtml(formatSavedAt(version.edited_at))}</option>`,
        )
        .join("")
    : '<option value="">Chưa có phiên bản</option>';

  const preferredId =
    state.activeVersionId &&
    versions.some((version) => String(version.id) === String(state.activeVersionId))
      ? state.activeVersionId
      : entry?.current_version_id || versions[0]?.id || "";
  if (preferredId) select.value = String(preferredId);

  const selectedVersion = versions.find((version) => String(version.id) === String(select.value)) || versions[0];
  if (selectedVersion) {
    state.activeVersionId = selectedVersion.id;
    setText(
      "#documentEditorVersionInfo",
      `Phiên bản #${selectedVersion.version_number} • Người chỉnh sửa: ${selectedVersion.edited_by} • Thời gian: ${formatSavedAt(selectedVersion.edited_at)}${selectedVersion.note ? ` • ${selectedVersion.note}` : ""}`,
    );
  } else {
    setText("#documentEditorVersionInfo", "Lưu văn bản để tạo phiên bản đầu tiên.");
  }

  const restoreButton = document.getElementById("btnRestoreDocumentVersion");
  const deleteButton = document.getElementById("btnDeleteDocumentVersion");
  if (restoreButton) restoreButton.disabled = !selectedVersion || !state.can.edit;
  if (deleteButton) deleteButton.disabled = versions.length <= 1 || !selectedVersion || !state.can.manage;
  renderAuditInfo();
}

function buildVersionFromCurrent(documents, note = "") {
  const identity = currentEditorIdentity();
  const existing = documents.find((document) => document.id === state.activeDocumentId);
  const nextNumber = (existing?.versions || []).reduce(
    (max, version) => Math.max(max, Number(version.version_number) || 0),
    0,
  ) + 1;
  return {
    ...buildDocumentPayload(),
    id: `version-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    version_number: nextNumber,
    template_id: document.getElementById("documentEditorTemplate")?.value || existing?.template_id || null,
    edited_by: identity.edited_by,
    edited_at: identity.edited_at,
    created_by: identity.user_id || identity.edited_by,
    created_at: identity.edited_at,
    note: note || (state.restoredVersionNumber ? `Khôi phục từ phiên bản #${state.restoredVersionNumber}` : "Lưu từ trình soạn thảo"),
  };
}

async function saveDocumentToLibrary() {
  if (!editor || editor.isDestroyed) return;
  if (!state.can.edit) {
    showNotice("Bạn không có quyền sửa hoặc lưu văn bản.", true);
    return;
  }

  const documents = readSavedDocuments();
  const meta = getDocumentMeta();
  const templateId = document.getElementById("documentEditorTemplate")?.value || "";
  const employeeValue = document.getElementById("documentEditorEmployeeSelect")?.value;
  const requestValue = document.getElementById("documentEditorRequestSelect")?.value;
  const payload = {
    title: meta.title || "Văn bản chưa đặt tên",
    document_number: meta.number || "",
    content_json: editor.getJSON(),
    margins: { ...pageMargins },
    template_id: templateId || null,
    change_note: state.restoredVersionNumber
      ? `Khôi phục từ phiên bản #${state.restoredVersionNumber}`
      : "Lưu từ trình soạn thảo",
  };
  const employeeId = isBackendId(employeeValue) ? Number(employeeValue) : undefined;
  const requestId = isBackendId(requestValue) ? Number(requestValue) : undefined;
  const currentId = isBackendId(state.activeDocumentId)
    ? Number(state.activeDocumentId)
    : null;

  let entry = null;
  let savedToServer = false;

  try {
    let response;
    if (currentId) {
      response = await api.put(`/documents/${currentId}`, payload);
    } else {
      response = await api.post("/documents/from-template", {
        ...payload,
        template_code: templateId || "handover",
        employee_id: employeeId,
        request_id: requestId,
        status: "DRAFT",
      });
      const createdId = response.data?.data?.id;
      if (!createdId) throw new Error("Máy chủ không trả về mã văn bản");
      response = await api.patch(`/documents/${createdId}/content`, payload);
    }
    entry = mapServerDocument(response.data?.data || {});
    if (!writeSavedDocuments(mergeDocuments([entry]).slice(0, 50))) return;
    savedToServer = true;
  } catch (error) {
    showNotice(
      `${apiErrorMessage(error, "Không thể lưu lên máy chủ")}. Đã lưu tạm trên trình duyệt.`,
      true,
    );
  }

  if (!entry) {
    const id = state.activeDocumentId || `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const existingIndex = documents.findIndex((document) => document.id === id);
    const existing = existingIndex >= 0 ? documents[existingIndex] : {};
    const version = buildVersionFromCurrent(documents);
    entry = {
      ...existing,
      ...buildDocumentPayload(),
      id,
      title: meta.title || existing.title || "Văn bản chưa đặt tên",
      template_id: version.template_id,
      created_at: existing.created_at || version.created_at,
      created_by: existing.created_by || version.created_by,
      updated_at: version.edited_at,
      updated_by: version.edited_by,
      versions: [version, ...(existing.versions || [])].slice(0, VERSION_LIMIT),
      current_version_id: version.id,
    };
    if (existingIndex >= 0) documents[existingIndex] = entry;
    else documents.unshift(entry);
    if (!writeSavedDocuments(documents.slice(0, 50))) return;
  }

  const currentVersion = entry.versions.find(
    (version) => String(version.id) === String(entry.current_version_id),
  ) || entry.versions[0];
  applyDocumentCapabilities(entry.capabilities || resolveCapabilities(state.user));
  state.activeDocumentId = entry.id;
  state.activeVersionId = entry.current_version_id;
  state.restoredVersionNumber = null;
  state.lastEditedBy = entry.updated_by || currentVersion?.edited_by || currentEditorIdentity().edited_by;
  state.lastEditedAt = entry.updated_at || currentVersion?.edited_at;
  state.dirty = false;
  saveDraft(false);
  renderSavedDocuments();
  renderDocumentVersions();
  setText(
    "#documentEditorStatus",
    `Đã lưu “${entry.title}” — phiên bản #${currentVersion?.version_number || 1} lúc ${formatTime(state.lastEditedAt || new Date().toISOString())}.`,
  );
  showNotice(
    savedToServer
      ? `Đã lưu “${entry.title}” và ghi nhận phiên bản #${currentVersion?.version_number || 1} trên máy chủ.`
      : `Đã lưu văn bản “${entry.title}” trong trình duyệt.`,
    !savedToServer,
  );
}

function applyVersionToEditor(version, options = {}) {
  if (!editor || editor.isDestroyed || !version) return;
  const { dirty = false, save = false, notify = false } = options;
  state.activeVersionId = version.id;
  state.restoredVersionNumber = version.version_number;
  state.lastEditedBy = version.edited_by;
  state.lastEditedAt = version.edited_at;
  state.dirty = dirty;

  setDocumentMeta(version);
  writePageMargins(version.margins);
  editor.commands.setContent(version.content || DEFAULT_CONTENT, { emitUpdate: false });
  const templateSelect = document.getElementById("documentEditorTemplate");
  const templateId = normalizeSelectValue(templateSelect, version.template_id, "");
  if (templateSelect && templateId) templateSelect.value = templateId;
  setText("#documentEditorTemplateHint", `Đang xem phiên bản #${version.version_number} — ${version.edited_by}.`);
  if (save) saveDraft(false);
  renderSavedDocuments();
  renderDocumentVersions();
  updateToolbar();
  setText(
    "#documentEditorStatus",
    dirty
      ? `Đang xem phiên bản #${version.version_number}. Nhấn “Lưu văn bản” để tạo phiên bản mới.`
      : `Đang chỉnh sửa phiên bản #${version.version_number} — lưu lúc ${formatSavedAt(version.edited_at)}.`,
  );
  if (notify) showNotice(`Đã khôi phục phiên bản #${version.version_number}. Nhấn “Lưu văn bản” để giữ lại thay đổi.`);
}

async function openSavedDocument(id) {
  const readOnly = !state.can.edit;
  let entry = readSavedDocuments().find((document) => String(document.id) === String(id));
  if (!entry) {
    showNotice("Không tìm thấy văn bản đã lưu.", true);
    return;
  }
  if (state.dirty && !window.confirm("Có thay đổi chưa lưu. Mở văn bản khác sẽ bỏ các thay đổi đó. Tiếp tục?")) {
    return;
  }

  if (isBackendId(id)) {
    const synced = await syncDocumentFromServer(id);
    if (synced) entry = synced;
  }
  applyDocumentCapabilities(entry.capabilities || resolveCapabilities(state.user));

  state.activeDocumentId = entry.id;
  const current =
    entry.versions.find((version) => String(version.id) === String(entry.current_version_id)) || entry.versions[0];
  applyVersionToEditor(
    {
      ...entry,
      id: entry.current_version_id || current?.id || entry.id,
      version_number: current?.version_number || 1,
      title: entry.title || current?.title,
      number: entry.number || current?.number,
      template_id: entry.template_id || current?.template_id,
      margins: current?.margins || entry.margins,
      content: current?.content || entry.content,
      edited_by: current?.edited_by || entry.updated_by || "Không rõ",
      edited_at: current?.edited_at || entry.updated_at,
      note: current?.note || "",
    },
    { dirty: false, save: !readOnly },
  );
  showNotice(
    readOnly
      ? "Đã mở văn bản ở chế độ chỉ xem."
      : "Đã mở văn bản. Bạn có thể tiếp tục chỉnh sửa trực tiếp.",
  );
}

async function restoreDocumentVersion(id) {
  if (!state.can.edit) {
    showNotice("Bạn không có quyền khôi phục phiên bản.", true);
    return;
  }
  const entry = readSavedDocuments().find((document) => document.id === state.activeDocumentId);
  const version = entry?.versions.find((item) => String(item.id) === String(id));
  if (!version) {
    showNotice("Không tìm thấy phiên bản cần khôi phục.", true);
    return;
  }
  if (state.dirty && !window.confirm("Có thay đổi chưa lưu. Khôi phục phiên bản sẽ bỏ các thay đổi đó. Tiếp tục?")) {
    return;
  }

  if (isBackendId(state.activeDocumentId) && isBackendId(id)) {
    try {
      const response = await api.post(
        `/documents/${state.activeDocumentId}/versions/${id}/restore`,
      );
      const synced = mapServerDocument(response.data?.data || {});
      if (!writeSavedDocuments(mergeDocuments([synced]).slice(0, 50))) return;
      const latest = synced.versions.find(
        (item) => String(item.id) === String(synced.current_version_id),
      ) || synced.versions[0];
      state.activeDocumentId = synced.id;
      applyVersionToEditor(
        {
          ...latest,
          title: synced.title,
          number: synced.number,
          margins: latest?.margins || synced.margins,
          content: latest?.content || synced.content,
        },
        { dirty: true, save: false, notify: true },
      );
      return;
    } catch (error) {
      showNotice(apiErrorMessage(error, "Không thể khôi phục phiên bản trên máy chủ."), true);
      return;
    }
  }

  applyVersionToEditor(version, { dirty: true, save: false, notify: true });
}

async function deleteDocumentVersion(id) {
  if (!state.can.manage) {
    showNotice("Bạn không có quyền xóa phiên bản.", true);
    return;
  }
  const documents = readSavedDocuments();
  const entryIndex = documents.findIndex((document) => document.id === state.activeDocumentId);
  const entry = documents[entryIndex];
  if (!entry) return;
  if (entry.versions.length <= 1) {
    showNotice("Không thể xóa phiên bản cuối cùng của văn bản.", true);
    return;
  }
  const version = entry.versions.find((item) => String(item.id) === String(id));
  if (!version) return;
  if (!window.confirm(`Xóa phiên bản #${version.version_number} của văn bản “${entry.title}”?`)) return;

  if (isBackendId(state.activeDocumentId) && isBackendId(id)) {
    try {
      const response = await api.delete(`/documents/${state.activeDocumentId}/versions/${id}`);
      const updated = mapServerDocument(response.data?.data || {});
      if (!writeSavedDocuments(mergeDocuments([updated]).slice(0, 50))) return;
      const latest = updated.versions.find(
        (item) => String(item.id) === String(updated.current_version_id),
      ) || updated.versions[0];
      state.activeDocumentId = updated.id;
      applyVersionToEditor(
        {
          ...latest,
          title: updated.title,
          number: updated.number,
          margins: latest?.margins || updated.margins,
          content: latest?.content || updated.content,
        },
        { dirty: false, save: true },
      );
      showNotice(`Đã xóa phiên bản #${version.version_number} trên máy chủ.`);
      return;
    } catch (error) {
      showNotice(apiErrorMessage(error, "Không thể xóa phiên bản trên máy chủ."), true);
      return;
    }
  }

  const versions = entry.versions.filter((item) => String(item.id) !== String(id));
  const latest = versions[0];
  const updatedEntry = {
    ...entry,
    ...buildDocumentPayloadFromVersion(latest),
    versions,
    current_version_id: latest.id,
    updated_at: latest.edited_at,
    updated_by: latest.edited_by,
  };
  documents[entryIndex] = updatedEntry;
  if (!writeSavedDocuments(documents)) return;

  if (String(state.activeVersionId) === String(id) || state.restoredVersionNumber === version.version_number) {
    applyVersionToEditor(latest, { dirty: false, save: true });
  } else {
    renderSavedDocuments();
    renderDocumentVersions();
  }
  showNotice(`Đã xóa phiên bản #${version.version_number}.`);
}

function buildDocumentPayloadFromVersion(version) {
  return {
    title: version.title,
    number: version.number,
    margins: { ...version.margins },
    content: version.content,
  };
}

async function deleteSavedDocument(id) {
  if (!state.can.manage) {
    showNotice("Bạn không có quyền xóa văn bản.", true);
    return;
  }
  const entry = readSavedDocuments().find((document) => document.id === id);
  if (!entry) return;
  if (!window.confirm(`Xóa văn bản “${entry.title || "Chưa đặt tên"}” khỏi thư viện?`)) return;

  if (isBackendId(id)) {
    try {
      await api.delete(`/documents/${id}`);
    } catch (error) {
      showNotice(apiErrorMessage(error, "Không thể lưu trữ văn bản trên máy chủ."), true);
      return;
    }
  }

  if (!writeSavedDocuments(readSavedDocuments().filter((document) => String(document.id) !== String(id)))) return;
  if (String(state.activeDocumentId) === String(id)) {
    state.activeDocumentId = null;
    state.activeVersionId = null;
    state.restoredVersionNumber = null;
    state.lastEditedBy = currentEditorIdentity().edited_by;
    state.lastEditedAt = null;
    state.dirty = false;
    try {
      localStorage.removeItem(draftKey());
    } catch (error) {
      showNotice("Không thể xóa bản nháp hiện tại.", true);
    }
  }
  renderSavedDocuments();
  renderDocumentVersions();
  showNotice("Đã xóa văn bản khỏi thư viện.");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

function toDateParts(value) {
  const text = String(value || "").slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return { day: match[3], month: match[2], year: match[1] };
  const date = new Date(value || Date.now());
  return {
    day: String(date.getDate()).padStart(2, "0"),
    month: String(date.getMonth() + 1).padStart(2, "0"),
    year: String(date.getFullYear()),
  };
}

function formatDate(value) {
  if (!value) return "..........";
  const parts = toDateParts(value);
  return `${parts.day}/${parts.month}/${parts.year}`;
}

function formatDateLong(value) {
  const parts = toDateParts(value);
  return `ngày ${Number(parts.day)} tháng ${Number(parts.month)} năm ${parts.year}`;
}

function currentUserAsEmployee() {
  const user = state.user || {};
  return {
    id: user.employee_id,
    employee_code: user.employee_code,
    full_name: user.full_name,
    department_name: user.department_name,
    position_name: user.position_name,
    hire_date: user.hire_date,
  };
}

function getSelectedEmployee() {
  const select = document.getElementById("documentEditorEmployeeSelect");
  const value = select?.value || "self";
  if (value === "self") return currentUserAsEmployee();
  return state.employees.find((employee) => String(employee.id) === value) || currentUserAsEmployee();
}

function getSelectedRequest() {
  const select = document.getElementById("documentEditorRequestSelect");
  const value = select?.value || "";
  if (!value) return null;
  return state.requests.find((request) => String(request.id) === value) || null;
}

function buildPlaceholderValues() {
  const employee = getSelectedEmployee();
  const request = getSelectedRequest();
  const meta = getDocumentMeta();
  const today = new Date();

  return {
    "document.title": meta.title || "Văn bản",
    "document.number": meta.number || "..........",
    "document.date": formatDate(today),
    "document.date_long": formatDateLong(today),
    "employee.full_name": employee.full_name || "..........",
    "employee.employee_code": employee.employee_code || "..........",
    "employee.department_name": employee.department_name || "..........",
    "employee.position_name": employee.position_name || "..........",
    "employee.hire_date": formatDate(employee.hire_date),
    "request.id": request?.id || "..........",
    "request.title": request?.title || "..........",
    "request.type": request ? REQUEST_TYPE_LABELS[request.request_type] || request.request_type : "..........",
    "request.status_label": request ? REQUEST_STATUS_LABELS[request.status] || request.status : "..........",
    "request.reason": request?.reason || "..........",
    "request.start_date": formatDate(request?.start_date),
    "request.end_date": formatDate(request?.end_date),
    "request.last_working_date": formatDate(request?.last_working_date),
    "request.submitted_date": formatDate(request?.submitted_at),
    "request.employee_name": request?.full_name || employee.full_name || "..........",
    "request.employee_code": request?.employee_code || employee.employee_code || "..........",
    "request.department_name": request?.department_name || employee.department_name || "..........",
  };

  if (state.requestContext && state.requestDraft) {
    const draft = state.requestDraft;
    values["request.title"] = draft.title || values["request.title"];
    values["request.reason"] = draft.reason || values["request.reason"];
    values["request.start_date"] = draft.startDate
      ? formatDate(draft.startDate)
      : values["request.start_date"];
    values["request.end_date"] = draft.endDate
      ? formatDate(draft.endDate)
      : values["request.end_date"];
    values["request.last_working_date"] = draft.lastWorkingDate
      ? formatDate(draft.lastWorkingDate)
      : values["request.last_working_date"];
    values["request.submitted_date"] = formatDate(new Date().toISOString().slice(0, 10));
  }

  return values;
}

function fillDocumentPlaceholders(notify = false) {
  if (!editor || editor.isDestroyed || !state.can.edit) return;
  const source = editor.getHTML();
  const values = buildPlaceholderValues();
  const replaced = source.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, key) => {
    const value = values[key];
    return value === undefined ? match : escapeHtml(value);
  });
  if (replaced !== source) editor.commands.setContent(replaced, { emitUpdate: false });
  setText("#documentEditorStatus", "Đã điền thông tin vào văn bản.");
  if (notify) showNotice("Đã tự động điền thông tin nhân viên và đơn từ.");
  updateToolbar();
}

function populateEmployees() {
  const select = document.getElementById("documentEditorEmployeeSelect");
  if (!select) return;
  const previous = select.value;
  const current = currentUserAsEmployee();
  const options = [`<option value="self">Nhân viên hiện tại — ${escapeHtml(current.full_name || "chưa có")}</option>`];
  state.employees.forEach((employee) => {
    options.push(
      `<option value="${escapeHtml(employee.id)}">${escapeHtml(employee.employee_code)} — ${escapeHtml(employee.full_name)}</option>`,
    );
  });
  select.innerHTML = options.join("");
  select.value = previous && Array.from(select.options).some((option) => option.value === previous)
    ? previous
    : "self";
}

function populateRequests() {
  const select = document.getElementById("documentEditorRequestSelect");
  if (!select) return;
  const previous = select.value;
  const options = ['<option value="">Không dùng đơn từ</option>'];
  state.requests.forEach((request) => {
    const type = REQUEST_TYPE_LABELS[request.request_type] || request.request_type || "Đơn từ";
    const label = `#${request.id} • ${type} • ${request.full_name || "—"} • ${formatDate(request.start_date)}`;
    options.push(`<option value="${escapeHtml(request.id)}">${escapeHtml(label)}</option>`);
  });
  select.innerHTML = options.join("");
  select.value = previous && Array.from(select.options).some((option) => option.value === previous)
    ? previous
    : "";
}

function syncEmployeeFromRequest() {
  const request = getSelectedRequest();
  const select = document.getElementById("documentEditorEmployeeSelect");
  if (!request?.employee_id || !select) return;
  const employeeId = String(request.employee_id);
  if (state.employees.some((employee) => String(employee.id) === employeeId)) {
    select.value = employeeId;
  } else if (String(state.user?.employee_id) === employeeId) {
    select.value = "self";
  }
}

async function fetchEmployees(silent = false) {
  try {
    const response = await api.get("/employees");
    const rows = response?.data?.employees;
    state.employees = Array.isArray(rows) ? rows : [];
    populateEmployees();
    fillDocumentPlaceholders(false);
  } catch (error) {
    if (!silent) showNotice("Không thể tải danh sách nhân viên để điền dữ liệu.", true);
  }
}

async function fetchRequests(silent = false) {
  try {
    const response = await api.get("/employee-requests");
    const rows = response?.data?.data?.requests;
    state.requests = Array.isArray(rows) ? rows : [];
    populateRequests();
    fillDocumentPlaceholders(false);
  } catch (error) {
    if (!silent) showNotice("Không thể tải danh sách đơn từ để điền dữ liệu.", true);
  }
}

function applyTemplate(templateId, notify = true) {
  if (!editor || editor.isDestroyed || !state.can.edit) return;
  const template = DOCUMENT_TEMPLATES.find((item) => item.id === templateId);
  if (!template) return;

  const titleInput = document.getElementById("documentEditorDocTitle");
  const numberInput = document.getElementById("documentEditorDocNumber");
  if (titleInput) titleInput.value = template.title;
  if (numberInput) numberInput.value = `01/${new Date().getFullYear()}/${template.number}`;
  setText("#documentEditorTemplateHint", template.description);

  editor.commands.setContent(template.content);
  fillDocumentPlaceholders(false);
  setText("#documentEditorStatus", `Đã áp dụng mẫu: ${template.name}.`);
  if (notify) showNotice(`Đã áp dụng mẫu “${template.name}” và điền dữ liệu.`);
  updateToolbar();
}

function populateTemplates() {
  const select = document.getElementById("documentEditorTemplate");
  if (!select) return;
  select.innerHTML = DOCUMENT_TEMPLATES.map(
    (template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}</option>`,
  ).join("");
  select.value = DOCUMENT_TEMPLATES[0]?.id || "";
  setText("#documentEditorTemplateHint", "Chọn mẫu rồi nhấn “Áp dụng mẫu” để thay thế nội dung hiện tại.");
}

function templateIdForRequestType(type) {
  return type === "TEMPORARY_LEAVE" ? "temporary-leave" : "resignation";
}

function setupRequestFlow(context) {
  if (!context) return false;

  const templateId = context.template_id || templateIdForRequestType(context.type);
  const savedDraft = readSessionJson(REQUEST_DOCUMENT_DRAFT_KEY);
  const formDraft = readSessionJson(REQUEST_FORM_DRAFT_KEY);

  state.requestContext = context;
  state.requestDraft =
    savedDraft && String(savedDraft.type) === String(context.type)
      ? savedDraft
      : formDraft && String(formDraft.type) === String(context.type)
        ? formDraft
        : null;
  state.can = { view: true, edit: true, export: true, manage: false };

  setText("#documentEditorTitle", "Soạn văn bản cho đơn từ");
  setText(
    "#documentEditorDescription",
    "Mẫu đã được chọn theo loại đơn. Chỉnh sửa nội dung rồi nhấn “Lưu và quay lại đơn”.",
  );
  setText("#documentEditorPermissionInfo", "Quyền: soạn văn bản đính kèm");

  const templateSelect = document.getElementById("documentEditorTemplate");
  if (templateSelect) templateSelect.value = templateId;
  const returnButton = document.getElementById("btnReturnFromRequestDocument");
  returnButton?.classList.remove("hidden");

  let initialContent = DEFAULT_CONTENT;
  if (savedDraft?.content) {
    initialContent = savedDraft.content;
    setDocumentMeta(savedDraft.meta || {});
    setText("#documentEditorStatus", "Đã tải lại văn bản bạn soạn trước đó.");
  } else {
    const template = DOCUMENT_TEMPLATES.find((item) => item.id === templateId);
    if (template) {
      initialContent = template.content;
      setDocumentMeta({
        title: template.title,
        number: `01/${new Date().getFullYear()}/${template.number}`,
      });
      setText("#documentEditorTemplateHint", template.description);
      const values = buildPlaceholderValues();
      initialContent = initialContent.replace(
        /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g,
        (match, key) => {
          const value = values[key];
          return value === undefined ? match : escapeHtml(value);
        },
      );
      setText("#documentEditorStatus", `Đã nạp mẫu: ${template.name}.`);
    }
  }

  if (editor && !editor.isDestroyed) editor.destroy();
  createEditor(initialContent);
  return true;
}

function saveRequestDocumentAndReturn() {
  const context = state.requestContext;
  if (!context || !editor || editor.isDestroyed) return;

  const meta = getDocumentMeta();
  const saved = writeSessionJson(REQUEST_DOCUMENT_DRAFT_KEY, {
    type: context.type,
    template_id: context.template_id || templateIdForRequestType(context.type),
    title: meta.title || DOCUMENT_TEMPLATES.find((item) => item.id === context.template_id)?.title || "Văn bản đơn từ",
    number: meta.number || "",
    meta,
    content: editor.getJSON(),
    html: editor.getHTML(),
    saved_at: new Date().toISOString(),
  });
  if (!saved) return;

  try {
    sessionStorage.setItem(REQUEST_RETURN_KEY, "1");
    sessionStorage.removeItem(REQUEST_CONTEXT_KEY);
  } catch (error) {
    showNotice("Không thể lưu trạng thái quay lại đơn.", true);
    return;
  }

  showNotice("Đã lưu văn bản. Đang quay lại form tạo đơn...");
  window.location.hash = context.return_hash || "#/don-tu";
}

function showNotice(message, isError = false) {
  const notice = document.getElementById("documentEditorNotice");
  if (!notice) return;
  notice.className = [
    "flex",
    "items-start",
    "gap-space-sm",
    "rounded-lg",
    "border",
    "px-space-md",
    "py-space-sm",
    "font-body-sm",
    "text-body-sm",
    isError ? "border-error/40 bg-error-container text-error" : "border-primary/30 bg-primary-fixed/60 text-on-primary-fixed",
  ].join(" ");
  notice.innerHTML = `
    <span class="material-symbols-outlined text-[18px] shrink-0">${isError ? "error" : "check_circle"}</span>
    <span></span>
  `;
  const messageSpan = notice.querySelector("span:last-child");
  if (messageSpan) messageSpan.textContent = message;
  notice.classList.remove("hidden");
}

function ensureViewMounted() {
  const view = document.querySelector("main > div");
  if (view && !view.querySelector("#documentEditorRoot")) view.innerHTML = documentEditorHtml;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function getDocumentMeta() {
  return {
    title: document.getElementById("documentEditorDocTitle")?.value?.trim() || "",
    number: document.getElementById("documentEditorDocNumber")?.value?.trim() || "",
  };
}

function setDocumentMeta(meta = {}) {
  const title = document.getElementById("documentEditorDocTitle");
  const number = document.getElementById("documentEditorDocNumber");
  if (title) title.value = meta.title || "";
  if (number) number.value = meta.number || "";
}

function markDirty() {
  const identity = currentEditorIdentity();
  state.dirty = true;
  state.lastEditedBy = identity.edited_by;
  state.lastEditedAt = identity.edited_at;
  state.restoredVersionNumber = null;
  setText("#documentEditorStatus", "Chưa lưu thay đổi.");
  renderAuditInfo();
}

function updateToolbar() {
  if (!editor || editor.isDestroyed) return;

  const activeMap = {
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    underline: editor.isActive("underline"),
    strike: editor.isActive("strike"),
    alignLeft: editor.isActive({ textAlign: "left" }),
    alignCenter: editor.isActive({ textAlign: "center" }),
    alignRight: editor.isActive({ textAlign: "right" }),
    alignJustify: editor.isActive({ textAlign: "justify" }),
    bulletList: editor.isActive("bulletList"),
    orderedList: editor.isActive("orderedList"),
    blockquote: editor.isActive("blockquote"),
  };

  document.querySelectorAll("[data-editor-action]").forEach((button) => {
    const action = button.getAttribute("data-editor-action");
    button.classList.toggle("is-active", Boolean(activeMap[action]));
    button.disabled = !state.can.edit;
    if (state.can.edit && action === "undo") button.disabled = !editor.can().chain().focus().undo().run();
    if (state.can.edit && action === "redo") button.disabled = !editor.can().chain().focus().redo().run();
  });

  const headingSelect = document.getElementById("documentEditorHeading");
  if (headingSelect) {
    headingSelect.value = editor.isActive("heading") ? String(editor.getAttributes("heading").level || "") : "";
  }

  const textStyle = editor.getAttributes("textStyle") || {};
  const fontSelect = document.getElementById("documentEditorFontFamily");
  if (fontSelect) {
    fontSelect.value = normalizeSelectValue(fontSelect, textStyle.fontFamily, DEFAULT_FONT_FAMILY);
  }
  const sizeSelect = document.getElementById("documentEditorFontSize");
  if (sizeSelect) {
    sizeSelect.value = normalizeSelectValue(sizeSelect, textStyle.fontSize, DEFAULT_FONT_SIZE);
  }
  const lineSelect = document.getElementById("documentEditorLineHeight");
  if (lineSelect) {
    lineSelect.value = normalizeSelectValue(lineSelect, textStyle.lineHeight, DEFAULT_LINE_HEIGHT);
  }

  const words = editor.storage.characterCount?.words?.() || 0;
  const characters = editor.storage.characterCount?.characters?.() || 0;
  setText("#documentEditorCount", `${words} từ • ${characters} ký tự`);
}

function applyPermissionUi() {
  if (editor && !editor.isDestroyed) editor.setEditable(state.can.edit);

  const editSelectors = [
    "[data-editor-action]",
    "#documentEditorHeading",
    "#documentEditorFontFamily",
    "#documentEditorFontSize",
    "#documentEditorLineHeight",
    "#documentEditorDocTitle",
    "#documentEditorDocNumber",
    "#documentEditorMarginTop",
    "#documentEditorMarginRight",
    "#documentEditorMarginBottom",
    "#documentEditorMarginLeft",
    "#documentEditorTemplate",
    "#btnApplyDocumentTemplate",
    "#documentEditorEmployeeSelect",
    "#documentEditorRequestSelect",
    "#btnFillDocumentData",
    "#btnSaveDocumentDraft",
    "#btnSaveDocumentLibrary",
    "#btnSaveDocumentVersion",
    "#btnLoadDocumentDraft",
    "#btnOpenSavedDocument",
    "#btnDeleteSavedDocument",
    "#btnRestoreDocumentVersion",
    "#btnDeleteDocumentVersion",
    "#btnResetDocumentEditor",
  ];
  editSelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element) => {
      element.disabled = !state.can.edit;
    });
  });

  const exportSelectors = [
    "#btnValidateDocumentFormat",
    "#btnExportDocumentJson",
    "#btnExportDocumentDocx",
    "#btnExportDocumentPdf",
    "#btnPrintDocument",
    "#btnArchiveDocumentDocx",
    "#btnArchiveDocumentPdf",
    "#btnDownloadOfficialFile",
    "#btnDownloadFileViewer",
  ];
  exportSelectors.forEach((selector) => {
    const element = document.querySelector(selector);
    if (element) element.disabled = !state.can.export;
  });

  const manageSelectors = ["#btnDeleteOfficialFile"];
  manageSelectors.forEach((selector) => {
    const element = document.querySelector(selector);
    if (element) element.disabled = !state.can.manage;
  });

  const viewSelectors = ["#btnViewOfficialFile"];
  viewSelectors.forEach((selector) => {
    const element = document.querySelector(selector);
    if (element) element.disabled = !state.can.view;
  });

  const labels = [];
  if (state.can.view) labels.push("Xem");
  if (state.can.edit) labels.push("Sửa");
  if (state.can.export) labels.push("Xuất");
  if (state.can.manage) labels.push("Quản lý");
  setText("#documentEditorPermissionInfo", `Quyền: ${labels.join(" / ") || "Không"}`);
}

function createEditor(initialContent = DEFAULT_CONTENT) {
  const element = document.getElementById("tiptapEditor");
  if (!element) return;

  editor = new Editor({
    element,
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
        },
      }),
      Placeholder.configure({ placeholder: "Nhập nội dung văn bản..." }),
      TextStyleKit.configure({
        backgroundColor: false,
        color: false,
        fontFamily: {},
        fontSize: {},
        lineHeight: {},
        textStyle: {},
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TableKit.configure({ table: { resizable: true } }),
      Image.configure({ allowBase64: false }),
      CharacterCount.configure({ limit: null }),
    ],
    content: initialContent,
    editorProps: {
      attributes: { class: "tiptap" },
    },
    onUpdate: () => {
      markDirty();
      updateToolbar();
    },
    onSelectionUpdate: () => updateToolbar(),
    onTransaction: () => updateToolbar(),
  });

  window.__HRM_DOCUMENT_EDITOR__ = editor;
}

function normalizeUrl(value) {
  if (/^https?:\/\//i.test(value) || value.startsWith("/")) return value;
  return `https://${value}`;
}

function safeFileName(value) {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "van-ban"
  );
}

function runAction(action, value) {
  if (!editor || editor.isDestroyed || !state.can.edit) return;

  switch (action) {
    case "undo":
      editor.chain().focus().undo().run();
      break;
    case "redo":
      editor.chain().focus().redo().run();
      break;
    case "bold":
      editor.chain().focus().toggleBold().run();
      break;
    case "italic":
      editor.chain().focus().toggleItalic().run();
      break;
    case "underline":
      editor.chain().focus().toggleUnderline().run();
      break;
    case "strike":
      editor.chain().focus().toggleStrike().run();
      break;
    case "alignLeft":
      editor.chain().focus().setTextAlign("left").run();
      break;
    case "alignCenter":
      editor.chain().focus().setTextAlign("center").run();
      break;
    case "alignRight":
      editor.chain().focus().setTextAlign("right").run();
      break;
    case "alignJustify":
      editor.chain().focus().setTextAlign("justify").run();
      break;
    case "bulletList":
      editor.chain().focus().toggleBulletList().run();
      break;
    case "orderedList":
      editor.chain().focus().toggleOrderedList().run();
      break;
    case "blockquote":
      editor.chain().focus().toggleBlockquote().run();
      break;
    case "insertTable":
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      break;
    case "addRow":
      editor.chain().focus().addRowAfter().run();
      break;
    case "addColumn":
      editor.chain().focus().addColumnAfter().run();
      break;
    case "deleteTable":
      editor.chain().focus().deleteTable().run();
      break;
    case "link": {
      const current = editor.getAttributes("link").href || "https://";
      const input = window.prompt("Nhập URL liên kết (để trống để xóa):", current);
      if (input === null) return;
      const trimmed = input.trim();
      if (!trimmed) {
        editor.chain().focus().extendMarkRange("link").unsetLink().run();
        return;
      }
      editor.chain().focus().extendMarkRange("link").setLink({ href: normalizeUrl(trimmed) }).run();
      break;
    }
    case "image": {
      const input = window.prompt("Nhập URL hình ảnh:", "https://");
      if (input === null) return;
      const trimmed = input.trim();
      if (!trimmed) return;
      editor.chain().focus().setImage({ src: normalizeUrl(trimmed), alt: "Hình ảnh văn bản" }).run();
      break;
    }
    case "clearMarks":
      editor.chain().focus().unsetAllMarks().run();
      break;
    default:
      break;
  }

  updateToolbar();
}

function saveDraft(showFeedback = true) {
  if (!editor || editor.isDestroyed || !state.can.edit) return;
  const meta = getDocumentMeta();
  const payload = {
    ...meta,
    document_id: state.activeDocumentId,
    version_id: state.activeVersionId,
    edited_by: state.lastEditedBy || currentEditorIdentity().edited_by,
    edited_at: state.lastEditedAt || new Date().toISOString(),
    page_size: "A4",
    margins: { ...pageMargins },
    content: editor.getJSON(),
    saved_at: new Date().toISOString(),
  };
  try {
    localStorage.setItem(draftKey(), JSON.stringify(payload));
    state.dirty = false;
    setText("#documentEditorStatus", `Đã lưu lúc ${formatTime(payload.saved_at)}.`);
    if (showFeedback) showNotice("Đã lưu bản nháp trên trình duyệt này.");
  } catch (error) {
    showNotice("Không thể lưu bản nháp. Kiểm tra dung lượng lưu trữ của trình duyệt.", true);
  }
}

function loadDraft(silent = false) {
  if (!editor || editor.isDestroyed) return false;
  let raw = null;
  try {
    raw = localStorage.getItem(draftKey());
  } catch (error) {
    if (!silent) showNotice("Không thể đọc bản nháp từ trình duyệt.", true);
    return false;
  }
  if (!raw) {
    if (!silent) showNotice("Chưa có bản nháp được lưu.", true);
    return false;
  }
  try {
    const payload = JSON.parse(raw);
    state.activeDocumentId = payload.document_id || null;
    if (
      state.activeDocumentId &&
      !readSavedDocuments().some((document) => String(document.id) === String(state.activeDocumentId))
    ) {
      state.activeDocumentId = null;
    }
    const savedEntry = readSavedDocuments().find(
      (document) => String(document.id) === String(state.activeDocumentId),
    );
    state.activeVersionId = payload.version_id || savedEntry?.current_version_id || null;
    state.restoredVersionNumber = savedEntry?.versions.find(
      (version) => String(version.id) === String(state.activeVersionId),
    )?.version_number || null;
    state.lastEditedBy = payload.edited_by || savedEntry?.updated_by || currentEditorIdentity().edited_by;
    state.lastEditedAt = payload.edited_at || payload.saved_at || savedEntry?.updated_at || null;
    state.dirty = false;
    setDocumentMeta(payload);
    writePageMargins(payload.margins);
    editor.commands.setContent(payload.content || DEFAULT_CONTENT, { emitUpdate: false });
    setText("#documentEditorStatus", payload.saved_at ? `Đã tải bản nháp lúc ${formatTime(payload.saved_at)}.` : "Đã tải bản nháp.");
    if (!silent) showNotice("Đã tải bản nháp lên trình soạn thảo.");
    renderDocumentVersions();
    updateToolbar();
    return true;
  } catch (error) {
    if (!silent) showNotice("Bản nháp bị lỗi định dạng. Vui lòng về mẫu mặc định.", true);
    return false;
  }
}

function resetEditor() {
  if (!editor || editor.isDestroyed || !state.can.edit) return;
  const confirmed = window.confirm("Xóa bản nháp hiện tại và quay về mẫu mặc định?");
  if (!confirmed) return;
  try {
    localStorage.removeItem(draftKey());
  } catch (error) {
    showNotice("Không thể xóa bản nháp khỏi trình duyệt.", true);
  }
  state.activeDocumentId = null;
  state.activeVersionId = null;
  state.restoredVersionNumber = null;
  state.lastEditedBy = currentEditorIdentity().edited_by;
  state.lastEditedAt = null;
  state.dirty = false;
  setDocumentMeta({});
  writePageMargins(DEFAULT_MARGINS);
  editor.commands.setContent(DEFAULT_CONTENT, { emitUpdate: false });
  setText("#documentEditorStatus", "Đã về mẫu mặc định.");
  showNotice("Đã khôi phục mẫu mặc định.");
  renderSavedDocuments();
  renderDocumentVersions();
  updateToolbar();
}

function exportJson() {
  if (!editor || editor.isDestroyed) return;
  if (!state.can.export) {
    showNotice("Bạn không có quyền xuất văn bản.", true);
    return;
  }
  const meta = getDocumentMeta();
  const payload = {
    ...meta,
    document_id: state.activeDocumentId,
    version_id: state.activeVersionId,
    edited_by: state.lastEditedBy || currentEditorIdentity().edited_by,
    edited_at: state.lastEditedAt || new Date().toISOString(),
    format: "tiptap-json",
    version: 1,
    page_size: "A4",
    margins: { ...pageMargins },
    content: editor.getJSON(),
    exported_at: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFileName(meta.title)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showNotice("Đã xuất nội dung văn bản dưới dạng Tiptap JSON.");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function collectTextMarks(marks = [], inherited = {}) {
  const result = { ...inherited };
  marks.forEach((mark) => {
    const attrs = mark.attrs || {};
    if (mark.type === "bold") result.bold = true;
    if (mark.type === "italic") result.italic = true;
    if (mark.type === "underline") result.underline = true;
    if (mark.type === "strike") result.strike = true;
    if (mark.type === "code") result.code = true;
    if (mark.type === "subscript") result.subscript = true;
    if (mark.type === "superscript") result.superscript = true;
    if (mark.type === "link") {
      result.underline = true;
      result.color = "0563C1";
    }
    if (["textStyle", "fontFamily", "fontSize", "lineHeight"].includes(mark.type)) {
      if (attrs.fontFamily) result.fontFamily = attrs.fontFamily;
      if (attrs.fontSize || attrs.size) result.fontSize = attrs.fontSize || attrs.size;
      if (attrs.lineHeight) result.lineHeight = attrs.lineHeight;
    }
  });
  return result;
}

function mmToTwip(value) {
  return convertInchesToTwip(Number(value || 0) / 25.4);
}

function fontSizeToHalfPoints(value) {
  const text = String(value || DEFAULT_FONT_SIZE);
  const match = text.match(/(\d+(?:\.\d+)?)\s*pt/i);
  const points = match ? Number(match[1]) : Number(text);
  return Math.min(144, Math.max(16, Math.round((Number.isFinite(points) ? points : 13) * 2)));
}

function lineHeightToTwip(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 240) : Math.round(1.5 * 240);
}

function normalizeDocxFont(value) {
  const font = String(value || DEFAULT_FONT_FAMILY).split(",")[0].replace(/^["']|["']$/g, "").trim();
  return font || "Times New Roman";
}

function buildTextRunOptions(marks = {}) {
  return {
    bold: marks.bold || undefined,
    italics: marks.italic || undefined,
    underline: marks.underline ? { type: UnderlineType.SINGLE } : undefined,
    strike: marks.strike || undefined,
    color: marks.color || undefined,
    font: marks.fontFamily || marks.code ? normalizeDocxFont(marks.fontFamily || "Courier New") : undefined,
    size: marks.fontSize ? fontSizeToHalfPoints(marks.fontSize) : undefined,
    subScript: marks.subscript || undefined,
    superScript: marks.superscript || undefined,
  };
}

function buildTextRuns(nodes = [], inheritedMarks = {}) {
  const runs = [];
  nodes.forEach((node) => {
    if (node.type !== "text") return;
    const options = buildTextRunOptions(collectTextMarks(node.marks, inheritedMarks));
    const segments = String(node.text || "").split("\n");
    segments.forEach((segment, index) => {
      if (index > 0) runs.push(new TextRun({ ...options, break: 1 }));
      if (segment) runs.push(new TextRun({ ...options, text: segment }));
    });
    if (!segments.some(Boolean)) runs.push(new TextRun(options));
  });
  return runs.length ? runs : [new TextRun("")];
}

function buildParagraphLineHeight(nodes = [], inheritedMarks = {}) {
  let lineHeight = inheritedMarks.lineHeight || DEFAULT_LINE_HEIGHT;
  nodes.forEach((node) => {
    const marks = collectTextMarks(node.marks, inheritedMarks);
    if (marks.lineHeight) lineHeight = marks.lineHeight;
  });
  return lineHeight;
}

function buildDocxParagraph(node, context = {}) {
  const content = node.content || [];
  const options = {
    children: buildTextRuns(content, context.marks || {}),
    alignment: DOCX_ALIGNMENTS[node.attrs?.textAlign] || AlignmentType.LEFT,
    spacing: { line: lineHeightToTwip(buildParagraphLineHeight(content, context.marks || {})) },
  };
  if (context.listType) {
    options.numbering = { reference: context.listType, level: Math.min(context.listLevel || 0, 8) };
  }
  if (context.quote) {
    options.indent = { left: convertInchesToTwip(0.4) };
    options.border = { left: { style: BorderStyle.SINGLE, size: 12, color: "9CA3AF" } };
  }
  if (node.type === "heading") {
    options.heading = DOCX_HEADING_LEVELS[node.attrs?.level] || HeadingLevel.HEADING_3;
  }
  return new DocxParagraph(options);
}

function plainTextFromTiptap(nodes = []) {
  return nodes
    .map((node) => {
      if (node.type === "text") return node.text || "";
      if (node.type === "hardBreak") return "\n";
      return plainTextFromTiptap(node.content || []);
    })
    .join("");
}

function tiptapListItemsToDocx(items = [], reference, level, context = {}) {
  const blocks = [];
  items.forEach((item) => {
    const itemContext = { ...context, listType: reference, listLevel: level };
    (item.content || []).forEach((child) => {
      if (child.type === "bulletList" || child.type === "orderedList") {
        const nestedReference = child.type === "bulletList" ? DOCX_BULLET_REFERENCE : DOCX_ORDERED_REFERENCE;
        blocks.push(...tiptapListItemsToDocx(child.content || [], nestedReference, level + 1, context));
        return;
      }
      if (child.type === "paragraph" || child.type === "heading") {
        blocks.push(buildDocxParagraph(child, itemContext));
        return;
      }
      blocks.push(...tiptapNodesToDocx([child], itemContext));
    });
  });
  return blocks;
}

function buildDocxTable(node, context = {}) {
  const rows = (node.content || []).filter((row) => row.type === "tableRow");
  const columnCount = Math.max(
    1,
    ...rows.map((row) => (row.content || []).filter((cell) => ["tableCell", "tableHeader"].includes(cell.type)).length),
  );
  const docxRows = rows.map((row, rowIndex) => {
    const cells = (row.content || []).filter((cell) => ["tableCell", "tableHeader"].includes(cell.type));
    const docxCells = cells.map((cell) => {
      const children = tiptapNodesToDocx(cell.content || [], context);
      return new TableCell({
        children: children.length ? children : [new DocxParagraph({ children: [new TextRun("")] })],
        width: { size: Math.floor(100 / columnCount), type: WidthType.PERCENTAGE },
        shading: cell.type === "tableHeader" ? { fill: "F3F4F6", color: "auto", val: "clear" } : undefined,
      });
    });
    while (docxCells.length < columnCount) {
      docxCells.push(new TableCell({ children: [new DocxParagraph({ children: [new TextRun("")] })] }));
    }
    return new TableRow({ children: docxCells, tableHeader: rowIndex === 0 });
  });
  return new DocxTable({
    rows: docxRows.length ? docxRows : [new TableRow({ children: [new TableCell({ children: [new DocxParagraph("")] })] })],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: ["top", "left", "bottom", "right", "insideHorizontal", "insideVertical"].reduce((acc, side) => {
      acc[side] = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
      return acc;
    }, {}),
  });
}

function tiptapNodesToDocx(nodes = [], context = {}) {
  const blocks = [];
  nodes.forEach((node) => {
    if (node.type === "paragraph" || node.type === "heading") {
      blocks.push(buildDocxParagraph(node, context));
    } else if (node.type === "bulletList" || node.type === "orderedList") {
      const reference = node.type === "bulletList" ? DOCX_BULLET_REFERENCE : DOCX_ORDERED_REFERENCE;
      blocks.push(...tiptapListItemsToDocx(node.content || [], reference, context.listLevel || 0, context));
    } else if (node.type === "blockquote") {
      blocks.push(...tiptapNodesToDocx(node.content || [], { ...context, quote: true }));
    } else if (node.type === "table") {
      blocks.push(buildDocxTable(node, context));
    } else if (node.type === "horizontalRule") {
      blocks.push(
        new DocxParagraph({
          children: [new TextRun("")],
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" } },
        }),
      );
    } else if (node.type === "hardBreak") {
      blocks.push(new DocxParagraph({ children: [new TextRun({ break: 1 })] }));
    } else if (node.type === "image") {
      blocks.push(new DocxParagraph({ children: [new TextRun(`[${node.attrs?.alt || "Hình ảnh"}]`)] }));
    } else if (node.type === "codeBlock") {
      blocks.push(
        new DocxParagraph({
          children: [new TextRun({ text: plainTextFromTiptap(node.content || []), font: "Courier New" })],
        }),
      );
    } else if (node.content) {
      blocks.push(...tiptapNodesToDocx(node.content, context));
    }
  });
  return blocks.length ? blocks : [new DocxParagraph({ children: [new TextRun("")] })];
}

function buildDocxNumberingConfig() {
  const levels = Array.from({ length: 9 }, (_, level) => level);
  return [
    {
      reference: DOCX_BULLET_REFERENCE,
      levels: levels.map((level) => ({
        level,
        format: LevelFormat.BULLET,
        text: "•",
        alignment: AlignmentType.LEFT,
      })),
    },
    {
      reference: DOCX_ORDERED_REFERENCE,
      levels: levels.map((level) => ({
        level,
        format: LevelFormat.DECIMAL,
        text: "%1.",
        alignment: AlignmentType.START,
      })),
    },
  ];
}

function getActiveVersionNumber() {
  const entry = readSavedDocuments().find((document) => document.id === state.activeDocumentId);
  return entry?.versions.find((version) => String(version.id) === String(state.activeVersionId))?.version_number || entry?.versions[0]?.version_number || null;
}

function validateDocumentFormat(format) {
  const errors = [];
  const warnings = [];
  const addWarning = (message) => {
    if (!warnings.includes(message)) warnings.push(message);
  };

  if (!editor || editor.isDestroyed) {
    errors.push("Trình soạn thảo chưa sẵn sàng.");
    return { valid: false, errors, warnings };
  }

  const json = editor.getJSON();
  if (!json || json.type !== "doc" || !Array.isArray(json.content)) {
    errors.push("Cấu trúc nội dung không đúng Tiptap JSON.");
  } else {
    if (!json.content.length) errors.push("Văn bản đang trống.");
    if (!plainTextFromTiptap(json.content).trim()) errors.push("Văn bản không có nội dung chữ để xuất.");
    if (/\{\{\s*[a-zA-Z0-9_.]+\s*\}\}/.test(editor.getHTML())) {
      addWarning("Văn bản vẫn còn placeholder {{...}} chưa được điền dữ liệu.");
    }

    const allowedNodes = new Set([
      "doc", "paragraph", "text", "heading", "bulletList", "orderedList", "listItem", "blockquote",
      "codeBlock", "horizontalRule", "hardBreak", "table", "tableRow", "tableCell", "tableHeader", "image",
    ]);
    const allowedMarks = new Set([
      "bold", "italic", "underline", "strike", "code", "link", "subscript", "superscript",
      "textStyle", "fontFamily", "fontSize", "lineHeight", "highlight",
    ]);

    const walk = (nodes) => {
      (nodes || []).forEach((node) => {
        if (!allowedNodes.has(node.type)) addWarning(`Node “${node.type}” có thể không hiển thị đúng khi xuất ${format}.`);
        if (node.type === "heading" && Number(node.attrs?.level) > 6) {
          addWarning("Tiêu đề cấp quá cao sẽ được xuất ở cấp Tiêu đề 6.");
        }
        if (node.type === "table") {
          const rows = (node.content || []).filter((row) => row.type === "tableRow");
          if (!rows.length) errors.push("Bảng không có dòng dữ liệu.");
          rows.forEach((row, index) => {
            const cells = (row.content || []).filter((cell) => ["tableCell", "tableHeader"].includes(cell.type));
            if (!cells.length) errors.push(`Dòng bảng ${index + 1} không có ô dữ liệu.`);
          });
        }
        (node.marks || []).forEach((mark) => {
          if (!allowedMarks.has(mark.type)) addWarning(`Định dạng “${mark.type}” có thể không được giữ lại khi xuất ${format}.`);
        });
        if (node.content) walk(node.content);
      });
    };
    walk(json.content);
  }

  const meta = getDocumentMeta();
  if (!meta.title) addWarning("Chưa có tên văn bản nên tên file xuất sẽ dùng tên mặc định.");
  Object.entries(pageMargins).forEach(([side, value]) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 50) {
      errors.push(`Lề ${side} phải nằm trong khoảng 0–50 mm.`);
    }
  });

  if (format === "PDF") {
    const sheet = document.querySelector(".a4-sheet");
    if (!sheet) errors.push("Không tìm thấy trang A4 để tạo PDF.");
    else {
      const externalImages = sheet.querySelectorAll('img[src^="http://"], img[src^="https://"]');
      if (externalImages.length) {
        addWarning(`PDF có ${externalImages.length} ảnh từ URL bên ngoài; ảnh có thể bị chặn bởi CORS.`);
      }
      if (sheet.scrollHeight > 1200) {
        addWarning("Nội dung dài hơn một trang A4; PDF sẽ được phân trang tự động.");
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

async function validateGeneratedFile(blob, format) {
  const errors = [];
  const warnings = [];
  if (!(blob instanceof Blob) || !blob.size) {
    errors.push(`File ${format} xuất ra rỗng.`);
    return { valid: false, errors, warnings };
  }

  if (format === "DOCX") {
    const header = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    const isZip = header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04;
    if (!isZip) errors.push("File DOCX không đúng cấu trúc ZIP/OOXML.");
  }

  if (format === "PDF") {
    const header = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer());
    if (!header.startsWith("%PDF-")) errors.push("File PDF không đúng định dạng.");
    const tail = new TextDecoder().decode(await blob.slice(Math.max(0, blob.size - 1024)).arrayBuffer());
    if (!tail.includes("%%EOF")) warnings.push("File PDF thiếu marker kết thúc %%EOF.");
  }

  return { valid: errors.length === 0, errors, warnings };
}

function renderValidationResult(result, label) {
  const panel = document.getElementById("documentEditorValidationInfo");
  if (!panel) return;
  const lines = [
    `<strong>${escapeHtml(label)}: ${result.valid ? "Hợp lệ" : "Có lỗi"}</strong>`,
    ...result.errors.map((error) => `<span>• Lỗi: ${escapeHtml(error)}</span>`),
    ...result.warnings.map((warning) => `<span>• Cảnh báo: ${escapeHtml(warning)}</span>`),
  ];
  if (result.valid && !result.warnings.length) lines.push("<span>Không phát hiện lỗi định dạng.</span>");
  panel.className = `flex flex-col gap-1 rounded-lg border px-space-md py-space-sm font-body-sm text-body-sm ${
    result.valid ? "border-primary/30 bg-primary-fixed/60 text-on-primary-fixed" : "border-error/40 bg-error-container text-error"
  }`;
  panel.innerHTML = lines.join("");
  panel.classList.remove("hidden");
}

function validateBeforeExport(format) {
  const result = validateDocumentFormat(format);
  renderValidationResult(result, `Kiểm tra ${format}`);
  if (!result.valid) {
    showNotice(result.errors[0], true);
    return false;
  }
  if (result.warnings.length) showNotice(`${format}: ${result.warnings[0]}`);
  return true;
}

function runFormatCheck() {
  if (!state.can.export) {
    showNotice("Bạn không có quyền kiểm tra xuất văn bản.", true);
    return;
  }
  const docx = validateDocumentFormat("DOCX");
  const pdf = validateDocumentFormat("PDF");
  const errors = [...docx.errors, ...pdf.errors].filter((value, index, list) => list.indexOf(value) === index);
  const warnings = [...docx.warnings, ...pdf.warnings].filter((value, index, list) => list.indexOf(value) === index);
  const result = { valid: errors.length === 0, errors, warnings };
  renderValidationResult(result, "Kiểm tra DOCX/PDF");
  if (!result.valid) showNotice(result.errors[0], true);
  else if (result.warnings.length) showNotice(`Có ${result.warnings.length} cảnh báo định dạng. Vẫn có thể xuất file.`);
  else showNotice("Định dạng DOCX/PDF hợp lệ.");
}

async function generateDocxBlob() {
  const docx = new DocxDocument({
    numbering: { config: buildDocxNumberingConfig() },
    sections: [
      {
        properties: {
          page: {
            size: { width: mmToTwip(210), height: mmToTwip(297) },
            margin: {
              top: mmToTwip(pageMargins.top),
              right: mmToTwip(pageMargins.right),
              bottom: mmToTwip(pageMargins.bottom),
              left: mmToTwip(pageMargins.left),
            },
          },
        },
        children: tiptapNodesToDocx(editor.getJSON().content || []),
      },
    ],
  });
  return Packer.toBlob(docx);
}

async function generatePdfBlob() {
  const sheet = document.querySelector(".a4-sheet");
  if (!sheet) throw new Error("Không tìm thấy trang A4 để tạo PDF.");
  const module = await import("html2pdf.js");
  const html2pdf = module.default || module.html2pdf;
  const meta = getDocumentMeta();
  return html2pdf()
    .set({
      margin: 0,
      filename: `${safeFileName(meta.title)}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      enableLinks: false,
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        imageTimeout: 15000,
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] },
    })
    .from(sheet)
    .toPdf()
    .output("blob");
}

async function fetchOfficialFileBlob(fileId, disposition = "download") {
  const response = await api.get(
    `/documents/${state.activeDocumentId}/files/${fileId}/${disposition}`,
    { responseType: "blob" },
  );
  return response.data;
}

function mapServerFile(file = {}, blob = null) {
  return {
    id: file.id,
    user_id: state.user?.user_id,
    document_id: file.document_id || state.activeDocumentId,
    title: getDocumentMeta().title || "Văn bản",
    number: getDocumentMeta().number || "",
    version_id: file.version_id || state.activeVersionId,
    version_number: getActiveVersionNumber(),
    format: file.file_format,
    file_name: file.file_name || `van-ban.${String(file.file_format || "docx").toLowerCase()}`,
    mime_type: file.mime_type,
    size: Number(file.file_size || 0),
    blob,
    created_by: file.uploaded_by_name || "Máy chủ",
    created_at: file.created_at || new Date().toISOString(),
    format_check_status: file.format_check_status || "NOT_CHECKED",
    server: true,
  };
}

async function syncOfficialFilesFromServer(silent = false) {
  if (!isBackendId(state.activeDocumentId)) return false;
  try {
    const response = await api.get(`/documents/${state.activeDocumentId}/files`);
    const files = response.data?.data || [];
    for (const file of files) {
      const existing = await getOfficialFile(file.id);
      await putOfficialFile(mapServerFile(file, existing?.blob || null));
    }
    await renderOfficialFiles();
    if (!silent && files.length) showNotice(`Đã đồng bộ ${files.length} file từ máy chủ.`);
    return true;
  } catch (error) {
    if (!silent) showNotice(apiErrorMessage(error, "Không thể đồng bộ file từ máy chủ."), true);
    return false;
  }
}

async function archiveOfficialFileFromServer(format) {
  const response = await api.post(`/documents/${state.activeDocumentId}/export`, {
    format,
    version_id: isBackendId(state.activeVersionId) ? Number(state.activeVersionId) : undefined,
  });
  const file = response.data?.data || {};
  if (!file.id) throw new Error("Máy chủ không trả về mã file");
  const blob = await fetchOfficialFileBlob(file.id, "download");
  const check = await validateGeneratedFile(blob, format);
  renderValidationResult(check, `Kiểm tra file ${format} từ máy chủ`);
  if (!check.valid) throw new Error(check.errors[0]);
  const record = mapServerFile(file, blob);
  await putOfficialFile(record);
  state.selectedOfficialFileId = record.id;
  await renderOfficialFiles();
  return record;
}

async function archiveOfficialFile(blob, format) {
  const meta = getDocumentMeta();
  const createdAt = new Date().toISOString();
  const versionNumber = getActiveVersionNumber();
  const extension = format.toLowerCase();
  const record = {
    id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    user_id: state.user?.user_id,
    document_id: state.activeDocumentId,
    title: meta.title || "Văn bản chưa đặt tên",
    number: meta.number || "",
    version_id: state.activeVersionId,
    version_number: versionNumber,
    format,
    file_name: `${safeFileName(meta.title || "van-ban")}${versionNumber ? `-v${versionNumber}` : ""}-${createdAt.slice(0, 10)}.${extension}`,
    mime_type: format === "PDF" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: blob.size,
    blob,
    created_by: currentEditorIdentity().edited_by,
    created_at: createdAt,
  };
  await putOfficialFile(record);
  state.selectedOfficialFileId = record.id;
  await renderOfficialFiles();
  return record;
}

async function finishExport(blob, format, meta) {
  if (isBackendId(state.activeDocumentId)) {
    try {
      if (state.dirty && state.can.edit) await saveDocumentToLibrary();
      const record = await archiveOfficialFileFromServer(format);
      downloadBlob(record.blob, record.file_name);
      setText("#documentEditorStatus", `Đã xuất ${format} lúc ${formatTime(record.created_at)}.`);
      showNotice(`Đã xuất ${format} và lưu lên máy chủ.`);
      return true;
    } catch (error) {
      showNotice(`${apiErrorMessage(error, "Không thể lưu file trên máy chủ")}. Đang dùng bản địa.`, true);
    }
  }

  const finalBlob = blob || (format === "PDF" ? await generatePdfBlob() : await generateDocxBlob());
  const check = await validateGeneratedFile(finalBlob, format);
  renderValidationResult(check, `Kiểm tra file ${format}`);
  if (!check.valid) {
    showNotice(check.errors[0], true);
    return false;
  }
  downloadBlob(finalBlob, `${safeFileName(meta.title || "van-ban")}.${format.toLowerCase()}`);
  try {
    await archiveOfficialFile(finalBlob, format);
  } catch (error) {
    showNotice(`Đã xuất ${format} nhưng không lưu được vào kho file.`, true);
  }
  setText("#documentEditorStatus", `Đã xuất ${format} lúc ${formatTime(new Date().toISOString())}.`);
  if (!check.warnings.length) showNotice(`Đã xuất ${format} và lưu vào kho văn bản chính thức.`);
  return true;
}

async function exportDocx() {
  if (!editor || editor.isDestroyed) return;
  if (!state.can.export) {
    showNotice("Bạn không có quyền xuất văn bản.", true);
    return;
  }
  if (!validateBeforeExport("DOCX")) return;
  const button = document.getElementById("btnExportDocumentDocx");
  if (button) button.disabled = true;
  setText("#documentEditorStatus", "Đang tạo file DOCX...");
  try {
    const meta = getDocumentMeta();
    const blob = isBackendId(state.activeDocumentId) ? null : await generateDocxBlob();
    await finishExport(blob, "DOCX", meta);
  } catch (error) {
    showNotice("Không thể xuất DOCX. Vui lòng thử lại.", true);
  } finally {
    if (button) button.disabled = false;
    applyPermissionUi();
  }
}

async function exportPdf() {
  if (!editor || editor.isDestroyed) return;
  if (!state.can.export) {
    showNotice("Bạn không có quyền xuất văn bản.", true);
    return;
  }
  if (!validateBeforeExport("PDF")) return;
  const button = document.getElementById("btnExportDocumentPdf");
  if (button) button.disabled = true;
  setText("#documentEditorStatus", "Đang tạo file PDF...");
  try {
    const meta = getDocumentMeta();
    const blob = isBackendId(state.activeDocumentId) ? null : await generatePdfBlob();
    await finishExport(blob, "PDF", meta);
  } catch (error) {
    showNotice("Không thể xuất PDF. Vui lòng thử lại.", true);
  } finally {
    if (button) button.disabled = false;
    applyPermissionUi();
  }
}

async function archiveCurrentAs(format) {
  if (!state.can.export) {
    showNotice("Bạn không có quyền lưu file chính thức.", true);
    return;
  }
  if (!validateBeforeExport(format)) return;
  const button = document.getElementById(format === "PDF" ? "btnArchiveDocumentPdf" : "btnArchiveDocumentDocx");
  if (button) button.disabled = true;
  setText("#documentEditorStatus", `Đang lưu file ${format} chính thức...`);
  try {
    let record;
    if (isBackendId(state.activeDocumentId)) {
      if (state.dirty && state.can.edit) await saveDocumentToLibrary();
      record = await archiveOfficialFileFromServer(format);
    } else {
      const blob = format === "PDF" ? await generatePdfBlob() : await generateDocxBlob();
      const check = await validateGeneratedFile(blob, format);
      renderValidationResult(check, `Kiểm tra file ${format}`);
      if (!check.valid) {
        showNotice(check.errors[0], true);
        return;
      }
      record = await archiveOfficialFile(blob, format);
    }
    setText("#documentEditorStatus", `Đã lưu file ${format} lúc ${formatTime(record.created_at)}.`);
    showNotice(
      record.server
        ? `Đã lưu file ${format} lên máy chủ.`
        : `Đã lưu file ${format} vào kho văn bản chính thức.`,
    );
  } catch (error) {
    showNotice(`Không thể lưu file ${format} chính thức.`, true);
  } finally {
    if (button) button.disabled = false;
    applyPermissionUi();
  }
}

async function renderOfficialFiles() {
  const select = document.getElementById("documentEditorOfficialFileSelect");
  if (!select) return;
  try {
    const files = await listOfficialFiles();
    select.innerHTML = files.length
      ? files
          .map(
            (file) =>
              `<option value="${escapeHtml(file.id)}">${escapeHtml(file.title || "Văn bản")} • ${escapeHtml(file.format)} • ${escapeHtml(formatSavedAt(file.created_at))}</option>`,
          )
          .join("")
      : '<option value="">Chưa có file chính thức</option>';
    if (
      state.selectedOfficialFileId &&
      files.some((file) => String(file.id) === String(state.selectedOfficialFileId))
    ) {
      select.value = String(state.selectedOfficialFileId);
    }
    setText("#documentEditorOfficialCount", `${files.length} file`);
    const selected = files.find((file) => String(file.id) === String(select.value));
    if (selected) {
      state.selectedOfficialFileId = selected.id;
      setText(
        "#documentEditorOfficialFileInfo",
        `${selected.format} • ${(selected.size / 1024).toFixed(1)} KB • ${selected.created_by} • ${formatSavedAt(selected.created_at)}${selected.version_number ? ` • phiên bản #${selected.version_number}` : ""}`,
      );
    } else {
      state.selectedOfficialFileId = null;
      setText("#documentEditorOfficialFileInfo", "Chưa có file nào được chọn.");
    }
    const viewButton = document.getElementById("btnViewOfficialFile");
    const downloadButton = document.getElementById("btnDownloadOfficialFile");
    const deleteButton = document.getElementById("btnDeleteOfficialFile");
    if (viewButton) viewButton.disabled = !selected || !state.can.view;
    if (downloadButton) downloadButton.disabled = !selected || !state.can.export;
    if (deleteButton) deleteButton.disabled = !selected || !state.can.manage;
  } catch (error) {
    select.innerHTML = '<option value="">Không thể đọc kho file</option>';
    setText("#documentEditorOfficialCount", "0 file");
    setText("#documentEditorOfficialFileInfo", "Trình duyệt không hỗ trợ kho file hoặc kho file bị lỗi.");
  }
}

async function downloadOfficialFile(id) {
  if (!state.can.export) {
    showNotice("Bạn không có quyền tải văn bản.", true);
    return;
  }
  try {
    let record = await getOfficialFile(id);
    if (!record && isBackendId(id)) {
      await syncOfficialFilesFromServer(true);
      record = await getOfficialFile(id);
    }
    if (!record) {
      showNotice("Không tìm thấy file cần tải.", true);
      return;
    }
    const blob = isBackendId(id)
      ? await fetchOfficialFileBlob(id, "download")
      : record.blob;
    downloadBlob(blob, record.file_name || `van-ban.${String(record.format || "docx").toLowerCase()}`);
  } catch (error) {
    showNotice(apiErrorMessage(error, "Không thể tải file từ kho."), true);
  }
}

function closeFileViewer() {
  const viewer = document.getElementById("documentEditorFileViewer");
  const body = document.getElementById("documentEditorFileViewerBody");
  if (state.viewerObjectUrl) URL.revokeObjectURL(state.viewerObjectUrl);
  state.viewerObjectUrl = null;
  state.viewingFileId = null;
  if (body) body.innerHTML = "";
  if (viewer) {
    viewer.classList.add("hidden");
    viewer.classList.remove("flex");
  }
}

async function viewOfficialFile(id) {
  if (!state.can.view) {
    showNotice("Bạn không có quyền xem văn bản.", true);
    return;
  }
  try {
    let record = await getOfficialFile(id);
    if (!record && isBackendId(id)) {
      await syncOfficialFilesFromServer(true);
      record = await getOfficialFile(id);
    }
    if (!record) {
      showNotice("Không tìm thấy file cần xem.", true);
      return;
    }
    const blob = isBackendId(id) ? await fetchOfficialFileBlob(id, "view") : record.blob;
    closeFileViewer();
    state.viewingFileId = record.id;
    const viewer = document.getElementById("documentEditorFileViewer");
    const body = document.getElementById("documentEditorFileViewerBody");
    if (!viewer || !body) return;
    setText("#documentEditorFileViewerTitle", record.title || "Xem văn bản");
    setText(
      "#documentEditorFileViewerMeta",
      `${record.format} • ${(record.size / 1024).toFixed(1)} KB • ${record.created_by} • ${formatSavedAt(record.created_at)}`,
    );
    viewer.classList.remove("hidden");
    viewer.classList.add("flex");

    if (record.format === "PDF") {
      const url = URL.createObjectURL(blob);
      state.viewerObjectUrl = url;
      body.innerHTML = `<iframe class="h-full w-full bg-white" src="${escapeHtml(url)}" title="${escapeHtml(record.title || "Văn bản")}"></iframe>`;
      return;
    }

    body.innerHTML = '<div class="docx-viewer-paper"></div>';
    const container = body.firstElementChild;
    const { renderAsync } = await import("docx-preview");
    await renderAsync(blob, container, container, { className: "docx-preview" });
  } catch (error) {
    const body = document.getElementById("documentEditorFileViewerBody");
    if (body) body.innerHTML = '<p class="rounded bg-error-container p-4 text-error">Không thể hiển thị file này trong trình duyệt.</p>';
    showNotice("Không thể xem file. Bạn có thể tải file về máy.", true);
  }
}

function bindOnce(element, eventName, handler) {
  if (element) element.addEventListener(eventName, handler);
}

function bindEvents() {
  if (state.bound) return;

  bindOnce(
    document.getElementById("btnReturnFromRequestDocument"),
    "click",
    saveRequestDocumentAndReturn,
  );

  document.querySelectorAll("[data-editor-action]").forEach((button) => {
    bindOnce(button, "click", () => runAction(button.getAttribute("data-editor-action")));
  });

  bindOnce(document.getElementById("documentEditorHeading"), "change", (event) => {
    const level = Number(event.target.value);
    if (!level) editor.chain().focus().setParagraph().run();
    else editor.chain().focus().toggleHeading({ level }).run();
    updateToolbar();
  });

  bindOnce(document.getElementById("documentEditorFontFamily"), "change", (event) => {
    editor.chain().focus().setFontFamily(event.target.value).run();
    updateToolbar();
  });

  bindOnce(document.getElementById("documentEditorFontSize"), "change", (event) => {
    editor.chain().focus().setFontSize(event.target.value).run();
    updateToolbar();
  });

  bindOnce(document.getElementById("documentEditorLineHeight"), "change", (event) => {
    editor.chain().focus().setLineHeight(event.target.value).run();
    updateToolbar();
  });

  ["Top", "Right", "Bottom", "Left"].forEach((side) => {
    bindOnce(document.getElementById(`documentEditorMargin${side}`), "input", () => {
      pageMargins = readPageMargins();
      applyPageMargins();
      markDirty();
    });
  });

  bindOnce(document.getElementById("btnApplyDocumentTemplate"), "click", () => {
    applyTemplate(document.getElementById("documentEditorTemplate")?.value);
  });

  bindOnce(document.getElementById("documentEditorEmployeeSelect"), "change", () => {
    fillDocumentPlaceholders(true);
  });

  bindOnce(document.getElementById("documentEditorRequestSelect"), "change", () => {
    syncEmployeeFromRequest();
    fillDocumentPlaceholders(true);
  });

  bindOnce(document.getElementById("btnFillDocumentData"), "click", () => {
    fillDocumentPlaceholders(true);
  });

  ["documentEditorDocTitle", "documentEditorDocNumber"].forEach((id) => {
    bindOnce(document.getElementById(id), "input", markDirty);
  });

  bindOnce(document.getElementById("btnSaveDocumentDraft"), "click", () => saveDraft(true));
  bindOnce(document.getElementById("btnSaveDocumentLibrary"), "click", saveDocumentToLibrary);
  bindOnce(document.getElementById("btnSaveDocumentVersion"), "click", saveDocumentToLibrary);
  bindOnce(document.getElementById("btnLoadDocumentDraft"), "click", () => loadDraft(false));
  bindOnce(document.getElementById("btnOpenSavedDocument"), "click", () => {
    openSavedDocument(document.getElementById("documentEditorSavedDocSelect")?.value);
  });
  bindOnce(document.getElementById("btnDeleteSavedDocument"), "click", () => {
    deleteSavedDocument(document.getElementById("documentEditorSavedDocSelect")?.value);
  });
  bindOnce(document.getElementById("btnRestoreDocumentVersion"), "click", () => {
    restoreDocumentVersion(document.getElementById("documentEditorVersionSelect")?.value);
  });
  bindOnce(document.getElementById("btnDeleteDocumentVersion"), "click", () => {
    deleteDocumentVersion(document.getElementById("documentEditorVersionSelect")?.value);
  });
  bindOnce(document.getElementById("btnValidateDocumentFormat"), "click", runFormatCheck);
  bindOnce(document.getElementById("btnExportDocumentJson"), "click", exportJson);
  bindOnce(document.getElementById("btnExportDocumentDocx"), "click", exportDocx);
  bindOnce(document.getElementById("btnExportDocumentPdf"), "click", exportPdf);
  bindOnce(document.getElementById("btnArchiveDocumentDocx"), "click", () => archiveCurrentAs("DOCX"));
  bindOnce(document.getElementById("btnArchiveDocumentPdf"), "click", () => archiveCurrentAs("PDF"));
  bindOnce(document.getElementById("btnPrintDocument"), "click", () => {
    if (state.can.export) window.print();
    else showNotice("Bạn không có quyền in hoặc xuất văn bản.", true);
  });
  bindOnce(document.getElementById("btnResetDocumentEditor"), "click", resetEditor);

  bindOnce(document.getElementById("documentEditorOfficialFileSelect"), "change", (event) => {
    state.selectedOfficialFileId = event.target.value || null;
    renderOfficialFiles();
  });
  bindOnce(document.getElementById("btnViewOfficialFile"), "click", () => {
    viewOfficialFile(document.getElementById("documentEditorOfficialFileSelect")?.value);
  });
  bindOnce(document.getElementById("btnDownloadOfficialFile"), "click", () => {
    downloadOfficialFile(document.getElementById("documentEditorOfficialFileSelect")?.value);
  });
  bindOnce(document.getElementById("btnDeleteOfficialFile"), "click", async () => {
    const id = document.getElementById("documentEditorOfficialFileSelect")?.value;
    if (!id || !state.can.manage) return;
    if (!window.confirm("Xóa file văn bản chính thức này khỏi kho?")) return;
    try {
      if (isBackendId(id)) {
        await api.delete(`/documents/${state.activeDocumentId}/files/${id}`);
      }
      await removeOfficialFile(id);
      state.selectedOfficialFileId = null;
      await renderOfficialFiles();
      showNotice("Đã xóa file khỏi kho văn bản chính thức.");
    } catch (error) {
      showNotice(apiErrorMessage(error, "Không thể xóa file khỏi kho."), true);
    }
  });
  bindOnce(document.getElementById("btnCloseFileViewer"), "click", closeFileViewer);
  bindOnce(document.getElementById("btnDownloadFileViewer"), "click", () => {
    downloadOfficialFile(state.viewingFileId);
  });
  bindOnce(document.getElementById("documentEditorFileViewer"), "click", (event) => {
    if (event.target.id === "documentEditorFileViewer") closeFileViewer();
  });

  state.bound = true;
}

export function initDocumentEditor(user = getCurrentUser(), options = {}) {
  if (!user) {
    logout();
    return;
  }

  const requestContext = options.requestFlow ? readSessionJson(REQUEST_CONTEXT_KEY) : null;
  state = {
    user,
    can: requestContext
      ? { view: true, edit: true, export: true, manage: false }
      : resolveCapabilities(user),
    bound: false,
    employees: [],
    requests: [],
    activeDocumentId: null,
    activeVersionId: null,
    restoredVersionNumber: null,
    lastEditedBy: null,
    lastEditedAt: null,
    selectedOfficialFileId: null,
    viewingFileId: null,
    viewerObjectUrl: null,
    dirty: false,
    requestContext: null,
    requestDraft: null,
  };
  state.lastEditedBy = currentEditorIdentity().edited_by;
  ensureViewMounted();
  writePageMargins(DEFAULT_MARGINS);
  if (!window.__HRM_SPA__) setupShell(user);

  if (window.__HRM_DOCUMENT_EDITOR__ && !window.__HRM_DOCUMENT_EDITOR__.isDestroyed) {
    window.__HRM_DOCUMENT_EDITOR__.destroy();
  }
  if (editor && !editor.isDestroyed) editor.destroy();

  createEditor();
  populateTemplates();
  const inRequestFlow = setupRequestFlow(requestContext);
  if (!inRequestFlow) {
    document.getElementById("btnReturnFromRequestDocument")?.classList.add("hidden");
  }
  bindEvents();
  if (!inRequestFlow) {
    loadDraft(true);
    renderSavedDocuments();
    renderDocumentVersions();
    fetchEmployees(true);
    fetchRequests(true);
    renderOfficialFiles();
  }
  updateToolbar();
  applyPermissionUi();
  if (!inRequestFlow) {
    void (async () => {
      await syncDocumentsFromServer(true);
      if (isBackendId(state.activeDocumentId)) await syncOfficialFilesFromServer(true);
    })();
  }
}
