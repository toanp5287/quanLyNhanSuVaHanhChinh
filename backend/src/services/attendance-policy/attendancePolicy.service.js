import { db } from "../../config/database.js";

const policyError = (message, status = 400) =>
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

const DEFAULT_LATE_PENALTY_TIERS = [
  { from_minute: 16, to_minute: 30, amount: 100000, max_workday: null, label: "Muộn 16–30 phút" },
  { from_minute: 31, to_minute: 60, amount: 200000, max_workday: 0.75, label: "Muộn 31–60 phút" },
  { from_minute: 61, to_minute: null, amount: 300000, max_workday: 0.5, label: "Muộn trên 60 phút" },
];

const DEFAULT_RULES = {
  work_day_mode: "PRO_RATA",
  pro_rata: { round_step: 0.25, round_method: "ROUND" },
  tiers: [
    { min_hours: 7.5, work_day: 1, label: "Đủ công" },
    { min_hours: 6, work_day: 0.75, label: "3/4 công" },
    { min_hours: 4, work_day: 0.5, label: "Nửa công" },
    { min_hours: 0, work_day: 0, label: "Không đủ công" },
  ],
  max_work_day: 1,
  grace_late_minutes: 5,
  grace_early_minutes: 0,
  late_penalty: { enabled: false, tiers: DEFAULT_LATE_PENALTY_TIERS },
  clamp_early_in: true,
  clamp_late_out: true,
  missing_checkout_action: "ZERO_WAIT_EXPLAIN",
  explain_deadline_days: 3,
};

const DEFAULT_AI_CONFIG = {
  similarity_threshold: 0.65,
  voting_frames: 3,
  anti_smile_gate: true,
  liveness_enabled: true,
};
const DEFAULT_NETWORK_CONFIG = {
  strict_ip: false,
  allowed_ips: [],
  exempt_department_ids: [],
  exempt_employee_ids: [],
};

