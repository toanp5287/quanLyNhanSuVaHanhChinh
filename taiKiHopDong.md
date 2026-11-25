Tài liệu Thiết kế Database - Phân hệ Tái ký Hợp đồng (Contract Renewals)Tài liệu này mô tả chi tiết thiết kế cơ sở dữ liệu phục vụ quy trình Tái ký Hợp đồng Nhân sự. Tất cả các thay đổi đã được áp dụng và kiểm thử thành công trên hệ thống database TiDB (hr*management_staging).1. Tổng quan Kiến trúc DatabasePhân hệ tái ký hợp đồng được thiết kế mở rộng từ mô hình hợp đồng hiện có, đảm bảo:Không làm gián đoạn dữ liệu hợp đồng cũ: Hợp đồng mới và hợp đồng cũ liên kết dạng chuỗi (Linked List) qua previous_contract_id.Minh bạch luồng duyệt (Workflow): Cho phép cấu hình duyệt nhiều cấp (HR, Line Manager, Director...).Lưu vết lịch sử (Audit Trail): Theo dõi biến động người xử lý và toàn bộ nhật ký thao tác trên từng hồ sơ.2. Bảng Hiện có được Cập nhật (Schema Alterations)2.1. Bảng contracts (Hợp đồng gốc)Bổ sung các cột phục vụ quản lý vòng đời và trạng thái tái ký nối tiếp.Tên CộtKiểu Dữ liệuNullableMặc địnhMô tảprevious_contract_idINTYESNULLID hợp đồng liền trước (Khóa ngoại tham chiếu contracts.id).renewal_countINT UNSIGNEDNO0Số lần hợp đồng này đã được tái ký nối tiếp.is_renewableTINYINT(1)NO11: Cho phép tái ký, 0: Không cho phép tái ký.renewal_statusENUMNO'none'Trạng thái tái ký hiện tại: 'none', 'pending', 'in_progress', 'renewed', 'not_renewed', 'expired'.renewal_reminder_sent_atDATETIMEYESNULLThời điểm tự động gửi thông báo nhắc hạn tái ký.Index mới: idx_contracts_renewal_status (renewal_status), idx_contracts_previous_contract (previous_contract_id).Khóa ngoại: fk_contracts_previous_contract -> contracts(id) ON DELETE SET NULL.2.2. Bảng contract_files (Tài liệu Hợp đồng)Bổ sung liên kết tài liệu với đợt tái ký và phân loại mục đích tài liệu.Tên CộtKiểu Dữ liệuNullableMặc địnhMô tảrenewal_idBIGINT UNSIGNEDYESNULLID đợt tái ký (Khóa ngoại tham chiếu contract_renewals.id).file_categoryENUMNO'original_contract'Phân loại: 'original_contract', 'renewal_proposal', 'evaluation_form', 'appendix', 'signed_renewal', 'other'.is_renewal_documentTINYINT(1)NO0Cờ đánh dấu nhanh file thuộc hồ sơ tái ký.Index mới: idx_contract_files_renewal (renewal_id).Khóa ngoại: fk_contract_files_renewal -> contract_renewals(id) ON DELETE SET NULL.3. Danh mục các Bảng Mới (New Tables)3.1. Bảng contract_renewals (Hồ sơ / Đợt Tái ký)Bảng trung tâm lưu trữ đề xuất và thông tin của từng đợt xử lý tái ký hợp đồng.CREATE TABLE contract_renewals (
id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
renewal_code VARCHAR(50) NOT NULL UNIQUE COMMENT 'Mã phiếu tái ký (VD: REN-2026-0001)',
old_contract_id INT NOT NULL COMMENT 'ID hợp đồng sắp hết hạn cần tái ký',
new_contract_id INT NULL COMMENT 'ID hợp đồng mới được sinh ra sau khi tái ký thành công',
employee_id INT NOT NULL COMMENT 'ID nhân sự được tái ký',
renewal_type ENUM('extend', 'new_term', 'indefinite', 'terminated') NOT NULL DEFAULT 'new_term',
status ENUM('draft', 'pending_review', 'pending_approval', 'approved', 'rejected', 'signed', 'cancelled') NOT NULL DEFAULT 'draft',
proposed_start_date DATE NULL,
proposed_end_date DATE NULL,
proposed_salary DECIMAL(15, 2) NULL,
due_date DATE NULL,
rejection_reason TEXT NULL,
notes TEXT NULL,
created_by INT NOT NULL,
approved_by INT NULL,
approved_at DATETIME NULL,
created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
Ý nghĩa Trạng thái (status):draft: HR / Quản lý mới tạo bản nháp.pending_review: Đang chờ Quản lý trực tiếp / Trưởng bộ phận đánh giá.pending_approval: Đang chờ Ban Giám đốc duyệt đề xuất.approved: Đề xuất tái ký đã được duyệt.rejected: Đề xuất tái ký bị từ chối / Không tái ký.signed: Nhân sự đã hoàn tất ký hợp đồng mới.cancelled: Đợt tái ký bị hủy bỏ.3.2. Bảng contract_renewal_assignments (Phân công Xử lý & Phê duyệt)Quản lý luồng công việc (Workflow) đa cấp cho từng đợt tái ký.CREATE TABLE contract_renewal_assignments (
id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
renewal_id BIGINT UNSIGNED NOT NULL COMMENT 'ID phiếu tái ký',
assignee_id INT NOT NULL COMMENT 'ID người được giao xử lý/duyệt',
assignment_role ENUM('hr_pic', 'line_manager', 'department_head', 'director', 'legal') NOT NULL DEFAULT 'hr_pic',
step_order INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Thứ tự bước duyệt',
status ENUM('pending', 'in_progress', 'completed', 'reassigned', 'skipped') NOT NULL DEFAULT 'pending',
due_at DATETIME NULL COMMENT 'Hạn chót xử lý của bước',
assigned_by INT NOT NULL COMMENT 'ID người phân công',
assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
completed_at DATETIME NULL,
note TEXT NULL
);
3.3. Bảng contract_renewal_assignment_histories (Lịch sử Điều chuyển Người phụ trách)Lưu vết khi có sự thay đổi người phụ trách (re-assign / ủy quyền / bàn giao việc).CREATE TABLE contract_renewal_assignment_histories (
id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
assignment_id BIGINT UNSIGNED NOT NULL COMMENT 'ID bản ghi phân công',
renewal_id BIGINT UNSIGNED NOT NULL COMMENT 'ID phiếu tái ký',
previous_assignee_id INT NULL COMMENT 'ID người phụ trách cũ',
new_assignee_id INT NOT NULL COMMENT 'ID người phụ trách mới',
action_type ENUM('initial_assign', 'reassign', 'escalate', 'delegate') NOT NULL DEFAULT 'reassign',
reason VARCHAR(500) NULL COMMENT 'Lý do bàn giao việc',
changed_by INT NOT NULL COMMENT 'ID người thực hiện thay đổi',
created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
3.4. Bảng contract_renewal_logs (Nhật ký Hệ thống & Audit Log)Lưu vết toàn bộ thao tác, thay đổi dữ liệu (Data Diff JSON) và bình luận.CREATE TABLE contract_renewal_logs (
id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
renewal_id BIGINT UNSIGNED NOT NULL,
actor_id INT NULL COMMENT 'ID người thao tác (NULL nếu hệ thống chạy Cronjob)',
action VARCHAR(100) NOT NULL COMMENT 'CREATED, SUBMITTED, APPROVED, REJECTED, FILE_UPLOADED...',
old_status VARCHAR(50) NULL,
new_status VARCHAR(50) NULL,
changes_json JSON NULL COMMENT 'Lưu thay đổi dữ liệu cũ - mới dạng JSON',
comment TEXT NULL,
ip_address VARCHAR(45) NULL,
created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
); 4. Sơ đồ Mối quan hệ giữa các Bảng (Entity Relationship Diagram)+------------------+ 1 : N +-------------------+
| contracts |<----------------------| contract_renewals |
| (old_contract_id)| +-------------------+
+------------------+ |
^ | 1 : N
| (previous_contract_id) v
+------------------+ +-------------------------------+
| contracts (New) | | contract_renewal_assignments |
+------------------+ +-------------------------------+
|
| 1 : N
v
+-------------------------------+
| contract_renewal_assignment* |
| histories |
+-------------------------------+ 5. Lưu ý Kỹ thuật khi Triển khai (TiDB Specifics)Đồng bộ Kiểu Dữ liệu Khóa Ngoại: Cột contracts.id trong hệ thống thực tế đang dùng INT (signed). Vì vậy, các cột tham chiếu tới contracts.id (previous_contract_id, old_contract_id, new_contract_id) phải nhất quán khai báo kiểu INT (không dùng BIGINT UNSIGNED).Cú pháp DDL trên TiDB: TiDB không hỗ trợ gộp vừa ADD COLUMN vừa ADD INDEX / ADD CONSTRAINT trong cùng một lệnh ALTER TABLE. Tất cả các thao tác thay đổi schema cần tách riêng từng câu lệnh độc lập.Mã phiếu nghiệp vụ: TiDB tự động tăng AUTO_INCREMENT theo dải (cached block), do đó không nên dùng cột id để hiển thị STT hợp đồng. Việc quản lý mã hiển thị phải dựa trên cột renewal_code (VD: REN-2026-0001).
