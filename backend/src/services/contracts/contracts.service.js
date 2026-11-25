import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { db } from "../../config/database.js";
import {
  createContractDecisionNotifications,
  createContractSigningNotifications,
  createContractSigningRevisionNotifications,
  createContractSubmissionNotifications,
} from "../notifications/notifications.service.js";
import { buildEmployeeScope, hasPermission } from "../../utils/helper.js";

const CONTRACT_STATUSES = [
  "ACTIVE",
  "EXPIRING_SOON",
  "EXPIRED",
  "TERMINATED",
];

const STATUS_FILTERS = [
  "ALL",
  ...CONTRACT_STATUSES,
  "PENDING_APPROVAL",
  "REJECTED",
  "PENDING_SIGN",
  "SIGNED",
];

const CONTRACT_TEMPLATE_TYPE_LABELS = {
  INTERNSHIP: "Hợp đồng thực tập",
  PROBATION: "Hợp đồng thử việc",
  FIXED_TERM: "Hợp đồng xác định thời hạn",
  INDEFINITE: "Hợp đồng không xác định thời hạn",
};

const DRAFT_CONTRACT_TYPES = Object.keys(CONTRACT_TEMPLATE_TYPE_LABELS);
const CREATE_METHODS = ["FROM_TEMPLATE", "UPLOAD_DOCX"];

const TEMPLATE_FIELD_MAP = {
  hoten: { label: "Họ tên nhân viên", value: (p) => p.employee_name },
  ten: { label: "Họ tên nhân viên", value: (p) => p.employee_name },
  tennhanvien: { label: "Họ tên nhân viên", value: (p) => p.employee_name },
  employeename: { label: "Họ tên nhân viên", value: (p) => p.employee_name },
  manhanvien: { label: "Mã nhân viên", value: (p) => p.employee_code },
  manv: { label: "Mã nhân viên", value: (p) => p.employee_code },
  nhanvien: { label: "Mã nhân viên", value: (p) => p.employee_code },
  employeecode: { label: "Mã nhân viên", value: (p) => p.employee_code },
  ngaysinh: { label: "Ngày sinh", value: (p) => formatDisplayDate(p.employee_dob) },
  dob: { label: "Ngày sinh", value: (p) => formatDisplayDate(p.employee_dob) },
  gioitinh: { label: "Giới tính", value: (p) => formatGender(p.employee_gender) },
  gender: { label: "Giới tính", value: (p) => formatGender(p.employee_gender) },
  diachi: { label: "Địa chỉ", value: (p) => p.employee_address },
  address: { label: "Địa chỉ", value: (p) => p.employee_address },
  sodienthoai: { label: "Số điện thoại", value: (p) => p.employee_phone },
  dienthoai: { label: "Số điện thoại", value: (p) => p.employee_phone },
  sdt: { label: "Số điện thoại", value: (p) => p.employee_phone },
  phone: { label: "Số điện thoại", value: (p) => p.employee_phone },
  email: { label: "Email", value: (p) => p.employee_email },
  phongban: { label: "Phòng ban", value: (p) => p.employee_department },
  phong: { label: "Phòng ban", value: (p) => p.employee_department },
  donvi: { label: "Phòng ban", value: (p) => p.employee_department },
  department: { label: "Phòng ban", value: (p) => p.employee_department },
  chucvu: { label: "Chức vụ", value: (p) => p.employee_position },
  chucdanh: { label: "Chức vụ", value: (p) => p.employee_position },
  position: { label: "Chức vụ", value: (p) => p.employee_position },
  sohopdong: { label: "Mã hợp đồng", value: (p) => p.contract_code },
  contractcode: { label: "Mã hợp đồng", value: (p) => p.contract_code },
  ngaybatdau: { label: "Ngày bắt đầu", value: (p) => formatDisplayDate(p.start_date) },
  ngayky: { label: "Ngày bắt đầu", value: (p) => formatDisplayDate(p.start_date) },
  ngaylap: { label: "Ngày bắt đầu", value: (p) => formatDisplayDate(p.start_date) },
  startdate: { label: "Ngày bắt đầu", value: (p) => formatDisplayDate(p.start_date) },
  contractdate: { label: "Ngày bắt đầu", value: (p) => formatDisplayDate(p.start_date) },
  ngayketthuc: { label: "Ngày kết thúc", value: (p) => formatDisplayDate(p.end_date) },
  enddate: { label: "Ngày kết thúc", value: (p) => formatDisplayDate(p.end_date) },
  luongcoban: { label: "Lương ký hợp đồng", value: (p) => formatCurrency(p.base_salary) },
  luong: { label: "Lương ký hợp đồng", value: (p) => formatCurrency(p.base_salary) },
  basesalary: { label: "Lương ký hợp đồng", value: (p) => formatCurrency(p.base_salary) },
  phucap: { label: "Phụ cấp", value: (p) => formatCurrency(p.allowance) },
  allowance: { label: "Phụ cấp", value: (p) => formatCurrency(p.allowance) },
};

const normalizeText = (value) => String(value ?? "").trim();

const normalizeTemplateKey = (value) =>
  normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const formatDisplayDate = (value) => {
  const date = normalizeText(value);
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
};

const formatGender = (value) => {
  const gender = normalizeText(value).toUpperCase();
  if (["MALE", "NAM", "M"].includes(gender)) return "Nam";
  if (["FEMALE", "NU", "NỮ", "F"].includes(gender)) return "Nữ";
  if (["OTHER", "KHAC", "KHÁC", "O"].includes(gender)) return "Khác";
  return normalizeText(value);
};

const formatCurrency = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return new Intl.NumberFormat("vi-VN").format(number);
};

const parsePositiveInt = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

const isIndefiniteContract = (contractType) =>
  normalizeText(contractType).toLowerCase().includes("không xác định");

const buildScopeClause = (user) => {
  const scope = buildEmployeeScope(user);

  return {
    clause: scope.clause ? scope.clause.replace(/^WHERE\s+/i, "") : "1 = 1",
    params: [...scope.params],
  };
};

const buildBaseConditions = (user, filters = {}) => {
  const scope = buildScopeClause(user);
  const conditions = [scope.clause];
  const params = [...scope.params];

  if (filters.keyword) {
    const like = `%${String(filters.keyword).toLowerCase()}%`;
    conditions.push(
      "(LOWER(c.contract_code) LIKE ? OR LOWER(e.employee_code) LIKE ? OR LOWER(e.full_name) LIKE ?)",
    );
    params.push(like, like, like);
  }

  if (filters.departmentId) {
    conditions.push("e.department_id = ?");
    params.push(filters.departmentId);
  }

  if (filters.contractType) {
    conditions.push("c.contract_type = ?");
    params.push(filters.contractType);
  }

  return { conditions, params };
};

export const validateContractFilters = (query = {}) => {
  const status = normalizeText(query.status || "ALL").toUpperCase();

  if (!STATUS_FILTERS.includes(status)) {
    return { error: "Trạng thái hợp đồng không hợp lệ" };
  }

  const departmentId = parsePositiveInt(query.department_id);

  if (
    query.department_id !== undefined &&
    query.department_id !== "" &&
    !departmentId
  ) {
    return { error: "Phòng ban lọc không hợp lệ" };
  }

  const contractType = normalizeText(query.contract_type).slice(0, 100);
  const keyword = normalizeText(query.keyword || query.q).slice(0, 100);

  return { filters: { status, departmentId, contractType, keyword } };
};

export const validateContractPayload = (payload = {}) => {
  const employeeId = parsePositiveInt(payload.employee_id);
  if (!employeeId) return { error: "Vui lòng chọn nhân viên ký hợp đồng" };

  const contractCode = normalizeText(payload.contract_code).slice(0, 50);
  if (!contractCode) return { error: "Mã hợp đồng không được để trống" };

  const contractType = normalizeText(payload.contract_type).slice(0, 100);
  if (!contractType) return { error: "Vui lòng chọn loại hợp đồng" };

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const startDate = normalizeText(payload.start_date);
  if (!datePattern.test(startDate)) {
    return { error: "Ngày bắt đầu không hợp lệ" };
  }

  let endDate = normalizeText(payload.end_date) || null;

  if (endDate && !datePattern.test(endDate)) {
    return { error: "Ngày kết thúc không hợp lệ" };
  }

  if (!endDate && !isIndefiniteContract(contractType)) {
    return {
      error: "Hợp đồng xác định thời hạn bắt buộc phải có ngày kết thúc",
    };
  }

  if (endDate && endDate < startDate) {
    return { error: "Ngày kết thúc phải sau ngày bắt đầu" };
  }

  if (isIndefiniteContract(contractType)) endDate = null;

  const signedSalary = Number(payload.signed_salary);
  if (!Number.isFinite(signedSalary) || signedSalary < 0) {
    return { error: "Lương ký hợp đồng không hợp lệ" };
  }

  const insuranceSalary = Number(payload.insurance_salary);
  if (!Number.isFinite(insuranceSalary) || insuranceSalary < 0) {
    return { error: "Lương đóng BHXH không hợp lệ" };
  }

  const status = normalizeText(payload.status || "ACTIVE").toUpperCase();
  if (!CONTRACT_STATUSES.includes(status)) {
    return { error: "Trạng thái hợp đồng không hợp lệ" };
  }

  const replacesContractId = parsePositiveInt(payload.replaces_contract_id);

  return {
    payload: {
      employee_id: employeeId,
      contract_code: contractCode,
      contract_type: contractType,
      start_date: startDate,
      end_date: endDate,
      signed_salary: signedSalary,
      insurance_salary: insuranceSalary,
      status,
      note: normalizeText(payload.note).slice(0, 500) || null,
      replaces_contract_id: replacesContractId,
    },
  };
};

const escapeHtml = (value) =>
  normalizeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildEmployeeSummaryHtml = (payload) => {
  const rows = [
    ["Mã nhân viên", payload.employee_code],
    ["Họ tên", payload.employee_name],
    ["Ngày sinh", payload.employee_dob],
    ["Giới tính", payload.employee_gender],
    ["Địa chỉ", payload.employee_address],
    ["Số điện thoại", payload.employee_phone],
    ["Email", payload.employee_email],
    ["Phòng ban", payload.employee_department],
    ["Chức vụ", payload.employee_position],
  ];

  return `<table border="1" cellpadding="6" cellspacing="0"><tbody>${rows
    .map(
      ([label, value]) =>
        `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || "—")}</td></tr>`,
    )
    .join("")}</tbody></table>${
    payload.note ? `<p><strong>Ghi chú:</strong> ${escapeHtml(payload.note)}</p>` : ""
  }`;
};

const resolveTemplatePath = (templateFilePath) => {
  const relativePath = normalizeText(templateFilePath);
  if (
    !relativePath ||
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]+/).includes("..")
  ) {
    throw Object.assign(new Error("Đường dẫn mẫu hợp đồng không hợp lệ"), {
      code: "INVALID_TEMPLATE_PATH",
    });
  }

  const templatesRoot = path.resolve(process.cwd(), "uploads", "templates");
  const resolvedPath = path.resolve(process.cwd(), relativePath);

  if (
    resolvedPath !== templatesRoot &&
    !resolvedPath.startsWith(`${templatesRoot}${path.sep}`)
  ) {
    throw Object.assign(new Error("Đường dẫn mẫu hợp đồng không hợp lệ"), {
      code: "INVALID_TEMPLATE_PATH",
    });
  }

  return resolvedPath;
};

const readTemplateZip = async (template) => {
  const templatePath = resolveTemplatePath(template.template_file_path);
  const content = await fs.promises.readFile(templatePath);
  return new PizZip(content);
};

const decodeXmlText = (value) =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");

const getTemplateXmlFiles = (zip) =>
  Object.keys(zip.files).filter((name) =>
    /^word\/(document|header\d*|footer\d*)\.xml$/i.test(name),
  );

const extractTemplatePlaceholders = (zip) => {
  const placeholders = new Set();

  getTemplateXmlFiles(zip).forEach((name) => {
    const xml = zip.file(name)?.asText() || "";
    const plainText = decodeXmlText(xml.replace(/<[^>]+>/g, ""));
    const matches =
      `${xml}\n${plainText}`.match(/\{([A-Za-z][A-Za-z0-9_]{0,99})\}/g) || [];

    matches.forEach((match) => {
      placeholders.add(match.slice(1, -1));
    });
  });

  return [...placeholders];
};

