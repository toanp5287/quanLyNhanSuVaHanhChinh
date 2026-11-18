import { db } from "../../config/database.js";
import { assertCanApprove, buildEmployeeScope } from "../../utils/helper.js";
import { recalculateEmployeeMonth } from "../tong-hop-chot-cong/tongHopChotCong.service.js";
import { recalculateDailyAttendance } from "../diem-danh-nhat-ky-quet-the-phan-ca/diemDanhNhatKyQuetThePhanCa.service.js";

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const LEGACY_REASONS = {
  ANNUAL_LEAVE: "ANNUAL_LEAVE",
  SICK_LEAVE: "SICK_LEAVE",
  UNPAID_LEAVE: "UNPAID_LEAVE",
  WEDDING_FUNERAL: "PERSONAL_EXEMPT",
  MATERNITY_LEAVE: "PERSONAL_EXEMPT",
  PERSONAL_EXEMPT: "PERSONAL_EXEMPT",
};
const DAY_TYPES = ["FULL_DAY", "MORNING", "AFTERNOON", "LATE_EARLY_EXEMPT"];
const REASON_CATEGORIES = ["ANNUAL_LEAVE", "SICK_LEAVE", "UNPAID_LEAVE", "PERSONAL_EXEMPT"];

const date = value => {
  const text = String(value || "");
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) throw fail("Ngày nghỉ không hợp lệ (YYYY-MM-DD)");
  return text;
};
const months = (from, to) => {
  const result = [];
  for (const current = new Date(`${from.slice(0, 7)}-01T00:00:00Z`); current.toISOString().slice(0, 7) <= to.slice(0, 7); current.setUTCMonth(current.getUTCMonth() + 1)) result.push(current.toISOString().slice(0, 7));
  return result;
};
const years = (from, to) => Array.from({ length: Number(to.slice(0, 4)) - Number(from.slice(0, 4)) + 1 }, (_, i) => Number(from.slice(0, 4)) + i);
const requestCode = (row) => `LV${String(row.work_date).replace(/-/g, "").slice(0, 8)}-${row.employee_id}-${String(row.id).padStart(4, "0")}`;
const legacyLeaveType = (row) => {
  if (row.reason_category === "PERSONAL_EXEMPT" && row.leave_type === "LATE_EARLY_EXEMPT") return "PERSONAL_EXEMPT";
  if (row.reason_category === "PERSONAL_EXEMPT") return "WEDDING_FUNERAL";
  return row.reason_category;
};
const legacyTotalDays = (row) => {
  if (row.leave_type === "MORNING" || row.leave_type === "AFTERNOON") return 0.5;
  if (row.leave_type === "LATE_EARLY_EXEMPT") return 0;
  return 1;
};
const lockEmployee = async (connection, employeeId) => {
  const [rows] = await connection.query("SELECT id FROM employees WHERE id = ? FOR UPDATE", [employeeId]);
  if (!rows.length) throw fail("Không tìm thấy hồ sơ nhân viên", 404);
};
const assertOpen = async (connection, employeeId, workDate) => {
  const [rows] = await connection.query("SELECT id FROM monthly_timesheets WHERE employee_id = ? AND month_year = ? AND status = 'LOCKED' FOR UPDATE", [employeeId, workDate.slice(0, 7)]);
  if (rows.length) throw fail("Khoảng nghỉ thuộc bảng công đã khóa", 409);
};
const transaction = async operation => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
};

export const recalculateLeaveBalance = async (connection, employeeId, year) => {
  await connection.query("INSERT INTO leave_balances (employee_id, year) VALUES (?, ?) ON DUPLICATE KEY UPDATE employee_id = VALUES(employee_id)", [employeeId, year]);
  const [balances] = await connection.query("SELECT * FROM leave_balances WHERE employee_id = ? AND year = ? FOR UPDATE", [employeeId, year]);
  const [requests] = await connection.query(`SELECT paid_workday, status FROM leave_requests
    WHERE employee_id = ? AND reason_category = 'ANNUAL_LEAVE' AND status IN ('PENDING', 'APPROVED')
      AND YEAR(work_date) = ?`, [employeeId, year]);
  let used = 0, pending = 0;
  for (const request of requests) {
    const amount = Number(request.paid_workday || 0);
    if (request.status === "APPROVED") used += amount;
    else pending += amount;
  }
  const balance = balances[0];
  const remaining = Number(balance.annual_quota) + Number(balance.carried_over) + Number(balance.seniority_bonus) - used - pending;
  await connection.query("UPDATE leave_balances SET used_days = ?, pending_days = ?, remaining_days = ? WHERE id = ?", [used, pending, remaining, balance.id]);
  return { ...balance, used_days: used, pending_days: pending, remaining_days: remaining };
};

