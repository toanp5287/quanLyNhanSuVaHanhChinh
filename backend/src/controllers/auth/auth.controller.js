import jwt from "jsonwebtoken";
import {
  findUserById,
  findUserByIdentifier,
  toAuthUser,
  updateLastLogin,
  verifyPassword,
} from "../../services/auth/auth.service.js";
import { getEmployeesByScope } from "../../services/user/user.service.js";
import { canViewSalary, hasPermission } from "../../utils/helper.js";

const buildTokenPayload = (user) => ({
  user_id: user.user_id,
  username: user.username,
  employee_id: user.employee_id,
  employee_code: user.employee_code,
  full_name: user.full_name,
  department_id: user.department_id,
  role_id: user.role_id,
  data_scope: user.data_scope,
  permissions: user.permissions,
});

export const login = async (req, res) => {
  const {
    identifier,
    employee_code,
    email,
    password,
    passworld,
  } = req.body || {};

  const loginIdentifier = identifier || employee_code || email || "";
  const plainPassword = password ?? passworld ?? "";

  try {
    if (!String(loginIdentifier).trim() || !String(plainPassword)) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập mã nhân viên hoặc email và mật khẩu",
      });
    }

    const user = await findUserByIdentifier(loginIdentifier);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Tài khoản hoặc mật khẩu không đúng",
      });
    }

    if (Number(user.is_active) !== 1) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên",
      });
    }

    const isPasswordValid = await verifyPassword(
      plainPassword,
      user.password_hash,
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Tài khoản hoặc mật khẩu không đúng",
      });
    }

    await updateLastLogin(user.user_id);

    const token = jwt.sign(buildTokenPayload(user), process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "1d",
    });

    return res.status(200).json({
      success: true,
      message: "Đăng nhập thành công",
      token,
      user: toAuthUser(user),
    });
  } catch (error) {
    console.error("Lỗi đăng nhập:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi đăng nhập",
    });
  }
};

export const getProfile = async (req, res) => {
  try {
    const user = await findUserById(req.user?.user_id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài khoản",
      });
    }

    if (Number(user.is_active) !== 1) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản đã bị khóa",
      });
    }

    return res.status(200).json({
      success: true,
      user: toAuthUser(user),
    });
  } catch (error) {
    console.error("Lỗi lấy thông tin tài khoản:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi lấy thông tin tài khoản",
    });
  }
};

export const getEmployees = async (req, res) => {
  try {
    const user = await findUserById(req.user?.user_id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài khoản",
      });
    }

    if (Number(user.is_active) !== 1) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản đã bị khóa",
      });
    }

    if (!hasPermission(user.permissions, "HR.PROFILE_VIEW")) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xem dữ liệu nhân sự",
      });
    }

    const publicUser = toAuthUser(user);
    const employees = await getEmployeesByScope(publicUser);
    const showSalary = canViewSalary(publicUser);

    const data = employees.map((employee) => {
      if (showSalary) return employee;

      const { base_salary, insurance_salary, ...rest } = employee;
      return rest;
    });

    return res.status(200).json({
      success: true,
      data_scope: publicUser.data_scope,
      show_salary: showSalary,
      total: data.length,
      employees: data,
    });
  } catch (error) {
    console.error("Lỗi lấy danh sách nhân sự:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi lấy danh sách nhân sự",
    });
  }
};
