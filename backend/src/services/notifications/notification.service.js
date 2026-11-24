import { db } from "../../config/database.js";
import { resolveApprovalChain } from "../../utils/helper.js";

const PRIORITY_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
const AUDIENCE_SCOPES = ["COMPANY", "DEPARTMENT", "INDIVIDUAL", "ROLE"];
const DISPLAY_MODE = {
  LOW: "INBOX_ONLY",
  MEDIUM: "TOAST",
  HIGH: "TOAST_STICKY",
  CRITICAL: "MODAL",
};

const columnCache = new Map();
let schemaPromise;
const legacyColumns = { body: false, target_type: false, target_id: false, event_key: false };

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

const hasIndex = async (connection, table, indexName) => {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS total FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName],
  );
  return Number(rows[0]?.total) > 0;
};

const seedScopeBulletins = async () => {
  const seeds = [
    {
      key: "DEMO_BULLETIN_COMPANY_",
      scope: "COMPANY",
      departmentColumn: "NULL",
      title: "Thông báo toàn công ty: Cập nhật nội quy nội bộ 2026",
      message:
        "Bản tin chung dành cho toàn thể nhân sự. Vui lòng đọc và tuân thủ các quy định mới có hiệu lực từ tháng 06/2026.",
    },
    {
      key: "DEMO_BULLETIN_DEPARTMENT_",
      scope: "DEPARTMENT",
      departmentColumn: "e.department_id",
      title: "Bản tin phòng ban: Kế hoạch sinh hoạt định kỳ",
      message:
        "Thông báo này chỉ hiển thị với nhân sự thuộc phòng ban của bạn. Kiểm tra lịch họp và hoạt động nội bộ mới nhất.",
    },
    {
      key: "DEMO_BULLETIN_INDIVIDUAL_",
      scope: "INDIVIDUAL",
      departmentColumn: "NULL",
      title: "Thông báo cá nhân: Kiểm tra hồ sơ nhân sự",
      message:
        "Đây là thông báo riêng gửi trực tiếp đến tài khoản của bạn. Vui lòng rà soát thông tin cá nhân trên cổng HRM.",
    },
  ];

  for (const seed of seeds) {
    try {
      await db.query(
        `INSERT INTO notifications
           (recipient_user_id, recipient_employee_id, title, message, type,
            priority, priority_rank, display_mode, payload, audience_scope,
            target_department_id, dedupe_key, created_at)
         SELECT u.id, u.employee_id, ?, ?, 'BULLETIN',
                'LOW', 1, 'INBOX_ONLY', JSON_OBJECT('scope', ?), ?,
                ${seed.departmentColumn}, CONCAT(?, u.id), NOW()
           FROM users u
           LEFT JOIN employees e ON e.id = u.employee_id
          WHERE u.is_active = 1
            AND NOT EXISTS (
              SELECT 1 FROM notifications n
               WHERE n.dedupe_key = CONCAT(?, u.id)
            )`,
        [seed.title, seed.message, seed.scope, seed.scope, seed.key, seed.key],
      );
    } catch (error) {
      console.error("Không thể tạo bản tin mẫu theo đối tượng:", error.message);
    }
  }
};

