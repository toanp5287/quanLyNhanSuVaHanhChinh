import { db } from "../../config/database.js";
import {
  clearLatePenalty,
  ensureAttendancePolicySchema,
  getPolicyForShift,
  getDefaultPolicy,
} from "../attendance-policy/attendancePolicy.service.js";
import {
  createNotification,
  ensureNotificationSchema,
  notifyEmployee,
  notifyUsers,
} from "../notifications/notification.service.js";

const LEVELS = {
  NONE: "NONE",
  LEVEL_1_REMINDER: "LEVEL_1_REMINDER",
  LEVEL_2_ESCALATED: "LEVEL_2_ESCALATED",
  LEVEL_3_DISCIPLINARY: "LEVEL_3_DISCIPLINARY",
};

const DEFAULT_LATE_RULES = {
  grace_late_minutes: 5,
  grace_late_monthly_quota: 3,
  late_explain_deadline_hours: 24,
  late_approval_reminder_hours: 24,
  late_approval_escalate_hours: 48,
  late_escalation: {
    warning_min_count: 1,
    escalation_min_count: 3,
    disciplinary_min_count: 5,
    consecutive_days_limit: 3,
    manager_level_offset: 1,
  },
};

const serviceError = (message, status = 400, code = null) =>
  Object.assign(new Error(message), { status, code });

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const toDateOnly = (value) => {
  if (value instanceof Date) {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value);
  }
  return String(value ?? "").slice(0, 10);
};

const toDateTime = (value) => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .format(value)
      .replace("T", " ");
  }
  return String(value);
};

const cycleMonth = (dateValue) => toDateOnly(dateValue).slice(0, 7);

const parseJson = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export const mergeLateRules = (value) => {
  const raw = parseJson(value, {});
  return {
    ...DEFAULT_LATE_RULES,
    ...raw,
    grace_late_minutes: toNumber(raw.grace_late_minutes ?? DEFAULT_LATE_RULES.grace_late_minutes, DEFAULT_LATE_RULES.grace_late_minutes),
    grace_late_monthly_quota: toNumber(
      raw.grace_late_monthly_quota ?? DEFAULT_LATE_RULES.grace_late_monthly_quota,
      DEFAULT_LATE_RULES.grace_late_monthly_quota,
    ),
    late_explain_deadline_hours: toNumber(
      raw.late_explain_deadline_hours ?? DEFAULT_LATE_RULES.late_explain_deadline_hours,
      DEFAULT_LATE_RULES.late_explain_deadline_hours,
    ),
    late_approval_reminder_hours: toNumber(
      raw.late_approval_reminder_hours ?? DEFAULT_LATE_RULES.late_approval_reminder_hours,
      DEFAULT_LATE_RULES.late_approval_reminder_hours,
    ),
    late_approval_escalate_hours: toNumber(
      raw.late_approval_escalate_hours ?? DEFAULT_LATE_RULES.late_approval_escalate_hours,
      DEFAULT_LATE_RULES.late_approval_escalate_hours,
    ),
    late_escalation: {
      ...DEFAULT_LATE_RULES.late_escalation,
      ...(raw.late_escalation || {}),
    },
  };
};

