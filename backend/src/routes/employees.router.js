import express from "express";
import { listEmployees } from "../controllers/employees/employees.controller.js";
import {
  requirePermission,
  verifyToken,
} from "../middlewares/auth.middleware.js";

const routerEmployees = express.Router();

routerEmployees.get(
  "/",
  verifyToken,
  requirePermission("HR.PROFILE_VIEW"),
  listEmployees,
);

export default routerEmployees;
