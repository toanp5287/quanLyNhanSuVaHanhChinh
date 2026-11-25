import express from "express";
import { listContractRenewalCandidates } from "../controllers/contract-renewals/contract-renewals.controller.js";
import {
  requirePermission,
  verifyToken,
} from "../middlewares/auth.middleware.js";

const routerContractRenewals = express.Router();

routerContractRenewals.get(
  "/candidates",
  verifyToken,
  requirePermission("HR.CONTRACT_MANAGE"),
  listContractRenewalCandidates,
);

export default routerContractRenewals;