const extractTemplateText = (zip) => {
  const parts = getTemplateXmlFiles(zip).map((name) => {
    const xml = zip.file(name)?.asText() || "";
    return decodeXmlText(
      xml
        .replace(/<\/w:p>/g, "\n")
        .replace(/<w:tab[^>]*\/>/g, "\t")
        .replace(/<[^>]+>/g, ""),
    );
  });

  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

const buildTemplateData = (placeholders, payload) => {
  const data = {};
  const missingFields = [];

  placeholders.forEach((placeholder) => {
    const config = TEMPLATE_FIELD_MAP[normalizeTemplateKey(placeholder)];

    if (!config) {
      missingFields.push({
        placeholder,
        label: placeholder,
        reason: "Chưa được cấu hình dữ liệu",
      });
      return;
    }

    const value = config.value(payload);
    if (!normalizeText(value)) {
      missingFields.push({
        placeholder,
        label: config.label,
        reason: "Chưa có dữ liệu",
      });
      return;
    }

    data[placeholder] = value;
  });

  return { data, missingFields };
};

const generateFilledContractDocx = async (template, payload) => {
  const zip = await readTemplateZip(template);
  const placeholders = extractTemplatePlaceholders(zip);
  const { data, missingFields } = buildTemplateData(placeholders, payload);

  if (missingFields.length) {
    return { missingFields };
  }

  const document = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });
  document.render(data);

  const output = document.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  const directory = path.resolve(
    process.cwd(),
    "uploads",
    "drafts",
    String(new Date().getFullYear()),
  );
  await fs.promises.mkdir(directory, { recursive: true });

  const filename = `${crypto.randomUUID()}.docx`;
  const absolutePath = path.join(directory, filename);
  await fs.promises.writeFile(absolutePath, output);

  return {
    draftDocxPath: path.posix.join(
      "uploads",
      "drafts",
      String(new Date().getFullYear()),
      filename,
    ),
    absolutePath,
    placeholders,
  };
};

export const validateDraftContractPayload = (payload = {}, file = null) => {
  const employeeId = parsePositiveInt(payload.employee_id);
  if (!employeeId) return { error: "Vui lòng chọn nhân viên ký hợp đồng" };

  const contractCode = normalizeText(payload.contract_code).slice(0, 50);
  if (!contractCode) return { error: "Mã hợp đồng không được để trống" };

  const contractType = normalizeText(payload.contract_type).toUpperCase();
  if (!DRAFT_CONTRACT_TYPES.includes(contractType)) {
    return { error: "Loại hợp đồng không hợp lệ" };
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const startDate = normalizeText(payload.start_date);
  if (!datePattern.test(startDate)) {
    return { error: "Ngày bắt đầu không hợp lệ" };
  }

  let endDate = normalizeText(payload.end_date) || null;
  if (endDate && !datePattern.test(endDate)) {
    return { error: "Ngày kết thúc không hợp lệ" };
  }

  const noEndDate = ["INDEFINITE", "FREELANCE"].includes(contractType);
  if (!endDate && !noEndDate) {
    return { error: "Hợp đồng xác định thời hạn bắt buộc phải có ngày kết thúc" };
  }
  if (endDate && endDate < startDate) {
    return { error: "Ngày kết thúc phải sau ngày bắt đầu" };
  }
  if (noEndDate) endDate = null;

  const baseSalary = Number(payload.base_salary);
  if (!Number.isFinite(baseSalary) || baseSalary < 0) {
    return { error: "Lương ký hợp đồng không hợp lệ" };
  }

  const allowance = Number(payload.allowance);
  if (!Number.isFinite(allowance) || allowance < 0) {
    return { error: "Lương đóng BHXH không hợp lệ" };
  }

  const creationMethod = normalizeText(payload.creation_method).toUpperCase();
  if (!CREATE_METHODS.includes(creationMethod)) {
    return { error: "Cách tạo hợp đồng không hợp lệ" };
  }

  let templateId = null;
  if (creationMethod === "FROM_TEMPLATE") {
    templateId = parsePositiveInt(payload.template_id);
    if (!templateId) return { error: "Vui lòng chọn mẫu hợp đồng Word" };
  } else if (!file) {
    return { error: "Vui lòng upload file hợp đồng DOCX" };
  }

  if (
    file &&
    !/\.docx$/i.test(path.extname(file.originalname || file.filename || ""))
  ) {
    return { error: "Chỉ chấp nhận file hợp đồng định dạng .docx" };
  }

  return {
    payload: {
      employee_id: employeeId,
      contract_code: contractCode,
      contract_type: contractType,
      start_date: startDate,
      end_date: endDate,
      base_salary: baseSalary,
      allowance,
      creation_method: creationMethod,
      template_id: templateId,
      employee_code: normalizeText(payload.employee_code).slice(0, 50),
      employee_name: normalizeText(payload.employee_name).slice(0, 255),
      employee_dob: normalizeText(payload.employee_dob).slice(0, 10),
      employee_gender: normalizeText(payload.employee_gender).slice(0, 20),
      employee_address: normalizeText(payload.employee_address).slice(0, 500),
      employee_phone: normalizeText(payload.employee_phone).slice(0, 50),
      employee_email: normalizeText(payload.employee_email).slice(0, 255),
      employee_department: normalizeText(payload.employee_department).slice(0, 255),
      employee_position: normalizeText(payload.employee_position).slice(0, 255),
      note: normalizeText(payload.note).slice(0, 500),
    },
  };
};

const buildTemplateSummary = (row) => {
  let hasFile = false;
  let fileSize = null;
  let fileUpdatedAt = null;

  if (row.template_file_path) {
    try {
      const filePath = resolveTemplatePath(row.template_file_path);
      const stats = fs.statSync(filePath);
      hasFile = true;
      fileSize = stats.size;
      fileUpdatedAt = stats.mtime.toISOString();
    } catch {
      hasFile = false;
    }
  }

  return {
    id: row.id,
    name: row.name,
    contract_type: row.contract_type,
    contract_type_label:
      CONTRACT_TEMPLATE_TYPE_LABELS[row.contract_type] || row.contract_type,
    has_file: hasFile,
    file_name: row.name,
    file_format: "DOCX",
    file_size: fileSize,
    file_updated_at: row.updated_at
      ? new Date(row.updated_at).toISOString()
      : fileUpdatedAt,
  };
};

export const getActiveContractTemplates = async () => {
  const [rows] = await db.query(
    `SELECT id, name, contract_type, template_file_path, updated_at
     FROM contract_templates
     WHERE is_active = 1
     ORDER BY id ASC`,
  );

  return rows.map(buildTemplateSummary);
};

const getTemplateById = async (templateId) => {
  const [rows] = await db.query(
    `SELECT id, name, contract_type, template_file_path, default_html_content
     FROM contract_templates
     WHERE id = ? AND is_active = 1
     LIMIT 1`,
    [templateId],
  );

  return rows[0] || null;
};

export const getContractTemplatePreview = async (templateId) => {
  const template = await getTemplateById(templateId);
  if (!template) return { notFound: true };

  try {
    const zip = await readTemplateZip(template);
    const placeholders = extractTemplatePlaceholders(zip);

    return {
      success: true,
      template: {
        id: template.id,
        name: template.name,
        contract_type: template.contract_type,
      },
      placeholders: placeholders.map((placeholder) => ({
        placeholder,
        label:
          TEMPLATE_FIELD_MAP[normalizeTemplateKey(placeholder)]?.label ||
          placeholder,
        mapped: Boolean(TEMPLATE_FIELD_MAP[normalizeTemplateKey(placeholder)]),
      })),
      text: extractTemplateText(zip),
    };
  } catch (error) {
    if (error.code === "INVALID_TEMPLATE_PATH" || error.code === "ENOENT") {
      return { missingFile: true };
    }

    throw error;
  }
};

export const getContractTemplateFile = async (templateId) => {
  const template = await getTemplateById(templateId);
  if (!template) return { notFound: true };

  try {
    const filePath = resolveTemplatePath(template.template_file_path);
    if (!fs.existsSync(filePath)) return { missingFile: true };

    return {
      success: true,
      name: template.name,
      filePath,
    };
  } catch (error) {
    if (["INVALID_TEMPLATE_PATH", "ENOENT"].includes(error.code)) {
      return { missingFile: true };
    }
    throw error;
  }
};

const getTemplateSummaryById = async (templateId) => {
  const [rows] = await db.query(
    `SELECT id, name, contract_type, template_file_path, updated_at
     FROM contract_templates
     WHERE id = ? AND is_active = 1
     LIMIT 1`,
    [templateId],
  );

  return rows[0] ? buildTemplateSummary(rows[0]) : null;
};

export const getContractTemplateEditorConfig = async (user, templateId) => {
  if (!hasPermission(user?.permissions, "HR.CONTRACT_MANAGE")) {
    return { forbidden: true };
  }

  const template = await getTemplateById(templateId);
  if (!template) return { notFound: true };

  let filePath;
  let stats;
  try {
    filePath = resolveTemplatePath(template.template_file_path);
    stats = await fs.promises.stat(filePath);
  } catch (error) {
    if (["INVALID_TEMPLATE_PATH", "ENOENT"].includes(error.code)) {
      return { missingFile: true };
    }
    throw error;
  }

  if (!stats.isFile()) return { missingFile: true };
  if (!DOC_JWT_SECRET) return { disabled: true };

  const templateName = normalizeText(template.name);
  const fileName = /\.docx$/i.test(templateName)
    ? templateName
    : `${templateName || "Mau_hop_dong"}.docx`;
  const actorId = Number(user?.employee_id || user?.user_id || 0) || null;
  const tokenPayload = {
    user_id: user?.user_id || null,
    employee_id: actorId,
    role_id: user?.role_id || "",
    data_scope: user?.data_scope || "ALL",
    permissions: Array.isArray(user?.permissions) ? user.permissions : [],
  };
  const fileToken = buildDocToken({
    purpose: "contract_template_file",
    templateId,
    ...tokenPayload,
  });
  const editToken = buildDocToken({
    purpose: "onlyoffice_template_edit",
    templateId,
    ...tokenPayload,
  });
  const documentKey = crypto
    .createHash("sha1")
    .update(`${templateId}:${path.basename(filePath)}:${Math.floor(stats.mtimeMs)}`)
    .digest("hex");

  const config = {
    document: {
      fileType: "docx",
      key: documentKey,
      title: fileName,
      url: `${CONTRACT_PUBLIC_API_URL}/contracts/files/${fileToken}`,
      permissions: {
        download: true,
        print: true,
        copy: true,
        edit: true,
        modifyContent: true,
        fillForms: true,
        comment: true,
      },
    },
    documentType: "text",
    editorConfig: {
      mode: "edit",
      lang: "vi",
      user: {
        id: String(user?.user_id || actorId || "hr"),
        name: normalizeText(user?.full_name || user?.username) || "Người dùng",
      },
      customization: {
        autosave: true,
        forcesave: true,
      },
      callbackUrl: `${CONTRACT_PUBLIC_API_URL}/contracts/onlyoffice/callback?token=${editToken}`,
    },
  };

  return {
    enabled: true,
    canEdit: true,
    mode: "edit",
    editorScriptUrl: `${ONLYOFFICE_PUBLIC_URL}/web-apps/apps/api/documents/api.js`,
    config: {
      ...config,
      token: jwt.sign(config, DOC_JWT_SECRET, { noTimestamp: true }),
    },
  };
};

export const saveContractTemplate = async (user, payload = {}, file = null) => {
  const contractType = normalizeText(payload.contract_type).toUpperCase();

  if (!DRAFT_CONTRACT_TYPES.includes(contractType)) {
    return { invalidType: true };
  }
  if (!file?.path) return { missingFile: true };

  const templateFilePath = path.posix.join(
    "uploads",
    "templates",
    path.basename(file.filename),
  );
  const name = normalizeText(file.originalname).slice(0, 255) || `${contractType}.docx`;
  const createdBy = Number(user?.employee_id || user?.user_id || 0) || null;
  const replace = payload.replace === true || payload.replace === "true";

  const [existingRows] = await db.query(
    `SELECT id, name, contract_type, template_file_path, updated_at
     FROM contract_templates
     WHERE contract_type = ? AND is_active = 1
     ORDER BY id DESC
     LIMIT 1`,
    [contractType],
  );
  const existingTemplate = existingRows[0] || null;

  if (existingTemplate && !replace) {
    return { needsReplace: true, template: buildTemplateSummary(existingTemplate) };
  }

  try {
    if (existingTemplate) {
      await db.query(
        `UPDATE contract_templates
         SET name = ?, template_file_path = ?, updated_at = NOW()
         WHERE id = ?`,
        [name, templateFilePath, existingTemplate.id],
      );

      if (existingTemplate.template_file_path) {
        try {
          await fs.promises.unlink(
            resolveTemplatePath(existingTemplate.template_file_path),
          );
        } catch {}
      }

      return {
        success: true,
        replaced: true,
        template: await getTemplateSummaryById(existingTemplate.id),
      };
    }

    const [insertResult] = await db.query(
      `INSERT INTO contract_templates
        (name, contract_type, template_file_path, default_html_content, is_active, created_by)
       VALUES (?, ?, ?, '', 1, ?)`,
      [name, contractType, templateFilePath, createdBy],
    );

    return {
      success: true,
      replaced: false,
      template: await getTemplateSummaryById(insertResult.insertId),
    };
  } catch (error) {
    await fs.promises.unlink(file.path).catch(() => {});
    throw error;
  }
};

export const createDraftContract = async (user, payload, file = null) => {
  const scope = buildScopeClause(user);

  const [employeeRows] = await db.query(
    `SELECT e.id
     FROM employees e
     WHERE ${scope.clause} AND e.id = ?
     LIMIT 1`,
    [...scope.params, payload.employee_id],
  );

  if (!employeeRows.length) return { notFound: true };

  const [duplicateRows] = await db.query(
    `SELECT contract_code FROM (
       SELECT contract_code FROM employment_contracts
       UNION ALL
       SELECT contract_code FROM contracts
     ) AS existing_contracts
     WHERE contract_code = ?
     LIMIT 1`,
    [payload.contract_code],
  );

  if (duplicateRows.length) return { duplicateCode: true };

  let template = null;
  let generatedFile = null;
  if (payload.creation_method === "FROM_TEMPLATE") {
    template = await getTemplateById(payload.template_id);

    if (!template) return { invalidTemplate: true };
    if (!template.template_file_path) return { invalidTemplate: true };

    generatedFile = await generateFilledContractDocx(template, payload);
    if (generatedFile.missingFields) {
      return { missingTemplateFields: generatedFile.missingFields };
    }
  }

  const editorHtmlContent = `${template?.default_html_content || ""}${buildEmployeeSummaryHtml(payload)}`;
  const draftDocxPath = generatedFile?.draftDocxPath
    ? generatedFile.draftDocxPath
    : file
      ? path.posix.join(
          "uploads",
          "drafts",
          String(new Date().getFullYear()),
          path.basename(file.filename),
        )
      : null;
  const createdBy = Number(user?.employee_id || user?.user_id || 0) || null;

  if (!createdBy) {
    if (generatedFile?.absolutePath) {
      await fs.promises.unlink(generatedFile.absolutePath).catch(() => {});
    }
    return { missingCreator: true };
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [insertResult] = await connection.query(
      `INSERT INTO employment_contracts
        (contract_code, employee_id, creation_method, template_id, contract_type,
         start_date, end_date, base_salary, allowance, editor_html_content,
         draft_docx_path, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?)`,
      [
        payload.contract_code,
        payload.employee_id,
        payload.creation_method,
        payload.template_id,
        payload.contract_type,
        payload.start_date,
        payload.end_date,
        payload.base_salary,
        payload.allowance,
        editorHtmlContent,
        draftDocxPath,
        createdBy,
      ],
    );

    await connection.query(
      `INSERT INTO contract_approval_logs (contract_id, actor_id, action, note)
       VALUES (?, ?, 'CREATE', ?)`,
      [
        insertResult.insertId,
        createdBy,
        payload.creation_method === "FROM_TEMPLATE"
          ? "Tạo từ mẫu Word"
          : "Upload file DOCX",
      ],
    );

    await connection.commit();

    return { success: true, contract_id: insertResult.insertId };
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") return { duplicateCode: true };
    if (file?.path) {
      await fs.promises.unlink(file.path).catch(() => {});
    }
    if (generatedFile?.absolutePath) {
      await fs.promises.unlink(generatedFile.absolutePath).catch(() => {});
    }

    throw error;
  } finally {
    connection.release();
  }
};

export const getContractList = async (user, filters = {}) => {
  const { conditions, params } = buildBaseConditions(user, filters);

  if (filters.status === "PENDING_APPROVAL") {
    conditions.push("c.approval_status = 'PENDING_APPROVAL'");
  } else if (filters.status === "REJECTED") {
    conditions.push("c.approval_status = 'REJECTED'");
  } else if (filters.status === "PENDING_SIGN") {
    conditions.push(
      "c.approval_status = 'APPROVED' AND NOT EXISTS (SELECT 1 FROM contract_signatures cs WHERE cs.contract_id = c.id)",
    );
  } else if (filters.status === "SIGNED") {
    conditions.push("c.approval_status = 'SIGNED'");
  } else if (filters.status && filters.status !== "ALL") {
    conditions.push("c.status = ?");
    params.push(filters.status);
  }

  const [rows] = await db.query(
    `SELECT
      c.id,
      c.contract_code,
      c.employee_id,
      e.employee_code,
      e.full_name,
      e.email,
      e.phone,
      e.department_id,
      d.department_code,
      d.name AS department_name,
      e.position_id,
      p.position_code,
      p.title AS position_title,
      p.grade_level,
      c.contract_type,
      DATE_FORMAT(c.start_date, '%Y-%m-%d') AS start_date,
      DATE_FORMAT(c.end_date, '%Y-%m-%d') AS end_date,
      c.signed_salary,
      c.insurance_salary,
      c.status,
      c.approval_status,
      c.approver_id,
      DATE_FORMAT(c.approved_at, '%Y-%m-%d %H:%i:%s') AS approved_at,
      (
        SELECT COALESCE(e3.full_name, u3.username)
        FROM users u3
        LEFT JOIN employees e3 ON e3.id = u3.employee_id
        WHERE u3.employee_id = c.approver_id OR u3.id = c.approver_id
        ORDER BY u3.id ASC
        LIMIT 1
      ) AS approver_name,
      c.rejected_by,
      DATE_FORMAT(c.rejected_at, '%Y-%m-%d %H:%i:%s') AS rejected_at,
      (
        SELECT COALESCE(e5.full_name, u5.username)
        FROM users u5
        LEFT JOIN employees e5 ON e5.id = u5.employee_id
        WHERE u5.employee_id = c.rejected_by OR u5.id = c.rejected_by
        ORDER BY u5.id ASC
        LIMIT 1
      ) AS rejected_by_name,
      c.rejection_reason,
      c.revision_request,
      c.note,
      (
        SELECT DATE_FORMAT(cs.signed_at, '%Y-%m-%d %H:%i:%s')
        FROM contract_signatures cs
        WHERE cs.contract_id = c.id
        ORDER BY cs.id DESC
        LIMIT 1
      ) AS signed_at,
      (
        SELECT cs.signer_id
        FROM contract_signatures cs
        WHERE cs.contract_id = c.id
        ORDER BY cs.id DESC
        LIMIT 1
      ) AS signed_by,
      (
        SELECT cs.signer_role
        FROM contract_signatures cs
        WHERE cs.contract_id = c.id
        ORDER BY cs.id DESC
        LIMIT 1
      ) AS signed_by_role,
      (
        SELECT cs.version_no
        FROM contract_signatures cs
        WHERE cs.contract_id = c.id
        ORDER BY cs.id DESC
        LIMIT 1
      ) AS signed_version_no,
      (
        SELECT COALESCE(e6.full_name, u6.username)
        FROM contract_signatures cs
        LEFT JOIN users u6 ON u6.employee_id = cs.signer_id OR u6.id = cs.signer_id
        LEFT JOIN employees e6 ON e6.id = cs.signer_id
        WHERE cs.contract_id = c.id
        ORDER BY cs.id DESC
        LIMIT 1
      ) AS signed_by_name,
      sh.approval_round,
      DATE_FORMAT(sh.submitted_at, '%Y-%m-%d %H:%i:%s') AS submitted_at,
      (
        SELECT COALESCE(e2.full_name, u2.username)
        FROM users u2
        LEFT JOIN employees e2 ON e2.id = u2.employee_id
        WHERE u2.employee_id = sh.submitted_by OR u2.id = sh.submitted_by
        ORDER BY u2.id ASC
        LIMIT 1
      ) AS submitted_by_name
    FROM contracts c
    INNER JOIN employees e ON e.id = c.employee_id
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN positions p ON p.id = e.position_id
    LEFT JOIN contract_submission_history sh
      ON sh.contract_id = c.id AND sh.status = 'PENDING_APPROVAL'
    WHERE ${conditions.join(" AND ")}
    ORDER BY
      c.end_date IS NULL ASC,
      c.end_date ASC,
      e.employee_code ASC`,
    params,
  );

  return rows;
};

const CONTRACT_FILE_EXTENSIONS = ["docx", "pdf"];
const CONTRACT_FILE_ROOT = path.resolve(process.cwd(), "uploads", "contracts");
const CONTRACT_OFFICIAL_ROOT = path.resolve(process.cwd(), "uploads", "officials");
const CONTRACT_SIGN_PERMISSION = "HR.CONTRACT_SIGN";

const normalizeBaseUrl = (value) =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "");

