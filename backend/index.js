import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import routerAuth from "./src/routes/auth.router.js"; // luu ý dự án dử dụng module nên import đuỗi phải có .js
import routerPermissions from "./src/routes/permissions.router.js";
import routerEmployees from "./src/routes/employees.router.js";
import routerOrganization from "./src/routes/organization.router.js";
import routerContracts from "./src/routes/contracts.router.js";
import routerContractRenewals from "./src/routes/contract-renewals.router.js";
import routerRewardsDiscipline from "./src/routes/rewardsDiscipline.router.js";
import routerTongHopChotCong from "./src/routes/tongHopChotCong.router.js";
import routerDiemDanhNhatKyQuetThePhanCa from "./src/routes/diemDanhNhatKyQuetThePhanCa.router.js";
import routerQuanLyLamThemGio from "./src/routes/quanLyLamThemGio.router.js";
import routerQuanLyNghiPhepVaQuyPhepNam from "./src/routes/quan-ly-nghi-phep-va-quy-phep-nam.service.js";
import routerMyProfile from "./src/routes/myProfile.router.js";
import routerEmployeeRequests from "./src/routes/employeeRequests.router.js";
import routerDocuments from "./src/routes/documents.router.js";
import routerNotifications from "./src/routes/notifications.router.js";
import routerDevices from "./src/routes/deviceSecurity.router.js";
import routerAdminDevices from "./src/routes/adminDevices.router.js";
import connectMysql from "./src/config/database.js";

dotenv.config();

const app = express();
app.set("trust proxy", 1);

const allowedOrigins = String(
  process.env.CORS_ORIGIN || process.env.FRONTEND_ORIGIN || "http://localhost:5173",
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:4173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowAllOrigins = corsOrigins.includes("*");

app.use(
  cors({
    origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  }),
);
const port = process.env.PORT || 8080;
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use("/auth", routerAuth);
app.use("/permissions", routerPermissions);
app.use("/employees", routerEmployees);
app.use("/organization", routerOrganization);
app.use("/contracts", routerContracts);
app.use("/contract-renewals", routerContractRenewals);
app.use("/my-profile", routerMyProfile);
app.use("/employee-requests", routerEmployeeRequests);
app.use("/documents", routerDocuments);
app.use("/notifications", routerNotifications);
app.use("/attendance", routerDiemDanhNhatKyQuetThePhanCa);
app.use("/timesheets", routerTongHopChotCong);
app.use("/overtime", routerQuanLyLamThemGio);
app.use("/api/v1/overtime-requests", routerQuanLyLamThemGio);
app.use("/leave", routerQuanLyNghiPhepVaQuyPhepNam);
app.use("/notifications", routerNotifications);
app.use("/api/v1/notifications", routerNotifications);
app.use("/api/devices", routerDevices);
app.use("/api/admin", routerAdminDevices);

const startServer = async () => {
  await connectMysql();
  app.listen(port, () => {
    console.log(`Server đang chạy ở http://localhost:${port}`);
  });
};

startServer();
