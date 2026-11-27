import express from "express";
import {
  approveExplanation,
  createDelegationHandler,
  delegationCandidatesHandler,
  getEvidenceFile,
  getMy,
  getRules,
  hrQueue,
  hrVerify,
  listDelegationsHandler,
  monthlyStats,
  pendingApproval,
  revokeDelegationHandler,
  submitExplanation,
  uploadEvidence,
  uploadEvidenceFile,
} from "../controllers/late-explanation/lateExplanation.controller.js";
import {
  requireAnyPermission,
  requirePermission,
  verifyToken,
} from "../middlewares/auth.middleware.js";

const router = express.Router();
const delegationRouter = express.Router();

const uploadEvidenceSafe = (req, res, next) => {
  uploadEvidenceFile(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || "Tệp minh chứng không hợp lệ",
      });
    }
    return next();
  });
};

router.use(verifyToken);

router.get("/rules", getRules);
router.get("/my", requirePermission("ESS.SELF_PROFILE"), getMy);
router.post("/evidence", requirePermission("ESS.SELF_PROFILE"), uploadEvidenceSafe, uploadEvidence);
router.get("/evidence/:filename", getEvidenceFile);
router.post("/:id/submit", requirePermission("ESS.SELF_PROFILE"), submitExplanation);

router.get(
  "/pending-approval",
  requireAnyPermission(["LEAVE.APPROVE", "ATT.VIEW", "ESS.SELF_PROFILE"]),
  pendingApproval,
);
router.patch(
  "/:id/approve",
  requireAnyPermission(["LEAVE.APPROVE", "ATT.VIEW", "ESS.SELF_PROFILE"]),
  approveExplanation,
);

const hrPermissions = ["HR.PROFILE_MANAGE", "ATT.VIEW", "LEAVE.APPROVE"];
router.get("/hr-queue", requireAnyPermission(hrPermissions), hrQueue);
router.patch("/:id/hr-verify", requireAnyPermission(hrPermissions), hrVerify);
router.get("/stats/monthly", requireAnyPermission(hrPermissions), monthlyStats);

delegationRouter.use(verifyToken);
delegationRouter.post(
  "/",
  requireAnyPermission(["LEAVE.APPROVE", "ATT.SHIFT_OT_MANAGE", "ESS.SELF_PROFILE"]),
  createDelegationHandler,
);
delegationRouter.get("/my", listDelegationsHandler);
delegationRouter.get("/candidates", delegationCandidatesHandler);
delegationRouter.patch(
  "/:id/revoke",
  requireAnyPermission(["LEAVE.APPROVE", "ATT.SHIFT_OT_MANAGE", "ESS.SELF_PROFILE"]),
  revokeDelegationHandler,
);

export { delegationRouter };
export default router;