const ONLYOFFICE_BASE_URL = normalizeBaseUrl(
  process.env.ONLYOFFICE_URL || "http://localhost:8081",
);
const ONLYOFFICE_PUBLIC_URL = normalizeBaseUrl(
  process.env.ONLYOFFICE_PUBLIC_URL || ONLYOFFICE_BASE_URL,
);
const CONTRACT_API_BASE_URL = normalizeBaseUrl(
  process.env.CONTRACT_API_BASE_URL ||
    process.env.API_BASE_URL ||
    "http://localhost:8080",
);
const CONTRACT_PUBLIC_API_URL = normalizeBaseUrl(
  process.env.CONTRACT_PUBLIC_API_URL || CONTRACT_API_BASE_URL,
);
const DOC_JWT_SECRET =
  process.env.ONLYOFFICE_JWT_SECRET || process.env.JWT_SECRET || "";

const ONLYOFFICE_ALLOWED_HOSTS = new Set(
  [ONLYOFFICE_BASE_URL, ONLYOFFICE_PUBLIC_URL]
    .map((value) => {
      try {
        return new URL(value).host;
      } catch {
        return null;
      }
    })
    .filter(Boolean),
);

const isAllowedOnlyOfficeUrl = (value) => {
  try {
    return ONLYOFFICE_ALLOWED_HOSTS.has(new URL(String(value)).host);
  } catch {
    return false;
  }
};

const normalizeExtension = (value) =>
  path.extname(String(value || "")).slice(1).toLowerCase();

