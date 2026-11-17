import * as overtime from "../../services/quan-ly-lam-them-gio/quanLyLamThemGio.service.js";

const handle = (operation, message, status = 200) => async (req, res) => {
  try {
    const data = await operation(req);
    return res.status(status).json({ success: true, message, data });
  } catch (error) {
    if (!error.status) console.error(message, error);
    return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Không thể xử lý yêu cầu tăng ca" });
  }
};

export const listOvertime = handle(req => overtime.listOvertimeRequests(req.user, req.query), "Danh sách tăng ca");
export const myOvertime = handle(req => overtime.getMyOvertimeRequests(req.user, req.query), "Tăng ca của tôi");
export const createOvertime = handle(req => overtime.createOvertimeRequest(req.user, req.body), "Đã đăng ký tăng ca", 201);
export const approveOvertime = handle(req => overtime.approveOvertimeRequest(req.user, req.params.id, req.body), "Đã duyệt tăng ca");
export const rejectOvertime = handle(req => overtime.rejectOvertimeRequest(req.user, req.params.id, req.body), "Đã từ chối tăng ca");
export const cancelOvertime = handle(req => overtime.cancelOvertimeRequest(req.user, req.params.id), "Đã hủy đăng ký tăng ca");
