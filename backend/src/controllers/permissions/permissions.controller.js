import {
  getPermissionMatrix,
  updateRolePermissions,
} from "../../services/permissions/permissions.service.js";

export const getMatrix = async (req, res) => {
  try {
    const data = await getPermissionMatrix();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Lỗi tải ma trận phân quyền:", error);
    return res.status(500).json({
      success: false,
      message: "Không thể tải dữ liệu phân quyền",
    });
  }
};

export const updateRole = async (req, res) => {
  try {
    const { roleId } = req.params;
    const { permission_ids: permissionIds } = req.body || {};

    if (!Array.isArray(permissionIds)) {
      return res.status(400).json({
        success: false,
        message: "Danh sách quyền không hợp lệ",
      });
    }

    const result = await updateRolePermissions(roleId, permissionIds);

    if (result.notFound) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy vai trò",
      });
    }

    if (result.invalid) {
      return res.status(400).json({
        success: false,
        message: "Có quyền không tồn tại trong hệ thống",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Cập nhật phân quyền thành công",
      data: result,
    });
  } catch (error) {
    console.error("Lỗi cập nhật phân quyền:", error);
    return res.status(500).json({
      success: false,
      message: "Không thể cập nhật phân quyền",
    });
  }
};
