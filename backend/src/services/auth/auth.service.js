import bcrypt from "bcryptjs";
import { db } from "../../config/database.js";
import { toPublicUser } from "../../utils/helper.js";

const USER_QUERY = `
  SELECT
    u.id AS user_id,
    u.username,
    u.password_hash,
    u.is_active,
    u.last_login,
    r.id AS role_id,
    r.name AS role_name,
    r.data_scope,
    e.id AS employee_id,
    e.employee_code,
    e.full_name,
    e.gender,
    e.dob,
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
    e.hire_date,
    e.resign_date,
    e.work_status,
    d.id AS department_id,
    d.department_code,
    d.name AS department_name,
    p.id AS position_id,
    p.position_code,
    p.title AS position_title,
    p.grade_level
  FROM users u
  LEFT JOIN employees e ON e.id = u.employee_id
  LEFT JOIN departments d ON d.id = e.department_id
  LEFT JOIN positions p ON p.id = e.position_id
  LEFT JOIN roles r ON r.id = u.role_id
`;

const getPermissionCodes = async (roleId) => {
  if (!roleId) return [];

  const [rows] = await db.query(
    `SELECT p.permission_code
     FROM role_permissions rp
     INNER JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = ?
     ORDER BY p.id`,
    [roleId],
  );

  return rows.map((row) => row.permission_code);
};

export const findUserByIdentifier = async (identifier) => {
  if (!identifier) return null;

  const value = String(identifier).trim();
  const [rows] = await db.query(
    `${USER_QUERY}
     WHERE e.employee_code = ? OR e.email = ?
     LIMIT 1`,
    [value, value],
  );

  if (!rows.length) return null;

  const user = rows[0];
  user.permissions = await getPermissionCodes(user.role_id);
  return user;
};

export const findUserById = async (userId) => {
  if (!userId) return null;

  const [rows] = await db.query(`${USER_QUERY} WHERE u.id = ? LIMIT 1`, [
    userId,
  ]);

  if (!rows.length) return null;

  const user = rows[0];
  user.permissions = await getPermissionCodes(user.role_id);
  return user;
};

export const verifyPassword = async (plainPassword, passwordHash) => {
  if (!passwordHash) return false;

  if (String(passwordHash).startsWith("$2")) {
    return bcrypt.compare(String(plainPassword), String(passwordHash));
  }

  return String(plainPassword) === String(passwordHash);
};

export const updateLastLogin = async (userId) => {
  await db.query("UPDATE users SET last_login = NOW() WHERE id = ?", [userId]);
};

export const toAuthUser = (user) => toPublicUser(user);
