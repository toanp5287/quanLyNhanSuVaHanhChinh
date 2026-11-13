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