let schemaPromise;
export const ensureLateExplanationSchema = async () => {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await ensureAttendancePolicySchema();

      const tableExists = async (name) => {
        const [rows] = await db.query(
          "SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
          [name],
        );
        return Number(rows[0]?.total) > 0;
      };
      const addColumnIfMissing = async (table, column, definition) => {
        const [rows] = await db.query(
          "SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
          [table, column],
        );
        if (!Number(rows[0]?.total)) {
          await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        }
      };

      if (!(await tableExists("approval_delegations"))) {
        await db.query(
          `CREATE TABLE approval_delegations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          delegator_id INT NOT NULL,
          delegate_id INT NOT NULL,
          scope ENUM('LATE_EXPLANATION','ALL_APPROVALS') NOT NULL DEFAULT 'LATE_EXPLANATION',
          start_at DATETIME NOT NULL,
          end_at DATETIME NOT NULL,
          reason VARCHAR(500) NULL,
          is_active TINYINT(1) NOT NULL DEFAULT 1,
          created_by INT NULL,
          revoked_by INT NULL,
          revoked_at DATETIME NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_delegation_lookup (delegator_id, is_active, scope, start_at, end_at),
          KEY idx_delegation_delegate (delegate_id, is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        );
      }
      if (!(await tableExists("attendance_grace_usages"))) {
        await db.query(
          `CREATE TABLE attendance_grace_usages (
          id INT AUTO_INCREMENT PRIMARY KEY,
          attendance_id INT NOT NULL,
          employee_id INT NOT NULL,
          shift_id INT NULL,
          work_date DATE NOT NULL,
          checkin_time DATETIME NULL,
          late_minutes INT NOT NULL DEFAULT 0,
          grace_applied_minutes INT NOT NULL DEFAULT 0,
          cycle_month CHAR(7) NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_grace_attendance (attendance_id),
          KEY idx_grace_employee_month (employee_id, cycle_month)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        );
      }
      if (!(await tableExists("attendance_late_explanations"))) {
        await db.query(
          `CREATE TABLE attendance_late_explanations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          attendance_id INT NOT NULL,
          employee_id INT NOT NULL,
          shift_id INT NULL,
          work_date DATE NOT NULL,
          scheduled_start_time TIME NOT NULL DEFAULT '08:00:00',
          actual_arrival_time TIME NOT NULL DEFAULT '08:00:00',
          checkin_time DATETIME NULL,
          late_minutes INT NOT NULL DEFAULT 0,
          cycle_month CHAR(7) NOT NULL,
          submission_status ENUM('PENDING_SUBMIT','SUBMITTED','OVERDUE') NOT NULL DEFAULT 'PENDING_SUBMIT',
          reason_category ENUM('LEGITIMATE','PERSONAL_ROUTINE','UNSUBMITTED_OVERDUE') NULL,
          reason_detail TEXT NULL,
          evidence_url VARCHAR(500) NULL,
          pre_notified TINYINT(1) NOT NULL DEFAULT 0,
          pre_notified_at DATETIME NULL,
          submit_deadline_at DATETIME NOT NULL,
          submitted_at DATETIME NULL,
          is_on_time TINYINT(1) NOT NULL DEFAULT 1,
          monthly_late_count_at_submit INT NOT NULL DEFAULT 0,
          consecutive_late_days_at_submit INT NOT NULL DEFAULT 0,
          escalation_level ENUM('NONE','LEVEL_1_REMINDER','LEVEL_2_ESCALATED','LEVEL_3_DISCIPLINARY') NOT NULL DEFAULT 'NONE',
          approver_id INT NULL,
          delegated_approver_id INT NULL,
          approval_status ENUM('PENDING','APPROVED','REJECTED','AUTO_SELF_DECLARED','EXPIRED') NOT NULL DEFAULT 'PENDING',
          approved_by INT NULL,
          approved_at DATETIME NULL,
          approver_note TEXT NULL,
          reminded_24h_at DATETIME NULL,
          escalated_48h_at DATETIME NULL,
          hr_status ENUM('PENDING_HR','RECORDED','INVALID_SUBMISSION') NOT NULL DEFAULT 'PENDING_HR',
          hr_note TEXT NULL,
          hr_verified_by INT NULL,
          hr_verified_at DATETIME NULL,
          discipline_reference_id INT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_exp_attendance (attendance_id),
          KEY idx_exp_employee_month (employee_id, cycle_month),
          KEY idx_exp_approval_queue (approval_status, submission_status, approver_id),
          KEY idx_exp_hr_queue (hr_status, approval_status),
          KEY idx_exp_deadline (submission_status, submit_deadline_at),
          KEY idx_exp_sla (submission_status, approval_status, submitted_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        );
      }
      if (!(await tableExists("attendance_late_escalation_logs"))) {
        await db.query(
          `CREATE TABLE attendance_late_escalation_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          explanation_id INT NULL,
          attendance_id INT NULL,
          employee_id INT NOT NULL,
          trigger_type VARCHAR(50) NOT NULL,
          escalation_level ENUM('NONE','LEVEL_1_REMINDER','LEVEL_2_ESCALATED','LEVEL_3_DISCIPLINARY') NOT NULL,
          monthly_late_count INT NOT NULL DEFAULT 0,
          consecutive_late_days INT NOT NULL DEFAULT 0,
          notified_to_id INT NULL,
          note TEXT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_late_log_employee (employee_id, created_at),
          KEY idx_late_log_explanation (explanation_id, trigger_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        );
      }

      for (const [table, column, definition] of [
        ["approval_delegations", "created_by", "INT NULL"],
        ["approval_delegations", "revoked_by", "INT NULL"],
        ["approval_delegations", "revoked_at", "DATETIME NULL"],
        ["attendance_grace_usages", "shift_id", "INT NULL"],
        ["attendance_grace_usages", "checkin_time", "DATETIME NULL"],
        ["attendance_late_explanations", "shift_id", "INT NULL"],
        ["attendance_late_explanations", "scheduled_start_time", "TIME NULL"],
        ["attendance_late_explanations", "actual_arrival_time", "TIME NULL"],
        ["attendance_late_explanations", "checkin_time", "DATETIME NULL"],
        ["attendance_late_explanations", "cycle_month", "CHAR(7) NULL"],
        ["attendance_late_explanations", "discipline_reference_id", "INT NULL"],
        ["attendance_late_escalation_logs", "attendance_id", "INT NULL"],
        ["attendance_late_escalation_logs", "monthly_late_count", "INT NOT NULL DEFAULT 0"],
        ["attendance_late_escalation_logs", "consecutive_late_days", "INT NOT NULL DEFAULT 0"],
        ["positions", "level_rank", "INT NULL DEFAULT 0"],
      ]) {
        await addColumnIfMissing(table, column, definition);
      }

      await db.query(
        "UPDATE attendance_late_explanations SET cycle_month = DATE_FORMAT(work_date, '%Y-%m') WHERE cycle_month IS NULL OR cycle_month = ''",
      );
      await db.query(
        "ALTER TABLE attendance_late_escalation_logs MODIFY COLUMN trigger_type VARCHAR(50) NOT NULL",
      );
      await db.query(
        "ALTER TABLE attendance_late_explanations MODIFY COLUMN approver_note TEXT NULL, MODIFY COLUMN hr_note TEXT NULL",
      );
      await db.query(
        "ALTER TABLE attendance_late_explanations MODIFY COLUMN reason_category ENUM('LEGITIMATE','PERSONAL_ROUTINE','UNSUBMITTED_OVERDUE') NULL DEFAULT NULL",
      );
      await db.query(
        "ALTER TABLE approval_delegations MODIFY COLUMN reason VARCHAR(500) NULL",
      );
      await db.query(
        "ALTER TABLE attendance_late_escalation_logs MODIFY COLUMN note TEXT NULL",
      );

      const [policies] = await db.query(
        "SELECT id, rules_json FROM attendance_policies",
      );
      for (const policy of policies) {
        const merged = mergeLateRules(policy.rules_json);
        if (JSON.stringify(merged) !== JSON.stringify(parseJson(policy.rules_json, {}))) {
          await db.query("UPDATE attendance_policies SET rules_json = ? WHERE id = ?", [
            JSON.stringify(merged),
            policy.id,
          ]);
        }
      }
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
};

const resolveRules = async (connection = db, shiftId = null, policy = null) => {
  await ensureLateExplanationSchema();
  if (policy?.rules || policy?.rules_json) return mergeLateRules(policy.rules ?? policy.rules_json);
  let resolved = null;
  if (shiftId) {
    const [rows] = await connection.query(
      "SELECT policy_id FROM work_shifts WHERE id = ? LIMIT 1",
      [shiftId],
    );
    if (rows[0]?.policy_id) resolved = await getPolicyForShift({ policy_id: rows[0].policy_id }, connection);
  }
  resolved = resolved || (await getDefaultPolicy(connection));
  return mergeLateRules(resolved?.rules_json || resolved?.rules);
};

const currentDbNow = async (connection = db) => {
  const [rows] = await connection.query("SELECT NOW() AS now_value");
  return rows[0]?.now_value;
};

const getExplanationById = async (connection, id) => {
  const [rows] = await connection.query(
    "SELECT * FROM attendance_late_explanations WHERE id = ? LIMIT 1",
    [id],
  );
  return rows[0] || null;
};

const getEmployeeProfile = async (connection, employeeId) => {
  const [rows] = await connection.query(
    `SELECT e.id, e.manager_id, e.department_id, e.position_id, e.full_name,
            COALESCE(p.pos_code, p.position_code) AS pos_code,
            p.level_rank,
            m.manager_id AS approver_manager_id
       FROM employees e
       LEFT JOIN positions p ON p.id = e.position_id
       LEFT JOIN employees m ON m.id = e.manager_id
      WHERE e.id = ? LIMIT 1`,
    [employeeId],
  );
  return rows[0] || null;
};

const getMaxLevelRank = async (connection) => {
  try {
    const [rows] = await connection.query(
      "SELECT MAX(level_rank) AS max_level FROM positions",
    );
    return toNumber(rows[0]?.max_level, 0);
  } catch {
    return 0;
  }
};

const hasSubordinate = async (connection, employeeId) => {
  const [rows] = await connection.query(
    "SELECT 1 FROM employees WHERE manager_id = ? LIMIT 1",
    [employeeId],
  );
  return rows.length > 0;
};

export const resolveLateApprover = async (employeeId, now = null, connection = db) => {
  await ensureLateExplanationSchema();
  const moment = now || (await currentDbNow(connection));
  const employee = await getEmployeeProfile(connection, employeeId);
  if (!employee) throw serviceError("Không tìm thấy hồ sơ nhân viên", 404);
  const maxLevel = await getMaxLevelRank(connection);
  const posCode = String(employee.pos_code || "").toUpperCase();
  const isCeo =
    !employee.manager_id ||
    posCode === "CEO" ||
    (maxLevel > 0 && toNumber(employee.level_rank, 0) >= maxLevel);
  const subordinate = !isCeo && (await hasSubordinate(connection, employeeId));
  const isManager =
    !isCeo &&
    (subordinate ||
      /MANAGER|DIRECTOR|HEAD|LEADER|TRUONG|GIAM/i.test(posCode) ||
      (maxLevel > 1 && toNumber(employee.level_rank, 0) >= maxLevel - 1));

  let approverId = isCeo ? null : employee.manager_id || null;
  let delegatedApproverId = null;
  if (approverId) {
    const [delegations] = await connection.query(
      `SELECT delegate_id FROM approval_delegations
        WHERE delegator_id = ? AND is_active = 1
          AND scope IN ('LATE_EXPLANATION','ALL_APPROVALS')
          AND start_at <= ? AND end_at >= ?
        ORDER BY id DESC LIMIT 1`,
      [approverId, moment, moment],
    );
    if (delegations[0]?.delegate_id && Number(delegations[0].delegate_id) !== Number(employeeId)) {
      delegatedApproverId = delegations[0].delegate_id;
    }
  }

  return {
    employee,
    is_ceo: Boolean(isCeo),
    is_manager: Boolean(isManager),
    approver_id: approverId ? Number(approverId) : null,
    delegated_approver_id: delegatedApproverId ? Number(delegatedApproverId) : null,
    approver_manager_id: employee.approver_manager_id ? Number(employee.approver_manager_id) : null,
    approval_status: isCeo ? "AUTO_SELF_DECLARED" : "PENDING",
    orphan_manager: Boolean(!isCeo && !approverId),
  };
};

const notifyHrRoles = async (connection, data) => {
  const [rows] = await connection.query(
    `SELECT id FROM users
      WHERE is_active = 1
        AND (role_id LIKE 'HR%' OR role_id IN ('SUPER_ADMIN','ADMIN'))`,
  );
  return notifyUsers(connection, rows.map((row) => row.id), {
    ...data,
    audience_scope: "ROLE",
    target_role_id: "HR",
  });
};

const notifyEscalation = async (connection, explanation, level, { notifyHr = false } = {}) => {
  const label = {
    LEVEL_1_REMINDER: "Nhắc nhở đi muộn",
    LEVEL_2_ESCALATED: "Cảnh báo leo thang đi muộn",
    LEVEL_3_DISCIPLINARY: "Đề xuất kỷ luật đi muộn",
  }[level];
  if (!label) return;
  const payload = {
    explanation_id: Number(explanation.id),
    employee_id: Number(explanation.employee_id),
    work_date: explanation.work_date,
    escalation_level: level,
  };
  const dedupeKey = `LATE_ESC:${explanation.id}:${level}`;
  await notifyEmployee(connection, explanation.employee_id, {
    title: label,
    message: `Đi muộn ngày ${explanation.work_date} đã chạm ngưỡng ${level}. Vui lòng rà soát giải trình.`,
    type: "LATE_EXPLANATION_ESCALATION",
    priority: level === LEVELS.LEVEL_3_DISCIPLINARY ? "HIGH" : "MEDIUM",
    payload,
    action_url: "#/giai-trinh-di-muon",
    dedupe_key: `${dedupeKey}:employee`,
  });
  const approverIds = [
    explanation.approver_id,
    explanation.delegated_approver_id,
    ...(level !== LEVELS.LEVEL_1_REMINDER ? [explanation.approver_manager_id] : []),
  ].filter(Boolean);
  if (approverIds.length) {
    await notifyUsers(connection, approverIds, {
      title: label,
      message: `Nhân viên #${explanation.employee_id} đi muộn ngày ${explanation.work_date} chạm ngưỡng ${level}.`,
      type: "LATE_EXPLANATION_ESCALATION",
      priority: level === LEVELS.LEVEL_3_DISCIPLINARY ? "HIGH" : "MEDIUM",
      payload,
      action_url: "#/giai-trinh-di-muon",
      dedupe_key: `${dedupeKey}:approver:${approverIds.join("-")}`,
    });
  }
  if (notifyHr || level === LEVELS.LEVEL_2_ESCALATED || level === LEVELS.LEVEL_3_DISCIPLINARY) {
    await notifyHrRoles(connection, {
      title: label,
      message: `Đơn giải trình #${explanation.id} (${explanation.work_date}) chạm ngưỡng ${level}.`,
      type: "LATE_EXPLANATION_ESCALATION",
      priority: level === LEVELS.LEVEL_3_DISCIPLINARY ? "HIGH" : "MEDIUM",
      payload,
      action_url: "#/giai-trinh-di-muon",
      dedupe_key: `${dedupeKey}:hr`,
    });
  }
};

const writeEscalationLog = async (
  connection,
  explanation,
  { triggerType, level, monthlyCount, consecutiveDays, notifiedToId = null, note = null, notifyHr = false },
) => {
  if (!level || level === LEVELS.NONE) return false;
  const [existing] = await connection.query(
    `SELECT id FROM attendance_late_escalation_logs
      WHERE explanation_id = ? AND trigger_type = ? AND escalation_level = ? LIMIT 1`,
    [explanation.id, triggerType, level],
  );
  if (existing.length) return false;
  await connection.query(
    `INSERT INTO attendance_late_escalation_logs
      (explanation_id, attendance_id, employee_id, trigger_type, escalation_level,
       monthly_late_count, consecutive_late_days, notified_to_id, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      explanation.id,
      explanation.attendance_id,
      explanation.employee_id,
      triggerType,
      level,
      monthlyCount,
      consecutiveDays,
      notifiedToId,
      note,
    ],
  );
  await notifyEscalation(connection, explanation, level, { notifyHr });
  return true;
};

const violationFilter = `
  NOT EXISTS (
    SELECT 1 FROM attendance_grace_usages g WHERE g.attendance_id = e.attendance_id
  )
  AND NOT (
    e.reason_category = 'LEGITIMATE'
    AND e.approval_status IN ('APPROVED','AUTO_SELF_DECLARED')
    AND e.hr_status = 'RECORDED'
  )
  AND (
    e.reason_category IN ('PERSONAL_ROUTINE','UNSUBMITTED_OVERDUE')
    OR e.approval_status = 'REJECTED'
    OR e.hr_status = 'INVALID_SUBMISSION'
  )
`;

const getViolationRows = async (
  connection,
  employeeId,
  { month = null, fromDate = null, toDate = null, includeId = null } = {},
) => {
  const clauses = ["e.employee_id = ?"];
  const params = [employeeId];
  if (month) {
    clauses.push("e.cycle_month = ?");
    params.push(month);
  }
  if (fromDate) {
    clauses.push("e.work_date >= ?");
    params.push(fromDate);
  }
  if (toDate) {
    clauses.push("e.work_date <= ?");
    params.push(toDate);
  }
  if (includeId) {
    clauses.push("(e.submission_status IN ('SUBMITTED','OVERDUE') OR e.id = ?)");
    params.push(includeId);
  } else {
    clauses.push("e.submission_status IN ('SUBMITTED','OVERDUE')");
  }
  const [rows] = await connection.query(
    `SELECT e.id, e.work_date, e.attendance_id, e.shift_id
       FROM attendance_late_explanations e
      WHERE ${clauses.join(" AND ")} AND ${violationFilter}
      ORDER BY e.work_date DESC`,
    params,
  );
  return rows.map((row) => ({ ...row, work_date: toDateOnly(row.work_date) }));
};

const getWorkingDays = async (connection, shiftId) => {
  if (!shiftId) return ["MON", "TUE", "WED", "THU", "FRI"];
  const [rows] = await connection.query(
    "SELECT working_days FROM work_shifts WHERE id = ? LIMIT 1",
    [shiftId],
  );
  const value = rows[0]?.working_days;
  const parsed = parseJson(value, null);
  if (Array.isArray(parsed) && parsed.length) {
    return parsed.map((day) => String(day).toUpperCase().slice(0, 3));
  }
  return ["MON", "TUE", "WED", "THU", "FRI"];
};

const getHolidaySet = async (connection, fromDate, toDate) => {
  try {
    const [rows] = await connection.query(
      "SELECT holiday_date FROM holidays WHERE holiday_date BETWEEN ? AND ?",
      [fromDate, toDate],
    );
    return new Set(rows.map((row) => String(row.holiday_date).slice(0, 10)));
  } catch {
    return new Set();
  }
};

const DAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const shiftDate = (date) => new Date(`${toDateOnly(date)}T00:00:00Z`);
const formatDate = (date) => date.toISOString().slice(0, 10);

const countConsecutiveDays = async (connection, employeeId, workDate, shiftId, violationRows) => {
  const dates = new Set(violationRows.map((row) => toDateOnly(row.work_date)));
  const workingDays = await getWorkingDays(connection, shiftId);
  const from = shiftDate(workDate);
  from.setUTCDate(from.getUTCDate() - 60);
  const holidays = await getHolidaySet(connection, formatDate(from), workDate);
  let cursor = shiftDate(workDate);
  let count = 0;
  for (let index = 0; index < 61; index += 1) {
    const key = formatDate(cursor);
    const isWorkingDay = workingDays.includes(DAY_LABELS[cursor.getUTCDay()]);
    if (isWorkingDay && !holidays.has(key)) {
      if (!dates.has(key)) break;
      count += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return count;
};

const evaluateEscalation = (rules, isManager, monthlyCount, consecutiveDays) => {
  const config = rules.late_escalation || DEFAULT_LATE_RULES.late_escalation;
  const offset = isManager ? toNumber(config.manager_level_offset, 1) : 0;
  const warning = Math.max(1, toNumber(config.warning_min_count, 1) - offset);
  const escalation = Math.max(2, toNumber(config.escalation_min_count, 3) - offset);
  const disciplinary = Math.max(3, toNumber(config.disciplinary_min_count, 5) - offset);
  const consecutiveLimit = Math.max(1, toNumber(config.consecutive_days_limit, 3));
  if (monthlyCount >= disciplinary || consecutiveDays >= consecutiveLimit) return LEVELS.LEVEL_3_DISCIPLINARY;
  if (monthlyCount >= escalation) return LEVELS.LEVEL_2_ESCALATED;
  if (monthlyCount >= warning) return LEVELS.LEVEL_1_REMINDER;
  return LEVELS.NONE;
};

const recalculateExplanationCounters = async (connection, explanation, rules) => {
  const month = cycleMonth(explanation.work_date);
  const from = shiftDate(explanation.work_date);
  from.setUTCDate(from.getUTCDate() - 60);
  const violationRows = await getViolationRows(connection, explanation.employee_id, {
    fromDate: formatDate(from),
    toDate: explanation.work_date,
    includeId: explanation.id,
  });
  const monthlyRows = violationRows.filter(
    (row) => cycleMonth(row.work_date) === month,
  );
  const monthlyCount = monthlyRows.length;
  const consecutiveDays = await countConsecutiveDays(
    connection,
    explanation.employee_id,
    explanation.work_date,
    explanation.shift_id,
    violationRows,
  );
  const profile = await getEmployeeProfile(connection, explanation.employee_id);
  const maxLevel = await getMaxLevelRank(connection);
  const posCode = String(profile?.pos_code || "").toUpperCase();
  const isManager = Boolean(
    profile &&
      !profile.manager_id &&
      posCode !== "CEO" &&
      maxLevel > 0 &&
      toNumber(profile.level_rank, 0) >= maxLevel - 1,
  ) || Boolean(profile && (await hasSubordinate(connection, explanation.employee_id)));
  const level = evaluateEscalation(rules, isManager, monthlyCount, consecutiveDays);
  return { monthlyCount, consecutiveDays, level };
};

const syncViolationToPayroll = async (connection, explanation, clearLate) => {
  if (!clearLate) return;
  const lateMinutes = toNumber(explanation.late_minutes, 0);
  await connection.query(
    "UPDATE attendances SET late_minutes = 0 WHERE id = ?",
    [explanation.attendance_id ?? explanation.id],
  );
  await clearLatePenalty(connection, {
    attendanceId: explanation.attendance_id ?? explanation.id,
    employeeId: explanation.employee_id,
    workDate: explanation.work_date,
    reason: "Miễn phạt: ân hạn đi muộn",
  });
  if (lateMinutes > 0) {
    await connection.query(
      `UPDATE monthly_timesheets
          SET late_count = GREATEST(late_count - 1, 0),
              total_late_minutes = GREATEST(total_late_minutes - ?, 0)
        WHERE employee_id = ? AND month_year = ?`,
      [lateMinutes, explanation.employee_id, cycleMonth(explanation.work_date)],
    );
  }
};

export const handleLateCheckinHook = async (connection, attendanceRecord, policy = null) => {
  if (!attendanceRecord) return null;
  const lateMinutes = toNumber(attendanceRecord.late_minutes, 0);
  if (lateMinutes <= 0) return null;
  await ensureLateExplanationSchema();
  const rules = await resolveRules(connection, attendanceRecord.shift_id, policy);
  const workDate = toDateOnly(attendanceRecord.work_date);
  const month = cycleMonth(workDate);
  if (!month) return null;
  const rawCheckin = toDateTime(attendanceRecord.check_in);
  const checkinTimeValue = rawCheckin
    ? rawCheckin.length <= 8
      ? `${workDate} ${rawCheckin}`
      : rawCheckin
    : null;
  const checkinTimePart = rawCheckin ? rawCheckin.slice(0, 8) : "00:00:00";

  const [usageRows] = await connection.query(
    "SELECT COUNT(*) AS used FROM attendance_grace_usages WHERE employee_id = ? AND cycle_month = ?",
    [attendanceRecord.employee_id, month],
  );
  const used = toNumber(usageRows[0]?.used, 0);
  if (
    lateMinutes <= toNumber(rules.grace_late_minutes, 5) &&
    used < toNumber(rules.grace_late_monthly_quota, 3)
  ) {
    await connection.query(
      `INSERT IGNORE INTO attendance_grace_usages
        (attendance_id, employee_id, shift_id, work_date, checkin_time, late_minutes,
         grace_applied_minutes, cycle_month)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        attendanceRecord.id,
        attendanceRecord.employee_id,
        attendanceRecord.shift_id || null,
        workDate,
        checkinTimeValue,
        lateMinutes,
        lateMinutes,
        month,
      ],
    );
    await syncViolationToPayroll(connection, attendanceRecord, true);
    return { grace_applied: true, grace_applied_minutes: lateMinutes, used: used + 1 };
  }

  const [existing] = await connection.query(
    "SELECT id FROM attendance_late_explanations WHERE attendance_id = ? LIMIT 1",
    [attendanceRecord.id],
  );
  if (existing.length) return { explanation_id: existing[0].id };

  const routing = await resolveLateApprover(attendanceRecord.employee_id, null, connection);
  const [shiftRows] = await connection.query(
    "SELECT start_time FROM work_shifts WHERE id = ? LIMIT 1",
    [attendanceRecord.shift_id || null],
  );
  const scheduledStart = shiftRows[0]?.start_time || "08:00:00";
  const actualArrival = checkinTimePart || scheduledStart;
  const [result] = await connection.query(
    `INSERT INTO attendance_late_explanations
      (attendance_id, employee_id, shift_id, work_date, scheduled_start_time, actual_arrival_time,
       checkin_time, late_minutes, cycle_month,
       submission_status, reason_category, submit_deadline_at,
       approver_id, delegated_approver_id, approval_status, hr_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_SUBMIT', NULL,
       DATE_ADD(STR_TO_DATE(CONCAT(?, ' ', ?), '%Y-%m-%d %H:%i:%s'), INTERVAL ? HOUR),
       ?, ?, ?, 'PENDING_HR')`,
    [
      attendanceRecord.id,
      attendanceRecord.employee_id,
      attendanceRecord.shift_id || null,
      workDate,
      scheduledStart,
      actualArrival,
      checkinTimeValue,
      lateMinutes,
      month,
      workDate,
      checkinTimePart,
      toNumber(rules.late_explain_deadline_hours, 24),
      routing.approver_id,
      routing.delegated_approver_id,
      routing.approval_status,
    ],
  );
  const explanationId = result.insertId;
  await notifyEmployee(connection, attendanceRecord.employee_id, {
    title: "Cần giải trình đi muộn",
    message: `Bạn đi muộn ${lateMinutes} phút ngày ${workDate}. Vui lòng nộp giải trình trong ${toNumber(rules.late_explain_deadline_hours, 24)} giờ.`,
    type: "LATE_EXPLANATION_SUBMIT_REQUIRED",
    priority: "MEDIUM",
    payload: {
      explanation_id: Number(explanationId),
      attendance_id: Number(attendanceRecord.id),
      work_date: workDate,
      late_minutes: lateMinutes,
    },
    action_url: "#/giai-trinh-di-muon",
    dedupe_key: `LATE_SUBMIT_REQ:${explanationId}`,
  });
  if (routing.orphan_manager) {
    await notifyHrRoles(connection, {
      title: "Cảnh báo cấu hình quản lý trực tiếp",
      message: `Nhân viên #${attendanceRecord.employee_id} không có manager_id. Cần bổ sung trước khi duyệt đơn giải trình.`,
      type: "LATE_EXPLANATION_ORPHAN",
      priority: "HIGH",
      payload: { explanation_id: Number(explanationId), employee_id: Number(attendanceRecord.employee_id) },
      action_url: "#/giai-trinh-di-muon",
      dedupe_key: `LATE_ORPHAN:${attendanceRecord.employee_id}:${month}`,
    });
  }
  return { explanation_id: Number(explanationId), grace_applied: false };
};

