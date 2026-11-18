TÀI LIỆU CẬP NHẬT DATABASE & NGHIỆP VỤ QUẢN LÝ HỢP ĐỒNG (HRM & E-OFFICE)

1. Bối cảnh (Context)

Hệ thống quản lý Hợp đồng lao động vừa được thiết kế lại toàn bộ luồng quy trình (State Machine) từ khởi tạo đến ký kết lưu trữ.
Quy trình chuẩn bao gồm các bước:

Khởi tạo: HR tạo hợp đồng từ Mẫu Word có sẵn (điền biến {ho_ten}...) hoặc Upload file DOCX trực tiếp.

Soạn thảo: HR chỉnh sửa nội dung trên trình soạn thảo, sau đó lưu thành bản nháp (DRAFT).

Trình duyệt: HR gửi phê duyệt lên Giám đốc (PENDING_APPROVAL).

Phê duyệt: Giám đốc xem xét và ra quyết định:

Từ chối (REJECTED): Bắt buộc phải nhập lý do.

Đồng ý (APPROVED_WAITING_SIGN): Chuyển sang chờ ký kết.

Ký kết: Ký tay/Ký số và lưu bản chính thức PDF (ACTIVE). Nhân viên được phép xem hợp đồng.

2. Cấu trúc Database (MySQL)

Hệ thống gồm 3 bảng đã được chuẩn hóa. Các trường NOT NULL là bắt buộc, các trường NULL được thiết kế linh hoạt theo từng vòng đời trạng thái của hợp đồng.

