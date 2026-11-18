import { db } from "../../config/database.js";
import { assertCanApprove, buildEmployeeScope } from "../../utils/helper.js";
import { recalculateEmployeeMonth } from "../tong-hop-chot-cong/tongHopChotCong.service.js";

export const attendanceError = (message, status = 400) =>
  Object.assign(new Error(message), { status });

const columnCache = new Map();
const hasColumn = async (connection, table, column) => {
  const key = `${table}.${column}`;
  const cached = columnCache.get(key);
  if (cached && Date.now() - cached.at < 30000) return cached.value;
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  const value = Number(rows[0]?.total) > 0;
  columnCache.set(key, { at: Date.now(), value });
  return value;
};

export const FACE_MATCH_THRESHOLD = 0.76;
export const FACE_MIN_PASS_RATIO = 0.8;
export const FACE_AMBIGUITY_MARGIN = 0.06;
export const FACE_CAPTURE_MODEL = "human-faceres1024-subjectlock-v3";
const CAPTURE_MIN = {
  score: 0.85,
  real: 0.7,
  live: 0.7,
  sharpness: 30,
  brightnessMin: 50,
  brightnessMax: 220,
  faceWidth: 130,
  stableFrames: 8,
  maxSpeed: 18,
};
const assertMin = (value, min, message) => {
  if (!Number.isFinite(Number(value)) || Number(value) < min)
    throw attendanceError(`${message} chưa đạt yêu cầu. Vui lòng quét lại.`, 400);
};
const assertCaptureMetadata = (capture, total) => {
  if (!capture || typeof capture !== "object")
    throw attendanceError("Thiếu dữ liệu xác thực chất lượng khuôn mặt. Vui lòng tải lại trang và quét lại.", 400);
  if (capture.model !== FACE_CAPTURE_MODEL)
    throw attendanceError("Phiên bản mô hình nhận diện không khớp. Vui lòng tải lại trang và quét lại.", 400);
  if (capture.face_only !== true || capture.subject?.locked !== true)
    throw attendanceError("Chưa khóa đúng người quét. Vui lòng đứng yên và quét lại.", 400);
  const quality = capture.quality || {};
  const liveness = capture.liveness || {};
  const subject = capture.subject || {};
  assertMin(quality.min_score, CAPTURE_MIN.score, "Độ tin cậy khuôn mặt");
  assertMin(quality.min_real, CAPTURE_MIN.real, "Khả năng chống ảnh giả");
  assertMin(quality.min_live, CAPTURE_MIN.live, "Xác thực sống");
  assertMin(quality.min_sharpness, CAPTURE_MIN.sharpness, "Độ nét khuôn mặt");
  assertMin(quality.min_face_width, CAPTURE_MIN.faceWidth, "Kích thước khuôn mặt");
  assertMin(quality.brightness_min, CAPTURE_MIN.brightnessMin, "Độ sáng tối thiểu");
  if (!Number.isFinite(Number(quality.brightness_max)) || Number(quality.brightness_max) > CAPTURE_MIN.brightnessMax)
    throw attendanceError("Ánh sáng quá chói. Vui lòng quét lại.", 400);
  if (liveness.blink_verified !== true || !Number.isFinite(Number(liveness.blink_count)) || Number(liveness.blink_count) < 1)
    throw attendanceError("Chưa xác thực chớp mắt. Vui lòng quét lại.", 400);
  assertMin(subject.stable_frames, CAPTURE_MIN.stableFrames, "Thời gian đứng yên");
  if (!Number.isFinite(Number(subject.max_speed)) || Number(subject.max_speed) > CAPTURE_MIN.maxSpeed)
    throw attendanceError("Người quét di chuyển quá nhiều. Vui lòng đứng yên và quét lại.", 400);
  if (Number(capture.samples) !== Number(total))
    throw attendanceError("Số mẫu khuôn mặt không khớp. Vui lòng quét lại.", 400);
};
const requiredPassCount = (total) =>
  Math.max(1, Math.ceil(total * FACE_MIN_PASS_RATIO));
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
  threshold = FACE_MATCH_THRESHOLD,
) => {
  const stored = parseStoredFaceData(storedFaceJson);
  const empty = {
    isMatch: false,
    avgScore: 0,
    centroidScore: 0,
    passCount: 0,
    requiredPassCount: 0,
    totalSamples: liveEmbeddings?.length || 0,
  };
  if (
    !stored ||
    !liveEmbeddings?.length ||
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
  const required = requiredPassCount(scores.length);
  return {
    isMatch: avgScore >= threshold && passCount >= required,
    avgScore,
    centroidScore,
    passCount,
    requiredPassCount: required,
    totalSamples: liveEmbeddings.length,
  };
};
export const validateBiometricCapture = (
  embeddings,
  blinkVerified,
  minInternalSim = 0.8,
  capture = null,
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
  if (capture) assertCaptureMetadata(capture, embeddings.length);
  const samples = embeddings.map(l2Normalize);
  const consistency = verifyInternalConsistency(
    samples,
    capture ? 0.86 : minInternalSim,
  );
  if (!consistency.valid) throw attendanceError(consistency.message, 400);
  return samples;
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
  if (
    candidates[1]?.isMatch &&
    best.avgScore - candidates[1].avgScore <= FACE_AMBIGUITY_MARGIN
  )
    throw attendanceError(
      "Bộ mẫu khớp với nhiều hồ sơ và chưa đủ rõ để phân biệt. Vui lòng cập nhật lại FaceID.",
      409,
    );
  return best;
};

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const round2 = (value) => Number(Number(value).toFixed(2));
const toMinutes = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const [hour, minute] = String(value)
    .split(":")
    .map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
};
const formatTime = (minutes) => {
  const safe = Math.max(0, Math.min(1439, Math.round(minutes)));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}:00`;
};
const formatDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date)
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value);
  return String(value).slice(0, 10);
};
const LEGACY_STATUS = {
  IN_PROGRESS: "MISSING_CHECKOUT",
  MISSING_OUT: "MISSING_CHECKOUT",
  COMPLETED: "VALID",
  LATE_OR_EARLY: "LATE",
  ON_LEAVE: "LEAVE_SYNC",
  ABSENT: "ABSENT",
};

export const resolveActiveAccount = async (connection, employeeId) => {
  const [rows] = await connection.query(
    `SELECT u.id AS user_id, u.username, u.role_id, u.is_active,
            e.employee_code, e.full_name
       FROM users u
      INNER JOIN employees e ON e.id = u.employee_id
      WHERE e.id = ? AND u.is_active = 1
      LIMIT 1`,
    [employeeId],
  );
  if (!rows.length)
    throw attendanceError(
      "Nhân viên chưa có tài khoản đăng nhập hoặc tài khoản đã bị khóa",
      403,
    );
  return rows[0];
};

export const serverDate = async (connection = db) => {
  const [rows] = await connection.query(
    "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today",
  );
  return rows[0].today;
};
const serverNow = async (connection = db) => {
  const [rows] = await connection.query(
    `SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today,
            DATE_FORMAT(CURTIME(), '%H:%i:%s') AS now_time,
            DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') AS datetime`,
  );
  return rows[0];
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

export const assertMonthOpen = async (connection, employeeId, date) => {
  const month = date.slice(0, 7);
  await connection.query(
    `INSERT INTO monthly_timesheets
      (employee_id, month_year, standard_days, actual_work_days, paid_leave_days,
       unpaid_leave_days, total_payable_days, late_count, total_late_minutes,
       ot_hours_150, ot_hours_200, ot_hours_300, status)
     VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'OPEN')
     ON DUPLICATE KEY UPDATE employee_id = employee_id`,
    [employeeId, month],
  );
  const [rows] = await connection.query(
    "SELECT status FROM monthly_timesheets WHERE employee_id = ? AND month_year = ? FOR UPDATE",
    [employeeId, month],
  );
  if (rows[0]?.status === "LOCKED")
    throw attendanceError("Bảng công tháng này đã khóa", 409);
};

const SHIFT_SELECT = `SELECT s.id AS shift_id, s.code AS shift_code, s.name,
  s.start_time, s.end_time, s.break_start, s.break_end, s.grace_period,
  s.min_ot_minutes, s.standard_hours, s.workday_value, s.is_default
  FROM work_shifts s`;

