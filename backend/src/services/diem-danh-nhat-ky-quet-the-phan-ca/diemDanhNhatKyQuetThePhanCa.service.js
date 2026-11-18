import { db } from "../../config/database.js";
import {
  assertCanApprove,
  buildEmployeeScope,
  cosineSimilarity,
} from "../../utils/helper.js";

export const attendanceError = (message, status = 400) =>
  Object.assign(new Error(message), { status });
export const l2Normalize = (vec) => {
  if (
    !Array.isArray(vec) ||
    !vec.length ||
    vec.length > 4096 ||
    vec.some((value) => typeof value !== "number" || !Number.isFinite(value))
  )
    throw attendanceError("Vector sinh trắc học không hợp lệ");
  const norm = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm < 1e-10)
    throw attendanceError("Vector sinh trắc học rỗng");
  return vec.map((value) => value / norm);
};
export const cosineSimilarity = (vecA, vecB) => {
  if (!vecA || !vecB || vecA.length !== vecB.length) return -1;
  const a = l2Normalize(vecA),
    b = l2Normalize(vecB);
  return Math.max(
    -1,
    Math.min(
      1,
      a.reduce((sum, value, index) => sum + value * b[index], 0),
    ),
  );
};
export const computeCentroid = (embeddings) => {
  if (!Array.isArray(embeddings) || !embeddings.length)
    throw attendanceError("Không có mẫu khuôn mặt");
  const normalized = embeddings.map(l2Normalize);
  if (normalized.some((vector) => vector.length !== normalized[0].length))
    throw attendanceError("Các mẫu không cùng mô hình nhận diện");
  return l2Normalize(
    normalized[0].map(
      (_, index) =>
        normalized.reduce((sum, vector) => sum + vector[index], 0) /
        normalized.length,
    ),
  );
};
export const verifyInternalConsistency = (
  embeddings,
  minInternalSim = 0.82,
) => {
  const centroid = computeCentroid(embeddings);
  const valid = embeddings.every(
    (vector) => cosineSimilarity(vector, centroid) >= minInternalSim,
  );
  return {
    valid,
    message: valid
      ? ""
      : "Khuôn mặt di chuyển quá nhanh hoặc bị nhòe khi quét, vui lòng giữ thẳng mặt và quét lại!",
  };
};
export const parseStoredFaceData = (rawJson) => {
  try {
    const raw = typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;
    const source = Array.isArray(raw)
      ? typeof raw[0] === "number"
        ? [raw]
        : raw
      : raw?.samples || (raw?.centroid ? [raw.centroid] : []);
    if (!source.length || source.length > 8) return null;
    const samples = source.map(l2Normalize);
    if (samples.some((sample) => sample.length !== samples[0].length))
      return null;
    const centroid = raw?.centroid
      ? l2Normalize(raw.centroid)
      : computeCentroid(samples);
    if (centroid.length !== samples[0].length) return null;
    return { centroid, samples };
  } catch {
    return null;
  }
};
export const evaluateFullSetMatch = (
  liveEmbeddings,
  storedFaceJson,
  threshold = 0.76,
) => {
  const stored = parseStoredFaceData(storedFaceJson);
  const empty = {
    isMatch: false,
    avgScore: 0,
    centroidScore: 0,
    passCount: 0,
    totalSamples: liveEmbeddings.length,
  };
  if (
    !stored ||
    !liveEmbeddings.length ||
    liveEmbeddings.some((vector) => vector.length !== stored.centroid.length)
  )
    return empty;
  const scores = liveEmbeddings.map((vector) =>
    Math.max(
      cosineSimilarity(vector, stored.centroid),
      ...stored.samples.map((sample) => cosineSimilarity(vector, sample)),
    ),
  );
  const centroidScore = cosineSimilarity(
    computeCentroid(liveEmbeddings),
    stored.centroid,
  );
  const avgScore =
    (scores.reduce((sum, score) => sum + score, 0) / scores.length) * 0.5 +
    centroidScore * 0.5;
  const passCount = scores.filter((score) => score >= threshold - 0.02).length;
  return {
    isMatch: avgScore >= threshold && passCount >= 4,
    avgScore,
    centroidScore,
    passCount,
    totalSamples: liveEmbeddings.length,
  };
};
export const validateBiometricCapture = (
  embeddings,
  blinkVerified,
  minInternalSim = 0.8,
) => {
  if (blinkVerified !== true)
    throw attendanceError(
      "Vui lòng CHỚP MẮT trước khi quét khuôn mặt chấm công!",
      400,
    );
  if (!Array.isArray(embeddings) || embeddings.length !== 5)
    throw attendanceError("Cần đúng 5 mẫu khuôn mặt để xác thực", 400);
  if (embeddings.some((vector) => !Array.isArray(vector) || vector.length < 64))
    throw attendanceError("Mẫu sinh trắc học không hợp lệ", 400);
  const samples = embeddings.map(l2Normalize);
  const consistency = verifyInternalConsistency(samples, minInternalSim);
  if (!consistency.valid) throw attendanceError(consistency.message, 400);
  return samples;
};
export const faceDistance = (left, right) =>
  Math.sqrt(
    left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0),
  );
