const fs=require('fs');
const p='D:/quanLyNhanSuVaHanhChinh/backend/src/services/diem-danh-nhat-ky-quet-the-phan-ca/diemDanhNhatKyQuetThePhanCa.service.js';
let s=fs.readFileSync(p,'utf8');
const old=`export const createShiftAssignment = async (user, payload = {}) => {
  await ensureWorkShiftSchema();
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
      \`SELECT id FROM employee_shifts
        WHERE employee_id = ? AND effective_from <= ?
          AND (effective_to IS NULL OR effective_to >= ?)
        LIMIT 1\`,
      [employeeId, effectiveTo || "9999-12-31", effectiveFrom],
    );
    if (overlap.length)
      throw attendanceError(
        "Nhân viên đã có phân ca trùng khoảng thời gian này",
        409,
      );
    const [result] = await connection.query(
      \`INSERT INTO employee_shifts (employee_id, shift_id, effective_from, effective_to)
       VALUES (?, ?, ?, ?)\`,
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
};`;
const neu=`const getShiftAssignmentImpactDates = async (connection, employeeId, fromDate, toDate) => {
  const start = formatDateOnly(fromDate);
  const end = toDate ? formatDateOnly(toDate) : (await serverDate(connection));
  if (!start || !end) return [];
  const finalEnd = end < start ? start : end;
  const [rows] = await connection.query(
    \`SELECT DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date
       FROM attendances
      WHERE employee_id = ? AND work_date >= ? AND work_date <= ?
      ORDER BY work_date\`,
    [employeeId, start, finalEnd],
  );
  return [...new Set(rows.map((r) => formatDateOnly(r.work_date)).filter(Boolean))];
};

const recalcImpactedAttendanceDates = async (connection, impacts = []) => {
  const summary = { recalculated_days: 0, recalculated_employees: 0, skipped_locked_days: 0, affected_months: [] };
  const employeeMonths = new Map();
  const seenEmployees = new Set();
  for (const impact of impacts) {
    const employeeId = Number(impact.employee_id);
    const dates = [...new Set((impact.dates || []).map(formatDateOnly).filter(Boolean))];
    if (!employeeId || !dates.length) continue;
    for (const workDate of dates) {
      const month = monthFromDate(workDate);
      const [monthRows] = await connection.query(
        "SELECT status FROM monthly_timesheets WHERE employee_id = ? AND month_year = ? FOR UPDATE",
        [employeeId, month],
      );
      if (monthRows[0]?.status === "LOCKED") { summary.skipped_locked_days += 1; continue; }
      await recalculateDailyAttendance(connection, employeeId, workDate);
      summary.recalculated_days += 1;
      seenEmployees.add(employeeId);
      const key = \`\${employeeId}:\${month}\`;
      if (!employeeMonths.has(key)) employeeMonths.set(key, { employee_id: employeeId, month_year: month });
    }
  }
  for (const item of employeeMonths.values()) {
    const [monthRows] = await connection.query(
      "SELECT status FROM monthly_timesheets WHERE employee_id = ? AND month_year = ? FOR UPDATE",
      [item.employee_id, item.month_year],
    );
    if (monthRows[0]?.status === "LOCKED") continue;
    await recalculateEmployeeMonth(connection, item.employee_id, item.month_year);
    summary.affected_months.push(item);
  }
  summary.recalculated_employees = seenEmployees.size;
  return summary;
};

export const createShiftAssignment = async (user, payload = {}) => {
  await ensureWorkShiftSchema();
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
      \`SELECT id FROM employee_shifts
        WHERE employee_id = ? AND effective_from <= ?
          AND (effective_to IS NULL OR effective_to >= ?)
        LIMIT 1\`,
      [employeeId, effectiveTo || "9999-12-31", effectiveFrom],
    );
    if (overlap.length)
      throw attendanceError("Nhân viên đã có phân ca trùng khoảng thời gian này", 409);
    const [result] = await connection.query(
      \`INSERT INTO employee_shifts (employee_id, shift_id, effective_from, effective_to)
       VALUES (?, ?, ?, ?)\`,
      [employeeId, shiftId, effectiveFrom, effectiveTo],
    );
    const impactDates = await getShiftAssignmentImpactDates(connection, employeeId, effectiveFrom, effectiveTo);
    const recalc_summary = await recalcImpactedAttendanceDates(connection, [{ employee_id: employeeId, dates: impactDates }]);
    await connection.commit();
    return { id: result.insertId, recalc_summary };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};`;
if(!s.includes(old)){console.error('missing'); process.exit(1);} 
fs.writeFileSync(p,s.replace(old,neu),'utf8');
console.log('ok');
