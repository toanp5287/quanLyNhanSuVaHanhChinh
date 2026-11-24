import { db } from "../config/database.js";
import {
  DEVICE_COOKIE_NAME,
  DEVICE_MESSAGES,
  getClientIp,
  hashDeviceToken,
  isIpAllowed,
  parseIpList,
} from "../utils/deviceSecurity.js";

const VALID_ACTIONS = new Set(["attendance", "face_enroll"]);

const asBool = (value) => Number(value) === 1 || value === true;

export const readAttendanceNetworkSettings = async (connection = db) => {
  try {
    const [rows] = await connection.query(
      `SELECT id, office_allowed_ips, login_allowed_ips, updated_by, updated_at
         FROM attendance_network_settings
        WHERE id = 1
        LIMIT 1`,
    );
    const row = rows?.[0];
    return {
      id: 1,
      office_allowed_ips: row?.office_allowed_ips ?? null,
      login_allowed_ips: row?.login_allowed_ips ?? null,
      updated_by: row?.updated_by ?? null,
      updated_at: row?.updated_at ?? null,
    };
  } catch (error) {
    console.error("Không thể đọc attendance_network_settings:", error.message);
    return {
      id: 1,
      office_allowed_ips: null,
      login_allowed_ips: null,
      updated_by: null,
      updated_at: null,
    };
  }
};

export const getEffectiveAttendanceAllowedIps = (device, networkSettings) => {
  const deviceIps = parseIpList(device?.allowed_ip);
  if (deviceIps.length) return deviceIps.join(",");
  const officeIps = parseIpList(networkSettings?.office_allowed_ips);
  return officeIps.length ? officeIps.join(",") : null;
};

export const resolveDeviceStatus = (device, clientIp, networkSettings) => {
  if (!device) {
    return {
      attendanceStatus: "DEVICE_NOT_REGISTERED",
      code: "DEVICE_NOT_REGISTERED",
      message: DEVICE_MESSAGES.DEVICE_NOT_REGISTERED,
      allowed: false,
      effectiveAllowedIps: getEffectiveAttendanceAllowedIps(null, networkSettings),
    };
  }
  if (!asBool(device.is_active) || !asBool(device.allow_attendance)) {
    return {
      attendanceStatus: "DEVICE_LOCKED",
      code: "DEVICE_LOCKED",
      message: DEVICE_MESSAGES.DEVICE_LOCKED,
      allowed: false,
      effectiveAllowedIps: getEffectiveAttendanceAllowedIps(device, networkSettings),
    };
  }
  const effectiveAllowedIps = getEffectiveAttendanceAllowedIps(device, networkSettings);
  if (effectiveAllowedIps && !isIpAllowed(clientIp, effectiveAllowedIps)) {
    return {
      attendanceStatus: "DEVICE_IP_MISMATCH",
      code: "DEVICE_IP_MISMATCH",
      message: DEVICE_MESSAGES.DEVICE_IP_MISMATCH,
      allowed: false,
      effectiveAllowedIps,
    };
  }
  return {
    attendanceStatus: "AUTHORIZED",
    code: "OK",
    message: DEVICE_MESSAGES.OK,
    allowed: true,
    effectiveAllowedIps,
  };
};

