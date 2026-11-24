import express from "express";
import {
  checkMyFaceOwner,
  updateMyFaceDescriptor,
  verifyMyFacePassword,
} from "../controllers/my-profile/myProfile.controller.js";
import {
  createAttendanceChallenge,
  kioskAttendance,
  logAttendanceFraud,
} from "../services/diem-danh-nhat-ky-quet-the-phan-ca/diemDanhNhatKyQuetThePhanCa.service.js";

import {
  requireAnyPermission,
  requirePermission,
  verifyToken,
} from "../middlewares/auth.middleware.js";
import { verifyAuthorizedDevice } from "../middlewares/deviceSecurity.middleware.js";
import {
  approveExplanationHandler,
  attendanceCheckIn,
  attendanceCheckOut,
  attendanceList,
<<<<<<< HEAD
=======
  attendanceManualUpdate,
  attendanceMyHistory,
>>>>>>> origin/main
  attendanceQuickMark,
  attendanceQuickMarkAll,
  attendanceToday,
  cancelExplanationHandler,
  getExplanations,
  getShiftAssignments,
  getKioskConfigHandler,
  getWorkShifts,
  listAttendancePoliciesHandler,
  removeAttendancePolicyHandler,
  saveAttendancePolicyHandler,
  postExplanation,
  postShiftAssignment,
  postWorkShift,
  putShiftAssignment,
  putWorkShift,
  rejectExplanationHandler,
  removeShiftAssignment,
<<<<<<< HEAD
=======
  removeWorkShift,
  updateKioskConfigHandler,
>>>>>>> origin/main
} from "../controllers/diem-danh-nhat-ky-quet-the-phan-ca/diemDanhNhatKyQuetThePhanCa.controller.js";

const router = express.Router();

const failureAttempts = new Map();
const normalizeClientIp = (req) =>
  String(req.ip || req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
const createFailureLimiter = (prefix, max, message, windowMs = 60000) => {
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, value] of failureAttempts)
      if (value.until < now) failureAttempts.delete(key);
    const key = `${prefix}:${normalizeClientIp(req)}:${String(req.headers["x-device-id"] || "")}`;
    const attempts = failureAttempts.get(key) || {
      count: 0,
      until: now + windowMs,
    };
    if (attempts.count >= max)
      return res.status(429).json({ success: false, message });
    failureAttempts.set(key, attempts);
    res.on("finish", () => {
      if (res.statusCode >= 400) {
        attempts.count += 1;
        attempts.until = Date.now() + windowMs;
      }
    });
    next();
  };
};
const kioskLimiter = createFailureLimiter(
  "kiosk",
  20,
  "Quá nhiều lần quét chưa thành công. Vui lòng chờ một phút rồi thử lại.",
);
const faceAuthLimiter = createFailureLimiter(
  "face-auth",
  10,
  "Quá nhiều lần xác nhận FaceID chưa thành công. Vui lòng chờ một phút rồi thử lại.",
);
const faceEnrollLimiter = createFailureLimiter(
  "face-enroll",
  5,
  "Quá nhiều lần đăng ký FaceID chưa thành công. Vui lòng chờ một phút rồi thử lại.",
);

router.get(
  "/challenge",
  verifyAuthorizedDevice("attendance"),
  async (req, res) => {
    res.set("Cache-Control", "no-store");
    return res.json({ success: true, data: createAttendanceChallenge() });
  },
);

router.post(
  "/kiosk/:action",
  verifyAuthorizedDevice("attendance"),
  kioskLimiter,
  async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const data = await kioskAttendance(
        req.params.action,
        req.body?.embeddings,
        req.clientIp || req.ip,
        req.headers["x-device-id"] || null,
<<<<<<< HEAD
=======
        req.body?.capture,
        req.body || {},
        req.authorizedDevice?.id || null,
        req.clientIp || null,
>>>>>>> origin/main
      );
      res.json({
        success: true,
        message:
<<<<<<< HEAD
          req.params.action === "check-in"
=======
          data.message ||
          (data.action === "check-in"
>>>>>>> origin/main
            ? "Điểm danh vào ca thành công"
            : "Điểm danh tan ca thành công",
        data,
      });
    } catch (error) {
      if (error.fraud)
        logAttendanceFraud({
          reason: error.code || "ATTENDANCE_FRAUD",
          scores: error.scores || null,
          ip: req.ip,
          deviceId: req.headers["x-device-id"] || null,
          path: req.originalUrl,
          userAgent: req.headers["user-agent"] || null,
        });
      if (!error.status) console.error("Lỗi FaceID kiosk:", error);
      res.status(error.status || 500).json({
        success: false,
        message: error.status
          ? error.message
          : "Không thể ghi nhận chấm công. Vui lòng thử lại.",
        code: error.code || null,
        wait_seconds: error.wait_seconds || 0,
      });
    }
  },
);