export const parseFaceDescriptor = (value) => {
  let descriptor = value;
  if (typeof value === "string") {
    try {
      descriptor = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (
    !Array.isArray(descriptor) ||
    descriptor.length !== 128 ||
    descriptor.some(
      (value) =>
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        Math.abs(value) > 2,
    )
  )
    return null;
  const norm = Math.sqrt(
    descriptor.reduce((sum, value) => sum + value ** 2, 0),
  );
  const simulated = Array.from({ length: 128 }, (_, index) =>
    Number((Math.sin(index + 1) * 0.1).toFixed(6)),
  );
  if (norm < 0.5 || norm > 2.5 || faceDistance(descriptor, simulated) < 0.01)
    return null;
  return descriptor;
};
export const validateFaceSamples = (values) => {
  if (!Array.isArray(values) || values.length < 3 || values.length > 8)
    throw attendanceError(
      "Cần ít nhất 3 mẫu khuôn mặt từ camera. Vui lòng quét lại.",
    );
  const samples = values.map(parseFaceDescriptor);
  if (samples.some((sample) => !sample))
    throw attendanceError(
      "Mẫu khuôn mặt không hợp lệ hoặc là mẫu mô phỏng. Vui lòng đăng ký lại bằng camera thật.",
    );
  if (samples.some((sample) => faceDistance(sample, samples[0]) >= 0.32))
    throw attendanceError(
      "Khuôn mặt thay đổi trong lúc quét. Chỉ một người đứng trước camera và thử lại.",
    );
  return samples;
};

export const findFaceEnrollmentConflict = (samples, employees, employeeId) => {
  return (
    employees
      .filter((employee) => Number(employee.id) !== Number(employeeId))
      .map((employee) => ({
        employee,
        descriptor: parseFaceDescriptor(employee.face_descriptor),
      }))
      .filter((candidate) => candidate.descriptor)
      .map((candidate) => ({
        employee: candidate.employee,
        distance: Math.max(
          ...samples.map((sample) =>
            faceDistance(sample, candidate.descriptor),
          ),
        ),
      }))
      .filter((candidate) => candidate.distance < 0.42)
      .sort((left, right) => left.distance - right.distance)[0] || null
  );
};

export const identifyFace = (samples, employees) => {
  const candidates = employees
    .map((employee) => ({
      employee,
      ...evaluateFullSetMatch(samples, employee.face_descriptor),
    }))
    .sort((left, right) => right.avgScore - left.avgScore);
  const best = candidates[0];
  if (!best?.isMatch)
    throw attendanceError(
      "Không tìm thấy khuôn mặt đã đăng ký phù hợp. Vui lòng đăng ký lại FaceID bằng Human nếu mẫu cũ dùng mô hình khác.",
      403,
    );
  if (candidates[1]?.isMatch && best.avgScore - candidates[1].avgScore <= 0.02)
    throw attendanceError(
      "Bộ mẫu khớp với nhiều hồ sơ và chưa đủ rõ để phân biệt. Vui lòng cập nhật lại FaceID.",
      409,
    );
  return best;
};

export const kioskAttendance = async (action, values, ip, blinkVerified) => {
  if (!["check-in", "check-out"].includes(action))
    throw attendanceError("Thao tác chấm công không hợp lệ");
  const samples = validateBiometricCapture(values, blinkVerified);
  const [employees] =
    await db.query(`SELECT e.id, e.employee_code, e.full_name, e.face_descriptor, d.name AS department_name
    FROM employees e LEFT JOIN departments d ON d.id = e.department_id
    WHERE e.work_status = 'WORKING' AND e.face_descriptor IS NOT NULL`);
  const match = identifyFace(samples, employees);
  const result = await recordSelfAttendance(
    match.employee.id,
    {
      ip,
      embeddings: samples,
      blink_verified: blinkVerified,
      note: `Human FaceID; similarity=${(match.avgScore * 100).toFixed(1)}%; samples=${match.passCount}/5`,
    },
    action === "check-in" ? checkInInternal : checkOutInternal,
  );
  const errors = {
    ALREADY_CHECKED_IN:
      "Bạn đã vào ca hôm nay. Chọn Tan ca khi kết thúc làm việc.",
    ALREADY_CHECKED_OUT: "Bạn đã hoàn thành chấm công hôm nay.",
    NO_CHECK_IN: "Bạn chưa chấm công vào ca hôm nay.",
    NO_SHIFT: "Chưa cấu hình ca làm việc cho nhân viên.",
  };
  if (result.error)
    throw attendanceError(errors[result.error] || "Không thể chấm công", 409);
  return {
    employee: {
      employee_code: match.employee.employee_code,
      full_name: match.employee.full_name,
      department_name: match.employee.department_name,
    },
    log: result.log,
    shift: result.shift,
    action,
  };
};
export const validateDate = (value) => {
  const date = String(value || "");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  ) {
    throw attendanceError("Ngày chấm công không hợp lệ");
  }
  return date;
};
export const serverDate = async (connection = db) => {
  const [rows] = await connection.query(
    "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today",
  );
  return rows[0].today;
};
export const assertMonthOpen = async (connection, employeeId, date) => {
  const [rows] = await connection.query(
    "SELECT status FROM monthly_timesheets WHERE employee_id = ? AND month_year = ? FOR UPDATE",
    [employeeId, date.slice(0, 7)],
  );
  if (rows[0]?.status === "LOCKED")
    throw attendanceError("Bảng công tháng này đã khóa", 409);
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
    String(row.work_days || "")
      .split(",")
      .map((x) => x.trim())
      .includes(dayCode),
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
    [
      employeeId,
      shift.shift_id,
      source,
      meta.ip || null,
      meta.note || `FaceID Verified (${confidence ?? 99.6}%)`,
    ],
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

  const { recalculateEmployeeMonth } =
    await import("../tong-hop-chot-cong/tongHopChotCong.service.js");
  await recalculateEmployeeMonth(
    connection,
    employeeId,
    (await serverDate(connection)).slice(0, 7),
  );

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

  const [assigned] = await connection.query(
    "SELECT id AS shift_id, start_time, end_time, break_minutes, standard_work_units FROM work_shifts WHERE id = ?",
    [log.shift_id],
  );
  const shift = assigned[0] || (await getTodayShift(employeeId, connection));

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
    const minute = (value) =>
      String(value)
        .split(":")
        .slice(0, 2)
        .reduce(
          (sum, part, index) => sum + Number(part) * (index === 0 ? 60 : 1),
          0,
        );
    const worked = Math.max(
      0,
      outMin - minute(log.check_in) - Number(shift.break_minutes || 0),
    );
    const required = Math.max(
      0,
      endMin - minute(shift.start_time) - Number(shift.break_minutes || 0),
    );
    workUnit =
      worked >= required
        ? Number(shift.standard_work_units || 1)
        : Math.min(0.5, Number(shift.standard_work_units || 1));
  }

  await connection.query(
    `UPDATE attendance_logs SET early_leave_minutes = ?, work_unit = ? WHERE id = ?`,
    [earlyLeave, workUnit, log.id],
  );

  const { recalculateEmployeeMonth } =
    await import("../tong-hop-chot-cong/tongHopChotCong.service.js");
  await recalculateEmployeeMonth(
    connection,
    employeeId,
    (await serverDate(connection)).slice(0, 7),
  );

  const [finalRows] = await connection.query(
    `SELECT * FROM attendance_logs WHERE id = ? LIMIT 1`,
    [log.id],
  );
  return { log: finalRows[0], shift };
};