-- 1. Bảng quản lý Mẫu hợp đồng Word
CREATE TABLE IF NOT EXISTS contract_templates (
id INT AUTO_INCREMENT PRIMARY KEY,
name VARCHAR(255) NOT NULL COMMENT 'Tên mẫu: HĐ Thử việc, HĐ 1 năm...',
contract_type ENUM('PROBATION', 'FIXED_TERM_1Y', 'FIXED_TERM_3Y', 'INDEFINITE', 'FREELANCE') NOT NULL,
template_file_path VARCHAR(500) NOT NULL COMMENT 'Đường dẫn file .docx mẫu',
default_html_content LONGTEXT NULL COMMENT 'Nội dung HTML dùng cho trình soạn thảo',
is_active TINYINT(1) NOT NULL DEFAULT 1,
created_by INT NULL,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Bảng Hợp đồng lao động chính
CREATE TABLE employment_contracts (
id INT AUTO_INCREMENT PRIMARY KEY,
contract_code VARCHAR(50) NOT NULL UNIQUE COMMENT 'Mã hợp đồng',
employee_id INT NOT NULL COMMENT 'ID nhân viên',

    creation_method ENUM('FROM_TEMPLATE', 'UPLOAD_DOCX') NOT NULL,
    template_id INT NULL,
    contract_type ENUM('PROBATION', 'FIXED_TERM_1Y', 'FIXED_TERM_3Y', 'INDEFINITE', 'FREELANCE') NOT NULL,

    start_date DATE NOT NULL,
    end_date DATE NULL COMMENT 'NULL nếu HĐ không thời hạn',
    base_salary DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    allowance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,

    editor_html_content LONGTEXT NULL,
    draft_docx_path VARCHAR(500) NULL COMMENT 'File nháp HR lưu',
    official_file_path VARCHAR(500) NULL COMMENT 'File PDF/DOCX chính thức sau khi ký',

    status ENUM(
        'DRAFT',
        'PENDING_APPROVAL',
        'REJECTED',
        'APPROVED_WAITING_SIGN',
        'ACTIVE',
        'EXPIRED',
        'TERMINATED'
    ) NOT NULL DEFAULT 'DRAFT',

    created_by INT NOT NULL,

    approver_id INT NULL,
    approved_at DATETIME NULL,
    rejection_reason TEXT NULL COMMENT 'Lý do từ chối (Backend bắt buộc nhập khi REJECTED)',

    signer_id INT NULL,
    signed_at DATETIME NULL,

    is_visible_to_employee TINYINT(1) NOT NULL DEFAULT 0,
    version INT NOT NULL DEFAULT 1,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_contract_template FOREIGN KEY (template_id) REFERENCES contract_templates(id) ON DELETE SET NULL,
    INDEX idx_employee_id (employee_id),
    INDEX idx_status (status)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Bảng Lịch sử luồng thao tác (Audit Trail)
CREATE TABLE contract_approval_logs (
id INT AUTO_INCREMENT PRIMARY KEY,
contract_id INT NOT NULL,
actor_id INT NOT NULL,
action ENUM('CREATE', 'EDIT_SAVE_DOCX', 'SUBMIT_APPROVAL', 'DIRECTOR_APPROVE', 'DIRECTOR_REJECT', 'SIGN_OFFICIAL') NOT NULL,
note TEXT NULL COMMENT 'Lưu lý do từ chối hoặc lời nhắn',
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT fk_log_contract FOREIGN KEY (contract_id) REFERENCES employment_contracts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

3. Các Quy tắc Nghiệp vụ cốt lõi (Business Rules - AI CẦN LƯU Ý)

👉 Chú ý dành cho AI khi sinh code Backend (Node.js/Express) & Frontend:

Logic "Từ chối" (Reject Logic):

Ở DB, rejection_reason là NULL.

Ở tầng API Controller, khi nhận action = 'DIRECTOR_REJECT', BẮT BUỘC dùng validation (Zod/Class-Validator) kiểm tra trường rejection_reason. Nếu trống -> Báo lỗi 400 Bad Request.

Logic "Phiên bản" (Version Control):

Khi hợp đồng bị từ chối (REJECTED), nếu HR cập nhật và lưu lại file, hệ thống tự động version = version + 1 và chuyển trạng thái về lại DRAFT.

Trạng thái hiển thị (Visibility):

is_visible_to_employee mặc định là 0. Chỉ khi hợp đồng đạt trạng thái ACTIVE (đã ký) thì update thành 1 (Nhân viên được xem).

Notifications (Thông báo cho Sếp):

Khi API xử lý push PENDING_APPROVAL, payload thông báo gửi đi (WebSocket, Email, Notification table) phải chứa sẵn thông tin: contract_type, base_salary, và employee_name để sếp xem tóm tắt mà không cần mở file.

State Machine (Chặn nhảy cóc trạng thái):

Không được chuyển trạng thái bừa bãi. Phải tuần tự: DRAFT -> PENDING_APPROVAL -> (APPROVED_WAITING_SIGN hoặc REJECTED) -> ACTIVE.

4. Cấu trúc lưu trữ File vật lý (Physical File Storage)

File DOCX và PDF không lưu nhị phân vào Database. Chỉ lưu đường dẫn tương đối và lưu trữ file thực tế trên server/cloud.

4.1. Sơ đồ thư mục cần khởi tạo trong dự án Node.js

project-root/
├── src/  
├── package.json
├── .gitignore  
└── uploads/ # THƯ MỤC GỐC LƯU TRỮ FILE
├── templates/ # Lưu MẪU HỢP ĐỒNG của hệ thống
├── drafts/ # Lưu BẢN NHÁP (HR đang sửa / Sếp duyệt)
│ └── YYYY/ # VD: 2026/ (Chia theo năm)
└── officials/ # Lưu BẢN CHÍNH THỨC (Đã ký)
└── YYYY/ # VD: 2026/

4.2. Khớp nối File Path với Database

uploads/templates/mau_1.docx -> Map với template_file_path

uploads/drafts/2026/hd_001.docx -> Map với draft_docx_path

uploads/officials/2026/hd_001.pdf -> Map với official_file_path

4.3. Nguyên tắc Bảo mật (Security Rules)

.gitignore: BẮT BUỘC đưa thư mục uploads/ vào .gitignore để không bị push lộ hợp đồng thực tế lên Git.

Không Public File tĩnh (No Express Static): KHÔNG dùng express.static('uploads'). Phải viết API Controller riêng (VD: GET /api/contracts/download/:id), tích hợp middleware xác thực JWT để đảm bảo chỉ những user có quyền (Admin, Giám đốc, hoặc chủ nhân hợp đồng) mới tải được bằng res.download().

Partition theo năm: Code lưu file (Multer) cần tự động check năm hiện tại (VD moment().format('YYYY')) để nhóm folder, tránh làm quá tải hệ điều hành thư mục khi số lượng hợp đồng tăng cao lên hàng chục ngàn.