export const getShiftById = async (shiftId, connection = db) => {
  const [rows] = await connection.query(`${SHIFT_SELECT} WHERE s.id = ? LIMIT 1`, [
    shiftId,
  ]);
  return rows[0] || null;
};

const getDefaultShift = async (connection = db) => {
  const [rows] = await connection.query(
    `${SHIFT_SELECT} WHERE s.is_default = 1 AND s.is_active = 1 ORDER BY s.id LIMIT 1`,
  );
  return rows[0] || null;
};

const getTodayShift = async (employeeId, connection = db, dateValue = null) => {
  const date = dateValue || (await serverDate(connection));
  const [rows] = await connection.query(
    `${SHIFT_SELECT}
      INNER JOIN employee_shifts es ON es.shift_id = s.id
      WHERE es.employee_id = ? AND es.effective_from <= ?
        AND (es.effective_to IS NULL OR es.effective_to >= ?)
        AND s.is_active = 1
      ORDER BY es.effective_from DESC, es.id DESC
      LIMIT 1`,
    [employeeId, date, date],
  );
  return rows[0] || (await getDefaultShift(connection));
};

export const getShiftForDate = async (employeeId, dateValue, connection = db) => {
  const date = validateDate(dateValue);
  return getTodayShift(employeeId, connection, date);
};

const getAttendanceForDate = async (
  employeeId,
  workDate,
  connection = db,
) => {
  const withUser = await hasColumn(connection, "attendances", "user_id");
  const [rows] = await connection.query(
    `SELECT a.*, s.code AS shift_code, s.name AS shift_name, s.start_time,
            s.end_time, s.break_start, s.break_end, s.grace_period,
            s.min_ot_minutes, s.standard_hours, s.workday_value,
            ${withUser ? "u.username, u.role_id" : "NULL AS username, NULL AS role_id"}
       FROM attendances a
       LEFT JOIN work_shifts s ON s.id = a.shift_id
       ${withUser ? "LEFT JOIN users u ON u.id = a.user_id" : ""}
      WHERE a.employee_id = ? AND a.work_date = ?
      LIMIT 1`,
    [employeeId, workDate],
  );
  return rows[0] || null;
};

const insertRawScan = async (
  connection,
  employeeId,
  account,
  scanType,
  meta = {},
  faceScore = null,
) => {
  const withUser = await hasColumn(connection, "attendance_logs", "user_id");
  await connection.query(
    `INSERT INTO attendance_logs
      (employee_id, ${withUser ? "user_id, " : ""}scan_time, scan_type,
       face_score, ip_address, device_info, is_valid, reject_reason)
     VALUES (?, ${withUser ? "?, " : ""}NOW(), ?, ?, ?, ?, 1, NULL)`,
    [
      employeeId,
      ...(withUser ? [account.user_id] : []),
      scanType,
      faceScore,
      meta.ip || null,
      meta.device_info || null,
    ],
  );
};

export const recalculateDailyAttendance = async (
  connection,
  employeeId,
  workDate,
) => {
  const attendance = await getAttendanceForDate(
    employeeId,
    workDate,
    connection,
  );
  if (!attendance) return null;

  const [leaveRows] = await connection.query(
    `SELECT * FROM leave_requests
      WHERE employee_id = ? AND work_date = ? AND status = 'APPROVED'
      ORDER BY id LIMIT 1`,
    [employeeId, workDate],
  );
  const leave = leaveRows[0] || null;
  const [otRows] = await connection.query(
    `SELECT * FROM overtime_requests
      WHERE employee_id = ? AND work_date = ? AND status = 'APPROVED'
      ORDER BY id LIMIT 1`,
    [employeeId, workDate],
  );
  const overtime = otRows[0] || null;

  const shiftStart = toMinutes(attendance.start_time);
  const shiftEnd = toMinutes(attendance.end_time);
  const breakStart = toMinutes(attendance.break_start);
  const breakEnd = toMinutes(attendance.break_end);
  let effectiveStart = shiftStart;
  let effectiveEnd = shiftEnd;
  if (leave?.leave_type === "MORNING" && breakEnd !== null)
    effectiveStart = breakEnd;
  if (leave?.leave_type === "AFTERNOON" && breakStart !== null)
    effectiveEnd = breakStart;

  const checkIn = toMinutes(attendance.check_in);
  const checkOut = toMinutes(attendance.check_out);
  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  let actualWorkHours = 0;
  let baseWorkday = 0;
  let paidLeaveWorkday = leave
    ? round2(Math.min(1, toNumber(leave.paid_workday, 0)))
    : 0;
  let totalWorkday = 0;
  let rawOtMinutes = 0;
  let approvedOtHours = 0;
  let otRate = toNumber(attendance.ot_rate, 1.5) || 1.5;
  let status = "IN_PROGRESS";

  if (leave?.leave_type === "FULL_DAY") {
    paidLeaveWorkday = round2(Math.min(1, toNumber(leave.paid_workday, 0)));
    totalWorkday = paidLeaveWorkday;
    status = "ON_LEAVE";
  } else {
    if (
      checkIn !== null &&
      effectiveStart !== null &&
      checkIn > effectiveStart + toNumber(attendance.grace_period, 0)
    ) {
      lateMinutes = checkIn - effectiveStart;
      if (leave?.leave_type === "LATE_EARLY_EXEMPT")
        lateMinutes = Math.max(0, lateMinutes - toNumber(leave.exempt_minutes, 0));
    }

    if (checkIn === null || checkOut === null) {
      totalWorkday = paidLeaveWorkday;
      status = leave
        ? "ON_LEAVE"
        : checkIn === null
          ? "ABSENT"
          : "IN_PROGRESS";
    } else {
      if (effectiveEnd !== null && checkOut < effectiveEnd) {
        earlyLeaveMinutes = effectiveEnd - checkOut;
        if (leave?.leave_type === "LATE_EARLY_EXEMPT")
          earlyLeaveMinutes = Math.max(
            0,
            earlyLeaveMinutes - toNumber(leave.exempt_minutes, 0),
          );
      }

      const clampIn =
        checkIn !== null && effectiveStart !== null
          ? Math.max(checkIn, effectiveStart)
          : checkIn;
      const clampOut =
        checkOut !== null && effectiveEnd !== null
          ? Math.min(checkOut, effectiveEnd)
          : checkOut;
      if (clampIn !== null && clampOut !== null) {
        const overlap =
          breakStart !== null && breakEnd !== null
            ? Math.max(
                0,
                Math.min(clampOut, breakEnd) - Math.max(clampIn, breakStart),
              )
            : 0;
        const workedMinutes = Math.max(
          0,
          clampOut - clampIn - overlap,
        );
        actualWorkHours = round2(workedMinutes / 60);
        const standardHours = toNumber(attendance.standard_hours, 8) || 8;
        baseWorkday = round2(
          Math.min(
            toNumber(attendance.workday_value, 1) || 1,
            actualWorkHours / standardHours,
          ),
        );
      }

      paidLeaveWorkday = leave
        ? round2(Math.min(1, toNumber(leave.paid_workday, 0)))
        : 0;
      totalWorkday = round2(Math.min(1, baseWorkday + paidLeaveWorkday));

      if (effectiveEnd !== null && checkOut > effectiveEnd)
        rawOtMinutes = checkOut - effectiveEnd;
      if (overtime && rawOtMinutes > 0) {
        const otStart = Math.max(
          effectiveEnd,
          toMinutes(overtime.start_time) ?? effectiveEnd,
        );
        const otEnd = toMinutes(overtime.end_time) ?? 0;
        const validStart = Math.max(checkIn ?? 0, otStart);
        const validEnd = Math.min(checkOut, otEnd);
        const validMinutes = Math.max(0, validEnd - validStart);
        if (validMinutes >= toNumber(attendance.min_ot_minutes, 30)) {
          approvedOtHours = round2(validMinutes / 60);
          otRate = toNumber(overtime.ot_rate, 1.5) || 1.5;
        }
      }

      status = lateMinutes > 0 || earlyLeaveMinutes > 0
        ? "LATE_OR_EARLY"
        : "COMPLETED";
    }
  }

  await connection.query(
    `UPDATE attendances
        SET late_minutes = ?, early_leave_minutes = ?, actual_work_hours = ?,
            base_workday = ?, paid_leave_workday = ?, total_workday = ?,
            raw_ot_minutes = ?, approved_ot_hours = ?, ot_rate = ?, status = ?
      WHERE id = ?`,
    [
      lateMinutes,
      earlyLeaveMinutes,
      actualWorkHours,
      baseWorkday,
      paidLeaveWorkday,
      totalWorkday,
      rawOtMinutes,
      approvedOtHours,
      otRate,
      status,
      attendance.id,
    ],
  );

  return {
    ...attendance,
    late_minutes: lateMinutes,
    early_leave_minutes: earlyLeaveMinutes,
    actual_work_hours: actualWorkHours,
    base_workday: baseWorkday,
    paid_leave_workday: paidLeaveWorkday,
    total_workday: totalWorkday,
    raw_ot_minutes: rawOtMinutes,
    approved_ot_hours: approvedOtHours,
    ot_rate: otRate,
    status,
  };
};