const resolveContractFilePath = (storedPath) => {
  if (!storedPath) return null;

  const absolutePath = path.isAbsolute(storedPath)
    ? path.resolve(storedPath)
    : path.resolve(process.cwd(), storedPath);
  const relativePath = path.relative(CONTRACT_FILE_ROOT, absolutePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return absolutePath;
};

const resolveOfficialFilePath = (storedPath) => {
  if (!storedPath) return null;

  const absolutePath = path.isAbsolute(storedPath)
    ? path.resolve(storedPath)
    : path.resolve(process.cwd(), storedPath);
  const relativePath = path.relative(CONTRACT_OFFICIAL_ROOT, absolutePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return absolutePath;
};

const buildContractAccess = (user) => {
  const role = String(user?.role_id || "").toUpperCase();
  const isHr =
    hasPermission(user?.permissions, "HR.CONTRACT_MANAGE") &&
    hasPermission(user?.permissions, "HR.PROFILE_MANAGE");
  const isDirector = role === "DIRECTOR";
  const isSigner =
    hasPermission(user?.permissions, CONTRACT_SIGN_PERMISSION) && !isHr;
  const isEmployee =
    role === "EMPLOYEE" ||
    (!isHr && !isDirector && !isSigner && user?.data_scope === "SELF");

  return {
    isHr,
    isDirector,
    isSigner,
    isEmployee,
    canViewManaged: isHr || isDirector || isSigner,
  };
};

export const canApproveContracts = (user) =>
  buildContractAccess(user).isDirector;

const deriveApprovalState = (history = [], legacyStatus = "", contract = {}) => {
  const latest = history[0] || null;

  if (latest?.action === "SIGN_OFFICIAL") {
    return { state: "SIGNED", reason: "", revisionRequest: "" };
  }
  if (["DIRECTOR_REJECT", "SIGN_REVISION_REQUEST"].includes(latest?.action)) {
    return {
      state: "REJECTED",
      reason: normalizeText(contract.rejection_reason) || latest.note || "",
      revisionRequest: normalizeText(contract.revision_request),
      rejectedBy: contract.rejected_by || latest.actor_id || null,
      rejectedByName: normalizeText(contract.rejected_by_name) || latest.actor_name || "",
      rejectedAt: normalizeText(contract.rejected_at) || latest.created_at || "",
    };
  }
  if (latest?.action === "DIRECTOR_APPROVE") {
    return { state: "APPROVED", reason: "", revisionRequest: "" };
  }
  if (latest?.action === "SUBMIT_APPROVAL") {
    return { state: "PENDING_APPROVAL", reason: "", revisionRequest: "" };
  }
  if (
    ["FILE_UPLOAD", "FILE_REPLACE", "EDIT_SAVE_DOCX"].includes(latest?.action) &&
    history.some((entry) => entry.action === "DIRECTOR_REJECT")
  ) {
    return {
      state: "DRAFT",
      reason: "",
      revisionRequest: "",
      reworkRequired: true,
    };
  }
  if (["ACTIVE", "EXPIRING_SOON", "EXPIRED", "TERMINATED"].includes(legacyStatus)) {
    return { state: "DRAFT", reason: "", revisionRequest: "" };
  }

  return { state: "DRAFT", reason: "", revisionRequest: "" };
};

const canEditByApproval = (approval) =>
  ["DRAFT", "REJECTED"].includes(approval?.state);

const isValidDateValue = (value) => {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
};

const getSubmitReadiness = (approval = {}, history = []) => {
  if (approval.state === "PENDING_APPROVAL") {
    return { allowed: false, reason: "Hợp đồng đang chờ Giám đốc duyệt" };
  }

  if (approval.state === "APPROVED") {
    return { allowed: false, reason: "Hợp đồng đã được Giám đốc duyệt" };
  }

  if (approval.state === "SIGNED") {
    return { allowed: false, reason: "Hợp đồng đã được ký chính thức" };
  }

  if (approval.state === "REJECTED") {
    const rejectIndex = history.findIndex((entry) =>
      ["DIRECTOR_REJECT", "SIGN_REVISION_REQUEST"].includes(entry.action),
    );
    const hasUpdateAfterReject =
      rejectIndex >= 0 &&
      history
        .slice(0, rejectIndex)
        .some((entry) =>
          ["FILE_UPLOAD", "FILE_REPLACE", "EDIT_SAVE_DOCX"].includes(entry.action),
        );

    if (!hasUpdateAfterReject) {
      return {
        allowed: false,
        reason: "Cần cập nhật file hợp đồng theo yêu cầu trước khi gửi lại",
      };
    }
  }

  return { allowed: true, reason: "" };
};

const validateSubmissionData = async (contract, fileRow, contractId) => {
  const errors = [];

  if (
    !contract?.employee_id ||
    !normalizeText(contract.employee_code) ||
    !normalizeText(contract.full_name)
  ) {
    errors.push("Thông tin nhân viên chưa đầy đủ (mã nhân viên, họ tên)");
  }

  if (!contract?.id || !normalizeText(contract.contract_code)) {
    errors.push("Thông tin hợp đồng chưa đầy đủ (mã hợp đồng)");
  }

  if (!normalizeText(contract?.contract_type)) {
    errors.push("Loại hợp đồng chưa hợp lệ");
  }

  const startDate = isValidDateValue(contract?.start_date)
    ? new Date(contract.start_date)
    : null;
  if (!startDate) {
    errors.push("Ngày bắt đầu hợp đồng chưa hợp lệ");
  }

  if (normalizeText(contract?.end_date)) {
    const endDate = new Date(contract.end_date);
    if (Number.isNaN(endDate.getTime())) {
      errors.push("Ngày kết thúc hợp đồng chưa hợp lệ");
    } else if (startDate && endDate < startDate) {
      errors.push("Ngày kết thúc hợp đồng phải sau ngày bắt đầu");
    }
  }

  const signedSalary = Number(contract?.signed_salary);
  if (!Number.isFinite(signedSalary) || signedSalary <= 0) {
    errors.push("Mức lương ký hợp đồng chưa được nhập");
  }

  if (!fileRow) {
    errors.push("File hợp đồng DOCX/PDF chưa được lưu");
  } else {
    if (Number(fileRow.contract_id) !== Number(contractId)) {
      errors.push("File hợp đồng không được liên kết đúng với hợp đồng này");
    }

    if (!CONTRACT_FILE_EXTENSIONS.includes(normalizeExtension(fileRow.file_name))) {
      errors.push("File hợp đồng phải có định dạng DOCX hoặc PDF");
    }

    const absolutePath = resolveContractFilePath(fileRow.file_path);
    if (!absolutePath) {
      errors.push("Đường dẫn file hợp đồng không hợp lệ");
    } else {
      try {
        await fs.promises.access(absolutePath, fs.constants.R_OK);
      } catch {
        errors.push("File hợp đồng không tồn tại trên hệ thống");
      }
    }
  }

  return errors;
};

const buildDocToken = (payload, expiresIn = "20m") =>
  jwt.sign(payload, DOC_JWT_SECRET, { expiresIn });

const verifyDocToken = (token) => jwt.verify(token, DOC_JWT_SECRET);

const findScopedContract = async (user, contractId, executor = db) => {
  const scope = buildScopeClause(user);

  const [rows] = await executor.query(
    `SELECT
      c.id,
      c.contract_code,
      c.employee_id,
      e.employee_code,
      e.full_name,
      e.gender,
      DATE_FORMAT(e.dob, '%Y-%m-%d') AS dob,
      e.address,
      e.email,
      e.phone,
      e.hire_date,
      e.department_id,
      d.department_code,
      COALESCE(d.department_name, d.name) AS department_name,
      e.position_id,
      p.position_code,
      COALESCE(p.position_name, p.name, p.title) AS position_title,
      c.contract_type,
      DATE_FORMAT(c.start_date, '%Y-%m-%d') AS start_date,
      DATE_FORMAT(c.end_date, '%Y-%m-%d') AS end_date,
      c.signed_salary,
      c.insurance_salary,
      c.status,
      c.approval_status,
      c.approver_id,
      DATE_FORMAT(c.approved_at, '%Y-%m-%d %H:%i:%s') AS approved_at,
      (
        SELECT COALESCE(e7.full_name, u7.username)
        FROM users u7
        LEFT JOIN employees e7 ON e7.id = u7.employee_id
        WHERE u7.employee_id = c.approver_id OR u7.id = c.approver_id
        ORDER BY u7.id ASC
        LIMIT 1
      ) AS approver_name,
      c.rejected_by,
      DATE_FORMAT(c.rejected_at, '%Y-%m-%d %H:%i:%s') AS rejected_at,
      (
        SELECT COALESCE(e4.full_name, u4.username)
        FROM users u4
        LEFT JOIN employees e4 ON e4.id = u4.employee_id
        WHERE u4.employee_id = c.rejected_by OR u4.id = c.rejected_by
        ORDER BY u4.id ASC
        LIMIT 1
      ) AS rejected_by_name,
      c.rejection_reason,
      c.revision_request,
      c.note,
      DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
    FROM contracts c
    INNER JOIN employees e ON e.id = c.employee_id
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN positions p ON p.id = e.position_id
    WHERE ${scope.clause} AND c.id = ?
    LIMIT 1`,
    [...scope.params, contractId],
  );

  return rows[0] || null;
};

const CONTRACT_FILE_SELECT = `
      cf.id,
      cf.contract_id,
      cf.version_no,
      cf.source_key,
      cf.file_name,
      cf.stored_name,
      cf.file_path,
      cf.file_ext,
      cf.mime_type,
      cf.file_size,
      cf.uploaded_by,
      COALESCE(
        e.full_name,
        (
          SELECT u.username
          FROM users u
          WHERE u.employee_id = cf.uploaded_by OR u.id = cf.uploaded_by
          ORDER BY u.id ASC
          LIMIT 1
        ),
        CONCAT('ID ', cf.uploaded_by)
      ) AS uploaded_by_name,
      DATE_FORMAT(cf.created_at, '%Y-%m-%d %H:%i:%s') AS uploaded_at
    FROM contract_files cf
    LEFT JOIN employees e ON e.id = cf.uploaded_by`;

const getContractFileRow = async (contractId, executor = db) => {
  const [rows] = await executor.query(
    `SELECT ${CONTRACT_FILE_SELECT}
    WHERE cf.contract_id = ?
    ORDER BY cf.version_no DESC, cf.id DESC
    LIMIT 1`,
    [contractId],
  );

  return rows[0] || null;
};

export const getContractFileVersions = async (contractId, executor = db) => {
  const [rows] = await executor.query(
    `SELECT ${CONTRACT_FILE_SELECT}
    WHERE cf.contract_id = ?
    ORDER BY cf.version_no DESC, cf.id DESC`,
    [contractId],
  );

  return rows.map(mapContractFile);
};

const getContractFileVersionRow = async (
  contractId,
  fileId,
  executor = db,
) => {
  const [rows] = await executor.query(
    `SELECT ${CONTRACT_FILE_SELECT}
    WHERE cf.contract_id = ? AND cf.id = ?
    LIMIT 1`,
    [contractId, fileId],
  );

  return rows[0] || null;
};

const mapContractFile = (row) => {
  if (!row) return null;

  return {
    id: row.id,
    contract_id: row.contract_id,
    version_no: Number(row.version_no || 0),
    source_key: row.source_key || null,
    file_name: row.file_name,
    stored_name: row.stored_name,
    file_ext: row.file_ext,
    mime_type: row.mime_type,
    file_size: Number(row.file_size || 0),
    uploaded_by: row.uploaded_by,
    uploaded_by_name: row.uploaded_by_name,
    uploaded_at: row.uploaded_at,
  };
};

const getContractHistory = async (contractId) => {
  const [rows] = await db.query(
    `SELECT
      l.id,
      l.action,
      l.note,
      DATE_FORMAT(l.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      l.actor_id,
      COALESCE(e.full_name, u.username, CONCAT('ID ', l.actor_id)) AS actor_name
    FROM contract_approval_logs l
    LEFT JOIN employees e ON e.id = l.actor_id
    LEFT JOIN users u ON u.employee_id = l.actor_id OR u.id = l.actor_id
    WHERE l.contract_id = ? AND l.contract_source = 'CONTRACT'
    ORDER BY l.created_at DESC, l.id DESC`,
    [contractId],
  );

  return rows;
};

const getContractSubmissions = async (contractId) => {
  const [rows] = await db.query(
    `SELECT
      s.id,
      s.approval_round,
      s.status,
      s.version_id,
      s.note,
      s.previous_rejection_reason,
      s.submitted_by,
      COALESCE(e.full_name, u.username, CONCAT('ID ', s.submitted_by)) AS submitted_by_name,
      DATE_FORMAT(s.submitted_at, '%Y-%m-%d %H:%i:%s') AS submitted_at,
      s.approver_id,
      COALESCE(ae.full_name, au.username, CONCAT('ID ', s.approver_id)) AS approver_name,
      DATE_FORMAT(s.approved_at, '%Y-%m-%d %H:%i:%s') AS approved_at,
      DATE_FORMAT(s.rejected_at, '%Y-%m-%d %H:%i:%s') AS rejected_at,
      s.rejection_reason,
      s.revision_request
    FROM contract_submission_history s
    LEFT JOIN employees e ON e.id = s.submitted_by
    LEFT JOIN users u ON u.employee_id = s.submitted_by OR u.id = s.submitted_by
    LEFT JOIN employees ae ON ae.id = s.approver_id
    LEFT JOIN users au ON au.employee_id = s.approver_id OR au.id = s.approver_id
    WHERE s.contract_id = ?
    ORDER BY s.id DESC`,
    [contractId],
  );

  return rows;
};

export const getContractSignatures = async (contractId, executor = db) => {
  const [rows] = await executor.query(
    `SELECT
      cs.id,
      cs.contract_id,
      cs.contract_code,
      cs.employee_id,
      cs.submission_id,
      cs.file_id,
      cs.version_no,
      cs.signer_id,
      cs.signer_role,
      cs.signer_name,
      DATE_FORMAT(cs.signed_at, '%Y-%m-%d %H:%i:%s') AS signed_at,
      cs.result,
      cs.signature_method,
      cs.transaction_ref,
      cs.official_file_name,
      cs.mime_type,
      cs.file_size,
      DATE_FORMAT(cs.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
    FROM contract_signatures cs
    WHERE cs.contract_id = ?
    ORDER BY cs.id DESC`,
    [contractId],
  );

  return rows;
};

const getApprovedSubmission = async (contractId, executor = db) => {
  const [rows] = await executor.query(
    `SELECT
      s.id,
      s.version_id,
      s.approver_id,
      DATE_FORMAT(s.approved_at, '%Y-%m-%d %H:%i:%s') AS approved_at,
      cf.version_no,
      cf.file_name,
      cf.stored_name,
      cf.file_path,
      cf.mime_type,
      cf.file_size
    FROM contract_submission_history s
    INNER JOIN contract_files cf ON cf.id = s.version_id
    WHERE s.contract_id = ? AND s.status = 'APPROVED'
    ORDER BY s.id DESC
    LIMIT 1`,
    [contractId],
  );

  return rows[0] || null;
};

export const getContractAccessContext = async (user, contractId) => {
  const contract = await findScopedContract(user, contractId);
  if (!contract) return { notFound: true };

  const [history, signatures, approvedSubmission] = await Promise.all([
    getContractHistory(contractId),
    getContractSignatures(contractId),
    getApprovedSubmission(contractId),
  ]);
  const approval = deriveApprovalState(history, contract.status, contract);
  const access = buildContractAccess(user);
  const latestSignature = signatures[0] || null;
  const canView =
    access.canViewManaged ||
    (access.isEmployee && ["APPROVED", "SIGNED"].includes(approval.state));
  const canEdit = access.isHr && canEditByApproval(approval);
  const submitReadiness = getSubmitReadiness(approval, history);
  const canSubmit = canEdit && submitReadiness.allowed;
  const canApprove =
    access.isDirector && approval.state === "PENDING_APPROVAL";
  const canSign =
    access.isSigner && approval.state === "APPROVED" && !latestSignature;
  const canDownloadOfficial = canView && Boolean(latestSignature);

  return {
    contract,
    history,
    signatures,
    approvedSubmission,
    latestSignature,
    approval,
    access,
    permissions: {
      canView,
      canEdit,
      canSubmit,
      canApprove,
      canSign,
      canRequestSigningRevision: canSign,
      canDownloadOfficial,
      canDownload: canView,
      canViewManaged: access.canViewManaged,
      submitBlockReason: submitReadiness.reason,
    },
  };
};

export const getContractDetail = async (user, contractId) => {
  const context = await getContractAccessContext(user, contractId);
  if (context.notFound) return { notFound: true };
  if (!context.permissions.canView) return { forbidden: true };

  const fileRow = await getContractFileRow(contractId);
  const versions = await getContractFileVersions(contractId);
  const submissions = await getContractSubmissions(contractId);
  const latestSubmission = submissions[0] || null;

  return {
    contract: context.contract,
    file: mapContractFile(fileRow),
    versions,
    history: context.history,
    submissions,
    approval: {
      ...context.approval,
      submitted_at: latestSubmission?.submitted_at || null,
      submitted_by_name: latestSubmission?.submitted_by_name || null,
      approval_round: latestSubmission?.approval_round || null,
      version_id: latestSubmission?.version_id || null,
      note: latestSubmission?.note || "",
      approved_at: context.contract.approved_at || null,
      approver_name: context.contract.approver_name || "",
    },
    permissions: context.permissions,
    signing: {
      can_sign: context.permissions.canSign,
      can_request_revision: context.permissions.canRequestSigningRevision,
      approved_submission_id: context.approvedSubmission?.id || null,
      approved_version_id: context.approvedSubmission?.version_id || null,
      approved_version_no: Number(context.approvedSubmission?.version_no || 0),
      approved_at: context.approvedSubmission?.approved_at || null,
      approver_id: context.contract.approver_id || null,
      approver_name: context.contract.approver_name || "",
      signatures: context.signatures,
      official_file: context.latestSignature
        ? {
            id: context.latestSignature.id,
            file_name: context.latestSignature.official_file_name,
            mime_type: context.latestSignature.mime_type,
            version_no: Number(context.latestSignature.version_no || 0),
            signed_at: context.latestSignature.signed_at,
            signer_name: context.latestSignature.signer_name,
            signature_method: context.latestSignature.signature_method,
          }
        : null,
    },
  };
};

export const getContractFile = async (user, contractId) => {
  const context = await getContractAccessContext(user, contractId);
  if (context.notFound) return { notFound: true };
  if (!context.permissions.canView) return { forbidden: true };

  const fileRow = await getContractFileRow(contractId);
  if (!fileRow) return { missingFile: true };

  const absolutePath = resolveContractFilePath(fileRow.file_path);
  if (!absolutePath) return { missingFile: true };

  try {
    await fs.promises.access(absolutePath, fs.constants.R_OK);
  } catch {
    return { missingFile: true };
  }

  return {
    filePath: absolutePath,
    fileName: fileRow.file_name,
    mimeType: fileRow.mime_type,
  };
};

export const getContractFileVersion = async (
  user,
  contractId,
  fileId,
) => {
  const context = await getContractAccessContext(user, contractId);
  if (context.notFound) return { notFound: true };
  if (!context.permissions.canView) return { forbidden: true };

  const fileRow = await getContractFileVersionRow(contractId, fileId);
  if (!fileRow) return { missingFile: true };

  const absolutePath = resolveContractFilePath(fileRow.file_path);
  if (!absolutePath) return { missingFile: true };

  try {
    await fs.promises.access(absolutePath, fs.constants.R_OK);
  } catch {
    return { missingFile: true };
  }

  return {
    filePath: absolutePath,
    fileName: fileRow.file_name,
    mimeType: fileRow.mime_type,
    file: mapContractFile(fileRow),
  };
};

export const getContractOfficialFile = async (user, contractId) => {
  const context = await getContractAccessContext(user, contractId);
  if (context.notFound) return { notFound: true };
  if (!context.permissions.canView) return { forbidden: true };

  const signature = context.latestSignature;
  if (!signature) return { missingFile: true };

  const [rows] = await db.query(
    `SELECT official_file_path, official_file_name, mime_type
     FROM contract_signatures
     WHERE id = ? AND contract_id = ?
     LIMIT 1`,
    [signature.id, contractId],
  );
  const row = rows[0];
  if (!row) return { missingFile: true };

  const absolutePath = resolveOfficialFilePath(row.official_file_path);
  if (!absolutePath) return { missingFile: true };

  try {
    await fs.promises.access(absolutePath, fs.constants.R_OK);
  } catch {
    return { missingFile: true };
  }

  return {
    filePath: absolutePath,
    fileName: row.official_file_name,
    mimeType: row.mime_type,
    signature,
  };
};

const resolveSelfEmployeeId = (user) => parsePositiveInt(user?.employee_id);

export const getMyOfficialContracts = async (user) => {
  const employeeId = resolveSelfEmployeeId(user);
  if (!employeeId) return { missingEmployee: true };

  const [rows] = await db.query(
    `SELECT
      c.id,
      c.contract_code,
      c.contract_type,
      DATE_FORMAT(c.start_date, '%Y-%m-%d') AS start_date,
      DATE_FORMAT(c.end_date, '%Y-%m-%d') AS end_date,
      c.signed_salary,
      c.insurance_salary,
      c.status,
      c.approval_status,
      c.note,
      e.employee_code,
      e.full_name,
      cs.id AS official_signature_id,
      cs.official_file_path,
      cs.official_file_name,
      cs.mime_type AS official_mime_type,
      cs.version_no AS official_version_no,
      DATE_FORMAT(cs.signed_at, '%Y-%m-%d %H:%i:%s') AS signed_at,
      cs.signer_name,
      cs.signature_method
    FROM contracts c
    INNER JOIN employees e ON e.id = c.employee_id
    INNER JOIN contract_signatures cs ON cs.contract_id = c.id
    WHERE c.employee_id = ?
      AND cs.result = 'SUCCESS'
      AND cs.official_file_path IS NOT NULL
      AND cs.official_file_name IS NOT NULL
      AND cs.id = (
        SELECT MAX(cs2.id)
        FROM contract_signatures cs2
        WHERE cs2.contract_id = c.id
          AND cs2.result = 'SUCCESS'
          AND cs2.official_file_path IS NOT NULL
          AND cs2.official_file_name IS NOT NULL
      )
    ORDER BY cs.signed_at DESC, c.id DESC`,
    [employeeId],
  );

  const contracts = await Promise.all(
    rows.map(async (row) => {
      const filePath = resolveOfficialFilePath(row.official_file_path);
      if (!filePath) return null;

      try {
        await fs.promises.access(filePath, fs.constants.R_OK);
      } catch {
        return null;
      }

      return {
        id: Number(row.id),
        contract_code: row.contract_code,
        employee_code: row.employee_code,
        full_name: row.full_name,
        contract_type: row.contract_type,
        start_date: row.start_date,
        end_date: row.end_date,
        signed_salary: row.signed_salary,
        insurance_salary: row.insurance_salary,
        status: row.status,
        approval_status: row.approval_status,
        note: row.note,
        official: {
          signature_id: Number(row.official_signature_id),
          file_name: row.official_file_name,
          mime_type: row.official_mime_type,
          version_no: Number(row.official_version_no || 0),
          signed_at: row.signed_at,
          signer_name: row.signer_name,
          signature_method: row.signature_method,
        },
      };
    }),
  );

  return { contracts: contracts.filter(Boolean) };
};

export const getMyOfficialContractFile = async (
  user,
  contractId,
  signatureId = null,
) => {
  const employeeId = resolveSelfEmployeeId(user);
  if (!employeeId) return { missingEmployee: true };

  const contractPk = parsePositiveInt(contractId);
  if (!contractPk) return { notFound: true };

  const conditions = [
    "c.id = ?",
    "c.employee_id = ?",
    "cs.result = 'SUCCESS'",
    "cs.official_file_path IS NOT NULL",
    "cs.official_file_name IS NOT NULL",
  ];
  const params = [contractPk, employeeId];
  const requestedSignatureId = parsePositiveInt(signatureId);

  if (requestedSignatureId) {
    conditions.push("cs.id = ?");
    params.push(requestedSignatureId);
  }

  const [rows] = await db.query(
    `SELECT
      c.id AS contract_id,
      c.contract_code,
      cs.id AS signature_id,
      cs.official_file_path,
      cs.official_file_name,
      cs.mime_type,
      cs.version_no,
      cs.signed_at,
      cs.signer_name,
      cs.signature_method
    FROM contracts c
    INNER JOIN contract_signatures cs ON cs.contract_id = c.id
    WHERE ${conditions.join(" AND ")}
    ORDER BY cs.id DESC
    LIMIT 1`,
    params,
  );
  const row = rows[0];
  if (!row) return { notFound: true };

  const filePath = resolveOfficialFilePath(row.official_file_path);
  if (!filePath) return { missingFile: true };

  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
  } catch {
    return { missingFile: true };
  }

  return {
    filePath,
    fileName: row.official_file_name,
    mimeType: row.mime_type,
    contractId: Number(row.contract_id),
    contractCode: row.contract_code,
    signature: {
      id: Number(row.signature_id),
      version_no: Number(row.version_no || 0),
      signed_at: row.signed_at,
      signer_name: row.signer_name,
      signature_method: row.signature_method,
    },
  };
};

export const getMyOfficialContractEditorConfig = async (user, contractId) => {
  const file = await getMyOfficialContractFile(user, contractId);
  if (file.notFound || file.missingFile || file.missingEmployee) return file;
  if (normalizeExtension(file.fileName) !== "docx") return { unsupported: true };
  if (!DOC_JWT_SECRET) return { disabled: true };

  const actorId = resolveSelfEmployeeId(user);
  const tokenPayload = {
    user_id: user?.user_id || null,
    employee_id: actorId,
    role_id: user?.role_id || "",
    data_scope: "SELF",
    permissions: Array.isArray(user?.permissions) ? user.permissions : [],
  };
  const fileToken = buildDocToken({
    purpose: "contract_official_file",
    contractId: file.contractId,
    file_id: file.signature.id,
    ...tokenPayload,
  });
  const documentKey = crypto
    .createHash("sha1")
    .update(`official:${file.contractId}:${file.signature.id}:${file.filePath}`)
    .digest("hex");

  const config = {
    document: {
      fileType: "docx",
      key: documentKey,
      title: file.fileName,
      url: `${CONTRACT_PUBLIC_API_URL}/contracts/files/${fileToken}`,
      permissions: {
        download: true,
        print: true,
        copy: true,
        edit: false,
        modifyContent: false,
        fillForms: false,
        comment: false,
      },
    },
    documentType: "text",
    editorConfig: {
      mode: "view",
      lang: "vi",
      user: {
        id: String(user?.user_id || actorId),
        name: normalizeText(user?.full_name || user?.username) || "Nhân viên",
      },
      customization: {
        autosave: false,
        forcesave: false,
      },
    },
  };

  return {
    enabled: true,
    mode: "view",
    editorScriptUrl: `${ONLYOFFICE_PUBLIC_URL}/web-apps/apps/api/documents/api.js`,
    config: {
      ...config,
      token: jwt.sign(config, DOC_JWT_SECRET, { noTimestamp: true }),
    },
  };
};

export const signContract = async (user, contractId, payload = {}) => {
  const confirmed =
    payload.confirm === true || String(payload.confirm || "").toLowerCase() === "true";
  if (!confirmed) return { confirmationRequired: true };

  const contractPk = Number(contractId);
  const context = await getContractAccessContext(user, contractPk);
  if (context.notFound) return { notFound: true };
  if (!context.permissions.canView || !context.access.isSigner) {
    return {
      forbidden: true,
      reason: "Bạn không có quyền ký hợp đồng",
    };
  }
  if (context.approval?.state !== "APPROVED") {
    return { invalidState: true, state: context.approval?.state || "DRAFT" };
  }
  if (context.latestSignature) return { alreadySigned: true };
  if (!context.approvedSubmission) return { invalidState: true, state: "DRAFT" };

  const signerId =
    Number(user?.employee_id || user?.user_id || context.contract.employee_id) || null;
  if (!signerId) return { missingSigner: true };

  const sourcePath = resolveContractFilePath(context.approvedSubmission.file_path);
  if (!sourcePath) return { missingFile: true };
  try {
    await fs.promises.access(sourcePath, fs.constants.R_OK);
  } catch {
    return { missingFile: true };
  }

  const year = String(new Date().getFullYear());
  const directory = path.resolve(process.cwd(), "uploads", "officials", year);
  await fs.promises.mkdir(directory, { recursive: true });
  const safeCode =
    normalizeText(context.contract.contract_code).replace(/[^a-zA-Z0-9_-]/g, "_") ||
    "hop_dong";
  const extension = normalizeExtension(context.approvedSubmission.file_name);
  const officialFileName = `${safeCode}_v${Number(context.approvedSubmission.version_no || 0)}_${Date.now()}.${extension}`;
  const officialPath = path.join(directory, officialFileName);
  await fs.promises.copyFile(sourcePath, officialPath);
  const officialRelativePath = path
    .relative(process.cwd(), officialPath)
    .split(path.sep)
    .join("/");

  const signerName =
    normalizeText(user?.full_name || user?.username) ||
    normalizeText(context.contract.employee_name) ||
    "Người được phân quyền";
  const signerRole = normalizeText(user?.role_id || "").toUpperCase() || "UNKNOWN";
  const signedAt = new Date().toISOString().slice(0, 19).replace("T", " ");
  const transactionRef = normalizeText(payload.transactionRef).slice(0, 100) || null;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    const [contractRows] = await connection.query(
      "SELECT approval_status FROM contracts WHERE id = ? FOR UPDATE",
      [contractPk],
    );
    if (contractRows[0]?.approval_status !== "APPROVED") {
      await connection.rollback();
      return { invalidState: true, state: contractRows[0]?.approval_status || "DRAFT" };
    }

    const [signatureRows] = await connection.query(
      `SELECT id FROM contract_signatures
       WHERE submission_id = ? OR (contract_id = ? AND version_no = ?)
       LIMIT 1 FOR UPDATE`,
      [
        context.approvedSubmission.id,
        contractPk,
        Number(context.approvedSubmission.version_no || 0),
      ],
    );
    if (signatureRows.length) {
      await connection.rollback();
      return { alreadySigned: true };
    }

    const [signatureResult] = await connection.query(
      `INSERT INTO contract_signatures
        (contract_id, contract_code, employee_id, submission_id, file_id, version_no,
         signer_id, signer_role, signer_name, signed_at, result, signature_method,
         transaction_ref, official_file_path, official_file_name, mime_type, file_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUCCESS', 'INTERNAL_CONFIRMATION', ?, ?, ?, ?, ?)`,
      [
        contractPk,
        context.contract.contract_code,
        Number(context.contract.employee_id),
        Number(context.approvedSubmission.id),
        Number(context.approvedSubmission.version_id),
        Number(context.approvedSubmission.version_no || 0),
        signerId,
        signerRole,
        signerName,
        signedAt,
        transactionRef,
        officialRelativePath,
        officialFileName,
        context.approvedSubmission.mime_type || "application/octet-stream",
        Number(context.approvedSubmission.file_size || 0),
      ],
    );
    const signatureId = Number(signatureResult.insertId);

    await connection.query(
      "UPDATE contracts SET approval_status = 'SIGNED' WHERE id = ?",
      [contractPk],
    );
    await connection.query(
      `UPDATE employment_contracts
       SET status = 'ACTIVE', signer_id = ?, signed_at = ?, official_file_path = ?,
           is_visible_to_employee = 1
       WHERE contract_code = ?`,
      [signerId, signedAt, officialRelativePath, context.contract.contract_code],
    );
    await connection.query(
      `INSERT INTO contract_approval_logs
        (contract_id, contract_source, actor_id, action, note)
       VALUES (?, 'CONTRACT', ?, 'SIGN_OFFICIAL', ?)`,
      [
        contractPk,
        signerId,
        `Ký chính thức phiên bản v${Number(context.approvedSubmission.version_no || 0)} bởi ${signerName}. Xác nhận nội bộ, không phải chữ ký số.`,
      ].map((value, index) => (index === 2 ? String(value).slice(0, 1000) : value)),
    );

    await createContractSigningNotifications(connection, {
      contractId: contractPk,
      contractCode: context.contract.contract_code,
      contractType: context.contract.contract_type,
      employeeId: Number(context.contract.employee_id),
      employeeName: context.contract.full_name,
      signerId,
      signerName,
      signerRole,
      signedAt,
      submissionId: Number(context.approvedSubmission.id),
      versionId: Number(context.approvedSubmission.version_id),
      versionNo: Number(context.approvedSubmission.version_no || 0),
      signatureId,
      signatureMethod: "INTERNAL_CONFIRMATION",
      officialFileName,
      submitterId: Number(user?.employee_id || user?.user_id) || null,
    });

    await connection.commit();

    return {
      success: true,
      signature_id: signatureId,
      signed_at: signedAt,
      signer_id: signerId,
      signer_name: signerName,
      signer_role: signerRole,
      signature_method: "INTERNAL_CONFIRMATION",
      submission_id: Number(context.approvedSubmission.id),
      version_id: Number(context.approvedSubmission.version_id),
      version_no: Number(context.approvedSubmission.version_no || 0),
      official_file_name: officialFileName,
      approval: { state: "SIGNED" },
      permissions: {
        ...context.permissions,
        canSign: false,
        canRequestSigningRevision: false,
        canDownloadOfficial: true,
      },
    };
  } catch (error) {
    await connection.rollback();
    await fs.promises.unlink(officialPath).catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
};

export const requestContractSigningRevision = async (
  user,
  contractId,
  payload = {},
) => {
  const contractPk = Number(contractId);
  const context = await getContractAccessContext(user, contractPk);
  if (context.notFound) return { notFound: true };
  if (!context.permissions.canView || !context.access.isSigner) {
    return { forbidden: true, reason: "Bạn không có quyền yêu cầu chỉnh sửa hợp đồng" };
  }
  if (context.approval?.state !== "APPROVED") {
    return { invalidState: true, state: context.approval?.state || "DRAFT" };
  }
  if (context.latestSignature) return { alreadySigned: true };
  if (!context.approvedSubmission) return { invalidState: true, state: "DRAFT" };

  const rejectionReason = normalizeText(payload.rejectionReason ?? payload.rejection_reason).slice(0, 1000);
  const revisionRequest = normalizeText(payload.revisionRequest ?? payload.revision_request).slice(0, 1000);
  if (!rejectionReason || !revisionRequest) {
    return {
      validationErrors: [
        "Vui lòng nhập lý do yêu cầu chỉnh sửa",
        "Vui lòng nhập nội dung cần chỉnh sửa",
      ],
    };
  }

  const signerId =
    Number(user?.employee_id || user?.user_id || context.contract.employee_id) || null;
  if (!signerId) return { missingSigner: true };

  const signerName =
    normalizeText(user?.full_name || user?.username) || "Người được phân quyền";
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    const [contractRows] = await connection.query(
      "SELECT approval_status FROM contracts WHERE id = ? FOR UPDATE",
      [contractPk],
    );
    if (contractRows[0]?.approval_status !== "APPROVED") {
      await connection.rollback();
      return { invalidState: true, state: contractRows[0]?.approval_status || "DRAFT" };
    }
    const [signatureRows] = await connection.query(
      "SELECT id FROM contract_signatures WHERE contract_id = ? LIMIT 1 FOR UPDATE",
      [contractPk],
    );
    if (signatureRows.length) {
      await connection.rollback();
      return { alreadySigned: true };
    }

    await connection.query(
      `UPDATE contract_submission_history
       SET status = 'REJECTED', rejected_by = ?, rejected_at = NOW(),
           approved_at = NULL, rejection_reason = ?, revision_request = ?
       WHERE id = ?`,
      [
        signerId,
        rejectionReason,
        revisionRequest,
        Number(context.approvedSubmission.id),
      ],
    );
    await connection.query(
      `UPDATE contracts
       SET approval_status = 'REJECTED', rejected_by = ?, rejected_at = NOW(),
           rejection_reason = ?, revision_request = ?
       WHERE id = ?`,
      [signerId, rejectionReason, revisionRequest, contractPk],
    );
    await connection.query(
      `UPDATE employment_contracts
       SET status = 'REJECTED', rejection_reason = ?, revision_request = ?
       WHERE contract_code = ?`,
      [rejectionReason, revisionRequest, context.contract.contract_code],
    );
    await connection.query(
      `INSERT INTO contract_approval_logs
        (contract_id, contract_source, actor_id, action, note)
       VALUES (?, 'CONTRACT', ?, 'SIGN_REVISION_REQUEST', ?)`,
      [
        contractPk,
        signerId,
        `Lý do: ${rejectionReason}. Yêu cầu chỉnh sửa: ${revisionRequest}`.slice(0, 1000),
      ],
    );

    await createContractSigningRevisionNotifications(connection, {
      contractId: contractPk,
      contractCode: context.contract.contract_code,
      contractType: context.contract.contract_type,
      employeeId: Number(context.contract.employee_id),
      employeeName: context.contract.full_name,
      signerId,
      signerName,
      rejectionReason,
      revisionRequest,
      submissionId: Number(context.approvedSubmission.id),
      versionNo: Number(context.approvedSubmission.version_no || 0),
    });

    await connection.commit();

    return {
      success: true,
      approval: {
        state: "REJECTED",
        reason: rejectionReason,
        revisionRequest,
      },
      permissions: {
        ...context.permissions,
        canSign: false,
        canRequestSigningRevision: false,
        canEdit: context.access.isHr,
      },
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const saveContractFile = async (user, contractId, uploadedFile) => {
  const extension = normalizeExtension(uploadedFile?.originalname);
  if (!CONTRACT_FILE_EXTENSIONS.includes(extension)) {
    return { invalidFile: true };
  }

  const context = await getContractAccessContext(user, contractId);
  if (context.notFound) {
    await fs.promises.unlink(uploadedFile.path).catch(() => {});
    return { notFound: true };
  }
  if (!context.permissions.canEdit) {
    await fs.promises.unlink(uploadedFile.path).catch(() => {});
    return { forbidden: true };
  }

  const contract = context.contract;
  const relativePath = path
    .relative(process.cwd(), uploadedFile.path)
    .split(path.sep)
    .join("/");
  const actorId =
    Number(user?.employee_id || user?.user_id || contract.employee_id) || null;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    await connection.query("SELECT id FROM contracts WHERE id = ? FOR UPDATE", [
      contractId,
    ]);

    const [existingRows] = await connection.query(
      `SELECT id, version_no FROM contract_files
       WHERE contract_id = ? ORDER BY version_no DESC, id DESC LIMIT 1`,
      [contractId],
    );
    const existing = existingRows[0] || null;
    const nextVersion = Number(existing?.version_no || 0) + 1;
    const [insertResult] = await connection.query(
      `INSERT INTO contract_files
        (contract_id, version_no, file_name, stored_name, file_path, file_ext,
         mime_type, file_size, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        contractId,
        nextVersion,
        uploadedFile.originalname,
        path.basename(uploadedFile.path),
        relativePath,
        extension,
        uploadedFile.mimetype || `application/${extension}`,
        uploadedFile.size,
        actorId,
      ],
    );
    const fileId = Number(insertResult.insertId);

    await connection.query(
      `INSERT INTO contract_approval_logs
        (contract_id, contract_source, actor_id, action, note)
       VALUES (?, 'CONTRACT', ?, ?, ?)`,
      [
        contractId,
        actorId,
        existing ? "FILE_REPLACE" : "FILE_UPLOAD",
        existing
          ? `Cập nhật file hợp đồng v${nextVersion}: ${uploadedFile.originalname}`
          : `Upload file hợp đồng v${nextVersion}: ${uploadedFile.originalname}`,
      ],
    );

    if (context.approval?.state === "REJECTED") {
      await connection.query(
        "UPDATE contracts SET approval_status = 'DRAFT' WHERE id = ?",
        [contractId],
      );
      await connection.query(
        "UPDATE employment_contracts SET status = 'DRAFT' WHERE contract_code = ?",
        [contract.contract_code],
      );
    }

    await connection.commit();

    return {
      file: mapContractFile(await getContractFileRow(contractId)),
      file_id: fileId,
      version_no: nextVersion,
      versions: await getContractFileVersions(contractId),
    };
  } catch (error) {
    await connection.rollback();
    await fs.promises.unlink(uploadedFile.path).catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
};

export const submitContractApproval = async (user, contractId, note = "") => {
  const context = await getContractAccessContext(user, contractId);
  if (context.notFound) return { notFound: true };
  if (context.approval?.state === "PENDING_APPROVAL") {
    return { alreadyPending: true };
  }
  if (
    context.approval?.state === "REJECTED" &&
    String(context.permissions.submitBlockReason || "").includes("Cần cập nhật file")
  ) {
    return {
      staleVersion: true,
      reason: "Cần cập nhật file hợp đồng theo yêu cầu trước khi gửi duyệt lại",
    };
  }
  if (!context.permissions.canSubmit) {
    return {
      forbidden: true,
      reason: context.permissions.submitBlockReason || "Không thể gửi duyệt hợp đồng",
    };
  }

  const contractPk = Number(contractId);
  const actorId =
    Number(user?.employee_id || user?.user_id || context.contract?.employee_id) || null;
  if (!actorId) return { missingCreator: true };

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [rejectedRows] = await connection.query(
      `SELECT s.id, s.version_id, s.rejection_reason, s.revision_request,
              cf.version_no AS rejected_version_no
       FROM contract_submission_history s
       LEFT JOIN contract_files cf ON cf.id = s.version_id
       WHERE s.contract_id = ? AND s.status = 'REJECTED'
       ORDER BY s.id DESC LIMIT 1 FOR UPDATE`,
      [contractPk],
    );
    const rejectedSubmission = rejectedRows[0] || null;
    const [currentFileRows] = await connection.query(
      `SELECT id, version_no FROM contract_files
       WHERE contract_id = ? ORDER BY version_no DESC, id DESC LIMIT 1 FOR UPDATE`,
      [contractPk],
    );
    const currentFileVersion = Number(currentFileRows[0]?.version_no || 0);
    if (
      rejectedSubmission &&
      (!currentFileVersion ||
        currentFileVersion <= Number(rejectedSubmission.rejected_version_no || 0))
    ) {
      await connection.rollback();
      return {
        staleVersion: true,
        reason: "Cần cập nhật file hợp đồng theo yêu cầu trước khi gửi duyệt lại",
      };
    }

    await connection.query(
      `UPDATE contract_submission_history
       SET status = 'SUPERSEDED'
       WHERE contract_id = ? AND status = 'PENDING_APPROVAL'`,
      [contractPk],
    );

    const [roundRows] = await connection.query(
      `SELECT COALESCE(MAX(approval_round), 0) AS approval_round
       FROM contract_submission_history WHERE contract_id = ? FOR UPDATE`,
      [contractPk],
    );
    const approvalRound = Number(roundRows[0]?.approval_round || 0) + 1;

    const contract = await findScopedContract(user, contractPk, connection);
    if (!contract) {
      await connection.rollback();
      return { notFound: true };
    }

    const fileRow = await getContractFileRow(contractPk, connection);
    const validationErrors = await validateSubmissionData(contract, fileRow, contractPk);
    if (validationErrors.length) {
      await connection.rollback();
      return { validationErrors };
    }

    const cleanedNote = normalizeText(note).slice(0, 1000) || null;
    const [submissionResult] = await connection.query(
      `INSERT INTO contract_submission_history
        (contract_id, employee_id, submitted_by, submitted_at, status, version_id,
         approval_round, note, previous_rejection_reason)
       VALUES (?, ?, ?, NOW(), 'PENDING_APPROVAL', ?, ?, ?, ?)`,
      [
        contractPk,
        Number(contract.employee_id),
        actorId,
        Number(fileRow.id),
        approvalRound,
        cleanedNote,
        rejectedSubmission?.rejection_reason || null,
      ],
    );
    const submissionId = Number(submissionResult.insertId);

    await connection.query(
      "UPDATE contracts SET approval_status = 'PENDING_APPROVAL' WHERE id = ?",
      [contractPk],
    );
    await connection.query(
      "UPDATE employment_contracts SET status = 'PENDING_APPROVAL' WHERE contract_code = ?",
      [contract.contract_code],
    );

    await connection.query(
      `INSERT INTO contract_approval_logs
        (contract_id, contract_source, actor_id, action, note)
       VALUES (?, 'CONTRACT', ?, 'SUBMIT_APPROVAL', ?)`,
      [contractPk, actorId, cleanedNote],
    );

    const [submissionRows] = await connection.query(
      `SELECT DATE_FORMAT(submitted_at, '%Y-%m-%d %H:%i:%s') AS submitted_at
       FROM contract_submission_history WHERE id = ?`,
      [submissionId],
    );
    const submittedAt =
      submissionRows[0]?.submitted_at ||
      new Date().toISOString().slice(0, 19).replace("T", " ");

    const [submitterRows] = await connection.query(
      `SELECT COALESCE(e.full_name, u.username) AS full_name
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id
       WHERE u.employee_id = ? OR u.id = ?
       ORDER BY u.id ASC LIMIT 1`,
      [actorId, actorId],
    );
    const submittedByName =
      submitterRows[0]?.full_name || user.full_name || user.username || "";

    await createContractSubmissionNotifications(connection, {
      submissionId,
      contractId: contractPk,
      contractCode: contract.contract_code,
      contractType: contract.contract_type,
      employeeId: Number(contract.employee_id),
      employeeName: contract.full_name,
      baseSalary: contract.signed_salary,
      submittedBy: actorId,
      submittedByName,
      submittedAt,
      approvalRound,
      versionId: Number(fileRow.id),
      previousRejectionReason: rejectedSubmission?.rejection_reason || "",
      note: cleanedNote || "",
    });

    await connection.commit();

    return {
      success: true,
      submissionId,
      approvalRound,
      submittedAt,
      approval: { state: "PENDING_APPROVAL", reason: "", revisionRequest: "" },
      permissions: {
        ...context.permissions,
        canEdit: false,
        canSubmit: false,
        submitBlockReason: "Hợp đồng đang chờ Giám đốc duyệt",
      },
    };
  } catch (error) {
    await connection.rollback();
    if (error?.code === "ER_DUP_ENTRY") {
      return { alreadyPending: true };
    }
    throw error;
  } finally {
    connection.release();
  }
};

export const reviewContractApproval = async (
  user,
  contractId,
  decision,
  payload = {},
) => {
  const normalizedDecision = normalizeText(decision).toUpperCase();

  if (!["APPROVE", "REJECT"].includes(normalizedDecision)) {
    return { invalidDecision: true };
  }

  const context = await getContractAccessContext(user, contractId);
  if (context.notFound) return { notFound: true };
  if (!context.access.isDirector) return { forbidden: true };
  if (context.approval?.state !== "PENDING_APPROVAL") {
    return {
      invalidState: true,
      state: context.approval?.state || "DRAFT",
    };
  }

  const rejectionReason =
    normalizedDecision === "REJECT"
      ? normalizeText(payload.rejectionReason ?? payload.rejection_reason).slice(0, 1000)
      : "";
  const revisionRequest =
    normalizedDecision === "REJECT"
      ? normalizeText(payload.revisionRequest ?? payload.revision_request).slice(0, 1000)
      : "";

  if (normalizedDecision === "REJECT" && (!rejectionReason || !revisionRequest)) {
    return {
      validationErrors: [
        "Vui lòng nhập lý do từ chối hợp đồng",
        "Vui lòng nhập yêu cầu chỉnh sửa cho nhân viên",
      ],
    };
  }

  const reviewerId = Number(user?.employee_id || user?.user_id) || null;
  if (!reviewerId) return { missingReviewer: true };

  const contractPk = Number(contractId);
  const isApprove = normalizedDecision === "APPROVE";
  const approvalStatus = isApprove ? "APPROVED" : "REJECTED";
  const legacyStatus = isApprove ? "APPROVED_WAITING_SIGN" : "REJECTED";
  const reviewerName =
    normalizeText(user?.full_name || user?.username) || "Giám đốc";
  const decidedAt = new Date().toISOString().slice(0, 19).replace("T", " ");

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [submissionRows] = await connection.query(
      `SELECT id, approval_round, note, submitted_by, version_id
       FROM contract_submission_history
       WHERE contract_id = ? AND status = 'PENDING_APPROVAL'
       ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [contractPk],
    );
    const submission = submissionRows[0] || null;
    if (!submission) {
      await connection.rollback();
      return { invalidState: true, state: "DRAFT" };
    }

    if (isApprove) {
      await connection.query(
        `UPDATE contract_submission_history
         SET status = ?, approver_id = ?, approved_at = NOW(),
             rejected_by = NULL, rejected_at = NULL,
             rejection_reason = NULL, revision_request = NULL
         WHERE id = ?`,
        [approvalStatus, reviewerId, submission.id],
      );
      await connection.query(
        `UPDATE contracts
         SET approval_status = ?, approver_id = ?, approved_at = NOW(),
             rejected_by = NULL, rejected_at = NULL,
             rejection_reason = NULL, revision_request = NULL
         WHERE id = ?`,
        [approvalStatus, reviewerId, contractPk],
      );
    } else {
      await connection.query(
        `UPDATE contract_submission_history
         SET status = ?, approver_id = ?, rejected_by = ?, rejected_at = NOW(),
             approved_at = NULL, rejection_reason = ?, revision_request = ?
         WHERE id = ?`,
        [
          approvalStatus,
          reviewerId,
          reviewerId,
          rejectionReason,
          revisionRequest,
          submission.id,
        ],
      );
      await connection.query(
        `UPDATE contracts
         SET approval_status = ?, approver_id = ?, rejected_by = ?, rejected_at = NOW(),
             approved_at = NULL, rejection_reason = ?, revision_request = ?
         WHERE id = ?`,
        [
          approvalStatus,
          reviewerId,
          reviewerId,
          rejectionReason,
          revisionRequest,
          contractPk,
        ],
      );
    }

    await connection.query(
      `UPDATE employment_contracts
       SET status = ?, approver_id = ?, approved_at = ?,
           rejection_reason = ?, revision_request = ?
       WHERE contract_code = ?`,
      [
        legacyStatus,
        reviewerId,
        isApprove ? decidedAt : null,
        isApprove ? null : rejectionReason,
        isApprove ? null : revisionRequest,
        context.contract.contract_code,
      ],
    );

    const decisionNote = isApprove
      ? normalizeText(payload.note).slice(0, 1000) ||
        "Giám đốc đã phê duyệt hợp đồng"
      : `Lý do từ chối: ${rejectionReason}. Yêu cầu chỉnh sửa: ${revisionRequest}`.slice(
          0,
          1000,
        );

    await connection.query(
      `INSERT INTO contract_approval_logs
        (contract_id, contract_source, actor_id, action, note)
       VALUES (?, 'CONTRACT', ?, ?, ?)`,
      [
        contractPk,
        reviewerId,
        isApprove ? "DIRECTOR_APPROVE" : "DIRECTOR_REJECT",
        decisionNote,
      ],
    );

    await createContractDecisionNotifications(connection, {
      submissionId: Number(submission.id),
      contractId: contractPk,
      contractCode: context.contract.contract_code,
      contractType: context.contract.contract_type,
      employeeId: Number(context.contract.employee_id),
      employeeName: context.contract.full_name,
      decision: normalizedDecision,
      submittedBy: Number(submission.submitted_by),
      approverName: reviewerName,
      decidedAt,
      approvalRound: Number(submission.approval_round),
      versionId: Number(submission.version_id || 0) || null,
      rejectionReason,
      revisionRequest,
      note: decisionNote,
    });

    await connection.commit();

    return {
      success: true,
      decision: normalizedDecision,
      submissionId: Number(submission.id),
      approvalRound: Number(submission.approval_round),
      decidedAt,
      approval: {
        state: approvalStatus,
        reason: rejectionReason,
        revisionRequest,
      },
      permissions: {
        ...context.permissions,
        canApprove: false,
        canEdit: !isApprove && context.access.isHr,
        canSubmit: false,
      },
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const getContractEditorConfig = async (
  user,
  contractId,
  requestedMode = "view",
  versionId = null,
) => {
  const context = await getContractAccessContext(user, contractId);
  if (context.notFound) return { notFound: true };
  if (!context.permissions.canView) return { forbidden: true };

  const requestedFileId = parsePositiveInt(versionId);
  const fileRow = requestedFileId
    ? await getContractFileVersionRow(contractId, requestedFileId)
    : await getContractFileRow(contractId);
  if (!fileRow) return { missingFile: true };
  if (normalizeExtension(fileRow.file_name) !== "docx") {
    return { unsupported: true };
  }
  if (!DOC_JWT_SECRET) return { disabled: true };

  const latestFileRow = await getContractFileRow(contractId);
  const isLatestFile =
    !requestedFileId || Number(latestFileRow?.id) === Number(fileRow.id);
  const canEdit =
    requestedMode === "edit" && context.permissions.canEdit && isLatestFile;
  const mode = canEdit ? "edit" : "view";
  const actorId =
    Number(user?.employee_id || user?.user_id || context.contract.employee_id) ||
    context.contract.employee_id;
  const tokenPayload = {
    user_id: user?.user_id || null,
    employee_id: actorId,
    role_id: user?.role_id || "",
    data_scope: "ALL",
    permissions: user?.permissions || [],
  };

  const fileToken = buildDocToken({
    purpose: "contract_file",
    contractId,
    file_id: fileRow.id,
    ...tokenPayload,
  });
  const editToken = canEdit
    ? buildDocToken({
        purpose: "onlyoffice_edit",
        contractId,
        file_id: fileRow.id,
        ...tokenPayload,
      })
    : null;
  const documentKey = crypto
    .createHash("sha1")
    .update(`${contractId}:${fileRow.id}:${fileRow.stored_name}`)
    .digest("hex");

  const config = {
    document: {
      fileType: "docx",
      key: documentKey,
      title: fileRow.file_name,
      url: `${CONTRACT_PUBLIC_API_URL}/contracts/files/${fileToken}`,
      permissions: {
        download: true,
        print: true,
        copy: true,
        edit: canEdit,
        modifyContent: canEdit,
        fillForms: canEdit,
        comment: canEdit,
      },
    },
    documentType: "text",
    editorConfig: {
      mode,
      lang: "vi",
      user: {
        id: String(user?.user_id || actorId),
        name: normalizeText(user?.full_name || user?.username) || "Người dùng",
      },
      customization: {
        autosave: canEdit,
        forcesave: canEdit,
      },
      ...(canEdit
        ? {
            callbackUrl: `${CONTRACT_PUBLIC_API_URL}/contracts/onlyoffice/callback?token=${editToken}`,
          }
        : {}),
    },
  };
  const signedConfig = {
    ...config,
    token: jwt.sign(config, DOC_JWT_SECRET, { noTimestamp: true }),
  };

  return {
    enabled: true,
    canEdit,
    mode,
    version_id: Number(fileRow.id),
    version_no: Number(fileRow.version_no || 0),
    is_latest: isLatestFile,
    editorScriptUrl: `${ONLYOFFICE_PUBLIC_URL}/web-apps/apps/api/documents/api.js`,
    config: signedConfig,
  };
};

export const getContractFileForToken = async (token) => {
  const payload = verifyDocToken(token);
  if (
    ![
      "contract_file",
      "contract_official_file",
      "contract_template_file",
    ].includes(payload?.purpose)
  ) {
    return { invalidToken: true };
  }

  const user = {
    user_id: payload.user_id,
    employee_id: payload.employee_id,
    role_id: payload.role_id,
    data_scope: "ALL",
    permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
  };
  const requestedFileId = parsePositiveInt(payload.file_id);

  if (payload.purpose === "contract_template_file") {
    const templateId = parsePositiveInt(payload.templateId);
    if (!templateId) return { invalidToken: true };

    const template = await getContractTemplateFile(templateId);
    if (template.notFound || template.missingFile) return template;

    const templateName = normalizeText(template.name);
    return {
      purpose: "template",
      filePath: template.filePath,
      fileName: /\.docx$/i.test(templateName)
        ? templateName
        : `${templateName || "Mau_hop_dong"}.docx`,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
  }

  if (payload.purpose === "contract_official_file") {
    const contractId = parsePositiveInt(payload.contractId);
    if (!contractId || !requestedFileId) return { invalidToken: true };

    const file = await getMyOfficialContractFile(
      user,
      contractId,
      requestedFileId,
    );
    if (file.notFound || file.missingFile || file.missingEmployee) return file;
    return { ...file, contractId };
  }
  const file = requestedFileId
    ? await getContractFileVersion(
        user,
        Number(payload.contractId),
        requestedFileId,
      )
    : await getContractFile(user, Number(payload.contractId));

  if (file.notFound || file.forbidden || file.missingFile) return file;
  return { ...file, contractId: Number(payload.contractId) };
};

export const saveOnlyOfficeCallbackFile = async (payload, body = {}) => {
  if (Number(body.status) !== 2 || !body.url) return { ignored: true };

  const user = {
    user_id: payload.user_id,
    employee_id: payload.employee_id,
    role_id: payload.role_id,
    data_scope: "ALL",
    permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
    full_name: payload.user_name || "",
  };
  const contractId = Number(payload.contractId);
  const context = await getContractAccessContext(user, contractId);
  if (context.notFound) return { notFound: true };
  if (!context.permissions.canEdit) return { forbidden: true };

  let sourceUrl;
  try {
    sourceUrl = new URL(String(body.url));
  } catch {
    return { invalidUrl: true };
  }

  if (!isAllowedOnlyOfficeUrl(sourceUrl)) return { invalidUrl: true };

  const response = await fetch(sourceUrl, {
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) return { downloadFailed: true };

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > 15 * 1024 * 1024) {
    return { invalidFile: true };
  }

  const currentFile = mapContractFile(await getContractFileRow(contractId));
  const year = String(new Date().getFullYear());
  const directory = path.resolve(process.cwd(), "uploads", "contracts", year);
  await fs.promises.mkdir(directory, { recursive: true });
  const savedPath = path.join(directory, `${crypto.randomUUID()}.docx`);
  await fs.promises.writeFile(savedPath, buffer);

  const uploadedFile = {
    originalname: currentFile?.file_name || "HopDong_docx.docx",
    filename: path.basename(savedPath),
    path: savedPath,
    mimetype:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: buffer.length,
  };

  try {
    return await saveContractFile(user, contractId, uploadedFile);
  } catch (error) {
    await fs.promises.unlink(savedPath).catch(() => {});
    throw error;
  }
};

export const saveOnlyOfficeTemplateCallbackFile = async (payload, body = {}) => {
  if (Number(body.status) !== 2 || !body.url) return { ignored: true };
  if (!hasPermission(payload?.permissions, "HR.CONTRACT_MANAGE")) {
    return { forbidden: true };
  }

  const templateId = parsePositiveInt(payload?.templateId);
  if (!templateId) return { invalidToken: true };

  const template = await getTemplateById(templateId);
  if (!template) return { notFound: true };

  let sourceUrl;
  try {
    sourceUrl = new URL(String(body.url));
  } catch {
    return { invalidUrl: true };
  }

  if (!isAllowedOnlyOfficeUrl(sourceUrl)) return { invalidUrl: true };

  const response = await fetch(sourceUrl, {
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) return { downloadFailed: true };

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) {
    return { invalidFile: true };
  }

  const directory = path.resolve(process.cwd(), "uploads", "templates");
  await fs.promises.mkdir(directory, { recursive: true });
  const savedPath = path.join(directory, `${crypto.randomUUID()}.docx`);
  const templateFilePath = path.posix.join(
    "uploads",
    "templates",
    path.basename(savedPath),
  );

  try {
    await fs.promises.writeFile(savedPath, buffer);
    await db.query(
      `UPDATE contract_templates
       SET template_file_path = ?, updated_at = NOW()
       WHERE id = ? AND is_active = 1`,
      [templateFilePath, templateId],
    );

    if (template.template_file_path) {
      try {
        const previousPath = resolveTemplatePath(template.template_file_path);
        if (previousPath !== savedPath) {
          await fs.promises.unlink(previousPath).catch(() => {});
        }
      } catch {}
    }
  } catch (error) {
    await fs.promises.unlink(savedPath).catch(() => {});
    throw error;
  }

  return {
    success: true,
    template: await getTemplateSummaryById(templateId),
  };
};

export const getContractSummary = async (user, filters = {}) => {
  const { conditions, params } = buildBaseConditions(user, filters);

  const [rows] = await db.query(
    `SELECT
      COUNT(*) AS total_count,
      SUM(CASE WHEN c.status = 'ACTIVE' THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN c.status = 'EXPIRING_SOON' THEN 1 ELSE 0 END) AS expiring_count,
      SUM(CASE WHEN c.status = 'EXPIRED' THEN 1 ELSE 0 END) AS expired_count,
      SUM(CASE WHEN c.status = 'TERMINATED' THEN 1 ELSE 0 END) AS terminated_count,
      SUM(CASE WHEN c.approval_status = 'PENDING_APPROVAL' THEN 1 ELSE 0 END) AS pending_count,
      SUM(CASE WHEN c.approval_status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected_count,
      SUM(CASE
        WHEN c.approval_status = 'APPROVED'
          AND NOT EXISTS (SELECT 1 FROM contract_signatures cs WHERE cs.contract_id = c.id)
        THEN 1 ELSE 0 END) AS pending_sign_count,
      SUM(CASE WHEN c.approval_status = 'SIGNED' THEN 1 ELSE 0 END) AS signed_count
    FROM contracts c
    INNER JOIN employees e ON e.id = c.employee_id
    WHERE ${conditions.join(" AND ")}`,
    params,
  );

  const summary = rows[0] || {};

  return {
    total: Number(summary.total_count || 0),
    active: Number(summary.active_count || 0),
    expiring: Number(summary.expiring_count || 0),
    expired: Number(summary.expired_count || 0),
    terminated: Number(summary.terminated_count || 0),
    pending: Number(summary.pending_count || 0),
    rejected: Number(summary.rejected_count || 0),
    pending_sign: Number(summary.pending_sign_count || 0),
    signed: Number(summary.signed_count || 0),
  };
};

export const getContractFilterOptions = async (user, canManage) => {
  const [departments] = await db.query(
    `SELECT id, department_code, name
     FROM departments
     ORDER BY name ASC`,
  );

  const [types] = await db.query(
    `SELECT DISTINCT contract_type
     FROM contracts
     ORDER BY contract_type ASC`,
  );

  let employees = [];
  let renewableContracts = [];

  if (canManage) {
    const scope = buildScopeClause(user);

    const [employeeRows] = await db.query(
      `SELECT
         e.id,
         e.employee_code,
         e.full_name,
         e.gender,
         DATE_FORMAT(e.dob, '%Y-%m-%d') AS dob,
         e.address,
         e.phone,
         e.email,
         e.work_status,
         e.department_id,
         COALESCE(d.department_code, d.dept_code) AS department_code,
         COALESCE(d.department_name, d.name) AS department_name,
         e.position_id,
         COALESCE(p.position_code, p.pos_code) AS position_code,
         COALESCE(p.position_name, p.name, p.title) AS position_title
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN positions p ON p.id = e.position_id
       WHERE ${scope.clause}
       ORDER BY e.employee_code ASC`,
      scope.params,
    );

    employees = employeeRows;

    const [contractRows] = await db.query(
      `SELECT
        c.id,
        c.contract_code,
        c.employee_id,
        e.employee_code,
        e.full_name,
        c.contract_type,
        DATE_FORMAT(c.start_date, '%Y-%m-%d') AS start_date,
        DATE_FORMAT(c.end_date, '%Y-%m-%d') AS end_date,
        c.signed_salary,
        c.insurance_salary,
        c.status
      FROM contracts c
      INNER JOIN employees e ON e.id = c.employee_id
      WHERE ${scope.clause} AND c.status IN ('ACTIVE', 'EXPIRING_SOON', 'EXPIRED')
      ORDER BY c.end_date IS NULL ASC, c.end_date ASC, e.employee_code ASC`,
      scope.params,
    );

    renewableContracts = contractRows;
  }

  return {
    departments,
    contract_types: types.map((row) => row.contract_type),
    employees,
    renewable_contracts: renewableContracts,
  };
};

export const getSuggestedContractCode = async () => {
  const [rows] = await db.query(
    "SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM contracts",
  );

  const nextId = Number(rows[0]?.next_id || 1);
  const year = new Date().getFullYear();

  return `HDLD-${year}/${String(nextId).padStart(3, "0")}`;
};

export const createContract = async (user, payload) => {
  const scope = buildScopeClause(user);

  const [employeeRows] = await db.query(
    `SELECT e.id, e.employee_code, e.full_name
     FROM employees e
     WHERE ${scope.clause} AND e.id = ?
     LIMIT 1`,
    [...scope.params, payload.employee_id],
  );

  if (!employeeRows.length) return { notFound: true };

  const [duplicateRows] = await db.query(
    "SELECT id FROM contracts WHERE contract_code = ? LIMIT 1",
    [payload.contract_code],
  );

  if (duplicateRows.length) return { duplicateCode: true };

  if (payload.replaces_contract_id) {
    const [baseRows] = await db.query(
      "SELECT id FROM contracts WHERE id = ? AND employee_id = ? LIMIT 1",
      [payload.replaces_contract_id, payload.employee_id],
    );

    if (!baseRows.length) return { invalidReplacement: true };
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [insertResult] = await connection.query(
      `INSERT INTO contracts
        (contract_code, employee_id, contract_type, start_date, end_date,
         signed_salary, insurance_salary, status, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.contract_code,
        payload.employee_id,
        payload.contract_type,
        payload.start_date,
        payload.end_date,
        payload.signed_salary,
        payload.insurance_salary,
        payload.status,
        payload.note,
      ],
    );

    if (payload.replaces_contract_id) {
      await connection.query(
        `UPDATE contracts
         SET status = 'TERMINATED'
         WHERE id = ? AND employee_id = ? AND status <> 'TERMINATED'`,
        [payload.replaces_contract_id, payload.employee_id],
      );
    }

    if (payload.status === "ACTIVE") {
      await connection.query(
        `UPDATE employees
         SET base_salary = ?, insurance_salary = ?
         WHERE id = ?`,
        [
          payload.signed_salary,
          payload.insurance_salary,
          payload.employee_id,
        ],
      );
    }

    await connection.commit();

    return {
      success: true,
      contract_id: insertResult.insertId,
      employee: employeeRows[0],
    };
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") return { duplicateCode: true };

    throw error;
  } finally {
    connection.release();
  }
};

export const terminateContract = async (user, contractId) => {
  const scope = buildScopeClause(user);

  const [rows] = await db.query(
    `SELECT c.id, c.status
     FROM contracts c
     INNER JOIN employees e ON e.id = c.employee_id
     WHERE ${scope.clause} AND c.id = ?
     LIMIT 1`,
    [...scope.params, contractId],
  );

  if (!rows.length) return { notFound: true };

  if (rows[0].status !== "TERMINATED") {
    await db.query("UPDATE contracts SET status = 'TERMINATED' WHERE id = ?", [
      contractId,
    ]);
  }

  return { success: true, contract_id: contractId };
};
