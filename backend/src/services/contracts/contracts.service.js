import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { db } from "../../config/database.js";
import { createContractSubmissionNotifications } from "../notifications/notifications.service.js";
import { buildEmployeeScope, hasPermission } from "../../utils/helper.js";

const STATUS_FILTERS = [
  "ALL",
  "ACTIVE",
  "EXPIRING_SOON",
  "EXPIRED",
  "TERMINATED",
];

const CONTRACT_STATUSES = STATUS_FILTERS.filter((status) => status !== "ALL");

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
    const like = `%${filters.keyword}%`;
    conditions.push(
      "(c.contract_code LIKE ? OR e.employee_code LIKE ? OR e.full_name LIKE ?)",
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

  if (filters.status && filters.status !== "ALL") {
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
      c.note
    FROM contracts c
    INNER JOIN employees e ON e.id = c.employee_id
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN positions p ON p.id = e.position_id
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

const normalizeBaseUrl = (value) =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "");

const ONLYOFFICE_BASE_URL = normalizeBaseUrl(
  process.env.ONLYOFFICE_URL || "http://localhost:8081",
);
const CONTRACT_API_BASE_URL = normalizeBaseUrl(
  process.env.CONTRACT_API_BASE_URL ||
    process.env.API_BASE_URL ||
    "http://localhost:8080",
);
const DOC_JWT_SECRET =
  process.env.ONLYOFFICE_JWT_SECRET || process.env.JWT_SECRET || "";
const CONTRACT_SIGNER_ROLES = String(
  process.env.CONTRACT_SIGNER_ROLES || "CB_PAYROLL,OFFICE_ADMIN,SUPER_ADMIN",
)
  .split(",")
  .map((role) => role.trim().toUpperCase())
  .filter(Boolean);

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

const buildContractAccess = (user) => {
  const role = String(user?.role_id || "").toUpperCase();
  const isHr =
    hasPermission(user?.permissions, "HR.CONTRACT_MANAGE") &&
    hasPermission(user?.permissions, "HR.PROFILE_MANAGE");
  const isDirector = role === "DIRECTOR";
  const isSigner = CONTRACT_SIGNER_ROLES.includes(role) && !isHr;
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

const deriveApprovalState = (history = [], legacyStatus = "") => {
  const latest = history[0] || null;

  if (latest?.action === "DIRECTOR_REJECT") {
    return { state: "REJECTED", reason: latest.note || "" };
  }
  if (["DIRECTOR_APPROVE", "SIGN_OFFICIAL"].includes(latest?.action)) {
    return { state: "APPROVED", reason: "" };
  }
  if (latest?.action === "SUBMIT_APPROVAL") {
    return { state: "PENDING_APPROVAL", reason: "" };
  }
  if (["ACTIVE", "EXPIRING_SOON", "EXPIRED", "TERMINATED"].includes(legacyStatus)) {
    return { state: "DRAFT", reason: "" };
  }

  return { state: "DRAFT", reason: "" };
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

  if (approval.state === "REJECTED") {
    const rejectIndex = history.findIndex(
      (entry) => entry.action === "DIRECTOR_REJECT",
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

const getContractFileRow = async (contractId, executor = db) => {
  const [rows] = await executor.query(
    `SELECT
      cf.id,
      cf.contract_id,
      cf.file_name,
      cf.stored_name,
      cf.file_path,
      cf.file_ext,
      cf.mime_type,
      cf.file_size,
      cf.uploaded_by,
      COALESCE(e.full_name, u.username, CONCAT('ID ', cf.uploaded_by)) AS uploaded_by_name,
      DATE_FORMAT(cf.created_at, '%Y-%m-%d %H:%i:%s') AS uploaded_at
    FROM contract_files cf
    LEFT JOIN employees e ON e.id = cf.uploaded_by
    LEFT JOIN users u ON u.employee_id = cf.uploaded_by OR u.id = cf.uploaded_by
    WHERE cf.contract_id = ?
    ORDER BY cf.id DESC
    LIMIT 1`,
    [contractId],
  );

  return rows[0] || null;
};

const mapContractFile = (row) => {
  if (!row) return null;

  return {
    id: row.id,
    contract_id: row.contract_id,
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

export const getContractAccessContext = async (user, contractId) => {
  const contract = await findScopedContract(user, contractId);
  if (!contract) return { notFound: true };

  const history = await getContractHistory(contractId);
  const approval = deriveApprovalState(history, contract.status);
  const access = buildContractAccess(user);
  const canView =
    access.canViewManaged ||
    (access.isEmployee && approval.state === "APPROVED");
  const canEdit = access.isHr && canEditByApproval(approval);
  const submitReadiness = getSubmitReadiness(approval, history);
  const canSubmit = canEdit && submitReadiness.allowed;

  return {
    contract,
    history,
    approval,
    access,
    permissions: {
      canView,
      canEdit,
      canSubmit,
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

  return {
    contract: context.contract,
    file: mapContractFile(fileRow),
    history: context.history,
    approval: context.approval,
    permissions: context.permissions,
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

    const [existingRows] = await connection.query(
      `SELECT id, file_path FROM contract_files
       WHERE contract_id = ? ORDER BY id DESC LIMIT 1`,
      [contractId],
    );
    const existing = existingRows[0] || null;
    const fileData = [
      contractId,
      uploadedFile.originalname,
      path.basename(uploadedFile.path),
      relativePath,
      extension,
      uploadedFile.mimetype || `application/${extension}`,
      uploadedFile.size,
      actorId,
    ];

    let fileId;
    if (existing) {
      await connection.query(
        `UPDATE contract_files
         SET file_name = ?, stored_name = ?, file_path = ?, file_ext = ?,
             mime_type = ?, file_size = ?, uploaded_by = ?, created_at = NOW()
         WHERE id = ?`,
        [...fileData.slice(1), existing.id],
      );
      fileId = existing.id;
    } else {
      const [insertResult] = await connection.query(
        `INSERT INTO contract_files
          (contract_id, file_name, stored_name, file_path, file_ext,
           mime_type, file_size, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        fileData,
      );
      fileId = insertResult.insertId;
    }

    await connection.query(
      `INSERT INTO contract_approval_logs
        (contract_id, contract_source, actor_id, action, note)
       VALUES (?, 'CONTRACT', ?, ?, ?)`,
      [
        contractId,
        actorId,
        existing ? "FILE_REPLACE" : "FILE_UPLOAD",
        existing
          ? `Cập nhật file hợp đồng: ${uploadedFile.originalname}`
          : `Upload file hợp đồng: ${uploadedFile.originalname}`,
      ],
    );

    await connection.commit();

    if (existing?.file_path) {
      const oldPath = resolveContractFilePath(existing.file_path);
      const newPath = resolveContractFilePath(relativePath);
      if (oldPath && oldPath !== newPath) {
        await fs.promises.unlink(oldPath).catch(() => {});
      }
    }

    const fileRow = await getContractFileRow(contractId);
    return { file: mapContractFile(fileRow), file_id: fileId };
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
        (contract_id, employee_id, submitted_by, submitted_at, status, version_id, approval_round, note)
       VALUES (?, ?, ?, NOW(), 'PENDING_APPROVAL', ?, ?, ?)`,
      [
        contractPk,
        Number(contract.employee_id),
        actorId,
        Number(fileRow.id),
        approvalRound,
        cleanedNote,
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
      note: cleanedNote || "",
    });

    await connection.commit();

    return {
      success: true,
      submissionId,
      approvalRound,
      submittedAt,
      approval: { state: "PENDING_APPROVAL", reason: "" },
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

export const getContractEditorConfig = async (
  user,
  contractId,
  requestedMode = "view",
) => {
  const context = await getContractAccessContext(user, contractId);
  if (context.notFound) return { notFound: true };
  if (!context.permissions.canView) return { forbidden: true };

  const fileRow = await getContractFileRow(contractId);
  if (!fileRow) return { missingFile: true };
  if (normalizeExtension(fileRow.file_name) !== "docx") {
    return { unsupported: true };
  }
  if (!DOC_JWT_SECRET) return { disabled: true };

  const canEdit = requestedMode === "edit" && context.permissions.canEdit;
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
      url: `${CONTRACT_API_BASE_URL}/contracts/files/${fileToken}`,
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
            callbackUrl: `${CONTRACT_API_BASE_URL}/contracts/onlyoffice/callback?token=${editToken}`,
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
    editorScriptUrl: `${ONLYOFFICE_BASE_URL}/web-apps/apps/api/documents/api.js`,
    config: signedConfig,
  };
};

export const getContractFileForToken = async (token) => {
  const payload = verifyDocToken(token);
  if (payload?.purpose !== "contract_file") return { invalidToken: true };

  const user = {
    user_id: payload.user_id,
    employee_id: payload.employee_id,
    role_id: payload.role_id,
    data_scope: "ALL",
    permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
  };
  const file = await getContractFile(user, Number(payload.contractId));

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

  const allowedHost = new URL(ONLYOFFICE_BASE_URL).host;
  if (sourceUrl.host !== allowedHost) return { invalidUrl: true };

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

export const getContractSummary = async (user, filters = {}) => {
  const { conditions, params } = buildBaseConditions(user, filters);

  const [rows] = await db.query(
    `SELECT
      COUNT(*) AS total_count,
      SUM(CASE WHEN c.status = 'ACTIVE' THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN c.status = 'EXPIRING_SOON' THEN 1 ELSE 0 END) AS expiring_count,
      SUM(CASE WHEN c.status = 'EXPIRED' THEN 1 ELSE 0 END) AS expired_count,
      SUM(CASE WHEN c.status = 'TERMINATED' THEN 1 ELSE 0 END) AS terminated_count
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
