import { db } from "../../config/database.js";
import { buildEmployeeScope } from "../../utils/helper.js";

export const attendanceError = (message, status = 400) => Object.assign(new Error(message), { status });
export const faceDistance = (left, right) => Math.sqrt(left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0));
export const parseFaceDescriptor = value => {
  let descriptor = value;
  if (typeof value === "string") {
    try { descriptor = JSON.parse(value); } catch { return null; }
  }
  if (!Array.isArray(descriptor) || descriptor.length !== 128 || descriptor.some(value => typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 2)) return null;
  const norm = Math.sqrt(descriptor.reduce((sum, value) => sum + value ** 2, 0));
  const simulated = Array.from({ length: 128 }, (_, index) => Number((Math.sin(index + 1) * 0.1).toFixed(6)));
  if (norm < 0.5 || norm > 2.5 || faceDistance(descriptor, simulated) < 0.01) return null;
  return descriptor;
};
export const validateFaceSamples = values => {
  if (!Array.isArray(values) || values.length < 3 || values.length > 8) throw attendanceError("Cần ít nhất 3 mẫu khuôn mặt từ camera. Vui lòng quét lại.");
  const samples = values.map(parseFaceDescriptor);
  if (samples.some(sample => !sample)) throw attendanceError("Mẫu khuôn mặt không hợp lệ hoặc là mẫu mô phỏng. Vui lòng đăng ký lại bằng camera thật.");
  if (samples.some(sample => faceDistance(sample, samples[0]) >= 0.32)) throw attendanceError("Khuôn mặt thay đổi trong lúc quét. Chỉ một người đứng trước camera và thử lại.");
  return samples;
};

export const identifyFace = (samples, employees) => {
  const candidates = employees.map(employee => ({ employee, descriptor: parseFaceDescriptor(employee.face_descriptor) }))
    .filter(candidate => candidate.descriptor)
    .map(candidate => ({ ...candidate, distances: samples.map(sample => faceDistance(sample, candidate.descriptor)) }))
    .map(candidate => ({ ...candidate, distance: Math.max(...candidate.distances) }))
    .sort((left, right) => left.distance - right.distance);
  const best = candidates[0];
  if (!best || best.distance >= 0.42) throw attendanceError("Không tìm thấy khuôn mặt đã đăng ký phù hợp. Vui lòng quét lại hoặc đăng ký FaceID trong hồ sơ cá nhân.", 403);
  if (candidates[1] && (candidates[1].distance < 0.50 || candidates[1].distance - best.distance < 0.08)) throw attendanceError("Mẫu khuôn mặt bị trùng hoặc chưa đủ rõ để phân biệt nhân viên. Vui lòng cập nhật lại FaceID.", 409);
  return best;
};

export const kioskAttendance = async (action, values, ip) => {
  if (!["check-in", "check-out"].includes(action)) throw attendanceError("Thao tác chấm công không hợp lệ");
  const samples = validateFaceSamples(values);
  const [employees] = await db.query(`SELECT e.id, e.employee_code, e.full_name, e.face_descriptor, d.name AS department_name
    FROM employees e LEFT JOIN departments d ON d.id = e.department_id
    WHERE e.work_status = 'WORKING' AND e.face_descriptor IS NOT NULL`);
  const match = identifyFace(samples, employees);
  const result = await recordSelfAttendance(match.employee.id, { ip, face_samples: samples,
    note: `FaceID camera; distance=${match.distance.toFixed(4)}` }, action === "check-in" ? checkInInternal : checkOutInternal);
  const errors = { ALREADY_CHECKED_IN: "Bạn đã vào ca hôm nay. Chọn Tan ca khi kết thúc làm việc.", ALREADY_CHECKED_OUT: "Bạn đã hoàn thành chấm công hôm nay.", NO_CHECK_IN: "Bạn chưa chấm công vào ca hôm nay.", NO_SHIFT: "Chưa cấu hình ca làm việc cho nhân viên." };
  if (result.error) throw attendanceError(errors[result.error] || "Không thể chấm công", 409);
  return { employee: { employee_code: match.employee.employee_code, full_name: match.employee.full_name, department_name: match.employee.department_name }, log: result.log, shift: result.shift, action };
};
export const validateDate = (value) => {
  const date = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw attendanceError("Ngày chấm công không hợp lệ");
  }
  return date;
};
export const serverDate = async (connection = db) => {
  const [rows] = await connection.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today");
  return rows[0].today;
};
export const assertMonthOpen = async (connection, employeeId, date) => {
  const [rows] = await connection.query("SELECT status FROM monthly_timesheets WHERE employee_id = ? AND month_year = ? FOR UPDATE", [employeeId, date.slice(0, 7)]);
  if (rows[0]?.status === "LOCKED") throw attendanceError("Bảng công tháng này đã khóa", 409);
};

