import express from "express";

import {
    requirePermission,
    verifyToken,
} from "../middlewares/auth.middleware.js";


const routerTongHopChotCong = express.Router();


export default routerTongHopChotCong;