const recordSelfAttendance = async (employeeId, meta, operation) => {
  if (!employeeId) return { error: "NO_EMPLOYEE" };
  const samples = validateBiometricCapture(
    meta.embeddings,
    meta.blink_verified,
  );
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("SELECT id FROM employees WHERE id = ? FOR UPDATE", [
      employeeId,
    ]);
    const [current] = await connection.query(
      "SELECT face_descriptor, work_status FROM employees WHERE id = ?",
      [employeeId],
    );
    if (current[0]?.work_status !== "WORKING")
      throw attendanceError("Hồ sơ nhân viên không hoạt động", 403);
    const selfMatch = evaluateFullSetMatch(samples, current[0].face_descriptor);
    const [others] = await connection.query(
      "SELECT id, employee_code, full_name, face_descriptor FROM employees WHERE id <> ? AND face_descriptor IS NOT NULL AND LENGTH(face_descriptor) > 20",
      [employeeId],
    );
    const other = others
      .map((employee) => ({
        employee,
        ...evaluateFullSetMatch(samples, employee.face_descriptor),
      }))
      .filter(
        (match) => match.isMatch && match.avgScore > selfMatch.avgScore + 0.02,
      )
      .sort((a, b) => b.avgScore - a.avgScore)[0];
    if (other)
      throw attendanceError(
        `CẢNH BÁO NHẬN DIỆN: Khuôn mặt trước Camera khớp với hồ sơ [${other.employee.employee_code} - ${other.employee.full_name}] (${(other.avgScore * 100).toFixed(1)}%), không phải tài khoản đang đăng nhập!`,
        403,
      );
    if (!selfMatch.isMatch)
      throw attendanceError(
        `Khuôn mặt không khớp với hồ sơ đăng ký! Độ khớp trung bình bộ mẫu: ${(selfMatch.avgScore * 100).toFixed(1)}% (${selfMatch.passCount}/5 mẫu đạt ngưỡng, yêu cầu >= 76% và >= 4/5 mẫu).`,
        403,
      );
    await assertMonthOpen(connection, employeeId, await serverDate(connection));
    const result = await operation(
      employeeId,
      { ...meta, source: "FACE_ID" },
      connection,
    );
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
export const checkIn = (employeeId, meta = {}) =>
  recordSelfAttendance(employeeId, meta, checkInInternal);
export const checkOut = (employeeId, meta = {}) =>
  recordSelfAttendance(employeeId, meta, checkOutInternal);

export const getTodayStatus = async (employeeId) => {
  const log = await getTodayLog(employeeId);
  const shift = await getTodayShift(employeeId);
  const [employees] = await db.query(
    `SELECT e.id, e.employee_code, e.full_name, e.manager_id, e.data_scope,
            COALESCE(d.department_name, d.name) AS department_name,
            (e.face_descriptor IS NOT NULL) AS has_face_descriptor,
            COALESCE(mt.status, 'OPEN') AS month_status
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN monthly_timesheets mt ON mt.employee_id = e.id AND mt.month_year = DATE_FORMAT(CURDATE(), '%Y-%m')
      WHERE e.id = ?
      LIMIT 1`,
    [employeeId],
  );
  return { log, shift, employee: employees[0] || null };
};

export const listAttendanceByDate = async (date, user) => {
  const targetDate = validateDate(date || (await serverDate()));
  const scope = buildEmployeeScope(user);

  const [rows] = await db.query(
    `SELECT e.id AS employee_id, e.employee_code, e.full_name, e.department_id,
            COALESCE(d.department_name, d.name) AS department_name,
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
  const rows = result.rows.filter(
    (row) =>
      !row.log_id &&
      row.leave_paid == null &&
      (!departmentId || Number(row.department_id) === Number(departmentId)),
  );
  return markEmployees(
    rows.map((row) => row.employee_id),
    result.date,
    "PRESENT",
    user,
    true,
  );
};

const markEmployees = async (ids, date, type, user, skipExisting = false) => {
  if (
    !["MANAGER", "CB_PAYROLL", "HR_ADMIN", "SUPER_ADMIN"].includes(
      user?.role_id,
    ) ||
    !["ALL", "DEPARTMENT"].includes(user?.data_scope)
  ) {
    throw attendanceError("Không có quyền điểm danh nhân viên", 403);
  }
  if (
    !["PRESENT", "HALF", "ABSENT"].includes(type) ||
    ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
  )
    throw attendanceError("Dữ liệu điểm danh không hợp lệ");
  const today = await serverDate();
  const targetDate = validateDate(date || today);
  if (targetDate > today)
    throw attendanceError("Không thể điểm danh cho ngày trong tương lai");
  const connection = await db.getConnection();
  let count = 0;
  try {
    await connection.beginTransaction();
    for (const id of ids) {
      const scope = buildEmployeeScope(user);
      const [employees] = await connection.query(
        `SELECT e.id FROM employees e ${scope.clause || "WHERE 1 = 1"} AND e.id = ? AND e.work_status = 'WORKING' FOR UPDATE`,
        [...scope.params, id],
      );
      if (!employees.length)
        throw attendanceError("Nhân viên ngoài phạm vi quản lý", 403);
      await assertMonthOpen(connection, id, targetDate);
      const [existing] = await connection.query(
        "SELECT id FROM attendance_logs WHERE employee_id = ? AND work_date = ? FOR UPDATE",
        [id, targetDate],
      );
      const [leave] = await connection.query(
        "SELECT id FROM leave_requests WHERE employee_id = ? AND status = 'APPROVED' AND ? BETWEEN DATE(from_date) AND DATE(to_date)",
        [id, targetDate],
      );
      if (existing.length || leave.length) {
        if (skipExisting) continue;
        throw attendanceError(
          "Nhân viên đã có chấm công hoặc đơn nghỉ được duyệt trong ngày",
          409,
        );
      }
      const [shifts] = await connection.query(
        `SELECT ws.* FROM employee_shifts es JOIN work_shifts ws ON ws.id = es.shift_id
        WHERE es.employee_id = ? AND es.effective_from <= ? AND (es.effective_to IS NULL OR es.effective_to >= ?)
        AND ws.is_active = 1 AND FIND_IN_SET(ELT(DAYOFWEEK(?), 'SUN','MON','TUE','WED','THU','FRI','SAT'), es.work_days)
        ORDER BY es.effective_from DESC, es.id DESC LIMIT 1`,
        [id, targetDate, targetDate, targetDate],
      );
      let shift = shifts[0];
      if (!shift) {
        const [defaults] = await connection.query(
          "SELECT * FROM work_shifts WHERE shift_code = 'CA_HC' AND is_active = 1 LIMIT 1",
        );
        shift = defaults[0];
      }
      if (!shift)
        throw attendanceError("Chưa cấu hình ca làm việc cho nhân viên");
      const units =
        type === "ABSENT"
          ? 0
          : type === "HALF"
            ? Math.min(0.5, Number(shift.standard_work_units))
            : Number(shift.standard_work_units);
      await connection.query(
        `INSERT INTO attendance_logs
        (employee_id, work_date, shift_id, check_in, check_out, work_unit, source, status, late_minutes, early_leave_minutes, note)
        VALUES (?, ?, ?, ?, ?, ?, 'MANUAL_ADJUST', ?, 0, 0, ?)`,
        [
          id,
          targetDate,
          shift.id,
          type === "ABSENT" ? null : shift.start_time,
          type === "ABSENT"
            ? null
            : type === "HALF" && Number(shift.standard_work_units) > 0.5
              ? (() => {
                  const [h, m] = String(shift.start_time)
                    .split(":")
                    .map(Number);
                  const [eh, em] = String(shift.end_time)
                    .split(":")
                    .map(Number);
                  const middle =
                    h * 60 +
                    m +
                    Math.floor(
                      (eh * 60 +
                        em -
                        h * 60 -
                        m -
                        Number(shift.break_minutes || 0)) /
                        2,
                    );
                  return `${String(Math.floor(middle / 60)).padStart(2, "0")}:${String(middle % 60).padStart(2, "0")}:00`;
                })()
              : shift.end_time,
          units,
          type === "ABSENT" ? "ABSENT" : "VALID",
          `Điểm danh ${type} bởi ${user.user_id}`,
        ],
      );
      const { recalculateEmployeeMonth } =
        await import("../tong-hop-chot-cong/tongHopChotCong.service.js");
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

// =====================================================================
// Ch?ng 2 � Danh m?c ca l�m vi?c & ph�n ca nh�n vi�n
// =====================================================================
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const SHIFT_CODE_PATTERN = /^[A-Z0-9_]{2,20}$/;
const DAY_CODE_LIST = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const normalizeTime = (value) => {
  const text = String(value ?? "").trim();
  if (!TIME_PATTERN.test(text)) return null;
  return text.length === 5 ? `${text}:00` : text;
};

const timeToMinutes = (value) => {
  const [hour, minute] = String(value || "")
    .split(":")
    .map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
};

export const validateShiftPayload = (payload = {}) => {
  const shiftCode = String(payload.shift_code ?? "")
    .trim()
    .toUpperCase();
  if (!SHIFT_CODE_PATTERN.test(shiftCode)) {
    return {
      error: "M� ca ph?i t? 2-20 k� t?, ch? g?m ch? in hoa, s? ho?c g?ch du?i",
    };
  }

  const name = String(payload.name ?? "").trim();
  if (!name) return { error: "T�n ca l�m vi?c kh�ng du?c d? tr?ng" };
  if (name.length > 100)
    return { error: "T�n ca l�m vi?c kh�ng du?c vu?t qu� 100 k� t?" };

  const startTime = normalizeTime(payload.start_time);
  const endTime = normalizeTime(payload.end_time);
  if (!startTime || !endTime)
    return { error: "Gi? b?t d?u v� gi? k?t th�c ph?i d�ng d?nh d?ng HH:MM" };
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    return { error: "Gi? k?t th�c ph?i l?n hon gi? b?t d?u trong c�ng ng�y" };
  }

  const breakMinutes = Number(payload.break_minutes ?? 0);
  if (
    !Number.isInteger(breakMinutes) ||
    breakMinutes < 0 ||
    breakMinutes > 240
  ) {
    return { error: "S? ph�t ngh? gi?a ca ph?i l� s? nguy�n t? 0 d?n 240" };
  }

  const standardWorkUnits = Number(payload.standard_work_units ?? 1);
  if (![0.5, 1].includes(standardWorkUnits)) {
    return { error: "C�ng chu?n c?a ca ch? nh?n gi� tr? 0.5 ho?c 1.0" };
  }

  const graceMinutes = Number(payload.grace_minutes ?? 15);
  if (
    !Number.isInteger(graceMinutes) ||
    graceMinutes < 0 ||
    graceMinutes > 120
  ) {
    return { error: "S? ph�t �n h?n di mu?n ph?i l� s? nguy�n t? 0 d?n 120" };
  }

  const isActive =
    payload.is_active === undefined ? 1 : Number(payload.is_active) ? 1 : 0;

  return {
    payload: {
      shift_code: shiftCode,
      name,
      start_time: startTime,
      end_time: endTime,
      break_minutes: breakMinutes,
      standard_work_units: standardWorkUnits,
      grace_minutes: graceMinutes,
      is_active: isActive,
    },
  };
};

export const listWorkShifts = async () => {
  const [rows] = await db.query(
    `SELECT id, shift_code, name, start_time, end_time, break_minutes,
            standard_work_units, grace_minutes, is_active
       FROM work_shifts
      ORDER BY is_active DESC, id ASC`,
  );
  return rows.map((row) => ({
    ...row,
    id: Number(row.id),
    break_minutes: Number(row.break_minutes || 0),
    standard_work_units: Number(row.standard_work_units || 0),
    grace_minutes: Number(row.grace_minutes || 0),
    is_active: Number(row.is_active) ? 1 : 0,
  }));
};

export const createWorkShift = async (payload) => {
  const [duplicate] = await db.query(
    "SELECT id FROM work_shifts WHERE shift_code = ? LIMIT 1",
    [payload.shift_code],
  );
  if (duplicate.length) throw attendanceError("M� ca l�m vi?c d� t?n t?i", 409);
  const [result] = await db.query(
    `INSERT INTO work_shifts
      (shift_code, name, start_time, end_time, break_minutes, standard_work_units, grace_minutes, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.shift_code,
      payload.name,
      payload.start_time,
      payload.end_time,
      payload.break_minutes,
      payload.standard_work_units,
      payload.grace_minutes,
      payload.is_active,
    ],
  );
  return { id: result.insertId };
};

export const updateWorkShift = async (shiftId, payload) => {
  const [existing] = await db.query(
    "SELECT id FROM work_shifts WHERE id = ? LIMIT 1",
    [shiftId],
  );
  if (!existing.length)
    throw attendanceError("Kh�ng t�m th?y ca l�m vi?c", 404);
  const [duplicate] = await db.query(
    "SELECT id FROM work_shifts WHERE shift_code = ? AND id <> ? LIMIT 1",
    [payload.shift_code, shiftId],
  );
  if (duplicate.length) throw attendanceError("M� ca l�m vi?c d� t?n t?i", 409);
  await db.query(
    `UPDATE work_shifts
        SET shift_code = ?, name = ?, start_time = ?, end_time = ?,
            break_minutes = ?, standard_work_units = ?, grace_minutes = ?, is_active = ?
      WHERE id = ?`,
    [
      payload.shift_code,
      payload.name,
      payload.start_time,
      payload.end_time,
      payload.break_minutes,
      payload.standard_work_units,
      payload.grace_minutes,
      payload.is_active,
      shiftId,
    ],
  );
  return { id: Number(shiftId) };
};

const parseDateOnly = (value) => {
  const text = String(value ?? "").trim();
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text
  ) {
    return null;
  }
  return text;
};

