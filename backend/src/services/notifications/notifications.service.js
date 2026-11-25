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
    version_id: Number(payload.versionId || 0) || null,
    previous_rejection_reason: payload.previousRejectionReason || "",
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

export const createContractDecisionNotifications = async (
  connection,
  payload,
) => {
  const submittedBy = Number(payload.submittedBy || 0);
  const [recipients] = await connection.query(
    `SELECT DISTINCT u.id
     FROM users u
     LEFT JOIN role_permissions rp ON rp.role_id = u.role_id
     LEFT JOIN permissions p ON p.id = rp.permission_id
     WHERE u.is_active = 1
       AND (
         p.permission_code IN ('HR.CONTRACT_MANAGE', 'HR.PROFILE_MANAGE')
         OR u.employee_id = ?
         OR (u.id = ? AND u.role_id <> 'DIRECTOR')
       )`,
    [submittedBy, submittedBy],
  );
  if (!recipients.length) return 0;

  const isApprove = String(payload.decision || "").toUpperCase() === "APPROVE";
  const eventKey = `CONTRACT_DECISION:${payload.submissionId}:${payload.decision}`;
  const notificationPayload = JSON.stringify({
    contract_id: Number(payload.contractId),
    contract_code: payload.contractCode || "",
    contract_type: payload.contractType || "",
    employee_id: Number(payload.employeeId),
    employee_name: payload.employeeName || "",
    decision: String(payload.decision || "").toUpperCase(),
    submitted_by: submittedBy,
    approver_name: payload.approverName || "",
    decided_at: payload.decidedAt,
    approval_round: Number(payload.approvalRound),
    version_id: Number(payload.versionId || 0) || null,
    rejection_reason: payload.rejectionReason || "",
    revision_request: payload.revisionRequest || "",
    note: payload.note || "",
  });
  const title = isApprove
    ? "Hợp đồng đã được Giám đốc phê duyệt"
    : "Hợp đồng bị Giám đốc từ chối";
  const decidedText = payload.decidedAt
    ? String(payload.decidedAt).replace("T", " ").slice(0, 16)
    : "";
  const decisionText = isApprove ? "Đã phê duyệt" : "Đã từ chối";
  const approverText = payload.approverName
    ? `Người duyệt: ${payload.approverName}`
    : "";
  const decisionDetail = isApprove
    ? payload.note || "Hợp đồng đã sẵn sàng cho bước ký chính thức"
    : `Lý do: ${payload.rejectionReason || "Không có"}. Yêu cầu chỉnh sửa: ${payload.revisionRequest || "Không có"}`;
  const body = [
    payload.employeeName || "Nhân viên",
    payload.contractCode || "Hợp đồng",
    decisionText,
    approverText,
    decidedText,
    decisionDetail,
  ]
    .filter(Boolean)
    .join(" • ")
    .slice(0, 500);

  let created = 0;
  for (const recipient of recipients) {
    const [result] = await connection.query(
      `INSERT IGNORE INTO notifications
        (recipient_user_id, type, title, body, target_type, target_id, event_key, payload)
        VALUES (?, 'CONTRACT_APPROVAL', ?, ?, 'CONTRACT', ?, ?, ?)`,
      [
        Number(recipient.id),
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

export const createContractSigningNotifications = async (
  connection,
  payload,
) => {
  const [recipients] = await connection.query(
    `SELECT DISTINCT u.id
     FROM users u
     LEFT JOIN role_permissions rp ON rp.role_id = u.role_id
     LEFT JOIN permissions p ON p.id = rp.permission_id
     LEFT JOIN contract_submission_history s ON s.id = ?
     LEFT JOIN users submitter ON submitter.employee_id = s.submitted_by OR submitter.id = s.submitted_by
     WHERE u.is_active = 1
       AND (
         p.permission_code IN ('HR.CONTRACT_MANAGE', 'HR.PROFILE_MANAGE', 'HR.CONTRACT_SIGN')
         OR u.employee_id = ?
         OR u.id = ?
         OR submitter.id = u.id
         OR u.role_id = 'DIRECTOR'
       )`,
    [
      Number(payload.submissionId || 0),
      Number(payload.signerId || 0),
      Number(payload.signerId || 0),
    ],
  );
  if (!recipients.length) return 0;

  const eventKey = `CONTRACT_SIGNED:${Number(payload.signatureId || 0)}`;
  const notificationPayload = JSON.stringify({
    contract_id: Number(payload.contractId),
    contract_code: payload.contractCode || "",
    contract_type: payload.contractType || "",
    employee_id: Number(payload.employeeId),
    employee_name: payload.employeeName || "",
    signer_id: Number(payload.signerId),
    signer_name: payload.signerName || "",
    signer_role: payload.signerRole || "",
    signed_at: payload.signedAt,
    submission_id: Number(payload.submissionId),
    version_id: Number(payload.versionId || 0) || null,
    version_no: Number(payload.versionNo || 0),
    result: "SUCCESS",
    signature_method: payload.signatureMethod || "INTERNAL_CONFIRMATION",
    official_file_name: payload.officialFileName || "",
  });
  const title = "Hợp đồng đã được ký chính thức";
  const body = [
    payload.employeeName || "Nhân viên",
    payload.contractCode || "Hợp đồng",
    `Phiên bản v${Number(payload.versionNo || 0)}`,
    `Người ký: ${payload.signerName || ""}`,
    String(payload.signedAt || "").replace("T", " ").slice(0, 16),
    "Xác nhận nội bộ, không phải chữ ký số",
  ]
    .filter(Boolean)
    .join(" • ")
    .slice(0, 500);

  let created = 0;
  for (const recipient of recipients) {
    const [result] = await connection.query(
      `INSERT IGNORE INTO notifications
        (recipient_user_id, type, title, body, target_type, target_id, event_key, payload)
       VALUES (?, 'CONTRACT_SIGNED', ?, ?, 'CONTRACT', ?, ?, ?)`,
      [
        Number(recipient.id),
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

export const createContractSigningRevisionNotifications = async (
  connection,
  payload,
) => {
  const [recipients] = await connection.query(
    `SELECT DISTINCT u.id
     FROM users u
     LEFT JOIN role_permissions rp ON rp.role_id = u.role_id
     LEFT JOIN permissions p ON p.id = rp.permission_id
     LEFT JOIN contract_submission_history s ON s.id = ?
     LEFT JOIN users submitter ON submitter.employee_id = s.submitted_by OR submitter.id = s.submitted_by
     WHERE u.is_active = 1
       AND (
         p.permission_code IN ('HR.CONTRACT_MANAGE', 'HR.PROFILE_MANAGE')
         OR submitter.id = u.id
         OR u.role_id = 'DIRECTOR'
       )`,
    [Number(payload.submissionId || 0)],
  );
  if (!recipients.length) return 0;

  const eventKey = `CONTRACT_SIGN_REVISION:${Number(payload.submissionId || 0)}`;

  const notificationPayload = JSON.stringify({
    contract_id: Number(payload.contractId),
    contract_code: payload.contractCode || "",
    contract_type: payload.contractType || "",
    employee_id: Number(payload.employeeId),
    employee_name: payload.employeeName || "",
    decision: "REJECT",
    signer_id: Number(payload.signerId),
    signer_name: payload.signerName || "",
    rejection_reason: payload.rejectionReason || "",
    revision_request: payload.revisionRequest || "",
    submission_id: Number(payload.submissionId),
    version_no: Number(payload.versionNo || 0),
  });
  const title = "Hợp đồng cần chỉnh sửa sau khi duyệt";
  const body = [
    payload.employeeName || "Nhân viên",
    payload.contractCode || "Hợp đồng",
    `Người yêu cầu: ${payload.signerName || ""}`,
    `Lý do: ${payload.rejectionReason || "Không có"}`,
    `Yêu cầu: ${payload.revisionRequest || "Không có"}`,
  ]
    .filter(Boolean)
    .join(" • ")
    .slice(0, 500);

  let created = 0;
  for (const recipient of recipients) {
    const [result] = await connection.query(
      `INSERT IGNORE INTO notifications
        (recipient_user_id, type, title, body, target_type, target_id, event_key, payload)
       VALUES (?, 'CONTRACT_APPROVAL', ?, ?, 'CONTRACT', ?, ?, ?)`,
      [
        Number(recipient.id),
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
