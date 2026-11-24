import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";

import {
  createContract,
  createDraftContract,
  getActiveContractTemplates,
  getContractAccessContext,
  getContractDetail,
  getContractEditorConfig,
  getContractFile,
  getContractFileForToken,
  getContractFileVersion,
  getContractFileVersions,
  getContractOfficialFile,
  getContractSignatures,
  getContractTemplateEditorConfig,
  getContractTemplateFile,
  getContractTemplatePreview,
  getContractFilterOptions,
  getContractList,
  getContractSummary,
  getMyOfficialContractEditorConfig,
  getMyOfficialContractFile,
  getMyOfficialContracts,
  getSuggestedContractCode,
  canApproveContracts,
  requestContractSigningRevision,
  reviewContractApproval,
  saveContractFile,
  signContract,
  saveContractTemplate,
  saveOnlyOfficeCallbackFile,
  saveOnlyOfficeTemplateCallbackFile,
  submitContractApproval,
  terminateContract,
  validateContractFilters,
  validateContractPayload,
  validateDraftContractPayload,
} from "../../services/contracts/contracts.service.js";
import { hasPermission } from "../../utils/helper.js";

const canManageContracts = (user) =>
  hasPermission(user?.permissions, "HR.CONTRACT_MANAGE") &&
  hasPermission(user?.permissions, "HR.PROFILE_MANAGE");

const removeUploadedFile = (file) => {
  if (file?.path) {
    fs.promises.unlink(file.path).catch(() => {});
  }
};

const parseTemplateId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const parseContractId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const safeFileName = (value) =>
  String(value || "hop-dong").replace(/["\r\n]/g, "_");

const getDocJwtSecret = () =>
  process.env.ONLYOFFICE_JWT_SECRET || process.env.JWT_SECRET || "";

export const listContracts = async (req, res) => {
  const { filters, error } = validateContractFilters(req.query);

  if (error) {
    return res.status(400).json({ success: false, message: error });
  }

  try {
    const user = req.user;
    const canManage = canManageContracts(user);

    const [contracts, summary, options] = await Promise.all([
      getContractList(user, filters),
      getContractSummary(user, filters),
      getContractFilterOptions(user, canManage),
    ]);

    const suggestedContractCode = canManage
      ? await getSuggestedContractCode()
      : null;

    return res.status(200).json({
      success: true,
      data_scope: user.data_scope,
      can_manage: canManage,
      can_approve: canApproveContracts(user),
      can_sign: hasPermission(user?.permissions, "HR.CONTRACT_SIGN"),
      total: contracts.length,
      summary,
      suggested_contract_code: suggestedContractCode,
      filters: options,
      contracts,
    });
  } catch (error) {
    console.error("Lỗi lấy danh sách hợp đồng:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi lấy danh sách hợp đồng",
    });
  }
};

export const getContractDetailHandler = async (req, res) => {
  const contractId = parseContractId(req.params.id);

  if (!contractId) {
    return res.status(400).json({
      success: false,
      message: "Hợp đồng không hợp lệ",
    });
  }

  try {
    const result = await getContractDetail(req.user, contractId);

    if (result.notFound || result.forbidden) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hợp đồng trong phạm vi dữ liệu được phép",
      });
    }

    return res.status(200).json({
      success: true,
      can_manage: canManageContracts(req.user),
      contract: result.contract,
      file: result.file,
      versions: result.versions || [],
      history: result.history,
      submissions: result.submissions || [],
      approval: result.approval,
      permissions: result.permissions,
      signing: result.signing || null,
    });
  } catch (error) {
    console.error("Lỗi lấy chi tiết hợp đồng:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi lấy chi tiết hợp đồng",
    });
  }
};

export const downloadContractFileHandler = async (req, res) => {
  const contractId = parseContractId(req.params.id);

  if (!contractId) {
    return res.status(400).json({
      success: false,
      message: "Hợp đồng không hợp lệ",
    });
  }

  try {
    const result = await getContractFile(req.user, contractId);

    if (result.notFound || result.forbidden) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hợp đồng trong phạm vi dữ liệu được phép",
      });
    }

    if (result.missingFile) {
      return res.status(404).json({
        success: false,
        message: "Hợp đồng này chưa có file đính kèm",
      });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.download(result.filePath, result.fileName);
  } catch (error) {
    console.error("Lỗi tải file hợp đồng:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi tải file hợp đồng",
    });
  }
};