const DAY_CODES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const getDayCode = (date = new Date()) => DAY_CODES[date.getDay()];

const getTodayShift = async (employeeId, connection = db) => {
  const dateStr = await serverDate(connection);
  const dayCode = DAY_CODES[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];

  const [rows] = await connection.query(
    `SELECT es.shift_id, es.work_days, ws.shift_code, ws.name, ws.start_time, ws.end_time, ws.break_minutes, ws.grace_minutes, ws.standard_work_units
     FROM employee_shifts es
     INNER JOIN work_shifts ws ON ws.id = es.shift_id
     WHERE es.employee_id = ?
       AND es.effective_from <= ?
       AND (es.effective_to IS NULL OR es.effective_to >= ?)
       AND ws.is_active = 1
     ORDER BY es.effective_from DESC
     LIMIT 5`,
    [employeeId, dateStr, dateStr],
  );

  const match = rows.find((row) =>
    String(row.work_days || "").split(",").map((x) => x.trim()).includes(dayCode),
  );

  if (match) return match;

  const [defaults] = await connection.query(
    `SELECT id AS shift_id, shift_code, name, start_time, end_time, break_minutes, grace_minutes, standard_work_units
     FROM work_shifts
      WHERE is_active = 1 AND shift_code = 'CA_HC'
     ORDER BY id
     LIMIT 1`,
  );
  return defaults[0] || null;
};

const getTodayLog = async (employeeId, connection = db) => {
  const [rows] = await connection.query(
    `SELECT * FROM attendance_logs WHERE employee_id = ? AND work_date = CURDATE() LIMIT 1`,
    [employeeId],
  );
  return rows[0] || null;
};

const checkInInternal = async (employeeId, meta = {}, connection) => {
  if (!employeeId) return { error: "NO_EMPLOYEE" };

  const shift = await getTodayShift(employeeId, connection);
  if (!shift) return { error: "NO_SHIFT" };

  const existing = await getTodayLog(employeeId, connection);
  if (existing) {
    return { error: "ALREADY_CHECKED_IN", log: existing };
  }

  const source = meta.source || "FACE_ID";
  const confidence = meta.face_confidence ?? null;

  const [result] = await connection.query(
    `INSERT INTO attendance_logs
      (employee_id, work_date, shift_id, check_in, work_unit, source, status, late_minutes, checkin_ip, note)
     VALUES (?, CURDATE(), ?, CURTIME(), 0.50, ?, 'VALID', 0, ?, ?)`,
    [employeeId, shift.shift_id, source, meta.ip || null, meta.note || `FaceID Verified (${confidence ?? 99.6}%)`],
  );

  const [rows] = await connection.query(
    `SELECT check_in FROM attendance_logs WHERE id = ? LIMIT 1`,
    [result.insertId],
  );
  const checkInTime = rows[0]?.check_in;
  let lateMinutes = 0;
  let status = "VALID";
  if (checkInTime && shift.start_time) {
    const [sh, sm] = String(shift.start_time).split(":").map(Number);
    const [ch, cm] = String(checkInTime).split(":").map(Number);
    const shiftStart = sh * 60 + sm + (shift.grace_minutes || 0);
    const actual = ch * 60 + cm;
    if (actual > shiftStart) {
      lateMinutes = actual - (sh * 60 + sm);
      status = "LATE";
    }
  }

  await connection.query(
    `UPDATE attendance_logs SET late_minutes = ?, status = ? WHERE id = ?`,
    [lateMinutes, status, result.insertId],
  );

  const { recalculateEmployeeMonth } = await import("../tong-hop-chot-cong/tongHopChotCong.service.js");
  await recalculateEmployeeMonth(connection, employeeId, (await serverDate(connection)).slice(0, 7));

  const [finalRows] = await connection.query(
    `SELECT * FROM attendance_logs WHERE id = ? LIMIT 1`,
    [result.insertId],
  );
  return { log: finalRows[0], shift };
};

