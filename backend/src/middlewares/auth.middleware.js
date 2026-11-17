import jwt from "jsonwebtoken";
import { hasAnyPermission, hasPermission } from "../utils/helper.js";

export const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Bạn chưa đăng nhập",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message:
        error.name === "TokenExpiredError"
          ? "Token đã hết hạn, vui lòng đăng nhập lại"
          : "Token không hợp lệ",
    });
  }
};

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
  return String(ip).replace(/^::ffff:/, "").trim();
};

export const requireAllowedAttendanceDevice = (req, res, next) => {
  const allowedDeviceId = String(process.env.ALLOWED_DEVICE_ID || "").trim().toLowerCase();
  if (!allowedDeviceId) return next();

  const requestDeviceId = String(
    req.headers["x-device-id"] || req.body?.device_id || "",
  )
    .trim()
    .toLowerCase();

  if (requestDeviceId && requestDeviceId === allowedDeviceId) return next();

  return res.status(403).json({
    success: false,
    message:
      "Thiết bị này không được phép chấm công. Chỉ máy đã đăng ký mới có thể điểm danh.",
  });
};

export const requireAllowedAttendanceIp = (req, res, next) => {
  if (String(process.env.STRICT_ATTENDANCE_LOCK || "").toLowerCase() !== "true") {
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
    message: "IP máy không được phép chấm công hoặc cập nhật khuôn mặt",
  });
};
