import crypto from "crypto";
import net from "net";

export const DEVICE_COOKIE_NAME = "kiosk_device_token";

export const DEVICE_COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 365 * 24 * 60 * 60 * 1000,
  path: "/",
});

export const DEVICE_MESSAGES = Object.freeze({
  OK: "Thiết bị được phép sử dụng chức năng này.",
  DEVICE_TOKEN_MISSING:
    "Thiết bị chưa được cấp phép. Vui lòng liên hệ Admin để cấp phép thiết bị này.",
  DEVICE_NOT_AUTHORIZED:
    "Thiết bị này không tồn tại trong danh sách được phép hoặc đã bị khóa. Vui lòng liên hệ Admin.",
  DEVICE_ACTION_FORBIDDEN:
    "Thiết bị này chưa được cấp quyền cho chức năng này. Vui lòng liên hệ Admin.",
  IP_NOT_ALLOWED:
    "Địa chỉ IP hiện tại không nằm trong danh sách IP văn phòng được phép.",
  DEVICE_CHECK_UNAVAILABLE:
    "Không thể kiểm tra quyền thiết bị. Vui lòng thử lại sau.",
  INVALID_ACTION: "Hành động kiểm tra không hợp lệ.",
});

export const hashDeviceToken = (rawToken) =>
  crypto.createHash("sha256").update(String(rawToken || "")).digest("hex");

export const generateDeviceToken = () => crypto.randomBytes(32).toString("hex");

export const normalizeIpValue = (value) => {
  const text = String(value || "")
    .trim()
    .replace(/^::ffff:/, "");
  return text === "::1" ? "127.0.0.1" : text;
};

export const normalizeClientIp = (req) =>
  normalizeIpValue(req?.ip || req?.socket?.remoteAddress || "");

export const parseAllowedIps = (value) => {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = [];
    }
  }
  if (!Array.isArray(source)) return [];
  return Array.from(
    new Set(
      source
        .map((item) => normalizeIpValue(item))
        .filter(Boolean),
    ),
  );
};

export const sanitizeIpList = (value) => {
  if (!Array.isArray(value)) return null;
  const cleaned = Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );
  const invalid = cleaned.filter((item) => !net.isIP(item));
  if (invalid.length) return { error: `IP không hợp lệ: ${invalid.join(", ")}` };
  return { ips: cleaned };
};

export const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
};
