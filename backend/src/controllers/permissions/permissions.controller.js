import {
  getPermissionMatrix,
  updateRolePermissions,
  updateRoleScope,
} from "../../services/permissions/permissions.service.js";
import {
  updateRolePermissionsSchema,
  updateRoleScopeSchema,
  validationMessage,
} from "../../validators/rbac.validator.js";

const sendError = (res, error, label) => {
  const status = Number(error?.status) || 500;
  if (status < 500) {
    return res.status(status).json({
      success: false,
      message: error?.message || "Yêu cầu không hợp lệ",
      code: error?.code || null,
    });
  }

  console.error(label, error);
  return res.status(500).json({
    success: false,
    message: "Không thể hoàn tất yêu cầu",
  });
};

export const getMatrix = async (req, res) => {
  try {
    const data = await getPermissionMatrix();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, error, "Lỗi tải ma trận phân quyền:");
  }
};

export const updateRole = async (req, res) => {
  const parsed = updateRolePermissionsSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: validationMessage(parsed.error),
      code: "VALIDATION_ERROR",
    });
  }

  try {
    const data = await updateRolePermissions(req.params.roleId, parsed.data.permission_ids);
    return res.status(200).json({
      success: true,
      message: "Cập nhật phân quyền thành công",
      data,
    });
  } catch (error) {
    return sendError(res, error, "Lỗi cập nhật phân quyền:");
  }
};

export const updateRolePermissionsHandler = updateRole;

export const updateRoleScopeHandler = async (req, res) => {
  const parsed = updateRoleScopeSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: validationMessage(parsed.error),
      code: "VALIDATION_ERROR",
    });
  }

  try {
    const data = await updateRoleScope(req.params.roleId, parsed.data.data_scope);
    return res.status(200).json({
      success: true,
      message: "Cập nhật phạm vi dữ liệu thành công",
      data,
    });
  } catch (error) {
    return sendError(res, error, "Lỗi cập nhật phạm vi dữ liệu:");
  }
};