export const ensureNotificationSchema = async () => {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await db.query(
        `CREATE TABLE IF NOT EXISTS notifications (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          recipient_user_id BIGINT UNSIGNED NULL,
          recipient_employee_id BIGINT UNSIGNED NULL,
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          type VARCHAR(80) NOT NULL DEFAULT 'GENERAL',
          audience_scope ENUM('COMPANY','DEPARTMENT','INDIVIDUAL','ROLE') NOT NULL DEFAULT 'INDIVIDUAL',
          target_department_id BIGINT UNSIGNED NULL,
          target_role_id VARCHAR(40) NULL,
          priority ENUM('CRITICAL','HIGH','MEDIUM','LOW') NOT NULL DEFAULT 'MEDIUM',
          priority_rank TINYINT NOT NULL DEFAULT 2,
          display_mode ENUM('MODAL','BANNER','TOAST_STICKY','TOAST','INBOX_ONLY') NOT NULL DEFAULT 'TOAST',
          payload JSON NULL,
          action_url VARCHAR(255) NULL,
          action_label VARCHAR(80) NULL,
          require_action TINYINT(1) NOT NULL DEFAULT 0,
          is_read TINYINT(1) NOT NULL DEFAULT 0,
          is_resolved TINYINT(1) NOT NULL DEFAULT 0,
          expires_at DATETIME NULL,
          read_at DATETIME NULL,
          resolved_at DATETIME NULL,
          dedupe_key VARCHAR(150) NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      );

      const definitions = [
        ["recipient_user_id", "BIGINT UNSIGNED NULL AFTER id"],
        ["recipient_employee_id", "BIGINT UNSIGNED NULL AFTER recipient_user_id"],
        ["message", "TEXT NULL AFTER title"],
        ["audience_scope", "ENUM('COMPANY','DEPARTMENT','INDIVIDUAL','ROLE') NOT NULL DEFAULT 'INDIVIDUAL' AFTER type"],
        ["target_department_id", "BIGINT UNSIGNED NULL AFTER audience_scope"],
        ["target_role_id", "VARCHAR(40) NULL AFTER target_department_id"],
        ["priority", "ENUM('CRITICAL','HIGH','MEDIUM','LOW') NOT NULL DEFAULT 'MEDIUM' AFTER target_role_id"],
        ["priority_rank", "TINYINT NOT NULL DEFAULT 2 AFTER priority"],
        ["display_mode", "ENUM('MODAL','BANNER','TOAST_STICKY','TOAST','INBOX_ONLY') NOT NULL DEFAULT 'TOAST' AFTER priority_rank"],
        ["action_url", "VARCHAR(255) NULL AFTER payload"],
        ["action_label", "VARCHAR(80) NULL AFTER action_url"],
        ["require_action", "TINYINT(1) NOT NULL DEFAULT 0 AFTER action_label"],
        ["is_resolved", "TINYINT(1) NOT NULL DEFAULT 0 AFTER is_read"],
        ["expires_at", "DATETIME NULL AFTER is_resolved"],
        ["resolved_at", "DATETIME NULL AFTER read_at"],
        ["dedupe_key", "VARCHAR(150) NULL AFTER expires_at"],
      ];
      for (const [column, definition] of definitions) {
        if (await hasColumn(db, "notifications", column)) continue;
        await db.query(`ALTER TABLE notifications ADD COLUMN ${column} ${definition}`);
        columnCache.delete(`notifications.${column}`);
      }
      if (!(await hasIndex(db, "notifications", "idx_notif_user_priority"))) {
        await db.query(
          "CREATE INDEX idx_notif_user_priority ON notifications (recipient_user_id, is_read, priority_rank, created_at)",
        );
      }
      if (!(await hasIndex(db, "notifications", "idx_notif_scope_target"))) {
        await db.query(
          "CREATE INDEX idx_notif_scope_target ON notifications (audience_scope, target_department_id)",
        );
      }
      for (const column of Object.keys(legacyColumns)) {
        legacyColumns[column] = await hasColumn(db, "notifications", column);
      }
      await seedScopeBulletins();
    })().catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  return schemaPromise;
};

const streams = new Map();

const normalizeNotification = (row) => ({
  id: row.id,
  title: row.title,
  message: row.message ?? row.body ?? "",
  type: row.type,
  audience_scope: AUDIENCE_SCOPES.includes(String(row.audience_scope || "").toUpperCase())
    ? String(row.audience_scope).toUpperCase()
    : String(row.target_type || "").toUpperCase() === "COMPANY"
      ? "COMPANY"
      : String(row.target_type || "").toUpperCase() === "DEPARTMENT"
        ? "DEPARTMENT"
        : "INDIVIDUAL",
  target_department_id: row.target_department_id ?? null,
  target_role_id: row.target_role_id ?? null,
  priority: row.priority,
  priority_rank: Number(row.priority_rank ?? PRIORITY_RANK[row.priority] ?? 2),
  display_mode: row.display_mode || DISPLAY_MODE[row.priority] || "TOAST",
  payload: row.payload || {},
  action_url: row.action_url || null,
  action_label: row.action_label || null,
  require_action: Boolean(row.require_action),
  is_read: Boolean(row.is_read),
  is_resolved: Boolean(row.is_resolved),
  created_at: row.created_at,
});

export const registerNotificationStream = (userId, response) => {
  const key = String(userId);
  if (!streams.has(key)) streams.set(key, new Set());
  streams.get(key).add(response);
  const heartbeat = setInterval(() => {
    try {
      response.write(": ping\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 25000);
  return () => {
    clearInterval(heartbeat);
    streams.get(key)?.delete(response);
    if (!streams.get(key)?.size) streams.delete(key);
  };
};

const writeEvent = (userId, eventName, payload) => {
  const clients = streams.get(String(userId));
  if (!clients?.size) return;
  const chunk = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    try {
      client.write(chunk);
    } catch {
      clients.delete(client);
    }
  }
};

export const publishNotificationEvent = (userId, eventName, payload) => {
  if (userId != null) writeEvent(userId, eventName, payload);
};

export const publishNotificationRow = (row) => {
  if (!row?.recipient_user_id) return;
  writeEvent(row.recipient_user_id, "notification:new", normalizeNotification(row));
};

export const publishFaceResolved = async (employeeId) => {
  const userIds = await resolveUserIdsByEmployees(db, [employeeId]);
  for (const userId of userIds) {
    writeEvent(userId, "notification:resolved", {
      type: "FACE_ENROLLMENT_REQUIRED",
      employee_id: Number(employeeId),
    });
  }
};

const resolveUserIdsByEmployees = async (connection, employeeIds) => {
  const ids = [...new Set(employeeIds.map(Number).filter(Boolean))];
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  const [rows] = await connection.query(
    `SELECT id FROM users WHERE employee_id IN (${placeholders})`,
    ids,
  );
  return rows.map((row) => row.id);
};

const resolveUserIdByEmployee = async (connection, employeeId) => {
  const [rows] = await connection.query(
    "SELECT id FROM users WHERE employee_id = ? ORDER BY id LIMIT 1",
    [employeeId],
  );
  return rows[0]?.id ?? null;
};

export const resolveUserIdsForApprovers = async (connection, employeeId) => {
  const chain = await resolveApprovalChain(connection, employeeId);
  if (!chain) return [];
  return resolveUserIdsByEmployees(connection, [...chain.approvers]);
};

export const createNotification = async (connection, data = {}) => {
  await ensureNotificationSchema();
  const priority = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(data.priority)
    ? data.priority
    : "MEDIUM";
  const dedupeKey = data.dedupe_key ? String(data.dedupe_key).slice(0, 150) : null;
  if (dedupeKey) {
    const [existing] = await connection.query(
      "SELECT id FROM notifications WHERE dedupe_key = ? AND is_resolved = 0 LIMIT 1",
      [dedupeKey],
    );
    if (existing.length) return null;
  }

  const message = String(data.message || "");
  const notificationType = String(data.type || "GENERAL").slice(0, 50);
  const columns = [
    "recipient_user_id",
    "recipient_employee_id",
    "title",
    "message",
    "type",
    "audience_scope",
    "target_department_id",
    "target_role_id",
    "priority",
    "priority_rank",
    "display_mode",
    "payload",
    "action_url",
    "action_label",
    "require_action",
    "expires_at",
    "dedupe_key",
    "created_at",
  ];
  const values = [
    data.recipient_user_id ?? null,
    data.recipient_employee_id ?? null,
    String(data.title || "Thông báo").slice(0, 255),
    message,
    notificationType,
    AUDIENCE_SCOPES.includes(String(data.audience_scope || "").toUpperCase())
      ? String(data.audience_scope).toUpperCase()
      : "INDIVIDUAL",
    data.target_department_id ?? null,
    data.target_role_id ? String(data.target_role_id).slice(0, 40) : null,
    priority,
    PRIORITY_RANK[priority],
    data.display_mode || DISPLAY_MODE[priority],
    JSON.stringify(data.payload || {}),
    data.action_url ? String(data.action_url).slice(0, 255) : null,
    data.action_label ? String(data.action_label).slice(0, 80) : null,
    data.require_action ? 1 : 0,
    data.expires_at || null,
    dedupeKey,
    new Date(),
  ];
  if (legacyColumns.body) {
    columns.push("body");
    values.push(message);
  }
  if (legacyColumns.target_type) {
    columns.push("target_type");
    values.push(String(data.target_type || data.type || "GENERAL").slice(0, 50));
  }
  if (legacyColumns.target_id) {
    columns.push("target_id");
    values.push(Number(data.target_id || data.payload?.target_id || 0));
  }
  if (legacyColumns.event_key) {
    columns.push("event_key");
    values.push(String(data.event_key || dedupeKey || notificationType).slice(0, 120));
  }
  const placeholders = columns.map(() => "?").join(", ");
  const [result] = await connection.query(
    `INSERT INTO notifications (${columns.join(", ")}) VALUES (${placeholders})`,
    values,
  );
  const [rows] = await connection.query(
    "SELECT * FROM notifications WHERE id = ?",
    [result.insertId],
  );
  return rows[0];
};

export const notifyUsers = async (connection, userIds = [], data = {}) => {
  const rows = [];
  for (const userId of [...new Set(userIds.map(Number).filter(Boolean))]) {
    const row = await createNotification(connection, {
      ...data,
      recipient_user_id: userId,
    });
    if (row) rows.push(row);
  }
  return rows;
};

export const notifyCompany = async (connection, data = {}) => {
  const [rows] = await connection.query(
    "SELECT id FROM users WHERE is_active = 1",
  );
  return notifyUsers(connection, rows.map((row) => row.id), {
    ...data,
    audience_scope: "COMPANY",
  });
};

export const notifyDepartment = async (connection, departmentId, data = {}) => {
  const [rows] = await connection.query(
    `SELECT u.id
       FROM users u
       JOIN employees e ON e.id = u.employee_id
      WHERE u.is_active = 1 AND e.department_id = ?`,
    [departmentId],
  );
  return notifyUsers(connection, rows.map((row) => row.id), {
    ...data,
    audience_scope: "DEPARTMENT",
    target_department_id: departmentId,
  });
};

export const notifyEmployee = async (connection, employeeId, data = {}) => {
  const userId = await resolveUserIdByEmployee(connection, employeeId);
  if (!userId) return [];
  const rows = await notifyUsers(connection, [userId], {
    ...data,
    recipient_employee_id: Number(employeeId),
    audience_scope: "INDIVIDUAL",
  });
  return rows;
};

export const notifyApprovers = async (connection, employeeId, data = {}) => {
  const userIds = await resolveUserIdsForApprovers(connection, employeeId);
  return notifyUsers(connection, userIds, data);
};

export const sendNotification = async (data = {}) => {
  const row = await createNotification(db, data);
  if (row) publishNotificationRow(row);
  return row;
};

export const resolveFaceAlertsForEmployee = async (connection, employeeId) => {
  await ensureNotificationSchema();
  await connection.query(
    `UPDATE notifications
        SET is_resolved = 1, resolved_at = NOW()
      WHERE recipient_employee_id = ?
        AND is_resolved = 0
        AND type IN ('FACE_ENROLLMENT_REQUIRED', 'FACE_RESET')`,
    [employeeId],
  );
};

export const getBootstrap = async (user) => {
  await ensureNotificationSchema();
  const [employees] = await db.query(
    `SELECT id, face_status,
            (face_descriptor IS NOT NULL AND TRIM(face_descriptor) <> '') AS has_face_descriptor
       FROM employees WHERE id = ? LIMIT 1`,
    [user?.employee_id],
  );
  const employee = employees[0];
  const blockingAlerts = [];
  if (
    employee &&
    (employee.face_status !== "ACTIVE" || !Number(employee.has_face_descriptor))
  ) {
    blockingAlerts.push({
      id: `FACE_ENROLLMENT_REQUIRED:${employee.id}`,
      type: "FACE_ENROLLMENT_REQUIRED",
      title: "Cần kích hoạt FaceID",
      message: "Tài khoản chưa có khuôn mặt hợp lệ. Vui lòng đăng ký FaceID để điểm danh.",
      priority: "CRITICAL",
      priority_rank: 4,
      display_mode: "MODAL",
      action_url: "#/ho-so-ca-nhan",
      action_label: "Đăng ký ngay",
      require_action: true,
      is_resolved: false,
      is_read: false,
      created_at: new Date().toISOString(),
      payload: { employee_id: employee.id },
    });
  }

  const [rows] = await db.query(
    `SELECT * FROM notifications
      WHERE recipient_user_id = ? AND is_read = 0 AND is_resolved = 0
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY priority_rank DESC, created_at DESC
      LIMIT 100`,
    [user.user_id],
  );
  const unread = rows.map(normalizeNotification);
  for (const item of unread) {
    if (item.priority === "CRITICAL") blockingAlerts.push(item);
  }
  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total FROM notifications
      WHERE recipient_user_id = ? AND is_read = 0 AND is_resolved = 0
        AND (expires_at IS NULL OR expires_at > NOW())`,
    [user.user_id],
  );
  return {
    blocking_alerts: blockingAlerts,
    startup_popup: unread.find((item) => item.display_mode === "MODAL") || null,
    notifications: unread,
    unread_count: Number(countRows[0]?.total || 0) + (blockingAlerts.length ? 1 : 0),
  };
};

