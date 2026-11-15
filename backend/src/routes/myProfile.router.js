import express from "express";

import {
  requirePermission,
  verifyToken,
} from "../middlewares/auth.middleware.js";
import {
  getMyProfile,
  updateMyContact,
  updateMyPassword,
} from "../controllers/my-profile/myProfile.controller.js";

const routerMyProfile = express.Router();

routerMyProfile.use(verifyToken, requirePermission("ESS.SELF_PROFILE"));

routerMyProfile.get("/", getMyProfile);
routerMyProfile.put("/contact", updateMyContact);
routerMyProfile.put("/password", updateMyPassword);

export default routerMyProfile;
