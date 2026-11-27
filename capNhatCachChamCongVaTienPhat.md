# Cập nhật Database & Yêu cầu Làm lại Tính năng Phạt Đi Muộn

## 1. Các thay đổi đã cập nhật trong Database

- **Bảng `attendances` (đã thêm 3 cột & đồng bộ dữ liệu cũ):**
  - `final_workday` (`DECIMAL(3,2)`): Công thực nhận của ngày sau khi áp quy chế phạt (đã đồng bộ bằng `base_workday` cho dữ liệu cũ).
  - `penalty_amount` (`DECIMAL(12,2)`): Số tiền phạt đi muộn tạm tính của ngày đó (VNĐ).
  - `penalty_note` (`VARCHAR(255)`): Ghi chú bậc phạt đã áp dụng hoặc lý do miễn phạt.
- **Bảng `monthly_timesheets` (đã thêm 1 cột):**
  - `total_late_penalty` (`DECIMAL(12,2)`): Tổng tiền phạt đi muộn đã chốt của cả tháng để trừ vào lương.
- **Các bảng giữ nguyên cấu trúc (dùng lại):**
  - `attendance_policies`: Dùng cột `rules_json` có sẵn để lưu cấu hình bậc phạt động.
  - `leave_requests`, `employee_requests`, `attendance_late_explanations`, `attendance_grace_usages`: Dùng để kiểm tra điều kiện miễn phạt và tự động gỡ phạt.

---

## 2. Các phần cần làm lại / triển khai

### 2.1. Quy chế phạt đi muộn động (không hardcode)

- Cho phép Admin/HR tự do thêm, sửa, xóa các bậc phạt theo số phút đi muộn ngay trên giao diện và lưu vào `attendance_policies.rules_json`.
- Mỗi bậc phạt tùy chỉnh được:
  - Khoảng phút đi muộn (`từ phút` → `đến phút`, hoặc `trở lên`).
  - Mức tiền phạt (VNĐ) — ví dụ: muộn 30p phạt 100k, muộn 1 tiếng phạt 300k.
  - Giới hạn công tối đa của ngày (vd: muộn quá mức quy định thì chỉ tính tối đa `0.5` công).
- Cấu hình được thời gian ân hạn (`grace_minutes`).
- Validate không cho phép các bậc bị chồng lấn khoảng phút; áp dụng theo đúng 1 bậc khớp (không cộng dồn).
- Khi HR sửa quy chế mới chỉ áp dụng cho các lượt chấm công mới, không làm thay đổi số liệu lịch sử của các ngày cũ.

### 2.2. Điều kiện miễn phạt & tự động gỡ phạt

- **Miễn phạt (0đ, giữ nguyên `base_workday`)** khi nhân viên rơi vào 1 trong các trường hợp:
  - Đi muộn trong thời gian ân hạn hoặc dùng lượt ân hạn (`attendance_grace_usages`).
  - Có đơn xin phép trước (xin đi muộn, việc riêng, nghỉ nửa buổi, công tác) đã được duyệt (`APPROVED`) ở `leave_requests` hoặc `employee_requests`.
  - Có đơn giải trình đi muộn đã được duyệt (`APPROVED`) ở `attendance_late_explanations`.
- **Tự động gỡ phạt:** Nếu ngày đó đã bị tạm tính phạt, khi quản lý bấm duyệt đơn xin phép hoặc đơn giải trình sau đó, hệ thống tự động cập nhật lại `attendances` về `penalty_amount = 0` và khôi phục `final_workday = base_workday`.

### 2.3. Luồng 2 giai đoạn: Tạm tính trong tháng → Chốt công mới trừ tiền

- **Trong tháng (`attendances`):** Tiền phạt hàng ngày chỉ ghi nhận ở trạng thái **tạm tính** để nhân viên theo dõi và kịp nộp đơn giải trình nếu có lý do chính đáng.
- **Cuối tháng (`monthly_timesheets`):** Khi HR bấm chốt công tháng, hệ thống tổng hợp `SUM(final_workday)` và `SUM(penalty_amount)` lưu cứng vào `monthly_timesheets.total_late_penalty`.
- Tiền phạt đi muộn chỉ thực sự bị trừ vào thu nhập của nhân viên tại bước chốt công và tính lương thực lĩnh cuối tháng.

### 2.4. Giao diện (Frontend)

- **Màn hình cấu hình quy chế phạt (Admin/HR):** Cho phép chỉnh phút ân hạn, thêm/sửa/xóa các bậc phạt động và có ô nhập số phút để test thử kết quả phạt ngay trên màn hình trước khi lưu.
- **Bảng chấm công ngày:** Hiển thị rõ công thực nhận (`final_workday`, có tooltip so sánh với `base_workday` nếu bị cắt công), tiền phạt tạm tính (`penalty_amount`) và lý do (`penalty_note`).
- **Bảng công tháng:** Hiển thị cột tổng tiền phạt đi muộn (`total_late_penalty`) để đối chiếu trước khi tính lương.
