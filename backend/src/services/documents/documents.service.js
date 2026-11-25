import crypto from "node:crypto";
import { db } from "../../config/database.js";
import { hasPermission } from "../../utils/helper.js";
import {
  buildFileName,
  renderDocumentFile,
  tiptapToHtml,
} from "./documentRendering.service.js";

const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });

const FULL_ROLES = ["SUPER_ADMIN", "HR_ADMIN"];
const VIEW_ONLY_ROLES = ["MANAGER", "EMPLOYEE", "CB_PAYROLL"];
const EXPORT_ROLES = [...FULL_ROLES, "DIRECTOR", "OFFICE_ADMIN"];
const VIEW_ALL_ROLES = [...EXPORT_ROLES];
const VIEW_ROLES = [...EXPORT_ROLES, ...VIEW_ONLY_ROLES];
const DOCUMENT_STATUSES = ["DRAFT", "OFFICIAL", "ARCHIVED"];
const VISIBILITIES = ["PRIVATE", "DEPARTMENT", "ROLE", "ALL"];
const FILE_FORMATS = ["DOCX", "PDF"];

const DOCUMENT_COLUMNS = `d.id, d.document_code, d.document_number, d.title,
  d.document_type, d.template_code, d.request_id, d.employee_id, d.department_id,
  d.employee_code_snapshot, d.employee_name_snapshot, d.department_name_snapshot,
  d.owner_user_id, d.owner_role_id, d.created_by, d.updated_by,
  d.visibility, d.allowed_roles, d.can_edit_roles, d.can_export_roles,
  d.status, d.page_size, d.margin_top, d.margin_right, d.margin_bottom, d.margin_left,
  d.current_version_id, d.archived_at, d.created_at, d.updated_at`;

const VERSION_SUMMARY_COLUMNS = `v.id, v.document_id, v.version_number, v.title,
  v.document_number, v.template_code, v.page_size, v.margin_top, v.margin_right,
  v.margin_bottom, v.margin_left, v.change_note, v.editor_user_id,
  v.editor_name_snapshot, v.restored_from_version_id, v.edited_at, v.created_at`;

const VERSION_COLUMNS = `${VERSION_SUMMARY_COLUMNS}, v.content_json, v.content_html`;

const FILE_SUMMARY_COLUMNS = `f.id, f.document_id, f.version_id, f.file_name,
  f.file_format, f.mime_type, f.file_size, f.checksum_sha256, f.source, f.status,
  f.is_official, f.format_check_status, f.format_check_note, f.format_checked_at,
  f.download_count, f.last_downloaded_at, f.uploaded_by, f.uploaded_by_name,
  f.created_at, f.updated_at`;

const textNode = (text) => ({ type: "text", text });
const strongText = (text) => ({
  type: "text",
  text,
  marks: [{ type: "bold" }],
});

const paragraph = (content = [], attrs = {}) => ({
  type: "paragraph",
  attrs: { textAlign: null, ...attrs },
  content,
});

const heading = (text, level = 2) => ({
  type: "heading",
  attrs: { level, textAlign: "center" },
  content: [textNode(text)],
});

const table = (headers, rows) => ({
  type: "table",
  content: [
    {
      type: "tableRow",
      content: headers.map((header) => ({
        type: "tableHeader",
        content: [paragraph([strongText(header)])],
      })),
    },
    ...rows.map((row) => ({
      type: "tableRow",
      content: row.map((cell) => ({
        type: "tableCell",
        content: [paragraph([textNode(cell)])],
      })),
    })),
  ],
});

const doc = (...content) => ({ type: "doc", content });