const legacyLog = (attendance, source = null) => {
  if (!attendance) return null;
  const attendanceId = attendance.id ?? attendance.log_id ?? null;
  return {
    id: attendanceId,
    log_id: attendanceId,
    employee_id: attendance.employee_id,
    user_id: attendance.user_id ?? null,
    username: attendance.username ?? null,
    work_date: formatDateOnly(attendance.work_date),
    check_in: attendance.check_in || null,
    check_out: attendance.check_out || null,
    late_minutes: toNumber(attendance.late_minutes, 0),
    early_leave_minutes: toNumber(attendance.early_leave_minutes, 0),
    work_unit: toNumber(attendance.total_workday, 0),
    total_workday: toNumber(attendance.total_workday, 0),
    status: LEGACY_STATUS[attendance.status] || attendance.status,
    raw_status: attendance.status,
    source:
      source ||
      (toNumber(attendance.face_score, 0) > 0 ? "FACE_ID" : "MANUAL_ADJUST"),
    note: attendance.note || null,
    shift_id: attendance.shift_id ?? null,
    shift_code: attendance.shift_code ?? null,
    face_score: attendance.face_score ?? null,
  };
};

const upsertDailyAttendance = async (
  connection,
  employeeId,
  account,
  shift,
  workDate,
  values,
) => {
  const withUser = await hasColumn(connection, "attendances", "user_id");
  await connection.query(
    `INSERT INTO attendances
      (employee_id, ${withUser ? "user_id, " : ""}shift_id, work_date,
       check_in, check_out, check_in_ip, check_out_ip, note, status)
     VALUES (?, ${withUser ? "?, " : ""}?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       ${withUser ? "user_id = VALUES(user_id)," : ""}
       shift_id = VALUES(shift_id),
       check_in = COALESCE(check_in, VALUES(check_in)),
       check_out = COALESCE(check_out, VALUES(check_out)),
       check_in_ip = COALESCE(check_in_ip, VALUES(check_in_ip)),
       check_out_ip = COALESCE(check_out_ip, VALUES(check_out_ip)),
       note = COALESCE(note, VALUES(note)),
       status = VALUES(status)`,
    [
      employeeId,
      ...(withUser ? [account.user_id] : []),
      shift.shift_id,
      workDate,
      values.checkIn || null,
      values.checkOut || null,
      values.checkInIp || null,
      values.checkOutIp || null,
      values.note || null,
      values.status,
    ],
  );
};

const checkInInternal = async (employeeId, account, meta, connection) => {
  if (!employeeId) return { error: "NO_EMPLOYEE" };
  const now = await serverNow(connection);
  const shift = await getTodayShift(employeeId, connection, now.today);
  if (!shift) return { error: "NO_SHIFT" };
  const existing = await getAttendanceForDate(
    employeeId,
    now.today,
    connection,
  );
  if (existing?.check_in)
    return {
      error: "ALREADY_CHECKED_IN",
      log: legacyLog(existing, "FACE_ID"),
      shift: await getShiftById(existing.shift_id, connection),
    };

  await insertRawScan(
    connection,
    employeeId,
    account,
    "CHECK_IN",
    meta,
    meta.face_score ?? null,
  );
  await upsertDailyAttendance(connection, employeeId, account, shift, now.today, {
    checkIn: now.now_time,
    checkInIp: meta.ip || null,
    note: meta.note || null,
    status: "IN_PROGRESS",
  });
  await recalculateDailyAttendance(connection, employeeId, now.today);
  await recalculateEmployeeMonth(connection, employeeId, now.today.slice(0, 7));
  const final = await getAttendanceForDate(employeeId, now.today, connection);
  return { log: legacyLog(final, "FACE_ID"), shift, account };
};

const checkOutInternal = async (employeeId, account, meta, connection) => {
  if (!employeeId) return { error: "NO_EMPLOYEE" };
  const now = await serverNow(connection);
  const existing = await getAttendanceForDate(
    employeeId,
    now.today,
    connection,
  );
  if (!existing?.check_in) return { error: "NO_CHECK_IN" };
  if (existing.check_out)
    return {
      error: "ALREADY_CHECKED_OUT",
      log: legacyLog(existing, "FACE_ID"),
      shift: await getShiftById(existing.shift_id, connection),
    };

  const shift =
    (await getShiftById(existing.shift_id, connection)) ||
    (await getTodayShift(employeeId, connection, now.today));
  if (!shift) return { error: "NO_SHIFT" };

  await insertRawScan(
    connection,
    employeeId,
    account,
    "CHECK_OUT",
    meta,
    meta.face_score ?? null,
  );
  await upsertDailyAttendance(connection, employeeId, account, shift, now.today, {
    checkIn: existing.check_in,
    checkOut: now.now_time,
    checkInIp: existing.check_in_ip,
    checkOutIp: meta.ip || null,
    note: existing.note || meta.note || null,
    status: existing.status,
  });
  await recalculateDailyAttendance(connection, employeeId, now.today);
  await recalculateEmployeeMonth(connection, employeeId, now.today.slice(0, 7));
  const final = await getAttendanceForDate(employeeId, now.today, connection);
  return { log: legacyLog(final, "FACE_ID"), shift, account };
};

const recordSelfAttendance = async (
  employeeId,
  meta,
  operation,
  verifiedIdentity = null,
  accountOverride = null,
) => {
  if (!employeeId) return { error: "NO_EMPLOYEE" };
  const samples = verifiedIdentity?.samples
    ? verifiedIdentity.samples
    : validateBiometricCapture(meta.embeddings, meta.blink_verified);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [currentRows] = await connection.query(
      "SELECT face_descriptor, work_status FROM employees WHERE id = ? FOR UPDATE",
      [employeeId],
    );
    const current = currentRows[0];
    if (!current || current.work_status !== "WORKING")
      throw attendanceError("Hồ sơ nhân viên không hoạt động", 403);

    const account =
      accountOverride || (await resolveActiveAccount(connection, employeeId));
    if (
      meta.user_id !== undefined &&
      meta.user_id !== null &&
      Number(meta.user_id) !== Number(account.user_id)
    )
      throw attendanceError(
        "Khuôn mặt không thuộc tài khoản đang chấm công",
        403,
      );

    const selfMatch = evaluateFullSetMatch(samples, current.face_descriptor);
    if (!selfMatch.isMatch)
      throw attendanceError(
        `Khuôn mặt không khớp với hồ sơ đăng ký! Độ khớp trung bình bộ mẫu: ${(selfMatch.avgScore * 100).toFixed(1)}% (${selfMatch.passCount}/${selfMatch.totalSamples} mẫu đạt ngưỡng, yêu cầu >= ${(FACE_MATCH_THRESHOLD * 100).toFixed(0)}% và >= ${selfMatch.requiredPassCount}/${selfMatch.totalSamples} mẫu).`,
        403,
      );

    if (!verifiedIdentity) {
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
          (match) =>
            match.isMatch &&
            match.avgScore > selfMatch.avgScore + FACE_AMBIGUITY_MARGIN,
        )
        .sort((a, b) => b.avgScore - a.avgScore)[0];
      if (other)
        throw attendanceError(
          `CẢNH BÁO NHẬN DIỆN: Khuôn mặt trước Camera khớp với hồ sơ [${other.employee.employee_code} - ${other.employee.full_name}] (${(other.avgScore * 100).toFixed(1)}%), không phải tài khoản đang đăng nhập!`,
          403,
        );
    } else if (Number(verifiedIdentity.employee?.id) !== Number(employeeId)) {
      throw attendanceError("Khuôn mặt không thuộc tài khoản đang chấm công", 403);
    }

    const date = await serverDate(connection);
    await assertMonthOpen(connection, employeeId, date);
    const result = await operation(employeeId, account, meta, connection);
    if (result.error) {
      await connection.rollback();
      return result;
    }
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

