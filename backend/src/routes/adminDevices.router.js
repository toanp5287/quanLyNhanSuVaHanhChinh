import express from "express";
import { db } from "../config/database.js";
import { requireAdmin, verifyToken } from "../middlewares/auth.middleware.js";
import {
  readAttendanceNetworkSettings,
  resolveDeviceStatus,
} from "../middlewares/deviceSecurity.middleware.js";
import {
  DEVICE_COOKIE_NAME,
  DEVICE_COOKIE_OPTIONS,
  generateDeviceToken,
  getClientIp,
  hashDeviceToken,
  validateIpInput,
  toBoolean,
} from "../utils/deviceSecurity.js";

const router = express.Router();
router.use(verifyToken, requireAdmin);

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const parseId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const parseActorId = (req) => parseId(req.user?.user_id ?? req.user?.id ?? null);

const safeText = (value, maxLength = 255) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
};

const formatDevice = (row) => ({
  id: row.id,
  device_name: row.device_name,
  location: row.location || null,
  device_token_hash: row.device_token_hash || null,
  allow_attendance: Number(row.allow_attendance) === 1,
  allow_face_enroll: Number(row.allow_face_enroll) === 1,
  is_active: Number(row.is_active) === 1,
  mac_note: row.mac_note || null,
  user_agent: row.user_agent || null,
  approved_by: row.approved_by ?? null,
  last_used_at: row.last_used_at || null,
  last_ip: row.last_ip || null,
  allowed_ip: row.allowed_ip || null,
  note: row.note || null,
  created_at: row.created_at || null,
  updated_at: row.updated_at || null,
});

const findDeviceById = async (id, connection = db) => {
  const [rows] = await connection.query(
    `SELECT id, device_name, location, device_token_hash, allow_attendance, allow_face_enroll,
            is_active, mac_note, user_agent, approved_by, last_used_at, last_ip, allowed_ip, note,
            created_at, updated_at
       FROM allowed_devices
      WHERE id = ?
      LIMIT 1`,
    [id],
  );
  return rows?.[0] || null;
};

const findDeviceByTokenHash = async (tokenHash, connection = db) => {
  if (!tokenHash) return null;
  const [rows] = await connection.query(
    `SELECT id, device_name, location, device_token_hash, allow_attendance, allow_face_enroll,
            is_active, mac_note, user_agent, approved_by, last_used_at, last_ip, allowed_ip, note,
            created_at, updated_at
       FROM allowed_devices
      WHERE device_token_hash = ?
      LIMIT 1`,
    [tokenHash],
  );
  return rows?.[0] || null;
};