const TEMPLATES = {
  handover: {
    id: "handover",
    name: "Biên bản bàn giao công việc",
    description:
      "Bàn giao công việc, hồ sơ và tài sản khi nhân viên nghỉ hoặc chuyển việc.",
    title: "Biên bản bàn giao công việc và tài sản",
    number: "BB-BG",
    document_type: "HANDOVER",
    build: (values) =>
      doc(
        heading("BIÊN BẢN BÀN GIAO CÔNG VIỆC VÀ TÀI SẢN"),
        paragraph([textNode("Số: {{document.number}}")], {
          textAlign: "center",
        }),
        paragraph([
          strongText("Người giao: "),
          textNode("{{employee.full_name}} — {{employee.employee_code}}"),
        ]),
        paragraph([
          strongText("Phòng ban / Chức vụ: "),
          textNode("{{employee.department_name}} / {{employee.position_name}}"),
        ]),
        paragraph([strongText("Người nhận: "), textNode("...........................")]),
        paragraph([strongText("Ngày bàn giao: "), textNode("{{document.date}}")]),
        paragraph([strongText("1. Nội dung bàn giao")]),
        table(
          ["STT", "Nội dung", "Số lượng", "Ghi chú"],
          [
            ["1", "", "", ""],
            ["2", "", "", ""],
            ["3", "", "", ""],
          ],
        ),
        paragraph([strongText("2. Kết luận")]),
        paragraph([
          textNode("Hai bên đã kiểm tra và thống nhất bàn giao các nội dung nêu trên."),
        ]),
        paragraph([textNode("{{document.date_long}}")], { textAlign: "right" }),
      ),
  },
  resignation: {
    id: "resignation",
    name: "Đơn xin nghỉ việc",
    description: "Đơn nhân viên gửi Ban Giám đốc, lấy thông tin từ đơn từ.",
    title: "Đơn xin nghỉ việc",
    number: "ĐON-NV",
    document_type: "RESIGNATION",
    build: () =>
      doc(
        heading("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"),
        paragraph([textNode("Độc lập — Tự do — Hạnh phúc")], {
          textAlign: "center",
        }),
        paragraph([textNode("---o0o---")], { textAlign: "center" }),
        heading("ĐƠN XIN NGHỈ VIỆC"),
        paragraph([textNode("Số: {{document.number}}")], {
          textAlign: "center",
        }),
        paragraph([textNode("Kính gửi: Ban Giám đốc Công ty")]),
        paragraph([
          textNode("Tôi tên "),
          strongText("{{employee.full_name}}"),
          textNode(", mã nhân viên "),
          strongText("{{employee.employee_code}}"),
          textNode(", công tác tại "),
          strongText("{{employee.department_name}}"),
          textNode(" với chức vụ "),
          strongText("{{employee.position_name}}"),
          textNode("."),
        ]),
        paragraph([
          textNode("Qua "),
          strongText("{{request.title}}"),
          textNode(" đã gửi ngày {{request.submitted_date}}, tôi xin chấm dứt hợp đồng lao động kể từ ngày "),
          strongText("{{request.last_working_date}}"),
          textNode("."),
        ]),
        paragraph([strongText("Lý do: "), textNode("{{request.reason}}")]),
        paragraph([
          textNode(
            "Tôi cam kết bàn giao đầy đủ công việc, hồ sơ và tài sản theo quy định.",
          ),
        ]),
        paragraph([textNode("Kính đề nghị Ban Giám đốc xem xét và giải quyết.")]),
        paragraph([textNode("{{document.date_long}}")], { textAlign: "right" }),
        paragraph([strongText("Người làm đơn")], { textAlign: "right" }),
        paragraph([textNode("{{employee.full_name}}")], { textAlign: "right" }),
      ),
  },
  "termination-minutes": {
    id: "termination-minutes",
    name: "Biên bản thanh lý hợp đồng",
    description: "Ghi nhận việc thanh lý hợp đồng, bàn giao và nghĩa vụ thanh toán.",
    title: "Biên bản thanh lý hợp đồng lao động",
    number: "BB-TL",
    document_type: "TERMINATION_MINUTES",
    build: () =>
      doc(
        heading("BIÊN BẢN THANH LÝ HỢP ĐỒNG LAO ĐỘNG"),
        paragraph([textNode("Số: {{document.number}}")], {
          textAlign: "center",
        }),
        paragraph([
          textNode("Căn cứ đơn từ số "),
          strongText("{{request.id}}"),
          textNode(" ngày {{request.submitted_date}} của nhân viên "),
          strongText("{{employee.full_name}}"),
          textNode("."),
        ]),
        paragraph([
          textNode("Hôm nay, vào ngày {{document.date}}, tại trụ sở Công ty, chúng tôi gồm:"),
        ]),
        paragraph([strongText("Đại diện Công ty: "), textNode("...........................")]),
        paragraph([
          strongText("Nhân viên: "),
          textNode("{{employee.full_name}} — {{employee.employee_code}}"),
        ]),
        paragraph([
          strongText("Phòng ban / Chức vụ: "),
          textNode("{{employee.department_name}} / {{employee.position_name}}"),
        ]),
        paragraph([strongText("Ngày vào làm: "), textNode("{{employee.hire_date}}")]),
        paragraph([
          strongText("Ngày chấm dứt: "),
          textNode("{{request.last_working_date}}"),
        ]),
        paragraph([strongText("Lý do chấm dứt: "), textNode("{{request.reason}}")]),
        paragraph([strongText("1. Bàn giao công việc và tài sản")]),
        table(
          ["STT", "Nội dung bàn giao", "Tình trạng", "Ghi chú"],
          [
            ["1", "Hồ sơ, tài liệu công việc", "Đã bàn giao", ""],
            ["2", "Thiết bị, tài sản công ty", "Đã bàn giao", ""],
            ["3", "Công việc đang thực hiện", "Đã bàn giao", ""],
          ],
        ),
        paragraph([strongText("2. Nghĩa vụ thanh toán")]),
        paragraph([
          textNode(
            "Công ty thanh toán đầy đủ tiền lương, phụ cấp và các khoản phải trả khác cho nhân viên theo quy định.",
          ),
        ]),
        paragraph([textNode("Biên bản được lập thành 02 bản, có giá trị như nhau.")]),
        paragraph([textNode("{{document.date_long}}")], { textAlign: "right" }),
      ),
  },
  "temporary-leave": {
    id: "temporary-leave",
    name: "Đơn xin tạm nghỉ",
    description: "Đơn xin tạm nghỉ có thời gian và lý do lấy từ đơn từ.",
    title: "Đơn xin tạm nghỉ",
    number: "ĐON-TN",
    document_type: "TEMPORARY_LEAVE",
    build: () =>
      doc(
        heading("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"),
        paragraph([textNode("Độc lập — Tự do — Hạnh phúc")], {
          textAlign: "center",
        }),
        paragraph([textNode("---o0o---")], { textAlign: "center" }),
        heading("ĐƠN XIN TẠM NGHỈ"),
        paragraph([textNode("Số: {{document.number}}")], {
          textAlign: "center",
        }),
        paragraph([
          textNode("Tôi tên "),
          strongText("{{employee.full_name}}"),
          textNode(", mã nhân viên "),
          strongText("{{employee.employee_code}}"),
          textNode(", thuộc phòng ban "),
          strongText("{{employee.department_name}}"),
          textNode("."),
        ]),
        paragraph([
          textNode("Tôi xin tạm nghỉ từ ngày "),
          strongText("{{request.start_date}}"),
          textNode(" đến ngày "),
          strongText("{{request.end_date}}"),
          textNode("."),
        ]),
        paragraph([strongText("Lý do: "), textNode("{{request.reason}}")]),
        paragraph([
          textNode(
            "Trong thời gian tạm nghỉ, tôi vẫn tuân thủ quy định của Công ty.",
          ),
        ]),
        paragraph([textNode("{{document.date_long}}")], { textAlign: "right" }),
        paragraph([strongText("Người làm đơn")], { textAlign: "right" }),
        paragraph([textNode("{{employee.full_name}}")], { textAlign: "right" }),
      ),
  },
  "termination-decision": {
    id: "termination-decision",
    name: "Quyết định chấm dứt hợp đồng",
    description: "Quyết định chấm dứt hợp đồng lao động theo đề xuất đã duyệt.",
    title: "Quyết định chấm dứt hợp đồng lao động",
    number: "QD-CĐ",
    document_type: "TERMINATION_DECISION",
    build: () =>
      doc(
        heading("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"),
        paragraph([textNode("Độc lập — Tự do — Hạnh phúc")], {
          textAlign: "center",
        }),
        paragraph([textNode("---o0o---")], { textAlign: "center" }),
        heading("QUYẾT ĐỊNH CHẤM DỨT HỢP ĐỒNG LAO ĐỘNG"),
        paragraph([textNode("Số: {{document.number}}")], {
          textAlign: "center",
        }),
        paragraph([strongText("Giám đốc Công ty")]),
        paragraph([strongText("Căn cứ: "), textNode("{{request.title}} số {{request.id}}")]),
        paragraph([strongText("Quyết định: ")]),
        paragraph([
          textNode(
            "Đình chỉ và chấm dứt hợp đồng lao động đối với ông/bà ",
          ),
          strongText("{{employee.full_name}}"),
          textNode(", mã nhân viên "),
          strongText("{{employee.employee_code}}"),
          textNode(", phòng ban "),
          strongText("{{employee.department_name}}"),
          textNode(", chức vụ "),
          strongText("{{employee.position_name}}"),
          textNode(", kể từ ngày "),
          strongText("{{request.last_working_date}}"),
          textNode("."),
        ]),
        paragraph([
          textNode("Giao Phòng Nhân sự thực hiện thủ tục thanh lý hợp đồng, bàn giao công việc và thanh toán các khoản phải trả theo quy định."),
        ]),
        paragraph([textNode("{{document.date_long}}")], { textAlign: "right" }),
        paragraph([strongText("Giám đốc Công ty")], { textAlign: "right" }),
      ),
  },
};

