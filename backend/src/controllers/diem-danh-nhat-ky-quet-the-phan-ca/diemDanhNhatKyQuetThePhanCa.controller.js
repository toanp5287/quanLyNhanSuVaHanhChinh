import {
  checkIn,
  checkOut,
  getTodayStatus,
  listAttendanceByDate,
  quickMarkAll,
  quickMarkAttendance,
} from "../../services/diem-danh-nhat-ky-quet-the-phan-ca/diemDanhNhatKyQuetThePhanCa.service.js";

const getEmployeeId = (req) => req.user?.employee_id;

export const attendanceCheckIn = async (req, res) => {
  try {
    const employeeId = getEmployeeId(req);
    if (!employeeId) {
      return res.status(404).json({ success: false, message: "Tài khoản chưa liên kết hồ sơ nhân sự" });
    }

    const result = await checkIn(employeeId, {
      embeddings: req.body?.embeddings,
      blink_verified: req.body?.blink_verified,
      ip: req.ip,
      note: req.body?.note,
    });

    if (result.error === "ALREADY_CHECKED_IN") {
      return res.status(409).json({ success: false, message: "Đã chấm công vào ca hôm nay", data: result.log });
    }
    if (result.error) {
      return res.status(400).json({ success: false, message: "Không thể chấm công vào ca" });
    }

    return res.status(200).json({ success: true, message: "Chấm công vào ca thành công", data: result });
  } catch (error) {
    console.error("Lỗi chấm công vào ca:", error);
    return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Có lỗi xảy ra khi chấm công vào ca" });
  }
};

export const attendanceCheckOut = async (req, res) => {
  try {
    const employeeId = getEmployeeId(req);
    if (!employeeId) {
      return res.status(404).json({ success: false, message: "Tài khoản chưa liên kết hồ sơ nhân sự" });
    }

    const result = await checkOut(employeeId, {
      embeddings: req.body?.embeddings,
      blink_verified: req.body?.blink_verified,
      ip: req.ip,
      note: req.body?.note,
    });

    if (result.error === "NO_CHECK_IN") {
      return res.status(400).json({ success: false, message: "Chưa chấm công vào ca hôm nay" });
    }
    if (result.error === "ALREADY_CHECKED_OUT") {
      return res.status(409).json({ success: false, message: "Đã chấm công tan ca hôm nay", data: result.log });
    }
    if (result.error) {
      return res.status(400).json({ success: false, message: "Không thể chấm công tan ca" });
    }

    return res.status(200).json({ success: true, message: "Chấm công tan ca thành công", data: result });
  } catch (error) {
    console.error("Lỗi chấm công tan ca:", error);
    return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Có lỗi xảy ra khi chấm công tan ca" });
  }
};

export const attendanceToday = async (req, res) => {
  try {
    const employeeId = getEmployeeId(req);
    if (!employeeId) {
      return res.status(404).json({ success: false, message: "Tài khoản chưa liên kết hồ sơ nhân sự" });
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
    return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Không thể tải danh sách chấm công" });
  }
};

export const attendanceQuickMark = async (req, res) => {
  try {
    const { employee_id, date, type } = req.body || {};
    const result = await quickMarkAttendance(Number(employee_id), date, type || "PRESENT", req.user);
    if (result.error === "FORBIDDEN") {
      return res.status(403).json({ success: false, message: "Không có quyền thao tác nhân viên này" });
    }
    return res.status(200).json({ success: true, message: "Đã cập nhật chấm công", data: result });
  } catch (error) {
    console.error("Lỗi cập nhật chấm công:", error);
    return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Không thể cập nhật chấm công" });
  }
};

export const attendanceQuickMarkAll = async (req, res) => {
  try {
    const { department_id, date } = req.body || {};
    const result = await quickMarkAll(department_id ? Number(department_id) : null, date, req.user);
    return res.status(200).json({ success: true, message: "Đã chấm công hàng loạt", data: result });
  } catch (error) {
    console.error("Lỗi chấm công hàng loạt:", error);
    return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Không thể điểm danh hàng loạt" });
  }
};
