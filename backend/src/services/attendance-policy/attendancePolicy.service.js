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
      ];
      for (const [column, definition] of attendanceColumns) {
        if (await hasColumn(db, "attendances", column)) continue;
        await db.query(
          `ALTER TABLE attendances ADD COLUMN ${column} ${definition}`,
        );
        columnCache.delete(`attendances.${column}`);
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
      standard_work_hours: toNumber(
        shift?.standard_work_hours ?? shift?.standard_hours,
        8,
      ),
      standard_hours: toNumber(shift?.standard_hours, 8),
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
  const standardHours =
    toNumber(shift?.standard_work_hours ?? shift?.standard_hours, 8) || 8;
  const cap = Math.max(
    0,
    Math.min(toNumber(config.max_work_day, 1), toNumber(shift?.workday_value, 1) || 1),
  );
  if (config.work_day_mode === "CUSTOM_TIERS") {
    const tier = config.tiers.find((item) => netHours + 1e-9 >= item.min_hours);
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