const resolveCapabilities = (user) => {
  if (!user) {
    return { view: false, edit: false, export: false, manage: false };
  }

  const elevated =
    user.role_id === "SUPER_ADMIN" ||
    hasPermission(user.permissions, "HR.PROFILE_MANAGE");

  if (elevated) {
    return { view: true, edit: true, export: true, manage: true };
  }

  return {
    view: VIEW_ROLES.includes(user.role_id),
    edit: FULL_ROLES.includes(user.role_id),
    export: EXPORT_ROLES.includes(user.role_id),
    manage: FULL_ROLES.includes(user.role_id),
  };
};

const assertCapability = (user, capability) => {
  if (!resolveCapabilities(user)[capability]) {
    throw fail("Bạn không có quyền thực hiện thao tác này", 403);
  }
  return resolveCapabilities(user);
};

const roleInList = (roleId, value) => {
  const roles = String(value || "")
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);
  if (!roles.length) return true;
  return Boolean(roleId) && roles.includes(roleId);
};

const isDocumentOwner = (user, documentRow) =>
  Number(documentRow.owner_user_id) === Number(user?.user_id);

const canAccessDocument = (user, documentRow, capabilities) => {
  if (!user) return false;
  if (
    capabilities.manage ||
    VIEW_ALL_ROLES.includes(user.role_id) ||
    user.data_scope === "ALL"
  ) {
    return true;
  }
  if (isDocumentOwner(user, documentRow)) return true;
  if (documentRow.visibility === "ALL") return true;
  if (
    documentRow.visibility === "DEPARTMENT" &&
    user.department_id &&
    Number(documentRow.department_id) === Number(user.department_id)
  ) {
    return true;
  }
  if (
    documentRow.visibility === "ROLE" &&
    user.role_id &&
    String(documentRow.allowed_roles || "")
      .split(",")
      .map((role) => role.trim())
      .includes(user.role_id)
  ) {
    return true;
  }
  return false;
};

const assertDocumentAccess = (user, documentRow, capability) => {
  const capabilities = assertCapability(user, capability);
  const owner = isDocumentOwner(user, documentRow);

  if (
    capability === "edit" &&
    !capabilities.manage &&
    !owner &&
    !roleInList(user.role_id, documentRow.can_edit_roles)
  ) {
    throw fail("Bạn không có quyền chỉnh sửa văn bản này", 403);
  }

  if (
    capability === "export" &&
    !capabilities.manage &&
    !roleInList(user.role_id, documentRow.can_export_roles)
  ) {
    throw fail("Bạn không có quyền xuất văn bản này", 403);
  }

  if (!canAccessDocument(user, documentRow, capabilities)) {
    throw fail("Không tìm thấy văn bản", 404);
  }

  return capabilities;
};

const parseId = (value, field, { required = false } = {}) => {
  if (value === undefined || value === null || value === "") {
    if (required) throw fail(`Vui lòng cung cấp ${field}`);
    return null;
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw fail(`${field} không hợp lệ`);
  }
  return number;
};