export const listContractVersionsHandler = async (req, res) => {
  const contractId = parseContractId(req.params.id);

  if (!contractId) {
    return res.status(400).json({
      success: false,
      message: "Hợp đồng không hợp lệ",
    });
  }

  try {
    const context = await getContractAccessContext(req.user, contractId);
    if (context.notFound || !context.permissions.canView) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hợp đồng trong phạm vi dữ liệu được phép",
      });
    }

    const versions = await getContractFileVersions(contractId);
    return res.status(200).json({ success: true, versions });
  } catch (error) {
    console.error("Lỗi lấy danh sách phiên bản hợp đồng:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi lấy danh sách phiên bản hợp đồng",
    });
  }
};

export const downloadContractVersionHandler = async (req, res) => {
  const contractId = parseContractId(req.params.id);
  const fileId = parseContractId(req.params.fileId);

  if (!contractId || !fileId) {
    return res.status(400).json({
      success: false,
      message: "Phiên bản hợp đồng không hợp lệ",
    });
  }

  try {
    const result = await getContractFileVersion(req.user, contractId, fileId);

    if (result.notFound || result.forbidden || result.missingFile) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phiên bản file hợp đồng",
      });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.download(result.filePath, result.fileName);
  } catch (error) {
    console.error("Lỗi tải phiên bản file hợp đồng:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi tải phiên bản file hợp đồng",
    });
  }
};

export const downloadContractOfficialFileHandler = async (req, res) => {
  const contractId = parseContractId(req.params.id);

  if (!contractId) {
    return res.status(400).json({
      success: false,
      message: "Hợp đồng không hợp lệ",
    });
  }

  try {
    const result = await getContractOfficialFile(req.user, contractId);

    if (result.notFound || result.forbidden) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hợp đồng trong phạm vi dữ liệu được phép",
      });
    }

    if (result.missingFile) {
      return res.status(404).json({
        success: false,
        message: "Hợp đồng này chưa có bản hợp đồng chính thức",
      });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.download(result.filePath, result.fileName);
  } catch (error) {
    console.error("Lỗi tải bản hợp đồng chính thức:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi tải bản hợp đồng chính thức",
    });
  }
};

export const listMyOfficialContracts = async (_req, res) => {
  try {
    const result = await getMyOfficialContracts(_req.user);

    if (result.missingEmployee) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được nhân viên từ phiên đăng nhập",
      });
    }

    return res.status(200).json({
      success: true,
      data_scope: "SELF",
      total: result.contracts.length,
      contracts: result.contracts,
    });
  } catch (error) {
    console.error("Lỗi lấy hợp đồng chính thức của nhân viên:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi lấy hợp đồng của bạn",
    });
  }
};

export const viewMyOfficialContractFileHandler = async (req, res) => {
  const contractId = parseContractId(req.params.id);

  if (!contractId) {
    return res.status(400).json({
      success: false,
      message: "Hợp đồng không hợp lệ",
    });
  }

  try {
    const result = await getMyOfficialContractFile(req.user, contractId);

    if (result.missingEmployee) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được nhân viên từ phiên đăng nhập",
      });
    }

    if (result.notFound) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hợp đồng trong phạm vi dữ liệu được phép",
      });
    }

    if (result.missingFile) {
      return res.status(404).json({
        success: false,
        message: "Hợp đồng này chưa có bản hợp đồng chính thức",
      });
    }

    const fileName = safeFileName(result.fileName);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", result.mimeType || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
    );
    return res.sendFile(result.filePath);
  } catch (error) {
    console.error("Lỗi xem bản hợp đồng chính thức:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi xem hợp đồng",
    });
  }
};

export const downloadMyOfficialContractFileHandler = async (req, res) => {
  const contractId = parseContractId(req.params.id);

  if (!contractId) {
    return res.status(400).json({
      success: false,
      message: "Hợp đồng không hợp lệ",
    });
  }

  try {
    const result = await getMyOfficialContractFile(req.user, contractId);

    if (result.missingEmployee) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được nhân viên từ phiên đăng nhập",
      });
    }

    if (result.notFound) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hợp đồng trong phạm vi dữ liệu được phép",
      });
    }

    if (result.missingFile) {
      return res.status(404).json({
        success: false,
        message: "Hợp đồng này chưa có bản hợp đồng chính thức",
      });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.download(result.filePath, result.fileName);
  } catch (error) {
    console.error("Lỗi tải bản hợp đồng chính thức của nhân viên:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi tải hợp đồng",
    });
  }
};

