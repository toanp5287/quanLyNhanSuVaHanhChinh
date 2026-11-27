import { db } from "../config/database.js";
import { ensureLateExplanationSchema } from "./late-explanation/lateExplanation.service.js";
import { getEmployeesByScope } from "./user/user.service.js";

const serviceError = (message, status = 400, code = null) =>
  Object.assign(new Error(message), { status, code });

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const normalize = (row) => ({
  ...row,
  id: Number(row.id),
  delegator_id: Number(row.delegator_id),
  delegate_id: Number(row.delegate_id),
  is_active: Number(row.is_active) ? 1 : 0,
});

export const createDelegation = async (payload, user) => {
  await ensureLateExplanationSchema();
  const delegatorId = Number(user?.employee_id);
  if (!delegatorId) throw serviceError("Tài khoản chưa liên kết hồ sơ nhân viên", 403, "NO_EMPLOYEE_PROFILE");
  const delegateId = Number(payload.delegate_id);
  if (delegateId === delegatorId) {
    throw serviceError("Không thể ủy quyền cho chính mình", 400, "SELF_DELEGATION_FORBIDDEN");
  }
  const [employees] = await db.query(
    "SELECT id FROM employees WHERE id IN (?, ?) AND work_status = 'WORKING'",
    [delegatorId, delegateId],
  );
  if (employees.length !== 2) throw serviceError("Người được ủy quyền không hợp lệ", 404, "DELEGATE_NOT_FOUND");

  const [overlaps] = await db.query(
    `SELECT id FROM approval_delegations
      WHERE is_active = 1 AND scope = ? AND delegator_id = ?
        AND start_at < ? AND end_at > ? LIMIT 1`,
    [payload.scope, delegatorId, payload.end_at, payload.start_at],
  );
  if (overlaps.length) {
    throw serviceError("Khoảng thời gian ủy quyền bị chồng lấn", 409, "DELEGATION_OVERLAP");
  }

  const [result] = await db.query(
    `INSERT INTO approval_delegations
      (delegator_id, delegate_id, scope, start_at, end_at, reason, is_active, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    [delegatorId, delegateId, payload.scope, payload.start_at, payload.end_at, payload.reason || null, user.user_id || null],
  );
  const [rows] = await db.query(
    "SELECT * FROM approval_delegations WHERE id = ?",
    [result.insertId],
  );
  return normalize(rows[0]);
};

export const listMyDelegations = async (user) => {
  await ensureLateExplanationSchema();
  const employeeId = Number(user?.employee_id);
  if (!employeeId) return { created: [], received: [] };
  const [created] = await db.query(
    `SELECT d.*, e.full_name AS delegate_name
       FROM approval_delegations d
       LEFT JOIN employees e ON e.id = d.delegate_id
      WHERE d.delegator_id = ?
      ORDER BY d.start_at DESC LIMIT 100`,
    [employeeId],
  );
  const [received] = await db.query(
    `SELECT d.*, e.full_name AS delegator_name
       FROM approval_delegations d
       LEFT JOIN employees e ON e.id = d.delegator_id
      WHERE d.delegate_id = ?
      ORDER BY d.start_at DESC LIMIT 100`,
    [employeeId],
  );
  return {
    created: created.map(normalize),
    received: received.map(normalize),
  };
};

export const revokeDelegation = async (id, user) => {
  await ensureLateExplanationSchema();
  const [rows] = await db.query(
    "SELECT * FROM approval_delegations WHERE id = ? LIMIT 1",
    [id],
  );
  if (!rows.length) throw serviceError("Không tìm thấy ủy quyền", 404, "DELEGATION_NOT_FOUND");
  const row = rows[0];
  const isAdmin = ["SUPER_ADMIN", "HR_ADMIN", "ADMIN"].includes(user?.role_id);
  if (!isAdmin && Number(row.delegator_id) !== Number(user?.employee_id)) {
    throw serviceError("Bạn không có quyền hủy ủy quyền này", 403, "NOT_DELEGATOR");
  }
  await db.query(
    "UPDATE approval_delegations SET is_active = 0, revoked_by = ?, revoked_at = NOW() WHERE id = ?",
    [user?.user_id || null, id],
  );
  const [updated] = await db.query(
    "SELECT * FROM approval_delegations WHERE id = ?",
    [id],
  );
  return normalize(updated[0]);
};

export const getDelegationCandidates = async (user) => {
  const rows = await getEmployeesByScope({
    user_id: user?.user_id,
    role_id: user?.role_id,
    data_scope: user?.data_scope,
    employee_id: user?.employee_id,
    department_id: user?.department_id,
    manager_id: user?.manager_id,
    permissions: user?.permissions,
  });
  return rows
    .filter(
      (row) =>
        row.work_status === "WORKING" &&
        Number(row.id) !== Number(user?.employee_id),
    )
    .map((row) => ({
      id: Number(row.id),
      employee_code: row.employee_code,
      full_name: row.full_name,
      department_name: row.department_name,
      position_name: row.position_name,
    }));
};

export const getActiveDelegate = async (connection, delegatorId, scope = "LATE_EXPLANATION") => {
  const [rows] = await connection.query(
    `SELECT delegate_id FROM approval_delegations
      WHERE delegator_id = ? AND is_active = 1 AND scope IN (?, 'ALL_APPROVALS')
        AND start_at <= NOW() AND end_at >= NOW()
      ORDER BY id DESC LIMIT 1`,
    [delegatorId, scope],
  );
  return rows[0] ? toNumber(rows[0].delegate_id, null) : null;
};
