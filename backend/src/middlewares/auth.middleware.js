import jwt from "jsonwebtoken";
import { hasAnyPermission, hasPermission } from "../utils/helper.js";
import { loginIpGuard } from "./deviceSecurity.middleware.js";

const extractToken = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }
  if (req.query?.token) return String(req.query.token);
  return null;
};

const authorizeRequest = (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "B?n chua dang nh?p",
      });
    }

    req.user = jwt.verify(token, process.env.JWT_SECRET);
    if (req.path === "/logout" || req.originalUrl?.includes("/auth/logout")) {
      return next();
    }
    return loginIpGuard(req, res, next);
  } catch (error) {
    return res.status(401).json({
      success: false,
      message:
        error.name === "TokenExpiredError"
          ? "Token d� h?t h?n, vui l�ng dang nh?p l?i"
          : "Token kh�ng h?p l?",
    });
  }
};

export const verifyToken = authorizeRequest;

export const verifyStreamToken = authorizeRequest;

export const requireRole = (roleId) => {
  return (req, res, next) => {
    if (req.user?.role_id !== roleId) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền thực hiện chức năng này",
      });
    }

    next();
  };
};

export const requireAdmin = requireRole("SUPER_ADMIN");

export const requirePermission = (permissionCode) => {
  return (req, res, next) => {
    if (!hasPermission(req.user?.permissions, permissionCode)) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền thực hiện chức năng này",
      });
    }

    next();
  };
};

export const requireAnyPermission = (permissionCodes = []) => {
  return (req, res, next) => {
    if (!hasAnyPermission(req.user?.permissions, permissionCodes)) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền thực hiện chức năng này",
      });
    }

    next();
  };
};

const normalizeIp = (ip) => {
  if (!ip) return "";
  return String(ip)
    .replace(/^::ffff:/, "")
    .trim();
};

let missingDeviceWarningLogged = false;

export const requireAllowedAttendanceDevice = (req, res, next) => {
  const configured = String(process.env.ALLOWED_DEVICE_ID || "")
    .trim()
    .toLowerCase();
  if (!configured) {
    if (!missingDeviceWarningLogged) {
      console.warn("ALLOWED_DEVICE_ID chưa được cấu hình: kiểm tra thiết bị chấm công đang bị bỏ qua.");
      missingDeviceWarningLogged = true;
    }
    return next();
  }
  const supplied = String(
    req.headers["x-device-id"] || req.body?.device_id || "",
  )
    .trim()
    .toLowerCase();
  if (supplied && supplied === configured) return next();
  return res.status(403).json({
    success: false,
    message: "Chỉ máy chấm công đã đăng ký mới được vào ca hoặc tan ca.",
  });
};

export const requireAllowedAttendanceIp = (req, res, next) => {
  if (
    String(process.env.STRICT_ATTENDANCE_LOCK || "").toLowerCase() !== "true"
  ) {
    return next();
  }

  const allowed = String(process.env.ALLOWED_ATTENDANCE_IPS || "")
    .split(",")
    .map((value) => normalizeIp(value))
    .filter(Boolean);

  if (!allowed.length) return next();

  const clientIp = normalizeIp(req.ip || req.socket?.remoteAddress || "");

  if (allowed.includes(clientIp)) return next();

  return res.status(403).json({
    success: false,
    message: "IP máy không được phép chấm công.",
  });
};
