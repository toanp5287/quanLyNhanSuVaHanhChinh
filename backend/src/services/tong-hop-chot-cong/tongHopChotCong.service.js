import { db } from "../../config/database.js";
import { buildEmployeeScope } from "../../utils/helper.js";

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const validateMonth = (value) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ""))) throw fail("Kỳ công không hợp lệ (YYYY-MM)");
  return value;
};
const standardDays = (month) => {
  const [year, number] = month.split("-").map(Number);
  let days = 0;
  for (let day = 1; day <= new Date(year, number, 0).getDate(); day++) {
    if (![0, 6].includes(new Date(year, number - 1, day).getDay())) days++;
  }
  return days;
};

export const recalculateEmployeeMonth = async (connection, employeeId, month) => {
  validateMonth(month);
  const [existing] = await connection.query("SELECT status FROM monthly_timesheets WHERE employee_id = ? AND month_year = ? FOR UPDATE", [employeeId, month]);
  if (existing[0]?.status === "LOCKED") throw fail("Bảng công tháng này đã khóa", 409);
  const [logs] = await connection.query(`SELECT DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date, work_unit, source, late_minutes
    FROM attendance_logs WHERE employee_id = ? AND work_date >= CONCAT(?, '-01') AND work_date <= LAST_DAY(CONCAT(?, '-01'))`, [employeeId, month, month]);
  const [leaves] = await connection.query(`SELECT DATE_FORMAT(from_date, '%Y-%m-%d') AS from_date,
    DATE_FORMAT(to_date, '%Y-%m-%d') AS to_date, total_days, is_paid FROM leave_requests
    WHERE employee_id = ? AND status = 'APPROVED' AND DATE(from_date) <= LAST_DAY(CONCAT(?, '-01')) AND DATE(to_date) >= CONCAT(?, '-01')`, [employeeId, month, month]);
  // Allocate partial leave proportionally across weekdays; count only the days in this month.
  const leaveDays = new Map();
  for (const leave of leaves) {
    const dates = [];
    for (let day = new Date(`${leave.from_date}T00:00:00Z`); day <= new Date(`${leave.to_date}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) {
      if (![0, 6].includes(day.getUTCDay())) dates.push(day.toISOString().slice(0, 10));
    }
    const unit = dates.length ? Math.min(1, Number(leave.total_days) / dates.length) : 0;
    for (const date of dates.filter(date => date.startsWith(month))) {
      const entry = leaveDays.get(date) || { paid: 0, unpaid: 0 };
      if (Number(leave.is_paid)) entry.paid = Math.min(1, entry.paid + unit);
      else entry.unpaid = Math.min(1, entry.unpaid + unit);
      leaveDays.set(date, entry);
    }
  }
  let actual = 0, paid = 0, unpaid = 0, lateCount = 0, lateMinutes = 0;
  for (const log of logs) {
    if (log.source !== "LEAVE_SYNC") actual += Number(log.work_unit || 0);
    if (Number(log.late_minutes) > 0) lateCount++;
    lateMinutes += Number(log.late_minutes || 0);
  }
  for (const [date, leave] of leaveDays) {
    const work = logs.find(log => log.work_date === date && log.source !== "LEAVE_SYNC");
    const available = Math.max(0, 1 - Number(work?.work_unit || 0));
    const paidUnit = Math.min(available, leave.paid);
    paid += paidUnit;
    unpaid += Math.min(available - paidUnit, leave.unpaid);
  }
  const [overtime] = await connection.query(`SELECT ot_type, COALESCE(SUM(ot_hours), 0) AS hours FROM overtime_requests
    WHERE employee_id = ? AND status = 'APPROVED' AND ot_date >= CONCAT(?, '-01') AND ot_date <= LAST_DAY(CONCAT(?, '-01')) GROUP BY ot_type`, [employeeId, month, month]);
  const ot = Object.fromEntries(overtime.map(row => [row.ot_type, Number(row.hours)]));
  await connection.query(`INSERT INTO monthly_timesheets
    (employee_id, month_year, standard_days, actual_work_days, paid_leave_days, unpaid_leave_days, total_payable_days,
     late_count, total_late_minutes, ot_hours_150, ot_hours_200, ot_hours_300, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')
    ON DUPLICATE KEY UPDATE standard_days = VALUES(standard_days), actual_work_days = VALUES(actual_work_days),
      paid_leave_days = VALUES(paid_leave_days), unpaid_leave_days = VALUES(unpaid_leave_days), total_payable_days = VALUES(total_payable_days),
      late_count = VALUES(late_count), total_late_minutes = VALUES(total_late_minutes), ot_hours_150 = VALUES(ot_hours_150),
      ot_hours_200 = VALUES(ot_hours_200), ot_hours_300 = VALUES(ot_hours_300)`,
  [employeeId, month, standardDays(month), actual, paid, unpaid, actual + paid, lateCount, lateMinutes,
    ot.WEEKDAY_150 || 0, ot.WEEKEND_200 || 0, ot.HOLIDAY_300 || 0]);
};

export const listMonthlyTimesheets = async (month, user) => {
  validateMonth(month);
  const scope = buildEmployeeScope(user);
  const [rows] = await db.query(`SELECT e.id AS employee_id, e.employee_code, e.full_name, e.department_id,
    COALESCE(d.department_name, d.name) AS department_name,
    mt.id, mt.standard_days, mt.actual_work_days, mt.paid_leave_days, mt.unpaid_leave_days, mt.total_payable_days,
    mt.late_count, mt.total_late_minutes, mt.ot_hours_150, mt.ot_hours_200, mt.ot_hours_300,
    COALESCE(mt.status, 'OPEN') AS status, mt.locked_at
    FROM employees e LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN monthly_timesheets mt ON mt.employee_id = e.id AND mt.month_year = ?
    ${scope.clause || "WHERE 1 = 1"} AND (e.work_status = 'WORKING' OR mt.id IS NOT NULL) ORDER BY e.employee_code`, [month, ...scope.params]);
  return { month, rows, standard_days: standardDays(month) };
};

export const updateMonth = async (month, user, lock = false, departmentId = null) => {
  validateMonth(month);
  if (!user?.permissions?.includes("ATT.SHIFT_OT_MANAGE") || !["ALL", "DEPARTMENT"].includes(user.data_scope)) throw fail("Bạn không có quyền tổng hợp và chốt công", 403);
  const scope = buildEmployeeScope(user);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [employees] = await connection.query(`SELECT e.id FROM employees e ${scope.clause || "WHERE 1 = 1"}
      AND (e.work_status = 'WORKING' OR EXISTS (SELECT 1 FROM monthly_timesheets mt WHERE mt.employee_id = e.id AND mt.month_year = ?))
      ${departmentId ? "AND e.department_id = ?" : ""} ORDER BY e.id FOR UPDATE`, [...scope.params, month, ...(departmentId ? [departmentId] : [])]);
    let count = 0;
    for (const employee of employees) {
      const [current] = await connection.query("SELECT status FROM monthly_timesheets WHERE employee_id = ? AND month_year = ? FOR UPDATE", [employee.id, month]);
      if (current[0]?.status === "LOCKED") continue;
      await recalculateEmployeeMonth(connection, employee.id, month);
      if (lock) await connection.query("UPDATE monthly_timesheets SET status = 'LOCKED', locked_by = ?, locked_at = NOW() WHERE employee_id = ? AND month_year = ?", [user.user_id, employee.id, month]);
      count++;
    }
    await connection.commit();
    return { count };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
};
