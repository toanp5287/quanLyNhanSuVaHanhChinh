// Các hàm dùng chung cho dự án

import { db } from "../config/database.js";

export const hasPermission = (permissions, permissionCode) => {
  if (!Array.isArray(permissions) || !permissionCode) return false;
  return permissions.includes(permissionCode);
};

export const hasAnyPermission = (permissions, permissionCodes = []) => {
  return permissionCodes.some((code) => hasPermission(permissions, code));
};

export const buildEmployeeScope = (user) => {
  if (!user) {
    return { clause: "WHERE 1 = 0", params: [] };
  }

  switch (user.data_scope) {
    case "ALL":
      return { clause: "", params: [] };
    case "DEPARTMENT":
      return {
        clause: user.department_id
          ? `WHERE (e.department_id = ?
              OR e.department_id IN (SELECT id FROM departments WHERE parent_id = ?)
              OR e.manager_id = ?)`
          : "WHERE 1 = 0",
        params: user.department_id
          ? [user.department_id, user.department_id, user.employee_id || 0]
          : [],
      };
    case "SELF":
      return {
        clause: user.employee_id ? "WHERE e.id = ?" : "WHERE 1 = 0",
        params: user.employee_id ? [user.employee_id] : [],
      };
    default:
      return { clause: "WHERE 1 = 0", params: [] };
  }
};

export const cosineSimilarity = (vecA, vecB) => {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || !vecA.length || vecA.length !== vecB.length) {
    return -1;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < vecA.length; index++) {
    const a = Number(vecA[index]);
    const b = Number(vecB[index]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return -1;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (!normA || !normB) return -1;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

export const resolveApprovalChain = async (connection, employeeId) => {
  const [rows] = await connection.query(
    `SELECT e.id, e.manager_id, e.department_id, COALESCE(e.data_scope, 'SELF') AS data_scope,
            d.parent_id AS dept_parent_id, d.manager_id AS dept_manager_id
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.id = ?
      LIMIT 1`,
    [employeeId],
  );

  if (!rows.length) return null;

  const target = rows[0];
  const approvers = new Set();
  const targetId = Number(target.id);

  if (target.data_scope !== "ALL") {
    if (target.manager_id) approvers.add(Number(target.manager_id));
    if (target.data_scope === "SELF" && target.dept_manager_id) {
      approvers.add(Number(target.dept_manager_id));
    }
    if (target.dept_parent_id) {
      const [parents] = await connection.query(
        "SELECT manager_id FROM departments WHERE id = ? LIMIT 1",
        [target.dept_parent_id],
      );
      if (parents[0]?.manager_id) approvers.add(Number(parents[0].manager_id));
    }
    approvers.add(1);
  }

  approvers.delete(targetId);
  return { target, approvers };
};

export const assertCanApprove = async (connection, approver, employeeId) => {
  if (!approver?.employee_id) {
    throw Object.assign(new Error("Tài khoản chưa liên kết hồ sơ nhân sự"), { status: 403 });
  }

  if (Number(approver.employee_id) === Number(employeeId)) {
    throw Object.assign(new Error("Không thể tự duyệt đơn của chính mình"), { status: 403 });
  }

  const chain = await resolveApprovalChain(connection, employeeId);
  if (!chain) {
    throw Object.assign(new Error("Không tìm thấy nhân viên cần duyệt"), { status: 404 });
  }

  const isDirector = approver.role_id === "DIRECTOR";
  if (!isDirector && !chain.approvers.has(Number(approver.employee_id))) {
    throw Object.assign(new Error("Bạn không thuộc tuyến duyệt của nhân viên này"), { status: 403 });
  }

  return chain.target;
};

export const canViewSalary = (user) => {
  if (!user) return false;

  return !["SUPER_ADMIN", "OFFICE_ADMIN"].includes(user.role_id);
};

export const toPublicUser = (row) => {
  if (!row) return null;

  return {
    user_id: row.user_id,
    username: row.username,
    is_active: row.is_active,
    last_login: row.last_login,
    role_id: row.role_id,
    role_name: row.role_name,
    data_scope: row.data_scope,
    manager_id: row.manager_id ?? null,
    employee_id: row.employee_id,
    employee_code: row.employee_code,
    full_name: row.full_name,
    gender: row.gender,
    dob: row.dob,
    phone: row.phone,
    email: row.email,
    address: row.address,
    citizen_id: row.citizen_id,
    tax_code: row.tax_code,
    base_salary: row.base_salary,
    insurance_salary: row.insurance_salary,
    meal_fuel_allowance: row.meal_fuel_allowance,
    dependents_count: row.dependents_count,
    bank_account: row.bank_account,
    bank_name: row.bank_name,
    hire_date: row.hire_date,
    resign_date: row.resign_date,
    work_status: row.work_status,
    department_id: row.department_id,
    department_code: row.department_code,
    department_name: row.department_name,
    position_id: row.position_id,
    position_code: row.position_code,
    position_title: row.position_title,
    grade_level: row.grade_level,
    has_face_descriptor: Boolean(row.has_face_descriptor ?? row.face_descriptor),
    face_status: row.face_status || (Boolean(row.has_face_descriptor ?? row.face_descriptor) ? "ACTIVE" : "UNREGISTERED"),
    face_enrolled_at: row.face_enrolled_at || null,
    permissions: row.permissions || [],
  };
};
