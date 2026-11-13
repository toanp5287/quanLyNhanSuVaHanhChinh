import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import routerAuth from "./src/routes/auth.router.js"; // luu ý dự án dử dụng module nên import đuỗi phải có .js
import routerPermissions from "./src/routes/permissions.router.js";
import connectMysql from "./src/config/database.js";
const app = express();

dotenv.config();

app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET, POST, PUT, PATCH, DELETE"],
    credentials: true,
  }),
);
const port = process.env.PORT || 4000;
app.use(express.json());
app.use("/auth", routerAuth);
app.use("/permissions", routerPermissions);
app.listen(port, async () => {
  await connectMysql();
  console.log(`Server đang chạy ở http://localhost:${port}`);
});
