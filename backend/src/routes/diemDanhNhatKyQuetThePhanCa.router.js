import express from "express";
import { listMonthlyTimesheets, updateMonth } from "../services/tong-hop-chot-cong/tongHopChotCong.service.js";
import { kioskAttendance } from "../services/diem-danh-nhat-ky-quet-the-phan-ca/diemDanhNhatKyQuetThePhanCa.service.js";

import {
  requireAllowedAttendanceIp,
  requireAnyPermission,
  requirePermission,
  verifyToken,
} from "../middlewares/auth.middleware.js";
import {
  attendanceCheckIn,
  attendanceCheckOut,
  attendanceList,
  attendanceQuickMark,
  attendanceQuickMarkAll,
  attendanceToday,
} from "../controllers/diem-danh-nhat-ky-quet-the-phan-ca/diemDanhNhatKyQuetThePhanCa.controller.js";

const router = express.Router();

const kioskAttempts = new Map();
router.post("/kiosk/:action", requireAllowedAttendanceIp, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const now = Date.now();
  for (const [key, value] of kioskAttempts) if (value.until < now) kioskAttempts.delete(key);
  const key = req.ip;
  const attempts = kioskAttempts.get(key) || { count: 0, until: now + 60000 };
  if (++attempts.count > 20) return res.status(429).json({ success: false, message: "Quá nhiều lần quét. Vui lòng chờ một phút rồi thử lại." });
  kioskAttempts.set(key, attempts);
  try {
    const data = await kioskAttendance(req.params.action, req.body?.face_samples, req.ip);
    res.json({ success: true, message: req.params.action === "check-in" ? "Điểm danh vào ca thành công" : "Điểm danh tan ca thành công", data });
  } catch (error) {
    if (!error.status) console.error("Lỗi FaceID kiosk:", error);
    res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Không thể ghi nhận chấm công. Vui lòng thử lại." });
  }
});

router.use(verifyToken);

router.get("/today", requirePermission("ESS.SELF_PROFILE"), attendanceToday);
router.post(["/check-in", "/check-out"], (req, res) => res.status(410).json({ success: false, message: "Vui lòng chấm công tại màn hình FaceID bên ngoài: /#/face-id" }));

router.get("/logs", requireAnyPermission(["ATT.VIEW", "HR.PROFILE_MANAGE"]), attendanceList);
router.post("/quick-mark", requirePermission("ATT.SHIFT_OT_MANAGE"), attendanceQuickMark);
router.post("/quick-mark-all", requirePermission("ATT.SHIFT_OT_MANAGE"), attendanceQuickMarkAll);

router.get("/monthly", requirePermission("ATT.VIEW"), async (req, res) => {
  try {
    res.json({ success: true, data: await listMonthlyTimesheets(req.query.month, req.user) });
  } catch (error) { res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Không thể tải bảng công tháng" }); }
});
for (const action of ["recalculate", "lock"]) {
  router.post(`/monthly/${action}`, requirePermission("ATT.SHIFT_OT_MANAGE"), async (req, res) => {
    try {
      const data = await updateMonth(req.body.month, req.user, action === "lock", req.body.department_id || null);
      res.json({ success: true, data, message: action === "lock" ? "Đã khóa bảng công" : "Đã tổng hợp công tháng" });
    } catch (error) { res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Không thể cập nhật bảng công tháng" }); }
  });
}

export default router;
