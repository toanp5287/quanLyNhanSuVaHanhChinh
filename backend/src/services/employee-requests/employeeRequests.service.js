import { db } from "../../config/database.js";
import {
  assertCanApprove,
  buildEmployeeScope,
  hasPermission,
} from "../../utils/helper.js";
import {
  clearLatePenalty,
  ensureAttendancePolicySchema,
} from "../attendance-policy/attendancePolicy.service.js";

const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });

const REQUEST_TYPES = ["RESIGNATION", "TEMPORARY_LEAVE"];
const DEFAULT_TITLES = {
  RESIGNATION: "Đơn xin nghỉ việc",
  TEMPORARY_LEAVE: "Đơn xin tạm nghỉ",
};
const ACTIVE_STATUSES = [
  "DRAFT",
  "PENDING_DEPARTMENT",
  "PENDING_HR",
  "WAITING_EMPLOYEE_UPDATE",
  "PENDING_DIRECTOR",
];
const VIEW_STATUSES = [
  ...ACTIVE_STATUSES,
  "APPROVED",
  "REJECTED",
  "CANCELLED",
];
const REQUEST_COLUMNS = `r.id, r.employee_id, r.department_id, r.request_type,
  r.title, r.reason, r.document_id, r.document_title, r.document_template_code,
  r.document_content_json, r.document_content_html,
  DATE_FORMAT(r.start_date, '%Y-%m-%d') AS start_date,
  DATE_FORMAT(r.last_working_date, '%Y-%m-%d') AS last_working_date,
  DATE_FORMAT(r.end_date, '%Y-%m-%d') AS end_date,
  r.status, r.submitted_at, r.created_at, r.updated_at,
  r.employee_code_snapshot AS employee_code_at_submit,
  r.full_name_snapshot AS full_name_at_submit,
  r.department_name_snapshot AS department_name_at_submit,
  COALESCE(r.employee_code_snapshot, e.employee_code) AS employee_code,
  COALESCE(r.full_name_snapshot, e.full_name) AS full_name,
  COALESCE(r.department_name_snapshot, d.department_name, d.name) AS department_name,
  EXISTS(
    SELECT 1 FROM request_information_requests rir
    WHERE rir.request_id = r.id AND rir.status = 'SUBMITTED'
  ) AS has_pending_supplement`;

