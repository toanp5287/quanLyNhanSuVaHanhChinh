import express from "express";
import { getBalances, putBalance, getRequests, postRequest, approveRequest, rejectRequest, cancelRequest } from "../controllers/quan-ly-nghi-phep-va-quy-phep-nam/quan-ly-nghi-phep-va-quy-phep-nam.controller.js";

import {
    requirePermission,
    verifyToken,
} from "../middlewares/auth.middleware.js";


const routerQuanLyNghiPhepVaQuyPhepNam = express.Router();

routerQuanLyNghiPhepVaQuyPhepNam.use(verifyToken, requirePermission("ESS.SELF_PROFILE"));
routerQuanLyNghiPhepVaQuyPhepNam.get("/balances", getBalances);
routerQuanLyNghiPhepVaQuyPhepNam.put("/balances/:employeeId", requirePermission("LEAVE.QUOTA_MANAGE"), putBalance);
routerQuanLyNghiPhepVaQuyPhepNam.get("/requests", getRequests);
routerQuanLyNghiPhepVaQuyPhepNam.post("/requests", postRequest);
routerQuanLyNghiPhepVaQuyPhepNam.post("/requests/:id/approve", approveRequest);
routerQuanLyNghiPhepVaQuyPhepNam.post("/requests/:id/reject", rejectRequest);
routerQuanLyNghiPhepVaQuyPhepNam.delete("/requests/:id", cancelRequest);


export default routerQuanLyNghiPhepVaQuyPhepNam;
