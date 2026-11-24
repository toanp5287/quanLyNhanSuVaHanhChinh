import * as service from "../../services/notifications/notification.service.js";

const handle = (operation, message, status = 200) => async (req, res) => {
  try {
    const data = await operation(req);
    return res.status(status).json({ success: true, message, data });
  } catch (error) {
    if (!error.status) console.error(message, error);
    return res
      .status(error.status || 500)
      .json({
        success: false,
        message: error.status ? error.message : "Không thể xử lý thông báo",
      });
  }
};

export const bootstrap = handle((req) => service.getBootstrap(req.user), "Thông báo khởi động");

export const list = handle((req) => service.listNotifications(req.user, req.query), "Danh sách thông báo");

export const markRead = handle(
  (req) => service.markNotificationRead(req.user, req.params.id),
  "Đã đánh dấu đã đọc",
);

export const markAllRead = handle(
  (req) => service.markAllNotificationsRead(req.user),
  "Đã đánh dấu tất cả là đã đọc",
);

export const resolve = handle(
  (req) => service.resolveNotification(req.user, req.params.id),
  "Đã xử lý thông báo",
);

export const stream = (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write(`event: connected\ndata: ${JSON.stringify({ user_id: req.user.user_id })}\n\n`);
  const unregister = service.registerNotificationStream(req.user.user_id, res);
  req.on("close", unregister);
};