const getGraceQuota = async (connection, employeeId, month) => {
  const rules = await resolveRules(connection);
  const [rows] = await connection.query(
    "SELECT COUNT(*) AS used FROM attendance_grace_usages WHERE employee_id = ? AND cycle_month = ?",
    [employeeId, month],
  );
  const used = toNumber(rows[0]?.used, 0);
  const quota = toNumber(rules.grace_late_monthly_quota, 3);
  return {
    grace_late_minutes: toNumber(rules.grace_late_minutes, 5),
    quota,
    used,
    remaining: Math.max(0, quota - used),
    cycle_month: month,
  };
};

const normalizeExplanationRow = (row) => ({
  ...row,
  work_date: toDateOnly(row.work_date),
  checkin_time: toDateTime(row.checkin_time),
  check_in: toDateTime(row.check_in),
  check_out: toDateTime(row.check_out),
  submit_deadline_at: toDateTime(row.submit_deadline_at),
  submitted_at: toDateTime(row.submitted_at),
  pre_notified_at: toDateTime(row.pre_notified_at),
  approved_at: toDateTime(row.approved_at),
  reminded_24h_at: toDateTime(row.reminded_24h_at),
  escalated_48h_at: toDateTime(row.escalated_48h_at),
  hr_verified_at: toDateTime(row.hr_verified_at),
  id: Number(row.id),
  attendance_id: Number(row.attendance_id),
  employee_id: Number(row.employee_id),
  late_minutes: toNumber(row.late_minutes, 0),
  pre_notified: Number(row.pre_notified) ? 1 : 0,
  is_on_time: Number(row.is_on_time) ? 1 : 0,
  monthly_late_count_at_submit: toNumber(row.monthly_late_count_at_submit, 0),
  consecutive_late_days_at_submit: toNumber(row.consecutive_late_days_at_submit, 0),
  approver_id: row.approver_id ? Number(row.approver_id) : null,
  delegated_approver_id: row.delegated_approver_id ? Number(row.delegated_approver_id) : null,
  approved_by: row.approved_by ? Number(row.approved_by) : null,
  hr_verified_by: row.hr_verified_by ? Number(row.hr_verified_by) : null,
});

