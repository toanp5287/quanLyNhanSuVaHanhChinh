import { db } from "../../config/database.js";
import { buildEmployeeScope } from "../../utils/helper.js";

const STATUS_FILTERS = ["ALL", "ACTIVE", "WORKING", "MATERNITY", "RESIGNED"];

const normalizeText = (value) => String(value ?? "").trim();

const parsePositiveInt = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

const parseBirthMonth = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 12
    ? number
    : null;
};

const buildScopeConditions = (user) => {
  const scope = buildEmployeeScope(user);

  if (!scope.clause) return { conditions: [], params: [] };

  return {
    conditions: [scope.clause.replace(/^WHERE\s+/i, "")],
    params: [...scope.params],
  };
};

const buildWhereClause = (conditions) =>
  conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

export const validateEmployeeFilters = (query = {}) => {
  const status = normalizeText(query.status || "ALL").toUpperCase();

  if (!STATUS_FILTERS.includes(status)) {
    return { error: "Trạng thái lọc không hợp lệ" };
  }

  const departmentId = parsePositiveInt(query.department_id);
  if (query.department_id !== undefined && query.department_id !== "" && !departmentId) {
    return { error: "Phòng ban lọc không hợp lệ" };
  }

  const positionId = parsePositiveInt(query.position_id);
  if (query.position_id !== undefined && query.position_id !== "" && !positionId) {
    return { error: "Chức vụ lọc không hợp lệ" };
  }

  const birthMonth = parseBirthMonth(query.birth_month);
  if (query.birth_month !== undefined && query.birth_month !== "" && !birthMonth) {
    return { error: "Tháng sinh không hợp lệ" };
  }

  const keyword = normalizeText(query.keyword || query.q).slice(0, 100);

  return {
    filters: { status, departmentId, positionId, birthMonth, keyword },
  };
};

export const getEmployeeList = async (user, filters = {}) => {
  const { conditions, params } = buildScopeConditions(user);

  if (filters.keyword) {
    const like = `%${filters.keyword}%`;
    conditions.push(
      "(e.employee_code LIKE ? OR e.full_name LIKE ? OR e.phone LIKE ? OR e.email LIKE ? OR e.citizen_id LIKE ?)",
    );
    params.push(like, like, like, like, like);
  }

  if (filters.departmentId) {
    conditions.push("e.department_id = ?");
    params.push(filters.departmentId);
  }

  if (filters.positionId) {
    conditions.push("e.position_id = ?");
    params.push(filters.positionId);
  }

  if (filters.status === "ACTIVE") {
    conditions.push("e.work_status IN ('WORKING', 'MATERNITY')");
  } else if (filters.status && filters.status !== "ALL") {
    conditions.push("e.work_status = ?");
    params.push(filters.status);
  }

  if (filters.birthMonth) {
    conditions.push("MONTH(e.dob) = ?");
    params.push(filters.birthMonth);
  }

  const whereClause = buildWhereClause(conditions);

  const [rows] = await db.query(
    `SELECT
      e.id,
      e.employee_code,
      e.full_name,
      e.gender,
      DATE_FORMAT(e.dob, '%Y-%m-%d') AS dob,
      e.phone,
      e.email,
      e.citizen_id,
      e.department_id,
      d.department_code,
      d.name AS department_name,
      e.position_id,
      p.position_code,
      p.title AS position_title,
      p.grade_level,
      e.base_salary,
      e.work_status,
      DATE_FORMAT(e.hire_date, '%Y-%m-%d') AS hire_date,
      DATE_FORMAT(e.resign_date, '%Y-%m-%d') AS resign_date
    FROM employees e
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN positions p ON p.id = e.position_id
    ${whereClause}
    ORDER BY e.employee_code ASC`,
    params,
  );

  return rows;
};

export const getEmployeeSummary = async (user) => {
  const { conditions, params } = buildScopeConditions(user);
  const whereClause = buildWhereClause(conditions);

  const [rows] = await db.query(
    `SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN e.work_status = 'WORKING' THEN 1 ELSE 0 END) AS working,
      SUM(CASE WHEN e.work_status = 'MATERNITY' THEN 1 ELSE 0 END) AS maternity,
      SUM(CASE WHEN e.work_status = 'RESIGNED' THEN 1 ELSE 0 END) AS resigned
    FROM employees e
    ${whereClause}`,
    params,
  );

  const summary = rows[0] || {};

  return {
    total: Number(summary.total || 0),
    working: Number(summary.working || 0),
    maternity: Number(summary.maternity || 0),
    resigned: Number(summary.resigned || 0),
  };
};

export const getEmployeeFilterOptions = async () => {
  const [departments] = await db.query(
    `SELECT id, department_code, name
     FROM departments
     ORDER BY name ASC`,
  );

  const [positions] = await db.query(
    `SELECT id, department_id, position_code, title, grade_level
     FROM positions
     ORDER BY title ASC`,
  );

  return { departments, positions };
};