const normalizeWorkDays = (value) => {
  const list = Array.isArray(value)
    ? value
    : String(value ?? "MON,TUE,WED,THU,FRI").split(",");
  const days = [
    ...new Set(
      list.map((item) => String(item).trim().toUpperCase()).filter(Boolean),
    ),
  ];
  if (!days.length || days.some((day) => !DAY_CODE_LIST.includes(day))) {
    throw attendanceError("Ng�y l�m vi?c trong tu?n kh�ng h?p l?");
  }
  return DAY_CODE_LIST.filter((day) => days.includes(day)).join(",");
};

const assertEmployeeInScope = async (connection, user, employeeId) => {
  const scope = buildEmployeeScope(user);
  const [employees] = await connection.query(
    `SELECT e.id FROM employees e ${scope.clause || "WHERE 1 = 1"} AND e.id = ? LIMIT 1`,
    [...scope.params, employeeId],
  );
  if (!employees.length)
    throw attendanceError("Nh�n vi�n ngo�i ph?m vi qu?n l�", 403);
  return employees[0];
};

export const listShiftAssignments = async (user, filters = {}) => {
  const scope = buildEmployeeScope(user);
  const conditions = [
    scope.clause ? scope.clause.replace(/^WHERE\s+/i, "") : "1 = 1",
  ];
  const params = [...scope.params];
  if (filters.employee_id) {
    conditions.push("es.employee_id = ?");
    params.push(Number(filters.employee_id));
  }
  if (filters.shift_id) {
    conditions.push("es.shift_id = ?");
    params.push(Number(filters.shift_id));
  }
  if (filters.department_id) {
    conditions.push("e.department_id = ?");
    params.push(Number(filters.department_id));
  }
  const [rows] = await db.query(
    `SELECT es.id, es.employee_id, e.employee_code, e.full_name,
            e.department_id, COALESCE(d.department_name, d.name) AS department_name,
            es.shift_id, ws.shift_code, ws.name AS shift_name, ws.start_time, ws.end_time,
            DATE_FORMAT(es.effective_from, '%Y-%m-%d') AS effective_from,
            DATE_FORMAT(es.effective_to, '%Y-%m-%d') AS effective_to,
            es.work_days, es.note
       FROM employee_shifts es
       INNER JOIN employees e ON e.id = es.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       INNER JOIN work_shifts ws ON ws.id = es.shift_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY es.effective_from DESC, es.id DESC`,
    params,
  );
  return rows;
};

