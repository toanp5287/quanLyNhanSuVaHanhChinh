import express from "express";

import {
  requirePermission,
  verifyToken,
} from "../middlewares/auth.middleware.js";
import { verifyAuthorizedDevice } from "../middlewares/deviceSecurity.middleware.js";
import {
  getMyProfile,
  resetMyFaceDescriptor,
  updateMyContact,
  updateMyFaceDescriptor,
  updateMyPassword,
} from "../controllers/my-profile/myProfile.controller.js";

const routerMyProfile = express.Router();

routerMyProfile.use(verifyToken, requirePermission("ESS.SELF_PROFILE"));

routerMyProfile.get("/", getMyProfile);
routerMyProfile.put("/contact", updateMyContact);
routerMyProfile.put("/password", updateMyPassword);
routerMyProfile.put(
  "/face-descriptor",
  verifyAuthorizedDevice("face_enroll"),
  updateMyFaceDescriptor,
);
routerMyProfile.delete(
  "/face-descriptor",
  verifyAuthorizedDevice("face_enroll"),
  resetMyFaceDescriptor,
);

export default routerMyProfile;