let schemaPromise;
export const ensureAttendancePolicySchema = async () => {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await db.query(
        `CREATE TABLE IF NOT EXISTS attendance_policies (
          id INT AUTO_INCREMENT PRIMARY KEY,
          code VARCHAR(50) NOT NULL UNIQUE,
          name VARCHAR(150) NOT NULL,
          is_default TINYINT(1) NOT NULL DEFAULT 0,
          rules_json JSON NOT NULL,
          created_by INT NULL,
          updated_by INT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      );
      await db.query(
        `CREATE TABLE IF NOT EXISTS camera_kiosk_configs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          branch_id INT NULL UNIQUE,
          punch_mode ENUM('AUTO_SMART','MANUAL_TABS') NOT NULL DEFAULT 'AUTO_SMART',
          require_checkin_for_checkout TINYINT(1) NOT NULL DEFAULT 1,
          anti_double_punch_minutes INT NOT NULL DEFAULT 3,
          checkout_repeat_policy ENUM('OVERWRITE_LATEST','LOCK_FIRST') NOT NULL DEFAULT 'OVERWRITE_LATEST',
          checkout_confirm_seconds INT NOT NULL DEFAULT 2,
          show_estimated_workday TINYINT(1) NOT NULL DEFAULT 1,
          ai_config_json JSON NULL,
          network_config_json JSON NULL,
          updated_by INT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      );

      const shiftColumns = [
        ["is_overnight", "TINYINT(1) NOT NULL DEFAULT 0"],
        ["has_break", "TINYINT(1) NOT NULL DEFAULT 1"],
        ["require_break_punch", "TINYINT(1) NOT NULL DEFAULT 0"],
        ["standard_work_hours", "DECIMAL(4,2) NULL DEFAULT NULL"],
        ["checkin_open_before_min", "INT NULL DEFAULT 120"],
        ["checkin_close_after_min", "INT NULL DEFAULT NULL"],
        ["allow_checkout_anytime", "TINYINT(1) NOT NULL DEFAULT 1"],
        ["working_days", "JSON NULL"],
        ["policy_id", "INT NULL"],
      ];
      for (const [column, definition] of shiftColumns) {
        if (await hasColumn(db, "work_shifts", column)) continue;
        await db.query(
          `ALTER TABLE work_shifts ADD COLUMN ${column} ${definition}`,
        );
        columnCache.delete(`work_shifts.${column}`);
      }
      await db.query(
        "ALTER TABLE work_shifts MODIFY COLUMN standard_work_hours DECIMAL(4,2) NULL DEFAULT NULL",
      );
      const attendanceColumns = [
        ["policy_snapshot", "JSON NULL"],
        ["net_work_minutes", "INT NOT NULL DEFAULT 0"],
        ["work_day", "DECIMAL(4,2) NOT NULL DEFAULT 0.00"],
        ["recalculated_at", "DATETIME NULL"],
        ["final_workday", "DECIMAL(3,2) NOT NULL DEFAULT 0.00"],
        ["penalty_amount", "DECIMAL(12,2) NOT NULL DEFAULT 0.00"],
        ["penalty_note", "VARCHAR(255) NULL"],
      ];
      let backfillFinalWorkday = false;
      for (const [column, definition] of attendanceColumns) {
        if (await hasColumn(db, "attendances", column)) continue;
        await db.query(
          `ALTER TABLE attendances ADD COLUMN ${column} ${definition}`,
        );
        columnCache.delete(`attendances.${column}`);
        if (column === "final_workday") backfillFinalWorkday = true;
      }
      if (!(await hasColumn(db, "monthly_timesheets", "total_late_penalty"))) {
        await db.query(
          "ALTER TABLE monthly_timesheets ADD COLUMN total_late_penalty DECIMAL(12,2) NOT NULL DEFAULT 0.00",
        );
        columnCache.delete("monthly_timesheets.total_late_penalty");
      }
      if (backfillFinalWorkday) {
        await db.query(
          `UPDATE attendances
              SET final_workday = COALESCE(base_workday, 0.00)
            WHERE final_workday = 0.00 AND COALESCE(base_workday, 0) > 0`,
        );
      }

      await db.query(
        `INSERT IGNORE INTO attendance_policies (code, name, is_default, rules_json)
         VALUES (?, ?, 1, ?)`,
        [
          "DEFAULT_OFFICE",
          "Quy chế Hành chính chuẩn (8h - Tự trừ trưa)",
          JSON.stringify(DEFAULT_RULES),
        ],
      );
      await db.query(
        `INSERT IGNORE INTO camera_kiosk_configs
          (id, branch_id, punch_mode, require_checkin_for_checkout,
           anti_double_punch_minutes, checkout_repeat_policy,
           checkout_confirm_seconds, show_estimated_workday,
           ai_config_json, network_config_json)
         VALUES (1, NULL, 'AUTO_SMART', 1, 3, 'OVERWRITE_LATEST', 2, 1, ?, ?)`,
        [
          JSON.stringify(DEFAULT_AI_CONFIG),
          JSON.stringify(DEFAULT_NETWORK_CONFIG),
        ],
      );
      await db.query(
        `UPDATE work_shifts
            SET policy_id = COALESCE(policy_id, (SELECT id FROM attendance_policies WHERE code = 'DEFAULT_OFFICE' LIMIT 1)),
                standard_work_hours = COALESCE(standard_work_hours, standard_hours, 8)
          WHERE policy_id IS NULL OR standard_work_hours IS NULL`,
      );
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
};

const parseJson = (value, fallback) => {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const toMinutes = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const [hour, minute] = String(value)
    .split(":")
    .map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
};

const cloneDefaultLatePenalty = () => ({
  enabled: false,
  tiers: DEFAULT_LATE_PENALTY_TIERS.map((tier) => ({ ...tier })),
});

