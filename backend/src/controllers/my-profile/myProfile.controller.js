import {
  changeSelfPassword,
  checkRegisteredFaceOwner,
  clearSelfFaceDescriptor,
  getSelfProfile,
  updateSelfContact,
  updateSelfFaceDescriptor,
  verifySelfFacePassword,
} from "../../services/my-profile/myProfile.service.js";

const PHONE_REGEX = /^[0-9+\-().\s]{8,20}$/;
const MAX_LENGTH = {
  phone: 20,
  address: 255,
  bank_account: 50,
  bank_name: 100,
};

const validateContactPayload = (payload = {}) => {
  const fields = ["phone", "address", "bank_account", "bank_name"];

  for (const field of fields) {
    const value = payload[field];

    if (value !== undefined && value !== null && typeof value !== "string") {
      return "Dữ liệu gửi lên không hợp lệ";
    }

    if (value && String(value).trim().length > MAX_LENGTH[field]) {
      return `Trường ${field} vượt quá ${MAX_LENGTH[field]} ký tự`;
    }
  }

  const phone = String(payload.phone ?? "").trim();

  if (phone && !PHONE_REGEX.test(phone)) {
    return "Số điện thoại không hợp lệ";
  }

  return null;
};

export const getMyProfile = async (req, res) => {
  try {
    const employeeId = req.user?.employee_id;

    if (!employeeId) {
      return res.status(404).json({
        success: false,
        message: "Tài khoản chưa được liên kết với hồ sơ nhân sự",
      });
    }

    const data = await getSelfProfile(employeeId);

    if (!data || !data.employee) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hồ sơ nhân sự của bạn",
      });
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Lỗi lấy hồ sơ cá nhân:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi lấy hồ sơ cá nhân",
    });
  }
};

export const updateMyContact = async (req, res) => {
  try {
    const employeeId = req.user?.employee_id;

    if (!employeeId) {
      return res.status(404).json({
        success: false,
        message: "Tài khoản chưa được liên kết với hồ sơ nhân sự",
      });
    }

    const validationError = validateContactPayload(req.body || {});

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const employee = await updateSelfContact(employeeId, req.body || {});

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy hồ sơ nhân sự của bạn",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Cập nhật thông tin liên hệ & ngân hàng thành công",
      data: employee,
    });
  } catch (error) {
    console.error("Lỗi cập nhật thông tin liên hệ:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi cập nhật thông tin liên hệ",
    });
  }
};

export const updateMyFaceDescriptor = async (req, res) => {
  try {
    const employeeId = req.user?.employee_id;
    if (!employeeId) {
      return res.status(404).json({ success: false, message: "Tai khoan chua duoc lien ket voi ho so nhan su" });
    }
    const data = await updateSelfFaceDescriptor(
      employeeId,
      req.body?.embeddings,
      req.body?.current_password,
      req.body?.blink_verified,
      req.body?.capture,
      {
        device_id: req.authorizedDevice?.id || null,
        client_ip: req.clientIp || null,
      },
    );
    return res.status(200).json({ success: true, message: "Cập nhật mẫu khuôn mặt FaceID thành công", data });
  } catch (error) {
    if (!error.status) console.error("Loi cap nhat khuon mat:", error);
    return res.status(error.status || 500).json({ success: false, error_code: error.error_code, conflict_employee: error.conflict_employee, message: error.status ? error.message : "Không thể cập nhật mẫu khuôn mặt" });
  }
};

export const verifyMyFacePassword = async (req, res) => {
  try {
    const employeeId = req.user?.employee_id;
    const password = req.body?.current_password;
    if (!employeeId) return res.status(404).json({ success: false, message: "Tài khoản chưa được liên kết với hồ sơ nhân sự" });
    if (typeof password !== "string" || !password) return res.status(400).json({ success: false, message: "Nhập mật khẩu tài khoản để tiếp tục" });
    await verifySelfFacePassword(employeeId, password);
    return res.status(200).json({ success: true, message: "Mật khẩu hợp lệ" });
  } catch (error) {
    if (!error.status) console.error("Loi xac nhan mat khau FaceID:", error);
    return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Không thể xác nhận mật khẩu" });
  }
};

export const checkMyFaceOwner = async (req, res) => {
  try {
    const employeeId = req.user?.employee_id;
    if (!employeeId) return res.status(404).json({ success: false, message: "Tài khoản chưa được liên kết với hồ sơ nhân sự" });
    const data = await checkRegisteredFaceOwner(employeeId, req.body?.embedding);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (!error.status) console.error("Loi kiem tra chu so huu FaceID:", error);
    return res.status(error.status || 500).json({ success: false, error_code: error.error_code, conflict_employee: error.conflict_employee, message: error.status ? error.message : "Không thể kiểm tra khuôn mặt đã đăng ký" });
  }
};

export const resetMyFaceDescriptor = async (req, res) => {
  try {
    const employeeId = req.user?.employee_id;
    if (!employeeId) {
      return res.status(404).json({ success: false, message: "Tai khoan chua duoc lien ket voi ho so nhan su" });
    }
    const data = await clearSelfFaceDescriptor(employeeId, req.body?.current_password);
    return res.status(200).json({ success: true, message: "Da dat lai mau khuon mat FaceID", data });
  } catch (error) {
    if (!error.status) console.error("Loi dat lai khuon mat:", error);
    return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Co loi xay ra khi dat lai mau khuon mat" });
  }
};

export const updateMyPassword = async (req, res) => {
  try {
    const userId = req.user?.user_id;
    const {
      current_password: currentPassword,
      new_password: newPassword,
      confirm_password: confirmPassword,
    } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới",
      });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu mới phải có tối thiểu 6 ký tự",
      });
    }

    if (
      confirmPassword !== undefined &&
      String(confirmPassword) !== String(newPassword)
    ) {
      return res.status(400).json({
        success: false,
        message: "Xác nhận mật khẩu mới không khớp",
      });
    }

    if (String(currentPassword) === String(newPassword)) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu mới phải khác mật khẩu hiện tại",
      });
    }

    const result = await changeSelfPassword(
      userId,
      String(currentPassword),
      String(newPassword),
    );

    if (result.notFound) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài khoản đăng nhập",
      });
    }

    if (result.invalidCurrent) {
      return res.status(401).json({
        success: false,
        message: "Mật khẩu hiện tại không đúng",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Đổi mật khẩu đăng nhập thành công",
    });
  } catch (error) {
    console.error("Lỗi đổi mật khẩu:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi đổi mật khẩu",
    });
  }
};
