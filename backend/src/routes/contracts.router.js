import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import multer from "multer";
import {
  createContractHandler,
  createDraftContractHandler,
  downloadContractFileHandler,
  downloadContractTemplateHandler,
  getContractDetailHandler,
  getContractEditorConfigHandler,
  getContractFileByTokenHandler,
  listContractTemplatesHandler,
  listContracts,
  onlyOfficeCallbackHandler,
  previewContractTemplateHandler,
  submitContractApprovalHandler,
  terminateContractHandler,
  uploadContractFileHandler,
  uploadContractTemplateHandler,
} from "../controllers/contracts/contracts.controller.js";
import {
  requirePermission,
  verifyToken,
} from "../middlewares/auth.middleware.js";

const draftStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    const year = String(new Date().getFullYear());
    const directory = path.resolve(process.cwd(), "uploads", "drafts", year);

    try {
      fs.mkdirSync(directory, { recursive: true });
      callback(null, directory);
    } catch (error) {
      callback(error);
    }
  },
  filename: (_req, file, callback) => {
    callback(null, `${crypto.randomUUID()}.docx`);
  },
});

const draftUpload = multer({
  storage: draftStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!/\.docx$/i.test(path.extname(file.originalname || ""))) {
      return callback(new Error("Chỉ chấp nhận file hợp đồng định dạng .docx"));
    }

    return callback(null, true);
  },
}).single("file");

const handleDraftUpload = (req, res, next) => {
  draftUpload(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: false,
        message:
          error.code === "LIMIT_FILE_SIZE"
            ? "File hợp đồng không được vượt quá 10MB"
            : error.message || "Không thể upload file hợp đồng",
      });
    }

    return next();
  });
};

const templateStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    const directory = path.resolve(process.cwd(), "uploads", "templates");

    try {
      fs.mkdirSync(directory, { recursive: true });
      callback(null, directory);
    } catch (error) {
      callback(error);
    }
  },
  filename: (_req, file, callback) => {
    callback(null, `${crypto.randomUUID()}.docx`);
  },
});

const templateUpload = multer({
  storage: templateStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!/\.docx$/i.test(path.extname(file.originalname || ""))) {
      return callback(new Error("Chỉ chấp nhận file mẫu định dạng .docx"));
    }

    return callback(null, true);
  },
}).single("templateFile");

const handleTemplateUpload = (req, res, next) => {
  templateUpload(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: false,
        message:
          error.code === "LIMIT_FILE_SIZE"
            ? "File mẫu hợp đồng không được vượt quá 10MB"
            : error.message || "Không thể upload file mẫu hợp đồng",
      });
    }

    return next();
  });
};

const contractFileStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    const year = String(new Date().getFullYear());
    const directory = path.resolve(process.cwd(), "uploads", "contracts", year);

    try {
      fs.mkdirSync(directory, { recursive: true });
      callback(null, directory);
    } catch (error) {
      callback(error);
    }
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname || "").toLowerCase();
    callback(null, `${crypto.randomUUID()}${extension}`);
  },
});

const contractFileUpload = multer({
  storage: contractFileStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!/\.(docx|pdf)$/i.test(path.extname(file.originalname || ""))) {
      return callback(
        new Error("Chỉ chấp nhận file hợp đồng định dạng .docx hoặc .pdf"),
      );
    }

    return callback(null, true);
  },
}).single("file");

const handleContractFileUpload = (req, res, next) => {
  contractFileUpload(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: false,
        message:
          error.code === "LIMIT_FILE_SIZE"
            ? "File hợp đồng không được vượt quá 15MB"
            : error.message || "Không thể upload file hợp đồng",
      });
    }

    return next();
  });
};

const routerContracts = express.Router();

routerContracts.get(
  "/",
  verifyToken,
  requirePermission("HR.CONTRACT_MANAGE"),
  listContracts,
);

routerContracts.get(
  "/templates",
  verifyToken,
  requirePermission("HR.CONTRACT_MANAGE"),
  listContractTemplatesHandler,
);

routerContracts.get(
  "/templates/:id/preview",
  verifyToken,
  requirePermission("HR.CONTRACT_MANAGE"),
  previewContractTemplateHandler,
);

routerContracts.get(
  "/templates/:id/file",
  verifyToken,
  requirePermission("HR.CONTRACT_MANAGE"),
  downloadContractTemplateHandler,
);

routerContracts.post(
  "/templates",
  verifyToken,
  requirePermission("HR.CONTRACT_MANAGE"),
  handleTemplateUpload,
  uploadContractTemplateHandler,
);

routerContracts.post(
  "/draft",
  verifyToken,
  requirePermission("HR.CONTRACT_MANAGE"),
  requirePermission("HR.PROFILE_MANAGE"),
  handleDraftUpload,
  createDraftContractHandler,
);

routerContracts.get("/files/:token", getContractFileByTokenHandler);

routerContracts.post(
  "/onlyoffice/callback",
  onlyOfficeCallbackHandler,
);

routerContracts.get(
  "/:id/editor-config",
  verifyToken,
  getContractEditorConfigHandler,
);

routerContracts.get("/:id", verifyToken, getContractDetailHandler);

routerContracts.get("/:id/file", verifyToken, downloadContractFileHandler);

routerContracts.post(
  "/:id/file",
  verifyToken,
  requirePermission("HR.CONTRACT_MANAGE"),
  requirePermission("HR.PROFILE_MANAGE"),
  handleContractFileUpload,
  uploadContractFileHandler,
);

routerContracts.post(
  "/:id/submit-approval",
  verifyToken,
  requirePermission("HR.CONTRACT_MANAGE"),
  requirePermission("HR.PROFILE_MANAGE"),
  submitContractApprovalHandler,
);

routerContracts.post(
  "/",
  verifyToken,
  requirePermission("HR.CONTRACT_MANAGE"),
  requirePermission("HR.PROFILE_MANAGE"),
  createContractHandler,
);

routerContracts.put(
  "/:id/terminate",
  verifyToken,
  requirePermission("HR.CONTRACT_MANAGE"),
  requirePermission("HR.PROFILE_MANAGE"),
  terminateContractHandler,
);

export default routerContracts;
