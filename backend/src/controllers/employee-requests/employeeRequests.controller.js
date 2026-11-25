import {
  checkEmployeeRequest,
  createEmployeeRequest,
  createResignationRequest,
  createTemporaryLeaveRequest,
  getEmployeeRequestDetail,
  getEmployeeRequestHistory,
  listEmployeeRequests,
  processEmployeeRequest,
  receiveEmployeeRequest,
  requestEmployeeUpdate,
  resubmitEmployeeRequest,
} from "../../services/employee-requests/employeeRequests.service.js";

const handle = (operation, message, status = 201) => async (req, res) => {
  try {
    return res
      .status(status)
      .json({ success: true, message, data: await operation(req) });
  } catch (error) {
    if (!error.status) console.error(message, error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : "Không thể xử lý yêu cầu",
    });
  }
};

export const postRequest = handle(
  (req) => createEmployeeRequest(req.user, req.body, req.body?.request_type),
  "Đã gửi đơn",
);

export const postResignationRequest = handle(
  (req) => createResignationRequest(req.user, req.body),
  "Đã gửi đơn xin nghỉ việc",
);

export const postTemporaryLeaveRequest = handle(
  (req) => createTemporaryLeaveRequest(req.user, req.body),
  "Đã gửi đơn xin tạm nghỉ",
);

export const getRequests = handle(
  (req) => listEmployeeRequests(req.user, req.query),
  "Danh sách đơn từ",
  200,
);

export const getRequestDetail = handle(
  (req) => getEmployeeRequestDetail(req.user, req.params.id),
  "Chi tiết đơn từ",
  200,
);

export const approveRequest = handle(
  (req) => processEmployeeRequest(req.user, req.params.id, "approve", req.body),
  "Đã duyệt đơn",
  200,
);

export const rejectRequest = handle(
  (req) => processEmployeeRequest(req.user, req.params.id, "reject", req.body),
  "Đã từ chối đơn",
  200,
);

export const requestUpdate = handle(
  (req) => requestEmployeeUpdate(req.user, req.params.id, req.body),
  "Đã yêu cầu nhân viên bổ sung hồ sơ",
  200,
);

export const resubmitRequest = handle(
  (req) => resubmitEmployeeRequest(req.user, req.params.id, req.body),
  "Đã gửi lại hồ sơ bổ sung",
  200,
);

export const checkRequest = handle(
  (req) => checkEmployeeRequest(req.user, req.params.id, req.body),
  "Đã kiểm tra hồ sơ",
  200,
);

export const receiveRequest = handle(
  (req) => receiveEmployeeRequest(req.user, req.params.id, req.body),
  "Đã tiếp nhận hồ sơ bổ sung",
  200,
);

export const getHistory = handle(
  (req) => getEmployeeRequestHistory(req.user, req.params.id),
  "Lịch sử xử lý đơn",
  200,
);