export const getMyOfficialContractEditorConfigHandler = async (req, res) => {
  const contractId = parseContractId(req.params.id);

  if (!contractId) {
    return res.status(400).json({
      success: false,
      message: "Hợp đồng không hợp lệ",
    });
  }

  try {
    const result = await getMyOfficialContractEditorConfig(req.user, contractId);

    if (result.missingEmployee) {
      return res.status(403).json({
        success: false,
        message: "Không xác định được nhân viên từ phiên đăng nhập",
      });
    }

    if (result.notFound || result.forbidden) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hợp đồng trong phạm vi dữ liệu được phép",
      });
    }

    if (result.missingFile) {
      return res.status(404).json({
        success: false,
        message: "Hợp đồng này chưa có bản hợp đồng chính thức",
      });
    }

    if (result.unsupported) {
      return res.status(400).json({
        success: false,
        message: "Chỉ hỗ trợ xem trực tiếp file DOCX trên trình xem tài liệu",
      });
    }

    if (result.disabled) {
      return res.status(503).json({
        success: false,
        onlyoffice_configured: false,
        message: "ONLYOFFICE chưa được cấu hình",
      });
    }

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("Lỗi tạo trình xem hợp đồng chính thức:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi mở trình xem tài liệu",
    });
  }
};

export const listContractSignaturesHandler = async (req, res) => {
  const contractId = parseContractId(req.params.id);

  if (!contractId) {
    return res.status(400).json({
      success: false,
      message: "Hợp đồng không hợp lệ",
    });
  }

  try {
    const context = await getContractAccessContext(req.user, contractId);
    if (context.notFound || !context.permissions.canView) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hợp đồng trong phạm vi dữ liệu được phép",
      });
    }

    const signatures = await getContractSignatures(contractId);
    return res.status(200).json({ success: true, signatures });
  } catch (error) {
    console.error("Lỗi lấy lịch sử ký hợp đồng:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi lấy lịch sử ký hợp đồng",
    });
  }
};

export const signContractHandler = async (req, res) => {
  const contractId = parseContractId(req.params.id);

  if (!contractId) {
    return res.status(400).json({
      success: false,
      message: "Hợp đồng không hợp lệ",
    });
  }

  try {
    const result = await signContract(req.user, contractId, req.body || {});

    if (result.notFound) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hợp đồng trong phạm vi dữ liệu được phép",
      });
    }

    if (result.forbidden || result.missingSigner) {
      return res.status(403).json({
        success: false,
        message: result.reason || "Bạn không có quyền ký hợp đồng",
      });
    }

    if (result.invalidState) {
      return res.status(409).json({
        success: false,
        message: "Hợp đồng không ở trạng thái chờ ký hoặc đã được xử lý",
        approval: result.approval || null,
      });
    }

    if (result.alreadySigned) {
      return res.status(409).json({
        success: false,
        message: "Hợp đồng đã được ký chính thức",
      });
    }

    if (result.missingFile) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy file hợp đồng đã được Giám đốc phê duyệt",
      });
    }

    if (result.confirmationRequired) {
      return res.status(422).json({
        success: false,
        message: "Vui lòng xác nhận trước khi ký hợp đồng",
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Đã ký chính thức hợp đồng. Đây là xác nhận nội bộ, không phải chữ ký số.",
      signature_id: result.signature_id,
      signed_at: result.signed_at,
      signer_id: result.signer_id,
      signer_name: result.signer_name,
      signer_role: result.signer_role,
      signature_method: result.signature_method,
      submission_id: result.submission_id,
      version_id: result.version_id,
      version_no: result.version_no,
      official_file_name: result.official_file_name,
      approval: result.approval,
      permissions: result.permissions,
    });
  } catch (error) {
    console.error("Lỗi ký hợp đồng:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi ký hợp đồng",
    });
  }
};

