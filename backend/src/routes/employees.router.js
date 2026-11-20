import express from "express";
import {
  listEmployees,
  resetEmployeeFaceController,
} from "../controllers/employees/employees.controller.js";
import {
  requirePermission,
  verifyToken,
} from "../middlewares/auth.middleware.js";
import { hasPermission } from "../utils/helper.js";

const routerEmployees = express.Router();

routerEmployees.get(
  "/",
  verifyToken,
  requirePermission("HR.PROFILE_VIEW"),
  listEmployees,
);

routerEmployees.post(
  "/:id/reset-face",
  verifyToken,
  (req, res, next) => {
    const allowed = req.user?.role_id === "SUPER_ADMIN" || hasPermission("HR.PROFILE_MANAGE", req.user);
    if (!allowed)
      return res.status(403).json({ success: false, message: "Chỉ Admin/HR được Reset FaceID" });
    return next();
  },
  resetEmployeeFaceController,
);

export default routerEmployees;
