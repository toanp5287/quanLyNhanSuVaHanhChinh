---

## V. BỔ SUNG CHỨC NĂNG ĐIỂM DANH TRỰC TIẾP (WEB CHECK-IN / CHECK-OUT & BẢNG ĐIỂM DANH NGÀY)

Tại **VIEW 7 (`#view-attendance-logs`)** và trên thanh công cụ nhanh, bắt buộc xây dựng đầy đủ 2 tính năng Điểm danh thực tế sau:

### 1. Widget Điểm danh Cá nhân Thời gian thực (Check-in / Check-out Bar)
Hiển thị nổi bật ngay đầu màn hình Chấm công (View 7) cho người đang đăng nhập (`currentUser.employee_id`):
- **Hiển thị thông tin ca hôm nay**:
  - Lấy ca làm việc hiện tại của nhân viên từ `employee_shifts` JOIN `work_shifts` (Mặc định: `CA_HC 08:00 - 17:30`, ân hạn `15 phút`).
  - Hiển thị Đồng hồ thời gian thực (Real-time Clock) và trạng thái điểm danh ngày hôm nay (`CURRENT_DATE`) của chính người dùng.
- **Trạng thái Nút bấm thông minh**:
  - **Trường hợp 1 (Hôm nay chưa có bản ghi trong `attendance_logs`)**: Hiển thị nút **`[Chấm công Vào ca (Check-in)]`**.
    - Khi bấm: Gọi API `POST /attendance/check-in` lấy giờ hiện tại:
      - So sánh giờ hiện tại với `start_time + grace_minutes` của ca làm việc.
      - Nếu vào đúng giờ hoặc trong 15 phút ân hạn -> `late_minutes = 0`, `status = 'VALID'`.
      - Nếu vào trễ quá 15 phút -> tự động tính `late_minutes`, gán `status = 'LATE'`.
      - Lưu vào `attendance_logs` với `work_date = CURRENT_DATE`, `source = 'FACE_ID'`, `work_unit = 0.50` (tạm tính nửa công khi mới check-in).
  - **Trường hợp 2 (Đã có `check_in` nhưng `check_out IS NULL`)**: Hiển thị giờ đã Check-in sáng nay và bật sáng nút **`[Chấm công Tan ca (Check-out)]`**.
    - Khi bấm: Gọi API `POST /attendance/check-out`:
      - Cập nhật `check_out = CURRENT_TIME`.
      - Tính toán số giờ làm việc để cập nhật `work_unit = 1.00` (đủ ngày công) hoặc `0.50` (nửa ngày công).
      - **Đồng bộ tự động sang bảng `monthly_timesheets`**: Tự động tính lại tổng `actual_work_days`, `late_count`, `total_late_minutes` và `total_payable_days = actual_work_days + paid_leave_days` của nhân viên đó trong tháng hiện tại (`YYYY-MM`).
  - **Trường hợp 3 (Đã có đủ cả `check_in` và `check_out`)**: Hiển thị Badge xanh **"Đã hoàn thành điểm danh hôm nay (Đủ 1.0 công)"** kèm giờ vào - giờ ra.

