TÀI LIỆU THIẾT KẾ PHÂN HỆ QUẢN LÝ CA & CHẤM CÔNG (ATTENDANCE ENGINE)🤖 BỐI CẢNH CẬP NHẬT CHẶNG 2 (DÀNH CHO AI / CODING ASSISTANT)Hướng dẫn cho AI: Hãy đọc kỹ mục này để nắm bắt sự thay đổi kiến trúc từ Chặng 1 sang Chặng 2 trước khi sinh code Backend/Frontend. Tuyệt đối tuân thủ cấu trúc bảng mới và luồng gọi hàm recalculateDailyAttendance().1. Tóm tắt Tiến độ Dự ánChặng 1 (Đã hoàn thành): Đã xây dựng xong tính năng quét khuôn mặt (FaceID) kết hợp kiểm tra địa chỉ IP Wifi văn phòng. Nhân viên đã có thể đứng trước camera và quét nhận diện thành công.Chặng 2 (Cập nhật hiện tại): Nâng cấp hệ thống từ việc "chỉ ghi nhận lượt quét" thành Bộ máy Quản lý Ca & Đối soát Chấm công hoàn chỉnh (Attendance Reconciliation Engine), giải quyết trọn vẹn bài toán: phân ca, tính phút đi muộn/về sớm, xử lý người về trước/về sau lệch nhau nhiều tiếng, nghỉ phép nửa ngày và đối soát đơn Tăng ca (OT).2. Những gì đã thay đổi ở Chặng 2 (Changelog & Breaking Changes)A. Thay đổi Cấu trúc Database (Database Schema Changes)Tách bảng chấm công thành 2 tầng dữ liệu:attendance_logs (Mới): Lưu toàn bộ lịch sử quét FaceID thô (mỗi lần quét tạo 1 dòng, lưu face_score, ip_address, scan_time) để làm bằng chứng đối chiếu.attendances (Cập nhật cấu trúc): Chỉ lưu 1 dòng duy nhất cho mỗi nhân viên trong 1 ngày (UNIQUE KEY uk_emp_workdate (employee_id, work_date)). Bổ sung các cột tính toán: late_minutes, early_leave_minutes, actual_work_hours, base_workday, paid_leave_workday, total_workday, raw_ot_minutes, approved_ot_hours, ot_rate.Bổ sung 4 bảng nghiệp vụ mới:work_shifts: Danh mục cấu hình ca làm việc (start_time, end_time, break_start, break_end, grace_period, min_ot_minutes, standard_hours, is_default).employee_shifts: Bảng phân ca cho nhân viên theo khoảng thời gian hiệu lực (effective_from, effective_to).leave_requests: Bảng đơn xin nghỉ phép (FULL_DAY, MORNING, AFTERNOON) và đơn giải trình miễn phạt đi muộn/về sớm (LATE_EARLY_EXEMPT).overtime_requests: Bảng đơn đăng ký tăng ca (start_time, end_time, ot_rate, status).B. Thay đổi Logic Nghiệp vụ (Business Logic Changes)Nguyên tắc First In - Last Out & Chống quét đúp (Cooldown 30 phút):Lần quét đầu tiên trong ngày $\rightarrow$ Ghi vào check_in.Các lần quét tiếp theo trong ngày phải cách check_in ít nhất $30$ phút mới được cập nhật đè vào check_out. Nếu chưa đủ $30$ phút, chỉ lưu vào attendance_logs và trả cảnh báo cho người dùng.Chặn khung giờ chuẩn (Time Clamping):Nhân viên đến sớm trước giờ vào ca (07:45 so với 08:00) vẫn chỉ được tính giờ làm từ 08:00.Nhân viên về muộn sau giờ tan ca (18:30 so với 17:30) bị cắt mốc tính công hành chính ở 17:30 (tối đa 1.00 công chuẩn).Cơ chế Đối soát Tăng ca (OT) 2 lớp:Lớp 1 (raw_ot_minutes): Máy tự ghi nhận số phút nhân viên ra trễ sau giờ tan ca (check_out - end_time).Lớp 2 (approved_ot_hours): Chỉ khi có đơn trong bảng overtime_requests ở trạng thái APPROVED, hệ thống mới lấy phần giao nhau giữa giờ quét thực tế và giờ đơn duyệt để cộng giờ OT tính lương.Cơ chế Tự động Tính lại (recalculateDailyAttendance):Hàm recalculateDailyAttendance(db, employeeId, workDate) là hàm lõi duy nhất tính toán mọi chỉ số công.Bắt buộc gọi hàm này tại 3 điểm:Ngay sau khi nhân viên quét FaceID (POST /api/attendance/scan).Ngay sau khi Admin/Sếp bấm Duyệt hoặc Từ chối đơn Nghỉ phép (PATCH /api/leaves/:id/status).Ngay sau khi Admin/Sếp bấm Duyệt hoặc Từ chối đơn Tăng ca (PATCH /api/overtime/:id/status).1. Kiến trúc Tổng thể (Reconciliation Engine)Hệ thống chấm công hoạt động như một Bộ máy Đối soát (Reconciliation Engine) kết hợp 4 nguồn dữ liệu độc lập để tạo ra bảng công cuối cùng đẩy sang Module Tính lương (Payroll):Cấu hình Ca làm việc (work_shifts & employee_shifts): Quy định khung giờ chuẩn, giờ nghỉ trưa, số phút ân hạn đi muộn và số giờ làm việc tiêu chuẩn.Dữ liệu Quét thực tế (attendance_logs): Lưu toàn bộ lịch sử quét khuôn mặt thô (kèm độ khớp face_score và địa chỉ IP) theo nguyên tắc First In - Last Out.Đơn Nghỉ phép & Giải trình (leave_requests): Bù công phép có lương (nghỉ cả ngày, nghỉ nửa ngày) hoặc miễn trừ số phút đi muộn/về sớm có lý do.Đơn Đăng ký Tăng ca (overtime_requests): Đối chiếu với số phút nhân viên ở lại thêm sau giờ tan ca để tính giờ OT hợp lệ.2. Quy tắc Nghiệp vụ & Công thức Tính toán2.1. Quy đổi thời gian chuẩnMọi mốc thời gian dạng HH:mm:ss đều được quy đổi ra tổng số phút tính từ 00:00 để xử lý toán học chính xác tuyệt đối:08:00 $\rightarrow 8 \times 60 + 0 = 480$ phút12:00 $\rightarrow 12 \times 60 + 0 = 720$ phút13:30 $\rightarrow 13 \times 60 + 30 = 810$ phút17:30 $\rightarrow 17 \times 60 + 30 = 1050$ phút2.2. Chống quét đúp (Cooldown Protection)Lần quét hợp lệ đầu tiên trong ngày được ghi nhận vào check_in.Các lần quét tiếp theo phải cách thời điểm check_in ít nhất $30$ phút mới được ghi nhận là check_out (tránh trường hợp nhân viên đứng trước camera quét 2 lần liên tiếp lúc 08:00 sáng dẫn đến bị tính nhầm là Check-out về sớm).2.3. Điều chỉnh khung ca khi Nghỉ phép nửa ngàyNếu có đơn nghỉ phép Buổi Sáng (MORNING) đã duyệt: Mốc bắt đầu ca (shiftStart) tự động dời xuống giờ kết thúc nghỉ trưa (break_end, ví dụ 13:30).Nếu có đơn nghỉ phép Buổi Chiều (AFTERNOON) đã duyệt: Mốc kết thúc ca (shiftEnd) tự động dời lên giờ bắt đầu nghỉ trưa (break_start, ví dụ 12:00).2.4. Công thức tính Đi muộn & Về sớmĐi muộn (late_minutes): Nếu $\text{check\_in} > (\text{shiftStart} + \text{grace\_period})$:$$\text{late\_minutes} = \max\Big(0, (\text{check\_in} - \text{shiftStart}) - \text{exempt\_minutes}\Big)$$Về sớm (early_leave_minutes): Nếu $\text{check\_out} < \text{shiftEnd}$:$$\text{early\_leave\_minutes} = \max\Big(0, (\text{shiftEnd} - \text{check\_out}) - \text{exempt\_minutes}\Big)$$2.5. Nguyên tắc "Chặn khung giờ chuẩn" (Time Clamping) tính Công hành chínhĐể tránh việc nhân viên đi sớm 20 phút hoặc ngồi nán lại văn phòng chơi sau giờ làm để tự cộng dồn giờ công, hệ thống chặn hai đầu giờ làm việc trong khung ca chuẩn:$$\text{effectiveIn} = \max(\text{check\_in}, \text{shiftStart})$$$$\text{effectiveOut} = \min(\text{check\_out}, \text{shiftEnd})$$Thời gian giao với giờ nghỉ trưa (overlapBreak):$$\text{overlapBreak} = \max\Big(0, \min(\text{effectiveOut}, \text{breakEnd}) - \max(\text{effectiveIn}, \text{breakStart})\Big)$$Số giờ làm thực tế (actual_work_hours) và Ngày công chốt (total_workday):$$\text{actual\_work\_hours} = \frac{\max\Big(0, (\text{effectiveOut} - \text{effectiveIn}) - \text{overlapBreak}\Big)}{60}$$$$\text{base\_workday} = \min\left(1.0, \frac{\text{actual\_work\_hours}}{\text{standard\_hours}}\right)$$$$\text{total\_workday} = \min\left(1.0, \text{base\_workday} + \text{paid\_leave\_workday}\right)$$2.6. Công thức Đối soát Tăng ca (OT)Phút ở lại thêm thực tế (raw_ot_minutes): Ghi nhận tự động khi nhân viên quét ra trễ hơn giờ kết thúc ca ($\text{check\_out} > \text{shiftEnd}$).Giờ OT hợp lệ tính lương (approved_ot_hours): Chỉ được tính khi có đơn trong bảng overtime_requests ở trạng thái APPROVED và thời gian làm thêm đạt mức tối thiểu (min_ot_minutes, mặc định $\ge 30$ phút):$$\text{validOtMins} = \max\Big(0, \min(\text{check\_out}, \text{ot\_end}) - \max(\text{shiftEnd}, \text{ot\_start})\Big)$$3. Ma trận 6 Kịch bản Thực tế (Ca chuẩn 08:00 - 17:30)STTKịch bản thực tếGiờ quét FaceIDĐơn từ đã duyệtKết quả hệ thống tự động tính toán1Đi làm chuẩn giờ07:55 - 17:35Không có1.00 công ($8.0\text{h}$), $0\text{p}$ muộn, $0\text{h}$ OT (tự cắt $5\text{p}$ đầu/cuối).2Ra trước 1 tiếng (Tự ý)08:00 - 16:30Không cóPhạt về sớm $60\text{p}$, giờ làm còn $7.0\text{h} \rightarrow$ Chốt 0.88 công.3Nghỉ sáng có phép13:25 - 17:35Đơn nghỉ Sáng (0.5 công)Không tính đi muộn. Công làm 0.5 + Công phép 0.5 $\rightarrow$ 1.00 công.4Ra sau 1 tiếng (Không đơn OT)08:00 - 18:30Không cóChốt 1.00 công, ghi raw_ot = 60p, nhưng approved_ot = 0.00h.5Tăng ca 2 tiếng (Có đơn OT)08:00 - 19:40Đơn OT 17:30 - 19:30Chốt 1.00 công + 2.00 giờ OT (cắt ở mốc 19:30 theo đơn).6Duyệt OT 2h nhưng về sớm08:00 - 18:30Đơn OT 17:30 - 19:30Chốt 1.00 công + 1.00 giờ OT (trả theo thực tế máy quét).4. Script Cơ sở dữ liệu MySQL (update_attendance_schema.sql)SET FOREIGN_KEY_CHECKS = 0;

