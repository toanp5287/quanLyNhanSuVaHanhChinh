import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../services/notifications/notifications.service.js";

export const getNotificationsHandler = async (req, res) => {
  try {
    const notifications = await getNotifications(req.user, req.query.limit);
    return res.status(200).json({ notifications });
  } catch (error) {
    console.error("getNotificationsHandler:", error);
    return res.status(500).json({ message: "Không thể tải thông báo" });
  }
};

export const getUnreadNotificationCountHandler = async (req, res) => {
  try {
    const count = await getUnreadNotificationCount(req.user);
    return res.status(200).json({ count });
  } catch (error) {
    console.error("getUnreadNotificationCountHandler:", error);
    return res.status(500).json({ message: "Không thể đếm thông báo chưa đọc" });
  }
};

export const markNotificationReadHandler = async (req, res) => {
  try {
    const result = await markNotificationRead(req.user, req.params.id);
    if (result.notFound) {
      return res.status(404).json({ message: "Không tìm thấy thông báo" });
    }

    return res.status(200).json({ message: "Đã đánh dấu thông báo là đã đọc" });
  } catch (error) {
    console.error("markNotificationReadHandler:", error);
    return res.status(500).json({ message: "Không thể cập nhật thông báo" });
  }
};

export const markAllNotificationsReadHandler = async (req, res) => {
  try {
    const result = await markAllNotificationsRead(req.user);
    return res.status(200).json({
      message: "Đã đánh dấu tất cả thông báo là đã đọc",
      ...result,
    });
  } catch (error) {
    console.error("markAllNotificationsReadHandler:", error);
    return res.status(500).json({ message: "Không thể cập nhật thông báo" });
  }
};
