import { listLeaveBalances, updateLeaveBalance, listLeaveRequests, createLeaveRequest, processLeaveRequest } from "../../services/quan-ly-nghi-phep-va-quy-phep-nam/quan-ly-nghi-phep-va-quy-phep-nam.service.js";

const handle = (operation, message, status = 200) => async (req, res) => {
  try {
    return res.status(status).json({ success: true, message, data: await operation(req) });
  } catch (error) {
    if (!error.status) console.error(message, error);
    return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Không thể xử lý yêu cầu nghỉ phép" });
  }
};

export const getBalances = handle(req => listLeaveBalances(req.user, req.query), "Quỹ phép năm");
export const putBalance = handle(req => updateLeaveBalance(req.user, req.params.employeeId, req.body), "Đã cập nhật quỹ phép");
export const getRequests = handle(req => listLeaveRequests(req.user, req.query), "Danh sách đơn nghỉ phép");
export const postRequest = handle(req => createLeaveRequest(req.user, req.body), "Đã gửi đơn nghỉ phép", 201);
export const approveRequest = handle(req => processLeaveRequest(req.user, req.params.id, "approve", req.body), "Đã duyệt đơn nghỉ phép");
export const rejectRequest = handle(req => processLeaveRequest(req.user, req.params.id, "reject", req.body), "Đã từ chối đơn nghỉ phép");
export const cancelRequest = handle(req => processLeaveRequest(req.user, req.params.id, "cancel"), "Đã hủy đơn nghỉ phép");
