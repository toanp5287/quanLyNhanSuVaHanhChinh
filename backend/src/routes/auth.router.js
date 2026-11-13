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

const routerAuth = express.Router();

routerAuth.post("/login", login);

routerAuth.get("/me", verifyToken, getProfile);
routerAuth.get("/profile", verifyToken, getProfile);

routerAuth.get(
  "/employees",
  verifyToken,
  requirePermission("HR.PROFILE_VIEW"),
  getEmployees,
);

export default routerAuth;
