import express from "express";
import {
  createDepartmentHandler,
  createPositionHandler,
  getDepartmentDetailHandler,
  listOrganization,
  updateDepartmentHandler,
  updatePositionHandler,
} from "../controllers/organization/organization.controller.js";
import {
  requirePermission,
  verifyToken,
} from "../middlewares/auth.middleware.js";

const routerOrganization = express.Router();

routerOrganization.get(
  "/",
  verifyToken,
  requirePermission("HR.PROFILE_VIEW"),
  listOrganization,
);

routerOrganization.get(
  "/departments/:id",
  verifyToken,
  requirePermission("HR.PROFILE_VIEW"),
  getDepartmentDetailHandler,
);

routerOrganization.post(
  "/departments",
  verifyToken,
  requirePermission("HR.PROFILE_MANAGE"),
  createDepartmentHandler,
);

routerOrganization.put(
  "/departments/:id",
  verifyToken,
  requirePermission("HR.PROFILE_MANAGE"),
  updateDepartmentHandler,
);

routerOrganization.post(
  "/positions",
  verifyToken,
  requirePermission("HR.PROFILE_MANAGE"),
  createPositionHandler,
);

routerOrganization.put(
  "/positions/:id",
  verifyToken,
  requirePermission("HR.PROFILE_MANAGE"),
  updatePositionHandler,
);

export default routerOrganization;
