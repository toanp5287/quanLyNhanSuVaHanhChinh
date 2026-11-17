import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import routerAuth from "./src/routes/auth.router.js"; // luu ý dự án dử dụng module nên import đuỗi phải có .js
import routerPermissions from "./src/routes/permissions.router.js";
import routerEmployees from "./src/routes/employees.router.js";
import routerOrganization from "./src/routes/organization.router.js";
import routerContracts from "./src/routes/contracts.router.js";
import routerRewardsDiscipline from "./src/routes/rewardsDiscipline.router.js";
import routerTongHopChotCong from "./src/routes/tongHopChotCong.router.js";
import routerDiemDanhNhatKyQuetThePhanCa from "./src/routes/diemDanhNhatKyQuetThePhanCa.router.js";
import routerQuanLyLamThemGio from "./src/routes/quanLyLamThemGio.router.js";
import routerQuanLyNghiPhepVaQuyPhepNam from "./src/routes/quan-ly-nghi-phep-va-quy-phep-nam.service.js";
import routerMyProfile from "./src/routes/myProfile.router.js";
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
app.use("/employees", routerEmployees);
app.use("/organization", routerOrganization);
app.use("/contracts", routerContracts);
app.use("/my-profile", routerMyProfile);
app.use("/attendance", routerDiemDanhNhatKyQuetThePhanCa);
app.use("/timesheets", routerTongHopChotCong);
app.use("/overtime", routerQuanLyLamThemGio);
app.use("/leave", routerQuanLyNghiPhepVaQuyPhepNam);
app.listen(port, async () => {
  await connectMysql();
  console.log(`Server đang chạy ở http://localhost:${port}`);
});