const parseDate = (value, field) => {
  const text = String(value || "");
  const parsed = new Date(`${text}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== text
  ) {
    throw fail(`${field} không hợp lệ (YYYY-MM-DD)`);
  }
  return text;
};

const parseText = (value, field, { required = false, max = 255 } = {}) => {
  const text = String(value ?? "").trim();
  if (required && !text) throw fail(`Vui lòng nhập ${field}`);
  if (text.length > max) throw fail(`${field} không được vượt quá ${max} ký tự`);
  return text;
};

const parsePositiveInt = (value, field) => {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw fail(`${field} không hợp lệ`);
  }
  return number;
};

const normalizeRequestRow = (row) => {
  if (!row) return row;
  let documentContent = null;
  if (row.document_content_json) {
    try {
      documentContent =
        typeof row.document_content_json === "string"
          ? JSON.parse(row.document_content_json)
          : row.document_content_json;
    } catch (error) {
      documentContent = null;
    }
  }
  return {
    ...row,
    document_content_json: documentContent,
  };
};

const buildListFilters = (filters = {}) => {
  const result = {};
  if (filters.request_type) {
    if (!REQUEST_TYPES.includes(filters.request_type)) {
      throw fail("Loại đơn không hợp lệ");
    }
    result.request_type = filters.request_type;
  }
  if (filters.status) {
    if (!VIEW_STATUSES.includes(filters.status)) {
      throw fail("Trạng thái đơn không hợp lệ");
    }
    result.status = filters.status;
  }
  result.employee_id = parsePositiveInt(filters.employee_id, "Mã nhân viên");
  result.department_id = parsePositiveInt(filters.department_id, "Mã phòng ban");
  result.from_date = filters.from_date
    ? parseDate(filters.from_date, "Từ ngày")
    : null;
  result.to_date = filters.to_date ? parseDate(filters.to_date, "Đến ngày") : null;
  if (result.from_date && result.to_date && result.to_date < result.from_date) {
    throw fail("Đến ngày không được trước từ ngày");
  }
  result.keyword = parseText(filters.keyword || filters.q, "Từ khóa", {
    max: 100,
  });
  return result;
};

const transaction = async (operation) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const createEmployeeRequest = async (
  user,
  payload = {},
  requestType,
) => {
  if (!REQUEST_TYPES.includes(requestType)) throw fail("Loại đơn không hợp lệ");

  const employeeId = Number(user?.employee_id);
  if (!Number.isSafeInteger(employeeId) || employeeId <= 0) {
    throw fail("Tài khoản chưa liên kết hồ sơ nhân sự", 403);
  }
  const actorId = Number(user?.user_id ?? employeeId);
  if (!Number.isSafeInteger(actorId) || actorId <= 0) {
    throw fail("Thông tin người dùng không hợp lệ", 403);
  }
  if (
    payload.employee_id &&
    Number(payload.employee_id) !== employeeId
  ) {
    throw fail("Chỉ được tạo đơn cho chính mình", 403);
  }

  const title = parseText(payload.title || DEFAULT_TITLES[requestType], "tiêu đề", {
    required: true,
  });
  const reason = parseText(payload.reason, "lý do", {
    required: true,
    max: 5000,
  });
  const documentId = parsePositiveInt(payload.document_id, "Mã văn bản");
  const documentTitle = payload.document_title
    ? parseText(payload.document_title, "tiêu đề văn bản", { max: 255 })
    : null;
  const documentTemplateCode = payload.document_template_code
    ? parseText(payload.document_template_code, "mẫu văn bản", { max: 50 }).toLowerCase()
    : null;
  let documentContentJson = null;
  let documentContentHtml = null;
  if (payload.document_content_json) {
    documentContentJson =
      typeof payload.document_content_json === "string"
        ? payload.document_content_json
        : JSON.stringify(payload.document_content_json);
    parseText(documentContentJson, "nội dung văn bản", { max: 2000000 });
  }
  if (payload.document_content_html) {
    documentContentHtml = parseText(payload.document_content_html, "nội dung văn bản", {
      max: 2000000,
    });
  }

  let startDate;
  let lastWorkingDate = null;
  let endDate = null;

  if (requestType === "RESIGNATION") {
    lastWorkingDate = parseDate(
      payload.last_working_date || payload.start_date,
      "ngày làm việc cuối",
    );
    startDate = payload.start_date
      ? parseDate(payload.start_date, "ngày bắt đầu nghỉ")
      : lastWorkingDate;
    if (lastWorkingDate < startDate) {
      throw fail("Ngày làm việc cuối không được trước ngày bắt đầu nghỉ");
    }
  } else {
    startDate = parseDate(payload.start_date, "ngày bắt đầu tạm nghỉ");
    endDate = parseDate(payload.end_date, "ngày kết thúc tạm nghỉ");
    if (endDate < startDate) {
      throw fail("Ngày kết thúc tạm nghỉ không được trước ngày bắt đầu");
    }
  }

  return transaction(async (connection) => {
    const [employees] = await connection.query(
      `SELECT e.id, e.department_id, e.employee_code, e.full_name,
              COALESCE(d.department_name, d.name) AS department_name
         FROM employees e
         LEFT JOIN departments d ON d.id = e.department_id
        WHERE e.id = ? LIMIT 1`,
      [employeeId],
    );
    if (!employees.length) throw fail("Không tìm thấy hồ sơ nhân sự", 404);
    const departmentId = employees[0].department_id ?? null;
    const employeeCodeSnapshot = employees[0].employee_code ?? null;
    const fullNameSnapshot = employees[0].full_name ?? null;
    const departmentNameSnapshot = employees[0].department_name ?? null;

    const placeholders = ACTIVE_STATUSES.map(() => "?").join(", ");
    const statusParams = [employeeId, requestType, ...ACTIVE_STATUSES];
    const [existing] = await connection.query(
      `SELECT id FROM employee_requests
        WHERE employee_id = ? AND request_type = ? AND status IN (${placeholders})
        ${requestType === "TEMPORARY_LEAVE" ? "AND start_date <= ? AND end_date >= ?" : ""}
        LIMIT 1`,
      requestType === "TEMPORARY_LEAVE"
        ? [...statusParams, endDate, startDate]
        : statusParams,
    );
    if (existing.length) throw fail("Đã tồn tại đơn đang xử lý trùng nội dung", 409);

    const [result] = await connection.query(
      `INSERT INTO employee_requests
        (employee_id, department_id, employee_code_snapshot, full_name_snapshot, department_name_snapshot,
         request_type, title, reason, document_id, document_title, document_template_code,
         document_content_json, document_content_html,
         start_date, last_working_date, end_date, status, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_DEPARTMENT', NOW())`,
      [
        employeeId,
        departmentId,
        employeeCodeSnapshot,
        fullNameSnapshot,
        departmentNameSnapshot,
        requestType,
        title,
        reason,
        documentId,
        documentTitle,
        documentTemplateCode,
        documentContentJson,
        documentContentHtml,
        startDate,
        lastWorkingDate,
        endDate,
      ],
    );

    await connection.query(
      `INSERT INTO workflow_actions
        (entity_type, entity_id, actor_id, action, from_status, to_status, comment)
        VALUES ('EMPLOYEE_REQUEST', ?, ?, 'SUBMIT', 'DRAFT', 'PENDING_DEPARTMENT', ?)`,
      [result.insertId, actorId, title],
    );

    const [rows] = await connection.query(
      "SELECT id, request_type, title, status, submitted_at FROM employee_requests WHERE id = ?",
      [result.insertId],
    );
    return rows[0];
  });
};

