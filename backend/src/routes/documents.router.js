import express from "express";
import {
  deleteDocumentById,
  deleteFile,
  deleteVersion,
  downloadFile,
  getDocumentDetail,
  getFiles,
  getTemplates,
  getVersion,
  getVersions,
  getDocuments,
  patchDocumentContent,
  postDocumentFromTemplate,
  postExportFile,
  postRestoreVersion,
  putDocument,
  viewFile,
} from "../controllers/documents/documents.controller.js";
import { verifyToken } from "../middlewares/auth.middleware.js";

const routerDocuments = express.Router();

routerDocuments.use(verifyToken);

routerDocuments.get("/templates", getTemplates);
routerDocuments.post("/from-template", postDocumentFromTemplate);
routerDocuments.get("/", getDocuments);
routerDocuments.get("/:id", getDocumentDetail);
routerDocuments.patch("/:id/content", patchDocumentContent);
routerDocuments.put("/:id", putDocument);
routerDocuments.delete("/:id", deleteDocumentById);
routerDocuments.get("/:id/versions", getVersions);
routerDocuments.get("/:id/versions/:versionId", getVersion);
routerDocuments.post("/:id/versions/:versionId/restore", postRestoreVersion);
routerDocuments.delete("/:id/versions/:versionId", deleteVersion);
routerDocuments.post("/:id/export", postExportFile);
routerDocuments.get("/:id/files", getFiles);
routerDocuments.get("/:id/files/:fileId/view", viewFile);
routerDocuments.get("/:id/files/:fileId/download", downloadFile);
routerDocuments.delete("/:id/files/:fileId", deleteFile);

export default routerDocuments;
