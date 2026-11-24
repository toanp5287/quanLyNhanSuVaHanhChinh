TÀI LIỆU ĐẶC TẢ TỔNG HỢP THAY ĐỔI MODULE CHẤM CÔNG VÀ CAM FACEID1. TỔNG QUAN VỀ ĐỢT NÂNG CẤPĐợt nâng cấp này tập trung giải quyết 3 bài toán chính:Tối ưu hóa trải nghiệm chấm công: Nhân viên làm ca full 8 tiếng chỉ cần quét 2 lần (Vào – Ra) thay vì 4 lần như trước. Giờ nghỉ trưa được hệ thống tự động tính toán và khấu trừ.Nới lỏng luồng chấm giờ Ra (CHECK_OUT): Cho phép chấm Ra ở bất kỳ thời điểm nào trong ngày (sáng, trưa, chiều, về sớm đột xuất) miễn là đã có dữ liệu giờ Vào trong ngày.Cấu hình tùy chỉnh 100% (Zero-Hardcode): Tách toàn bộ quy tắc ca làm việc, mốc công, luật chấm cam và ngưỡng AI ra khỏi code. Quản trị viên (Admin/HR) tự thiết lập mọi thông số trên giao diện Admin.2. SO SÁNH LOGIC CŨ VS LOGIC MỚIHạng mụcLogic cũLogic mới (Đã cải tiến)Số lần quét ca full 8hPhải quét 4 lần (Vào sáng, Ra trưa, Vào chiều, Ra chiều) hoặc bị khóa khung giờ.Chỉ quét 2 lần (Vào sáng – Ra chiều). Hệ thống tự động khấu trừ thời gian nghỉ trưa dựa trên khung ca.Ràng buộc giờ Chấm RaKhóa chấm Ra theo khung giờ định sẵn (ví dụ: sau 16:30 mới cho chấm Ra).Mở khóa chấm Ra bất kỳ lúc nào, miễn đã có bản ghi CHECK_IN hợp lệ trong ngày.Xử lý Chấm Ra khi chưa Chấm VàoDễ bị nhảy nhầm thành CHECK_IN hoặc ghi nhận sai luồng.Bắt buộc chặn (Block): Trả lỗi 400 NO_CHECK_IN_FOUND, Cam phát âm thanh cảnh báo không cho phép chấm Ra.Chống quét đúp liên tiếpPhụ thuộc vào delay của Cam client.Kiểm tra đa tầng (Backend Guard): Chặn các lần quét cách CHECK_IN ít hơn $N$ phút (anti_double_punch_minutes, mặc định 3 phút).Quét Ra nhiều lần trong ngàyKhó xử lý hoặc gây đè sai lệch dữ liệu.Linh hoạt cấu hình (checkout_repeat_policy): Cho phép chọn Ghi đè giờ Ra mới nhất (Last-OUT Overwrite) hoặc Khóa cứng lần Ra đầu tiên.Quy đổi Ngày côngViết cứng điều kiện if/else cố định 1.0 công và 0.5 công.Hỗ trợ 2 chế độ cấu hình: Tỷ lệ thực tế (PRO_RATA) hoặc Bậc thang tùy chỉnh (CUSTOM_TIERS) do Admin tự tạo không giới hạn mốc.Khóa lịch sử chấm côngĐổi quy chế hôm nay làm sai lệch bảng công các tháng trước.Cơ chế Snapshot (policy_snapshot): Lưu cứng bản chụp JSON của luật tính công vào dòng bản ghi chấm công ngay khi chốt công trong ngày.3. LUỒNG XỬ LÝ VẬN HÀNH CỦA CAM FACEID (CAMERA KIOSK FLOW)3.1 Quy trình xác định hành động (CHECK_IN / CHECK_OUT)Khi máy chấm công AI nhận diện thành công mã nhân viên (employee_id): [Nhận diện thành công Employee ID]
│
▼
[Kiểm tra dữ liệu chấm công hôm nay]
│
┌──────────────────────────┴──────────────────────────┐
▼ ▼
[Chưa có dữ liệu CHECK_IN] [Đã có dữ liệu CHECK_IN]
│ │
├──────────────────────────┐ ├──────────────────────────┐
▼ ▼ ▼ ▼
(Chế độ AUTO / Nút VÀO) (Bấm nút RA) (Chế độ AUTO / Nút RA) (Bấm nút VÀO)
│ │ │ │
▼ ▼ ▼ ▼
[Ghi nhận CHECK_IN] [CHẶN & CẢNH BÁO] [Kiểm tra Anti-Double] [CHẶN & CẢNH BÁO]