export const requestContractSigningRevisionHandler = async (req, res) => {
  const contractId = parseContractId(req.params.id);

  if (!contractId) {
    return res.status(400).json({
      success: false,
      message: "Hợp đồng không hợp lệ",
    });
  }

  try {
    const result = await requestContractSigningRevision(
      req.user,
      contractId,
      req.body || {},
    );

    if (result.notFound) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hợp đồng trong phạm vi dữ liệu được phép",
      });
    }

    if (result.forbidden || result.missingSigner) {
      return res.status(403).json({
        success: false,
        message: result.reason || "Bạn không có quyền yêu cầu chỉnh sửa hợp đồng",
      });
    }

    if (result.invalidState || result.alreadySigned) {
      return res.status(409).json({
        success: false,
        message: "Hợp đồng không ở trạng thái chờ ký hoặc đã được xử lý",
      });
    }

    if (result.validationErrors?.length) {
      return res.status(422).json({
        success: false,
        message: "Vui lòng cung cấp đầy đủ thông tin yêu cầu chỉnh sửa",
        errors: result.validationErrors,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Đã gửi yêu cầu chỉnh sửa cho HR",
      approval: result.approval,
      permissions: result.permissions,
    });
  } catch (error) {
    console.error("Lỗi gửi yêu cầu chỉnh sửa hợp đồng:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi gửi yêu cầu chỉnh sửa hợp đồng",
    });
  }
};

export const uploadContractFileHandler = async (req, res) => {
  const contractId = parseContractId(req.params.id);
  const fail = (status, message) => {
    removeUploadedFile(req.file);
    return res.status(status).json({ success: false, message });
  };

  if (!contractId) {
    return fail(400, "Hợp đồng không hợp lệ");
  }

  if (!req.file) {
    return fail(400, "Vui lòng chọn file DOCX hoặc PDF để upload");
  }

  if (!/\.(docx|pdf)$/i.test(path.extname(req.file.originalname || ""))) {
    return fail(400, "Chỉ chấp nhận file hợp đồng định dạng .docx hoặc .pdf");
  }

  try {
    const result = await saveContractFile(req.user, contractId, req.file);

    if (result.notFound) {
      return fail(
        404,
        "Không tìm thấy hợp đồng trong phạm vi dữ liệu được phép",
      );
    }

    if (result.forbidden) {
      return fail(
        403,
        "Trạng thái hợp đồng hiện tại không cho phép chỉnh sửa file",
      );
    }

    if (result.invalidFile) {
      return fail(400, "Chỉ chấp nhận file hợp đồng định dạng .docx hoặc .pdf");
    }

    return res.status(200).json({
      success: true,
      message: "Đã lưu file hợp đồng và cập nhật lịch sử",
      file: result.file,
    });
  } catch (error) {
    console.error("Lỗi lưu file hợp đồng:", error);
    return fail(500, "Có lỗi xảy ra khi lưu file hợp đồng");
  }
};

export const submitContractApprovalHandler = async (req, res) => {
  const contractId = parseContractId(req.params.id);

  if (!contractId) {
    return res.status(400).json({
      success: false,
      message: "Hợp đồng không hợp lệ",
    });
  }

  try {
    const result = await submitContractApproval(
      req.user,
      contractId,
      req.body?.note,
    );

    if (result.notFound) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hợp đồng trong phạm vi dữ liệu được phép",
      });
    }

    if (result.forbidden) {
      return res.status(403).json({
        success: false,
        message: result.reason || "Trạng thái hợp đồng hiện tại không cho phép gửi duyệt",
      });
    }

    if (result.alreadyPending) {
      return res.status(409).json({
        success: false,
        message: "Hợp đồng đã có yêu cầu duyệt đang chờ xử lý",
      });
    }

    if (result.staleVersion) {
      return res.status(422).json({
        success: false,
        message: result.reason || "Cần cập nhật file hợp đồng trước khi gửi duyệt lại",
      });
    }

    if (result.validationErrors?.length) {
      return res.status(422).json({
        success: false,
        message: "Hợp đồng chưa đủ điều kiện gửi Giám đốc duyệt",
        errors: result.validationErrors,
      });
    }

    if (result.missingCreator) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản chưa liên kết hồ sơ nhân sự để gửi duyệt",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Đã gửi hợp đồng cho Giám đốc phê duyệt",
      submissionId: result.submissionId,
      approvalRound: result.approvalRound,
      submittedAt: result.submittedAt,
      approval: result.approval,
      permissions: result.permissions,
    });
  } catch (error) {
    console.error("Lỗi gửi duyệt hợp đồng:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi gửi duyệt hợp đồng",
    });
  }
};