export const normalizeLatePenalty = (value, strict = false) => {
  const raw = parseJson(value, null);
  const fallback = cloneDefaultLatePenalty();
  if (raw == null) return fallback;
  const tiersSource = Array.isArray(raw.tiers) ? raw.tiers : fallback.tiers;
  const tiers = tiersSource
    .map((tier, index) => {
      const from = Math.max(0, Math.floor(toNumber(tier?.from_minute ?? tier?.from, 0)));
      const rawTo = tier?.to_minute ?? tier?.to;
      const to =
        rawTo === null || rawTo === undefined || rawTo === ""
          ? null
          : Math.max(0, Math.floor(toNumber(rawTo, from)));
      const amount = Math.max(0, Math.round(toNumber(tier?.amount, 0)));
      const rawMax = tier?.max_workday;
      const maxWorkday =
        rawMax === null || rawMax === undefined || rawMax === ""
          ? null
          : Math.max(0, Math.min(1, toNumber(rawMax, 1)));
      return {
        from_minute: from,
        to_minute: to,
        amount,
        max_workday: maxWorkday,
        label: String(tier?.label || "").trim().slice(0, 255),
        order: index,
      };
    })
    .sort((a, b) => a.from_minute - b.from_minute || a.order - b.order);
  if (strict) {
    for (let index = 0; index < tiers.length; index += 1) {
      const tier = tiers[index];
      if (tier.to_minute !== null && tier.to_minute <= tier.from_minute)
        throw policyError(`Bậc phạt thứ ${index + 1}: phút kết thúc phải lớn hơn phút bắt đầu`);
      if (!Number.isFinite(tier.amount) || tier.amount < 0)
        throw policyError(`Bậc phạt thứ ${index + 1}: tiền phạt không hợp lệ`);
      if (index > 0) {
        const previous = tiers[index - 1];
        if (previous.to_minute === null || tier.from_minute <= previous.to_minute)
          throw policyError("Các bậc phạt đi muộn bị chồng lấn khoảng phút", 409);
      }
    }
  }
  return { enabled: Boolean(raw.enabled), tiers };
};

export const findLatePenaltyTier = (lateMinutes, tiers = []) => {
  const minutes = Math.max(0, Math.floor(toNumber(lateMinutes, 0)));
  return (
    tiers.find(
      (tier) =>
        minutes >= tier.from_minute &&
        (tier.to_minute === null || minutes <= tier.to_minute),
    ) || null
  );
};

export const calculateLatePenalty = ({ lateMinutes = 0, rules = null } = {}) => {
  const config = normalizeLatePenalty(rules?.late_penalty);
  const minutes = Math.max(0, Math.floor(toNumber(lateMinutes, 0)));
  const grace = Math.max(0, toNumber(rules?.grace_late_minutes, 5));
  if (!config.enabled || minutes <= 0)
    return { exempt: false, matched: false, amount: 0, max_workday: null, note: null, tier: null };
  if (minutes <= grace)
    return {
      exempt: true,
      matched: true,
      amount: 0,
      max_workday: null,
      note: `Miễn phạt: đi muộn ${minutes} phút trong ân hạn ${grace} phút`,
      tier: null,
    };
  const tier = findLatePenaltyTier(minutes, config.tiers);
  if (!tier)
    return {
      exempt: false,
      matched: false,
      amount: 0,
      max_workday: null,
      note: `Không có bậc phạt cho ${minutes} phút đi muộn`,
      tier: null,
    };
  const range = tier.to_minute === null
    ? `từ ${tier.from_minute} phút trở lên`
    : `${tier.from_minute}–${tier.to_minute} phút`;
  return {
    exempt: false,
    matched: true,
    amount: tier.amount,
    max_workday: tier.max_workday,
    note: `${tier.label || `Bậc ${range}`} (${range}): phạt ${tier.amount.toLocaleString("vi-VN")}đ${tier.max_workday !== null ? `, công tối đa ${tier.max_workday}` : ""}`,
    tier,
  };
};

