import express from "express";
import { verifyToken, requireRole } from "../middlewares/auth.middleware.js";
import {
  getMatrix,
  updateRole,
} from "../controllers/permissions/permissions.controller.js";

const permissionsRouter = express.Router();

permissionsRouter.use(verifyToken, requireRole("SUPER_ADMIN"));

permissionsRouter.get("/matrix", getMatrix);
permissionsRouter.put("/roles/:roleId", updateRole);

export default permissionsRouter;