export const createShiftAssignment = async (user, payload = {}) => {
  const employeeId = Number(payload.employee_id);
  const shiftId = Number(payload.shift_id);
  if (!Number.isSafeInteger(employeeId) || employeeId <= 0)
    throw attendanceError("Nh�n vi�n ph�n ca kh�ng h?p l?");
  if (!Number.isSafeInteger(shiftId) || shiftId <= 0)
    throw attendanceError("Ca l�m vi?c kh�ng h?p l?");
  const effectiveFrom = parseDateOnly(payload.effective_from);
  if (!effectiveFrom)
    throw attendanceError("Ng�y hi?u l?c kh�ng h?p l? (YYYY-MM-DD)");
  const effectiveTo = payload.effective_to
    ? parseDateOnly(payload.effective_to)
    : null;
  if (payload.effective_to && !effectiveTo)
    throw attendanceError("Ng�y k?t th�c hi?u l?c kh�ng h?p l? (YYYY-MM-DD)");
  if (effectiveTo && effectiveTo < effectiveFrom)
    throw attendanceError("Ng�y k?t th�c ph?i l?n hon ho?c b?ng ng�y hi?u l?c");
  const workDays = normalizeWorkDays(payload.work_days);
  const note =
    String(payload.note ?? "")
      .trim()
      .slice(0, 255) || null;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await assertEmployeeInScope(connection, user, employeeId);
    const [shifts] = await connection.query(
      "SELECT id FROM work_shifts WHERE id = ? AND is_active = 1 LIMIT 1",
      [shiftId],
    );
    if (!shifts.length)
      throw attendanceError("Ca l�m vi?c kh�ng t?n t?i ho?c d� ng?ng s? d?ng");
    const [overlap] = await connection.query(
      `SELECT id FROM employee_shifts
        WHERE employee_id = ? AND effective_from <= ?
          AND (effective_to IS NULL OR effective_to >= ?)
        LIMIT 1`,
      [employeeId, effectiveTo || "9999-12-31", effectiveFrom],
    );
    if (overlap.length)
      throw attendanceError(
        "Nh�n vi�n d� c� ph�n ca tr�ng kho?ng th?i gian n�y",
        409,
      );
    const [result] = await connection.query(
      `INSERT INTO employee_shifts (employee_id, shift_id, effective_from, effective_to, work_days, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [employeeId, shiftId, effectiveFrom, effectiveTo, workDays, note],
    );
    await connection.commit();
    return { id: result.insertId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const updateShiftAssignment = async (
  user,
  assignmentId,
  payload = {},
) => {
  const id = Number(assignmentId);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw attendanceError("Ph�n ca c?n c?p nh?t kh�ng h?p l?");
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query(
      "SELECT * FROM employee_shifts WHERE id = ? FOR UPDATE",
      [id],
    );
    if (!existing.length) throw attendanceError("Kh�ng t�m th?y ph�n ca", 404);
    await assertEmployeeInScope(connection, user, existing[0].employee_id);

    const employeeId = Number(payload.employee_id ?? existing[0].employee_id);
    const shiftId = Number(payload.shift_id ?? existing[0].shift_id);
    if (!Number.isSafeInteger(employeeId) || employeeId <= 0)
      throw attendanceError("Nh�n vi�n ph�n ca kh�ng h?p l?");
    await assertEmployeeInScope(connection, user, employeeId);
    const effectiveFrom = parseDateOnly(
      payload.effective_from ?? existing[0].effective_from,
    );
    if (!effectiveFrom)
      throw attendanceError("Ng�y hi?u l?c kh�ng h?p l? (YYYY-MM-DD)");
    const rawTo = payload.effective_to ?? existing[0].effective_to;
    const effectiveTo = rawTo ? parseDateOnly(rawTo) : null;
    if (rawTo && !effectiveTo)
      throw attendanceError("Ng�y k?t th�c hi?u l?c kh�ng h?p l? (YYYY-MM-DD)");
    if (effectiveTo && effectiveTo < effectiveFrom)
      throw attendanceError(
        "Ng�y k?t th�c ph?i l?n hon ho?c b?ng ng�y hi?u l?c",
      );
    const workDays = normalizeWorkDays(
      payload.work_days ?? existing[0].work_days,
    );
    const note =
      payload.note === undefined
        ? existing[0].note
        : String(payload.note ?? "")
            .trim()
            .slice(0, 255) || null;

    const [shifts] = await connection.query(
      "SELECT id FROM work_shifts WHERE id = ? AND is_active = 1 LIMIT 1",
      [shiftId],
    );
    if (!shifts.length)
      throw attendanceError("Ca l�m vi?c kh�ng t?n t?i ho?c d� ng?ng s? d?ng");
    const [overlap] = await connection.query(
      `SELECT id FROM employee_shifts
        WHERE employee_id = ? AND id <> ? AND effective_from <= ?
          AND (effective_to IS NULL OR effective_to >= ?)
        LIMIT 1`,
      [employeeId, id, effectiveTo || "9999-12-31", effectiveFrom],
    );
    if (overlap.length)
      throw attendanceError(
        "Nh�n vi�n d� c� ph�n ca tr�ng kho?ng th?i gian n�y",
        409,
      );

    await connection.query(
      `UPDATE employee_shifts
          SET employee_id = ?, shift_id = ?, effective_from = ?, effective_to = ?, work_days = ?, note = ?
        WHERE id = ?`,
      [employeeId, shiftId, effectiveFrom, effectiveTo, workDays, note, id],
    );
    await connection.commit();
    return { id };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const deleteShiftAssignment = async (user, assignmentId) => {
  const id = Number(assignmentId);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw attendanceError("Ph�n ca c?n x�a kh�ng h?p l?");
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query(
      "SELECT * FROM employee_shifts WHERE id = ? FOR UPDATE",
      [id],
    );
    if (!existing.length) throw attendanceError("Kh�ng t�m th?y ph�n ca", 404);
    await assertEmployeeInScope(connection, user, existing[0].employee_id);
    await connection.query("DELETE FROM employee_shifts WHERE id = ?", [id]);
    await connection.commit();
    return { id };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const getDefaultShift = async (connection = db) => {
  const [rows] = await connection.query(
    `SELECT id AS shift_id, shift_code, name, start_time, end_time, break_minutes, grace_minutes, standard_work_units
       FROM work_shifts
      WHERE is_active = 1 AND shift_code = 'CA_HC'
      ORDER BY id
      LIMIT 1`,
  );
  return rows[0] || null;
};

export const getShiftForDate = async (employeeId, dateStr, connection = db) => {
  const targetDate = parseDateOnly(dateStr);
  if (!targetDate) return null;
  const dayCode = DAY_CODES[new Date(`${targetDate}T00:00:00Z`).getUTCDay()];
  const [rows] = await connection.query(
    `SELECT es.shift_id, es.work_days, ws.shift_code, ws.name, ws.start_time, ws.end_time,
            ws.break_minutes, ws.grace_minutes, ws.standard_work_units
       FROM employee_shifts es
       INNER JOIN work_shifts ws ON ws.id = es.shift_id
      WHERE es.employee_id = ?
        AND es.effective_from <= ?
        AND (es.effective_to IS NULL OR es.effective_to >= ?)
        AND ws.is_active = 1
      ORDER BY es.effective_from DESC, es.id DESC
      LIMIT 5`,
    [employeeId, targetDate, targetDate],
  );
  const match = rows.find((row) =>
    String(row.work_days || "")
      .split(",")
      .map((x) => x.trim())
      .includes(dayCode),
  );
  return match || getDefaultShift(connection);
};

// =====================================================================
// Ch?ng 2 � Gi?i tr�nh c�ng (luu tr�n attendance_logs, kh�ng c?n b?ng m?i)
// =====================================================================
const EXPLANATION_PREFIX = "[EXPLAIN_JSON]";

export const parseExplanationNote = (note) => {
  const text = String(note || "");
  if (!text.startsWith(EXPLANATION_PREFIX)) return null;
  try {
    const data = JSON.parse(text.slice(EXPLANATION_PREFIX.length));
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
};

const buildExplanationNote = (data) =>
  `${EXPLANATION_PREFIX}${JSON.stringify(data)}`;

const computeLateMinutes = (checkIn, shift) => {
  if (!checkIn || !shift?.start_time) return 0;
  const start = timeToMinutes(shift.start_time);
  const actual = timeToMinutes(checkIn);
  if (start === null || actual === null) return 0;
  const allowed = start + Number(shift.grace_minutes || 0);
  return actual > allowed ? actual - start : 0;
};

export const submitExplanation = async (user, payload = {}) => {
  const employeeId = user?.employee_id;
  if (!employeeId)
    throw attendanceError("T�i kho?n chua li�n k?t h? so nh�n s?", 404);
  const workDate = validateDate(payload.work_date || payload.date);
  const reason = String(payload.reason ?? "").trim();
  if (!reason) throw attendanceError("Vui l�ng nh?p l� do gi?i tr�nh");
  if (reason.length > 500)
    throw attendanceError("L� do gi?i tr�nh kh�ng du?c vu?t qu� 500 k� t?");
  const checkIn = payload.check_in ? normalizeTime(payload.check_in) : null;
  const checkOut = payload.check_out ? normalizeTime(payload.check_out) : null;
  if (payload.check_in && !checkIn)
    throw attendanceError("Gi? v�o gi?i tr�nh kh�ng h?p l? (HH:MM)");
  if (payload.check_out && !checkOut)
    throw attendanceError("Gi? ra gi?i tr�nh kh�ng h?p l? (HH:MM)");
  if (
    checkIn &&
    checkOut &&
    timeToMinutes(checkOut) <= timeToMinutes(checkIn)
  ) {
    throw attendanceError("Gi? ra ph?i l?n hon gi? v�o");
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const today = await serverDate(connection);
    await connection.query("SELECT id FROM employees WHERE id = ? FOR UPDATE", [
      employeeId,
    ]);
    if (workDate > today)
      throw attendanceError("Kh�ng th? gi?i tr�nh cho ng�y trong tuong lai");
    await assertMonthOpen(connection, employeeId, workDate);
    const shift = await getShiftForDate(employeeId, workDate, connection);

    const [logs] = await connection.query(
      "SELECT * FROM attendance_logs WHERE employee_id = ? AND work_date = ? FOR UPDATE",
      [employeeId, workDate],
    );
    let log = logs[0] || null;
    const noteData = {
      reason,
      status: "PENDING",
      check_in: checkIn || log?.check_in || null,
      check_out: checkOut || log?.check_out || null,
      submitted_by: Number(user.employee_id),
      submitted_at: new Date().toISOString(),
      approved_by: null,
      approved_at: null,
      reject_reason: null,
      original: log
        ? {
            check_in: log.check_in,
            check_out: log.check_out,
            late_minutes: log.late_minutes,
            early_leave_minutes: log.early_leave_minutes,
            work_unit: log.work_unit,
            source: log.source,
            status: log.status,
          }
        : null,
    };

    if (!log) {
      if (!shift)
        throw attendanceError("Chua c?u h�nh ca l�m vi?c cho nh�n vi�n");
      const [result] = await connection.query(
        `INSERT INTO attendance_logs
          (employee_id, work_date, shift_id, check_in, check_out, late_minutes, early_leave_minutes,
           work_unit, source, status, note)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, 'MANUAL_ADJUST', 'EXPLAINED', ?)`,
        [
          employeeId,
          workDate,
          shift.shift_id,
          null,
          null,
          0,
          buildExplanationNote(noteData),
        ],
      );
      const [created] = await connection.query(
        "SELECT * FROM attendance_logs WHERE id = ?",
        [result.insertId],
      );
      log = created[0];
    } else {
      const existingExplanation = parseExplanationNote(log.note);
      if (existingExplanation?.status === "PENDING") {
        throw attendanceError(
          "�� c� gi?i tr�nh dang ch? duy?t cho ng�y n�y",
          409,
        );
      }
      if (existingExplanation?.status === "APPROVED") {
        throw attendanceError("Gi?i tr�nh ng�y n�y d� du?c duy?t", 409);
      }
      await connection.query(
        `UPDATE attendance_logs
            SET note = ?
          WHERE id = ?`,
        [buildExplanationNote(noteData), log.id],
      );
      const [updated] = await connection.query(
        "SELECT * FROM attendance_logs WHERE id = ?",
        [log.id],
      );
      log = updated[0];
    }

    await connection.commit();
    return { log, explanation: noteData };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const listExplanations = async (user, filters = {}) => {
  const scope = buildEmployeeScope(user);
  const conditions = ["al.note LIKE '[EXPLAIN_JSON]%'"];
  const params = [];
  if (scope.clause) conditions.push(scope.clause.replace(/^WHERE\s+/i, ""));
  params.push(...scope.params);
  if (filters.employee_id) {
    conditions.push("al.employee_id = ?");
    params.push(Number(filters.employee_id));
  }
  if (filters.month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(filters.month)))
      throw attendanceError("K? gi?i tr�nh kh�ng h?p l? (YYYY-MM)");
    conditions.push("DATE_FORMAT(al.work_date, '%Y-%m') = ?");
    params.push(filters.month);
  }

  const [rows] = await db.query(
    `SELECT al.id, al.employee_id, e.employee_code, e.full_name,
            e.department_id, COALESCE(d.department_name, d.name) AS department_name,
            DATE_FORMAT(al.work_date, '%Y-%m-%d') AS work_date,
            al.shift_id, ws.shift_code, al.check_in, al.check_out, al.work_unit, al.status, al.note,
            COALESCE(mt.status, 'OPEN') AS month_status
       FROM attendance_logs al
       INNER JOIN employees e ON e.id = al.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN work_shifts ws ON ws.id = al.shift_id
       LEFT JOIN monthly_timesheets mt ON mt.employee_id = al.employee_id AND mt.month_year = DATE_FORMAT(al.work_date, '%Y-%m')
      WHERE ${conditions.join(" AND ")}
      ORDER BY al.work_date DESC, al.id DESC`,
    params,
  );

  return rows
    .map((row) => {
      const explanation = parseExplanationNote(row.note);
      if (!explanation) return null;
      return {
        ...row,
        note: undefined,
        explanation_status: explanation.status,
        reason: explanation.reason,
        submitted_by: explanation.submitted_by,
        submitted_at: explanation.submitted_at,
        approved_by: explanation.approved_by,
        approved_at: explanation.approved_at,
        reject_reason: explanation.reject_reason,
      };
    })
    .filter(Boolean)
    .filter(
      (row) =>
        !filters.status ||
        row.explanation_status === String(filters.status).toUpperCase(),
    );
};

const loadExplanationLog = async (connection, explanationId) => {
  const id = Number(explanationId);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw attendanceError("Gi?i tr�nh kh�ng h?p l?");
  const [rows] = await connection.query(
    "SELECT *, DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date_str FROM attendance_logs WHERE id = ? FOR UPDATE",
    [id],
  );
  if (!rows.length) throw attendanceError("Không tìm thấy giải trình", 404);
  const explanation = parseExplanationNote(rows[0].note);
  if (!explanation)
    throw attendanceError("Bản ghi không phải giải trình công", 400);
  return { log: rows[0], explanation };
};

export const approveExplanation = async (user, explanationId, payload = {}) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { log, explanation } = await loadExplanationLog(
      connection,
      explanationId,
    );
    if (explanation.status !== "PENDING")
      throw attendanceError("Gi?i tr�nh d� du?c x? l� tru?c d�", 409);
    await assertCanApprove(connection, user, log.employee_id);
    const workDate = log.work_date_str;
    await assertMonthOpen(connection, log.employee_id, workDate);

    const [shifts] = await connection.query(
      "SELECT id AS shift_id, start_time, end_time, break_minutes, grace_minutes, standard_work_units FROM work_shifts WHERE id = ? LIMIT 1",
      [log.shift_id],
    );
    const shift =
      shifts[0] ||
      (await getShiftForDate(log.employee_id, workDate, connection));

    const checkIn = payload.check_in
      ? normalizeTime(payload.check_in)
      : explanation.check_in;
    const checkOut = payload.check_out
      ? normalizeTime(payload.check_out)
      : explanation.check_out;
    if (
      (payload.check_in && !checkIn) ||
      (payload.check_out && !checkOut) ||
      (checkIn && checkOut && timeToMinutes(checkOut) <= timeToMinutes(checkIn))
    )
      throw attendanceError("Giờ giải trình không hợp lệ", 400);
    let workUnit = Number(payload.work_unit);
    if (![0, 0.5, 1].includes(workUnit)) {
      if (checkIn && checkOut)
        workUnit = Number(shift?.standard_work_units || 1);
      else if (checkIn || checkOut) workUnit = 0.5;
      else workUnit = Number(log.work_unit || 0);
    }
    const lateMinutes = computeLateMinutes(checkIn, shift);
    const approved = {
      ...explanation,
      status: "APPROVED",
      check_in: checkIn,
      check_out: checkOut,
      approved_by: Number(user.employee_id),
      approved_at: new Date().toISOString(),
      reject_reason: null,
    };

    await connection.query(
      `UPDATE attendance_logs
          SET check_in = ?, check_out = ?, late_minutes = ?, work_unit = ?,
              source = 'MANUAL_ADJUST', status = 'EXPLAINED', note = ?
        WHERE id = ?`,
      [
        checkIn,
        checkOut,
        lateMinutes,
        workUnit,
        buildExplanationNote(approved),
        log.id,
      ],
    );

    const { recalculateEmployeeMonth } =
      await import("../tong-hop-chot-cong/tongHopChotCong.service.js");
    await recalculateEmployeeMonth(
      connection,
      log.employee_id,
      workDate.slice(0, 7),
    );

    await connection.commit();
    return { id: log.id, explanation: approved };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const rejectExplanation = async (user, explanationId, payload = {}) => {
  const rejectReason = String(
    payload.reject_reason ?? payload.reason ?? "",
  ).trim();
  if (!rejectReason)
    throw attendanceError("Vui l�ng nh?p l� do t? ch?i gi?i tr�nh");
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { log, explanation } = await loadExplanationLog(
      connection,
      explanationId,
    );
    if (explanation.status !== "PENDING")
      throw attendanceError("Gi?i tr�nh d� du?c x? l� tru?c d�", 409);
    await assertCanApprove(connection, user, log.employee_id);
    const workDate = log.work_date_str;
    await assertMonthOpen(connection, log.employee_id, workDate);

    const rejected = {
      ...explanation,
      status: "REJECTED",
      approved_by: Number(user.employee_id),
      approved_at: new Date().toISOString(),
      reject_reason: rejectReason,
    };
    const nextStatus =
      explanation.original?.status ||
      (log.check_out ? "VALID" : "MISSING_CHECKOUT");
    await connection.query(
      "UPDATE attendance_logs SET status = ?, note = ? WHERE id = ?",
      [nextStatus, buildExplanationNote(rejected), log.id],
    );

    const { recalculateEmployeeMonth } =
      await import("../tong-hop-chot-cong/tongHopChotCong.service.js");
    await recalculateEmployeeMonth(
      connection,
      log.employee_id,
      workDate.slice(0, 7),
    );

    await connection.commit();
    return { id: log.id, explanation: rejected };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const cancelExplanation = async (user, explanationId) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { log, explanation } = await loadExplanationLog(
      connection,
      explanationId,
    );
    if (Number(log.employee_id) !== Number(user?.employee_id)) {
      throw attendanceError("Ch? du?c h?y gi?i tr�nh c?a ch�nh m�nh", 403);
    }
    await assertMonthOpen(connection, log.employee_id, log.work_date_str);
    if (explanation.status !== "PENDING")
      throw attendanceError("Ch? c� th? h?y gi?i tr�nh dang ch? duy?t", 409);
    const cancelled = { ...explanation, status: "CANCELLED" };
    const nextStatus =
      explanation.original?.status ||
      (log.check_out ? "VALID" : "MISSING_CHECKOUT");
    await connection.query(
      "UPDATE attendance_logs SET status = ?, note = ? WHERE id = ?",
      [nextStatus, buildExplanationNote(cancelled), log.id],
    );
    await connection.commit();
    return { id: log.id, explanation: cancelled };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