const buildDevicePayload = (body = {}, { existing = null } = {}) => {
  const name = safeText(body.device_name ?? body.name, 120);
  if (!existing && !name) return { error: "Vui lòng nhập tên thiết bị." };
  if (name && !/^[\p{L}\p{N} ._()/#,:-]{1,120}$/u.test(name)) {
    return { error: "Tên thiết bị chứa ký tự không hợp lệ." };
  }

  const locationProvided = Object.prototype.hasOwnProperty.call(body, "location");
  const location = locationProvided ? safeText(body.location, 120) : existing?.location || null;

  const allowedIpProvided = Object.prototype.hasOwnProperty.call(body, "allowed_ip");
  let allowedIp = existing?.allowed_ip || null;
  if (allowedIpProvided) {
    const validated = validateIpInput(body.allowed_ip, "IP điểm danh");
    if (validated.error) return { error: validated.error };
    allowedIp = validated.value;
  }

  const macProvided = Object.prototype.hasOwnProperty.call(body, "mac_note") || Object.prototype.hasOwnProperty.call(body, "mac_address");
  const macRaw = macProvided ? (body.mac_note ?? body.mac_address) : existing?.mac_note;
  const macNote = macRaw === null || macRaw === undefined || String(macRaw).trim() === ""
    ? null
    : safeText(String(macRaw).trim().toUpperCase(), 32);

  const noteProvided = Object.prototype.hasOwnProperty.call(body, "note");
  const note = noteProvided ? safeText(body.note, 1000) : existing?.note || null;

  const allowAttendance = Object.prototype.hasOwnProperty.call(body, "allow_attendance")
    ? toBoolean(body.allow_attendance, true)
    : existing
      ? Number(existing.allow_attendance) === 1
      : true;
  const allowFaceEnroll = Object.prototype.hasOwnProperty.call(body, "allow_face_enroll")
    ? toBoolean(body.allow_face_enroll, false)
    : existing
      ? Number(existing.allow_face_enroll) === 1
      : false;

  return {
    data: {
      device_name: name || existing?.device_name,
      location,
      allowed_ip: allowedIp,
      mac_note: macNote,
      allow_attendance: allowAttendance ? 1 : 0,
      allow_face_enroll: allowFaceEnroll ? 1 : 0,
      note,
    },
  };
};

router.get(
  "/devices",
  asyncHandler(async (req, res) => {
    const [rows] = await db.query(
      `SELECT id, device_name, location, device_token_hash, allow_attendance, allow_face_enroll,
              is_active, mac_note, user_agent, approved_by, last_used_at, last_ip, allowed_ip, note,
              created_at, updated_at
         FROM allowed_devices
        ORDER BY is_active DESC, updated_at DESC, id DESC`,
    );

    const networkSettings = await readAttendanceNetworkSettings(db);
    const clientIp = getClientIp(req);
    const rawToken = req.cookies?.[DEVICE_COOKIE_NAME];
    const tokenHash = rawToken ? hashDeviceToken(rawToken) : null;
    const matchedDevice = tokenHash
      ? rows.find((row) => row.device_token_hash === tokenHash) || null
      : null;
    const resolved = resolveDeviceStatus(matchedDevice, clientIp, networkSettings);

    return res.json({
      success: true,
      data: {
        devices: rows.map(formatDevice),
        networkSettings: {
          office_allowed_ips: networkSettings.office_allowed_ips ?? null,
          login_allowed_ips: networkSettings.login_allowed_ips ?? null,
          updated_at: networkSettings.updated_at ?? null,
          updated_by: networkSettings.updated_by ?? null,
        },
        currentClient: {
          ip: clientIp,
          hasDeviceCookie: Boolean(rawToken),
          matchedDevice: matchedDevice ? formatDevice(matchedDevice) : null,
          attendanceStatus: resolved.attendanceStatus,
          effectiveAllowedIps: resolved.effectiveAllowedIps,
        },
      },
    });
  }),
);

router.patch(
  "/devices/network-settings",
  asyncHandler(async (req, res) => {
    const hasOffice = Object.prototype.hasOwnProperty.call(req.body, "office_allowed_ips");
    const hasLogin = Object.prototype.hasOwnProperty.call(req.body, "login_allowed_ips");
    if (!hasOffice && !hasLogin) {
      return res.status(400).json({ success: false, message: "Không có trường IP nào để cập nhật." });
    }

    const current = await readAttendanceNetworkSettings(db);
    let officeAllowedIps = current.office_allowed_ips ?? null;
    let loginAllowedIps = current.login_allowed_ips ?? null;

    if (hasOffice) {
      const validated = validateIpInput(req.body.office_allowed_ips, "IP điểm danh");
      if (validated.error) return res.status(400).json({ success: false, message: validated.error });
      officeAllowedIps = validated.value;
    }
    if (hasLogin) {
      const validated = validateIpInput(req.body.login_allowed_ips, "IP đăng nhập");
      if (validated.error) return res.status(400).json({ success: false, message: validated.error });
      loginAllowedIps = validated.value;
    }

    await db.query(
      `INSERT INTO attendance_network_settings (id, office_allowed_ips, login_allowed_ips, updated_by, updated_at)
       VALUES (1, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         office_allowed_ips = VALUES(office_allowed_ips),
         login_allowed_ips = VALUES(login_allowed_ips),
         updated_by = VALUES(updated_by),
         updated_at = NOW()`,
      [officeAllowedIps, loginAllowedIps, parseActorId(req)],
    );

    const updated = await readAttendanceNetworkSettings(db);
    return res.json({
      success: true,
      message: "Đã cập nhật cấu hình IP mạng.",
      data: {
        office_allowed_ips: updated.office_allowed_ips ?? null,
        login_allowed_ips: updated.login_allowed_ips ?? null,
        updated_at: updated.updated_at ?? null,
      },
    });
  }),
);

router.post(
  "/devices",
  asyncHandler(async (req, res) => {
    const payload = buildDevicePayload(req.body);
    if (payload.error) return res.status(400).json({ success: false, message: payload.error });

    const bindCurrentBrowser = toBoolean(req.body?.bindCurrentBrowser ?? req.body?.bindCurrentDevice, false);
    const rawToken = generateDeviceToken();
    const tokenHash = hashDeviceToken(rawToken);
    const actorId = parseActorId(req);
    const clientIp = getClientIp(req);
    const userAgent = safeText(req.headers?.["user-agent"], 255);

    if (bindCurrentBrowser) {
      const existingCurrent = await findDeviceByTokenHash(hashDeviceToken(req.cookies?.[DEVICE_COOKIE_NAME] || ""));
      if (req.cookies?.[DEVICE_COOKIE_NAME] && existingCurrent) {
        return res.status(409).json({
          success: false,
          code: "CURRENT_BROWSER_ALREADY_BOUND",
          message: `Trình duyệt hiện tại đã được gắn với thiết bị "${existingCurrent.device_name}". Vui lòng dùng "Gắn lại" hoặc xóa thiết bị cũ.`,
          deviceId: existingCurrent.id,
        });
      }
    }

    const [result] = await db.query(
      `INSERT INTO allowed_devices
         (device_name, location, device_token_hash, allow_attendance, allow_face_enroll, is_active,
          mac_note, user_agent, approved_by, last_used_at, last_ip, allowed_ip, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        payload.data.device_name,
        payload.data.location,
        tokenHash,
        payload.data.allow_attendance,
        payload.data.allow_face_enroll,
        payload.data.mac_note,
        bindCurrentBrowser ? userAgent : null,
        actorId,
        bindCurrentBrowser ? new Date() : null,
        bindCurrentBrowser ? clientIp : null,
        payload.data.allowed_ip,
        payload.data.note,
      ],
    );

    const created = await findDeviceById(result.insertId);
    if (bindCurrentBrowser) {
      res.cookie(DEVICE_COOKIE_NAME, rawToken, DEVICE_COOKIE_OPTIONS);
    }

    return res.status(201).json({
      success: true,
      message: bindCurrentBrowser
        ? "Đã thêm và cấp phép thiết bị cho trình duyệt hiện tại."
        : "Đã thêm thiết bị vào danh sách cấp phép.",
      data: {
        device: created ? formatDevice(created) : null,
        boundCurrentBrowser: bindCurrentBrowser,
      },
    });
  }),
);

router.put(
  "/devices/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "ID thiết bị không hợp lệ." });

    const existing = await findDeviceById(id);
    if (!existing) return res.status(404).json({ success: false, message: "Không tìm thấy thiết bị." });

    const payload = buildDevicePayload(req.body, { existing });
    if (payload.error) return res.status(400).json({ success: false, message: payload.error });

    await db.query(
      `UPDATE allowed_devices
          SET device_name = ?, location = ?, allowed_ip = ?, mac_note = ?,
              allow_attendance = ?, allow_face_enroll = ?, note = ?, updated_at = NOW()
        WHERE id = ?`,
      [
        payload.data.device_name,
        payload.data.location,
        payload.data.allowed_ip,
        payload.data.mac_note,
        payload.data.allow_attendance,
        payload.data.allow_face_enroll,
        payload.data.note,
        id,
      ],
    );

    const updated = await findDeviceById(id);
    return res.json({
      success: true,
      message: "Đã cập nhật thiết bị.",
      data: { device: updated ? formatDevice(updated) : null },
    });
  }),
);

router.patch(
  "/devices/:id/toggle",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "ID thiết bị không hợp lệ." });

    const existing = await findDeviceById(id);
    if (!existing) return res.status(404).json({ success: false, message: "Không tìm thấy thiết bị." });

    const nextActive = Object.prototype.hasOwnProperty.call(req.body || {}, "is_active")
      ? (toBoolean(req.body.is_active, !Number(existing.is_active)) ? 1 : 0)
      : (Number(existing.is_active) === 1 ? 0 : 1);

    await db.query("UPDATE allowed_devices SET is_active = ?, updated_at = NOW() WHERE id = ?", [nextActive, id]);
    const updated = await findDeviceById(id);
    return res.json({
      success: true,
      message: nextActive ? "Đã mở khóa thiết bị." : "Đã khóa thiết bị.",
      data: { device: updated ? formatDevice(updated) : null },
    });
  }),
);

router.post(
  "/devices/:id/bind-current",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "ID thiết bị không hợp lệ." });

    const existing = await findDeviceById(id);
    if (!existing) return res.status(404).json({ success: false, message: "Không tìm thấy thiết bị." });

    const rawToken = generateDeviceToken();
    const tokenHash = hashDeviceToken(rawToken);
    const clientIp = getClientIp(req);
    const userAgent = safeText(req.headers?.["user-agent"], 255);

    await db.query(
      `UPDATE allowed_devices
          SET device_token_hash = ?, user_agent = ?, last_ip = ?, last_used_at = NOW(), updated_at = NOW()
        WHERE id = ?`,
      [tokenHash, userAgent, clientIp, id],
    );

    res.cookie(DEVICE_COOKIE_NAME, rawToken, DEVICE_COOKIE_OPTIONS);
    const updated = await findDeviceById(id);
    return res.json({
      success: true,
      message: "Đã gắn trình duyệt hiện tại vào thiết bị.",
      data: { device: updated ? formatDevice(updated) : null },
    });
  }),
);

router.delete(
  "/devices/:id",
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: "ID thiết bị không hợp lệ." });
    const existing = await findDeviceById(id);
    if (!existing) return res.status(404).json({ success: false, message: "Không tìm thấy thiết bị." });

    await db.query("DELETE FROM allowed_devices WHERE id = ?", [id]);
    return res.json({ success: true, message: "Đã xóa thiết bị." });
  }),
);

router.use((error, _req, res, _next) => {
  console.error("Lỗi quản lý thiết bị:", error);
  return res.status(500).json({
    success: false,
    message: "Lỗi máy chủ khi quản lý thiết bị. Vui lòng thử lại.",
  });
});

export default router;
