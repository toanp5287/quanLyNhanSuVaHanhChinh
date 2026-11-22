import express from "express";
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

export default routerNotifications;
