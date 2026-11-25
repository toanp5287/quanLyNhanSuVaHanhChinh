import express from "express";
import {
  getEmployees,
  getProfile,
  login,
} from "../controllers/auth/auth.controller.js";
import {
  requirePermission,
  verifyToken,
} from "../middlewares/auth.middleware.js";
import { loginIpGuard } from "../middlewares/deviceSecurity.middleware.js";

const routerAuth = express.Router();

routerAuth.post("/login", login);

routerAuth.get("/me", verifyToken, loginIpGuard, getProfile);
routerAuth.get("/profile", verifyToken, loginIpGuard, getProfile);

routerAuth.get(
  "/employees",
  verifyToken,
  loginIpGuard,
  requirePermission("HR.PROFILE_VIEW"),
  getEmployees,
);

export default routerAuth;