const parseText = (value, field, { required = false, max = 255 } = {}) => {
  const text = String(value ?? "").trim();
  if (required && !text) throw fail(`Vui lòng nhập ${field}`);
  if (text.length > max) throw fail(`${field} không được vượt quá ${max} ký tự`);
  return text;
};

const parseEnum = (value, allowed, field, fallback) => {
  const text = String(value ?? "").trim().toUpperCase();
  if (!text) return fallback;
  if (!allowed.includes(text)) throw fail(`${field} không hợp lệ`);
  return text;
};

const parseRoleList = (value) => {
  const roles = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((role) => role.trim())
        .filter(Boolean);

  return [...new Set(roles)]
    .map((role) => String(role).trim())
    .filter(Boolean)
    .slice(0, 20);
};

const clampNumber = (value, fallback, min, max) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.round(number), min), max);
};

const parseMargins = (payload = {}) => {
  const source = payload.page_margins || payload.margins || payload;

  return {
    top: clampNumber(source.margin_top ?? source.top, 20, 0, 60),
    right: clampNumber(source.margin_right ?? source.right, 18, 0, 60),
    bottom: clampNumber(source.margin_bottom ?? source.bottom, 20, 0, 60),
    left: clampNumber(source.margin_left ?? source.left, 18, 0, 60),
  };
};

const parseContent = (value, field = "Nội dung văn bản") => {
  let content = value;

  if (typeof content === "string") {
    try {
      content = JSON.parse(content);
    } catch {
      throw fail(`${field} phải là JSON hợp lệ`);
    }
  }

  if (
    !content ||
    typeof content !== "object" ||
    content.type !== "doc" ||
    !Array.isArray(content.content)
  ) {
    throw fail(`${field} không hợp lệ`);
  }

  return content;
};

const parseJsonColumn = (value, fallback = null) => {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const transaction = async (operation) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const getDateParts = () => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    dateLong: `Ngày ${parts.day} tháng ${parts.month} năm ${parts.year}`,
  };
};

const editorIdentity = (user) => ({
  id: parseId(user?.user_id, "Người dùng", { required: true }),
  name: parseText(user?.full_name || user?.username || "Hệ thống", "Người dùng", {
    max: 255,
  }),
});

const fetchEmployee = async (executor, employeeId) => {
  if (!employeeId) {
    return {
      id: null,
      department_id: null,
      employee_code: "",
      full_name: "",
      department_name: "",
      position_name: "",
      hire_date: "",
    };
  }

  const [rows] = await executor.query(
    `SELECT e.id, e.department_id, e.employee_code, e.full_name,
            DATE_FORMAT(e.hire_date, '%Y-%m-%d') AS hire_date,
            COALESCE(d.department_name, d.name) AS department_name,
            COALESCE(p.position_name, p.name, p.title) AS position_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN positions p ON p.id = e.position_id
      WHERE e.id = ?
      LIMIT 1`,
    [employeeId],
  );

  if (!rows.length) throw fail("Không tìm thấy nhân viên", 404);
  return rows[0];
};

const fetchRequest = async (executor, requestId) => {
  if (!requestId) return null;

  const [rows] = await executor.query(
    `SELECT r.id, r.employee_id, r.title, r.reason,
            DATE_FORMAT(r.submitted_at, '%Y-%m-%d') AS submitted_date,
            DATE_FORMAT(r.start_date, '%Y-%m-%d') AS start_date,
            DATE_FORMAT(r.last_working_date, '%Y-%m-%d') AS last_working_date,
            DATE_FORMAT(r.end_date, '%Y-%m-%d') AS end_date
       FROM employee_requests r
      WHERE r.id = ?
      LIMIT 1`,
    [requestId],
  );

  if (!rows.length) throw fail("Không tìm thấy đơn từ", 404);
  return rows[0];
};

const buildTemplateValues = ({ employee, request, number }) => {
  const { date, dateLong } = getDateParts();

  return {
    "document.number": number,
    "document.date": date,
    "document.date_long": dateLong,
    "employee.full_name": employee?.full_name || "",
    "employee.employee_code": employee?.employee_code || "",
    "employee.department_name": employee?.department_name || "",
    "employee.position_name": employee?.position_name || "",
    "employee.hire_date": employee?.hire_date || "",
    "request.id": request?.id || "",
    "request.title": request?.title || "",
    "request.reason": request?.reason || "",
    "request.submitted_date": request?.submitted_date || "",
    "request.start_date": request?.start_date || "",
    "request.last_working_date": request?.last_working_date || "",
    "request.end_date": request?.end_date || "",
  };
};

const fillPlaceholders = (node, values) => {
  if (!node || typeof node !== "object") return node;

  if (node.type === "text" && typeof node.text === "string") {
    return {
      ...node,
      text: node.text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) =>
        values[key] === undefined || values[key] === null
          ? ""
          : String(values[key]),
      ),
    };
  }

  return {
    ...node,
    ...(Array.isArray(node.content)
      ? { content: node.content.map((child) => fillPlaceholders(child, values)) }
      : {}),
  };
};

const getDocumentRow = async (executor, id) => {
  const documentId = parseId(id, "Mã văn bản", { required: true });
  const [rows] = await executor.query(
    `SELECT ${DOCUMENT_COLUMNS} FROM documents d WHERE d.id = ? LIMIT 1`,
    [documentId],
  );
  if (!rows.length) throw fail("Không tìm thấy văn bản", 404);
  return rows[0];
};

const getVersionRow = async (executor, documentId, versionId) => {
  const [rows] = await executor.query(
    `SELECT ${VERSION_COLUMNS} FROM document_versions v
      WHERE v.id = ? AND v.document_id = ?
      LIMIT 1`,
    [versionId, documentId],
  );
  if (!rows.length) throw fail("Không tìm thấy phiên bản văn bản", 404);
  return rows[0];
};