router.get("/kiosk/config", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    return await getKioskConfigHandler(req, res);
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : "Không thể tải cấu hình kiosk",
    });
  }
});

router.use(verifyToken);

router.get("/today", requirePermission("ESS.SELF_PROFILE"), attendanceToday);
router.post(
  "/verify-face-password",
  requirePermission("ESS.SELF_PROFILE"),
  verifyAuthorizedDevice("face_enroll"),
  faceAuthLimiter,
  verifyMyFacePassword,
);
router.post(
  "/check-face-owner",
  requirePermission("ESS.SELF_PROFILE"),
  verifyAuthorizedDevice("face_enroll"),
  faceAuthLimiter,
  checkMyFaceOwner,
);
router.post(
  "/register-face",
  requirePermission("ESS.SELF_PROFILE"),
  verifyAuthorizedDevice("face_enroll"),
  faceEnrollLimiter,
  updateMyFaceDescriptor,
);
router.post(
  "/check-in",
  requirePermission("ESS.SELF_PROFILE"),
  verifyAuthorizedDevice("attendance"),
  attendanceCheckIn,
);
router.post(
  "/check-out",
  requirePermission("ESS.SELF_PROFILE"),
  verifyAuthorizedDevice("attendance"),
  attendanceCheckOut,
);

router.get(
  "/my-history",
  requirePermission("ESS.SELF_PROFILE"),
  attendanceMyHistory,
);
router.get(
  "/logs",
  requireAnyPermission(["ATT.VIEW", "HR.PROFILE_MANAGE"]),
  attendanceList,
);
router.post(
  "/quick-mark",
  requirePermission("ATT.SHIFT_OT_MANAGE"),
  attendanceQuickMark,
);
router.post(
  "/quick-mark-all",
  requirePermission("ATT.SHIFT_OT_MANAGE"),
  attendanceQuickMarkAll,
);

// Danh mục ca làm việc
router.get(
  "/shifts",
  requireAnyPermission(["ATT.SHIFT_OT_MANAGE", "ATT.VIEW"]),
  getWorkShifts,
);
router.post("/shifts", requirePermission("ATT.SHIFT_OT_MANAGE"), postWorkShift);
router.put(
  "/shifts/:id",
  requirePermission("ATT.SHIFT_OT_MANAGE"),
  putWorkShift,
);

// Quy chế tính công & cấu hình kiosk
router.get(
  "/policies",
  requireAnyPermission(["ATT.SHIFT_OT_MANAGE", "ATT.VIEW"]),
  listAttendancePoliciesHandler,
);
router.post(
  "/policies",
  requirePermission("ATT.SHIFT_OT_MANAGE"),
  saveAttendancePolicyHandler,
);
router.put(
  "/policies/:id",
  requirePermission("ATT.SHIFT_OT_MANAGE"),
  saveAttendancePolicyHandler,
);
router.delete(
  "/policies/:id",
  requirePermission("ATT.SHIFT_OT_MANAGE"),
  removeAttendancePolicyHandler,
);
router.get(
  "/kiosk-config",
  requireAnyPermission(["ATT.SHIFT_OT_MANAGE", "ATT.VIEW"]),
  getKioskConfigHandler,
);
router.put(
  "/kiosk-config",
  requirePermission("ATT.SHIFT_OT_MANAGE"),
  updateKioskConfigHandler,
);

// Phân ca nhân viên
router.get(
  "/shift-assignments",
  requireAnyPermission(["ATT.SHIFT_OT_MANAGE", "ATT.VIEW"]),
  getShiftAssignments,
);
router.post(
  "/shift-assignments",
  requirePermission("ATT.SHIFT_OT_MANAGE"),
  postShiftAssignment,
);
router.put(
  "/shift-assignments/:id",
  requirePermission("ATT.SHIFT_OT_MANAGE"),
  putShiftAssignment,
);
router.delete(
  "/shift-assignments/:id",
  requirePermission("ATT.SHIFT_OT_MANAGE"),
  removeShiftAssignment,
);

// Giải trình công
router.get(
  "/explanations",
  requirePermission("ESS.SELF_PROFILE"),
  getExplanations,
);
router.post(
  "/explanations",
  requirePermission("ESS.SELF_PROFILE"),
  postExplanation,
);
router.delete(
  "/explanations/:id",
  requirePermission("ESS.SELF_PROFILE"),
  cancelExplanationHandler,
);
router.post(
  "/explanations/:id/approve",
  requirePermission("ESS.SELF_PROFILE"),
  approveExplanationHandler,
);
router.post(
  "/explanations/:id/reject",
  requirePermission("ESS.SELF_PROFILE"),
  rejectExplanationHandler,
);

export default router;
