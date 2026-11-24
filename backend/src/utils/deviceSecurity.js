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
  OK: "Thiết bị được phép điểm danh.",
  DEVICE_NOT_REGISTERED: "Thiết bị này chưa được Admin thêm vào hệ thống cấp phép điểm danh.",
  DEVICE_LOCKED: "Thiết bị này đã bị Admin khóa quyền điểm danh.",
  DEVICE_FACE_ENROLL_DENIED: "Thiết bị này chưa được cấp quyền đăng ký khuôn mặt.",
  DEVICE_IP_MISMATCH: "Thiết bị chỉ được phép điểm danh tại địa chỉ IP/mạng do Admin quy định.",
  LOGIN_IP_NOT_ALLOWED: "Địa chỉ IP hiện tại không được phép đăng nhập hoặc sử dụng hệ thống.",
});

export const hashDeviceToken = (rawToken) =>
  crypto.createHash("sha256").update(String(rawToken || "")).digest("hex");

export const generateDeviceToken = () => crypto.randomBytes(32).toString("hex");

export const normalizeIpValue = (value) => {
  let text = String(value ?? "").trim();
  if (!text) return "";
  if (text.includes(",")) text = text.split(",")[0].trim();
  text = text.replace(/^::ffff:/i, "");
  if (text === "::1") return "127.0.0.1";
  return text;
};

export const getClientIp = (req) => {
  const forwarded = req?.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return normalizeIpValue(forwarded.split(",")[0]);
  }
  if (Array.isArray(forwarded) && forwarded.length) {
    return normalizeIpValue(String(forwarded[0]).split(",")[0]);
  }
  return normalizeIpValue(req?.ip || req?.socket?.remoteAddress || req?.connection?.remoteAddress || "");
};

export const normalizeClientIp = getClientIp;

export const parseIpList = (raw) => {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.flatMap((item) => parseIpList(item)).filter(Boolean)));
  }
  const text = String(raw).trim();
  if (!text) return [];
  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parseIpList(parsed);
    } catch {
      // fall through to comma split
    }
  }
  return Array.from(
    new Set(text.split(/[,;\n\r]+/).map((item) => normalizeIpValue(item)).filter(Boolean)),
  );
};

export const isIpAllowed = (clientIp, rawAllowedIps) => {
  const allowedIps = parseIpList(rawAllowedIps);
  if (!allowedIps.length) return true;
  return allowedIps.includes(normalizeIpValue(clientIp));
};

export const normalizeIpStorage = (value) => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    const ips = parseIpList(value);
    return ips.length ? ips.join(",") : null;
  }
  const text = String(value).trim();
  if (!text) return null;
  const ips = parseIpList(text);
  return ips.length ? ips.join(",") : null;
};

export const validateIpInput = (value, fieldLabel = "IP") => {
  if (value === null || value === undefined || String(value).trim() === "") {
    return { value: null };
  }
  const ips = parseIpList(value);
  if (!ips.length) return { value: null };
  const invalid = ips.filter((ip) => net.isIP(ip) === 0);
  if (invalid.length) {
    return { error: `${fieldLabel} không hợp lệ: ${invalid.join(", ")}` };
  }
  return { value: ips.join(",") };
};

export const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
};
