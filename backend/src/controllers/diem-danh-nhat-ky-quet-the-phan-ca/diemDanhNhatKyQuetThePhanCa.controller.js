import {
  approveExplanation,
  cancelExplanation,
  checkIn,
  checkOut,
  createShiftAssignment,
  createWorkShift,
  deleteShiftAssignment,
  deleteWorkShift,
  getAttendanceDetail,
  getTodayStatus,
  listAttendanceByDate,
  listExplanations,
  listShiftAssignments,
  listWorkShifts,
  quickMarkAll,
  quickMarkAttendance,
  recalculateDateAttendance,
  rejectExplanation,
  submitExplanation,
  updateAttendanceManual,
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
      embeddings: req.body?.embeddings,
      blink_verified: req.body?.blink_verified,
      ip: req.ip,
      device_info: req.body?.device_info || req.headers["x-device-id"] || null,
      user_id: req.user?.user_id,
      note: req.body?.note,
    });

    if (result.error) {
      const messages = {
        NO_SHIFT: "Chưa cấu hình ca làm việc cho nhân viên",
        ALREADY_CHECKED_IN: "Đã chấm công vào ca hôm nay",
        CHECK_IN_WINDOW_CLOSED: "Ngoài khung giờ cho phép chấm công vào ca",
      };
      return res.status(result.error === "ALREADY_CHECKED_IN" ? 409 : 400).json({
        success: false,
        message: messages[result.error] || "Không thể chấm công vào ca",
        data: result.log || null,
      });
    }

    return res
      .status(200)
      .json({
        success: true,
        message: "Chấm công vào ca thành công",
        data: result,
      });
  } catch (error) {
    return respondError(res, error, "Có lỗi xảy ra khi chấm công vào ca");
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
      embeddings: req.body?.embeddings,
      blink_verified: req.body?.blink_verified,
      ip: req.ip,
      device_info: req.body?.device_info || req.headers["x-device-id"] || null,
      user_id: req.user?.user_id,
      note: req.body?.note,
    });

    if (result.error) {
      const messages = {
        NO_CHECK_IN: "Chưa chấm công vào ca hôm nay",
        ALREADY_CHECKED_OUT: "Đã chấm công tan ca hôm nay",
        CHECK_OUT_WINDOW_CLOSED: "Ngoài khung giờ cho phép chấm công tan ca",
      };
      return res.status(result.error === "ALREADY_CHECKED_OUT" ? 409 : 400).json({
        success: false,
        message: messages[result.error] || "Không thể chấm công tan ca",
        data: result.log || null,
      });
    }

    return res
      .status(200)
      .json({
        success: true,
        message: "Chấm công tan ca thành công",
        data: result,
      });
  } catch (error) {
    return respondError(res, error, "Có lỗi xảy ra khi chấm công tan ca");
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
    return respondError(res, error, "Không thể lấy trạng thái chấm công");
  }
};

export const attendanceList = async (req, res) => {
  try {
    const data = await listAttendanceByDate(req.query?.date, req.user);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return respondError(res, error, "Không thể tải danh sách chấm công");
  }
};

export const attendanceDetail = async (req, res) => {
  try {
    const data = await getAttendanceDetail(
      Number(req.query?.employee_id),
      req.query?.date,
      req.user,
    );
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return respondError(res, error, "Không thể tải chi tiết chấm công");
  }
};

export const attendanceManualUpdate = async (req, res) => {
  try {
    const data = await updateAttendanceManual(
      { ...req.body, ip: req.ip },
      req.user,
    );
    return res
      .status(200)
      .json({ success: true, message: "Đã cập nhật chấm công", data });
  } catch (error) {
    return respondError(res, error, "Không thể cập nhật chấm công");
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
    return respondError(res, error, "Không thể cập nhật chấm công");
  }
};

export const attendanceRecalculateDate = async (req, res) => {
  try {
    const { date, department_id } = req.body || {};
    const data = await recalculateDateAttendance(
      date,
      req.user,
      department_id ? Number(department_id) : null,
    );
    return res.status(200).json({
      success: true,
      message: `Đã tính lại công ngày ${data.date} cho ${data.count} nhân viên${data.skipped ? `, bỏ qua ${data.skipped} nhân viên tháng đã khóa` : ""}.`,
      data,
    });
  } catch (error) {
    return respondError(res, error, "Không thể tính lại công theo ngày");
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
    return respondError(res, error, "Không thể điểm danh hàng loạt");
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
      .json({ success: true, message: "�?A� h��y gi���i trA�nh cA'ng", data });
  } catch (error) {
    return respondError(res, error, "KhA'ng th��� h��y gi���i trA�nh cA'ng");
  }
};

export const removeWorkShift = async (req, res) => {
  try {
    const data = await deleteWorkShift(req.params.id);
    return res
      .status(200)
      .json({ success: true, message: "Đã xóa ca làm việc", data });
  } catch (error) {
    return respondError(res, error, "Không thể xóa ca làm việc");
  }
};