### 2. Bảng Điểm danh Nhanh Theo Ngày (Daily Roll Call - Dành cho `MANAGER`, `CB_PAYROLL`, `HR_ADMIN`)
Trong **VIEW 7 (`#view-attendance-logs`)**, bổ sung chế độ xem **"Bảng điểm danh ngày"**:
- Cho phép chọn ngày cần điểm danh (mặc định là ngày hiện tại `2026-11-16`).
- Hiển thị danh sách toàn bộ nhân sự đang làm việc (`work_status = 'WORKING'`, lọc theo `data_scope`: Trưởng phòng chỉ thấy nhân viên phòng mình, C&B/HR thấy toàn công ty) ghép (`LEFT JOIN`) với bảng `attendance_logs` và `leave_requests` trong ngày đó:
  - Nhân viên đã tự Check-in: Hiển thị giờ vào, giờ ra, số phút muộn.
  - Nhân viên có đơn nghỉ phép đã duyệt trùng ngày đó: Tự động hiển thị Badge **"Nghỉ phép có lương (`LEAVE_SYNC`)"**.
  - Nhân viên chưa điểm danh: Hiển thị trạng thái **"Chưa điểm danh"** kèm các nút thao tác nhanh ngay trên dòng cho Quản lý / C&B:
    - **`[Điểm danh Có mặt (1.0 công)]`**: Tự động tạo bản ghi `attendance_logs` đủ công chuẩn theo ca (`08:00 - 17:30`, `status = 'VALID'`).
    - **`[Nửa ngày (0.5 công)]`**: Tạo bản ghi `work_unit = 0.50`.
    - **`[Vắng không phép (0.0 công)]`**: Tạo bản ghi `work_unit = 0.00`, `status = 'ABSENT'`.
  - Có nút **`[Điểm danh Có mặt tất cả người chưa chấm]`** để C&B hoặc Trưởng phòng điểm danh nhanh 1 chạm cho cả phòng ban, đồng thời tự động cập nhật lại bảng tổng hợp công tháng (`monthly_timesheets`).


  ---

## VI. ĐẶC TẢ LUỒNG CHẤM CÔNG NHẬN DIỆN KHUÔN MẶT QUA WEBCAM (FACEID MODAL)

### 1. Nguyên tắc hoạt động
- Khi người dùng bấm nút **`[Chấm công Vào ca (Check-in)]`** hoặc **`[Chấm công Tan ca (Check-out)]`**, hệ thống **không** gọi API lưu ngay mà bắt buộc mở **Cửa sổ Popup Camera FaceID (`#modal-faceid-camera`)** ngay trong file giao diện hiện tại.
- Chỉ sau khi quét khuôn mặt qua Webcam thật, đạt chất lượng và chớp mắt hợp lệ, rồi đối chiếu sinh trắc học thành công thì mới gọi API lưu giờ chấm công xuống bảng `attendance_logs` với `source = 'FACE_ID'`. Không hỗ trợ mẫu mô phỏng.

### 2. Giao diện & Trải nghiệm trên Modal `#modal-faceid-camera`
- **Khung hiển thị Camera**:
  - Sử dụng thẻ `<video id="faceid-video" autoplay muted playsinline>` kết nối với `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })`.
  - Phủ lên trên `<video>` một lớp khung định vị khuôn mặt (Face Bounding Box dạng 4 góc vuông) và vạch tia quét (Laser Scan Line) chuyển động lên xuống bằng CSS.
- **Thông tin đối chiếu thời gian thực**:
  - Hiển thị đồng hồ giây thực tế (`HH:mm:ss - DD/MM/YYYY`).
  - Hiển thị thông tin nhân sự đang quét: `currentUser.employee_code` - `currentUser.full_name` - `currentUser.department_name`.
  - Hiển thị Ca làm việc áp dụng hôm nay (VD: `CA_HC: 08:00 - 17:30 | Ân hạn: 15 phút`).
- **Quy trình quét 3 bước tự động (1.5 - 2 giây)**:
  - *Bước 1 (0.5s)*: Hiển thị trạng thái `"Đang khởi động cảm biến Camera & định vị khuôn mặt..."` (Khung viền màu xanh dương).
  - *Bước 2 (1.0s)*: Hiển thị trạng thái `"Đang phân tích điểm đặc trưng sinh trắc học (Face Mesh)..."` (Khung viền màu vàng cam).
  - *Bước 3 (Hoàn tất)*: Khung viền chuyển sang **Màu xanh lá**, hiển thị `"Xác thực khớp 99.6%: [Mã NV] - [Họ tên]"` và mở khóa nút **`[Xác nhận & Ghi nhận Chấm công]`** (hoặc tự động gửi API sau 1 giây).