export const createResignationRequest = (user, payload = {}) =>
  createEmployeeRequest(user, payload, "RESIGNATION");

export const createTemporaryLeaveRequest = (user, payload = {}) =>
  createEmployeeRequest(user, payload, "TEMPORARY_LEAVE");

export const listEmployeeRequests = async (user, filters = {}) => {
  const parsed = buildListFilters(filters);
  const scope = buildEmployeeScope(user);
  const conditions = [scope.clause || "WHERE 1 = 1"];
  const params = [...scope.params];

  if (parsed.request_type) {
    conditions.push("r.request_type = ?");
    params.push(parsed.request_type);
  }
  if (parsed.status) {
    conditions.push("r.status = ?");
    params.push(parsed.status);
  }
  if (parsed.employee_id) {
    conditions.push("r.employee_id = ?");
    params.push(parsed.employee_id);
  }
  if (parsed.department_id) {
    conditions.push("r.department_id = ?");
    params.push(parsed.department_id);
  }
  if (parsed.from_date) {
    conditions.push("r.start_date >= ?");
    params.push(parsed.from_date);
  }
  if (parsed.to_date) {
    conditions.push("r.start_date <= ?");
    params.push(parsed.to_date);
  }
  if (parsed.keyword) {
    conditions.push(
      "(r.title LIKE ? OR r.reason LIKE ? OR e.employee_code LIKE ? OR e.full_name LIKE ?)",
    );
    const pattern = `%${parsed.keyword}%`;
    params.push(pattern, pattern, pattern, pattern);
  }

  const [rows] = await db.query(
    `SELECT ${REQUEST_COLUMNS}
      FROM employee_requests r
      JOIN employees e ON e.id = r.employee_id
      LEFT JOIN departments d ON d.id = r.department_id
      ${conditions.join(" AND ")}
      ORDER BY r.id DESC`,
    params,
  );

  const summary = {
    total: rows.length,
    pending: rows.filter((row) => ACTIVE_STATUSES.includes(row.status)).length,
    approved: rows.filter((row) => row.status === "APPROVED").length,
    rejected: rows.filter((row) => row.status === "REJECTED").length,
  };

  return { total: rows.length, summary, requests: rows.map(normalizeRequestRow) };
};

