import {
  createDepartment,
  createPosition,
  getDepartmentDetail,
  getOrganizationData,
  updateDepartment,
  updatePosition,
  validateDepartmentPayload,
  validatePositionPayload,
} from "../../services/organization/organization.service.js";

const parseId = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

export const listOrganization = async (req, res) => {
  const user = req.user;

  if (user?.data_scope === "SELF") {
    return res.status(403).json({
      success: false,
      message: "Tài khoản của bạn không có quyền xem cơ cấu tổ chức",
    });
  }

  try {
    const data = await getOrganizationData(user);

    return res.status(200).json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error("Lỗi lấy cơ cấu tổ chức:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi lấy cơ cấu tổ chức",
    });
  }
};

export const getDepartmentDetailHandler = async (req, res) => {
  const departmentId = parseId(req.params.id);

  if (!departmentId) {
    return res.status(400).json({
      success: false,
      message: "Phòng ban cần xem không hợp lệ",
    });
  }

  if (req.user?.data_scope === "SELF") {
    return res.status(403).json({
      success: false,
      message: "Tài khoản của bạn không có quyền xem cơ cấu tổ chức",
    });
  }

  try {
    const data = await getDepartmentDetail(req.user, departmentId);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phòng ban trong phạm vi dữ liệu được phép",
      });
    }

    return res.status(200).json({
      success: true,
      data_scope: req.user.data_scope,
      ...data,
    });
  } catch (error) {
    console.error("Lỗi lấy chi tiết phòng ban:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi lấy chi tiết phòng ban",
    });
  }
};

export const createDepartmentHandler = async (req, res) => {
  const { payload, error } = validateDepartmentPayload(req.body || {});

  if (error) {
    return res.status(400).json({ success: false, message: error });
  }

  try {
    const result = await createDepartment(req.user, payload);

    if (result.notFound) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phạm vi dữ liệu được phép",
      });
    }

    if (result.duplicateCode) {
      return res.status(409).json({
        success: false,
        message: "Mã phòng ban đã tồn tại",
      });
    }

    if (result.invalidParent) {
      return res.status(400).json({
        success: false,
        message: "Phòng ban cấp trên không hợp lệ",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Tạo phòng ban thành công",
      department_id: result.department_id,
    });
  } catch (error) {
    console.error("Lỗi tạo phòng ban:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi tạo phòng ban",
    });
  }
};

export const updateDepartmentHandler = async (req, res) => {
  const departmentId = parseId(req.params.id);

  if (!departmentId) {
    return res.status(400).json({
      success: false,
      message: "Phòng ban cần cập nhật không hợp lệ",
    });
  }

  const { payload, error } = validateDepartmentPayload(req.body || {});

  if (error) {
    return res.status(400).json({ success: false, message: error });
  }

  try {
    const result = await updateDepartment(req.user, departmentId, payload);

    if (result.notFound) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy phòng ban trong phạm vi dữ liệu được phép",
      });
    }

    if (result.duplicateCode) {
      return res.status(409).json({
        success: false,
        message: "Mã phòng ban đã tồn tại",
      });
    }

    if (result.invalidParent) {
      return res.status(400).json({
        success: false,
        message:
          "Phòng ban cấp trên không hợp lệ hoặc tạo thành vòng lặp cây tổ chức",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Cập nhật phòng ban thành công",
      department_id: result.department_id,
    });
  } catch (error) {
    console.error("Lỗi cập nhật phòng ban:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi cập nhật phòng ban",
    });
  }
};

export const createPositionHandler = async (req, res) => {
  const { payload, error } = validatePositionPayload(req.body || {});

  if (error) {
    return res.status(400).json({ success: false, message: error });
  }

  try {
    const result = await createPosition(req.user, payload);

    if (result.invalidDepartment) {
      return res.status(400).json({
        success: false,
        message: "Phòng ban không hợp lệ hoặc ngoài phạm vi dữ liệu",
      });
    }

    if (result.duplicateCode) {
      return res.status(409).json({
        success: false,
        message: "Mã chức vụ đã tồn tại",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Tạo chức vụ và mô tả công việc thành công",
      position_id: result.position_id,
    });
  } catch (error) {
    console.error("Lỗi tạo chức vụ:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi tạo chức vụ",
    });
  }
};

export const updatePositionHandler = async (req, res) => {
  const positionId = parseId(req.params.id);

  if (!positionId) {
    return res.status(400).json({
      success: false,
      message: "Chức vụ cần cập nhật không hợp lệ",
    });
  }

  const { payload, error } = validatePositionPayload(req.body || {});

  if (error) {
    return res.status(400).json({ success: false, message: error });
  }

  try {
    const result = await updatePosition(req.user, positionId, payload);

    if (result.notFound) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy chức vụ trong phạm vi dữ liệu được phép",
      });
    }

    if (result.invalidDepartment) {
      return res.status(400).json({
        success: false,
        message: "Phòng ban không hợp lệ hoặc ngoài phạm vi dữ liệu",
      });
    }

    if (result.duplicateCode) {
      return res.status(409).json({
        success: false,
        message: "Mã chức vụ đã tồn tại",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Cập nhật chức vụ và mô tả công việc thành công",
      position_id: result.position_id,
    });
  } catch (error) {
    console.error("Lỗi cập nhật chức vụ:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi cập nhật chức vụ",
    });
  }
};
