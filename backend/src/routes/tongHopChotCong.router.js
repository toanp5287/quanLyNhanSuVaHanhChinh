import express from "express";
import {
  listTimesheets,
  lockTimesheets,
  recalculateTimesheets,
} from "../controllers/tong-hop-chot-cong/tongHopChotCong.controller.js";
import {
  requirePermission,
  verifyToken,
} from "../middlewares/auth.middleware.js";

const routerTongHopChotCong = express.Router();

routerTongHopChotCong.use(verifyToken);

routerTongHopChotCong.get("/", requirePermission("ATT.VIEW"), listTimesheets);
routerTongHopChotCong.post(
  "/recalculate",
  requirePermission("ATT.SHIFT_OT_MANAGE"),
  recalculateTimesheets,
);
routerTongHopChotCong.post(
  "/lock",
  requirePermission("ATT.SHIFT_OT_MANAGE"),
  lockTimesheets,
);

export default routerTongHopChotCong;
