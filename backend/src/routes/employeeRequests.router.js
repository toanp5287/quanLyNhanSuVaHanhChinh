import express from "express";
import {
  approveRequest,
  getHistory,
  getRequestDetail,
  getRequests,
  postRequest,
  postResignationRequest,
  postTemporaryLeaveRequest,
  rejectRequest,
  requestUpdate,
  resubmitRequest,
} from "../controllers/employee-requests/employeeRequests.controller.js";
import {
  requirePermission,
  verifyToken,
} from "../middlewares/auth.middleware.js";

const routerEmployeeRequests = express.Router();

routerEmployeeRequests.use(verifyToken, requirePermission("ESS.SELF_PROFILE"));

routerEmployeeRequests.post("/", postRequest);
routerEmployeeRequests.post("/resignation", postResignationRequest);
routerEmployeeRequests.post("/temporary-leave", postTemporaryLeaveRequest);
routerEmployeeRequests.get("/", getRequests);
routerEmployeeRequests.get("/:id", getRequestDetail);
routerEmployeeRequests.post("/:id/approve", approveRequest);
routerEmployeeRequests.post("/:id/reject", rejectRequest);
routerEmployeeRequests.post("/:id/request-update", requestUpdate);
routerEmployeeRequests.post("/:id/resubmit", resubmitRequest);
routerEmployeeRequests.get("/:id/history", getHistory);

export default routerEmployeeRequests;