export const kioskAttendance = async (
  action,
  values,
  ip,
  blinkVerified,
  deviceInfo = null,
  captureMeta = null,
) => {
  if (!["check-in", "check-out"].includes(action))
    throw attendanceError("Thao tác chấm công không hợp lệ");
  const samples = validateBiometricCapture(values, blinkVerified, 0.8, captureMeta);
  const [employees] = await db.query(
    `SELECT e.id, e.employee_code, e.full_name, e.face_descriptor,
            COALESCE(d.department_name, d.name) AS department_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.work_status = 'WORKING' AND e.face_descriptor IS NOT NULL`,
  );
  const match = identifyFace(samples, employees);
  const account = await resolveActiveAccount(db, match.employee.id);
  const result = await recordSelfAttendance(
    match.employee.id,
    {
      ip,
      device_info: deviceInfo,
      note: `Human FaceID; similarity=${(match.avgScore * 100).toFixed(1)}%; samples=${match.passCount}/${match.totalSamples}`,
      face_score: match.avgScore,
    },
    action === "check-in" ? checkInInternal : checkOutInternal,
    { employee: match.employee, match, samples },
    account,
  );
  if (result.error === "ALREADY_CHECKED_IN" || result.error === "ALREADY_CHECKED_OUT") {
    const log = result.log;
    const completed = Boolean(log?.check_out);
    const checkInTime = String(log?.check_in || "—").slice(0, 5);
    const checkOutTime = String(log?.check_out || "—").slice(0, 5);
    return {
      employee: {
        employee_code: match.employee.employee_code,
        full_name: match.employee.full_name,
        department_name: match.employee.department_name,
        user_id: account.user_id,
        username: account.username,
      },
      account: {
        user_id: account.user_id,
        username: account.username,
        role_id: account.role_id,
      },
      log,
      shift: result.shift || null,
      action,
      already_recorded: true,
      attendance_state: completed ? "COMPLETED" : "CHECKED_IN",
      message: completed
        ? `Bạn đã hoàn thành chấm công hôm nay: vào ca lúc ${checkInTime}, tan ca lúc ${checkOutTime}.`
        : `Bạn đã vào ca lúc ${checkInTime}. Chọn Tan ca khi kết thúc làm việc.`,
    };
  }
  const errors = {
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
      user_id: account.user_id,
      username: account.username,
    },
    account: {
      user_id: account.user_id,
      username: account.username,
      role_id: account.role_id,
    },
    log: result.log,
    shift: result.shift,
    action,
  };
};

export const getTodayStatus = async (employeeId) => {
  const today = await serverDate();
  const log = await getAttendanceForDate(employeeId, today);
  const shift = await getTodayShift(employeeId, db, today);
  const [employees] = await db.query(
    `SELECT e.id, e.employee_code, e.full_name, e.manager_id, e.data_scope,
            COALESCE(d.department_name, d.name) AS department_name,
            (e.face_descriptor IS NOT NULL) AS has_face_descriptor,
            u.id AS user_id, u.username, u.is_active AS account_active,
            COALESCE(mt.status, 'OPEN') AS month_status
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN users u ON u.employee_id = e.id
       LEFT JOIN monthly_timesheets mt ON mt.employee_id = e.id AND mt.month_year = ?
      WHERE e.id = ?
      LIMIT 1`,
    [today.slice(0, 7), employeeId],
  );
  return {
    log: legacyLog(log),
    shift,
    employee: employees[0] || null,
    account: employees[0]?.user_id
      ? {
          user_id: employees[0].user_id,
          username: employees[0].username,
          is_active: employees[0].account_active,
        }
      : null,
  };
};

export const listAttendanceByDate = async (date, user) => {
  const targetDate = validateDate(date || (await serverDate()));
  const scope = buildEmployeeScope(user);
  const withUser = await hasColumn(db, "attendances", "user_id");
  const [rows] = await db.query(
    `SELECT e.id AS employee_id, e.employee_code, e.full_name, e.department_id,
            COALESCE(d.department_name, d.name) AS department_name,
            a.id AS log_id, a.work_date, a.shift_id, a.check_in, a.check_out,
            a.check_in_ip, a.check_out_ip, a.actual_work_hours, a.base_workday,
            a.paid_leave_workday, a.total_workday, a.late_minutes,
            a.early_leave_minutes, a.raw_ot_minutes, a.approved_ot_hours,
            a.ot_rate, a.status AS raw_status, a.note,
            ${withUser ? "a.user_id, u.username" : "NULL AS user_id, NULL AS username"},
            ws.code AS shift_code, ws.start_time, ws.end_time, ws.break_start,
            ws.break_end, ws.grace_period, ws.standard_hours, ws.workday_value,
            COALESCE(mt.status, 'OPEN') AS month_status,
            (SELECT MAX(lr.paid_workday > 0) FROM leave_requests lr
              WHERE lr.employee_id = e.id AND lr.status = 'APPROVED'
                AND lr.work_date = ?) AS leave_paid,
            (SELECT MAX(lr.leave_type) FROM leave_requests lr
              WHERE lr.employee_id = e.id AND lr.status = 'APPROVED'
                AND lr.work_date = ?) AS leave_type,
            (SELECT MAX(lr.reason) FROM leave_requests lr
              WHERE lr.employee_id = e.id AND lr.status = 'APPROVED'
                AND lr.work_date = ?) AS leave_reason,
            (SELECT MAX(lr.exempt_minutes) FROM leave_requests lr
              WHERE lr.employee_id = e.id AND lr.status = 'APPROVED'
                AND lr.work_date = ?) AS exempt_minutes,
            (SELECT COUNT(*) FROM attendance_logs al
              WHERE al.employee_id = e.id
                AND DATE_FORMAT(al.scan_time, '%Y-%m-%d') = ?
                AND al.scan_type = 'CHECK_IN') AS face_scan_count,
            (SELECT COUNT(*) FROM attendance_logs al
              WHERE al.employee_id = e.id
                AND DATE_FORMAT(al.scan_time, '%Y-%m-%d') = ?
                AND al.scan_type = 'CHECK_OUT') AS face_out_count,
            (SELECT MAX(al.device_info) FROM attendance_logs al
              WHERE al.employee_id = e.id
                AND DATE_FORMAT(al.scan_time, '%Y-%m-%d') = ?) AS device_info,
            (SELECT MAX(al.face_score) FROM attendance_logs al
              WHERE al.employee_id = e.id
                AND DATE_FORMAT(al.scan_time, '%Y-%m-%d') = ?) AS face_score
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
        LEFT JOIN attendances a ON a.employee_id = e.id AND a.work_date = ?
        ${withUser ? "LEFT JOIN users u ON u.id = a.user_id" : ""}
        LEFT JOIN work_shifts ws ON ws.id = a.shift_id
       LEFT JOIN monthly_timesheets mt ON mt.employee_id = e.id AND mt.month_year = ?
       ${scope.clause || "WHERE 1 = 1"} AND e.work_status = 'WORKING'
      ORDER BY e.employee_code`,
    [
      targetDate,
      targetDate,
      targetDate,
      targetDate,
      targetDate,
      targetDate,
      targetDate,
      targetDate,
      targetDate,
      targetDate.slice(0, 7),
      ...scope.params,
    ],
  );

  return {
    date: targetDate,
    rows: rows.map((row) => {
      const explanation = parseExplanationNote(row.note);
      const source =
        row.face_scan_count > 0
          ? "FACE_ID"
          : explanation
            ? "MANUAL_ADJUST"
            : row.leave_paid != null
              ? "LEAVE_SYNC"
              : null;
      return {
        ...row,
        ...legacyLog(row, source),
        leave_paid: row.leave_paid,
        leave_type: row.leave_type,
        leave_reason: row.leave_reason,
        exempt_minutes: row.exempt_minutes,
        face_scan_count: row.face_scan_count,
        face_out_count: row.face_out_count,
        device_info: row.device_info,
        explanation,
      };
    }),
  };
};