- Giữ nguyên logic cũ "Chưa có dữ liệu vào, - Nếu < N phút: Từ chối "Bạn đã chấm vào
- Tính late_minutes không thể chấm ra!" - Nếu >= N phút: Cập nhật hôm nay rồi!"
- Khởi tạo attendance check*out_time & tính công
  3.2 Các quy tắc bảo mật & trải nghiệm tại CamChặn quét nhầm đi ngang qua (Confirm Delay): Khi ở chế độ Auto, nếu nhân viên đã có CHECK_IN, màn hình hiển thị đếm ngược $X$ giây (VD: 2 giây) kèm nút hủy trước khi chính thức chốt CHECK_OUT.Chống quét đúp (anti_double_punch_minutes): Nếu thời điểm quét Ra cách thời điểm quét Vào dưới thời gian thiết lập (ví dụ: $< 3\text{ phút}$), hệ thống từ chối ghi nhận để tránh trường hợp vừa chấm Vào xong quay mặt lại bị dính chấm Ra ngay.Cập nhật giờ Ra mới nhất (Last-OUT Overwrite): Nhân viên đã chấm Ra lúc 16:30 nhưng ở lại làm tiếp đến 17:45 quét lại → Hệ thống tự ghi đè check_out_time = 17:45 và chạy lại thuật toán tính công.4. THUẬT TOÁN TÍNH CÔNG ĐỘNG (CALCULATION ENGINE)4.1 Thuật toán tự động trừ giờ nghỉ trưa (Interval Overlap)Hệ thống sử dụng toán học khoảng thời gian để tự động khấu trừ phần nghỉ trưa nằm trong khung làm việc thực tế mà không cần nhân viên quét thẻ lúc 12:00 và 13:30.Định nghĩa các thông số:$\text{shift\_start},\ \text{shift\_end}$: Giờ bắt đầu và kết thúc ca làm việc.$\text{break\_start},\ \text{break\_end}$: Giờ bắt đầu và kết thúc nghỉ trưa.$\text{check\_in},\ \text{check\_out}$: Giờ quét vào và quét ra thực tế của nhân viên.$\text{grace\_late}$: Số phút ân hạn đi muộn (ví dụ: 5 phút).Các bước tính toán:Bước 1: Kẹp biên thời gian (Clamping & Grace Period)
  $$T*{\text{start}} = \begin{cases} \text{shift_start} & \text{nếu } \text{check_in} \le \text{shift_start} + \text{grace_late} \\ \text{check_in} & \text{nếu ngược lại} \end{cases}$$$$T*{\text{end}} = \min(\text{check_out},\ \text{shift_end})$$(Ghi chú: Đi sớm trước giờ ca sẽ tính từ đầu ca; về sau giờ ca chỉ tính đến cuối ca trừ khi có đơn đăng ký OT được duyệt).Bước 2: Tính phút đi muộn và về sớm
