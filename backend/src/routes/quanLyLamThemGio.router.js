import express from "express";
import { listOvertime, myOvertime, createOvertime, approveOvertime, rejectOvertime, cancelOvertime } from "../controllers/quan-ly-lam-them-gio/quanLyLamThemGio.controller.js";

import {
    requirePermission,
    verifyToken,
} from "../middlewares/auth.middleware.js";


const routerQuanLyLamThemGio = express.Router();

routerQuanLyLamThemGio.use(verifyToken, requirePermission("ESS.SELF_PROFILE"));
routerQuanLyLamThemGio.get("/", listOvertime);
routerQuanLyLamThemGio.get("/my", myOvertime);
routerQuanLyLamThemGio.post("/", createOvertime);
routerQuanLyLamThemGio.post("/:id/approve", approveOvertime);
routerQuanLyLamThemGio.patch("/:id/approve", approveOvertime);
routerQuanLyLamThemGio.post("/:id/reject", rejectOvertime);
routerQuanLyLamThemGio.patch("/:id/reject", rejectOvertime);
routerQuanLyLamThemGio.delete("/:id", cancelOvertime);


export default routerQuanLyLamThemGio;