- **Xử lý lỗi Camera**:
  - Nếu `getUserMedia` báo lỗi, hiển thị lý do cụ thể (quyền bị chặn, không có webcam, camera bận, cần HTTPS/localhost).
  - Không chuyển sang mẫu mô phỏng; người dùng phải dùng webcam thật để đăng ký và điểm danh.
- **Giải phóng tài nguyên**: Ngay khi đóng Modal hoặc chấm công xong, bắt buộc gọi `stream.getTracks().forEach(track => track.stop())` để tắt đèn Webcam trên máy tính.

### 3. Xử lý tại Backend API sau khi FaceID xác thực thành công
- **API `POST /attendance/check-in`** và **`POST /attendance/check-out`**:
  - Nhận `embeddings` (5 vector từ `@vladmandic/human`) và `blink_verified: true`. `source` được server gán là `FACE_ID`.
  - Khi **Check-in**:
    - Lấy giờ hiện tại trên Server đối chiếu với `start_time` và `grace_minutes` của ca làm việc trong bảng `work_shifts`.
    - Nếu giờ vào lớn hơn `(start_time + grace_minutes)`: Tính số phút đi muộn `late_minutes`, gán `status = 'LATE'`. Ngược lại: `late_minutes = 0`, `status = 'VALID'`.
    - `INSERT INTO attendance_logs` với `source = 'FACE_ID'`, `work_unit = 0.50` (tạm tính khi mới vào ca), `note = 'FaceID Verified (99.6%)'`.
  - Khi **Check-out**:
    - Cập nhật `check_out = CURRENT_TIME`, tính lại `work_unit = 1.00` (nếu đủ giờ ca) hoặc `0.50`, cập nhật `early_leave_minutes` (nếu về sớm).
    - **Đồng bộ ngay sang bảng `monthly_timesheets`**: Đếm lại tổng công thực tế (`SUM(work_unit)`), tổng lần đi muộn (`late_count`), tổng phút đi muộn (`total_late_minutes`) và cập nhật `total_payable_days = actual_work_days + paid_leave_days` của nhân viên đó trong tháng hiện tại (`YYYY-MM`).


    # ĐẶC TẢ KỸ THUẬT & NGUYÊN TẮC TRIỂN KHAI CHẶNG 2
## Phân hệ 2: Quản lý Chấm công (FaceID 1:1) & Phân hệ 3: Quản lý Phép

---

## I. 6 NGUYÊN TẮC CỐT LÕI BẮT BUỘC (STRICT RULES)

1. **Nguyên tắc 1 — Tuyệt đối không tạo file mới (Zero New Files):**
   - Toàn bộ API của Chặng 2 chỉ được viết nối tiếp vào file Backend hiện có.
   - Toàn bộ 4 Màn hình động (`VIEW 6` -> `VIEW 9`), 5 Cửa sổ Popup (`MODAL 6` -> `MODAL 10`) và thẻ `<script>` nhúng thư viện `@vladmandic/face-api` qua CDN chỉ được viết trực tiếp vào file Giao diện hiện có.
2. **Nguyên tắc 2 — Sử dụng 100% Dữ liệu thật từ TiDB Cloud:**
   - Tuyệt đối không dùng dữ liệu giả (mock data) cứng ở Frontend.
   - Mọi thao tác Check-in/Check-out, điểm danh ngày, phân ca, đăng ký/duyệt OT, tạo/duyệt đơn nghỉ phép, chốt bảng công đều phải đọc/ghi trực tiếp trên TiDB Cloud.