const handleContractReview = async (req, res, decision) => {
  const contractId = parseContractId(req.params.id);

  if (!contractId) {
    return res.status(400).json({
      success: false,
      message: "Hợp đồng không hợp lệ",
    });
  }

  try {
    const result = await reviewContractApproval(
      req.user,
      contractId,
      decision,
      req.body || {},
    );

    if (result.notFound) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hợp đồng trong phạm vi dữ liệu được phép",
      });
    }

    if (result.invalidDecision) {
      return res.status(400).json({
        success: false,
        message: "Quyết định phê duyệt không hợp lệ",
      });
    }

    if (result.forbidden || result.missingReviewer) {
      return res.status(403).json({
        success: false,
        message: "Chỉ Giám đốc được phê duyệt hợp đồng",
      });
    }

    if (result.invalidState) {
      return res.status(409).json({
        success: false,
        message: "Yêu cầu duyệt không còn hiệu lực hoặc đã được xử lý",
        approval: result.approval || null,
      });
    }

    if (result.validationErrors?.length) {
      return res.status(422).json({
        success: false,
        message:
          decision === "APPROVE"
            ? "Không thể phê duyệt hợp đồng"
            : "Vui lòng cung cấp đầy đủ thông tin từ chối",
        errors: result.validationErrors,
      });
    }

    return res.status(200).json({
      success: true,
      message:
        decision === "APPROVE"
          ? "Đã phê duyệt hợp đồng"
          : "Đã từ chối hợp đồng và gửi yêu cầu chỉnh sửa",
      decision: result.decision,
      submissionId: result.submissionId,
      approvalRound: result.approvalRound,
      decidedAt: result.decidedAt,
      approval: result.approval,
      permissions: result.permissions,
    });
  } catch (error) {
    console.error("Lỗi phê duyệt hợp đồng:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi phê duyệt hợp đồng",
    });
  }
};

export const approveContractApprovalHandler = (req, res) =>
  handleContractReview(req, res, "APPROVE");

export const rejectContractApprovalHandler = (req, res) =>
  handleContractReview(req, res, "REJECT");

export const getContractEditorConfigHandler = async (req, res) => {
  const contractId = parseContractId(req.params.id);

  if (!contractId) {
    return res.status(400).json({
      success: false,
      message: "Hợp đồng không hợp lệ",
    });
  }

  try {
    const result = await getContractEditorConfig(
      req.user,
      contractId,
      req.query.mode === "edit" ? "edit" : "view",
      parseContractId(req.query.versionId),
    );

    if (result.notFound || result.forbidden) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hợp đồng trong phạm vi dữ liệu được phép",
      });
    }

    if (result.missingFile) {
      return res.status(404).json({
        success: false,
        message: "Hợp đồng này chưa có file DOCX để xem",
      });
    }

    if (result.unsupported) {
      return res.status(400).json({
        success: false,
        message: "ONLYOFFICE chỉ hỗ trợ xem trực tiếp file DOCX",
      });
    }

    if (result.disabled) {
      return res.status(503).json({
        success: false,
        onlyoffice_configured: false,
        message: "ONLYOFFICE chưa được cấu hình",
      });
    }

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("Lỗi tạo cấu hình ONLYOFFICE:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi mở trình xem tài liệu",
    });
  }
};

export const getContractFileByTokenHandler = async (req, res) => {
  try {
    const result = await getContractFileForToken(req.params.token);

    if (result.invalidToken) {
      return res.status(401).json({ success: false, message: "Link không hợp lệ" });
    }

    const isTemplateFile = result.purpose === "template";

    if (result.notFound || result.forbidden) {
      return res.status(404).json({
        success: false,
        message: isTemplateFile
          ? "Không tìm thấy mẫu hợp đồng"
          : "Không tìm thấy file hợp đồng",
      });
    }

    if (result.missingFile) {
      return res.status(404).json({
        success: false,
        message: isTemplateFile
          ? "Mẫu hợp đồng này chưa có file"
          : "Hợp đồng này chưa có file đính kèm",
      });
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", result.mimeType || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
    );
    return res.sendFile(result.filePath);
  } catch (error) {
    console.error("Lỗi đọc file hợp đồng cho ONLYOFFICE:", error);
    return res.status(401).json({ success: false, message: "Link không hợp lệ" });
  }
};