export const getMyLateExplanations = async (user, filters = {}) => {
  await ensureLateExplanationSchema();
  const employeeId = user?.employee_id;
  if (!employeeId) throw serviceError("Tài khoản chưa liên kết hồ sơ nhân viên", 403, "NO_EMPLOYEE_PROFILE");
  const month = filters.month || new Date().toISOString().slice(0, 7);
  const [rows] = await db.query(
    `SELECT e.*, a.check_in, a.check_out, w.code AS shift_code, w.name AS shift_name,
            emp.full_name
       FROM attendance_late_explanations e
       LEFT JOIN attendances a ON a.id = e.attendance_id
       LEFT JOIN work_shifts w ON w.id = e.shift_id
       LEFT JOIN employees emp ON emp.id = e.employee_id
      WHERE e.employee_id = ? AND e.cycle_month = ?
      ORDER BY e.work_date DESC, e.id DESC
      LIMIT 300`,
    [employeeId, month],
  );
  return {
    items: rows.map(normalizeExplanationRow),
    grace: await getGraceQuota(db, employeeId, month),
  };
};

export const markExplanationOverdue = async (id) => {
  await ensureLateExplanationSchema();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const row = await getExplanationById(connection, id);
    if (!row || row.submission_status !== "PENDING_SUBMIT") {
      await connection.rollback();
      return null;
    }
    await connection.query(
      `UPDATE attendance_late_explanations
          SET submission_status = 'OVERDUE', is_on_time = 0,
              reason_category = 'UNSUBMITTED_OVERDUE', approval_status = 'EXPIRED'
        WHERE id = ?`,
      [id],
    );
    const updated = { ...row, submission_status: "OVERDUE", reason_category: "UNSUBMITTED_OVERDUE", approval_status: "EXPIRED" };
    const rules = await resolveRules(connection, row.shift_id);
    const counters = await recalculateExplanationCounters(connection, updated, rules);
    await connection.query(
      `UPDATE attendance_late_explanations
          SET monthly_late_count_at_submit = ?, consecutive_late_days_at_submit = ?, escalation_level = ?
        WHERE id = ?`,
      [counters.monthlyCount, counters.consecutiveDays, counters.level, id],
    );
    await writeEscalationLog(connection, updated, {
      triggerType: "SUBMIT_OVERDUE",
      level: counters.level,
      monthlyCount: counters.monthlyCount,
      consecutiveDays: counters.consecutiveDays,
      notifiedToId: updated.approver_id,
    });
    await notifyEmployee(connection, row.employee_id, {
      title: "Giải trình đi muộn đã quá hạn",
      message: `Đơn đi muộn ngày ${row.work_date} đã quá hạn nộp và được ghi nhận là đi muộn không lý do.`,
      type: "LATE_EXPLANATION_OVERDUE",
      priority: "HIGH",
      payload: { explanation_id: Number(id), work_date: row.work_date },
      action_url: "#/giai-trinh-di-muon",
      dedupe_key: `LATE_OVERDUE:${id}`,
    });
    await connection.commit();
    return { ...updated, ...counters };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const submitLateExplanation = async (id, payload, user) => {
  await ensureLateExplanationSchema();
  const connection = await db.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const row = await getExplanationById(connection, id);
    if (!row) throw serviceError("Không tìm thấy đơn giải trình", 404, "EXPLANATION_NOT_FOUND");
    if (Number(row.employee_id) !== Number(user?.employee_id)) {
      throw serviceError("Bạn không phải chủ đơn này", 403, "NOT_EXPLANATION_OWNER");
    }
    if (row.submission_status !== "PENDING_SUBMIT") {
      throw serviceError("Đơn này đã được nộp hoặc đã quá hạn", 409, "EXPLANATION_ALREADY_SUBMITTED");
    }
    const [deadlineRows] = await connection.query(
      "SELECT NOW() > submit_deadline_at AS expired FROM attendance_late_explanations WHERE id = ? FOR UPDATE",
      [id],
    );
    if (Number(deadlineRows[0]?.expired)) {
      transactionStarted = false;
      await connection.rollback();
      await markExplanationOverdue(id);
      throw serviceError("Đã quá hạn nộp giải trình", 400, "EXPLANATION_DEADLINE_PASSED");
    }

    let routing = await resolveLateApprover(row.employee_id, null, connection);
    if (routing.orphan_manager && !row.approver_id) {
      await connection.query(
        `UPDATE attendance_late_explanations
            SET approver_id = ?, delegated_approver_id = ?, approval_status = ?
          WHERE id = ?`,
        [routing.approver_id, routing.delegated_approver_id, routing.approval_status, id],
      );
    }
    const submitted = {
      ...row,
      ...routing,
      ...payload,
      submission_status: "SUBMITTED",
      reason_category: payload.reason_category,
      approval_status: routing.is_ceo ? "AUTO_SELF_DECLARED" : "PENDING",
    };
    await connection.query(
      `UPDATE attendance_late_explanations
          SET submission_status = 'SUBMITTED', submitted_at = NOW(), is_on_time = 1,
              reason_category = ?, reason_detail = ?, evidence_url = ?,
              pre_notified = ?, pre_notified_at = ?,
              approver_id = COALESCE(approver_id, ?),
              delegated_approver_id = COALESCE(delegated_approver_id, ?),
              approval_status = ?,
              approved_at = CASE WHEN ? = 'AUTO_SELF_DECLARED' THEN NOW() ELSE approved_at END,
              approved_by = CASE WHEN ? = 'AUTO_SELF_DECLARED' THEN ? ELSE approved_by END
        WHERE id = ?`,
      [
        payload.reason_category,
        payload.reason_detail,
        payload.evidence_url || null,
        payload.pre_notified ? 1 : 0,
        payload.pre_notified_at || null,
        routing.approver_id,
        routing.delegated_approver_id,
        submitted.approval_status,
        submitted.approval_status,
        submitted.approval_status,
        row.employee_id,
        id,
      ],
    );
    const rules = await resolveRules(connection, row.shift_id);
    const counters = await recalculateExplanationCounters(connection, submitted, rules);
    await connection.query(
      `UPDATE attendance_late_explanations
          SET monthly_late_count_at_submit = ?, consecutive_late_days_at_submit = ?, escalation_level = ?
        WHERE id = ?`,
      [counters.monthlyCount, counters.consecutiveDays, counters.level, id],
    );
    await writeEscalationLog(connection, submitted, {
      triggerType: "SUBMIT",
      level: counters.level,
      monthlyCount: counters.monthlyCount,
      consecutiveDays: counters.consecutiveDays,
      notifiedToId: routing.approver_id,
    });
    if (!routing.is_ceo && routing.approver_id) {
      const approverIds = [routing.approver_id, routing.delegated_approver_id].filter(Boolean);
      await notifyUsers(connection, approverIds, {
        title: "Đơn giải trình đi muộn cần duyệt",
        message: `Nhân viên #${row.employee_id} đã nộp giải trình đi muộn ngày ${row.work_date}.`,
        type: "LATE_EXPLANATION_SUBMITTED",
        priority: "MEDIUM",
        payload: { explanation_id: Number(id), employee_id: Number(row.employee_id), work_date: row.work_date },
        action_url: "#/giai-trinh-di-muon",
        dedupe_key: `LATE_SUBMITTED:${id}`,
      });
    }
    await connection.commit();
    return normalizeExplanationRow({ ...submitted, ...counters });
  } catch (error) {
    if (transactionStarted) await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
};

export const approveLateExplanation = async (id, payload, user) => {
  await ensureLateExplanationSchema();
  const connection = await db.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const row = await getExplanationById(connection, id);
    if (!row) throw serviceError("Không tìm thấy đơn giải trình", 404, "EXPLANATION_NOT_FOUND");
    if (Number(row.employee_id) === Number(user?.employee_id)) {
      throw serviceError("Không thể tự duyệt đơn của chính mình", 403, "SELF_APPROVAL_FORBIDDEN");
    }
    const currentApproverIds = [row.approver_id, row.delegated_approver_id]
      .filter(Boolean)
      .map(Number);
    if (!currentApproverIds.includes(Number(user?.employee_id))) {
      const [activeDelegations] = await connection.query(
        `SELECT id FROM approval_delegations
          WHERE delegate_id = ? AND is_active = 1
            AND scope IN ('LATE_EXPLANATION','ALL_APPROVALS')
            AND delegator_id = ?
            AND start_at <= NOW() AND end_at >= NOW() LIMIT 1`,
        [user?.employee_id, row.approver_id],
      );
      if (!activeDelegations.length) {
        throw serviceError("Bạn không có thẩm quyền duyệt đơn này", 403, "NOT_APPROVER");
      }
    }
    if (row.submission_status !== "SUBMITTED" || row.approval_status !== "PENDING") {
      throw serviceError("Đơn không ở trạng thái chờ duyệt", 409, "EXPLANATION_NOT_PENDING");
    }
    await connection.query(
      `UPDATE attendance_late_explanations
          SET approval_status = ?, approved_by = ?, approved_at = NOW(), approver_note = ?
        WHERE id = ?`,
      [payload.decision, user.employee_id, payload.approver_note || null, id],
    );
    const approved = {
      ...row,
      approval_status: payload.decision,
      approved_by: user.employee_id,
      approver_note: payload.approver_note || null,
    };
    const rules = await resolveRules(connection, row.shift_id);
    const counters = await recalculateExplanationCounters(connection, approved, rules);
    await connection.query(
      `UPDATE attendance_late_explanations
          SET monthly_late_count_at_submit = ?, consecutive_late_days_at_submit = ?, escalation_level = ?
        WHERE id = ?`,
      [counters.monthlyCount, counters.consecutiveDays, counters.level, id],
    );
    await writeEscalationLog(connection, approved, {
      triggerType: "APPROVAL_DECISION",
      level: counters.level,
      monthlyCount: counters.monthlyCount,
      consecutiveDays: counters.consecutiveDays,
      notifiedToId: row.employee_id,
    });
    if (payload.decision === "APPROVED") {
      await clearLatePenalty(connection, {
        attendanceId: row.attendance_id,
        employeeId: row.employee_id,
        workDate: row.work_date,
        reason: "Miễn phạt: giải trình đi muộn đã duyệt",
      });
    }
    await notifyEmployee(connection, row.employee_id, {
      title: payload.decision === "APPROVED" ? "Giải trình đi muộn được duyệt" : "Giải trình đi muộn bị từ chối",
      message:
        payload.decision === "APPROVED"
          ? `Đơn giải trình ngày ${row.work_date} đã được cấp trên chấp nhận.`
          : `Đơn giải trình ngày ${row.work_date} bị từ chối: ${payload.approver_note || "không nêu rõ lý do"}`,
      type: "LATE_EXPLANATION_DECISION",
      priority: payload.decision === "REJECTED" ? "HIGH" : "MEDIUM",
      payload: { explanation_id: Number(id), decision: payload.decision },
      action_url: "#/giai-trinh-di-muon",
      dedupe_key: `LATE_DECISION:${id}:${payload.decision}`,
    });
    await connection.commit();
    return normalizeExplanationRow({ ...approved, ...counters });
  } catch (error) {
    if (transactionStarted) await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
};

export const getPendingApprovalExplanations = async (user, filters = {}) => {
  await ensureLateExplanationSchema();
  const employeeId = user?.employee_id;
  if (!employeeId) throw serviceError("Tài khoản chưa liên kết hồ sơ nhân viên", 403, "NO_EMPLOYEE_PROFILE");
  const month = filters.month || new Date().toISOString().slice(0, 7);
  const [rows] = await db.query(
    `SELECT e.*, emp.full_name, emp.employee_code, dep.department_name,
            CASE WHEN e.delegated_approver_id = ? THEN 1 ELSE 0 END AS is_delegated,
            (SELECT COUNT(*) FROM attendance_late_explanations x
              WHERE x.employee_id = e.employee_id AND x.cycle_month = e.cycle_month
                AND x.submission_status IN ('SUBMITTED','OVERDUE')
                AND NOT EXISTS (SELECT 1 FROM attendance_grace_usages g WHERE g.attendance_id = x.attendance_id)
                AND NOT (x.reason_category = 'LEGITIMATE'
                  AND x.approval_status IN ('APPROVED','AUTO_SELF_DECLARED')
                  AND x.hr_status = 'RECORDED')) AS monthly_late_count
       FROM attendance_late_explanations e
       LEFT JOIN employees emp ON emp.id = e.employee_id
       LEFT JOIN departments dep ON dep.id = emp.department_id
      WHERE e.submission_status = 'SUBMITTED'
        AND (e.approver_id = ? OR e.delegated_approver_id = ?
             OR EXISTS (SELECT 1 FROM approval_delegations d
                         WHERE d.delegator_id = e.approver_id
                           AND d.delegate_id = ?
                           AND d.is_active = 1
                           AND d.scope IN ('LATE_EXPLANATION','ALL_APPROVALS')
                           AND d.start_at <= NOW() AND d.end_at >= NOW()))
        AND e.cycle_month = ?
      ORDER BY e.submitted_at ASC
      LIMIT 300`,
    [employeeId, employeeId, employeeId, employeeId, month],
  );
  return rows.map(normalizeExplanationRow);
};

export const getHrLateQueue = async (filters = {}) => {
  await ensureLateExplanationSchema();
  const month = filters.month || new Date().toISOString().slice(0, 7);
  const where = ["e.cycle_month = ?"];
  const params = [month];
  if (filters.queue === "PENDING_HR") {
    where.push("e.hr_status = 'PENDING_HR'");
  } else if (filters.queue === "OVERDUE_48H") {
    where.push("e.submission_status = 'SUBMITTED' AND e.approval_status = 'PENDING' AND e.escalated_48h_at IS NOT NULL");
  } else if (filters.queue === "LEVEL_2") {
    where.push("e.escalation_level = 'LEVEL_2_ESCALATED'");
  } else if (filters.queue === "LEVEL_3") {
    where.push("e.escalation_level = 'LEVEL_3_DISCIPLINARY'");
  }
  if (filters.department_id) {
    where.push("emp.department_id = ?");
    params.push(filters.department_id);
  }
  const [rows] = await db.query(
    `SELECT e.*, emp.full_name, emp.employee_code, dep.department_name
       FROM attendance_late_explanations e
       LEFT JOIN employees emp ON emp.id = e.employee_id
       LEFT JOIN departments dep ON dep.id = emp.department_id
      WHERE ${where.join(" AND ")}
      ORDER BY
        CASE e.hr_status WHEN 'PENDING_HR' THEN 0 ELSE 1 END,
        CASE e.escalation_level WHEN 'LEVEL_3_DISCIPLINARY' THEN 0 WHEN 'LEVEL_2_ESCALATED' THEN 1 ELSE 2 END,
        e.work_date DESC
      LIMIT 500`,
    params,
  );
  return rows.map(normalizeExplanationRow);
};

export const hrVerifyLateExplanation = async (id, payload, user) => {
  await ensureLateExplanationSchema();
  const connection = await db.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const row = await getExplanationById(connection, id);
    if (!row) throw serviceError("Không tìm thấy đơn giải trình", 404, "EXPLANATION_NOT_FOUND");
    if (Number(row.employee_id) === Number(user?.employee_id)) {
      throw serviceError("Không thể tự xác nhận đơn của chính mình", 403, "SELF_HR_VERIFY_FORBIDDEN");
    }
    if (!["APPROVED", "REJECTED", "AUTO_SELF_DECLARED", "EXPIRED"].includes(row.approval_status)) {
      throw serviceError("Đơn chưa qua khâu duyệt nội dung", 409, "APPROVAL_NOT_FINISHED");
    }
    if (row.hr_status !== "PENDING_HR") {
      throw serviceError("Đơn đã được HR xử lý", 409, "EXPLANATION_ALREADY_VERIFIED");
    }
    await connection.query(
      `UPDATE attendance_late_explanations
          SET hr_status = ?, hr_note = ?, hr_verified_by = ?, hr_verified_at = NOW()
        WHERE id = ?`,
      [payload.hr_status, payload.hr_note || null, user.employee_id, id],
    );
    const verified = {
      ...row,
      hr_status: payload.hr_status,
      hr_note: payload.hr_note || null,
      hr_verified_by: user.employee_id,
    };
    const rules = await resolveRules(connection, row.shift_id);
    const counters = await recalculateExplanationCounters(connection, verified, rules);
    await connection.query(
      `UPDATE attendance_late_explanations
          SET monthly_late_count_at_submit = ?, consecutive_late_days_at_submit = ?, escalation_level = ?
        WHERE id = ?`,
      [counters.monthlyCount, counters.consecutiveDays, counters.level, id],
    );
    const legitimate =
      row.reason_category === "LEGITIMATE" &&
      ["APPROVED", "AUTO_SELF_DECLARED"].includes(row.approval_status) &&
      payload.hr_status === "RECORDED";
    await syncViolationToPayroll(connection, row, legitimate);
    await writeEscalationLog(connection, verified, {
      triggerType: "HR_VERIFY",
      level: counters.level,
      monthlyCount: counters.monthlyCount,
      consecutiveDays: counters.consecutiveDays,
      notifiedToId: row.employee_id,
    });
    await notifyEmployee(connection, row.employee_id, {
      title: payload.hr_status === "RECORDED" ? "HR đã ghi nhận công" : "Hồ sơ giải trình không hợp lệ",
      message:
        payload.hr_status === "RECORDED"
          ? `Đơn đi muộn ngày ${row.work_date} đã được HR ghi nhận.`
          : `Hồ sơ đi muộn ngày ${row.work_date} không hợp lệ: ${payload.hr_note || "thiếu minh chứng"}`,
      type: "LATE_EXPLANATION_HR_VERIFY",
      priority: payload.hr_status === "INVALID_SUBMISSION" ? "HIGH" : "MEDIUM",
      payload: { explanation_id: Number(id), hr_status: payload.hr_status },
      action_url: "#/giai-trinh-di-muon",
      dedupe_key: `LATE_HR_VERIFY:${id}:${payload.hr_status}`,
    });
    await connection.commit();
    return normalizeExplanationRow({ ...verified, ...counters });
  } catch (error) {
    if (transactionStarted) await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
};

export const getMonthlyLateStats = async (filters = {}) => {
  await ensureLateExplanationSchema();
  const month = filters.month || new Date().toISOString().slice(0, 7);
  const [rows] = await db.query(
    `SELECT e.employee_id, emp.full_name, emp.employee_code, dep.department_name,
            COUNT(*) AS late_count,
            SUM(CASE WHEN e.reason_category = 'UNSUBMITTED_OVERDUE' THEN 1 ELSE 0 END) AS overdue_count,
            SUM(CASE WHEN e.hr_status = 'PENDING_HR' THEN 1 ELSE 0 END) AS pending_hr_count,
            SUM(CASE WHEN e.approval_status = 'PENDING' THEN 1 ELSE 0 END) AS pending_approval_count,
            MAX(e.escalation_level) AS max_escalation_level,
            MAX(e.consecutive_late_days_at_submit) AS max_consecutive_days,
            SUM(e.late_minutes) AS total_late_minutes
       FROM attendance_late_explanations e
       LEFT JOIN employees emp ON emp.id = e.employee_id
       LEFT JOIN departments dep ON dep.id = emp.department_id
      WHERE e.cycle_month = ?
      GROUP BY e.employee_id, emp.full_name, emp.employee_code, dep.department_name
      ORDER BY late_count DESC
      LIMIT 300`,
    [month],
  );
  const summary = rows.reduce(
    (acc, row) => {
      acc.total_late += Number(row.late_count);
      acc.total_overdue += Number(row.overdue_count);
      acc.total_pending_hr += Number(row.pending_hr_count);
      acc.total_pending_approval += Number(row.pending_approval_count);
      if (row.max_escalation_level === "LEVEL_3_DISCIPLINARY") acc.level_3_employees += 1;
      if (row.max_escalation_level === "LEVEL_2_ESCALATED") acc.level_2_employees += 1;
      return acc;
    },
    {
      month,
      total_late: 0,
      total_overdue: 0,
      total_pending_hr: 0,
      total_pending_approval: 0,
      level_2_employees: 0,
      level_3_employees: 0,
    },
  );
  return { summary, employees: rows };
};

export const getSlaCandidates = async (kind, rules) => {
  await ensureLateExplanationSchema();
  const hours = kind === "24H"
    ? toNumber(rules.late_approval_reminder_hours, 24)
    : toNumber(rules.late_approval_escalate_hours, 48);
  const reminderColumn = kind === "24H" ? "reminded_24h_at" : "escalated_48h_at";
  const [rows] = await db.query(
    `SELECT * FROM attendance_late_explanations
      WHERE submission_status = 'SUBMITTED'
        AND approval_status = 'PENDING'
        AND ${reminderColumn} IS NULL
        AND submitted_at <= DATE_SUB(NOW(), INTERVAL ? HOUR)
      LIMIT 200`,
    [hours],
  );
  return rows;
};

export const markApprovalReminder = async (id, kind) => {
  await ensureLateExplanationSchema();
  const connection = await db.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const row = await getExplanationById(connection, id);
    if (!row || row.approval_status !== "PENDING") {
      await connection.rollback();
      return null;
    }
    const column = kind === "24H" ? "reminded_24h_at" : "escalated_48h_at";
    if (row[column]) {
      await connection.rollback();
      return null;
    }
    await connection.query(
      `UPDATE attendance_late_explanations SET ${column} = NOW() WHERE id = ?`,
      [id],
    );
    const level = kind === "24H" ? LEVELS.LEVEL_1_REMINDER : LEVELS.LEVEL_2_ESCALATED;
    const triggerType = kind === "24H" ? "APPROVAL_OVERDUE_24H" : "APPROVAL_OVERDUE_48H";
    const counters = await recalculateExplanationCounters(connection, row, await resolveRules(connection, row.shift_id));
    await writeEscalationLog(connection, row, {
      triggerType,
      level,
      monthlyCount: counters.monthlyCount,
      consecutiveDays: counters.consecutiveDays,
      notifiedToId: row.delegated_approver_id || row.approver_id,
      notifyHr: kind === "48H",
    });
    const approverIds = [row.approver_id, row.delegated_approver_id].filter(Boolean);
    if (approverIds.length) {
      await notifyUsers(connection, approverIds, {
        title: kind === "24H" ? "Nhắc duyệt giải trình đi muộn" : "Leo thang duyệt giải trình quá 48 giờ",
        message: `Đơn giải trình #${id} (${row.work_date}) đang chờ duyệt quá ${kind === "24H" ? 24 : 48} giờ.`,
        type: "LATE_EXPLANATION_SLA",
        priority: kind === "48H" ? "HIGH" : "MEDIUM",
        payload: { explanation_id: Number(id), kind },
        action_url: "#/giai-trinh-di-muon",
        dedupe_key: `LATE_SLA_${kind}:${id}`,
      });
    }
    if (kind === "48H") {
      await notifyHrRoles(connection, {
        title: "Leo thang duyệt giải trình quá 48 giờ",
        message: `Đơn #${id} chờ duyệt quá 48 giờ, cần HR xử lý để chốt công cuối tháng.`,
        type: "LATE_EXPLANATION_SLA",
        priority: "HIGH",
        payload: { explanation_id: Number(id), kind },
        action_url: "#/giai-trinh-di-muon",
        dedupe_key: `LATE_SLA_48H_HR:${id}`,
      });
    }
    await connection.commit();
    return row;
  } catch (error) {
    if (transactionStarted) await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
};

export const getOverdueSubmitCandidates = async () => {
  await ensureLateExplanationSchema();
  const [rows] = await db.query(
    `SELECT id FROM attendance_late_explanations
      WHERE submission_status = 'PENDING_SUBMIT' AND submit_deadline_at < NOW()
      LIMIT 200`,
  );
  return rows;
};

export const getPublicRules = async () => {
  const rules = await resolveRules(db);
  return {
    grace_late_minutes: rules.grace_late_minutes,
    grace_late_monthly_quota: rules.grace_late_monthly_quota,
    late_explain_deadline_hours: rules.late_explain_deadline_hours,
    late_approval_reminder_hours: rules.late_approval_reminder_hours,
    late_approval_escalate_hours: rules.late_approval_escalate_hours,
    late_escalation: rules.late_escalation,
  };
};

export { LEVELS, createNotification };
