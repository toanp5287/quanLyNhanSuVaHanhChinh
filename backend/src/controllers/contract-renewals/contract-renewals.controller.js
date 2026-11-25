import {
  getContractRenewalCandidates,
  validateCandidateFilters,
} from "../../services/contract-renewals/contract-renewals.service.js";

export const listContractRenewalCandidates = async (req, res) => {
  const { filters, error } = validateCandidateFilters(req.query);

  if (error) {
    return res.status(400).json({ success: false, message: error });
  }

  try {
    const user = req.user;
    const result = await getContractRenewalCandidates(user, filters);

    return res.status(200).json({
      success: true,
      data_scope: user.data_scope,
      read_only: true,
      filters: {
        keyword: filters.keyword || null,
        department_id: filters.departmentId,
        contract_type: filters.contractType || null,
        status: filters.status,
        expiring_within_days: filters.expiringWithinDays,
        as_of_date: filters.asOfDate,
      },
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        total_pages: result.total_pages,
      },
      total: result.total,
      candidates: result.candidates,
      limitations: [
        "API chỉ đọc dữ liệu hiện có từ contracts/employees/departments/positions; không tạo hồ sơ tái ký, không ghi nhật ký, không gửi thông báo.",
        "Không sử dụng các bảng migration mới nếu chưa tồn tại.",
        "Số lần ký HĐ xác định thời hạn là số liệu tham khảo đếm từ contract_type hiện có; chưa kiểm tra ngoại lệ pháp lý, phụ lục/thỏa thuận, hoặc dữ liệu lịch sử ngoài bảng contracts.",
        "Trạng thái hiển thị được suy từ end_date so với ngày hiện tại và khoảng lọc; không cập nhật trạng thái trong database.",
        "Không tự kết luận hợp đồng đủ/không đủ điều kiện tái ký; HR phải xem xét các trường hợp đặc biệt theo taiKyHopDong1.md.",
      ],
    });
  } catch (error) {
    console.error("Lỗi lấy danh sách ứng viên tái ký hợp đồng:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi lấy danh sách hợp đồng cần xem xét tái ký",
    });
  }
};