export const onlyOfficeCallbackHandler = async (req, res) => {
  const secret = getDocJwtSecret();
  if (!secret) {
    return res.status(503).json({ error: 1, message: "Chưa cấu hình ONLYOFFICE" });
  }

  try {
    const payload = jwt.verify(String(req.query.token || ""), secret);
    const isTemplateCallback = payload?.purpose === "onlyoffice_template_edit";
    if (payload?.purpose !== "onlyoffice_edit" && !isTemplateCallback) {
      return res.status(401).json({ error: 1, message: "Token không hợp lệ" });
    }

    if (!req.body?.token) {
      return res.status(401).json({ error: 1, message: "Thiếu token ONLYOFFICE" });
    }
    const body = jwt.verify(String(req.body.token), secret);
    const result = isTemplateCallback
      ? await saveOnlyOfficeTemplateCallbackFile(payload, body)
      : await saveOnlyOfficeCallbackFile(payload, body);

    if (
      result.forbidden ||
      result.invalidUrl ||
      result.downloadFailed ||
      result.invalidFile ||
      result.notFound ||
      result.invalidToken
    ) {
      return res.status(403).json({ error: 1, message: "Không thể lưu file chỉnh sửa" });
    }

    return res.status(200).json({ error: 0 });
  } catch (error) {
    console.error("Lỗi callback ONLYOFFICE:", error);
    return res.status(401).json({ error: 1, message: "Callback không hợp lệ" });
  }
};

export const listContractTemplatesHandler = async (_req, res) => {
  try {
    const templates = await getActiveContractTemplates();

    return res.status(200).json({
      success: true,
      templates,
    });
  } catch (error) {
    console.error("Lỗi lấy mẫu hợp đồng:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi lấy danh sách mẫu hợp đồng",
    });
  }
};

export const uploadContractTemplateHandler = async (req, res) => {
  const fail = (status, message, extra = {}) => {
    removeUploadedFile(req.file);
    return res.status(status).json({ success: false, message, ...extra });
  };

  if (!req.file) {
    return fail(400, "Vui lòng chọn file DOCX để upload");
  }
  if (!/\.docx$/i.test(path.extname(req.file.originalname || ""))) {
    return fail(400, "Chỉ chấp nhận file mẫu định dạng .docx");
  }

  try {
    const result = await saveContractTemplate(
      req.user,
      req.body || {},
      req.file,
    );

    if (result.invalidType) {
      return fail(400, "Loại hợp đồng không hợp lệ");
    }

    if (result.needsReplace) {
      return fail(
        409,
        "Loại hợp đồng này đã có mẫu. Bạn có muốn thay thế mẫu hiện tại?",
        { needs_replace: true, template: result.template },
      );
    }

    return res.status(201).json({
      success: true,
      message: result.replaced
        ? "Đã thay thế mẫu hợp đồng thành công"
        : "Đã thêm mẫu hợp đồng thành công",
      template: result.template,
    });
  } catch (error) {
    console.error("Lỗi upload mẫu hợp đồng:", error);
    return fail(500, "Có lỗi xảy ra khi upload mẫu hợp đồng");
  }
};

export const getContractTemplateEditorConfigHandler = async (req, res) => {
  const templateId = parseTemplateId(req.params.id);

  if (!templateId) {
    return res.status(400).json({
      success: false,
      message: "Mẫu hợp đồng không hợp lệ",
    });
  }

  try {
    const result = await getContractTemplateEditorConfig(req.user, templateId);

    if (result.forbidden) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền chỉnh sửa mẫu hợp đồng",
      });
    }

    if (result.notFound || result.missingFile) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy file mẫu hợp đồng",
      });
    }

    if (result.disabled) {
      return res.status(503).json({
        success: false,
        onlyoffice_configured: false,
        message: "ONLYOFFICE chưa được cấu hình",
      });
    }

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("Lỗi tạo cấu hình ONLYOFFICE cho mẫu hợp đồng:", error);
    return res.status(500).json({
      success: false,
      message: "Không thể mở trình soạn thảo mẫu hợp đồng",
    });
  }
};

