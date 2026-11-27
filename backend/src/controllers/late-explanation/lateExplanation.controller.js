import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import * as late from "../../services/late-explanation/lateExplanation.service.js";
import * as delegation from "../../services/delegation.service.js";
import {
  approveExplanationSchema,
  delegationSchema,
  hrVerifySchema,
  submitExplanationSchema,
  validateBody,
} from "../../validators/lateExplanation.validator.js";

const UPLOAD_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../uploads/late-evidence",
);

const handle = (operation, message, status = 200) => async (req, res) => {
  try {
    const data = await operation(req);
    return res.status(status).json({ success: true, message, data });
  } catch (error) {
    if (!error.status) console.error(message, error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : "Không thể xử lý yêu cầu giải trình đi muộn",
      code: error.code || null,
      details: error.details || undefined,
    });
  }
};

const storage = multer.diskStorage({
  destination: async (req, file, callback) => {
    try {
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      callback(null, UPLOAD_DIR);
    } catch (error) {
      callback(error);
    }
  },
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname || "").toLowerCase();
    callback(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!String(file.mimetype || "").startsWith("image/")) {
      return callback(new Error("Chỉ chấp nhận tệp hình ảnh"));
    }
    return callback(null, true);
  },
});

export const uploadEvidenceFile = upload.single("evidence");

export const uploadEvidence = (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "Chưa chọn tệp minh chứng" });
  }
  return res.status(201).json({
    success: true,
    message: "Tải minh chứng thành công",
    data: { evidence_url: `/api/attendance-late-explanations/evidence/${req.file.filename}` },
  });
};

export const getEvidenceFile = async (req, res) => {
  const filename = path.basename(String(req.params.filename || ""));
  if (!/^[A-Za-z0-9_.-]+$/.test(filename)) {
    return res.status(400).json({ success: false, message: "Tên tệp không hợp lệ" });
  }
  const filePath = path.join(UPLOAD_DIR, filename);
  try {
    await fs.access(filePath);
    return res.sendFile(filePath);
  } catch {
    return res.status(404).json({ success: false, message: "Không tìm thấy tệp minh chứng" });
  }
};

export const getMy = handle(
  (req) => late.getMyLateExplanations(req.user, req.query),
  "Danh sách giải trình đi muộn của tôi",
);

export const submitExplanation = handle(async (req) => {
  const payload = validateBody(submitExplanationSchema, req.body);
  return late.submitLateExplanation(req.params.id, payload, req.user);
}, "Đã nộp giải trình đi muộn");

export const pendingApproval = handle(
  (req) => late.getPendingApprovalExplanations(req.user, req.query),
  "Danh sách đơn chờ duyệt",
);

export const approveExplanation = handle(async (req) => {
  const payload = validateBody(approveExplanationSchema, req.body);
  return late.approveLateExplanation(req.params.id, payload, req.user);
}, "Đã cập nhật kết quả duyệt");

export const hrQueue = handle(
  (req) => late.getHrLateQueue(req.query),
  "Danh sách HR cần xử lý",
);

export const hrVerify = handle(async (req) => {
  const payload = validateBody(hrVerifySchema, req.body);
  return late.hrVerifyLateExplanation(req.params.id, payload, req.user);
}, "HR đã ghi nhận kết quả xử lý");

export const monthlyStats = handle(
  (req) => late.getMonthlyLateStats(req.query),
  "Thống kê đi muộn theo tháng",
);

export const getRules = handle(() => late.getPublicRules(), "Quy chế giải trình đi muộn");

export const createDelegationHandler = handle(async (req) => {
  const payload = validateBody(delegationSchema, req.body);
  return delegation.createDelegation(payload, req.user);
}, "Đã tạo ủy quyền duyệt thay", 201);

export const listDelegationsHandler = handle(
  (req) => delegation.listMyDelegations(req.user),
  "Danh sách ủy quyền duyệt thay",
);

export const delegationCandidatesHandler = handle(
  (req) => delegation.getDelegationCandidates(req.user),
  "Danh sách nhân viên có thể ủy quyền",
);

export const revokeDelegationHandler = handle(
  (req) => delegation.revokeDelegation(req.params.id, req.user),
  "Đã hủy ủy quyền",
);