const selectWorkflowHistory = async (executor, requestId) => {
  const [rows] = await executor.query(
    `SELECT a.id, a.action, a.from_status, a.to_status, a.comment, a.created_at,
            COALESCE(emp.full_name, u.username) AS actor_name
      FROM workflow_actions a
      LEFT JOIN users u ON u.id = a.actor_id
      LEFT JOIN employees emp ON emp.id = u.employee_id
      WHERE a.entity_type = 'EMPLOYEE_REQUEST' AND a.entity_id = ?
      ORDER BY a.id ASC`,
    [requestId],
  );
  return rows;
};

export const getEmployeeRequestDetail = async (user, id) => {
  const requestId = parsePositiveInt(id, "Mã đơn");
  if (!requestId) throw fail("Mã đơn không hợp lệ");

  const scope = buildEmployeeScope(user);
  const [rows] = await db.query(
    `SELECT ${REQUEST_COLUMNS}
      FROM employee_requests r
      JOIN employees e ON e.id = r.employee_id
      LEFT JOIN departments d ON d.id = r.department_id
      ${scope.clause || "WHERE 1 = 1"} AND r.id = ?
      LIMIT 1`,
    [...scope.params, requestId],
  );
  if (!rows.length) throw fail("Không tìm thấy đơn", 404);

  const timeline = await selectWorkflowHistory(db, requestId);
  return { ...normalizeRequestRow(rows[0]), timeline };
};

export const getEmployeeRequestHistory = async (user, id) => {
  const requestId = parsePositiveInt(id, "Mã đơn");
  if (!requestId) throw fail("Mã đơn không hợp lệ");

  const scope = buildEmployeeScope(user);
  const [rows] = await db.query(
    `SELECT r.id
      FROM employee_requests r
      JOIN employees e ON e.id = r.employee_id
      ${scope.clause || "WHERE 1 = 1"} AND r.id = ?
      LIMIT 1`,
    [...scope.params, requestId],
  );
  if (!rows.length) throw fail("Không tìm thấy đơn", 404);

  return {
    request_id: requestId,
    entity_type: "EMPLOYEE_REQUEST",
    history: await selectWorkflowHistory(db, requestId),
  };
};

const resolveNextStatus = (requestType, status, action) => {
  if (action === "reject") return "REJECTED";
  if (status === "PENDING_DEPARTMENT") return "PENDING_HR";
  if (status === "PENDING_HR") {
    return requestType === "RESIGNATION" ? "PENDING_DIRECTOR" : "APPROVED";
  }
  if (status === "PENDING_DIRECTOR" && requestType === "RESIGNATION") {
    return "APPROVED";
  }
  throw fail("Đơn ở trạng thái hiện tại không thể duyệt", 409);
};

const eachDateInRange = (startDate, endDate) => {
  const dates = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const last = new Date(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(cursor.getTime()) || !Number.isFinite(last.getTime()) || cursor > last) return dates;
  for (let index = 0; index < 400 && cursor <= last; index += 1) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};

