import express from "express";

import {
    requirePermission,
    verifyToken,
} from "../middlewares/auth.middleware.js";


const routerQuanLyNghiPhepVaQuyPhepNam = express.Router();


export default routerQuanLyNghiPhepVaQuyPhepNam;