3. **Nguyên tắc 3 — Xác thực Khuôn mặt 1:1 bằng AI (`@vladmandic/face-api` CDN):**
   - Nhúng thư viện `https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js` và tải 3 model từ CDN `https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/` (`tinyFaceDetector`, `faceLandmark68TinyNet`, `faceRecognitionNet`).
   - Đối chiếu mảng 128 số thực (`liveDescriptor`) quét từ Webcam với cột `employees.face_descriptor` của chính tài khoản đang đăng nhập bằng hàm `faceapi.euclideanDistance()`.
   - Nếu khoảng cách `distance < 0.45`: Khớp chủ tài khoản -> Cho phép chấm công.
   - Nếu khoảng cách `distance >= 0.45`: Cảnh báo đỏ "Khuôn mặt không khớp với chủ tài khoản! Chặn chấm công hộ."
   - Hỗ trợ chế độ Đăng ký mẫu mặt lần đầu (nếu `face_descriptor IS NULL`), nút Đặt lại mẫu FaceID, và chế độ Dự phòng (Fallback) nếu máy bàn không có thiết bị Webcam.
4. **Nguyên tắc 4 — Đồng bộ Liên bảng Tuần tự tại Backend (Không dùng Trigger):**
   - Do không dùng Trigger SQL, mỗi khi phát sinh Check-in/Check-out, Điểm danh nhanh, Giải trình công, Duyệt OT hoặc Duyệt đơn nghỉ phép, API Backend phải tự động chạy câu lệnh tính toán và cập nhật ngay vào bảng `monthly_timesheets` và `leave_balances`.
5. **Nguyên tắc 5 — Khóa sổ Bảng công (`LOCKED`):**
   - Khi bảng công tháng của kỳ `YYYY-MM` đã chuyển sang trạng thái `LOCKED`, Backend bắt buộc chặn mọi thao tác sửa công, duyệt thêm OT hoặc duyệt thêm đơn nghỉ phép thuộc tháng đó.
6. **Nguyên tắc 6 — Phân quyền & Phạm vi dữ liệu (`data_scope` & `permission_code`):**
   - `ALL` (`DIRECTOR`, `HR_ADMIN`, `CB_PAYROLL`, `OFFICE_ADMIN`, `SUPER_ADMIN`): Xem dữ liệu toàn công ty theo quyền được cấp.
   - `DEPARTMENT` (`MANAGER` - Trưởng phòng): Chỉ xem, phân ca, điểm danh, duyệt OT và duyệt nghỉ phép cho nhân viên thuộc đúng `department_id` của mình.
   - `SELF` (`EMPLOYEE` - Nhân viên): Chỉ xem bảng công, quỹ phép của bản thân (`currentUser.employee_id`), tự bấm Check-in/Check-out FaceID, gửi giải trình, đăng ký OT và tạo đơn xin nghỉ phép.

---

## II. CẤU TRÚC DATABASE CHẶNG 2 TRÊN TIDB CLOUD (7 BẢNG MỚI + 1 CỘT MỚI)

Code Backend và Frontend bắt buộc gọi đúng tên bảng và tên cột dưới đây:

0. **Bổ sung cột trong bảng `employees` (Đã có từ Chặng 1):**
   - Cột mới: `face_descriptor` (`TEXT DEFAULT NULL` - Lưu chuỗi JSON mảng 128 số thực `[-0.041, 0.128, ...]`).
1. **Bảng `work_shifts` (Danh mục Ca làm việc):**
   - Cột: `id`, `shift_code` (`'CA_HC'`, `'CA_TRUC_IT'`, `'CA_SANG'`, `'CA_CHIEU'`), `name`, `start_time`, `end_time`, `break_minutes`, `standard_work_units` (`1.00` hoặc `0.50`), `grace_minutes` (số phút ân hạn đi muộn, mặc định `15`), `is_active`.
2. **Bảng `employee_shifts` (Phân ca nhân viên):**
   - Cột: `id`, `employee_id`, `shift_id`, `effective_from`, `effective_to`, `work_days` (`'MON,TUE,WED,THU,FRI'`), `note`.