export const processEmployeeRequest = async (
  user,
  id,
  action,
  payload = {},
) => {
  if (!["approve", "reject"].includes(action)) throw fail("Hành động không hợp lệ");
  const requestId = parsePositiveInt(id, "Mã đơn");
  if (!requestId) throw fail("Mã đơn không hợp lệ");
  const actorId = Number(user?.user_id ?? user?.employee_id);
  if (!Number.isSafeInteger(actorId) || actorId <= 0) {
    throw fail("Thông tin người dùng không hợp lệ", 403);
  }

  return transaction(async (connection) => {
    const [rows] = await connection.query(
      "SELECT * FROM employee_requests WHERE id = ? FOR UPDATE",
      [requestId],
    );
    if (!rows.length) throw fail("Không tìm thấy đơn", 404);
    const request = rows[0];

    if (Number(user?.employee_id) === Number(request.employee_id)) {
      throw fail("Không thể tự duyệt đơn của chính mình", 403);
    }

    const nextStatus = resolveNextStatus(request.request_type, request.status, action);

    if (request.status === "PENDING_DIRECTOR") {
      if (user?.role_id !== "DIRECTOR") {
        throw fail("Chỉ Giám đốc được duyệt đơn ở bước này", 403);
      }
    } else if (request.status === "PENDING_HR") {
      if (!hasPermission(user?.permissions, "HR.PROFILE_MANAGE")) {
        throw fail("Chỉ HR được xử lý đơn ở bước này", 403);
      }
    } else if (request.status === "PENDING_DEPARTMENT") {
      await assertCanApprove(connection, user, request.employee_id);
    } else {
      throw fail("Đơn ở trạng thái hiện tại không thể xử lý", 409);
    }

    const comment =
      action === "reject"
        ? parseText(payload.reject_reason || payload.reason, "lý do từ chối", {
            required: true,
            max: 5000,
          })
        : parseText(payload.note, "ghi chú", { max: 1000 });

    await connection.query(
      "UPDATE employee_requests SET status = ? WHERE id = ?",
      [nextStatus, requestId],
    );
    if (nextStatus === "APPROVED" && request.request_type === "TEMPORARY_LEAVE") {
      await ensureAttendancePolicySchema();
      const start = String(request.start_date || "").slice(0, 10);
      const end = String(request.end_date || request.last_working_date || start).slice(0, 10);
      for (const workDate of eachDateInRange(start, end)) {
        await clearLatePenalty(connection, {
          employeeId: request.employee_id,
          workDate,
          reason: "Miễn phạt: đơn xin phép đã duyệt",
        });
      }
    }
    await connection.query(
      `INSERT INTO workflow_actions
        (entity_type, entity_id, actor_id, action, from_status, to_status, comment)
        VALUES ('EMPLOYEE_REQUEST', ?, ?, ?, ?, ?, ?)`,
      [
        requestId,
        actorId,
        action === "approve" ? "APPROVE" : "REJECT",
        request.status,
        nextStatus,
        comment || null,
      ],
    );

    return { id: requestId, from_status: request.status, status: nextStatus };
  });
};

export const requestEmployeeUpdate = async (user, id, payload = {}) => {
  if (!hasPermission(user?.permissions, "HR.PROFILE_MANAGE")) {
    throw fail("Chỉ HR được yêu cầu bổ sung hồ sơ", 403);
  }
  const requestId = parsePositiveInt(id, "Mã đơn");
  if (!requestId) throw fail("Mã đơn không hợp lệ");
  const actorId = Number(user?.user_id ?? user?.employee_id);
  if (!Number.isSafeInteger(actorId) || actorId <= 0) {
    throw fail("Thông tin người dùng không hợp lệ", 403);
  }
  const content = parseText(payload.content, "nội dung cần bổ sung", {
    required: true,
    max: 5000,
  });

  return transaction(async (connection) => {
    const [rows] = await connection.query(
      "SELECT id, employee_id, status FROM employee_requests WHERE id = ? FOR UPDATE",
      [requestId],
    );
    if (!rows.length) throw fail("Không tìm thấy đơn", 404);
    if (Number(user?.employee_id) === Number(rows[0].employee_id)) {
      throw fail("Không thể yêu cầu bổ sung đơn của chính mình", 403);
    }
    if (rows[0].status !== "PENDING_HR") {
      throw fail("Chỉ có thể yêu cầu bổ sung khi đơn đang chờ HR kiểm tra", 409);
    }

    const [pending] = await connection.query(
      "SELECT id FROM request_information_requests WHERE request_id = ? AND status = 'PENDING' LIMIT 1",
      [requestId],
    );
    if (pending.length) {
      throw fail("Đơn đã có yêu cầu bổ sung chưa được phản hồi", 409);
    }

    const [result] = await connection.query(
      `INSERT INTO request_information_requests
        (request_id, requested_by, content, status, requested_at)
        VALUES (?, ?, ?, 'PENDING', NOW())`,
      [requestId, actorId, content],
    );
    await connection.query(
      "UPDATE employee_requests SET status = 'WAITING_EMPLOYEE_UPDATE' WHERE id = ?",
      [requestId],
    );
    await connection.query(
      `INSERT INTO workflow_actions
        (entity_type, entity_id, actor_id, action, from_status, to_status, comment)
        VALUES ('EMPLOYEE_REQUEST', ?, ?, 'REQUEST_UPDATE', 'PENDING_HR', 'WAITING_EMPLOYEE_UPDATE', ?)`,
      [requestId, actorId, content],
    );

    return {
      id: requestId,
      status: "WAITING_EMPLOYEE_UPDATE",
      information_request_id: result.insertId,
    };
  });
};

