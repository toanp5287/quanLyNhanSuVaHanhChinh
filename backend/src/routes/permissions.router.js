import express from "express";
import { verifyToken, requireRole } from "../middlewares/auth.middleware.js";
import {
  getMatrix,
  updateRolePermissionsHandler,
  updateRoleScopeHandler,
} from "../controllers/permissions/permissions.controller.js";

const permissionsRouter = express.Router();

permissionsRouter.use(verifyToken, requireRole("SUPER_ADMIN"));

permissionsRouter.get("/matrix", getMatrix);
permissionsRouter.put("/roles/:roleId/permissions", updateRolePermissionsHandler);
permissionsRouter.patch("/roles/:roleId/scope", updateRoleScopeHandler);
permissionsRouter.put("/roles/:roleId", updateRolePermissionsHandler);

export default permissionsRouter;
