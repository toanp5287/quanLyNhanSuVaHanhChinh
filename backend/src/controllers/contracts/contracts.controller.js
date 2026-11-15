import {
  createContract,
  getContractFilterOptions,
  getContractList,
  getContractSummary,
  getSuggestedContractCode,
  terminateContract,
  validateContractFilters,
  validateContractPayload,
} from "../../services/contracts/contracts.service.js";
import { hasPermission } from "../../utils/helper.js";

const canManageContracts = (user) =>
  hasPermission(user?.permissions, "HR.CONTRACT_MANAGE") &&
  hasPermission(user?.permissions, "HR.PROFILE_MANAGE");

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
