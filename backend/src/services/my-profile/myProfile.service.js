import bcrypt from "bcryptjs";
import { db } from "../../config/database.js";
import { verifyPassword } from "../auth/auth.service.js";

const EMPLOYEE_QUERY = `
  SELECT
    e.id,
    e.employee_code,
    e.department_id,
    e.position_id,
    e.full_name,
    e.gender,
    DATE_FORMAT(e.dob, '%Y-%m-%d') AS dob,
    e.phone,
    e.email,
    e.address,
    e.citizen_id,
    e.tax_code,
    e.base_salary,
    e.insurance_salary,
    e.meal_fuel_allowance,
    e.dependents_count,
    e.bank_account,
    e.bank_name,
    DATE_FORMAT(e.hire_date, '%Y-%m-%d') AS hire_date,
    DATE_FORMAT(e.resign_date, '%Y-%m-%d') AS resign_date,
    e.work_status,
    d.department_code,
    d.name AS department_name,
    p.position_code,
    p.title AS position_title,
    p.grade_level,
    p.job_description,
    p.job_requirements,
    p.min_salary,
    p.max_salary,
    p.position_allowance
  FROM employees e
  LEFT JOIN departments d ON d.id = e.department_id
  LEFT JOIN positions p ON p.id = e.position_id
  WHERE e.id = ?
  LIMIT 1
`;

const CONTRACTS_QUERY = `
  SELECT
    id,
    contract_code,
    contract_type,
    DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
    DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
    signed_salary,
    insurance_salary,
    status,
    note
  FROM contracts
  WHERE employee_id = ?
  ORDER BY start_date DESC, id DESC
`;

const WORK_HISTORIES_QUERY = `
  SELECT
    wh.id,
    wh.decision_code,
    wh.action_type,
    wh.old_salary,
    wh.new_salary,
    DATE_FORMAT(wh.effective_date, '%Y-%m-%d') AS effective_date,
    wh.note,
    fd.name AS from_department_name,
    td.name AS to_department_name,
    fp.title AS from_position_title,
    tp.title AS to_position_title
  FROM work_histories wh
  LEFT JOIN departments fd ON fd.id = wh.from_department_id
  LEFT JOIN departments td ON td.id = wh.to_department_id
  LEFT JOIN positions fp ON fp.id = wh.from_position_id
  LEFT JOIN positions tp ON tp.id = wh.to_position_id
  WHERE wh.employee_id = ?
  ORDER BY wh.effective_date DESC, wh.id DESC
`;

const DEPENDENTS_QUERY = `
  SELECT
    id,
    full_name,
    relationship,
    DATE_FORMAT(dob, '%Y-%m-%d') AS dob,
    citizen_or_birth_cert,
    tax_code,
    DATE_FORMAT(deduction_start, '%Y-%m-%d') AS deduction_start,
    DATE_FORMAT(deduction_end, '%Y-%m-%d') AS deduction_end,
    status
  FROM dependents
  WHERE employee_id = ?
  ORDER BY status ASC, id ASC
`;

const REWARDS_QUERY = `
  SELECT
    id,
    decision_code,
    record_type,
    title,
    reason,
    amount,
    applied_month,
    DATE_FORMAT(decision_date, '%Y-%m-%d') AS decision_date,
    status
  FROM rewards_disciplines
  WHERE employee_id = ?
  ORDER BY decision_date DESC, id DESC
`;

export const getSelfProfile = async (employeeId) => {
  if (!employeeId) return null;

  const [employeeRows] = await db.query(EMPLOYEE_QUERY, [employeeId]);

  if (!employeeRows.length) return null;

  const [contracts] = await db.query(CONTRACTS_QUERY, [employeeId]);
  const [workHistories] = await db.query(WORK_HISTORIES_QUERY, [employeeId]);
  const [dependents] = await db.query(DEPENDENTS_QUERY, [employeeId]);
  const [rewardsDisciplines] = await db.query(REWARDS_QUERY, [employeeId]);

  return {
    employee: employeeRows[0],
    contracts,
    work_histories: workHistories,
    dependents,
    rewards_disciplines: rewardsDisciplines,
  };
};

export const updateSelfContact = async (employeeId, payload = {}) => {
  if (!employeeId) return null;

  const allowedFields = {
    phone: 20,
    address: 255,
    bank_account: 50,
    bank_name: 100,
  };

  const assignments = [];
  const values = [];

  Object.entries(allowedFields).forEach(([field, maxLength]) => {
    if (payload[field] === undefined) return;

    assignments.push(`${field} = ?`);
    values.push(String(payload[field] ?? "").trim().slice(0, maxLength));
  });

  if (assignments.length) {
    values.push(employeeId);

    await db.query(
      `UPDATE employees SET ${assignments.join(", ")} WHERE id = ?`,
      values,
    );
  }

  const [rows] = await db.query(
    `SELECT
       id,
       employee_code,
       phone,
       address,
       bank_account,
       bank_name
     FROM employees
     WHERE id = ?
     LIMIT 1`,
    [employeeId],
  );

  return rows[0] || null;
};

export const changeSelfPassword = async (
  userId,
  currentPassword,
  newPassword,
) => {
  if (!userId) return { notFound: true };

  const [rows] = await db.query(
    "SELECT id, password_hash FROM users WHERE id = ? LIMIT 1",
    [userId],
  );

  if (!rows.length) return { notFound: true };

  const isValid = await verifyPassword(currentPassword, rows[0].password_hash);

  if (!isValid) return { invalidCurrent: true };

  const passwordHash = await bcrypt.hash(String(newPassword), 10);

  await db.query("UPDATE users SET password_hash = ? WHERE id = ?", [
    passwordHash,
    userId,
  ]);

  return { success: true };
};