3. **Bảng `attendance_logs` (Nhật ký chấm công & Điểm danh hàng ngày):**
   - Cột: `id`, `employee_id`, `work_date` (`UNIQUE(employee_id, work_date)`), `shift_id`, `check_in`, `check_out`, `late_minutes`, `early_leave_minutes`, `work_unit` (`1.00`, `0.50`, `0.00`), `source` (`'FACE_ID'`, `'FINGERPRINT'`, `'MANUAL_ADJUST'`, `'LEAVE_SYNC'`), `status` (`'VALID'`, `'LATE'`, `'MISSING_CHECKOUT'`, `'EXPLAINED'`, `'ABSENT'`), `note`.
4. **Bảng `overtime_requests` (Đơn đăng ký & phê duyệt OT):**
   - Cột: `id`, `ot_code` (`UNIQUE`), `employee_id`, `ot_date`, `start_time`, `end_time`, `ot_hours`, `ot_type` (`'WEEKDAY_150'`, `'WEEKEND_200'`, `'HOLIDAY_300'`), `multiplier` (`1.50`, `2.00`, `3.00`), `reason`, `status` (`'PENDING'`, `'APPROVED'`, `'REJECTED'`), `approved_by`, `approved_at`, `reject_reason`, `created_at`.
5. **Bảng `monthly_timesheets` (Bảng tổng hợp công tháng - Đầu vào tính lương):**
   - Cột: `id`, `month_year` (`'YYYY-MM'`), `employee_id` (`UNIQUE(month_year, employee_id)`), `standard_days` (`21.00` hoặc `22.00`), `actual_work_days`, `paid_leave_days`, `unpaid_leave_days`, `total_payable_days` (`= actual_work_days + paid_leave_days`), `late_count`, `total_late_minutes`, `ot_hours_150`, `ot_hours_200`, `ot_hours_300`, `status` (`'OPEN'`, `'LOCKED'`), `locked_by`, `locked_at`.
6. **Bảng `leave_balances` (Quỹ phép năm & Kết chuyển):**
   - Cột: `id`, `year`, `employee_id` (`UNIQUE(year, employee_id)`), `annual_quota` (`12.0`), `carried_over`, `seniority_bonus`, `used_days`, `pending_days`, `remaining_days`.
7. **Bảng `leave_requests` (Đơn xin nghỉ phép & Vắng mặt):**
   - Cột: `id`, `request_code` (`UNIQUE`), `employee_id`, `leave_type` (`'ANNUAL_LEAVE'`, `'SICK_LEAVE'`, `'UNPAID_LEAVE'`, `'WEDDING_FUNERAL'`, `'MATERNITY_LEAVE'`), `is_paid` (`1`: Hưởng lương công ty, `0`: Không hưởng lương công ty), `from_date`, `to_date`, `total_days`, `reason`, `handover_to`, `status` (`'PENDING'`, `'APPROVED'`, `'REJECTED'`), `approved_by`, `approved_at`, `reject_reason`, `created_at`.

---

## III. ĐẶC TẢ 4 MÀN HÌNH HIỂN THỊ ĐỘNG (DYNAMIC VIEWS: VIEW 6 -> VIEW 9)

### 1. VIEW 6: Màn hình Bảng Tổng hợp Công Tháng & Chốt công (`#view-monthly-timesheet`)
- **Thanh công cụ:** Chọn kỳ công (`2026-11`, `2026-10`), lọc theo Phòng ban (`department_id`), Trạng thái (`OPEN`, `LOCKED`).
- **Bảng dữ liệu:**
  - Cột: `Mã NV`, `Họ tên`, `Phòng ban`, `Công chuẩn`, `Công thực tế (actual_work_days)`, `Nghỉ có lương (paid_leave_days)`, `Nghỉ không lương (unpaid_leave_days)`, **`Tổng công tính lương (total_payable_days)`**, `Đi muộn (Số lần / Tổng phút)`, `Giờ OT (150% / 200% / 300%)`, `Trạng thái` (Badge Xanh `OPEN` / Đỏ `LOCKED`).