export const clearLatePenalty = async (
  connection,
  { attendanceId = null, employeeId = null, workDate = null, reason = "Miễn phạt" } = {},
) => {
  const month = String(workDate || "").slice(0, 7);
  if (month && employeeId) {
    const [locked] = await connection.query(
      "SELECT status FROM monthly_timesheets WHERE employee_id = ? AND month_year = ? LIMIT 1",
      [employeeId, month],
    );
    if (locked[0]?.status === "LOCKED") return { cleared: false };
  }
  const where = attendanceId ? "id = ?" : "employee_id = ? AND work_date = ?";
  const params = attendanceId ? [reason, attendanceId] : [reason, employeeId, workDate];
  const [result] = await connection.query(
    `UPDATE attendances SET penalty_amount = 0, final_workday = base_workday, penalty_note = ? WHERE ${where}`,
    params,
  );
  if (!month || !employeeId || !result.affectedRows) return { cleared: false };
  await connection.query(
    `UPDATE monthly_timesheets
        SET total_late_penalty = (
          SELECT COALESCE(SUM(a.penalty_amount), 0) FROM attendances a
           WHERE a.employee_id = ? AND DATE_FORMAT(a.work_date, '%Y-%m') = ?
        )
      WHERE employee_id = ? AND month_year = ? AND status <> 'LOCKED'`,
    [employeeId, month, employeeId, month],
  );
  return { cleared: true };
};

export const getShiftWorkWindow = (shift) => {
  if (!shift) return null;
  const start = toMinutes(shift.start_time);
  const rawEnd = toMinutes(shift.end_time);
  if (start === null || rawEnd === null) return null;
  const overnight = Number(shift.is_overnight) === 1 && rawEnd <= start;
  const end = overnight ? rawEnd + 1440 : rawEnd;
  const hasBreak = Number(shift.has_break ?? 1) !== 0;
  let breakStart = hasBreak ? toMinutes(shift.break_start) : null;
  let breakEnd = hasBreak ? toMinutes(shift.break_end) : null;
  if (overnight && breakStart !== null && breakEnd !== null && breakEnd <= start) {
    breakStart += 1440;
    breakEnd += 1440;
  }
  const breakMinutes =
    breakStart !== null && breakEnd !== null
      ? Math.max(0, Math.min(end, breakEnd) - Math.max(start, breakStart))
      : 0;
  return {
    start,
    end,
    overnight,
    break_start: breakStart,
    break_end: breakEnd,
    break_minutes: breakMinutes,
    work_minutes: Math.max(0, end - start - breakMinutes),
  };
};

export const normalizeRules = (value) => {
  const raw = parseJson(value, {});
  const rules = { ...DEFAULT_RULES, ...raw };
  rules.pro_rata = { ...DEFAULT_RULES.pro_rata, ...(raw.pro_rata || {}) };
  rules.tiers = Array.isArray(raw.tiers)
    ? raw.tiers
        .map((tier) => ({
          min_hours: toNumber(tier.min_hours, 0),
          work_day: toNumber(tier.work_day, 0),
          label: tier.label || "",
        }))
        .sort((a, b) => b.min_hours - a.min_hours)
    : DEFAULT_RULES.tiers;
  rules.max_work_day = toNumber(rules.max_work_day, 1);
  rules.grace_late_minutes = toNumber(rules.grace_late_minutes, 5);
  rules.grace_early_minutes = toNumber(rules.grace_early_minutes, 0);
  rules.late_penalty = normalizeLatePenalty(raw.late_penalty);
  rules.clamp_early_in = rules.clamp_early_in !== false;
  rules.clamp_late_out = rules.clamp_late_out !== false;
  rules.work_day_mode =
    rules.work_day_mode === "CUSTOM_TIERS" ? "CUSTOM_TIERS" : "PRO_RATA";
  return rules;
};

const normalizePolicy = (row) =>
  row
    ? {
        ...row,
        is_default: Number(row.is_default) ? 1 : 0,
        rules: normalizeRules(row.rules_json),
        rules_json: normalizeRules(row.rules_json),
      }
    : null;