$$\text{LateMinutes} = \max\Big(0,\ \text{check_in} - \text{shift_start} - \text{BreakOverlap}(\text{shift_start}, \text{check_in})\Big)$$$$\text{EarlyLeaveMinutes} = \max\Big(0,\ \text{shift_end} - \text{check_out} - \text{BreakOverlap}(\text{check_out}, \text{shift_end})\Big)$$Bước 3: Tính thời gian trùng với giờ nghỉ trưa ($\text{BreakOverlap}$)
$$\text{BreakOverlap} = \max\Big(0,\ \min(T*{\text{end}}, \text{break_end}) - \max(T*{\text{start}}, \text{break_start})\Big)$$Bước 4: Tính tổng số phút và số giờ làm việc thực tế ($\text{NetHours}$)
$$\text{NetMinutes} = \max\Big(0,\ (T*{\text{end}} - T\_{\text{start}}) - \text{BreakOverlap}\Big)$$$$\text{NetHours} = \frac{\text{NetMinutes}}{60}$$4.2 Các chế độ quy đổi Ngày công (work_day)Admin có thể tùy chỉnh 1 trong 2 chế độ quy đổi trong bộ policy:Chế độ 1: Tính theo tỷ lệ thực tế (PRO_RATA)$$\text{WorkDay} = \min\left(\text{max_work_day},\ \text{Round}\left(\frac{\text{NetHours}}{\text{standard_work_hours}},\ \text{step}\right)\right)$$
Ví dụ: Ca 8.0h chuẩn, nhân viên làm 6.0h thực tế, bước làm tròn step = 0.25 $\rightarrow \text{WorkDay} = 0.75\text{ công}$.Chế độ 2: Tính theo bậc thang tùy chỉnh (CUSTOM_TIERS)Hệ thống so sánh $\text{NetHours}$ với bảng bậc công (sắp xếp giảm dần):$$\text{WorkDay} = \begin{cases} 1.00 & \text{nếu } \text{NetHours} \ge 7.5 \\ 0.75 & \text{nếu } \text{NetHours} \ge 6.0 \\ 0.50 & \text{nếu } \text{NetHours} \ge 4.0 \\ 0.00 & \text{nếu } \text{NetHours} < 4.0 \end{cases}$$5. BẢNG MÔ PHỎNG KẾT QUẢ TÍNH CÔNG THỰC TẾGiả định Ca hành chính: 08:00 – 17:30, Nghỉ trưa 12:00 – 13:30 (90 phút), Ân hạn đi muộn 5 phút, Công chuẩn 8.0 giờ.STTTình huống thực tếGiờ VàoGiờ RaTrừ trưaThực làm (NetHours)Đi muộn / Về sớmNgày công (PRO_RATA)Ngày công (CUSTOM_TIERS)1Full ca chuẩn (không quét trưa)07:5217:3590 phút8.00h0p / 0p1.00 công1.00 công2Vào muộn 4 phút (trong ân hạn)08:0417:3090 phút8.00h0p / 0p1.00 công1.00 công3Chỉ làm buổi sáng (về lúc trưa)08:0012:000 phút4.00h0p / 330p0.50 công0.50 công4Về trễ buổi trưa (12:30 mới về)08:0012:3030 phút4.00h0p / 300p0.50 công0.50 công5Chỉ làm buổi chiều13:3017:300 phút4.00h270p / 0p0.50 công0.50 công6Muộn 1h sáng + Về sớm 1h chiều09:0016:3090 phút6.00h60p / 60p0.75 công0.75 công7Về đột xuất giữa ca sáng08:0010:000 phút2.00h0p / 450p0.25 công0.00 công8Quên chấm giờ Ra08:00(Trống)—0.00h0p / 0p0.00 công0.00 công (chờ giải trình)6. SCRIPT NÂNG CẤP DATABASE (TƯƠNG THÍCH CHUẨN TIDB / MYSQL 8)Script dưới đây sử dụng cú pháp ADD COLUMN IF NOT EXISTS an toàn tuyệt đối cho TiDB Cloud / Server, có thể thực thi lại nhiều lần mà không gây ra lỗi trùng cột hay trùng tên khóa ngoại.-- =============================================================================
  -- 1. TẠO BẢNG QUY TẮC TÍNH CÔNG ĐỘNG (ATTENDANCE POLICIES)
  -- =============================================================================
  CREATE TABLE IF NOT EXISTS attendance_policies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  rules_json JSON NOT NULL,
  created_by INT NULL,
  updated_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  );