- **Nút hành động (Chỉ hiện khi có quyền `ATT.SHIFT_OT_MANAGE` - đặc biệt là `CB_PAYROLL`):**
  - **`[🔄 Tính & Tổng hợp lại công tháng]`**: Quét toàn bộ `attendance_logs`, `leave_requests` (`APPROVED`), `overtime_requests` (`APPROVED`) trong tháng để cập nhật lại bảng `monthly_timesheets`.
  - **`[🔒 Chốt & Khóa bảng công tháng]`**: Chuyển toàn bộ bản ghi của tháng đang chọn sang `status = 'LOCKED'`.

### 2. VIEW 7: Màn hình Điểm danh FaceID, Nhật ký Quẹt thẻ & Phân ca (`#view-attendance-logs`)
- **Khu vực 1 (Trên cùng) — Thanh Widget Điểm danh Cá nhân Thời gian thực:**
  - Hiển thị Đồng hồ giây thực tế (`HH:mm:ss - DD/MM/YYYY`), Ca làm việc hôm nay của người đang đăng nhập (`CA_HC: 08:00 - 17:30`), Trạng thái mẫu sinh trắc học (`Đã đăng ký FaceID` hoặc `Chưa đăng ký FaceID`).
  - Nút bấm thông minh theo trạng thái ngày hôm nay (`CURRENT_DATE`):
    - Chưa có `check_in`: Hiện nút **`[🟢 Quét FaceID Vào ca (Check-in)]`**.
    - Đã có `check_in` nhưng `check_out IS NULL`: Hiện giờ vào ca sáng nay + nút **`[🔴 Quét FaceID Tan ca (Check-out)]`**.
    - Đã có đủ `check_in` và `check_out`: Hiện Badge xanh **`[✓ Đã hoàn thành điểm danh hôm nay]`** + nút nhỏ **`[⚙️ Đặt lại mẫu FaceID]`**.
- **Khu vực 2 (Bên dưới) — Chia làm 3 Tab chuyển đổi:**
  - **Tab 7.1 — Bảng Điểm danh Nhanh Theo Ngày (Daily Roll Call - Cho `MANAGER`, `CB_PAYROLL`, `HR_ADMIN`):**
    - Chọn ngày cần điểm danh (mặc định ngày hiện tại `2026-11-16`).
    - Hiển thị toàn bộ nhân sự đang làm việc (`WORKING`) ghép (`LEFT JOIN`) với `attendance_logs` và `leave_requests` trong ngày đó.
    - Trên từng dòng nhân viên chưa chấm công, Quản lý / C&B có 3 nút bấm nhanh 1 chạm: **`[Đủ công (1.0)]`**, **`[Nửa ngày (0.5)]`**, **`[Vắng (0.0)]`** và nút trên đầu bảng **`[✓ Điểm danh Có mặt tất cả người chưa chấm]`**.
  - **Tab 7.2 — Nhật ký Quẹt thẻ Chi tiết (`attendance_logs`):**

  <!-- Nhúng thư viện @vladmandic/human bản chuẩn từ CDN -->
<script src="https://cdn.jsdelivr.net/npm/@vladmandic/human/dist/human.js"></script>



TOÀN BỘ CHỨC NĂNG 1 ĐỀU VIẾT VÀO CHẶNG 1 KO DC VIẾT THÊM THÔI KO DC XOÁ, CÁI CHẶNG 2 LÀ DÀNH CÒN QUÉT KHUÔN MẶT... VÀ MỘT VÀI CÁI KHÁC, CÓ RỒI
CHHECK KO QUÁ MUỘN 15P, CHƯA XONG DDAAU 10H VÀO TIẾP THỐNG NHẤT CHIA NHAU LÀM 
AI LIST RA TẤT CẢ CÁC CHỨC NĂNG CÒN THIEEU ĐI
THẾ OFF ĐIN 10 H FVAF