import {
  approveExplanation,
  cancelExplanation,
  checkIn,
  checkOut,
  createShiftAssignment,
  createWorkShift,
  deleteShiftAssignment,
  getTodayStatus,
  listAttendanceByDate,
  listExplanations,
  listShiftAssignments,
  listWorkShifts,
  quickMarkAll,
  quickMarkAttendance,
  rejectExplanation,
  submitExplanation,
  updateShiftAssignment,
  updateWorkShift,
  validateShiftPayload,
} from "../../services/diem-danh-nhat-ky-quet-the-phan-ca/diemDanhNhatKyQuetThePhanCa.service.js";

const getEmployeeId = (req) => req.user?.employee_id;

const respondError = (res, error, fallback) => {
  if (!error.status) console.error(fallback, error);
  return res.status(error.status || 500).json({
    success: false,
    message: error.status ? error.message : fallback,
  });
};

export const attendanceCheckIn = async (req, res) => {
  try {
    const employeeId = getEmployeeId(req);
    if (!employeeId) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Tài khoản chưa liên kết hồ sơ nhân sự",
        });
    }

    const result = await checkIn(employeeId, {
      source: req.body?.source || "FACE_ID",
      face_confidence: req.body?.face_confidence,
      face_samples: req.body?.face_samples,
      face_match_mode: req.body?.face_match_mode || "COSINE",
      ip: req.ip,
      note: req.body?.note,
    });

    if (result.error === "ALREADY_CHECKED_IN") {
      return res
        .status(409)
        .json({
          success: false,
          message: "Đã chấm công vào ca hôm nay",
          data: result.log,
        });
    }
    if (result.error) {
      return res
        .status(400)
        .json({ success: false, message: "Không thể chấm công vào ca" });
    }

    return res
      .status(200)
      .json({
        success: true,
        message: "Chấm công vào ca thành công",
        data: result,
      });
  } catch (error) {
    console.error("Lỗi chấm công vào ca:", error);
    return res
      .status(error.status || 500)
      .json({
        success: false,
        message: error.status
          ? error.message
          : "Có lỗi xảy ra khi chấm công vào ca",
      });
  }
};

export const attendanceCheckOut = async (req, res) => {
  try {
    const employeeId = getEmployeeId(req);
    if (!employeeId) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Tài khoản chưa liên kết hồ sơ nhân sự",
        });
    }

    const result = await checkOut(employeeId, {
      source: req.body?.source || "FACE_ID",
      face_confidence: req.body?.face_confidence,
      face_samples: req.body?.face_samples,
      face_match_mode: req.body?.face_match_mode || "COSINE",
      ip: req.ip,
      note: req.body?.note,
    });

    if (result.error === "NO_CHECK_IN") {
      return res
        .status(400)
        .json({ success: false, message: "Chưa chấm công vào ca hôm nay" });
    }
    if (result.error === "ALREADY_CHECKED_OUT") {
      return res
        .status(409)
        .json({
          success: false,
          message: "Đã chấm công tan ca hôm nay",
          data: result.log,
        });
    }
    if (result.error) {
      return res
        .status(400)
        .json({ success: false, message: "Không thể chấm công tan ca" });
    }

    return res
      .status(200)
      .json({
        success: true,
        message: "Chấm công tan ca thành công",
        data: result,
      });
  } catch (error) {
    console.error("Lỗi chấm công tan ca:", error);
    return res
      .status(error.status || 500)
      .json({
        success: false,
        message: error.status
          ? error.message
          : "Có lỗi xảy ra khi chấm công tan ca",
      });
  }
};

export const attendanceToday = async (req, res) => {
  try {
    const employeeId = getEmployeeId(req);
    if (!employeeId) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Tài khoản chưa liên kết hồ sơ nhân sự",
        });
    }
    const data = await getTodayStatus(employeeId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Lỗi lấy trạng thái chấm công:", error);
    return res.status(500).json({ success: false, message: "Có lỗi xảy ra" });
  }
};

export const attendanceList = async (req, res) => {
  try {
    const data = await listAttendanceByDate(req.query?.date, req.user);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Lỗi lấy danh sách chấm công:", error);
    return res
      .status(error.status || 500)
      .json({
        success: false,
        message: error.status
          ? error.message
          : "Không thể tải danh sách chấm công",
      });
  }
};

export const attendanceQuickMark = async (req, res) => {
  try {
    const { employee_id, date, type } = req.body || {};
    const result = await quickMarkAttendance(
      Number(employee_id),
      date,
      type || "PRESENT",
      req.user,
    );
    if (result.error === "FORBIDDEN") {
      return res
        .status(403)
        .json({
          success: false,
          message: "Không có quyền thao tác nhân viên này",
        });
    }
    return res
      .status(200)
      .json({ success: true, message: "Đã cập nhật chấm công", data: result });
  } catch (error) {
    console.error("Lỗi cập nhật chấm công:", error);
    return res
      .status(error.status || 500)
      .json({
        success: false,
        message: error.status ? error.message : "Không thể cập nhật chấm công",
      });
  }
};

