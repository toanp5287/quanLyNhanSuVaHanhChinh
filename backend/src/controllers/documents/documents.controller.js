import {
  createDocumentFromTemplate,
  deleteDocument,
  deleteDocumentFile,
  deleteDocumentVersion,
  downloadDocumentFile,
  exportDocumentFile,
  getDocument,
  getDocumentVersion,
  listDocumentFiles,
  listDocumentVersions,
  listDocuments,
  listTemplateCatalog,
  restoreDocumentVersion,
  saveDocumentContent,
  updateDocumentAndCreateVersion,
  viewDocumentFile,
} from "../../services/documents/documents.service.js";

const handle = (operation, message, status = 200) => async (req, res) => {
  try {
    return res
      .status(status)
      .json({ success: true, message, data: await operation(req) });
  } catch (error) {
    if (!error.status) console.error(message, error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : "Không thể xử lý văn bản",
    });
  }
};

const sendFile = (operation, mode) => async (req, res) => {
  try {
    const file = await operation(req);
    const disposition = mode === "download" ? "attachment" : "inline";
    const asciiName = String(file.file_name || "van-ban")
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_");
    const encodedName = encodeURIComponent(file.file_name || "van-ban").replace(
      /['()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );

    res.setHeader("Content-Type", file.mime_type);
    res.setHeader("Content-Length", String(file.file_data.length));
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
    );

    return res.status(200).end(file.file_data);
  } catch (error) {
    if (!error.status) console.error("Đọc file văn bản", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : "Không thể đọc file văn bản",
    });
  }
};

export const getTemplates = handle(() => listTemplateCatalog(), "Danh sách mẫu văn bản");

export const postDocumentFromTemplate = handle(
  (req) => createDocumentFromTemplate(req.user, req.body),
  "Đã tạo văn bản từ mẫu",
  201,
);

export const getDocuments = handle(
  (req) => listDocuments(req.user, req.query),
  "Danh sách văn bản",
);

export const getDocumentDetail = handle(
  (req) => getDocument(req.user, req.params.id),
  "Chi tiết văn bản",
);

export const patchDocumentContent = handle(
  (req) => saveDocumentContent(req.user, req.params.id, req.body),
  "Đã lưu nội dung văn bản",
);

export const putDocument = handle(
  (req) => updateDocumentAndCreateVersion(req.user, req.params.id, req.body),
  "Đã cập nhật văn bản và tạo phiên bản mới",
);

export const postRestoreVersion = handle(
  (req) => restoreDocumentVersion(req.user, req.params.id, req.params.versionId),
  "Đã khôi phục phiên bản văn bản",
);

export const deleteVersion = handle(
  (req) => deleteDocumentVersion(req.user, req.params.id, req.params.versionId),
  "Đã xóa phiên bản văn bản",
);

export const deleteDocumentById = handle(
  (req) => deleteDocument(req.user, req.params.id),
  "Đã lưu văn bản vào kho lưu trữ",
);

export const getVersions = handle(
  (req) => listDocumentVersions(req.user, req.params.id),
  "Danh sách phiên bản văn bản",
);

export const getVersion = handle(
  (req) => getDocumentVersion(req.user, req.params.id, req.params.versionId),
  "Chi tiết phiên bản văn bản",
);

export const postExportFile = handle(
  (req) => exportDocumentFile(req.user, req.params.id, req.body),
  "Đã xuất và lưu file văn bản",
  201,
);

export const getFiles = handle(
  (req) => listDocumentFiles(req.user, req.params.id),
  "Danh sách file văn bản",
);

export const viewFile = sendFile(
  (req) => viewDocumentFile(req.user, req.params.id, req.params.fileId),
  "view",
);

export const downloadFile = sendFile(
  (req) => downloadDocumentFile(req.user, req.params.id, req.params.fileId),
  "download",
);

export const deleteFile = handle(
  (req) => deleteDocumentFile(req.user, req.params.id, req.params.fileId),
  "Đã xóa file văn bản",
);
