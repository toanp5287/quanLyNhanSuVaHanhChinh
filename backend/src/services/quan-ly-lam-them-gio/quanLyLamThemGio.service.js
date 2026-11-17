import { db } from "../../config/database.js";
import { assertCanApprove, buildEmployeeScope } from "../../utils/helper.js";

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const OT_TYPES = {
  WEEKDAY_150: 1.5,
  WEEKEND_200: 2.0,
  HOLIDAY_300: 3.0,
};

const parseDate = (value) => {
  const text = String(value ?? "").trim();
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!DATE_PATTERN.test(text) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    return null;
  }
  return text;
};

const parseTime = (value) => {
  const text = String(value ?? "").trim();
  if (!TIME_PATTERN.test(text)) return null;
  return text.length === 5 ? `${text}:00` : text;
};

const timeToMinutes = (value) => {
  const [hour, minute] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
};

const monthOf = (date) => date.slice(0, 7);

const assertMonthOpen = async (connection, employeeId, date) => {
  const [rows] = await connection.query(
    "SELECT status FROM monthly_timesheets WHERE employee_id = ? AND month_year = ? FOR UPDATE",
    [employeeId, monthOf(date)],
  );
  if (rows[0]?.status === "LOCKED") throw fail("Bảng công tháng này đã khóa, không thể thay đổi OT", 409);
};

const recalcMonth = async (connection, employeeId, month) => {
  const { recalculateEmployeeMonth } = await import("../tong-hop-chot-cong/tongHopChotCong.service.js");
  await recalculateEmployeeMonth(connection, employeeId, month);
};

const generateOvertimeCode = (date, employeeId) => {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `OT${date.replace(/-/g, "")}-${employeeId}-${Date.now().toString(36).toUpperCase()}${suffix}`;
};

const assertEmployeeVisible = async (connection, user, employeeId) => {
  if (Number(employeeId) === Number(user?.employee_id)) return;
  const scope = buildEmployeeScope(user);
  const [rows] = await connection.query(
    `SELECT e.id FROM employees e ${scope.clause || "WHERE 1 = 1"} AND e.id = ? LIMIT 1`,
    [...scope.params, employeeId],
  );
  if (!rows.length) throw fail("Nhân viên ngoài phạm vi quản lý", 403);
};

export const listOvertimeRequests = async (user, filters = {}) => {
  const scope = buildEmployeeScope(user);
  const conditions = [scope.clause ? scope.clause.replace(/^WHERE\s+/i, "") : "1 = 1"];
  const params = [...scope.params];

  if (filters.month) {
    if (!MONTH_PATTERN.test(String(filters.month))) throw fail("Kỳ OT không hợp lệ (YYYY-MM)");
    conditions.push("DATE_FORMAT(o.ot_date, '%Y-%m') = ?");
    params.push(filters.month);
  }
  if (filters.status) {
    const status = String(filters.status).toUpperCase();
    if (!["PENDING", "APPROVED", "REJECTED"].includes(status)) throw fail("Trạng thái OT không hợp lệ");
    conditions.push("o.status = ?");
    params.push(status);
  }
  if (filters.employee_id) {
    conditions.push("o.employee_id = ?");
    params.push(Number(filters.employee_id));
  }

  const [rows] = await db.query(
    `SELECT o.id, o.ot_code, o.employee_id, e.employee_code, e.full_name,
            e.department_id, COALESCE(d.department_name, d.name) AS department_name,
            DATE_FORMAT(o.ot_date, '%Y-%m-%d') AS ot_date, o.start_time, o.end_time,
            o.ot_hours, o.ot_type, o.multiplier, o.reason, o.status,
            o.approved_by, o.approved_at, o.reject_reason, o.created_at,
            COALESCE(mt.status, 'OPEN') AS month_status
       FROM overtime_requests o
       INNER JOIN employees e ON e.id = o.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN monthly_timesheets mt ON mt.employee_id = o.employee_id
            AND mt.month_year = DATE_FORMAT(o.ot_date, '%Y-%m')
      WHERE ${conditions.join(" AND ")}
      ORDER BY o.ot_date DESC, o.id DESC`,
    params,
  );

  return rows;
};

export const getMyOvertimeRequests = async (user, filters = {}) => {
  if (!user?.employee_id) throw fail("Tài khoản chưa liên kết hồ sơ nhân sự", 404);
  return listOvertimeRequests(user, { ...filters, employee_id: user.employee_id });
};

