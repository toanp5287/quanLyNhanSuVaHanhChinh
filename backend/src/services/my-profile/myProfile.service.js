import bcrypt from "bcryptjs";
import { db } from "../../config/database.js";
import { verifyPassword } from "../auth/auth.service.js";
import { attendanceError, validateBiometricCapture, evaluateFullSetMatch, computeCentroid, l2Normalize, FACE_MATCH_THRESHOLD } from "../diem-danh-nhat-ky-quet-the-phan-ca/diemDanhNhatKyQuetThePhanCa.service.js";

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

export const updateSelfFaceDescriptor = async (employeeId, values, password, blinkVerified, capture = null) => {
  if (!employeeId) return null;
  const samples = validateBiometricCapture(values, blinkVerified, 0.82, capture);
  if (typeof password !== "string" || !password)
    throw attendanceError("Nhập mật khẩu tài khoản để xác nhận đăng ký hoặc thay đổi FaceID.");
  await verifySelfFacePassword(employeeId, password);

  const compact = vector => vector.map(value => Number(value.toFixed(5)));
  const descriptorJson = JSON.stringify({
    model: capture?.model || null,
    centroid: compact(computeCentroid(samples)),
    samples: samples.map(sample => compact(l2Normalize(sample))),
  });
  if (Buffer.byteLength(descriptorJson, "utf8") > 60000) {
    throw attendanceError("Bộ mẫu khuôn mặt vượt giới hạn lưu trữ. Vui lòng quét lại để tạo mẫu gọn hơn.", 413);
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [lockRows] = await connection.query("SELECT GET_LOCK('hrm_face_enrollment', 10) AS locked");
    if (Number(lockRows[0]?.locked) !== 1)
      throw attendanceError("Hệ thống đang cập nhật FaceID cho người khác. Vui lòng thử lại.", 409);
    try {
      const [employees] = await connection.query(
        "SELECT id, employee_code, full_name, face_descriptor FROM employees WHERE id = ? OR face_descriptor IS NOT NULL",
        [employeeId],
      );
      if (!employees.some(employee => Number(employee.id) === Number(employeeId)))
        throw attendanceError("Không tìm thấy hồ sơ nhân viên", 404);
      const conflict = employees
        .filter(employee => Number(employee.id) !== Number(employeeId) && employee.face_descriptor)
        .map(employee => ({ employee, ...evaluateFullSetMatch(samples, employee.face_descriptor, FACE_MATCH_THRESHOLD) }))
        .filter(match => match.isMatch)
        .sort((a, b) => b.avgScore - a.avgScore)[0];
      if (conflict) {
        const employee = conflict.employee;
        throw Object.assign(attendanceError(`PHÁT HIỆN TRÙNG HỒ SƠ SINH TRẮC HỌC: Cả bộ mẫu khuôn mặt vừa quét trùng khớp ${(conflict.avgScore * 100).toFixed(1)}% (${conflict.passCount}/${conflict.totalSamples} mẫu) với hồ sơ [${employee.employee_code} - ${employee.full_name}]. Một khuôn mặt chỉ được dùng cho một tài khoản.`, 409), {
          error_code: "FACE_DUPLICATE_CONFLICT",
          conflict_employee: { id: employee.id, employee_code: employee.employee_code, full_name: employee.full_name, similarity_percent: Number((conflict.avgScore * 100).toFixed(1)), matched_samples: `${conflict.passCount}/${conflict.totalSamples}` },
        });
      }
      await connection.query("UPDATE employees SET face_descriptor = ? WHERE id = ?", [descriptorJson, employeeId]);
      await connection.commit();
      return { has_face_descriptor: true };
    } finally {
      await connection.query("SELECT RELEASE_LOCK('hrm_face_enrollment')");
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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
  const sample = l2Normalize(embedding);
  const [employees] = await db.query("SELECT id, employee_code, full_name, face_descriptor FROM employees WHERE id <> ? AND face_descriptor IS NOT NULL", [employeeId]);
  const conflict = employees
    .map(employee => ({ employee, ...evaluateFullSetMatch([sample], employee.face_descriptor, FACE_MATCH_THRESHOLD) }))
    .filter(match => match.isMatch)
    .sort((left, right) => right.avgScore - left.avgScore)[0];
  if (conflict) {
    const employee = conflict.employee;
    throw Object.assign(attendanceError(`Khuôn mặt này đã được kích hoạt cho tài khoản [${employee.employee_code} - ${employee.full_name}] (${(conflict.avgScore * 100).toFixed(1)}%). Một khuôn mặt chỉ được dùng cho một tài khoản, vui lòng không quét lại.`, 409), {
      error_code: "FACE_ALREADY_ACTIVATED",
      conflict_employee: { id: employee.id, employee_code: employee.employee_code, full_name: employee.full_name, similarity_percent: Number((conflict.avgScore * 100).toFixed(1)), matched_samples: `${conflict.passCount}/${conflict.totalSamples}` },
    });
  }
  return { allowed: true };
};

export const clearSelfFaceDescriptor = async (employeeId, password) => {
  if (!employeeId) return null;
  if (typeof password !== "string" || !password)
    throw attendanceError("Nhập mật khẩu tài khoản để xác nhận đặt lại FaceID.", 400);
  await verifySelfFacePassword(employeeId, password);
  await db.query("UPDATE employees SET face_descriptor = NULL WHERE id = ?", [
    employeeId,
  ]);
  return { has_face_descriptor: false };
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
