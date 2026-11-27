import {
  approveExplanation,
  cancelExplanation,
  checkIn,
  checkOut,
  createShiftAssignment,
  createWorkShift,
  deleteShiftAssignment,
  getAttendanceDetail,
  getMyAttendanceHistory,
  getTodayStatus,
  listAttendanceByDate,
  listExplanations,
  listShiftAssignments,
  listWorkShifts,
  quickMarkAll,
  quickMarkAttendance,
  rejectExplanation,
  submitExplanation,
  updateAttendanceManual,
  updateShiftAssignment,
  updateWorkShift,
  validateShiftPayload,
  logAttendanceFraud,
} from "../../services/diem-danh-nhat-ky-quet-the-phan-ca/diemDanhNhatKyQuetThePhanCa.service.js";
import {
  deletePolicy,
  getKioskConfig,
  listPolicies,
  previewLatePenalty,
  savePolicy,
  updateKioskConfig,
} from "../../services/attendance-policy/attendancePolicy.service.js";

const getEmployeeId = (req) => req.user?.employee_id;

const respondError = (res, error, fallback) => {
  if (error.fraud)
    logAttendanceFraud({
      reason: error.code || "ATTENDANCE_FRAUD",
      scores: error.scores || null,
      ip: res.req?.ip,
      deviceId: res.req?.headers?.["x-device-id"] || null,
      path: res.req?.originalUrl,
      userAgent: res.req?.headers?.["user-agent"] || null,
    });
  if (!error.status) console.error(fallback, error);
  return res.status(error.status || 500).json({
    success: false,
    message: error.status ? error.message : fallback,
    code: error.code || null,
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
      challengeToken: req.body?.challengeToken,
      liveness: req.body?.liveness,
      snapshot: req.body?.snapshot,
      ip: req.clientIp || req.ip,
      device_info: req.body?.device_info || req.headers["x-device-id"] || null,
      device_id: req.authorizedDevice?.id || null,
      client_ip: req.clientIp || null,
      user_id: req.user?.user_id,
      note: req.body?.note,
    });

    if (result.error) {
      const messages = {
        NO_SHIFT: "Chưa cấu hình ca làm việc cho nhân viên",
        ALREADY_CHECKED_IN: "Đã chấm công vào ca hôm nay",
        CHECK_IN_WINDOW_CLOSED: "Ngoài khung giờ cho phép chấm công vào ca",
        DOUBLE_PUNCH_TOO_FAST: `Quét quá nhanh sau lần chấm trước. Vui lòng đợi ${result.wait_seconds || 0} giây.`,
      };
      return res.status(result.error === "ALREADY_CHECKED_IN" ? 409 : 400).json({
        success: false,
        message: messages[result.error] || "Không thể chấm công vào ca",
        code: result.error,
        wait_seconds: result.wait_seconds || 0,
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
      challengeToken: req.body?.challengeToken,
      liveness: req.body?.liveness,
      snapshot: req.body?.snapshot,
      ip: req.clientIp || req.ip,
      device_info: req.body?.device_info || req.headers["x-device-id"] || null,
      device_id: req.authorizedDevice?.id || null,
      client_ip: req.clientIp || null,
      user_id: req.user?.user_id,
      note: req.body?.note,
    });

    if (result.error) {
      const messages = {
        NO_CHECK_IN_FOUND: "Bạn chưa chấm công Vào hôm nay, không thể chấm Ra!",
        ALREADY_CHECKED_OUT: "Đã chấm công tan ca hôm nay",
        CHECK_OUT_WINDOW_CLOSED: "Ngoài khung giờ cho phép chấm công tan ca",
        DOUBLE_PUNCH_TOO_FAST: `Quét quá nhanh sau lần chấm trước. Vui lòng đợi ${result.wait_seconds || 0} giây.`,
      };
      return res.status(result.error === "ALREADY_CHECKED_OUT" ? 409 : 400).json({
        success: false,
        message: messages[result.error] || "Không thể chấm công tan ca",
        code: result.error,
        wait_seconds: result.wait_seconds || 0,
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

export const attendanceMyHistory = async (req, res) => {
  try {
    const data = await getMyAttendanceHistory(req.user, req.query?.month);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return respondError(res, error, "Không thể tải lịch sử chấm công");
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
    const sum = data?.recalc_summary;
    const message = sum
      ? `Phân ca thành công. Đã tính lại ${sum.recalculated_days} ngày công (${sum.recalculated_employees} nhân viên), bỏ qua ${sum.skipped_locked_days} ngày thuộc kỳ đã khóa.`
      : "Phân ca thành công";
    return res.status(201).json({ success: true, message, data });
  } catch (error) {
    return respondError(res, error, "Không thể phân ca cho nhân viên");
  }
};

export const putShiftAssignment = async (req, res) => {
  try {
    const data = await updateShiftAssignment(req.user, req.params.id, req.body || {});
    const sum = data?.recalc_summary;
    const message = sum
      ? `Cập nhật phân ca thành công. Đã tính lại ${sum.recalculated_days} ngày công (${sum.recalculated_employees} nhân viên), bỏ qua ${sum.skipped_locked_days} ngày thuộc kỳ đã khóa.`
      : "Cập nhật phân ca thành công";
    return res.status(200).json({ success: true, message, data });
  } catch (error) {
    return respondError(res, error, "Không thể cập nhật phân ca");
  }
};

export const removeShiftAssignment = async (req, res) => {
  try {
    const data = await deleteShiftAssignment(req.user, req.params.id);
    const sum = data?.recalc_summary;
    const message = sum
      ? `Đã xóa phân ca. Đã tính lại ${sum.recalculated_days} ngày công (${sum.recalculated_employees} nhân viên), bỏ qua ${sum.skipped_locked_days} ngày thuộc kỳ đã khóa.`
      : "Đã xóa phân ca";
    return res.status(200).json({ success: true, message, data });
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

export const listAttendancePoliciesHandler = async (req, res) => {
  try {
    return res.status(200).json({ success: true, data: await listPolicies() });
  } catch (error) {
    return respondError(res, error, "Không thể tải quy chế tính công");
  }
};

export const saveAttendancePolicyHandler = async (req, res) => {
  try {
    const data = await savePolicy(
      { ...(req.body || {}), updated_by: req.user?.user_id || null },
      req.params.id || null,
    );
    return res.status(req.params.id ? 200 : 201).json({
      success: true,
      message: req.params.id ? "Đã cập nhật quy chế tính công" : "Đã tạo quy chế tính công",
      data,
    });
  } catch (error) {
    return respondError(res, error, "Không thể lưu quy chế tính công");
  }
};

export const previewAttendancePenaltyHandler = async (req, res) => {
  try {
    const data = await previewLatePenalty(req.body || {});
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return respondError(res, error, "Không thể thử tính tiền phạt đi muộn");
  }
};

export const removeAttendancePolicyHandler = async (req, res) => {
  try {
    const data = await deletePolicy(req.params.id);
    return res.status(200).json({ success: true, message: "Đã xóa quy chế tính công", data });
  } catch (error) {
    return respondError(res, error, "Không thể xóa quy chế tính công");
  }
};

export const getKioskConfigHandler = async (req, res) => {
  try {
    return res.status(200).json({ success: true, data: await getKioskConfig() });
  } catch (error) {
    return respondError(res, error, "Không thể tải cấu hình máy chấm công");
  }
};

export const updateKioskConfigHandler = async (req, res) => {
  try {
    const data = await updateKioskConfig(req.body || {}, req.user);
    return res.status(200).json({
      success: true,
      message: "Đã cập nhật cấu hình máy chấm công",
      data,
    });
  } catch (error) {
    return respondError(res, error, "Không thể lưu cấu hình máy chấm công");
  }
};
