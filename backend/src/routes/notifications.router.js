import express from "express";
<<<<<<< HEAD

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
=======
import {
  bootstrap,
  list,
  markRead,
  markAllRead,
  resolve,
  stream,
} from "../controllers/notifications/notification.controller.js";
import {
  verifyStreamToken,
  verifyToken,
} from "../middlewares/auth.middleware.js";

const routerNotifications = express.Router();

routerNotifications.get("/stream", verifyStreamToken, stream);
routerNotifications.use(verifyToken);
routerNotifications.get("/bootstrap", bootstrap);
routerNotifications.get("/", list);
routerNotifications.patch("/read-all", markAllRead);
routerNotifications.patch("/:id/read", markRead);
routerNotifications.patch("/:id/resolve", resolve);
>>>>>>> origin/main

export default routerNotifications;