const mapVersion = (row) => ({
  ...row,
  content_json: parseJsonColumn(row.content_json, {
    type: "doc",
    content: [],
  }),
});

const getDocumentDetail = async (user, id, executor = db) => {
  const documentRow = await getDocumentRow(executor, id);
  const capabilities = assertDocumentAccess(user, documentRow, "view");

  let currentVersion = null;
  if (documentRow.current_version_id) {
    currentVersion = mapVersion(
      await getVersionRow(executor, documentRow.id, documentRow.current_version_id),
    );
  }

  const [versionRows] = await executor.query(
    `SELECT ${VERSION_COLUMNS} FROM document_versions v
      WHERE v.document_id = ?
      ORDER BY v.version_number DESC`,
    [documentRow.id],
  );

  const [fileRows] = await executor.query(
    `SELECT ${FILE_SUMMARY_COLUMNS} FROM document_files f
      WHERE f.document_id = ? AND f.status = 'ACTIVE'
      ORDER BY f.created_at DESC`,
    [documentRow.id],
  );

  return {
    ...documentRow,
    capabilities,
    current_version: currentVersion,
    versions: versionRows.map(mapVersion),
    files: fileRows,
  };
};

export const listTemplateCatalog = () =>
  Object.values(TEMPLATES).map(({ build, ...template }) => template);

export const createDocumentFromTemplate = async (user, payload = {}) => {
  assertCapability(user, "edit");

  const templateId = parseText(
    payload.template_code || payload.template_id,
    "Mẫu văn bản",
    { required: true, max: 50 },
  ).toLowerCase();
  const template = TEMPLATES[templateId];
  if (!template) throw fail("Mẫu văn bản không tồn tại", 404);

  const requestId = parseId(payload.request_id, "Đơn từ");
  const editor = editorIdentity(user);
  const margins = parseMargins(payload);
  const title = parseText(payload.title || template.title, "Tiêu đề", {
    required: true,
  });
  const number = parseText(
    payload.document_number || payload.number || template.number,
    "Số văn bản",
    { max: 100 },
  );
  const status = parseEnum(payload.status, DOCUMENT_STATUSES, "Trạng thái", "DRAFT");
  const visibility = parseEnum(
    payload.visibility,
    VISIBILITIES,
    "Phạm vi hiển thị",
    "PRIVATE",
  );
  const allowedRoles = parseRoleList(payload.allowed_roles);
  const editRoles = parseRoleList(payload.can_edit_roles);
  const exportRoles = parseRoleList(payload.can_export_roles);
  const documentCode =
    parseText(payload.document_code, "Mã văn bản", { max: 100 }) ||
    `DOC-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

  const request = await fetchRequest(db, requestId);
  const employeeId = parseId(
    payload.employee_id || request?.employee_id,
    "Nhân viên",
  );
  const employee = await fetchEmployee(db, employeeId);
  const values = buildTemplateValues({ employee, request, number });
  const content = fillPlaceholders(template.build(values), values);
  const contentHtml = tiptapToHtml(content);

  return transaction(async (connection) => {
    const [documentResult] = await connection.query(
      `INSERT INTO documents (
        document_code, document_number, title, document_type, template_code,
        request_id, employee_id, department_id,
        employee_code_snapshot, employee_name_snapshot, department_name_snapshot,
        owner_user_id, owner_role_id, created_by, updated_by,
        visibility, allowed_roles, can_edit_roles, can_export_roles,
        status, page_size, margin_top, margin_right, margin_bottom, margin_left
      ) VALUES ?`,
      [
        [
          documentCode,
          number,
          title,
          template.document_type,
          template.id,
          requestId,
          employee.id,
          employee.department_id,
          employee.employee_code || null,
          employee.full_name || null,
          employee.department_name || null,
          editor.id,
          user.role_id || null,
          editor.id,
          null,
          visibility,
          allowedRoles.join(",") || null,
          editRoles.join(",") || null,
          exportRoles.join(",") || null,
          status,
          "A4",
          margins.top,
          margins.right,
          margins.bottom,
          margins.left,
        ],
      ],
    );

    const documentId = Number(documentResult.insertId);

    const [versionResult] = await connection.query(
      `INSERT INTO document_versions (
        document_id, version_number, title, document_number, template_code,
        page_size, margin_top, margin_right, margin_bottom, margin_left,
        content_json, content_html, change_note, editor_user_id,
        editor_name_snapshot, edited_at
      ) VALUES ?`,
      [
        [
          documentId,
          1,
          title,
          number,
          template.id,
          "A4",
          margins.top,
          margins.right,
          margins.bottom,
          margins.left,
          JSON.stringify(content),
          contentHtml,
          `Tạo từ mẫu ${template.name}`,
          editor.id,
          editor.name,
          new Date(),
        ],
      ],
    );

    await connection.query(
      "UPDATE documents SET current_version_id = ? WHERE id = ?",
      [versionResult.insertId, documentId],
    );

    return getDocumentDetail(user, documentId, connection);
  });
};

export const listDocuments = async (user, filters = {}) => {
  const capabilities = resolveCapabilities(user);
  if (!capabilities.view) throw fail("Bạn không có quyền xem văn bản", 403);

  const conditions = [];
  const params = [];

  if (
    !filters.status &&
    String(filters.include_archived || "").toLowerCase() !== "true"
  ) {
    conditions.push("d.status <> 'ARCHIVED'");
  }

  if (
    !capabilities.manage &&
    !VIEW_ALL_ROLES.includes(user.role_id) &&
    user.data_scope !== "ALL"
  ) {
    conditions.push(`(
      d.owner_user_id = ?
      OR d.visibility = 'ALL'
      OR (d.visibility = 'DEPARTMENT' AND d.department_id = ?)
      OR (d.visibility = 'ROLE' AND FIND_IN_SET(?, d.allowed_roles))
    )`);
    params.push(
      user.user_id || 0,
      user.department_id || 0,
      user.role_id || "",
    );
  }

  if (filters.status) {
    conditions.push("d.status = ?");
    params.push(parseEnum(filters.status, DOCUMENT_STATUSES, "Trạng thái"));
  }
  if (filters.document_type) {
    conditions.push("d.document_type = ?");
    params.push(
      parseText(filters.document_type, "Loại văn bản", { max: 40 }).toUpperCase(),
    );
  }
  if (filters.employee_id) {
    conditions.push("d.employee_id = ?");
    params.push(parseId(filters.employee_id, "Mã nhân viên"));
  }
  if (filters.department_id) {
    conditions.push("d.department_id = ?");
    params.push(parseId(filters.department_id, "Mã phòng ban"));
  }
  if (filters.keyword || filters.q) {
    conditions.push("(d.title LIKE ? OR d.document_number LIKE ? OR d.document_code LIKE ?)");
    const keyword = `%${parseText(filters.keyword || filters.q, "Từ khóa", {
      max: 100,
    })}%`;
    params.push(keyword, keyword, keyword);
  }

  const limit = clampNumber(filters.limit, 50, 1, 200);
  const offset = Math.max(0, clampNumber(filters.offset, 0, 0, 1000000));
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows] = await db.query(
    `SELECT ${DOCUMENT_COLUMNS} FROM documents d
      ${where}
      ORDER BY d.updated_at DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  return rows.map((row) => ({
    ...row,
    capabilities: resolveCapabilities(user),
  }));
};

