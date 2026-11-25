import { db } from "../../config/database.js";
import { buildEmployeeScope } from "../../utils/helper.js";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_EXPIRING_WITHIN_DAYS = 90;
const ALLOWED_CONTRACT_STATUSES = ["ACTIVE", "EXPIRING_SOON"];

const normalizeText = (value) => String(value ?? "").trim();

const isFixedTermSql = (alias = "") => {
  const p = alias ? `${alias}.` : "";
  return `(${p}contract_type = 'FIXED_TERM' OR LOWER(${p}contract_type) LIKE 'xác định thời hạn%')`;
};

const deriveDisplayStatus = (days, windowDays) => {
  if (!Number.isFinite(days)) return "ACTIVE";
  if (days < 0) return "EXPIRED";
  return days <= windowDays ? "EXPIRING_SOON" : "ACTIVE";
};

const parsePositiveInt = (value, fallback = null) => {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
};

const parseNonNegativeInt = (value, fallback = null) => {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
};

const isIndefiniteContractType = (contractType) =>
  normalizeText(contractType).toLowerCase().includes("không xác định");

const buildScopeClause = (user) => {
  const scope = buildEmployeeScope(user);
  return {
    clause: scope.clause ? scope.clause.replace(/^WHERE\s+/i, "") : "1 = 1",
    params: [...scope.params],
  };
};

export const validateCandidateFilters = (query = {}) => {
  const keyword = normalizeText(query.keyword || query.q).slice(0, 100);
  const contractType = normalizeText(query.contract_type).slice(0, 100);

  const departmentIdRaw = query.department_id;
  const departmentId = parsePositiveInt(departmentIdRaw);
  if (departmentIdRaw !== undefined && departmentIdRaw !== "" && !departmentId) {
    return { error: "Phòng ban lọc không hợp lệ" };
  }

  const statusRaw = normalizeText(query.status).toUpperCase();
  const allowedStatuses = ALLOWED_CONTRACT_STATUSES;
  const status = statusRaw || "ALL";
  if (status !== "ALL" && !allowedStatuses.includes(status)) {
    return { error: "Trạng thái hợp đồng không hợp lệ" };
  }

  const expiringWithinDaysRaw = query.expiring_within_days;
  const expiringWithinDays = parsePositiveInt(
    expiringWithinDaysRaw,
    DEFAULT_EXPIRING_WITHIN_DAYS,
  );
  if (
    expiringWithinDaysRaw !== undefined &&
    expiringWithinDaysRaw !== "" &&
    (!expiringWithinDays || expiringWithinDays > 3650)
  ) {
    return { error: "Số ngày sắp hết hạn không hợp lệ" };
  }

  const page = parsePositiveInt(query.page, DEFAULT_PAGE);
  const limitRaw = parsePositiveInt(query.limit, DEFAULT_LIMIT);
  const limit = Math.min(limitRaw || DEFAULT_LIMIT, MAX_LIMIT);
  const offset = (page - 1) * limit;

  const asOfDate = normalizeText(query.as_of_date);
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (asOfDate && !datePattern.test(asOfDate)) {
    return { error: "Ngày tham chiếu không hợp lệ" };
  }

  return {
    filters: {
      keyword,
      contractType,
      departmentId,
      status,
      expiringWithinDays: expiringWithinDays || DEFAULT_EXPIRING_WITHIN_DAYS,
      asOfDate: asOfDate || null,
      page,
      limit,
      offset,
    },
  };
};

const buildBaseConditions = (user, filters) => {
  const scope = buildScopeClause(user);
  const conditions = [scope.clause];
  const params = [...scope.params];

  conditions.push(isFixedTermSql("c"));
  conditions.push("LOWER(c.contract_type) NOT IN ('probation', 'indefinite')");
  conditions.push("LOWER(c.contract_type) NOT LIKE '%không xác định thời hạn%'");
  if (filters.status === "ALL") {
    conditions.push("c.status IN ('ACTIVE', 'EXPIRING_SOON')");
  } else {
    conditions.push("c.status = ?");
    params.push(filters.status);
  }

  if (filters.departmentId) {
    conditions.push("e.department_id = ?");
    params.push(filters.departmentId);
  }

  if (filters.contractType && !isIndefiniteContractType(filters.contractType)) {
    conditions.push("c.contract_type = ?");
    params.push(filters.contractType);
  }

  if (filters.keyword) {
    const like = `%${filters.keyword}%`;
    conditions.push(
      "(c.contract_code LIKE ? OR e.employee_code LIKE ? OR e.full_name LIKE ?)",
    );
    params.push(like, like, like);
  }

  const asOfExpr = filters.asOfDate ? "DATE(?)" : "CURDATE()";
  if (filters.asOfDate) params.push(filters.asOfDate, filters.asOfDate);
  conditions.push(`c.end_date BETWEEN ${asOfExpr} AND DATE_ADD(${asOfExpr}, INTERVAL ? DAY)`);
  params.push(filters.expiringWithinDays);

  return {
    conditions,
    params,
    asOfExpr,
    selectAsOfParams: filters.asOfDate ? [filters.asOfDate] : [],
  };
};

