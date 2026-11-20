import express from "express";

import { verifyToken } from "../middlewares/auth.middleware.js";
import {
  getNotificationsHandler,
  getUnreadNotificationCountHandler,
  markAllNotificationsReadHandler,
  markNotificationReadHandler,
} from "../controllers/notifications/notifications.controller.js";

const routerNotifications = express.Router();

routerNotifications.use(verifyToken);

routerNotifications.get("/", getNotificationsHandler);
routerNotifications.get("/unread-count", getUnreadNotificationCountHandler);
routerNotifications.post("/read-all", markAllNotificationsReadHandler);
routerNotifications.post("/:id/read", markNotificationReadHandler);

export default routerNotifications;