export const resubmitEmployeeRequest = async (user, id, payload = {}) => {
  const requestId = parsePositiveInt(id, "Mã đơn");
  if (!requestId) throw fail("Mã đơn không hợp lệ");
  const actorId = Number(user?.user_id ?? user?.employee_id);
  if (!Number.isSafeInteger(actorId) || actorId <= 0) {
    throw fail("Thông tin người dùng không hợp lệ", 403);
  }
  const responseNote = parseText(
    payload.response_note || payload.note,
    "nội dung bổ sung",
    { required: true, max: 5000 },
  );

  return transaction(async (connection) => {
    const [rows] = await connection.query(
      "SELECT id, employee_id, status FROM employee_requests WHERE id = ? FOR UPDATE",
      [requestId],
    );
    if (!rows.length) throw fail("Không tìm thấy đơn", 404);
    const request = rows[0];

    if (Number(user?.employee_id) !== Number(request.employee_id)) {
      throw fail("Chỉ nhân viên làm đơn được gửi lại hồ sơ", 403);
    }
    if (request.status !== "WAITING_EMPLOYEE_UPDATE") {
      throw fail("Đơn hiện tại không chờ bổ sung hồ sơ", 409);
    }

    const updatedReason = payload.reason
      ? parseText(payload.reason, "lý do", { max: 5000 })
      : null;
    if (updatedReason) {
      await connection.query(
        "UPDATE employee_requests SET reason = ? WHERE id = ?",
        [updatedReason, requestId],
      );
    }

    const [answered] = await connection.query(
      `UPDATE request_information_requests
        SET status = 'SUBMITTED', responded_at = NOW(), response_note = ?
        WHERE request_id = ? AND status = 'PENDING'`,
      [responseNote, requestId],
    );
    if (!answered.affectedRows) {
      throw fail("Không tìm thấy yêu cầu bổ sung đang chờ", 409);
    }

    await connection.query(
      "UPDATE employee_requests SET status = 'PENDING_HR' WHERE id = ?",
      [requestId],
    );
    await connection.query(
      `INSERT INTO workflow_actions
        (entity_type, entity_id, actor_id, action, from_status, to_status, comment)
        VALUES ('EMPLOYEE_REQUEST', ?, ?, 'RESUBMIT', 'WAITING_EMPLOYEE_UPDATE', 'PENDING_HR', ?)`,
      [requestId, actorId, responseNote],
    );

    return {
      id: requestId,
      status: "PENDING_HR",
      updated_information_requests: answered.affectedRows,
    };
  });
};

