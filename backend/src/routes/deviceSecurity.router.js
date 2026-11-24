import express from "express";
import { evaluateDevicePermission } from "../middlewares/deviceSecurity.middleware.js";

const router = express.Router();

router.get("/check-permission", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const action = String(req.query?.action || "").trim();
  const result = await evaluateDevicePermission(req, action);
  return res.status(200).json({
    allowed: result.allowed,
    code: result.code,
    message: result.message,
    deviceName: result.deviceName || null,
    deviceId: result.deviceId || null,
    clientIp: result.clientIp,
    allowedIps: result.allowedIps || null,
    attendanceStatus: result.attendanceStatus || null,
  });
});

export default router;
