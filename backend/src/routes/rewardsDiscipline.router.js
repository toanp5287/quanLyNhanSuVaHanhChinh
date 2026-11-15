import express from "express";

import {
  requirePermission,
  verifyToken,
} from "../middlewares/auth.middleware.js";

const routerRewardsDiscipline = express.Router();

export default routerRewardsDiscipline;