const checkOutInternal = async (employeeId, meta = {}, connection) => {
  if (!employeeId) return { error: "NO_EMPLOYEE" };

  const log = await getTodayLog(employeeId, connection);
  if (!log || !log.check_in) return { error: "NO_CHECK_IN" };
  if (log.check_out) return { error: "ALREADY_CHECKED_OUT", log };

  const [assigned] = await connection.query("SELECT id AS shift_id, start_time, end_time, break_minutes, standard_work_units FROM work_shifts WHERE id = ?", [log.shift_id]);
  const shift = assigned[0] || await getTodayShift(employeeId, connection);

  await connection.query(
    `UPDATE attendance_logs SET check_out = CURTIME() WHERE id = ?`,
    [log.id],
  );

  const [rows] = await connection.query(
    `SELECT check_in, check_out FROM attendance_logs WHERE id = ? LIMIT 1`,
    [log.id],
  );
  const checkOutTime = rows[0].check_out;

  let earlyLeave = 0;
  let workUnit = 1.0;
  if (shift && shift.end_time) {
    const [eh, em] = String(shift.end_time).split(":").map(Number);
    const [ch, cm] = String(checkOutTime).split(":").map(Number);
    const endMin = eh * 60 + em;
    const outMin = ch * 60 + cm;
    if (outMin < endMin) {
      earlyLeave = endMin - outMin;
      workUnit = 0.5;
    }
    const minute = value => String(value).split(":").slice(0, 2).reduce((sum, part, index) => sum + Number(part) * (index === 0 ? 60 : 1), 0);
    const worked = Math.max(0, outMin - minute(log.check_in) - Number(shift.break_minutes || 0));
    const required = Math.max(0, endMin - minute(shift.start_time) - Number(shift.break_minutes || 0));
    workUnit = worked >= required ? Number(shift.standard_work_units || 1) : Math.min(0.5, Number(shift.standard_work_units || 1));
  }

  await connection.query(
    `UPDATE attendance_logs SET early_leave_minutes = ?, work_unit = ? WHERE id = ?`,
    [earlyLeave, workUnit, log.id],
  );

  const { recalculateEmployeeMonth } = await import("../tong-hop-chot-cong/tongHopChotCong.service.js");
  await recalculateEmployeeMonth(connection, employeeId, (await serverDate(connection)).slice(0, 7));

  const [finalRows] = await connection.query(
    `SELECT * FROM attendance_logs WHERE id = ? LIMIT 1`,
    [log.id],
  );
  return { log: finalRows[0], shift };
};

const recordSelfAttendance = async (employeeId, meta, operation) => {
  if (!employeeId) return { error: "NO_EMPLOYEE" };
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("SELECT id FROM employees WHERE id = ? FOR UPDATE", [employeeId]);
    if (meta.face_samples) {
      const [current] = await connection.query("SELECT face_descriptor, work_status FROM employees WHERE id = ?", [employeeId]);
      const descriptor = parseFaceDescriptor(current[0]?.face_descriptor);
      if (current[0]?.work_status !== "WORKING" || !descriptor || meta.face_samples.some(sample => faceDistance(sample, descriptor) >= 0.42)) {
        throw attendanceError("FaceID đã thay đổi. Vui lòng quét lại.", 409);
      }
    }
    await assertMonthOpen(connection, employeeId, await serverDate(connection));
    const result = await operation(employeeId, meta, connection);
    await connection.commit();
    return result;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
};
export const checkIn = (employeeId, meta = {}) => recordSelfAttendance(employeeId, meta, checkInInternal);
export const checkOut = (employeeId, meta = {}) => recordSelfAttendance(employeeId, meta, checkOutInternal);

export const getTodayStatus = async (employeeId) => {
  const log = await getTodayLog(employeeId);
  const shift = await getTodayShift(employeeId);
  return { log, shift };
};

export const listAttendanceByDate = async (date, user) => {
  const targetDate = validateDate(date || await serverDate());
  const scope = buildEmployeeScope(user);

  const [rows] = await db.query(
    `SELECT e.id AS employee_id, e.employee_code, e.full_name, e.department_id, d.name AS department_name,
            al.id AS log_id, al.check_in, al.check_out, al.work_unit, al.status, al.late_minutes, al.source,
            al.early_leave_minutes, al.note, ws.shift_code, ws.start_time, ws.end_time,
            COALESCE(mt.status, 'OPEN') AS month_status,
            (SELECT MAX(lr.is_paid) FROM leave_requests lr WHERE lr.employee_id = e.id
             AND lr.status = 'APPROVED' AND ? BETWEEN DATE(lr.from_date) AND DATE(lr.to_date)) AS leave_paid
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN attendance_logs al ON al.employee_id = e.id AND al.work_date = ?
      LEFT JOIN work_shifts ws ON ws.id = al.shift_id
      LEFT JOIN monthly_timesheets mt ON mt.employee_id = e.id AND mt.month_year = ?
      ${scope.clause || "WHERE 1 = 1"} AND e.work_status = 'WORKING'
     ORDER BY e.employee_code`,
    [targetDate, targetDate, targetDate.slice(0, 7), ...scope.params],
  );

  return { date: targetDate, rows };
};

export const quickMarkAttendance = async (employeeId, date, type, user) => {
  return markEmployees([Number(employeeId)], date, type, user);
};