export const checkEmployeeRequest = async (user, id, payload = {}) => {
  if (!hasPermission(user?.permissions, "HR.PROFILE_MANAGE")) {
    throw fail("Chỉ HR được kiểm tra hồ sơ", 403);
  }
  const requestId = parsePositiveInt(id, "Mã đơn");
  if (!requestId) throw fail("Mã đơn không hợp lệ");
  const actorId = Number(user?.user_id ?? user?.employee_id);
  if (!Number.isSafeInteger(actorId) || actorId <= 0) {
    throw fail("Thông tin người dùng không hợp lệ", 403);
  }
  const note = parseText(payload.note, "ghi chú", { max: 1000 });

  return transaction(async (connection) => {
    const [rows] = await connection.query(
      "SELECT id, employee_id, status FROM employee_requests WHERE id = ? FOR UPDATE",
      [requestId],
    );
    if (!rows.length) throw fail("Không tìm thấy đơn", 404);
    const request = rows[0];

    if (Number(user?.employee_id) === Number(request.employee_id)) {
      throw fail("Không thể kiểm tra đơn của chính mình", 403);
    }
    if (request.status !== "PENDING_HR") {
      throw fail("Chỉ có thể kiểm tra hồ sơ khi đơn đang chờ HR", 409);
    }

    const [checked] = await connection.query(
      `SELECT id FROM workflow_actions
        WHERE entity_type = 'EMPLOYEE_REQUEST' AND entity_id = ?
          AND actor_id = ? AND action = 'CHECK' AND from_status = 'PENDING_HR'
        LIMIT 1`,
      [requestId, actorId],
    );
    if (checked.length) {
      throw fail("Bạn đã kiểm tra hồ sơ ở bước này", 409);
    }

    await connection.query(
      `INSERT INTO workflow_actions
        (entity_type, entity_id, actor_id, action, from_status, to_status, comment)
        VALUES ('EMPLOYEE_REQUEST', ?, ?, 'CHECK', 'PENDING_HR', 'PENDING_HR', ?)`,
      [requestId, actorId, note || null],
    );

    return { id: requestId, status: request.status, checked: true };
  });
};

export const receiveEmployeeRequest = async (user, id, payload = {}) => {
  if (!hasPermission(user?.permissions, "HR.PROFILE_MANAGE")) {
    throw fail("Chỉ HR được tiếp nhận hồ sơ bổ sung", 403);
  }
  const requestId = parsePositiveInt(id, "Mã đơn");
  if (!requestId) throw fail("Mã đơn không hợp lệ");
  const actorId = Number(user?.user_id ?? user?.employee_id);
  if (!Number.isSafeInteger(actorId) || actorId <= 0) {
    throw fail("Thông tin người dùng không hợp lệ", 403);
  }
  const note = parseText(payload.note, "ghi chú", { max: 1000 });

  return transaction(async (connection) => {
    const [rows] = await connection.query(
      "SELECT id, employee_id, status FROM employee_requests WHERE id = ? FOR UPDATE",
      [requestId],
    );
    if (!rows.length) throw fail("Không tìm thấy đơn", 404);
    const request = rows[0];

    if (Number(user?.employee_id) === Number(request.employee_id)) {
      throw fail("Không thể tiếp nhận đơn của chính mình", 403);
    }
    if (request.status !== "PENDING_HR") {
      throw fail("Chỉ có thể tiếp nhận hồ sơ khi đơn đang chờ HR", 409);
    }

    const [submitted] = await connection.query(
      "SELECT id FROM request_information_requests WHERE request_id = ? AND status = 'SUBMITTED' LIMIT 1",
      [requestId],
    );
    if (!submitted.length) {
      throw fail("Không có hồ sơ bổ sung nào chờ tiếp nhận", 409);
    }

    const [result] = await connection.query(
      "UPDATE request_information_requests SET status = 'RECEIVED' WHERE request_id = ? AND status = 'SUBMITTED'",
      [requestId],
    );
    await connection.query(
      `INSERT INTO workflow_actions
        (entity_type, entity_id, actor_id, action, from_status, to_status, comment)
        VALUES ('EMPLOYEE_REQUEST', ?, ?, 'RECEIVE', 'PENDING_HR', 'PENDING_HR', ?)`,
      [requestId, actorId, note || null],
    );

    return {
      id: requestId,
      status: request.status,
      received: result.affectedRows,
    };
  });
};