const CANDIDATE_SELECT = `
  SELECT
    c.id AS contract_id,
    c.contract_code,
    c.contract_type,
    DATE_FORMAT(c.start_date, '%Y-%m-%d') AS start_date,
    DATE_FORMAT(c.end_date, '%Y-%m-%d') AS end_date,
    c.status AS contract_status,
    c.signed_salary,
    c.insurance_salary,
    c.note,
    e.id AS employee_id,
    e.employee_code,
    e.full_name,
    e.work_status AS employee_work_status,
    e.department_id,
    d.department_code,
    d.name AS department_name,
    e.position_id,
    p.position_code,
    p.title AS position_title,
    DATEDIFF(c.end_date, __AS_OF_EXPR__) AS days_until_end
  FROM contracts c
  INNER JOIN employees e ON e.id = c.employee_id
  LEFT JOIN departments d ON d.id = e.department_id
  LEFT JOIN positions p ON p.id = e.position_id
`;

export const getContractRenewalCandidates = async (user, filters) => {
  const { conditions, params, asOfExpr, selectAsOfParams } = buildBaseConditions(user, filters);
  const whereClause = `WHERE ${conditions.join(" AND ")}`;
  const selectSql = CANDIDATE_SELECT.replaceAll("__AS_OF_EXPR__", asOfExpr);

  const countSql = `
    SELECT COUNT(*) AS total
    FROM contracts c
    INNER JOIN employees e ON e.id = c.employee_id
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN positions p ON p.id = e.position_id
    ${whereClause}
  `;

  const [countRows] = await db.query(countSql, params);
  const total = Number(countRows[0]?.total || 0);

  const dataSql = `
    ${selectSql}
    ${whereClause}
    ORDER BY
      c.end_date ASC,
      FIELD(c.status, 'EXPIRING_SOON', 'ACTIVE'),
      e.employee_code ASC,
      c.id ASC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await db.query(dataSql, [...selectAsOfParams, ...params, filters.limit, filters.offset]);

  const employeeIds = [...new Set(rows.map((row) => row.employee_id).filter(Boolean))];
  let definiteTermCountByEmployee = new Map();

  if (employeeIds.length) {
    const placeholders = employeeIds.map(() => "?").join(", ");
    const [countByEmpRows] = await db.query(
      `SELECT employee_id, COUNT(*) AS definite_term_count
       FROM contracts
       WHERE employee_id IN (${placeholders})
         AND ${isFixedTermSql()}
       GROUP BY employee_id`,
      employeeIds,
    );
    definiteTermCountByEmployee = new Map(
      countByEmpRows.map((row) => [Number(row.employee_id), Number(row.definite_term_count || 0)]),
    );
  }

  const candidates = rows.map((row) => {
    const daysUntilEnd = row.days_until_end === null ? null : Number(row.days_until_end);
    const displayStatus = deriveDisplayStatus(daysUntilEnd, filters.expiringWithinDays);
    const definiteTermSignedCount = definiteTermCountByEmployee.get(Number(row.employee_id)) ?? null;

    return {
      contract: {
        id: row.contract_id,
        contract_code: row.contract_code,
        contract_type: row.contract_type,
        start_date: row.start_date,
        end_date: row.end_date,
        status: row.contract_status,
        display_status: displayStatus,
        status_basis: "derived_from_end_date",
        signed_salary: row.signed_salary,
        insurance_salary: row.insurance_salary,
        note: row.note,
        days_until_end: daysUntilEnd,
      },
      employee: {
        id: row.employee_id,
        employee_code: row.employee_code,
        full_name: row.full_name,
        work_status: row.employee_work_status,
        department: row.department_id
          ? {
              id: row.department_id,
              department_code: row.department_code,
              name: row.department_name,
            }
          : null,
        position: row.position_id
          ? {
              id: row.position_id,
              position_code: row.position_code,
              title: row.position_title,
            }
          : null,
      },
      renewal_review: {
        definite_term_signed_count: definiteTermSignedCount,
        definite_term_signed_count_basis:
          "Đếm theo hợp đồng xác định thời hạn trong bảng contracts (FIXED_TERM hoặc 'Xác định thời hạn ...'). Đây là số liệu tham khảo, chưa bao gồm kiểm tra ngoại lệ pháp lý.",
        requires_hr_review: true,
        special_case_flags: [],
        review_notes: [
          "Cần HR kiểm tra Điều 20/149/151/177, số lần ký HĐXĐTH, ngoại lệ và các trường hợp đặc biệt theo taiKyHopDong1.md.",
        ],
      },
    };
  });

  return {
    total,
    page: filters.page,
    limit: filters.limit,
    total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit),
    candidates,
  };
};
