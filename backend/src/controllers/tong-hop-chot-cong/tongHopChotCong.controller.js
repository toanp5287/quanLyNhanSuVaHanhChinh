import { listMonthlyTimesheets, updateMonth } from "../../services/tong-hop-chot-cong/tongHopChotCong.service.js";

const respond = (res, error, fallback) => {
  if (!error.status) console.error(fallback, error);
  return res.status(error.status || 500).json({
    success: false,
    message: error.status ? error.message : fallback,
  });
};

export const listTimesheets = async (req, res) => {
  try {
    const month = req.query?.month || req.body?.month;
    const data = await listMonthlyTimesheets(month, req.user);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return respond(res, error, "Không thể tải bảng công tháng");
  }
};

export const recalculateTimesheets = async (req, res) => {
  try {
    const data = await updateMonth(req.body?.month, req.user, false, req.body?.department_id || null);
    return res.status(200).json({ success: true, message: "Đã tổng hợp công tháng", data });
  } catch (error) {
    return respond(res, error, "Không thể tổng hợp công tháng");
  }
};

export const lockTimesheets = async (req, res) => {
  try {
    const data = await updateMonth(req.body?.month, req.user, true, req.body?.department_id || null);
    return res.status(200).json({ success: true, message: "Đã chốt và khóa bảng công tháng", data });
  } catch (error) {
    return respond(res, error, "Không thể khóa bảng công tháng");
  }
};