-- =============================================================================
-- 2. TẠO BẢNG CẤU HÌNH CAM CHẤM CÔNG & AI (CAMERA KIOSK CONFIGS)
-- =============================================================================
CREATE TABLE IF NOT EXISTS camera_kiosk_configs (
id INT AUTO_INCREMENT PRIMARY KEY,
branch_id INT NULL UNIQUE,
punch_mode ENUM('AUTO_SMART', 'MANUAL_TABS') NOT NULL DEFAULT 'AUTO_SMART',
require_checkin_for_checkout TINYINT(1) NOT NULL DEFAULT 1,
anti_double_punch_minutes INT NOT NULL DEFAULT 3,
checkout_repeat_policy ENUM('OVERWRITE_LATEST', 'LOCK_FIRST') NOT NULL DEFAULT 'OVERWRITE_LATEST',
checkout_confirm_seconds INT NOT NULL DEFAULT 2,
show_estimated_workday TINYINT(1) NOT NULL DEFAULT 1,
ai_config_json JSON NULL,
network_config_json JSON NULL,
updated_by INT NULL,
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =============================================================================
-- 3. CẬP NHẬT NÂNG CẤP BẢNG ATTENDANCES (LƯU KẾT QUẢ & SNAPSHOT)
-- =============================================================================
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS shift_id INT NULL;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS policy_snapshot JSON NULL;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS net_work_minutes INT NOT NULL DEFAULT 0;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS work_day DECIMAL(4,2) NOT NULL DEFAULT 0.00;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS late_minutes INT NOT NULL DEFAULT 0;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS early_leave_minutes INT NOT NULL DEFAULT 0;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS recalculated_at DATETIME NULL;

-- =============================================================================
-- 4. CẬP NHẬT NÂNG CẤP BẢNG WORK_SHIFTS (CẤU HÌNH CA TÙY CHỈNH)
-- =============================================================================
ALTER TABLE work_shifts ADD COLUMN IF NOT EXISTS is_overnight TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE work_shifts ADD COLUMN IF NOT EXISTS has_break TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE work_shifts ADD COLUMN IF NOT EXISTS break_start TIME NULL DEFAULT '12:00:00';
ALTER TABLE work_shifts ADD COLUMN IF NOT EXISTS break_end TIME NULL DEFAULT '13:30:00';
ALTER TABLE work_shifts ADD COLUMN IF NOT EXISTS require_break_punch TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE work_shifts ADD COLUMN IF NOT EXISTS standard_work_hours DECIMAL(4,2) NOT NULL DEFAULT 8.00;
ALTER TABLE work_shifts ADD COLUMN IF NOT EXISTS checkin_open_before_min INT NULL DEFAULT 120;
ALTER TABLE work_shifts ADD COLUMN IF NOT EXISTS checkin_close_after_min INT NULL DEFAULT NULL;
ALTER TABLE work_shifts ADD COLUMN IF NOT EXISTS allow_checkout_anytime TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE work_shifts ADD COLUMN IF NOT EXISTS working_days JSON NULL;
ALTER TABLE work_shifts ADD COLUMN IF NOT EXISTS policy_id INT NULL;

-- =============================================================================
-- 5. SEED DỮ LIỆU CẤU HÌNH MẶC ĐỊNH HỆ THỐNG
-- =============================================================================
INSERT IGNORE INTO attendance_policies (code, name, is_default, rules_json)
VALUES (
'DEFAULT_OFFICE',
'Quy chế Hành chính chuẩn (8h - Tự trừ trưa)',
1,
JSON_OBJECT(
'work_day_mode', 'PRO_RATA',
'pro_rata', JSON_OBJECT('round_step', 0.25, 'round_method', 'ROUND'),
'tiers', JSON_ARRAY(
JSON_OBJECT('min_hours', 7.5, 'work_day', 1.0, 'label', 'Đủ công'),
JSON_OBJECT('min_hours', 6.0, 'work_day', 0.75, 'label', '3/4 công'),
JSON_OBJECT('min_hours', 4.0, 'work_day', 0.5, 'label', 'Nửa công'),
JSON_OBJECT('min_hours', 0.0, 'work_day', 0.0, 'label', 'Không đủ công')
),
'max_work_day', 1.0,
'grace_late_minutes', 5,
'grace_early_minutes', 0,
'clamp_early_in', true,
'clamp_late_out', true,
'missing_checkout_action', 'ZERO_WAIT_EXPLAIN',
'explain_deadline_days', 3
)
);

INSERT IGNORE INTO camera_kiosk_configs (
id, branch_id, punch_mode, require_checkin_for_checkout,
anti_double_punch_minutes, checkout_repeat_policy, checkout_confirm_seconds,
show_estimated_workday, ai_config_json, network_config_json
)
VALUES (
1, NULL, 'AUTO_SMART', 1, 3, 'OVERWRITE_LATEST', 2, 1,
JSON_OBJECT('similarity_threshold', 0.65, 'voting_frames', 3, 'anti_smile_gate', true, 'liveness_enabled', true),
JSON_OBJECT('strict_ip', false, 'allowed_ips', JSON_ARRAY(), 'exempt_department_ids', JSON_ARRAY(), 'exempt_employee_ids', JSON_ARRAY())
);

-- Gắn policy mặc định cho các ca hiện có
UPDATE work_shifts
SET
policy_id = COALESCE(policy_id, (SELECT id FROM attendance_policies WHERE code = 'DEFAULT_OFFICE' LIMIT 1)),
working_days = COALESCE(working_days, JSON_ARRAY(1, 2, 3, 4, 5, 6)); 7. ĐẮC TẢ CẤU TRÚC SNAPSHOT DỮ LIỆU (policy_snapshot)Mỗi dòng công trong bảng attendances khi lưu lại sẽ chứa toàn bộ thông tin cấu hình tại thời điểm chấm công:{
"shift": {
"code": "HC_FULL",
"start_time": "08:00:00",
"end_time": "17:30:00",
"has_break": true,
"break_start": "12:00:00",
"break_end": "13:30:00",
"require_break_punch": false,
"standard_work_hours": 8.0
},
"policy": {
"code": "DEFAULT_OFFICE",
"work_day_mode": "PRO_RATA",
"grace_late_minutes": 5,
"grace_early_minutes": 0,
"clamp_early_in": true,
"clamp_late_out": true
},
"calculated_at": "2026-11-21 17:35:00"
}
Ý nghĩa: Nếu tháng tới công ty thay đổi quy chế nghỉ trưa từ 12:00-13:30 thành 12:00-13:00, dữ liệu bảng công của các tháng cũ vẫn được giữ nguyên tính toàn vẹn tuyệt đối.
