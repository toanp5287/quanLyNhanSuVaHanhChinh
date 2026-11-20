import { db } from "../../config/database.js";

const NOTIFICATION_LIMIT = 30;

const parsePayload = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const mapNotification = (row) => ({
  id: Number(row.id),
  type: row.type,
  title: row.title,
  body: row.body,
  target_type: row.target_type,
  target_id: Number(row.target_id),
  is_read: Boolean(row.is_read),
  created_at: row.created_at,
  read_at: row.read_at || null,
  payload: parsePayload(row.payload),
});

export const getNotifications = async (user, limit = NOTIFICATION_LIMIT) => {
  const recipientId = Number(user?.user_id || user?.id);
  if (!recipientId) return [];

  const safeLimit = Math.min(100, Math.max(1, Number(limit) || NOTIFICATION_LIMIT));
  const [rows] = await db.query(
    `SELECT
      id,
      type,
      title,
      body,
      target_type,
      target_id,
      is_read,
      DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(read_at, '%Y-%m-%d %H:%i:%s') AS read_at,
      payload
    FROM notifications
    WHERE recipient_user_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?`,
    [recipientId, safeLimit],
  );

  return rows.map(mapNotification);
};

export const getUnreadNotificationCount = async (user) => {
  const recipientId = Number(user?.user_id || user?.id);
  if (!recipientId) return 0;

  const [rows] = await db.query(
    "SELECT COUNT(*) AS total FROM notifications WHERE recipient_user_id = ? AND is_read = 0",
    [recipientId],
  );

  return Number(rows[0]?.total || 0);
};

export const markNotificationRead = async (user, notificationId) => {
  const recipientId = Number(user?.user_id || user?.id);
  const id = Number(notificationId);
  if (!recipientId || !id) return { notFound: true };

  const [result] = await db.query(
    "UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND recipient_user_id = ? AND is_read = 0",
    [id, recipientId],
  );

  if (!result.affectedRows) {
    const [rows] = await db.query(
      "SELECT id FROM notifications WHERE id = ? AND recipient_user_id = ?",
      [id, recipientId],
    );
    return rows.length ? { success: true } : { notFound: true };
  }

  return { success: true };
};

export const markAllNotificationsRead = async (user) => {
  const recipientId = Number(user?.user_id || user?.id);
  if (!recipientId) return { success: true, updated: 0 };

  const [result] = await db.query(
    "UPDATE notifications SET is_read = 1, read_at = NOW() WHERE recipient_user_id = ? AND is_read = 0",
    [recipientId],
  );

  return { success: true, updated: Number(result.affectedRows || 0) };
};

export const createContractSubmissionNotifications = async (
  connection,
  payload,
) => {
  const [directors] = await connection.query(
    "SELECT id FROM users WHERE role_id = 'DIRECTOR' AND is_active = 1",
  );
  if (!directors.length) return 0;

  const eventKey = `CONTRACT_SUBMISSION:${payload.submissionId}`;
  const notificationPayload = JSON.stringify({
    contract_id: Number(payload.contractId),
    contract_code: payload.contractCode || "",
    contract_type: payload.contractType || "",
    employee_id: Number(payload.employeeId),
    employee_name: payload.employeeName || "",
    base_salary: Number(payload.baseSalary || 0),
    submitted_by: Number(payload.submittedBy),
    submitted_by_name: payload.submittedByName || "",
    submitted_at: payload.submittedAt,
    approval_round: Number(payload.approvalRound),
    note: payload.note || "",
  });

  const title = "Hợp đồng chờ Giám đốc duyệt";
  const body = `${payload.employeeName || "Nhân viên"} • ${payload.contractCode || "Hợp đồng"} • ${payload.contractType || ""}`.trim();

  let created = 0;
  for (const director of directors) {
    const [result] = await connection.query(
      `INSERT IGNORE INTO notifications
        (recipient_user_id, type, title, body, target_type, target_id, event_key, payload)
       VALUES (?, 'CONTRACT_APPROVAL', ?, ?, 'CONTRACT', ?, ?, ?)`,
      [
        Number(director.id),
        title,
        body,
        Number(payload.contractId),
        eventKey,
        notificationPayload,
      ],
    );
    created += Number(result.affectedRows || 0);
  }

  return created;
};