export const createOvertimeRequest = async (user, payload = {}) => {
  if (!user?.employee_id) throw fail("Tài khoản chưa liên kết hồ sơ nhân sự", 404);
  const employeeId = Number(payload.employee_id || user.employee_id);
  if (!Number.isSafeInteger(employeeId) || employeeId <= 0) throw fail("Nhân viên đăng ký OT không hợp lệ");

  const otDate = parseDate(payload.ot_date || payload.date);
  if (!otDate) throw fail("Ngày làm OT không hợp lệ (YYYY-MM-DD)");
  const startTime = parseTime(payload.start_time);
  const endTime = parseTime(payload.end_time);
  if (!startTime || !endTime) throw fail("Giờ bắt đầu và kết thúc OT phải đúng định dạng HH:MM");
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) throw fail("Giờ kết thúc OT phải lớn hơn giờ bắt đầu");

  const overtimeMinutes = timeToMinutes(endTime) - timeToMinutes(startTime);
  if (overtimeMinutes <= 0 || overtimeMinutes > 16 * 60) throw fail("Thời lượng OT phải trong khoảng 0-16 giờ");
  const otHours = Math.round((overtimeMinutes / 60) * 100) / 100;

  let otType = payload.ot_type ? String(payload.ot_type).toUpperCase() : null;
  if (!otType) {
    const day = new Date(`${otDate}T00:00:00Z`).getUTCDay();
    otType = day === 0 || day === 6 ? "WEEKEND_200" : "WEEKDAY_150";
  }
  if (!OT_TYPES[otType]) throw fail("Loại OT không hợp lệ (WEEKDAY_150, WEEKEND_200, HOLIDAY_300)");
  const multiplier = OT_TYPES[otType];

  const reason = String(payload.reason ?? "").trim();
  if (!reason) throw fail("Vui lòng nhập lý do làm thêm giờ");
  if (reason.length > 500) throw fail("Lý do OT không được vượt quá 500 ký tự");

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await assertEmployeeVisible(connection, user, employeeId);
    const [employees] = await connection.query("SELECT id FROM employees WHERE id = ? FOR UPDATE", [employeeId]);
    if (!employees.length) throw fail("Không tìm thấy nhân viên", 404);
    await assertMonthOpen(connection, employeeId, otDate);

    const [overlap] = await connection.query(
      `SELECT id FROM overtime_requests
        WHERE employee_id = ? AND ot_date = ? AND status IN ('PENDING', 'APPROVED')
          AND start_time < ? AND end_time > ?
        LIMIT 1`,
      [employeeId, otDate, endTime, startTime],
    );
    if (overlap.length) throw fail("Đã có đơn OT trùng khung giờ này", 409);

    const otCode = generateOvertimeCode(otDate, employeeId);
    const [result] = await connection.query(
      `INSERT INTO overtime_requests
        (ot_code, employee_id, ot_date, start_time, end_time, ot_hours, ot_type, multiplier,
         reason, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NOW())`,
      [otCode, employeeId, otDate, startTime, endTime, otHours, otType, multiplier, reason],
    );
    await connection.commit();
    return { id: result.insertId, ot_code: otCode, employee_id: employeeId, ot_hours: otHours, ot_type: otType, status: "PENDING" };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const loadOvertime = async (connection, id) => {
  const overtimeId = Number(id);
  if (!Number.isSafeInteger(overtimeId) || overtimeId <= 0) throw fail("Đơn OT không hợp lệ");
  const [rows] = await connection.query(
    `SELECT o.*, DATE_FORMAT(o.ot_date, '%Y-%m-%d') AS ot_date_str
       FROM overtime_requests o
      WHERE o.id = ?
      FOR UPDATE`,
    [overtimeId],
  );
  if (!rows.length) throw fail("Không tìm thấy đơn OT", 404);
  return rows[0];
};

export const approveOvertimeRequest = async (user, id, payload = {}) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const overtime = await loadOvertime(connection, id);
    if (overtime.status !== "PENDING") throw fail("Đơn OT đã được xử lý trước đó", 409);
    await assertCanApprove(connection, user, overtime.employee_id);
    await assertMonthOpen(connection, overtime.employee_id, overtime.ot_date_str);

    await connection.query(
      "UPDATE overtime_requests SET status = 'APPROVED', approved_by = ?, approved_at = NOW(), reject_reason = NULL WHERE id = ?",
      [Number(user.employee_id), overtime.id],
    );
    await recalcMonth(connection, overtime.employee_id, monthOf(overtime.ot_date_str));
    await connection.commit();
    return { id: overtime.id, status: "APPROVED" };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const rejectOvertimeRequest = async (user, id, payload = {}) => {
  const rejectReason = String(payload.reject_reason ?? payload.reason ?? "").trim();
  if (!rejectReason) throw fail("Vui lòng nhập lý do từ chối OT");
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const overtime = await loadOvertime(connection, id);
    if (overtime.status !== "PENDING") throw fail("Đơn OT đã được xử lý trước đó", 409);
    await assertCanApprove(connection, user, overtime.employee_id);
    await assertMonthOpen(connection, overtime.employee_id, overtime.ot_date_str);

    await connection.query(
      "UPDATE overtime_requests SET status = 'REJECTED', approved_by = ?, approved_at = NOW(), reject_reason = ? WHERE id = ?",
      [Number(user.employee_id), rejectReason.slice(0, 255), overtime.id],
    );
    await recalcMonth(connection, overtime.employee_id, monthOf(overtime.ot_date_str));
    await connection.commit();
    return { id: overtime.id, status: "REJECTED", reject_reason: rejectReason };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const cancelOvertimeRequest = async (user, id) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const overtime = await loadOvertime(connection, id);
    if (Number(overtime.employee_id) !== Number(user?.employee_id)) {
      throw fail("Chỉ được hủy đơn OT của chính mình", 403);
    }
    if (overtime.status !== "PENDING") throw fail("Chỉ có thể hủy đơn OT đang chờ duyệt", 409);
    await assertMonthOpen(connection, overtime.employee_id, overtime.ot_date_str);
    await connection.query("DELETE FROM overtime_requests WHERE id = ?", [overtime.id]);
    await connection.commit();
    return { id: overtime.id };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