export const previewContractTemplateHandler = async (req, res) => {
  const templateId = parseTemplateId(req.params.id);

  if (!templateId) {
    return res.status(400).json({
      success: false,
      message: "Mẫu hợp đồng không hợp lệ",
    });
  }

  try {
    const result = await getContractTemplatePreview(templateId);

    if (result.notFound || result.missingFile) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy file mẫu hợp đồng",
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Lỗi đọc mẫu hợp đồng:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi đọc mẫu hợp đồng",
    });
  }
};

export const downloadContractTemplateHandler = async (req, res) => {
  const templateId = parseTemplateId(req.params.id);

  if (!templateId) {
    return res.status(400).json({
      success: false,
      message: "Mẫu hợp đồng không hợp lệ",
    });
  }

  try {
    const result = await getContractTemplateFile(templateId);

    if (result.notFound || result.missingFile) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy file mẫu hợp đồng",
      });
    }

    const fileName = /\.docx$/i.test(result.name)
      ? result.name
      : `${result.name}.docx`;
    return res.download(result.filePath, fileName);
  } catch (error) {
    console.error("Lỗi tải mẫu hợp đồng:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi tải mẫu hợp đồng",
    });
  }
};

export const createDraftContractHandler = async (req, res) => {
  const fail = (status, message) => {
    removeUploadedFile(req.file);
    return res.status(status).json({ success: false, message });
  };

  const { payload, error } = validateDraftContractPayload(
    req.body || {},
    req.file || null,
  );

  if (error) {
    return fail(400, error);
  }

  try {
    const result = await createDraftContract(req.user, payload, req.file || null);

    if (result.notFound) {
      return fail(
        404,
        "Không tìm thấy nhân viên trong phạm vi dữ liệu được phép",
      );
    }

    if (result.duplicateCode) {
      return fail(409, "Mã hợp đồng đã tồn tại, vui lòng kiểm tra lại");
    }

    if (result.invalidTemplate) {
      return fail(
        400,
        "Mẫu hợp đồng không tồn tại hoặc đã ngừng sử dụng",
      );
    }

    if (result.missingTemplateFields) {
      const fields = result.missingTemplateFields
        .map((field) => field.label)
        .join(", ");
      return fail(
        422,
        `Mẫu hợp đồng còn thiếu dữ liệu: ${fields}. Vui lòng bổ sung trước khi lưu.`,
      );
    }

    if (result.missingCreator) {
      return fail(
        403,
        "Tài khoản chưa liên kết hồ sơ nhân sự để tạo hợp đồng",
      );
    }

    return res.status(201).json({
      success: true,
      message: "Đã lưu hợp đồng ở trạng thái bản nháp",
      contract_id: result.contract_id,
      status: "DRAFT",
    });
  } catch (error) {
    console.error("Lỗi lưu bản nháp hợp đồng:", error);
    return fail(500, "Có lỗi xảy ra khi lưu bản nháp hợp đồng");
  }
};

export const createContractHandler = async (req, res) => {
  const { payload, error } = validateContractPayload(req.body || {});

  if (error) {
    return res.status(400).json({ success: false, message: error });
  }

  try {
    const result = await createContract(req.user, payload);

    if (result.notFound) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy nhân viên trong phạm vi dữ liệu được phép",
      });
    }

    if (result.duplicateCode) {
      return res.status(409).json({
        success: false,
        message: "Mã hợp đồng đã tồn tại, vui lòng kiểm tra lại",
      });
    }

    if (result.invalidReplacement) {
      return res.status(400).json({
        success: false,
        message: "Hợp đồng được chọn để gia hạn không hợp lệ",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Tạo hợp đồng lao động thành công",
      contract_id: result.contract_id,
    });
  } catch (error) {
    console.error("Lỗi tạo hợp đồng:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi tạo hợp đồng lao động",
    });
  }
};

export const terminateContractHandler = async (req, res) => {
  const contractId = Number(req.params.id);

  if (!Number.isInteger(contractId) || contractId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Hợp đồng cần thanh lý không hợp lệ",
    });
  }

  try {
    const result = await terminateContract(req.user, contractId);

    if (result.notFound) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hợp đồng trong phạm vi dữ liệu được phép",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Đã thanh lý hợp đồng lao động",
      contract_id: result.contract_id,
    });
  } catch (error) {
    console.error("Lỗi thanh lý hợp đồng:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi thanh lý hợp đồng lao động",
    });
  }
};