export const getDocument = (user, id) => getDocumentDetail(user, id);

export const saveDocumentContent = async (user, id, payload = {}) => {
  const documentRow = await getDocumentRow(db, id);
  assertDocumentAccess(user, documentRow, "edit");

  const editor = editorIdentity(user);
  const versionId =
    parseId(payload.version_id, "Mã phiên bản") || documentRow.current_version_id;
  if (!versionId) throw fail("Văn bản chưa có phiên bản để lưu", 404);

  const versionRow = await getVersionRow(db, documentRow.id, versionId);
  const content = parseContent(
    payload.content_json ?? payload.content ?? versionRow.content_json,
  );
  const margins = parseMargins(payload);
  const title = parseText(
    payload.title ?? versionRow.title ?? documentRow.title,
    "Tiêu đề",
    { required: true },
  );
  const number = parseText(
    payload.document_number ?? versionRow.document_number ?? documentRow.document_number,
    "Số văn bản",
    { max: 100 },
  );
  const status = parseEnum(
    payload.status,
    DOCUMENT_STATUSES,
    "Trạng thái",
    documentRow.status,
  );

  await transaction(async (connection) => {
    await connection.query(
      "SELECT id FROM documents WHERE id = ? FOR UPDATE",
      [documentRow.id],
    );

    await connection.query(
      `UPDATE document_versions
         SET title = ?, document_number = ?, template_code = ?,
             page_size = 'A4', margin_top = ?, margin_right = ?,
             margin_bottom = ?, margin_left = ?,
             content_json = ?, content_html = ?, change_note = ?,
             editor_user_id = ?, editor_name_snapshot = ?, edited_at = NOW()
       WHERE id = ? AND document_id = ?`,
      [
        title,
        number,
        payload.template_code || payload.template_id || versionRow.template_code,
        margins.top,
        margins.right,
        margins.bottom,
        margins.left,
        JSON.stringify(content),
        tiptapToHtml(content),
        parseText(payload.change_note || versionRow.change_note, "Ghi chú", {
          max: 500,
        }),
        editor.id,
        editor.name,
        versionRow.id,
        documentRow.id,
      ],
    );

    await connection.query(
      `UPDATE documents
         SET current_version_id = ?, title = ?, document_number = ?, status = ?,
             margin_top = ?, margin_right = ?, margin_bottom = ?, margin_left = ?,
             updated_by = ?,
             archived_at = CASE
               WHEN ? = 'ARCHIVED' AND archived_at IS NULL THEN NOW()
               ELSE archived_at
             END
       WHERE id = ?`,
      [
        versionId,
        title,
        number,
        status,
        margins.top,
        margins.right,
        margins.bottom,
        margins.left,
        editor.id,
        status,
        documentRow.id,
      ],
    );
  });

  return getDocument(user, documentRow.id);
};

