// ví dụ đây bên viết logic quản gọi server là sử lý req, trả về ress ......
import { isEmailExists } from "../../services/auth/auth.service.js";
export const login = async (req, res) => {
  const { email, passworld } = req.body;
  try {
    const user = isEmailExists(email);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy email",
      });
    }
    return res.status(200).json({
      success: false,
      message: "login thành công",
    });
  } catch (error) {
    console.log(error);
  }
};
