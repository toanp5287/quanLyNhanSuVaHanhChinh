import { db } from "../config/database.js";
import {
  DEVICE_COOKIE_NAME,
  DEVICE_MESSAGES,
  hashDeviceToken,
  normalizeClientIp,
  parseAllowedIps,
} from "../utils/deviceSecurity.js";

const ACTION_COLUMN = Object.freeze({
  attendance: "allow_attendance",
  face_enroll: "allow_face_enroll",
});

const buildResult = (overrides = {}) => ({
  allowed: false,
  code: "DEVICE_CHECK_UNAVAILABLE",
  message: DEVICE_MESSAGES.DEVICE_CHECK_UNAVAILABLE,
  deviceName: null,
  clientIp: "",
  requireDeviceCheck: true,
  requireIpCheck: false,
  ...overrides,
});

const readSettings = async () => {
  const [rows] = await db.query(
    `SELECT require_device_check, require_ip_check, allowed_ips
       FROM attendance_security_settings
      WHERE id = 1
      LIMIT 1`,
  );
  const row = rows[0];
  if (!row) {
    return {
      require_device_check: 1,
      require_ip_check: 0,
      allowed_ips: "[]",
    };
  }
  return row;
};

export const evaluateDevicePermission = async (req, action) => {
  req.clientIp = normalizeClientIp(req);
  const base = { clientIp: req.clientIp };

  if (!ACTION_COLUMN[action]) {
    return buildResult({
      ...base,
      code: "INVALID_ACTION",
      message: DEVICE_MESSAGES.INVALID_ACTION,
    });
  }

  let settings;
  try {
    settings = await readSettings();
  } catch (error) {
    console.error("Lỗi đọc cấu hình bảo mật điểm danh:", error);
    return buildResult(base);
  }

  const requireDeviceCheck = Number(settings.require_device_check) === 1;
  const requireIpCheck = Number(settings.require_ip_check) === 1;
  const result = buildResult({
    ...base,
    requireDeviceCheck,
    requireIpCheck,
  });

  if (requireDeviceCheck) {
    const rawToken = req.cookies?.[DEVICE_COOKIE_NAME];
    if (!rawToken) {
      return {
        ...result,
        code: "DEVICE_TOKEN_MISSING",
        message: DEVICE_MESSAGES.DEVICE_TOKEN_MISSING,
      };
    }

    let device;
    try {
      const [rows] = await db.query(
        `SELECT id, device_name, allow_attendance, allow_face_enroll, is_active
           FROM allowed_devices
          WHERE device_token_hash = ?
          LIMIT 1`,
        [hashDeviceToken(rawToken)],
      );
      device = rows[0];
    } catch (error) {
      console.error("Lỗi kiểm tra thiết bị được phép:", error);
      return buildResult(base);
    }

    if (!device || Number(device.is_active) !== 1) {
      return {
        ...result,
        code: "DEVICE_NOT_AUTHORIZED",
        message: DEVICE_MESSAGES.DEVICE_NOT_AUTHORIZED,
      };
    }

    if (Number(device[ACTION_COLUMN[action]]) !== 1) {
      return {
        ...result,
        code: "DEVICE_ACTION_FORBIDDEN",
        message: DEVICE_MESSAGES.DEVICE_ACTION_FORBIDDEN,
        deviceName: device.device_name,
      };
    }

    req.authorizedDevice = {
      id: device.id,
      device_name: device.device_name,
    };
    result.deviceName = device.device_name;
    result.deviceId = device.id;
  }

  if (requireIpCheck) {
    const allowedIps = parseAllowedIps(settings.allowed_ips);
    if (!allowedIps.includes(req.clientIp)) {
      return {
        ...result,
        code: "IP_NOT_ALLOWED",
        message: DEVICE_MESSAGES.IP_NOT_ALLOWED,
      };
    }
  }

  return {
    ...result,
    allowed: true,
    code: "OK",
    message: DEVICE_MESSAGES.OK,
  };
};

export const verifyAuthorizedDevice = (action) => async (req, res, next) => {
  const result = await evaluateDevicePermission(req, action);
  if (!result.allowed) {
    return res.status(403).json({
      success: false,
      code: result.code,
      message: result.message,
      ...(result.code === "IP_NOT_ALLOWED" ? { clientIp: result.clientIp } : {}),
    });
  }

  if (req.authorizedDevice?.id) {
    const deviceId = req.authorizedDevice.id;
    const clientIp = req.clientIp;
    Promise.resolve()
      .then(() =>
        db.query(
          "UPDATE allowed_devices SET last_used_at = NOW(), last_ip = ? WHERE id = ?",
          [clientIp, deviceId],
        ),
      )
      .catch((error) => {
        console.error("Không thể cập nhật lần dùng thiết bị:", error.message);
      });
  }

  return next();
};