export const evaluateDevicePermission = async (req, action) => {
  const clientIp = getClientIp(req);
  req.clientIp = clientIp;
  const base = {
    allowed: false,
    code: "DEVICE_NOT_REGISTERED",
    message: DEVICE_MESSAGES.DEVICE_NOT_REGISTERED,
    deviceName: null,
    deviceId: null,
    clientIp,
    allowedIps: null,
    attendanceStatus: "DEVICE_NOT_REGISTERED",
  };

  if (!VALID_ACTIONS.has(action)) {
    return { ...base, code: "INVALID_ACTION", message: "Hành động không hợp lệ." };
  }

  const rawToken = req.cookies?.[DEVICE_COOKIE_NAME];
  const hasDeviceCookie = Boolean(rawToken);
  const tokenHash = rawToken ? hashDeviceToken(rawToken) : null;

  let device = null;
  try {
    if (tokenHash) {
      const [rows] = await db.query(
        `SELECT id, device_name, location, device_token_hash, allow_attendance, allow_face_enroll,
                is_active, mac_note, user_agent, approved_by, last_used_at, last_ip, allowed_ip, note,
                created_at, updated_at
           FROM allowed_devices
          WHERE device_token_hash = ?
          LIMIT 1`,
        [tokenHash],
      );
      device = rows?.[0] || null;
    }
  } catch (error) {
    console.error("Lỗi kiểm tra thiết bị điểm danh:", error.message);
    return { ...base, code: "DEVICE_CHECK_UNAVAILABLE", message: "Không thể kiểm tra thiết bị. Vui lòng thử lại." };
  }

  const networkSettings = await readAttendanceNetworkSettings(db);
  const resolved = resolveDeviceStatus(device, clientIp, networkSettings);
  const effectiveAllowedIps = resolved.effectiveAllowedIps;

  if (!device) {
    return { ...base, hasDeviceCookie, attendanceStatus: "DEVICE_NOT_REGISTERED", effectiveAllowedIps };
  }

  if (action === "face_enroll" && asBool(device.is_active) && asBool(device.allow_attendance) && !asBool(device.allow_face_enroll)) {
    return {
      ...base,
      hasDeviceCookie,
      deviceName: device.device_name,
      deviceId: device.id,
      allowedIps: effectiveAllowedIps,
      effectiveAllowedIps,
      attendanceStatus: "AUTHORIZED",
      code: "DEVICE_FACE_ENROLL_DENIED",
      message: DEVICE_MESSAGES.DEVICE_FACE_ENROLL_DENIED,
    };
  }

  return {
    ...base,
    allowed: resolved.allowed,
    code: resolved.code,
    message: resolved.message,
    deviceName: device.device_name,
    deviceId: device.id,
    allowedIps: effectiveAllowedIps,
    effectiveAllowedIps,
    hasDeviceCookie,
    attendanceStatus: resolved.attendanceStatus,
    device,
  };
};

export const verifyAuthorizedDevice = (action) => async (req, res, next) => {
  const result = await evaluateDevicePermission(req, action);
  req.attendanceDeviceCheck = result;

  if (!result.allowed) {
    return res.status(403).json({
      success: false,
      code: result.code,
      message: result.message,
      clientIp: result.clientIp,
      deviceName: result.deviceName || null,
      allowedIps: result.allowedIps || null,
    });
  }

  req.authorizedDevice = {
    id: result.deviceId,
    device_name: result.deviceName,
    allowed_ip: result.device?.allowed_ip || null,
  };

  const deviceId = result.deviceId;
  const clientIp = result.clientIp;
  Promise.resolve()
    .then(() =>
      db.query("UPDATE allowed_devices SET last_used_at = NOW(), last_ip = ? WHERE id = ?", [clientIp, deviceId]),
    )
    .catch((error) => console.error("Không thể cập nhật last_used_at thiết bị:", error.message));

  return next();
};

export const loginIpGuard = async (req, res, next) => {
  try {
    const roleId = req.user?.role_id || req.authenticatedUser?.role_id;
    if (roleId === "SUPER_ADMIN") return next();

    const settings = await readAttendanceNetworkSettings(db);
    const loginAllowedIps = settings.login_allowed_ips;
    if (!parseIpList(loginAllowedIps).length) return next();

    const clientIp = getClientIp(req);
    req.clientIp = clientIp;
    if (isIpAllowed(clientIp, loginAllowedIps)) return next();

    return res.status(403).json({
      success: false,
      code: "LOGIN_IP_NOT_ALLOWED",
      message: DEVICE_MESSAGES.LOGIN_IP_NOT_ALLOWED,
      clientIp,
    });
  } catch (error) {
    console.error("Lỗi kiểm tra IP đăng nhập:", error.message);
    return res.status(500).json({
      success: false,
      code: "LOGIN_IP_CHECK_FAILED",
      message: "Không thể kiểm tra IP đăng nhập. Vui lòng thử lại.",
    });
  }
};