export const quickMarkAll = async (departmentId, date, user) => {
  const result = await listAttendanceByDate(date, user);
  const rows = result.rows.filter(row => !row.log_id && row.leave_paid == null && (!departmentId || Number(row.department_id) === Number(departmentId)));
  return markEmployees(rows.map(row => row.employee_id), result.date, "PRESENT", user, true);
};

const markEmployees = async (ids, date, type, user, skipExisting = false) => {
  if (!["MANAGER", "CB_PAYROLL", "HR_ADMIN", "SUPER_ADMIN"].includes(user?.role_id) || !["ALL", "DEPARTMENT"].includes(user?.data_scope)) {
    throw attendanceError("Không có quyền điểm danh nhân viên", 403);
  }
  if (!["PRESENT", "HALF", "ABSENT"].includes(type) || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw attendanceError("Dữ liệu điểm danh không hợp lệ");
  const today = await serverDate();
  const targetDate = validateDate(date || today);
  if (targetDate > today) throw attendanceError("Không thể điểm danh cho ngày trong tương lai");
  const connection = await db.getConnection();
  let count = 0;
  try {
    await connection.beginTransaction();
    for (const id of ids) {
      const scope = buildEmployeeScope(user);
      const [employees] = await connection.query(`SELECT e.id FROM employees e ${scope.clause || "WHERE 1 = 1"} AND e.id = ? AND e.work_status = 'WORKING' FOR UPDATE`, [...scope.params, id]);
      if (!employees.length) throw attendanceError("Nhân viên ngoài phạm vi quản lý", 403);
      await assertMonthOpen(connection, id, targetDate);
      const [existing] = await connection.query("SELECT id FROM attendance_logs WHERE employee_id = ? AND work_date = ? FOR UPDATE", [id, targetDate]);
      const [leave] = await connection.query("SELECT id FROM leave_requests WHERE employee_id = ? AND status = 'APPROVED' AND ? BETWEEN DATE(from_date) AND DATE(to_date)", [id, targetDate]);
      if (existing.length || leave.length) {
        if (skipExisting) continue;
        throw attendanceError("Nhân viên đã có chấm công hoặc đơn nghỉ được duyệt trong ngày", 409);
      }
      const [shifts] = await connection.query(`SELECT ws.* FROM employee_shifts es JOIN work_shifts ws ON ws.id = es.shift_id
        WHERE es.employee_id = ? AND es.effective_from <= ? AND (es.effective_to IS NULL OR es.effective_to >= ?)
        AND ws.is_active = 1 AND FIND_IN_SET(ELT(DAYOFWEEK(?), 'SUN','MON','TUE','WED','THU','FRI','SAT'), es.work_days)
        ORDER BY es.effective_from DESC, es.id DESC LIMIT 1`, [id, targetDate, targetDate, targetDate]);
      let shift = shifts[0];
      if (!shift) {
        const [defaults] = await connection.query("SELECT * FROM work_shifts WHERE shift_code = 'CA_HC' AND is_active = 1 LIMIT 1");
        shift = defaults[0];
      }
      if (!shift) throw attendanceError("Chưa cấu hình ca làm việc cho nhân viên");
      const units = type === "ABSENT" ? 0 : type === "HALF" ? Math.min(0.5, Number(shift.standard_work_units)) : Number(shift.standard_work_units);
      await connection.query(`INSERT INTO attendance_logs
        (employee_id, work_date, shift_id, check_in, check_out, work_unit, source, status, late_minutes, early_leave_minutes, note)
        VALUES (?, ?, ?, ?, ?, ?, 'MANUAL_ADJUST', ?, 0, 0, ?)`,
      [id, targetDate, shift.id, type === "ABSENT" ? null : shift.start_time,
        type === "ABSENT" ? null : type === "HALF" && Number(shift.standard_work_units) > 0.5
          ? (() => { const [h, m] = String(shift.start_time).split(":").map(Number); const [eh, em] = String(shift.end_time).split(":").map(Number); const middle = h * 60 + m + Math.floor((eh * 60 + em - h * 60 - m - Number(shift.break_minutes || 0)) / 2); return `${String(Math.floor(middle / 60)).padStart(2, "0")}:${String(middle % 60).padStart(2, "0")}:00`; })()
          : shift.end_time,
        units, type === "ABSENT" ? "ABSENT" : "VALID", `Điểm danh ${type} bởi ${user.user_id}`]);
      const { recalculateEmployeeMonth } = await import("../tong-hop-chot-cong/tongHopChotCong.service.js");
      await recalculateEmployeeMonth(connection, id, targetDate.slice(0, 7));
      count += 1;
    }
    await connection.commit();
    return { count };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
