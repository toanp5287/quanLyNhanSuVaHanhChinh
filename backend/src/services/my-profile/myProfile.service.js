import bcrypt from "bcryptjs";
import { db } from "../../config/database.js";
import { verifyPassword } from "../auth/auth.service.js";
import {
  attendanceError,
  validateBiometricCapture,
  computeCentroid,
  computeIntraFaceScore,
  findDuplicateFace,
  l2Normalize,
  cosineSimilarity,
  DUPLICATE_FACE_THRESHOLD,
  FACE_STORAGE_MODEL,
  FACE_ENROLLMENT_CONFIG,
  evaluateEnrollmentDuplicate,
} from "../diem-danh-nhat-ky-quet-the-phan-ca/diemDanhNhatKyQuetThePhanCa.service.js";
import {
  publishFaceResolved,
  resolveFaceAlertsForEmployee,
} from "../notifications/notification.service.js";

const hasEmployeeColumn = async (connection, columnName) => {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS total
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'employees'
        AND COLUMN_NAME = ?`,
    [columnName],
  );
  return Number(rows[0]?.total) > 0;
};

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
    (e.face_descriptor IS NOT NULL) AS has_face_descriptor,
    e.face_status,
    DATE_FORMAT(e.face_enrolled_at, '%Y-%m-%d %H:%i:%s') AS face_enrolled_at,
    DATE_FORMAT(e.face_reset_at, '%Y-%m-%d %H:%i:%s') AS face_reset_at,
    e.face_reset_reason,
    e.manager_id,
    e.data_scope,
    COALESCE(d.department_code, d.dept_code) AS department_code,
    COALESCE(d.department_name, d.name) AS department_name,
    COALESCE(p.position_code, p.pos_code) AS position_code,
    COALESCE(p.position_name, p.name, p.title) AS position_name,
    COALESCE(p.position_name, p.name, p.title) AS position_title,
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
    COALESCE(fd.department_name, fd.name) AS from_department_name,
    COALESCE(td.department_name, td.name) AS to_department_name,
    COALESCE(fp.position_name, fp.name, fp.title) AS from_position_title,
    COALESCE(tp.position_name, tp.name, tp.title) AS to_position_title
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

let enrollmentQueue = Promise.resolve();
const withEnrollmentLock = async (work) => {
  const previous = enrollmentQueue.catch(() => undefined);
  let release;
  enrollmentQueue = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await work();
  } finally {
    release();
  }
};

const assertEnrollmentSamples = (values) => {
  const expected = FACE_ENROLLMENT_CONFIG.sampleCount;
  const dim = FACE_ENROLLMENT_CONFIG.vectorDimension;
  if (!Array.isArray(values) || values.length !== expected)
    throw Object.assign(attendanceError(`Cần đúng ${expected} mẫu khuôn mặt để kích hoạt FaceID.`, 400), {
      error_code: "INVALID_FACE_SAMPLES",
    });
  if (values.some(vector =>
    !Array.isArray(vector) ||
    vector.length !== dim ||
    vector.some(value => typeof value !== "number" || !Number.isFinite(value))
  ))
    throw Object.assign(attendanceError(`Mỗi mẫu khuôn mặt phải có đúng ${dim} chiều và là số hợp lệ.`, 400), {
      error_code: "INVALID_FACE_SAMPLES",
    });
};

const validateEnrollmentCapture = (capture) => {
  if (!capture || typeof capture !== "object") return;
  const quality = capture.quality || {};
  const liveness = capture.liveness || {};
  const minReal = Number(quality.min_real ?? liveness.min_real ?? 0);
  const minLive = Number(quality.min_live ?? liveness.min_live ?? 0);
  if (Number.isFinite(minReal) && minReal < FACE_ENROLLMENT_CONFIG.minReal)
    throw Object.assign(attendanceError("Xác thực chống giả mạo chưa đạt yêu cầu. Vui lòng quét lại trong điều kiện thật.", 400), {
      error_code: "FACE_LIVENESS_FAILED",
    });
  if (Number.isFinite(minLive) && minLive < FACE_ENROLLMENT_CONFIG.minLive)
    throw Object.assign(attendanceError("Xác thực sống chưa đạt yêu cầu. Vui lòng quét lại.", 400), {
      error_code: "FACE_LIVENESS_FAILED",
    });
};

const normalizeEnrollmentSamples = (values, blinkVerified, capture) => {
  assertEnrollmentSamples(values);
  validateEnrollmentCapture(capture);
  const samples = validateBiometricCapture(values, Boolean(blinkVerified), FACE_ENROLLMENT_CONFIG.intraMin, capture, {
    liveness_enabled: false,
  });
  let minSim = 1;
  let maxSim = -1;
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      const score = cosineSimilarity(samples[i], samples[j]);
      minSim = Math.min(minSim, score);
      maxSim = Math.max(maxSim, score);
    }
  }
  if (maxSim > FACE_ENROLLMENT_CONFIG.staticSampleMax)
    throw Object.assign(attendanceError("Phát hiện ảnh tĩnh không hợp lệ. Vui lòng quét khuôn mặt thật trực tiếp.", 400), {
      error_code: "SPOOF_STATIC_SAMPLES",
    });
  if (minSim < FACE_ENROLLMENT_CONFIG.intraMin)
    throw Object.assign(attendanceError("Các mẫu khuôn mặt không đồng nhất, vui lòng giữ yên nhìn thẳng.", 400), {
      error_code: "INCONSISTENT_SAMPLES",
    });
  const compact = (vector) => l2Normalize(vector).map((value) => Number(value.toFixed(6)));
  const normalizedSamples = samples.map(compact);
  const centroid = compact(computeCentroid(normalizedSamples));
  const quality = capture?.quality || {};
  const liveness = capture?.liveness || {};
  return {
    samples: normalizedSamples,
    centroid,
    quality: {
      intraMin: Number(minSim.toFixed(6)),
      intraMax: Number(maxSim.toFixed(6)),
      realMedian: Number(quality.min_real ?? liveness.min_real ?? 0) || undefined,
      liveMedian: Number(quality.min_live ?? liveness.min_live ?? 0) || undefined,
    },
  };
};

const enrollmentError = (message, status, errorCode, extra = {}) =>
  Object.assign(attendanceError(message, status), { error_code: errorCode, ...extra });

export const updateSelfFaceDescriptor = async (employeeId, values, password, blinkVerified, capture = null, securityMeta = {}) => {
  if (!employeeId) return null;
  const prepared = normalizeEnrollmentSamples(values, blinkVerified, capture);
  if (typeof password !== "string" || !password)
    throw attendanceError("Nhập mật khẩu tài khoản để xác nhận đăng ký hoặc thay đổi FaceID.");
  await verifySelfFacePassword(employeeId, password);

  const descriptorJson = JSON.stringify({
    model: FACE_STORAGE_MODEL,
    dimension: FACE_ENROLLMENT_CONFIG.vectorDimension,
    centroid: prepared.centroid,
    samples: prepared.samples,
    quality: prepared.quality,
  });
  if (Buffer.byteLength(descriptorJson, "utf8") > 60000) {
    throw enrollmentError("Bộ mẫu khuôn mặt vượt giới hạn lưu trữ. Vui lòng quét lại để tạo mẫu gọn hơn.", 413, "FACE_DESCRIPTOR_TOO_LARGE");
  }

  return withEnrollmentLock(async () => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [lockRows] = await connection.query("SELECT GET_LOCK('hrm_face_enrollment', 10) AS locked");
      if (Number(lockRows[0]?.locked) !== 1)
        throw enrollmentError("Hệ thống đang cập nhật FaceID cho người khác. Vui lòng thử lại.", 409, "FACE_ENROLLMENT_BUSY");
      try {
        const [currentRows] = await connection.query(
          "SELECT id, employee_code, full_name, face_status, face_descriptor FROM employees WHERE id = ? FOR UPDATE",
          [employeeId],
        );
        const current = currentRows[0];
        if (!current) throw enrollmentError("Không tìm thấy hồ sơ nhân viên", 404, "EMPLOYEE_NOT_FOUND");
        if (current.face_status === "ACTIVE" && current.face_descriptor) {
          console.log("[FACE_ENROLL]", JSON.stringify({
            currentUserId: employeeId,
            bestMatchScore: 0,
            matchedEmployeeId: null,
            thresholdUsed: FACE_ENROLLMENT_CONFIG.duplicateHardThreshold,
            isDuplicate: false,
            intraMin: prepared.quality.intraMin,
            blockedReason: "FACE_ALREADY_ENROLLED",
          }));
          throw enrollmentError(
            "Tài khoản đã kích hoạt FaceID. Vui lòng liên hệ Admin/HR để reset trước khi đăng ký lại.",
            409,
            "FACE_ALREADY_ENROLLED",
          );
        }

        const [others] = await connection.query(
          "SELECT id, employee_code, full_name, face_descriptor FROM employees WHERE id <> ? AND face_status = 'ACTIVE' AND face_descriptor IS NOT NULL AND TRIM(face_descriptor) <> '' FOR UPDATE",
          [employeeId],
        );
        const duplicate = evaluateEnrollmentDuplicate(prepared.centroid, prepared.samples, others, FACE_ENROLLMENT_CONFIG);
        console.log("[FACE_ENROLL]", JSON.stringify({
          currentUserId: employeeId,
          bestMatchScore: Number(duplicate.bestMatchScore.toFixed(6)),
          matchedEmployeeId: duplicate.matchedEmployeeId,
          thresholdUsed: duplicate.thresholdUsed,
          isDuplicate: duplicate.isDuplicate,
          status: duplicate.status,
          intraMin: prepared.quality.intraMin,
          intraMax: prepared.quality.intraMax,
        }));
        if (duplicate.status === "DUPLICATE_FACE_DETECTED")
          throw enrollmentError(
            "Khuôn mặt này đã được đăng ký cho một tài khoản nhân viên khác trong hệ thống.",
            409,
            "DUPLICATE_FACE_DETECTED",
          );
        if (duplicate.status === "SIMILAR_FACE_REVIEW_REQUIRED")
          throw enrollmentError(
            "Khuôn mặt có độ tương đồng bất thường với dữ liệu đã tồn tại. Vui lòng liên hệ HR/Admin xác minh trực tiếp.",
            409,
            "SIMILAR_FACE_REVIEW_REQUIRED",
          );

        const withDevice = await hasEmployeeColumn(connection, "device_id");
        const withClientIp = await hasEmployeeColumn(connection, "client_ip");
        const sets = [
          "face_descriptor = ?",
          "face_status = 'ACTIVE'",
          "face_enrolled_at = NOW()",
        ];
        const params = [descriptorJson];
        if (withDevice) {
          sets.push("device_id = ?");
          params.push(securityMeta.device_id || null);
        }
        if (withClientIp) {
          sets.push("client_ip = ?");
          params.push(securityMeta.client_ip || null);
        }
        params.push(employeeId);
        const [result] = await connection.query(
          `UPDATE employees SET ${sets.join(", ")} WHERE id = ? AND face_status = 'UNREGISTERED'`,
          params,
        );
        if (result.affectedRows !== 1)
          throw enrollmentError("Trạng thái FaceID vừa thay đổi. Vui lòng tải lại trang và thử lại.", 409, "FACE_STATUS_CONFLICT");

        const [updated] = await connection.query(
          `SELECT id, face_status,
                  DATE_FORMAT(face_enrolled_at, '%Y-%m-%d %H:%i:%s') AS face_enrolled_at
           FROM employees WHERE id = ?`,
          [employeeId],
        );
        await connection.commit();
        await resolveFaceAlertsForEmployee(connection, employeeId);
        await publishFaceResolved(employeeId);
        return {
          has_face_descriptor: true,
          face_status: updated[0]?.face_status || "ACTIVE",
          face_enrolled_at: updated[0]?.face_enrolled_at || null,
        };
      } finally {
        await connection.query("SELECT RELEASE_LOCK('hrm_face_enrollment')");
      }
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  });
};

export const verifySelfFacePassword = async (employeeId, password) => {
  if (!employeeId) throw attendanceError("Không tìm thấy hồ sơ nhân viên", 404);
  const [users] = await db.query("SELECT password_hash FROM users WHERE employee_id = ? AND is_active = 1 LIMIT 1", [employeeId]);
  if (!users.length || !await verifyPassword(password, users[0].password_hash)) {
    throw attendanceError("Mật khẩu xác nhận không đúng", 403);
  }
  return true;
};

export const checkRegisteredFaceOwner = async (employeeId, embedding) => {
  if (!employeeId) throw attendanceError("Không tìm thấy hồ sơ nhân viên", 404);
  if (!Array.isArray(embedding) || embedding.length !== FACE_ENROLLMENT_CONFIG.vectorDimension || embedding.some(value => typeof value !== "number" || !Number.isFinite(value)))
    throw enrollmentError("Mẫu kiểm tra FaceID không hợp lệ (cần 1024 chiều).", 400, "INVALID_FACE_SAMPLES");
  const sample = l2Normalize(embedding).map((value) => Number(value.toFixed(6)));
  return withEnrollmentLock(async () => {
    const [currentRows] = await db.query("SELECT face_status, face_descriptor FROM employees WHERE id = ?", [employeeId]);
    if (currentRows[0]?.face_status === "ACTIVE" && currentRows[0]?.face_descriptor)
      throw enrollmentError(
        "Tài khoản đã kích hoạt FaceID. Vui lòng liên hệ Admin/HR để reset trước khi đăng ký lại.",
        409,
        "FACE_ALREADY_ENROLLED",
      );
    const [employees] = await db.query("SELECT id, employee_code, full_name, face_descriptor FROM employees WHERE id <> ? AND face_status = 'ACTIVE' AND face_descriptor IS NOT NULL AND TRIM(face_descriptor) <> ''", [employeeId]);
    const duplicate = evaluateEnrollmentDuplicate(sample, [sample], employees, FACE_ENROLLMENT_CONFIG);
    console.log("[FACE_CHECK]", JSON.stringify({
      currentUserId: employeeId,
      bestMatchScore: Number(duplicate.bestMatchScore.toFixed(6)),
      matchedEmployeeId: duplicate.matchedEmployeeId,
      thresholdUsed: duplicate.thresholdUsed,
      isDuplicate: duplicate.isDuplicate,
      status: duplicate.status,
    }));
    if (duplicate.status === "DUPLICATE_FACE_DETECTED")
      throw enrollmentError(
        "Khuôn mặt này đã được đăng ký cho một tài khoản nhân viên khác trong hệ thống.",
        409,
        "DUPLICATE_FACE_DETECTED",
      );
    if (duplicate.status === "SIMILAR_FACE_REVIEW_REQUIRED")
      throw enrollmentError(
        "Khuôn mặt có độ tương đồng bất thường với dữ liệu đã tồn tại. Vui lòng liên hệ HR/Admin xác minh trực tiếp.",
        409,
        "SIMILAR_FACE_REVIEW_REQUIRED",
      );
    return { allowed: true };
  });
};

export const clearSelfFaceDescriptor = async () => {
  throw attendanceError("Không thể tự Reset FaceID. Vui lòng liên hệ Admin/HR để mở khóa và ghi rõ lý do.", 403);
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
