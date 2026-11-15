import express from "express";
import {
  createContractHandler,
  listContracts,
  terminateContractHandler,
} from "../controllers/contracts/contracts.controller.js";
import {
  requirePermission,
  verifyToken,
} from "../middlewares/auth.middleware.js";

const routerContracts = express.Router();

routerContracts.get(
  "/",
  verifyToken,
  requirePermission("HR.CONTRACT_MANAGE"),
  listContracts,
);

routerContracts.post(
  "/",
  verifyToken,
  requirePermission("HR.CONTRACT_MANAGE"),
  requirePermission("HR.PROFILE_MANAGE"),
  createContractHandler,
);

routerContracts.put(
  "/:id/terminate",
  verifyToken,
  requirePermission("HR.CONTRACT_MANAGE"),
  requirePermission("HR.PROFILE_MANAGE"),
  terminateContractHandler,
);

export default routerContracts;