const createVersionInternal = async ({
  user,
  documentRow,
  payload = {},
  content,
  restoredFromVersionId = null,
  changeNote,
}) => {
  const editor = editorIdentity(user);
  const margins = parseMargins(payload);
  const title = parseText(
    payload.title ?? documentRow.title,
    "Tiêu đề",
    { required: true },
  );
  const number = parseText(
    payload.document_number ?? documentRow.document_number,
    "Số văn bản",
    { max: 100 },
  );
  const status = parseEnum(
    payload.status,
    DOCUMENT_STATUSES,
    "Trạng thái",
    documentRow.status,
  );

  return transaction(async (connection) => {
    await connection.query(
      "SELECT id FROM documents WHERE id = ? FOR UPDATE",
      [documentRow.id],
    );

    const [nextRows] = await connection.query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
         FROM document_versions WHERE document_id = ?`,
      [documentRow.id],
    );
    const versionNumber = Number(nextRows[0]?.next_version || 1);

    const [versionResult] = await connection.query(
      `INSERT INTO document_versions (
        document_id, version_number, title, document_number, template_code,
        page_size, margin_top, margin_right, margin_bottom, margin_left,
        content_json, content_html, change_note, editor_user_id,
        editor_name_snapshot, restored_from_version_id, edited_at
      ) VALUES ?`,
      [
        [
          documentRow.id,
          versionNumber,
          title,
          number,
          payload.template_code || payload.template_id || documentRow.template_code || null,
          "A4",
          margins.top,
          margins.right,
          margins.bottom,
          margins.left,
          JSON.stringify(content),
          tiptapToHtml(content),
          changeNote,
          editor.id,
          editor.name,
          restoredFromVersionId,
          new Date(),
        ],
      ],
    );

    await connection.query(
      `UPDATE documents
         SET current_version_id = ?, title = ?, document_number = ?, status = ?,
             margin_top = ?, margin_right = ?, margin_bottom = ?, margin_left = ?,
             updated_by = ?,
             archived_at = CASE
               WHEN ? = 'ARCHIVED' AND archived_at IS NULL THEN NOW()
               ELSE archived_at
             END
       WHERE id = ?`,
      [
        versionResult.insertId,
        title,
        number,
        status,
        margins.top,
        margins.right,
        margins.bottom,
        margins.left,
        editor.id,
        status,
        documentRow.id,
      ],
    );

    return Number(versionResult.insertId);
  });
};

export const updateDocumentAndCreateVersion = async (user, id, payload = {}) => {
  const documentRow = await getDocumentRow(db, id);
  assertDocumentAccess(user, documentRow, "edit");

  let content;
  if (payload.content_json !== undefined || payload.content !== undefined) {
    content = parseContent(payload.content_json ?? payload.content);
  } else if (payload.version_id || documentRow.current_version_id) {
    const currentVersion = await getVersionRow(
      db,
      documentRow.id,
      parseId(payload.version_id, "Mã phiên bản") || documentRow.current_version_id,
    );
    content = parseJsonColumn(currentVersion.content_json, {
      type: "doc",
      content: [],
    });
  } else {
    throw fail("Vui lòng cung cấp nội dung văn bản");
  }

  const changeNote = parseText(
    payload.change_note || "Cập nhật nội dung văn bản",
    "Ghi chú thay đổi",
    { required: true, max: 500 },
  );

  await createVersionInternal({
    user,
    documentRow,
    payload,
    content,
    changeNote,
  });

  return getDocument(user, documentRow.id);
};

export const restoreDocumentVersion = async (user, id, versionId) => {
  const documentRow = await getDocumentRow(db, id);
  assertDocumentAccess(user, documentRow, "edit");

  const source = await getVersionRow(
    db,
    documentRow.id,
    parseId(versionId, "Mã phiên bản", { required: true }),
  );
  const content = parseJsonColumn(source.content_json, {
    type: "doc",
    content: [],
  });

  await createVersionInternal({
    user,
    documentRow,
    payload: {
      title: source.title,
      document_number: source.document_number,
      template_code: source.template_code,
      margins: {
        top: source.margin_top,
        right: source.margin_right,
        bottom: source.margin_bottom,
        left: source.margin_left,
      },
    },
    content,
    restoredFromVersionId: source.id,
    changeNote: `Khôi phục phiên bản ${source.version_number}`,
  });

  return getDocument(user, documentRow.id);
};

export const deleteDocumentVersion = async (user, id, versionId) => {
  const documentRow = await getDocumentRow(db, id);
  assertDocumentAccess(user, documentRow, "manage");

  const targetId = parseId(versionId, "Mã phiên bản", { required: true });
  const [countRows] = await db.query(
    "SELECT COUNT(*) AS total FROM document_versions WHERE document_id = ?",
    [documentRow.id],
  );
  if (Number(countRows[0]?.total || 0) <= 1) {
    throw fail("Không thể xóa phiên bản cuối cùng của văn bản", 409);
  }
  if (Number(documentRow.current_version_id) === targetId) {
    throw fail("Không thể xóa phiên bản đang được sử dụng", 409);
  }

  const editor = editorIdentity(user);

  await transaction(async (connection) => {
    await connection.query(
      "SELECT id FROM documents WHERE id = ? FOR UPDATE",
      [documentRow.id],
    );
    await connection.query(
      "UPDATE document_files SET version_id = NULL WHERE version_id = ?",
      [targetId],
    );
    await connection.query(
      "DELETE FROM document_versions WHERE id = ? AND document_id = ?",
      [targetId, documentRow.id],
    );
    const [latestRows] = await connection.query(
      `SELECT id FROM document_versions
        WHERE document_id = ?
        ORDER BY version_number DESC
        LIMIT 1`,
      [documentRow.id],
    );
    if (latestRows[0]) {
      await connection.query(
        "UPDATE documents SET current_version_id = ?, updated_by = ? WHERE id = ?",
        [latestRows[0].id, editor.id, documentRow.id],
      );
    }
  });

  return getDocument(user, documentRow.id);
};

export const deleteDocument = async (user, id) => {
  const documentRow = await getDocumentRow(db, id);
  assertDocumentAccess(user, documentRow, "manage");
  const editor = editorIdentity(user);

  await db.query(
    `UPDATE documents
        SET status = 'ARCHIVED', archived_at = COALESCE(archived_at, NOW()), updated_by = ?
      WHERE id = ?`,
    [editor.id, documentRow.id],
  );

  return { id: documentRow.id, status: "ARCHIVED" };
};

export const listDocumentVersions = async (user, id) => {
  const documentRow = await getDocumentRow(db, id);
  assertDocumentAccess(user, documentRow, "view");

  const [rows] = await db.query(
    `SELECT ${VERSION_SUMMARY_COLUMNS} FROM document_versions v
      WHERE v.document_id = ?
      ORDER BY v.version_number DESC`,
    [documentRow.id],
  );

  return rows;
};

export const getDocumentVersion = async (user, id, versionId) => {
  const documentRow = await getDocumentRow(db, id);
  assertDocumentAccess(user, documentRow, "view");
  return mapVersion(
    await getVersionRow(
      db,
      documentRow.id,
      parseId(versionId, "Mã phiên bản", { required: true }),
    ),
  );
};

export const exportDocumentFile = async (user, id, payload = {}) => {
  const documentRow = await getDocumentRow(db, id);
  assertDocumentAccess(user, documentRow, "export");

  const format = parseEnum(payload.format, FILE_FORMATS, "Định dạng xuất");
  if (!format) throw fail("Vui lòng chọn định dạng xuất DOCX hoặc PDF");

  const versionId =
    parseId(payload.version_id, "Mã phiên bản") || documentRow.current_version_id;
  if (!versionId) throw fail("Văn bản chưa có phiên bản để xuất", 404);
  const version = await getVersionRow(db, documentRow.id, versionId);
  const content = parseJsonColumn(version.content_json, {
    type: "doc",
    content: [],
  });
  const title = version.title || documentRow.title || "Văn bản";

  const rendered = await renderDocumentFile({
    format,
    content_json: content,
    title,
    margins: version,
  });
  const fileName = buildFileName(title, format);
  const checksum = crypto
    .createHash("sha256")
    .update(rendered.buffer)
    .digest("hex");
  const editor = editorIdentity(user);

  const [result] = await db.query(
    `INSERT INTO document_files (
      document_id, version_id, file_name, file_format, mime_type, file_size,
      file_data, checksum_sha256, source, status, is_official,
      format_check_status, format_check_note, format_checked_at,
      uploaded_by, uploaded_by_name
    ) VALUES ?`,
    [
      [
        documentRow.id,
        version.id,
        fileName,
        format,
        rendered.mime_type,
        rendered.buffer.length,
        rendered.buffer,
        checksum,
        "EXPORT",
        "ACTIVE",
        1,
        rendered.validation.status,
        rendered.validation.note,
        rendered.validation.checked_at,
        editor.id,
        editor.name,
      ],
    ],
  );

  return {
    id: Number(result.insertId),
    document_id: documentRow.id,
    version_id: version.id,
    file_name: fileName,
    file_format: format,
    mime_type: rendered.mime_type,
    file_size: rendered.buffer.length,
    checksum_sha256: checksum,
    format_check_status: rendered.validation.status,
    format_check_note: rendered.validation.note,
    format_checked_at: rendered.validation.checked_at,
    status: "ACTIVE",
    is_official: 1,
  };
};

export const listDocumentFiles = async (user, id) => {
  const documentRow = await getDocumentRow(db, id);
  assertDocumentAccess(user, documentRow, "view");

  const [rows] = await db.query(
    `SELECT ${FILE_SUMMARY_COLUMNS} FROM document_files f
      WHERE f.document_id = ? AND f.status = 'ACTIVE'
      ORDER BY f.created_at DESC`,
    [documentRow.id],
  );

  return rows;
};

const getFileRecord = async (documentId, fileId) => {
  const [rows] = await db.query(
    `SELECT ${FILE_SUMMARY_COLUMNS}, f.file_data
       FROM document_files f
      WHERE f.id = ? AND f.document_id = ? AND f.status = 'ACTIVE'
      LIMIT 1`,
    [fileId, documentId],
  );
  if (!rows.length) throw fail("Không tìm thấy file văn bản", 404);

  const file = rows[0];
  const actualChecksum = crypto
    .createHash("sha256")
    .update(file.file_data)
    .digest("hex");
  if (
    file.checksum_sha256 &&
    actualChecksum !== file.checksum_sha256
  ) {
    throw fail("File văn bản bị lỗi: checksum không khớp", 500);
  }
  if (Number(file.file_size) !== Number(file.file_data.length)) {
    throw fail("File văn bản bị lỗi: kích thước không khớp", 500);
  }

  return file;
};

const readDocumentFile = async (user, id, fileId, capability) => {
  const documentRow = await getDocumentRow(db, id);
  assertDocumentAccess(user, documentRow, capability);
  return getFileRecord(documentRow.id, parseId(fileId, "Mã file", { required: true }));
};

export const viewDocumentFile = (user, id, fileId) =>
  readDocumentFile(user, id, fileId, "view");

export const downloadDocumentFile = async (user, id, fileId) => {
  const file = await readDocumentFile(user, id, fileId, "export");
  await db.query(
    "UPDATE document_files SET download_count = download_count + 1, last_downloaded_at = NOW() WHERE id = ?",
    [file.id],
  );
  return file;
};

export const deleteDocumentFile = async (user, id, fileId) => {
  const documentRow = await getDocumentRow(db, id);
  assertDocumentAccess(user, documentRow, "manage");

  const [result] = await db.query(
    "UPDATE document_files SET status = 'DELETED' WHERE id = ? AND document_id = ?",
    [parseId(fileId, "Mã file", { required: true }), documentRow.id],
  );
  if (!result.affectedRows) throw fail("Không tìm thấy file văn bản", 404);

  return { id: Number(fileId) };
};