export const listNotifications = async (user, filters = {}) => {
  await ensureNotificationSchema();
  const params = [user.user_id];
  let condition = "recipient_user_id = ?";
  if (filters.unread === "true" || filters.unread === true) condition += " AND is_read = 0";
  const [rows] = await db.query(
    `SELECT * FROM notifications WHERE ${condition}
      ORDER BY priority_rank DESC, created_at DESC LIMIT 200`,
    params,
  );
  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total FROM notifications WHERE ${condition}`,
    params,
  );
  return { notifications: rows.map(normalizeNotification), unread_count: Number(countRows[0]?.total || 0) };
};

export const markNotificationRead = async (user, id) => {
  await ensureNotificationSchema();
  const [result] = await db.query(
    `UPDATE notifications SET is_read = 1, read_at = NOW()
      WHERE id = ? AND recipient_user_id = ?`,
    [id, user.user_id],
  );
  return result.affectedRows > 0;
};

export const markAllNotificationsRead = async (user) => {
  await ensureNotificationSchema();
  await db.query(
    "UPDATE notifications SET is_read = 1, read_at = NOW() WHERE recipient_user_id = ? AND is_read = 0",
    [user.user_id],
  );
  return true;
};

export const resolveNotification = async (user, id) => {
  await ensureNotificationSchema();
  const [result] = await db.query(
    `UPDATE notifications
        SET is_resolved = 1, is_read = 1, resolved_at = NOW(), read_at = COALESCE(read_at, NOW())
      WHERE id = ? AND recipient_user_id = ?`,
    [id, user.user_id],
  );
  if (result.affectedRows > 0) {
    writeEvent(user.user_id, "notification:resolved", { id: Number(id) });
  }
  return result.affectedRows > 0;
};