-- 1. BẢNG CẤU HÌNH CA LÀM VIỆC (WORK SHIFTS)
DROP TABLE IF EXISTS `work_shifts`;
CREATE TABLE `work_shifts` (
`id` INT AUTO_INCREMENT PRIMARY KEY,
`code` VARCHAR(30) NOT NULL UNIQUE,
`name` VARCHAR(100) NOT NULL,
`start_time` TIME NOT NULL,
`end_time` TIME NOT NULL,
`break_start` TIME DEFAULT '12:00:00',
`break_end` TIME DEFAULT '13:30:00',
`grace_period` INT DEFAULT 15,
`min_ot_minutes` INT DEFAULT 30,
`standard_hours` DECIMAL(4,2) DEFAULT 8.00,
`workday_value` DECIMAL(3,2) DEFAULT 1.00,
`is_default` TINYINT(1) DEFAULT 0,
`is_active` TINYINT(1) DEFAULT 1,
`created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
`updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. BẢNG PHÂN CA NHÂN VIÊN (EMPLOYEE SHIFTS)
DROP TABLE IF EXISTS `employee_shifts`;
CREATE TABLE `employee_shifts` (
`id` INT AUTO_INCREMENT PRIMARY KEY,
`employee_id` INT NOT NULL,
`shift_id` INT NOT NULL,
`effective_from` DATE NOT NULL,
`effective_to` DATE DEFAULT NULL,
`created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
INDEX `idx_emp_shift` (`employee_id`, `effective_from`),
CONSTRAINT `fk_es_shift` FOREIGN KEY (`shift_id`) REFERENCES `work_shifts`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. BẢNG LỊCH SỬ QUÉT THÔ (RAW ATTENDANCE LOGS)
DROP TABLE IF EXISTS `attendance_logs`;
CREATE TABLE `attendance_logs` (
`id` BIGINT AUTO_INCREMENT PRIMARY KEY,
`employee_id` INT NOT NULL,
`scan_time` DATETIME NOT NULL,
`scan_type` ENUM('CHECK_IN', 'CHECK_OUT', 'RAW_SCAN') DEFAULT 'RAW_SCAN',
`face_score` DECIMAL(5,4) DEFAULT NULL,
`ip_address` VARCHAR(45) DEFAULT NULL,
`device_info` VARCHAR(255) DEFAULT NULL,
`is_valid` TINYINT(1) DEFAULT 1,
`reject_reason` VARCHAR(255) DEFAULT NULL,
`created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
INDEX `idx_log_emp_time` (`employee_id`, `scan_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. BẢNG ĐƠN NGHỈ PHÉP & GIẢI TRÌNH (LEAVE REQUESTS)
DROP TABLE IF EXISTS `leave_requests`;
CREATE TABLE `leave_requests` (
`id` INT AUTO_INCREMENT PRIMARY KEY,
`employee_id` INT NOT NULL,
`work_date` DATE NOT NULL,
`leave_type` ENUM('FULL_DAY', 'MORNING', 'AFTERNOON', 'LATE_EARLY_EXEMPT') NOT NULL,
`reason_category` ENUM('ANNUAL_LEAVE', 'SICK_LEAVE', 'UNPAID_LEAVE', 'PERSONAL_EXEMPT') DEFAULT 'ANNUAL_LEAVE',
`paid_workday` DECIMAL(3,2) DEFAULT 0.00,
`exempt_minutes` INT DEFAULT 0,
`reason` VARCHAR(255) NOT NULL,
`status` ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING',
`approved_by` INT DEFAULT NULL,
`approved_at` DATETIME DEFAULT NULL,
`created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
`updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
INDEX `idx_leave_emp_date` (`employee_id`, `work_date`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. BẢNG ĐƠN ĐĂNG KÝ TĂNG CA (OVERTIME REQUESTS)
DROP TABLE IF EXISTS `overtime_requests`;
CREATE TABLE `overtime_requests` (
`id` INT AUTO_INCREMENT PRIMARY KEY,
`employee_id` INT NOT NULL,
`work_date` DATE NOT NULL,
`start_time` TIME NOT NULL,
`end_time` TIME NOT NULL,
`ot_type` ENUM('WEEKDAY', 'WEEKEND', 'HOLIDAY') DEFAULT 'WEEKDAY',
`ot_rate` DECIMAL(3,2) DEFAULT 1.50,
`reason` VARCHAR(255) NOT NULL,
`status` ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING',
`approved_by` INT DEFAULT NULL,
`approved_at` DATETIME DEFAULT NULL,
`created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
`updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
INDEX `idx_ot_emp_date` (`employee_id`, `work_date`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. BẢNG TỔNG HỢP CÔNG HÀNG NGÀY (DAILY ATTENDANCES)
DROP TABLE IF EXISTS `attendances`;
CREATE TABLE `attendances` (
`id` INT AUTO_INCREMENT PRIMARY KEY,
`employee_id` INT NOT NULL,
`shift_id` INT NOT NULL,
`work_date` DATE NOT NULL,
`check_in` TIME DEFAULT NULL,
`check_out` TIME DEFAULT NULL,
`check_in_ip` VARCHAR(45) DEFAULT NULL,
`check_out_ip` VARCHAR(45) DEFAULT NULL,
`late_minutes` INT DEFAULT 0,
`early_leave_minutes` INT DEFAULT 0,
`actual_work_hours` DECIMAL(4,2) DEFAULT 0.00,
`base_workday` DECIMAL(3,2) DEFAULT 0.00,
`paid_leave_workday` DECIMAL(3,2) DEFAULT 0.00,
`total_workday` DECIMAL(3,2) DEFAULT 0.00,
`raw_ot_minutes` INT DEFAULT 0,
`approved_ot_hours` DECIMAL(4,2) DEFAULT 0.00,
`ot_rate` DECIMAL(3,2) DEFAULT 1.50,
`status` ENUM('IN_PROGRESS', 'COMPLETED', 'LATE_OR_EARLY', 'MISSING_OUT', 'ON_LEAVE', 'ABSENT') DEFAULT 'IN_PROGRESS',
`note` VARCHAR(255) DEFAULT NULL,
`created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
`updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
UNIQUE KEY `uk_emp_workdate` (`employee_id`, `work_date`),
CONSTRAINT `fk_att_shift` FOREIGN KEY (`shift_id`) REFERENCES `work_shifts`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. DỮ LIỆU MẪU (SEED DATA)
INSERT INTO `work_shifts` (`id`, `code`, `name`, `start_time`, `end_time`, `break_start`, `break_end`, `grace_period`, `min_ot_minutes`, `standard_hours`, `workday_value`, `is_default`) VALUES
(1, 'HC_FULL', 'Ca Hành Chính (08:00 - 17:30)', '08:00:00', '17:30:00', '12:00:00', '13:30:00', 15, 30, 8.00, 1.00, 1),
(2, 'CA_SANG', 'Ca Sáng (08:00 - 12:00)', '08:00:00', '12:00:00', '12:00:00', '12:00:00', 10, 30, 4.00, 0.50, 0),
(3, 'CA_CHIEU', 'Ca Chiều (13:30 - 17:30)', '13:30:00', '17:30:00', '13:30:00', '13:30:00', 10, 30, 4.00, 0.50, 0);

INSERT INTO `employee_shifts` (`employee_id`, `shift_id`, `effective_from`, `effective_to`) VALUES
(1, 1, '2026-01-01', NULL),
(2, 1, '2026-01-01', NULL),
(3, 1, '2026-01-01', NULL);

SET FOREIGN_KEY_CHECKS = 1; 5. Bộ máy Xử lý Chấm công Backend (attendanceEngine.js)// Hàm phụ: Quy đổi chuỗi "HH:mm:ss" sang tổng số phút tính từ 00:00
const toMins = (timeStr) => {
if (!timeStr) return null;
const [h, m] = timeStr.split(':').map(Number);
return h \* 60 + m;
};

/\*\*

- 1.  Lấy Ca làm việc áp dụng cho nhân viên trong ngày
- Nếu nhân viên chưa được phân ca riêng -> Lấy ca mặc định (is*default = 1)
  */
  async function getEmployeeShiftForDate(db, employeeId, workDate) {
  const [assigned] = await db.execute(
  `SELECT s._ FROM employee_shifts es
JOIN work_shifts s ON es.shift_id = s.id
WHERE es.employee_id = ?
AND es.effective_from <= ?
AND (es.effective_to IS NULL OR es.effective_to >= ?)
ORDER BY es.effective_from DESC LIMIT 1`,
  [employeeId, workDate, workDate]
  );
  if (assigned.length) return assigned[0];

const [defaultShift] = await db.execute(
`SELECT * FROM work_shifts WHERE is_default = 1 AND is_active = 1 LIMIT 1`
);
return defaultShift[0];
}

/\*\*

- 2.  Hàm Lõi: Tính toán & Đối soát toàn bộ bảng công ngày của 1 nhân viên
- Được gọi tự động khi: (a) Nhân viên quét FaceID, (b) Quản lý duyệt đơn Nghỉ phép / OT
  _/
  async function recalculateDailyAttendance(db, employeeId, workDate) {
  const [attRows] = await db.execute(
  `SELECT a._, s.start_time, s.end_time, s.break_start, s.break_end,
  s.grace_period, s.min_ot_minutes, s.standard_hours
  FROM attendances a
  JOIN work_shifts s ON a.shift_id = s.id
  WHERE a.employee_id = ? AND a.work_date = ?`,
  [employeeId, workDate]
  );
  if (!attRows.length) return null;
  const att = attRows[0];

// Lấy đơn Nghỉ phép & đơn OT đã duyệt trong ngày
const [leaveRows] = await db.execute(
`SELECT * FROM leave_requests WHERE employee_id = ? AND work_date = ? AND status = 'APPROVED'`,
[employeeId, workDate]
);
const leave = leaveRows[0] || null;

const [otRows] = await db.execute(
`SELECT * FROM overtime_requests WHERE employee_id = ? AND work_date = ? AND status = 'APPROVED'`,
[employeeId, workDate]
);
const otReq = otRows[0] || null;

let shiftStart = toMins(att.start_time);
let shiftEnd = toMins(att.end_time);
const breakStart = toMins(att.break_start);
const breakEnd = toMins(att.break_end);

// Điều chỉnh mốc ca nếu nghỉ phép nửa ngày
if (leave && leave.leave_type === 'MORNING') shiftStart = breakEnd;
if (leave && leave.leave_type === 'AFTERNOON') shiftEnd = breakStart;

const checkInMins = toMins(att.check_in);
const checkOutMins = toMins(att.check_out);

// Tính số phút đi muộn
let lateMinutes = 0;
if (checkInMins !== null && checkInMins > shiftStart + att.grace_period) {
lateMinutes = checkInMins - shiftStart;
if (leave && leave.leave_type === 'LATE_EARLY_EXEMPT') {
lateMinutes = Math.max(0, lateMinutes - leave.exempt_minutes);
}
}

// Nếu mới chỉ Check-in mà chưa Check-out
if (checkOutMins === null) {
await db.execute(
`UPDATE attendances SET late_minutes = ?, status = 'IN_PROGRESS' WHERE id = ?`,
[lateMinutes, att.id]
);
return { status: 'IN_PROGRESS', check_in: att.check_in, late_minutes: lateMinutes };
}

// Tính số phút về sớm
let earlyLeaveMinutes = 0;
if (checkOutMins < shiftEnd) {
earlyLeaveMinutes = shiftEnd - checkOutMins;
if (leave && leave.leave_type === 'LATE_EARLY_EXEMPT') {
earlyLeaveMinutes = Math.max(0, earlyLeaveMinutes - leave.exempt_minutes);
}
}

// Chặn khung giờ chuẩn (Time Clamping) & Trừ giờ nghỉ trưa
const effectiveIn = Math.max(checkInMins, shiftStart);
const effectiveOut = Math.min(checkOutMins, shiftEnd);
const overlapBreak = Math.max(0, Math.min(effectiveOut, breakEnd) - Math.max(effectiveIn, breakStart));
const workMins = Math.max(0, (effectiveOut - effectiveIn) - overlapBreak);

const actualWorkHours = Number((workMins / 60).toFixed(2));
const baseWorkday = Number(Math.min(1, actualWorkHours / att.standard_hours).toFixed(2));
const paidLeaveWorkday = leave ? Number(leave.paid_workday) : 0;
const totalWorkday = Number(Math.min(1, baseWorkday + paidLeaveWorkday).toFixed(2));

// Đối soát Tăng ca (OT)
const rawOtMinutes = checkOutMins > shiftEnd ? (checkOutMins - shiftEnd) : 0;
let approvedOtHours = 0;
let otRate = 1.5;

if (otReq && checkOutMins > shiftEnd) {
const otStartMins = Math.max(shiftEnd, toMins(otReq.start_time));
const otEndMins = toMins(otReq.end_time);
const validOtStart = Math.max(checkInMins, otStartMins);
const validOtEnd = Math.min(checkOutMins, otEndMins);
const validOtMins = Math.max(0, validOtEnd - validOtStart);

    if (validOtMins >= att.min_ot_minutes) {
      approvedOtHours = Number((validOtMins / 60).toFixed(2));
      otRate = Number(otReq.ot_rate);
    }

}

const finalStatus = (lateMinutes > 0 || earlyLeaveMinutes > 0) ? 'LATE_OR_EARLY' : 'COMPLETED';

await db.execute(
`UPDATE attendances 
     SET late_minutes = ?, early_leave_minutes = ?, actual_work_hours = ?,
         base_workday = ?, paid_leave_workday = ?, total_workday = ?,
         raw_ot_minutes = ?, approved_ot_hours = ?, ot_rate = ?, status = ?
     WHERE id = ?`,
[
lateMinutes, earlyLeaveMinutes, actualWorkHours,
baseWorkday, paidLeaveWorkday, totalWorkday,
rawOtMinutes, approvedOtHours, otRate, finalStatus, att.id
]
);

return {
check_in: att.check_in,
check_out: att.check_out,
late_minutes: lateMinutes,
early_leave_minutes: earlyLeaveMinutes,
actual_work_hours: actualWorkHours,
total_workday: totalWorkday,
raw_ot_minutes: rawOtMinutes,
approved_ot_hours: approvedOtHours,
status: finalStatus
};
}

module.exports = { getEmployeeShiftForDate, recalculateDailyAttendance }; 6. Danh sách API Endpoints cần AI triển khai ở Chặng 2Khi viết code Backend (Node.js/Express) và Frontend cho Chặng 2, AI cần cập nhật và bổ sung các Route sau:POST /api/attendance/scan (Cập nhật từ Chặng 1):Input: employee_id, face_score, device_info (lấy ip_address từ request).Luồng xử lý:Lưu bản ghi vào attendance_logs.Tìm ca làm việc hôm nay bằng getEmployeeShiftForDate().Kiểm tra bảng attendances của ngày hôm nay (CURDATE()):Nếu chưa có: INSERT dòng mới với check_in = CURTIME(), sau đó gọi recalculateDailyAttendance().Nếu đã có: Kiểm tra thời gian hiện tại trừ check_in $\ge 30$ phút. Nếu thỏa mãn, UPDATE check_out = CURTIME() rồi gọi recalculateDailyAttendance().GET /api/attendance/my-timesheet?month=11&year=2026:Trả về danh sách chấm công theo ngày trong tháng của nhân viên đang đăng nhập kèm tổng công, tổng phút trễ và tổng giờ OT.POST /api/overtime & PATCH /api/overtime/:id/status:Nhân viên gửi đơn đăng ký OT (start_time, end_time, reason).Khi Admin duyệt (status = 'APPROVED'), gọi ngay recalculateDailyAttendance(db, employee_id, work_date) để cập nhật approved_ot_hours vào bảng attendances.POST /api/leaves & PATCH /api/leaves/:id/status:Nhân viên gửi đơn xin nghỉ phép hoặc giải trình đi muộn/về sớm.Khi Admin duyệt (status = 'APPROVED'), gọi ngay recalculateDailyAttendance(db, employee_id, work_date) để cộng bù paid_leave_workday hoặc trừ phút phạt.7. Truy vấn Tổng hợp Bảng lương Cuối tháng (Payroll Query)Khi cần chốt bảng lương vào cuối tháng, sử dụng truy vấn dưới đây để tổng hợp toàn bộ ngày công hưởng lương, tổng số phút phạt đi muộn/về sớm và tổng số giờ OT quy đổi:SELECT
e.id AS employee_id,
e.full_name,
COUNT(a.id) AS total_recorded_days,
SUM(a.base_workday) AS total_actual_workdays,
SUM(a.paid_leave_workday) AS total_paid_leave_days,
SUM(a.total_workday) AS total_payable_workdays,
SUM(a.late_minutes + a.early_leave_minutes) AS total_penalty_minutes,
SUM(a.approved_ot_hours) AS total_ot_hours,
SUM(ROUND(a.approved_ot_hours \* a.ot_rate, 2)) AS total_converted_ot_hours
FROM employees e
LEFT JOIN attendances a
ON e.id = a.employee_id
AND MONTH(a.work_date) = 11
AND YEAR(a.work_date) = 2026
GROUP BY e.id, e.full_name;