export const listLeaveBalances = async (user, filters = {}) => {
  const year = Number(filters.year || new Date().getFullYear());
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw fail("Năm quỹ phép không hợp lệ");
  const scope = buildEmployeeScope(user);
  const params = [...scope.params];
  let condition = scope.clause || "WHERE 1 = 1";
  if (filters.employee_id) { condition += " AND e.id = ?"; params.push(Number(filters.employee_id)); }
  return transaction(async connection => {
    const [employees] = await connection.query(`SELECT e.id, e.employee_code, e.full_name FROM employees e ${condition} ORDER BY e.id`, params);
    const result = [];
    for (const employee of employees) {
      await lockEmployee(connection, employee.id);
      result.push({ ...await recalculateLeaveBalance(connection, employee.id, year), employee_code: employee.employee_code, full_name: employee.full_name });
    }
    return result;
  });
};

export const updateLeaveBalance = async (user, employeeId, payload = {}) => {
  if (!user?.permissions?.includes("LEAVE.QUOTA_MANAGE")) throw fail("Không có quyền quản lý quỹ phép", 403);
  const year = Number(payload.year);
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw fail("Năm quỹ phép không hợp lệ");
  const values = [payload.annual_quota, payload.carried_over ?? 0, payload.seniority_bonus ?? 0].map(Number);
  if (values.some(value => !Number.isFinite(value) || value < 0 || value > 99 || value * 2 !== Math.round(value * 2))) throw fail("Quỹ phép phải từ 0 đến 99 ngày, theo bước 0.5 ngày");
  return transaction(async connection => {
    const scope = buildEmployeeScope(user);
    const [visible] = await connection.query(`SELECT e.id FROM employees e ${scope.clause || "WHERE 1 = 1"} AND e.id = ?`, [...scope.params, employeeId]);
    if (!visible.length) throw fail("Nhân viên ngoài phạm vi quản lý", 403);
    await lockEmployee(connection, employeeId);
    await recalculateLeaveBalance(connection, employeeId, year);
    await connection.query("UPDATE leave_balances SET annual_quota = ?, carried_over = ?, seniority_bonus = ? WHERE employee_id = ? AND year = ?", [...values, employeeId, year]);
    const balance = await recalculateLeaveBalance(connection, employeeId, year);
    if (balance.remaining_days < 0) throw fail("Quỹ phép nhỏ hơn số ngày đã sử dụng và đang chờ duyệt", 409);
    return balance;
  });
};

export const listLeaveRequests = async (user, filters = {}) => {
  const scope = buildEmployeeScope(user);
  let condition = scope.clause || "WHERE 1 = 1";
  const params = [...scope.params];
  if (filters.employee_id) { condition += " AND lr.employee_id = ?"; params.push(Number(filters.employee_id)); }
  if (filters.status) {
    if (!["PENDING", "APPROVED", "REJECTED"].includes(filters.status)) throw fail("Trạng thái đơn nghỉ không hợp lệ");
    condition += " AND lr.status = ?"; params.push(filters.status);
  }
  if (filters.month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(filters.month)) throw fail("Tháng không hợp lệ");
    condition += " AND DATE_FORMAT(lr.work_date, '%Y-%m') = ?"; params.push(filters.month);
  }
  const [rows] = await db.query(`SELECT lr.*,
    DATE_FORMAT(lr.work_date, '%Y-%m-%d') AS from_date,
    DATE_FORMAT(lr.work_date, '%Y-%m-%d') AS to_date,
    e.full_name, e.employee_code, COALESCE(d.department_name, d.name) AS department_name
    FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id LEFT JOIN departments d ON d.id = e.department_id ${condition} ORDER BY lr.id DESC`, params);
  return rows.map(row => ({
    ...row,
    request_code: requestCode(row),
    leave_type: legacyLeaveType(row),
    total_days: legacyTotalDays(row),
    is_paid: Number(row.paid_workday || 0) > 0 ? 1 : 0,
    handover_to: null,
    reject_reason: null,
  }));
};