export const listPolicies = async () => {
  await ensureAttendancePolicySchema();
  const [rows] = await db.query(
    "SELECT id, code, name, is_default, rules_json FROM attendance_policies ORDER BY is_default DESC, id ASC",
  );
  return rows.map(normalizePolicy);
};

export const getPolicy = async (id) => {
  await ensureAttendancePolicySchema();
  const [rows] = await db.query(
    "SELECT id, code, name, is_default, rules_json FROM attendance_policies WHERE id = ? LIMIT 1",
    [id],
  );
  return normalizePolicy(rows[0] || null);
};

export const getDefaultPolicy = async (connection = db) => {
  await ensureAttendancePolicySchema();
  const [rows] = await connection.query(
    "SELECT id, code, name, is_default, rules_json FROM attendance_policies WHERE is_default = 1 ORDER BY id LIMIT 1",
  );
  return normalizePolicy(rows[0] || null);
};

export const getPolicyForShift = async (shift, connection = db) => {
  if (!shift) return getDefaultPolicy(connection);
  if (shift.policy_id) {
    const [rows] = await connection.query(
      "SELECT id, code, name, is_default, rules_json FROM attendance_policies WHERE id = ? LIMIT 1",
      [shift.policy_id],
    );
    if (rows[0]) return normalizePolicy(rows[0]);
  }
  return getDefaultPolicy(connection);
};