export const attendanceQuickMarkAll = async (req, res) => {
  try {
    const { department_id, date } = req.body || {};
    const result = await quickMarkAll(
      department_id ? Number(department_id) : null,
      date,
      req.user,
    );
    return res
      .status(200)
      .json({ success: true, message: "Đã chấm công hàng loạt", data: result });
  } catch (error) {
    console.error("Lỗi chấm công hàng loạt:", error);
    return res
      .status(error.status || 500)
      .json({
        success: false,
        message: error.status ? error.message : "Không thể điểm danh hàng loạt",
      });
  }
};

export const getWorkShifts = async (req, res) => {
  try {
    return res
      .status(200)
      .json({ success: true, data: await listWorkShifts() });
  } catch (error) {
    return respondError(res, error, "Không thể tải danh mục ca làm việc");
  }
};

export const postWorkShift = async (req, res) => {
  try {
    const { payload, error } = validateShiftPayload(req.body || {});
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await createWorkShift(payload);
    return res
      .status(201)
      .json({ success: true, message: "Tạo ca làm việc thành công", data });
  } catch (error) {
    return respondError(res, error, "Không thể tạo ca làm việc");
  }
};

export const putWorkShift = async (req, res) => {
  try {
    const { payload, error } = validateShiftPayload(req.body || {});
    if (error) return res.status(400).json({ success: false, message: error });
    const data = await updateWorkShift(req.params.id, payload);
    return res
      .status(200)
      .json({
        success: true,
        message: "Cập nhật ca làm việc thành công",
        data,
      });
  } catch (error) {
    return respondError(res, error, "Không thể cập nhật ca làm việc");
  }
};

export const getShiftAssignments = async (req, res) => {
  try {
    const data = await listShiftAssignments(req.user, req.query || {});
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return respondError(res, error, "Không thể tải danh sách phân ca");
  }
};

export const postShiftAssignment = async (req, res) => {
  try {
    const data = await createShiftAssignment(req.user, req.body || {});
    return res
      .status(201)
      .json({ success: true, message: "Phân ca thành công", data });
  } catch (error) {
    return respondError(res, error, "Không thể phân ca cho nhân viên");
  }
};

export const putShiftAssignment = async (req, res) => {
  try {
    const data = await updateShiftAssignment(
      req.user,
      req.params.id,
      req.body || {},
    );
    return res
      .status(200)
      .json({ success: true, message: "Cập nhật phân ca thành công", data });
  } catch (error) {
    return respondError(res, error, "Không thể cập nhật phân ca");
  }
};

export const removeShiftAssignment = async (req, res) => {
  try {
    const data = await deleteShiftAssignment(req.user, req.params.id);
    return res
      .status(200)
      .json({ success: true, message: "Đã xóa phân ca", data });
  } catch (error) {
    return respondError(res, error, "Không thể xóa phân ca");
  }
};

export const getExplanations = async (req, res) => {
  try {
    const data = await listExplanations(req.user, req.query || {});
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return respondError(res, error, "Không thể tải danh sách giải trình công");
  }
};

export const postExplanation = async (req, res) => {
  try {
    const data = await submitExplanation(req.user, req.body || {});
    return res
      .status(201)
      .json({ success: true, message: "Đã gửi giải trình công", data });
  } catch (error) {
    return respondError(res, error, "Không thể gửi giải trình công");
  }
};

export const approveExplanationHandler = async (req, res) => {
  try {
    const data = await approveExplanation(
      req.user,
      req.params.id,
      req.body || {},
    );
    return res
      .status(200)
      .json({ success: true, message: "Đã duyệt giải trình công", data });
  } catch (error) {
    return respondError(res, error, "Không thể duyệt giải trình công");
  }
};

export const rejectExplanationHandler = async (req, res) => {
  try {
    const data = await rejectExplanation(
      req.user,
      req.params.id,
      req.body || {},
    );
    return res
      .status(200)
      .json({ success: true, message: "Đã từ chối giải trình công", data });
  } catch (error) {
    return respondError(res, error, "Không thể từ chối giải trình công");
  }
};

export const cancelExplanationHandler = async (req, res) => {
  try {
    const data = await cancelExplanation(req.user, req.params.id);
    return res
      .status(200)
      .json({ success: true, message: "Đã hủy giải trình công", data });
  } catch (error) {
    return respondError(res, error, "Không thể hủy giải trình công");
  }
};
