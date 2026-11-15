import { db } from "../../config/database.js";
import { buildEmployeeScope } from "../../utils/helper.js";

const STATUS_FILTERS = [
  "ALL",
  "ACTIVE",
  "EXPIRING_SOON",
  "EXPIRED",
  "TERMINATED",
];

const CONTRACT_STATUSES = STATUS_FILTERS.filter((status) => status !== "ALL");

const normalizeText = (value) => String(value ?? "").trim();

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
      `SELECT e.id, e.employee_code, e.full_name, e.work_status, e.department_id
       FROM employees e
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