export const savePolicy = async (payload = {}, id = null) => {
  await ensureAttendancePolicySchema();
  const code = String(payload.code || "").trim().toUpperCase();
  const name = String(payload.name || "").trim();
  if (!/^[A-Z0-9_]{2,50}$/.test(code))
    throw policyError("Mã quy chế phải từ 2-50 ký tự, chữ in hoa, số hoặc gạch dưới");
  if (!name) throw policyError("Tên quy chế không được để trống");
  const rules = normalizeRules(payload.rules_json ?? payload.rules ?? {});
  normalizeLatePenalty(rules.late_penalty, true);
  const isDefault = Number(payload.is_default) ? 1 : 0;
  const [duplicate] = await db.query(
    "SELECT id FROM attendance_policies WHERE code = ? AND id <> ? LIMIT 1",
    [code, id || 0],
  );
  if (duplicate.length) throw policyError("Mã quy chế đã tồn tại", 409);
  if (id) {
    const [existing] = await db.query(
      "SELECT id FROM attendance_policies WHERE id = ? LIMIT 1",
      [id],
    );
    if (!existing.length) throw policyError("Không tìm thấy quy chế", 404);
    if (isDefault)
      await db.query("UPDATE attendance_policies SET is_default = 0");
    await db.query(
      `UPDATE attendance_policies
          SET code = ?, name = ?, is_default = ?, rules_json = ?, updated_by = ?
        WHERE id = ?`,
      [code, name, isDefault, JSON.stringify(rules), payload.updated_by || null, id],
    );
    return { id: Number(id) };
  }
  if (isDefault) await db.query("UPDATE attendance_policies SET is_default = 0");
  const [result] = await db.query(
    `INSERT INTO attendance_policies (code, name, is_default, rules_json, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      code,
      name,
      isDefault,
      JSON.stringify(rules),
      payload.created_by || null,
      payload.updated_by || null,
    ],
  );
  return { id: result.insertId };
};

export const deletePolicy = async (id) => {
  await ensureAttendancePolicySchema();
  const [rows] = await db.query(
    "SELECT id, is_default FROM attendance_policies WHERE id = ? LIMIT 1",
    [id],
  );
  if (!rows.length) throw policyError("Không tìm thấy quy chế", 404);
  if (Number(rows[0].is_default))
    throw policyError("Không thể xóa quy chế mặc định", 409);
  const [used] = await db.query(
    "SELECT id FROM work_shifts WHERE policy_id = ? LIMIT 1",
    [id],
  );
  if (used.length)
    throw policyError("Quy chế đang được gán cho ca làm việc", 409);
  await db.query("DELETE FROM attendance_policies WHERE id = ?", [id]);
  return { id: Number(id) };
};

export const getKioskConfig = async (connection = db) => {
  await ensureAttendancePolicySchema();
  const [rows] = await connection.query(
    "SELECT * FROM camera_kiosk_configs WHERE id = 1 LIMIT 1",
  );
  const row = rows[0] || {};
  return {
    id: 1,
    punch_mode: row.punch_mode || "AUTO_SMART",
    require_checkin_for_checkout: Number(row.require_checkin_for_checkout ?? 1) ? 1 : 0,
    anti_double_punch_minutes: toNumber(row.anti_double_punch_minutes, 3),
    checkout_repeat_policy:
      row.checkout_repeat_policy === "LOCK_FIRST" ? "LOCK_FIRST" : "OVERWRITE_LATEST",
    checkout_confirm_seconds: toNumber(row.checkout_confirm_seconds, 2),
    show_estimated_workday: Number(row.show_estimated_workday ?? 1) ? 1 : 0,
    ai_config: { ...DEFAULT_AI_CONFIG, ...parseJson(row.ai_config_json, {}) },
    network_config: {
      ...DEFAULT_NETWORK_CONFIG,
      ...parseJson(row.network_config_json, {}),
    },
  };
};

export const updateKioskConfig = async (payload = {}, user = null) => {
  await ensureAttendancePolicySchema();
  const current = await getKioskConfig();
  const punchMode = ["AUTO_SMART", "MANUAL_TABS"].includes(payload.punch_mode)
    ? payload.punch_mode
    : current.punch_mode;
  const repeatPolicy = ["OVERWRITE_LATEST", "LOCK_FIRST"].includes(
    payload.checkout_repeat_policy,
  )
    ? payload.checkout_repeat_policy
    : current.checkout_repeat_policy;
  const antiDouble = Math.max(
    0,
    Math.min(60, Math.round(toNumber(payload.anti_double_punch_minutes, current.anti_double_punch_minutes))),
  );
  const confirmSeconds = Math.max(
    0,
    Math.min(30, Math.round(toNumber(payload.checkout_confirm_seconds, current.checkout_confirm_seconds))),
  );
  const aiConfig = {
    ...current.ai_config,
    ...parseJson(payload.ai_config, {}),
  };
  aiConfig.similarity_threshold = Math.max(
    0.5,
    Math.min(0.99, toNumber(aiConfig.similarity_threshold, 0.65)),
  );
  aiConfig.voting_frames = Math.max(1, Math.min(20, Math.round(toNumber(aiConfig.voting_frames, 3))));
  const networkConfig = {
    ...current.network_config,
    ...parseJson(payload.network_config, {}),
  };
  await db.query(
    `UPDATE camera_kiosk_configs
        SET punch_mode = ?, require_checkin_for_checkout = ?,
            anti_double_punch_minutes = ?, checkout_repeat_policy = ?,
            checkout_confirm_seconds = ?, show_estimated_workday = ?,
            ai_config_json = ?, network_config_json = ?, updated_by = ?
      WHERE id = 1`,
    [
      punchMode,
      Number(payload.require_checkin_for_checkout ?? current.require_checkin_for_checkout) ? 1 : 0,
      antiDouble,
      repeatPolicy,
      confirmSeconds,
      Number(payload.show_estimated_workday ?? current.show_estimated_workday) ? 1 : 0,
      JSON.stringify(aiConfig),
      JSON.stringify(networkConfig),
      user?.user_id || null,
    ],
  );
  return getKioskConfig();
};

export const buildPolicySnapshot = async (shift, policy = null) => {
  await ensureAttendancePolicySchema();
  const resolved = policy || (await getPolicyForShift(shift));
  const window = getShiftWorkWindow(shift);
  const standardHours =
    window && window.work_minutes > 0
      ? Number((window.work_minutes / 60).toFixed(2))
      : toNumber(shift?.standard_work_hours ?? shift?.standard_hours, null);
  return {
    shift: {
      code: shift?.shift_code || shift?.code || null,
      name: shift?.name || null,
      start_time: shift?.start_time || null,
      end_time: shift?.end_time || null,
      is_overnight: Number(shift?.is_overnight) ? 1 : 0,
      has_break: Number(shift?.has_break ?? 1) ? 1 : 0,
      break_start: shift?.break_start || null,
      break_end: shift?.break_end || null,
      require_break_punch: Number(shift?.require_break_punch ?? 0) ? 1 : 0,
      standard_work_hours: standardHours,
      standard_hours: standardHours,
      workday_value: toNumber(shift?.workday_value, 1),
      grace_period_minutes: toNumber(
        shift?.grace_period_minutes ?? shift?.grace_period,
        15,
      ),
      allow_checkout_anytime: Number(shift?.allow_checkout_anytime ?? 1) ? 1 : 0,
      min_ot_minutes: toNumber(shift?.min_ot_minutes, 30),
    },
    policy: {
      id: resolved?.id || null,
      code: resolved?.code || "DEFAULT_OFFICE",
      ...(resolved?.rules || normalizeRules(null)),
    },
    calculated_at: new Date().toISOString(),
  };
};

export const computeWorkDay = ({ netHours = 0, rules = null, shift = null }) => {
  const config = normalizeRules(rules);
  const window = getShiftWorkWindow(shift);
  const configuredHours = toNumber(
    shift?.standard_work_hours ?? shift?.standard_hours,
    0,
  );
  const standardHours =
    window && window.work_minutes > 0
      ? window.work_minutes / 60
      : configuredHours > 0
        ? configuredHours
        : toNumber(netHours, 0);
  const shiftValue = toNumber(shift?.workday_value, 1);
  const cap = Math.max(
    0,
    Math.min(
      toNumber(config.max_work_day, 1),
      shiftValue > 0 ? shiftValue : 1,
    ),
  );
  if (config.work_day_mode === "CUSTOM_TIERS") {
    const baseline = Math.max(0, ...config.tiers.map((item) => item.min_hours)) || 1;
    const scale = standardHours > 0 ? standardHours / baseline : 1;
    const tier = config.tiers.find(
      (item) => netHours + 1e-9 >= item.min_hours * scale,
    );
    return Math.max(0, Math.min(cap, toNumber(tier?.work_day, 0)));
  }
  const ratio = standardHours > 0 ? netHours / standardHours : 0;
  const step = Math.max(0.01, toNumber(config.pro_rata.round_step, 0.25));
  const method = String(config.pro_rata.round_method || "ROUND").toUpperCase();
  const scaled = (ratio * cap) / step;
  const rounded =
    method === "FLOOR"
      ? Math.floor(scaled + 1e-9)
      : method === "CEIL"
        ? Math.ceil(scaled - 1e-9)
        : Math.round(scaled);
  return Math.max(0, Math.min(cap, Number((rounded * step).toFixed(4))));
};

export const previewLatePenalty = async (payload = {}) => {
  await ensureAttendancePolicySchema();
  const minutes = Math.max(0, Math.round(toNumber(payload.minutes, 0)));
  let rules;
  if (payload.rules !== undefined || payload.rules_json !== undefined) {
    rules = normalizeRules(payload.rules ?? payload.rules_json);
  } else if (payload.policy_id) {
    const policy = await getPolicy(payload.policy_id);
    if (!policy) throw policyError("Không tìm thấy quy chế", 404);
    rules = policy.rules;
  } else {
    rules = (await getDefaultPolicy())?.rules;
  }
  const result = calculateLatePenalty({ lateMinutes: minutes, rules });
  return {
    minutes,
    grace_minutes: toNumber(rules?.grace_late_minutes, 5),
    enabled: Boolean(rules?.late_penalty?.enabled),
    ...result,
  };
};