const MANAGER_ROLES = ["MANAGER", "CB_PAYROLL", "HR_ADMIN", "SUPER_ADMIN"];
const assertManagerScope = (user, employeeId) => {
  if (
    !MANAGER_ROLES.includes(user?.role_id) ||
    !["ALL", "DEPARTMENT"].includes(user?.data_scope)
  )
    throw attendanceError("Không có quyền quản lý chấm công nhân viên này", 403);
  if (!Number.isSafeInteger(Number(employeeId)) || Number(employeeId) <= 0)
    throw attendanceError("Nhân viên không hợp lệ");
};
const assertAttendanceEmployeeScope = async (
  connection,
  employeeId,
  user,
  lock = false,
) => {
  const scope = buildEmployeeScope(user);
  const [rows] = await connection.query(
    `SELECT e.id, e.employee_code, e.full_name,
            COALESCE(d.department_name, d.name) AS department_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       ${scope.clause || "WHERE 1 = 1"} AND e.id = ?
       LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [...scope.params, Number(employeeId)],
  );
  if (!rows.length) throw attendanceError("Nhân viên ngoài phạm vi quản lý", 403);
  return rows[0];
};
export const getAttendanceDetail = async (employeeId, dateValue, user) => {
  const targetDate = validateDate(dateValue || (await serverDate()));
  if (!user) throw attendanceError("Không có quyền xem chấm công", 403);
  const employee = await assertAttendanceEmployeeScope(db, employeeId, user);
  const [attendanceRows] = await db.query(
    `SELECT a.*, s.code AS shift_code, s.name AS shift_name,
            s.start_time, s.end_time, s.break_start, s.break_end,
            s.grace_period, s.standard_hours, s.workday_value
       FROM attendances a
       LEFT JOIN work_shifts s ON s.id = a.shift_id
      WHERE a.employee_id = ? AND a.work_date = ?
      LIMIT 1`,
    [employee.id, targetDate],
  );
  const attendance = attendanceRows[0] || null;
  const [scans] = await db.query(
    `SELECT id, DATE_FORMAT(scan_time, '%Y-%m-%d %H:%i:%s') AS scan_time,
            scan_type, face_score, ip_address, device_info, is_valid,
            reject_reason, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM attendance_logs
      WHERE employee_id = ? AND DATE(scan_time) = ?
      ORDER BY scan_time, id`,
    [employee.id, targetDate],
  );
  const [leaves] = await db.query(
    `SELECT id, leave_type, paid_workday, exempt_minutes, reason, status,
            DATE_FORMAT(approved_at, '%Y-%m-%d %H:%i:%s') AS approved_at
       FROM leave_requests
      WHERE employee_id = ? AND work_date = ? AND status = 'APPROVED'
      ORDER BY id`,
    [employee.id, targetDate],
  );
  const [overtimes] = await db.query(
    `SELECT id, start_time, end_time, ot_type, ot_rate, reason, status,
            DATE_FORMAT(approved_at, '%Y-%m-%d %H:%i:%s') AS approved_at
       FROM overtime_requests
      WHERE employee_id = ? AND work_date = ? AND status = 'APPROVED'
      ORDER BY id`,
    [employee.id, targetDate],
  );
  const [monthlyRows] = await db.query(
    `SELECT id, month_year, standard_days, actual_work_days, paid_leave_days,
            unpaid_leave_days, total_payable_days, late_count,
            total_late_minutes, ot_hours_150, ot_hours_200, ot_hours_300,
            status, locked_at
       FROM monthly_timesheets
      WHERE employee_id = ? AND month_year = ?
      LIMIT 1`,
    [employee.id, targetDate.slice(0, 7)],
  );
  const shift = attendance?.shift_id
    ? await getShiftById(attendance.shift_id)
    : await getShiftForDate(employee.id, targetDate);
  const explanation = parseExplanationNote(attendance?.note);
  const source = scans.some((scan) => scan.scan_type === "CHECK_IN")
    ? "FACE_ID"
    : explanation
      ? "MANUAL_ADJUST"
      : leaves.some((leave) => Number(leave.paid_workday) > 0)
        ? "LEAVE_SYNC"
        : null;
  return {
    date: targetDate,
    employee,
    attendance: attendance
      ? { ...attendance, ...legacyLog(attendance, source), explanation }
      : null,
    shift,
    scans,
    leaves,
    overtimes,
    monthly: monthlyRows[0] || null,
    editable: monthlyRows[0]?.status !== "LOCKED",
  };
};
const normalizeManualTime = (value) => {
  if (value === null || value === undefined || String(value).trim() === "")
    return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(value).trim());
  if (!match) throw attendanceError("Giờ vào/ra không hợp lệ. Dùng định dạng HH:mm", 400);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  if (hour > 23 || minute > 59 || second > 59)
    throw attendanceError("Giờ vào/ra không hợp lệ", 400);
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(hour)}:${pad(minute)}:${pad(second)}`;
};
export const updateAttendanceManual = async (payload = {}, user) => {
  assertManagerScope(user, payload.employee_id);
  const targetDate = validateDate(payload.date || (await serverDate()));
  if (targetDate > (await serverDate()))
    throw attendanceError("Không thể chỉnh sửa chấm công ngày trong tương lai");
  const checkIn = normalizeManualTime(payload.check_in);
  const checkOut = normalizeManualTime(payload.check_out);
  if (checkOut && !checkIn)
    throw attendanceError("Phải có giờ vào trước khi chỉnh giờ ra");
  const inMinutes = checkIn ? toMinutes(checkIn) : null;
  const outMinutes = checkOut ? toMinutes(checkOut) : null;
  if (inMinutes !== null && outMinutes !== null && outMinutes < inMinutes)
    throw attendanceError("Giờ ra không được trước giờ vào");
  const note =
    payload.note === undefined || payload.note === null
      ? null
      : String(payload.note).trim().slice(0, 500) || null;
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const employee = await assertAttendanceEmployeeScope(
      connection,
      payload.employee_id,
      user,
      true,
    );
    await assertMonthOpen(connection, employee.id, targetDate);
    const [existingRows] = await connection.query(
      "SELECT * FROM attendances WHERE employee_id = ? AND work_date = ? FOR UPDATE",
      [employee.id, targetDate],
    );
    const existing = existingRows[0];
    if (!existing)
      throw attendanceError(
        "Chưa có bản ghi chấm công để chỉnh sửa. Hãy điểm danh trước.",
        409,
      );
    const withUpdatedAt = await hasColumn(connection, "attendances", "updated_at");
    await connection.query(
      `UPDATE attendances
          SET check_in = ?, check_out = ?, note = ?,
              ${withUpdatedAt ? "updated_at = NOW()," : ""}
              status = ?
        WHERE id = ?`,
      [checkIn, checkOut, note, existing.status, existing.id],
    );
    await insertRawScan(
      connection,
      employee.id,
      { user_id: user?.user_id || null },
      "RAW_SCAN",
      {
        ip: payload.ip || null,
        device_info: `MANUAL_EDIT_BY_${user?.user_id || "UNKNOWN"}`,
      },
    );
    await recalculateDailyAttendance(connection, employee.id, targetDate);
    await recalculateEmployeeMonth(connection, employee.id, targetDate.slice(0, 7));
    await connection.commit();
    return await getAttendanceDetail(employee.id, targetDate, user);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const markEmployees = async (ids, date, type, user, skipExisting = false) => {
  if (
    !["MANAGER", "CB_PAYROLL", "HR_ADMIN", "SUPER_ADMIN"].includes(
      user?.role_id,
    ) ||
    !["ALL", "DEPARTMENT"].includes(user?.data_scope)
  )
    throw attendanceError("Không có quyền điểm danh nhân viên", 403);
  if (
    !["PRESENT", "HALF", "ABSENT"].includes(type) ||
    ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
  )
    throw attendanceError("Dữ liệu điểm danh không hợp lệ");
  const targetDate = validateDate(date || (await serverDate()));
  if (targetDate > (await serverDate()))
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

      const account = await resolveActiveAccount(connection, id);
      await assertMonthOpen(connection, id, targetDate);
      const [existing] = await connection.query(
        "SELECT id FROM attendances WHERE employee_id = ? AND work_date = ? FOR UPDATE",
        [id, targetDate],
      );
      const [leave] = await connection.query(
        "SELECT id FROM leave_requests WHERE employee_id = ? AND status = 'APPROVED' AND work_date = ?",
        [id, targetDate],
      );
      if (existing.length || leave.length) {
        if (skipExisting) continue;
        throw attendanceError(
          "Nhân viên đã có chấm công hoặc đơn nghỉ được duyệt trong ngày",
          409,
        );
      }

      const shift = await getShiftForDate(id, targetDate, connection);
      if (!shift)
        throw attendanceError("Chưa cấu hình ca làm việc cho nhân viên");

      const start = toMinutes(shift.start_time) ?? 480;
      const end = toMinutes(shift.end_time) ?? 1050;
      const checkOutMinutes =
        type === "HALF" ? Math.round((start + end) / 2) : end;
      const workdayValue = toNumber(shift.workday_value, 1) || 1;
      const units =
        type === "ABSENT"
          ? 0
          : type === "HALF"
            ? Math.min(0.5, workdayValue)
            : workdayValue;
      const note = `Điểm danh ${type} bởi user ${user.user_id}`;
      const withUser = await hasColumn(connection, "attendances", "user_id");

      await insertRawScan(connection, id, account, "RAW_SCAN", {
        device_info: "MANUAL_ADJUST",
      });
      await connection.query(
        `INSERT INTO attendances
          (employee_id, ${withUser ? "user_id, " : ""}shift_id, work_date,
           check_in, check_out, base_workday, total_workday, status, note)
         VALUES (?, ${withUser ? "?, " : ""}?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           ${withUser ? "user_id = VALUES(user_id)," : ""}
           shift_id = VALUES(shift_id),
           check_in = VALUES(check_in), check_out = VALUES(check_out),
           base_workday = VALUES(base_workday), total_workday = VALUES(total_workday),
           status = VALUES(status), note = VALUES(note)`,
        [
          id,
          ...(withUser ? [account.user_id] : []),
          shift.shift_id,
          targetDate,
          type === "ABSENT" ? null : formatTime(start),
          type === "ABSENT" ? null : formatTime(checkOutMinutes),
          units,
          units,
          type === "ABSENT" ? "ABSENT" : "IN_PROGRESS",
          note,
        ],
      );
      await recalculateDailyAttendance(connection, id, targetDate);
      await recalculateEmployeeMonth(
        connection,
        id,
        targetDate.slice(0, 7),
      );
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

export const quickMarkAttendance = async (employeeId, date, type, user) =>
  markEmployees([Number(employeeId)], date, type, user);

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

export const recalculateDateAttendance = async (
  date,
  user,
  departmentId = null,
) => {
  const targetDate = validateDate(date);
  if (
    !user?.permissions?.includes("ATT.SHIFT_OT_MANAGE") ||
    !["ALL", "DEPARTMENT"].includes(user?.data_scope)
  )
    throw attendanceError("Bạn không có quyền tính lại công chấm công", 403);
  const scope = buildEmployeeScope(user);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [employees] = await connection.query(
      `SELECT DISTINCT e.id
         FROM employees e
         INNER JOIN attendances a ON a.employee_id = e.id AND a.work_date = ?
         ${scope.clause || "WHERE 1 = 1"}
         ${departmentId ? "AND e.department_id = ?" : ""}
        ORDER BY e.id`,
      [targetDate, ...scope.params, ...(departmentId ? [departmentId] : [])],
    );
    let count = 0;
    let skipped = 0;
    for (const employee of employees) {
      const [month] = await connection.query(
        "SELECT status FROM monthly_timesheets WHERE employee_id = ? AND month_year = ? FOR UPDATE",
        [employee.id, targetDate.slice(0, 7)],
      );
      if (month[0]?.status === "LOCKED") {
        skipped += 1;
        continue;
      }
      await recalculateDailyAttendance(connection, employee.id, targetDate);
      await recalculateEmployeeMonth(
        connection,
        employee.id,
        targetDate.slice(0, 7),
      );
      count += 1;
    }
    await connection.commit();
    return { date: targetDate, count, skipped };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const SHIFT_CODE_PATTERN = /^[A-Z0-9_]{2,20}$/;

const normalizeTime = (value) => {
  const text = String(value ?? "").trim();
  if (!TIME_PATTERN.test(text)) return null;
  return text.length === 5 ? `${text}:00` : text;
};

const parseDateOnly = (value) => {
  const text = String(value ?? "").trim();
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text
  )
    return null;
  return text;
};

export const validateShiftPayload = (payload = {}) => {
  const code = String(payload.code ?? payload.shift_code ?? "")
    .trim()
    .toUpperCase();
  if (!SHIFT_CODE_PATTERN.test(code))
    return { error: "Mã ca phải từ 2-20 ký tự, chỉ gồm chữ in hoa, số hoặc gạch dưới" };
  const name = String(payload.name ?? "").trim();
  if (!name) return { error: "Tên ca làm việc không được để trống" };
  if (name.length > 100)
    return { error: "Tên ca làm việc không được vượt quá 100 ký tự" };

  const startTime = normalizeTime(payload.start_time);
  const endTime = normalizeTime(payload.end_time);
  if (!startTime || !endTime)
    return { error: "Giờ bắt đầu và giờ kết thúc phải đúng định dạng HH:MM" };
  if (toMinutes(endTime) <= toMinutes(startTime))
    return { error: "Giờ kết thúc phải lớn hơn giờ bắt đầu trong cùng ngày" };

  const breakStart = normalizeTime(payload.break_start) || "12:00:00";
  let breakEnd = normalizeTime(payload.break_end);
  if (!breakEnd && payload.break_minutes !== undefined) {
    breakEnd = formatTime(
      toMinutes(breakStart) + toNumber(payload.break_minutes, 0),
    );
  }
  if (!breakEnd) breakEnd = "13:30:00";
  if (toMinutes(breakEnd) <= toMinutes(breakStart))
    return { error: "Giờ kết thúc nghỉ giữa ca phải lớn hơn giờ bắt đầu" };

  const gracePeriod = Number(
    payload.grace_period ?? payload.grace_minutes ?? 15,
  );
  if (
    !Number.isInteger(gracePeriod) ||
    gracePeriod < 0 ||
    gracePeriod > 120
  )
    return { error: "Số phút ân hạn đi muộn phải từ 0 đến 120" };

  const minOtMinutes = Number(payload.min_ot_minutes ?? 30);
  if (
    !Number.isInteger(minOtMinutes) ||
    minOtMinutes < 0 ||
    minOtMinutes > 240
  )
    return { error: "Số phút tối thiểu tính tăng ca phải từ 0 đến 240" };

  const legacyUnits = payload.standard_work_units;
  const standardHours =
    payload.standard_hours !== undefined
      ? toNumber(payload.standard_hours, 8)
      : legacyUnits !== undefined
        ? round2(8 * toNumber(legacyUnits, 1))
        : 8;
  const workdayValue =
    payload.workday_value !== undefined
      ? toNumber(payload.workday_value, 1)
      : legacyUnits !== undefined
        ? toNumber(legacyUnits, 1)
        : 1;
  if (standardHours <= 0 || standardHours > 24)
    return { error: "Số giờ chuẩn của ca không hợp lệ" };
  if (![0.5, 1].includes(workdayValue))
    return { error: "Giá trị công chuẩn chỉ nhận 0.5 hoặc 1.0" };

  const isDefault = payload.is_default === undefined ? 0 : Number(payload.is_default) ? 1 : 0;
  const isActive = payload.is_active === undefined ? 1 : Number(payload.is_active) ? 1 : 0;

  return {
    payload: {
      code,
      name,
      start_time: startTime,
      end_time: endTime,
      break_start: breakStart,
      break_end: breakEnd,
      grace_period: gracePeriod,
      min_ot_minutes: minOtMinutes,
      standard_hours: round2(standardHours),
      workday_value: round2(workdayValue),
      is_default: isDefault,
      is_active: isActive,
    },
  };
};

export const listWorkShifts = async () => {
  const [rows] = await db.query(
    `SELECT id, code, name, start_time, end_time, break_start, break_end,
            grace_period, min_ot_minutes, standard_hours, workday_value,
            is_default, is_active
       FROM work_shifts
      ORDER BY is_active DESC, id ASC`,
  );
  return rows.map((row) => ({
    ...row,
    shift_code: row.code,
    break_minutes:
      (toMinutes(row.break_end) ?? 0) - (toMinutes(row.break_start) ?? 0),
    grace_minutes: row.grace_period,
    standard_work_units: row.workday_value,
    is_default: Number(row.is_default) ? 1 : 0,
    is_active: Number(row.is_active) ? 1 : 0,
  }));
};

export const createWorkShift = async (payload) => {
  const [duplicate] = await db.query(
    "SELECT id FROM work_shifts WHERE code = ? LIMIT 1",
    [payload.code],
  );
  if (duplicate.length)
    throw attendanceError("Mã ca làm việc đã tồn tại", 409);
  const [result] = await db.query(
    `INSERT INTO work_shifts
      (code, name, start_time, end_time, break_start, break_end, grace_period,
       min_ot_minutes, standard_hours, workday_value, is_default, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.code,
      payload.name,
      payload.start_time,
      payload.end_time,
      payload.break_start,
      payload.break_end,
      payload.grace_period,
      payload.min_ot_minutes,
      payload.standard_hours,
      payload.workday_value,
      payload.is_default,
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
  if (!existing.length) throw attendanceError("Không tìm thấy ca làm việc", 404);
  const [duplicate] = await db.query(
    "SELECT id FROM work_shifts WHERE code = ? AND id <> ? LIMIT 1",
    [payload.code, shiftId],
  );
  if (duplicate.length)
    throw attendanceError("Mã ca làm việc đã tồn tại", 409);
  await db.query(
    `UPDATE work_shifts
        SET code = ?, name = ?, start_time = ?, end_time = ?,
            break_start = ?, break_end = ?, grace_period = ?,
            min_ot_minutes = ?, standard_hours = ?, workday_value = ?,
            is_default = ?, is_active = ?
      WHERE id = ?`,
    [
      payload.code,
      payload.name,
      payload.start_time,
      payload.end_time,
      payload.break_start,
      payload.break_end,
      payload.grace_period,
      payload.min_ot_minutes,
      payload.standard_hours,
      payload.workday_value,
      payload.is_default,
      payload.is_active,
      shiftId,
    ],
  );
  return { id: Number(shiftId) };
};

const assertEmployeeInScope = async (connection, user, employeeId) => {
  const scope = buildEmployeeScope(user);
  const [employees] = await connection.query(
    `SELECT e.id FROM employees e ${scope.clause || "WHERE 1 = 1"} AND e.id = ? LIMIT 1`,
    [...scope.params, employeeId],
  );
  if (!employees.length)
    throw attendanceError("Nhân viên ngoài phạm vi quản lý", 403);
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
            es.shift_id, s.code AS shift_code, s.name AS shift_name,
            s.start_time, s.end_time,
            DATE_FORMAT(es.effective_from, '%Y-%m-%d') AS effective_from,
            DATE_FORMAT(es.effective_to, '%Y-%m-%d') AS effective_to,
            u.id AS user_id, u.username
       FROM employee_shifts es
      INNER JOIN employees e ON e.id = es.employee_id
      LEFT JOIN departments d ON d.id = e.department_id
      INNER JOIN work_shifts s ON s.id = es.shift_id
      LEFT JOIN users u ON u.employee_id = e.id
      WHERE ${conditions.join(" AND ")}
      ORDER BY es.effective_from DESC, es.id DESC`,
    params,
  );
  return rows.map((row) => ({
    ...row,
    work_days: "MON,TUE,WED,THU,FRI",
    note: null,
  }));
};

export const createShiftAssignment = async (user, payload = {}) => {
  const employeeId = Number(payload.employee_id);
  const shiftId = Number(payload.shift_id);
  if (!Number.isSafeInteger(employeeId) || employeeId <= 0)
    throw attendanceError("Nhân viên phân ca không hợp lệ");
  if (!Number.isSafeInteger(shiftId) || shiftId <= 0)
    throw attendanceError("Ca làm việc không hợp lệ");
  const effectiveFrom = parseDateOnly(payload.effective_from);
  if (!effectiveFrom)
    throw attendanceError("Ngày hiệu lực không hợp lệ (YYYY-MM-DD)");
  const effectiveTo = payload.effective_to
    ? parseDateOnly(payload.effective_to)
    : null;
  if (payload.effective_to && !effectiveTo)
    throw attendanceError("Ngày kết thúc hiệu lực không hợp lệ (YYYY-MM-DD)");
  if (effectiveTo && effectiveTo < effectiveFrom)
    throw attendanceError("Ngày kết thúc phải lớn hơn hoặc bằng ngày hiệu lực");

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await assertEmployeeInScope(connection, user, employeeId);
    const [shifts] = await connection.query(
      "SELECT id FROM work_shifts WHERE id = ? AND is_active = 1 LIMIT 1",
      [shiftId],
    );
    if (!shifts.length)
      throw attendanceError("Ca làm việc không tồn tại hoặc đã ngừng sử dụng");
    const [overlap] = await connection.query(
      `SELECT id FROM employee_shifts
        WHERE employee_id = ? AND effective_from <= ?
          AND (effective_to IS NULL OR effective_to >= ?)
        LIMIT 1`,
      [employeeId, effectiveTo || "9999-12-31", effectiveFrom],
    );
    if (overlap.length)
      throw attendanceError(
        "Nhân viên đã có phân ca trùng khoảng thời gian này",
        409,
      );
    const [result] = await connection.query(
      `INSERT INTO employee_shifts (employee_id, shift_id, effective_from, effective_to)
       VALUES (?, ?, ?, ?)`,
      [employeeId, shiftId, effectiveFrom, effectiveTo],
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
    throw attendanceError("Phân ca cần cập nhật không hợp lệ");
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query(
      "SELECT * FROM employee_shifts WHERE id = ? FOR UPDATE",
      [id],
    );
    if (!existing.length) throw attendanceError("Không tìm thấy phân ca", 404);
    await assertEmployeeInScope(connection, user, existing[0].employee_id);

    const employeeId = Number(payload.employee_id ?? existing[0].employee_id);
    const shiftId = Number(payload.shift_id ?? existing[0].shift_id);
    if (!Number.isSafeInteger(employeeId) || employeeId <= 0)
      throw attendanceError("Nhân viên phân ca không hợp lệ");
    await assertEmployeeInScope(connection, user, employeeId);
    const effectiveFrom = parseDateOnly(
      payload.effective_from ?? existing[0].effective_from,
    );
    if (!effectiveFrom)
      throw attendanceError("Ngày hiệu lực không hợp lệ (YYYY-MM-DD)");
    const rawTo = payload.effective_to ?? existing[0].effective_to;
    const effectiveTo = rawTo ? parseDateOnly(rawTo) : null;
    if (rawTo && !effectiveTo)
      throw attendanceError("Ngày kết thúc hiệu lực không hợp lệ (YYYY-MM-DD)");
    if (effectiveTo && effectiveTo < effectiveFrom)
      throw attendanceError("Ngày kết thúc phải lớn hơn hoặc bằng ngày hiệu lực");

    const [shifts] = await connection.query(
      "SELECT id FROM work_shifts WHERE id = ? AND is_active = 1 LIMIT 1",
      [shiftId],
    );
    if (!shifts.length)
      throw attendanceError("Ca làm việc không tồn tại hoặc đã ngừng sử dụng");
    const [overlap] = await connection.query(
      `SELECT id FROM employee_shifts
        WHERE employee_id = ? AND id <> ? AND effective_from <= ?
          AND (effective_to IS NULL OR effective_to >= ?)
        LIMIT 1`,
      [employeeId, id, effectiveTo || "9999-12-31", effectiveFrom],
    );
    if (overlap.length)
      throw attendanceError(
        "Nhân viên đã có phân ca trùng khoảng thời gian này",
        409,
      );

    await connection.query(
      `UPDATE employee_shifts
          SET employee_id = ?, shift_id = ?, effective_from = ?, effective_to = ?
        WHERE id = ?`,
      [employeeId, shiftId, effectiveFrom, effectiveTo, id],
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
    throw attendanceError("Phân ca cần xóa không hợp lệ");
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query(
      "SELECT * FROM employee_shifts WHERE id = ? FOR UPDATE",
      [id],
    );
    if (!existing.length) throw attendanceError("Không tìm thấy phân ca", 404);
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

export const submitExplanation = async (user, payload = {}) => {
  const employeeId = user?.employee_id;
  if (!employeeId)
    throw attendanceError("Tài khoản chưa liên kết hồ sơ nhân sự", 404);
  const workDate = validateDate(payload.work_date || payload.date);
  const reason = String(payload.reason ?? "").trim();
  if (!reason) throw attendanceError("Vui lòng nhập lý do giải trình");
  if (reason.length > 500)
    throw attendanceError("Lý do giải trình không được vượt quá 500 ký tự");
  const checkIn = payload.check_in ? normalizeTime(payload.check_in) : null;
  const checkOut = payload.check_out ? normalizeTime(payload.check_out) : null;
  if (payload.check_in && !checkIn)
    throw attendanceError("Giờ vào giải trình không hợp lệ (HH:MM)");
  if (payload.check_out && !checkOut)
    throw attendanceError("Giờ ra giải trình không hợp lệ (HH:MM)");
  if (
    checkIn &&
    checkOut &&
    toMinutes(checkOut) <= toMinutes(checkIn)
  )
    throw attendanceError("Giờ ra phải lớn hơn giờ vào");

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const today = await serverDate(connection);
    await connection.query("SELECT id FROM employees WHERE id = ? FOR UPDATE", [
      employeeId,
    ]);
    if (workDate > today)
      throw attendanceError("Không thể gửi giải trình cho ngày trong tương lai");
    await assertMonthOpen(connection, employeeId, workDate);
    const account = await resolveActiveAccount(connection, employeeId);
    const shift = await getShiftForDate(employeeId, workDate, connection);

    const [rows] = await connection.query(
      "SELECT * FROM attendances WHERE employee_id = ? AND work_date = ? FOR UPDATE",
      [employeeId, workDate],
    );
    let attendance = rows[0] || null;
    const noteData = {
      reason,
      status: "PENDING",
      check_in: checkIn || attendance?.check_in || null,
      check_out: checkOut || attendance?.check_out || null,
      submitted_by: Number(employeeId),
      submitted_at: new Date().toISOString(),
      approved_by: null,
      approved_at: null,
      reject_reason: null,
      original: attendance
        ? {
            check_in: attendance.check_in,
            check_out: attendance.check_out,
            late_minutes: attendance.late_minutes,
            early_leave_minutes: attendance.early_leave_minutes,
            base_workday: attendance.base_workday,
            total_workday: attendance.total_workday,
            status: attendance.status,
          }
        : null,
    };

    if (!attendance) {
      if (!shift)
        throw attendanceError("Chưa cấu hình ca làm việc cho nhân viên");
      const withUser = await hasColumn(connection, "attendances", "user_id");
      await insertRawScan(connection, employeeId, account, "RAW_SCAN", {
        device_info: "MANUAL_ADJUST",
      });
      await connection.query(
        `INSERT INTO attendances
          (employee_id, ${withUser ? "user_id, " : ""}shift_id, work_date, note, status)
         VALUES (?, ${withUser ? "?, " : ""}?, ?, ?, 'IN_PROGRESS')`,
        [
          employeeId,
          ...(withUser ? [account.user_id] : []),
          shift.shift_id,
          workDate,
          buildExplanationNote(noteData),
        ],
      );
    } else {
      const existingExplanation = parseExplanationNote(attendance.note);
      if (existingExplanation?.status === "PENDING")
        throw attendanceError("Đã có giải trình đang chờ duyệt cho ngày này", 409);
      if (existingExplanation?.status === "APPROVED")
        throw attendanceError("Giải trình ngày này đã được duyệt", 409);
      await connection.query(
        "UPDATE attendances SET note = ? WHERE id = ?",
        [buildExplanationNote(noteData), attendance.id],
      );
    }

    await connection.commit();
    return { log: { id: attendance?.id || null }, explanation: noteData };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const listExplanations = async (user, filters = {}) => {
  const scope = buildEmployeeScope(user);
  const conditions = ["a.note LIKE '[EXPLAIN_JSON]%'"];
  const params = [];
  if (scope.clause) conditions.push(scope.clause.replace(/^WHERE\s+/i, ""));
  params.push(...scope.params);
  if (filters.employee_id) {
    conditions.push("a.employee_id = ?");
    params.push(Number(filters.employee_id));
  }
  if (filters.month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(filters.month)))
      throw attendanceError("Kỳ giải trình không hợp lệ (YYYY-MM)");
    conditions.push("DATE_FORMAT(a.work_date, '%Y-%m') = ?");
    params.push(filters.month);
  }

  const withUser = await hasColumn(db, "attendances", "user_id");
  const [rows] = await db.query(
    `SELECT a.id, a.employee_id, ${withUser ? "a.user_id, u.username" : "NULL AS user_id, NULL AS username"},
            e.employee_code, e.full_name,
            e.department_id, COALESCE(d.department_name, d.name) AS department_name,
            DATE_FORMAT(a.work_date, '%Y-%m-%d') AS work_date,
            a.shift_id, s.code AS shift_code, a.check_in, a.check_out,
            a.total_workday, a.status AS raw_status, a.note,
            COALESCE(mt.status, 'OPEN') AS month_status
       FROM attendances a
      INNER JOIN employees e ON e.id = a.employee_id
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN work_shifts s ON s.id = a.shift_id
      ${withUser ? "LEFT JOIN users u ON u.id = a.user_id" : ""}
      LEFT JOIN monthly_timesheets mt ON mt.employee_id = a.employee_id AND mt.month_year = DATE_FORMAT(a.work_date, '%Y-%m')
      WHERE ${conditions.join(" AND ")}
      ORDER BY a.work_date DESC, a.id DESC`,
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
    throw attendanceError("Giải trình không hợp lệ");
  const [rows] = await connection.query(
    `SELECT *, DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date_str
       FROM attendances WHERE id = ? FOR UPDATE`,
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
      throw attendanceError("Giải trình đã được xử lý trước đó", 409);
    await assertCanApprove(connection, user, log.employee_id);
    const workDate = log.work_date_str;
    await assertMonthOpen(connection, log.employee_id, workDate);

    const checkIn = payload.check_in
      ? normalizeTime(payload.check_in)
      : explanation.check_in;
    const checkOut = payload.check_out
      ? normalizeTime(payload.check_out)
      : explanation.check_out;
    if (
      (payload.check_in && !checkIn) ||
      (payload.check_out && !checkOut) ||
      (checkIn && checkOut && toMinutes(checkOut) <= toMinutes(checkIn))
    )
      throw attendanceError("Giờ giải trình không hợp lệ", 400);

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
      "UPDATE attendances SET check_in = ?, check_out = ?, note = ? WHERE id = ?",
      [checkIn, checkOut, buildExplanationNote(approved), log.id],
    );
    await recalculateDailyAttendance(connection, log.employee_id, workDate);
    if ([0, 0.5, 1].includes(Number(payload.work_unit))) {
      await connection.query(
        "UPDATE attendances SET base_workday = ?, total_workday = ? WHERE id = ?",
        [Number(payload.work_unit), Number(payload.work_unit), log.id],
      );
    }
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
    throw attendanceError("Vui lòng nhập lý do từ chối giải trình");
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { log, explanation } = await loadExplanationLog(
      connection,
      explanationId,
    );
    if (explanation.status !== "PENDING")
      throw attendanceError("Giải trình đã được xử lý trước đó", 409);
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
    await connection.query(
      "UPDATE attendances SET check_in = ?, check_out = ?, note = ? WHERE id = ?",
      [
        explanation.original?.check_in ?? log.check_in,
        explanation.original?.check_out ?? log.check_out,
        buildExplanationNote(rejected),
        log.id,
      ],
    );
    await recalculateDailyAttendance(connection, log.employee_id, workDate);
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
    if (Number(log.employee_id) !== Number(user?.employee_id))
      throw attendanceError("Chỉ được hủy giải trình của chính mình", 403);
    await assertMonthOpen(connection, log.employee_id, log.work_date_str);
    if (explanation.status !== "PENDING")
      throw attendanceError("Chỉ có thể hủy giải trình đang chờ duyệt", 409);
    const cancelled = { ...explanation, status: "CANCELLED" };
    await connection.query(
      "UPDATE attendances SET check_in = ?, check_out = ?, note = ? WHERE id = ?",
      [
        explanation.original?.check_in ?? log.check_in,
        explanation.original?.check_out ?? log.check_out,
        buildExplanationNote(cancelled),
        log.id,
      ],
    );
    await recalculateDailyAttendance(
      connection,
      log.employee_id,
      log.work_date_str,
    );
    await recalculateEmployeeMonth(
      connection,
      log.employee_id,
      log.work_date_str.slice(0, 7),
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