export const createLeaveRequest = async (user, payload = {}) => {
  if (!user?.employee_id) throw fail("Tài khoản chưa liên kết hồ sơ nhân sự", 404);
  const employeeId = Number(user.employee_id);
  if (payload.employee_id && Number(payload.employee_id) !== employeeId) throw fail("Chỉ được tạo đơn nghỉ của chính mình", 403);
  const workDate = date(payload.work_date || payload.from_date);
  if (payload.to_date && date(payload.to_date) !== workDate) throw fail("Schema hiện tại chỉ hỗ trợ đơn nghỉ cho một ngày");

  const rawType = String(payload.leave_type || "ANNUAL_LEAVE").toUpperCase();
  const leaveType = DAY_TYPES.includes(rawType)
    ? rawType
    : Number(payload.total_days) === 0.5
      ? (payload.half_day === "AFTERNOON" ? "AFTERNOON" : "MORNING")
      : "FULL_DAY";
  const reasonCategory = LEGACY_REASONS[rawType] || (REASON_CATEGORIES.includes(rawType) ? rawType : "ANNUAL_LEAVE");
  const paid = ["ANNUAL_LEAVE", "WEDDING_FUNERAL"].includes(rawType) || reasonCategory === "ANNUAL_LEAVE";
  const paidWorkday =
    !paid || leaveType === "LATE_EARLY_EXEMPT"
      ? 0
      : leaveType === "FULL_DAY"
        ? 1
        : 0.5;
  const totalDays = leaveType === "FULL_DAY" ? 1 : leaveType === "LATE_EARLY_EXEMPT" ? 0 : 0.5;
  const exemptMinutes = Math.max(0, Math.min(480, Number(payload.exempt_minutes || 0)));
  const reason = String(payload.reason || "").trim();
  if (!reason) throw fail("Vui lòng nhập lý do nghỉ");

  return transaction(async connection => {
    await lockEmployee(connection, employeeId);
    await assertOpen(connection, employeeId, workDate);
    const [overlap] = await connection.query("SELECT id FROM leave_requests WHERE employee_id = ? AND status IN ('PENDING', 'APPROVED') AND work_date = ? LIMIT 1", [employeeId, workDate]);
    if (overlap.length) throw fail("Đã có đơn nghỉ trùng khoảng ngày này", 409);
    const [result] = await connection.query(`INSERT INTO leave_requests
      (employee_id, work_date, leave_type, reason_category, paid_workday, exempt_minutes, reason, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [employeeId, workDate, leaveType, reasonCategory, paidWorkday, exemptMinutes, reason]);
    const balance = await recalculateLeaveBalance(connection, employeeId, Number(workDate.slice(0, 4)));
    if (reasonCategory === "ANNUAL_LEAVE" && balance.remaining_days < 0) throw fail("Quỹ phép năm không đủ", 409);
    const row = { id: result.insertId, employee_id: employeeId, work_date: workDate };
    return { id: result.insertId, request_code: requestCode(row), status: "PENDING", total_days: totalDays, is_paid: paid ? 1 : 0 };
  });
};

export const processLeaveRequest = async (user, id, action, payload = {}) => transaction(async connection => {
  const requestId = Number(id);
  if (!Number.isSafeInteger(requestId) || requestId <= 0) throw fail("Mã đơn nghỉ không hợp lệ");
  const [targets] = await connection.query("SELECT employee_id, work_date FROM leave_requests WHERE id = ?", [requestId]);
  if (!targets.length) throw fail("Không tìm thấy đơn nghỉ", 404);
  const target = targets[0];
  await lockEmployee(connection, target.employee_id);
  const [rows] = await connection.query("SELECT * FROM leave_requests WHERE id = ? FOR UPDATE", [requestId]);
  if (!rows.length) throw fail("Không tìm thấy đơn nghỉ", 404);
  const request = rows[0];
  if (request.status !== "PENDING") throw fail("Đơn nghỉ đã được xử lý", 409);
  const workDate = String(request.work_date).slice(0, 10);
  if (action === "cancel") {
    if (Number(user?.employee_id) !== Number(request.employee_id)) throw fail("Chỉ được hủy đơn của chính mình", 403);
    await assertOpen(connection, request.employee_id, workDate);
    await connection.query("DELETE FROM leave_requests WHERE id = ?", [requestId]);
  } else {
    await assertCanApprove(connection, user, request.employee_id);
    await assertOpen(connection, request.employee_id, workDate);
    const rejection = String(payload.reject_reason || payload.reason || "").trim();
    if (action === "reject" && !rejection) throw fail("Vui lòng nhập lý do từ chối");
    await connection.query("UPDATE leave_requests SET status = ?, approved_by = ?, approved_at = NOW(), reason = ? WHERE id = ?", [action === "approve" ? "APPROVED" : "REJECTED", user.employee_id, action === "reject" ? `${request.reason} | Từ chối: ${rejection}`.slice(0, 255) : request.reason, requestId]);
    await recalculateDailyAttendance(connection, request.employee_id, workDate);
    await recalculateEmployeeMonth(connection, request.employee_id, workDate.slice(0, 7));
  }
  await recalculateLeaveBalance(connection, request.employee_id, Number(workDate.slice(0, 4)));
  return { id: requestId, status: action === "cancel" ? "CANCELLED" : action === "approve" ? "APPROVED" : "REJECTED" };
});
