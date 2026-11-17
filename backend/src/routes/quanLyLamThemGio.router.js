import express from "express";

import {
    requirePermission,
    verifyToken,
} from "../middlewares/auth.middleware.js";


const routerQuanLyLamThemGio = express.Router();


export default routerQuanLyLamThemGio;
