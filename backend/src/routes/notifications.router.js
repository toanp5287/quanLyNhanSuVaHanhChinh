import express from "express";

import {
  verifyStreamToken,
  verifyToken,
} from "../middlewares/auth.middleware.js";
import {
  getNotificationsHandler,
  getUnreadNotificationCountHandler,
  markAllNotificationsReadHandler,
  markNotificationReadHandler,
} from "../controllers/notifications/notifications.controller.js";
import {
  bootstrap,
  list,
  markRead,
  markAllRead,
  resolve,
  stream,
} from "../controllers/notifications/notification.controller.js";

const routerNotifications = express.Router();

routerNotifications.get("/stream", verifyStreamToken, stream);
routerNotifications.use(verifyToken);

const listNotifications = (req, res, next) =>
  req.baseUrl === "/api/v1/notifications"
    ? list(req, res, next)
    : getNotificationsHandler(req, res, next);

routerNotifications.get("/bootstrap", bootstrap);
routerNotifications.get("/", listNotifications);
routerNotifications.get("/unread-count", getUnreadNotificationCountHandler);
routerNotifications.post("/read-all", markAllNotificationsReadHandler);
routerNotifications.post("/:id/read", markNotificationReadHandler);
routerNotifications.patch("/read-all", markAllRead);
routerNotifications.patch("/:id/read", markRead);
routerNotifications.patch("/:id/resolve", resolve);

export default routerNotifications;
