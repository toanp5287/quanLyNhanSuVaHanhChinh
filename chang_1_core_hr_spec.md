TÀI LIỆU ĐẶC TẢ KỸ THUẬT & NGUYÊN TẮC TRIỂN KHAI CHẶNG 1Phạm vi: Phân hệ 1 (Quản lý Nhân sự - Core HR) & Phân hệ 11 (Cổng Nhân viên - Self Service Hồ sơ cá nhân)Hệ quản trị CSDL: MySQL trên TiDB CloudI. 6 NGUYÊN TẮC CỐT LÕI BẮT BUỘC (STRICT PRINCIPLES)1. Nguyên tắc Quản lý File & Giao diện (No Extra Files)Tuyệt đối không tạo thêm file mới bừa bãi: Chỉ viết và cập nhật code trực tiếp bên trong các file Backend và Frontend đã được khởi tạo sẵn trong dự án.Cơ chế hiển thị động (Dynamic Views & Modals): Không tách thành nhiều trang HTML rời rạc. Toàn bộ 5 màn hình chính (Views) và 5 cửa sổ thao tác (Modals) của Chặng 1 được đặt trong vùng làm việc chính (Workspace), tự động ẩn/hiện khi người dùng bấm vào các thẻ chức năng trên Menu.2. Nguyên tắc Dữ liệu Thật & Định danh Lai (Hybrid ID System)100% Dữ liệu thật từ TiDB Cloud: Không gắn dữ liệu giả (mock data) cứng trên giao diện. Mọi thao tác Xem, Tìm kiếm, Lọc, Thêm, Sửa đều gọi API truy vấn trực tiếp xuống TiDB Cloud.Cơ chế Định danh Lai (Hybrid ID):Nhóm bảng cấu hình cố định (roles, permissions, role_permissions): Sử dụng Mã chữ cố định (SUPER_ADMIN, HR_ADMIN, P01 -> P25) làm khóa chính để đọc code và kiểm tra phân quyền tường minh.Nhóm bảng nghiệp vụ động (departments, positions, employees, users, contracts, work_histories, dependents, rewards_disciplines): Sử dụng id INT AUTO_INCREMENT (1, 2, 3...) làm khóa chính kỹ thuật để nối khóa ngoại (JOIN nhanh, không đứt gãy lịch sử), đi kèm cột Mã nghiệp vụ riêng (UNIQUE NOT NULL) để hiển thị chuyên nghiệp (PB001, VT001, NV0001, HDLD-2026/001...).Tách biệt Tài khoản và Hồ sơ (users 1 - 1 employees): Bảng users chỉ lưu thông tin đăng nhập (username, password_hash, role_id, is_active) và trỏ khóa ngoại employee_id sang bảng employees.3. Nguyên tắc Phân quyền Chức năng (RBAC - permission_code)Không xây dựng trang quản lý bật/tắt quyền ở giai đoạn này.Hệ thống sử dụng mảng permissions trả về sau khi Login và hàm kiểm tra hasPermission(permission_code) để:Ẩn/hiện các thẻ chức năng trên Menu 12 phân hệ.Ẩn/hiện các nút thao tác ([+ Thêm nhân viên], [Sửa hồ sơ], [+ Tạo hợp đồng], [+ Lập QĐ Khen thưởng/Kỷ luật]).Chặn truy cập trái phép ngay tại tầng API Backend.4. Nguyên tắc Giới hạn Phạm vi Dữ liệu (data_scope)Mọi API lấy danh sách nhân sự, sinh nhật, hợp đồng, quá trình công tác, khen thưởng kỷ luật đều phải tự động lọc theo data_scope của người đang đăng nhập:ALL (SUPER_ADMIN, DIRECTOR, HR_ADMIN, CB_PAYROLL, OFFICE_ADMIN): Truy vấn toàn bộ nhân sự các phòng ban.DEPARTMENT (MANAGER - Trưởng bộ phận): Tự động gắn điều kiện WHERE department_id = currentUser.department_id (chỉ thấy nhân sự thuộc phòng ban mình quản lý).SELF (EMPLOYEE - Nhân viên): Tự động gắn điều kiện WHERE employee_id = currentUser.employee_id (chỉ thấy duy nhất hồ sơ của bản thân).5. Nguyên tắc Bảo mật Lương (Salary Masking)Khi tài khoản có vai trò OFFICE_ADMIN (Hành chính) hoặc SUPER_ADMIN (IT Admin) xem Danh sách nhân viên hoặc mở Modal Hồ sơ 360 độ của nhân viên khác:Bắt buộc ẩn hoặc che (Ẩn theo phân quyền) toàn bộ các trường lương cá nhân: base_salary, insurance_salary, meal_fuel_allowance, signed_salary, old_salary, new_salary.Hai vai trò này chỉ được phép nhìn thấy mức lương của chính mình trong màn hình "Hồ sơ cá nhân của tôi" (Self Service).6. Nguyên tắc Đồng bộ Dữ liệu Tự động (Auto-Sync Logic)Khi thực hiện các thao tác ghi dữ liệu (Create / Update) trong Chặng 1, Backend phải tự động đồng bộ liên bảng:Khi thêm mới nhân viên (employees): Tự động sinh mã employee_code tiếp theo (VD: NV0013) và tự động tạo 1 bản ghi ONBOARDING trong bảng work_histories.Khi chuyển trạng thái nhân viên sang Đã nghỉ việc (work_status = 'RESIGNED'): Tự động cập nhật ngày nghỉ resign_date, khóa tài khoản đăng nhập (users.is_active = 0) và ghi 1 bản ghi RESIGNATION vào work_histories.Khi Tạo mới hoặc Gia hạn Hợp đồng (contracts) ở trạng thái ACTIVE: Tự động cập nhật base_salary = signed_salary và insurance_salary mới sang bảng employees.Khi thêm Quyết định Công tác (work_histories - Bổ nhiệm, Điều chuyển, Tăng lương): Tự động cập nhật department_id, position_id và base_salary = new_salary tương ứng vào bảng employees.Khi Thêm hoặc Xóa Người phụ thuộc (dependents): Tự động đếm lại số lượng người phụ thuộc có status = 'ACTIVE' của nhân viên đó và cập nhật vào cột employees.dependents_count (để làm căn cứ tính giảm trừ thuế TNCN ở Chặng 5).II. CẤU TRÚC 11 BẢNG DATABASE CHẶNG 1 TRÊN TIDB CLOUDSTTTên bảngKhóa chính (PK)Các cột chính trong bảng1rolesid (VARCHAR)id (SUPER_ADMIN..), name, data_scope (ALL, DEPARTMENT, SELF), description2permissionsid (VARCHAR)id (P01 -> P25), module_code, permission_code, name, action3role_permissions(role_id, permission_id)role_id (FK), permission_id (FK)4usersid (INT)id, employee_id (UNIQUE FK), role_id (FK), username, password_hash, is_active, last_login5departmentsid (INT)id, parent_id, department_code (PB001..), name, headcount_limit (Định biên)6positionsid (INT)id, department_id (FK), position_code (VT001..), title, grade_level, job_description (JD), job_requirements, min_salary, max_salary, position_allowance7employeesid (INT)id, employee_code (NV0001..), department_id (FK), position_id (FK), full_name, gender, dob, phone, email, address, citizen_id, tax_code, base_salary, insurance_salary, meal_fuel_allowance, dependents_count, bank_account, bank_name, hire_date, resign_date, work_status (WORKING, MATERNITY, RESIGNED)8contractsid (INT)id, contract_code, employee_id (FK), contract_type, start_date, end_date, signed_salary, insurance_salary, status (ACTIVE, EXPIRING_SOON, EXPIRED, TERMINATED), note9work_historiesid (INT)id, decision_code, employee_id (FK), action_type (ONBOARDING, PROMOTION, TRANSFER, SALARY_REVIEW, MATERNITY_LEAVE, RESIGNATION), from_department_id, to_department_id, from_position_id, to_position_id, old_salary, new_salary, effective_date, note10dependentsid (INT)id, employee_id (FK), full_name, relationship, dob, citizen_or_birth_cert, tax_code, deduction_start, deduction_end, status11rewards_disciplinesid (INT)id, decision_code, employee_id (FK), record_type (REWARD, DISCIPLINE), title, reason, amount (+ thưởng / - phạt), applied_month (YYYY-MM), decision_date, statusIII. CHI TIẾT 5 MÀN HÌNH CHÍNH (DYNAMIC VIEWS) CỦA CHẶNG 11. VIEW 1: Màn hình Danh sách Nhân sựĐáp ứng các thẻ trên Menu: Tất cả nhân viên, Nhân viên đang làm, Nhân viên đã nghỉ, Sinh nhật trong tháng.Chức năng Lọc & Tìm kiếm:Tìm kiếm nhanh theo Mã NV (employee_code), Họ tên, Số điện thoại, Email, Số CCCD.Bộ lọc Dropdown: Phòng ban, Chức vụ, Trạng thái làm việc (ALL, WORKING, MATERNITY, RESIGNED), Tháng sinh nhật (1 -> 12).Khi bấm vào từng thẻ trên Menu, tự động kích hoạt bộ lọc tương ứng (VD: bấm Sinh nhật trong tháng tự động lọc nhân viên có tháng sinh trùng với tháng đang chọn).Hiển thị & Thao tác:Bảng danh sách nhân sự hiển thị: Mã NV, Họ tên, Giới tính, Ngày sinh, Phòng ban, Chức vụ (kèm ngạch grade_level), Lương cơ bản (ẩn nếu là OFFICE_ADMIN / SUPER_ADMIN), Badge Trạng thái.Nút [Xem 360°] trên từng dòng để mở Modal Hồ sơ 360 độ.Nút [+ Thêm nhân viên mới] và [Sửa] (chỉ hiển thị khi tài khoản có quyền HR.PROFILE_MANAGE).2. VIEW 2: Màn hình Cơ cấu Tổ chức, Chức vụ & Mô tả Công việc (JD)Đáp ứng các thẻ trên Menu: Phòng ban, Chức vụ & Khung lương.Tab 1 - Quản lý Phòng ban (departments):Hiển thị Mã phòng ban (PB001..), Tên phòng ban, Số lượng nhân viên đang làm thực tế so với Định biên (headcount_limit) kèm thanh tiến độ (Progress Bar) đổi màu cảnh báo nếu chạm/vượt định biên.Nút [+ Thêm / Sửa Phòng ban] (dành cho HR.PROFILE_MANAGE).Tab 2 - Quản lý Chức vụ, JD & Khung lương (positions):Hiển thị Mã vị trí (VT001..), Tên chức danh, Phòng ban trực thuộc, Ngạch bậc (C-LEVEL, M2, S2, S1), Mô tả chi tiết công việc (job_description), Yêu cầu năng lực (job_requirements), Khung lương định mức (min_salary - max_salary), Phụ cấp chức vụ (position_allowance).Nút [+ Thêm / Sửa Chức vụ & JD] (dành cho HR.PROFILE_MANAGE).3. VIEW 3: Màn hình Quản lý Hợp đồng Lao độngĐáp ứng các thẻ trên Menu: Tất cả hợp đồng, Hợp đồng hiện hành, Hợp đồng quá hạn (Yêu cầu quyền HR.CONTRACT_MANAGE).Thanh lọc nhanh theo trạng thái:Tất cả | Hiện hành (ACTIVE - Badge Xanh lá) | Sắp hết hạn (EXPIRING_SOON - Badge Vàng cam) | Quá hạn (EXPIRED - Badge Đỏ) | Đã thanh lý (TERMINATED - Badge Xám).Hiển thị & Thao tác:Bảng dữ liệu: Số hợp đồng (contract_code), Mã NV, Họ tên, Phòng ban, Loại hợp đồng, Ngày bắt đầu, Ngày kết thúc, Lương ký HĐ (signed_salary), Lương đóng BHXH (insurance_salary), Trạng thái, Ghi chú.Nút [+ Tạo hợp đồng mới], [Gia hạn / Tái ký], [Thanh lý HĐ] (chỉ hiển thị với HR_ADMIN).4. VIEW 4: Màn hình Khen thưởng, Kỷ luật & Nội quyĐáp ứng thẻ trên Menu: Khen thưởng & Kỷ luật.Chức năng Lọc: Lọc theo Tháng áp dụng (applied_month dạng YYYY-MM) và Loại quyết định (ALL, REWARD - Khen thưởng, DISCIPLINE - Kỷ luật).Hiển thị & Thao tác:Bảng dữ liệu: Số quyết định (decision_code), Mã NV, Họ tên, Phòng ban, Phân loại (Khen thưởng màu xanh / Kỷ luật màu đỏ), Tiêu đề, Lý do chi tiết, Số tiền (+ cộng thưởng hoặc - khấu trừ lương), Tháng áp dụng, Ngày ban hành.Nút [+ Lập quyết định Khen thưởng / Kỷ luật] (hiển thị khi có quyền HR.REWARD_DISCIPLINE - gồm HR_ADMIN và OFFICE_ADMIN).5. VIEW 5: Màn hình "Hồ sơ cá nhân của tôi" (Phân hệ 11 - Self Service)Đáp ứng thẻ trên Menu: Hồ sơ cá nhân của tôi (Ai đăng nhập cũng xem được hồ sơ của chính mình; là màn hình mặc định của EMPLOYEE).Nội dung hiển thị (employee_id = currentUser.employee_id):Thông tin định danh & Liên hệ: Mã NV, Họ tên, Ngày sinh, Giới tính, SĐT, Email, Địa chỉ, CCCD, Mã số thuế TNCN, Tài khoản ngân hàng.Vị trí công việc, JD & Thu nhập định mức: Phòng ban, Chức vụ, Ngạch bậc, Bản mô tả công việc (JD), Yêu cầu vị trí, Lương cơ bản, Lương đóng BHXH, Phụ cấp chức vụ, Phụ cấp ăn trưa & xăng xe.Dữ liệu liên quan của bản thân: Bảng Hợp đồng lao động của tôi, Quá trình công tác của tôi, Người phụ thuộc giảm trừ thuế của tôi, Lịch sử Khen thưởng / Kỷ luật của tôi.Thao tác Tự phục vụ (Self-Service Actions):Nút [Cập nhật thông tin liên hệ & Ngân hàng] (chỉ cho sửa SĐT, Địa chỉ, Số TK ngân hàng, Tên ngân hàng).Nút [Đổi mật khẩu đăng nhập].IV. CHI TIẾT 5 CỬA SỔ THAO TÁC (MODALS) CỦA CHẶNG 1MODAL 1 - Hồ sơ Nhân sự 360 độ (4 Tabs):Tab 1 (Hồ sơ & JD): Thông tin cá nhân, thuế, ngân hàng, mô tả công việc JD, khung lương vị trí và mức lương thực nhận.Tab 2 (Hợp đồng): Danh sách hợp đồng lao động của nhân viên đó.Tab 3 (Quá trình công tác): Lịch sử bổ nhiệm, điều chuyển, tăng lương + Form thêm mới quyết định công tác (dành cho HR_ADMIN).Tab 4 (Người phụ thuộc): Danh sách người phụ thuộc giảm trừ gia cảnh + Form thêm/xóa người phụ thuộc (dành cho HR_ADMIN).MODAL 2 - Form Thêm mới / Chỉnh sửa Nhân viên (HR_ADMIN):Tự động gợi ý mã NVxxxx tiếp theo.Chọn Phòng ban -> Lọc danh sách Chức vụ tương ứng -> Tự động hiển thị Mô tả công việc (JD) và Khung lương (min_salary - max_salary) của chức vụ đó để kiểm tra đối chiếu khi nhập base_salary.MODAL 3 - Form Tạo mới / Gia hạn Hợp đồng Lao động (HR_ADMIN):Nhập thông tin hợp đồng và tự động đồng bộ lương mới sang bảng employees.MODAL 4 - Form Lập Quyết định Khen thưởng / Kỷ luật (HR_ADMIN, OFFICE_ADMIN):Tự động chuẩn hóa số tiền dương (+) cho REWARD và số tiền âm (-) cho DISCIPLINE.MODAL 5 - Form Cập nhật Liên hệ & Đổi Mật khẩu (Self Service):Cập nhật thông tin liên hệ cá nhân và đổi mật khẩu tài khoản đang đăng nhập.V. MA TRẬN PHÂN QUYỀN THAO TÁC CHẶNG 1 THEO 7 VAI TRÒVai trò (role_id)Tài khoản Demodata_scopeQuyền xem & Thao tác được phép trong Chặng 1Giới hạn / Bị ẩn trong Chặng 1HR_ADMINhr_adminALLToàn quyền Chặng 1: Xem đủ 12 NV, xem lương, Thêm/Sửa NV, Thêm/Sửa Phòng ban & JD, Tạo/Gia hạn Hợp đồng, Thêm Quá trình công tác, Thêm Người phụ thuộc, Lập Khen thưởng/Kỷ luật.Không có giới hạn ở Chặng 1.DIRECTORgiamdocALLXem toàn bộ 12 NV (kèm lương & Hồ sơ 360), xem Phòng ban & JD, xem toàn bộ Hợp đồng (Hiện hành/Quá hạn), xem Khen thưởng/Kỷ luật.Chỉ xem & giám sát, không hiện nút Thêm/Sửa hồ sơ chi tiết của HR.CB_PAYROLLcb_payrollALLXem toàn bộ 12 NV (kèm lương, thuế, người phụ thuộc để đối chiếu tính lương), xem Phòng ban & JD, xem toàn bộ Hợp đồng lao động.Không có nút Thêm/Sửa nhân viên, không tạo Hợp đồng, không lập Khen thưởng/Kỷ luật.OFFICE_ADMINhanhchinhALLXem danh bạ 12 NV, lọc Sinh nhật tháng, xem Phòng ban & JD; Toàn quyền Thêm/Sửa Khen thưởng, Kỷ luật & Nội quy.Bị che cột Lương của NV khác; bị ẩn hoàn toàn màn hình Hợp đồng lao động.SUPER_ADMINadmin_itALLXem danh bạ 12 NV & Phòng ban cơ bản để phục vụ cấp phát thiết bị IT / tài khoản, xem Hồ sơ cá nhân của chính mình.Bị che cột Lương của NV khác; ẩn màn hình Hợp đồng, ẩn nút Thêm/Sửa của HR.MANAGERtruongphong_ittruongphong_kdDEPARTMENTChỉ xem danh sách NV, Sinh nhật, Hồ sơ 360, JD và Khen thưởng/Kỷ luật thuộc đúng phòng ban mình quản lý.Không thấy NV phòng ban khác; không thấy màn hình Quản lý Hợp đồng; không thêm/xóa NV.EMPLOYEEnhanvien_devSELFChỉ truy cập Hồ sơ cá nhân của tôi (NV0006): Xem thông tin, JD công việc, lương, hợp đồng, lịch sử công tác của bản thân; Tự sửa SĐT/Địa chỉ/Ngân hàng & Đổi mật khẩu.

# ĐẶC TẢ KỸ THUẬT & NGUYÊN TẮC TRIỂN KHAI CHẶNG 1

## Phân hệ 1: Quản lý Nhân sự (Core HR) & Phân hệ 11: Cổng Nhân viên (Self Service)

---

## I. 6 NGUYÊN TẮC CỐT LÕI BẮT BUỘC (STRICT RULES)

1. **Nguyên tắc 1 — Tuyệt đối không tạo file mới (Zero New Files):**
   - Mọi xử lý API Backend và truy vấn SQL chỉ được viết thêm vào file Backend hiện có của dự án.
   - Mọi giao diện (5 Màn hình Views và 5 Cửa sổ Modals) chỉ được viết thêm vào file Giao diện hiện có của dự án.
2. **Nguyên tắc 2 — Kiến trúc Single-Page Dynamic Views & Modals:**
   - Sử dụng cơ chế ẩn/hiện các khối `<div id="view-...">` ngay trong vùng làm việc chính (Workspace) khi người dùng bấm vào các thẻ chức năng trên Menu.
   - Không tách trang rời rạc làm mất trạng thái đăng nhập.
3. **Nguyên tắc 3 — Sử dụng 100% Dữ liệu thật từ TiDB Cloud:**
   - Không gán cứng dữ liệu giả (mock data) trên giao diện.
   - Mọi thao tác Xem, Lọc, Tìm kiếm, Thêm mới, Cập nhật đều phải gọi API thực thi SQL trực tiếp trên TiDB Cloud và render lại dữ liệu mới nhất.
4. **Nguyên tắc 4 — Xử lý Đồng bộ Liên bảng tại Backend (Thay thế Trigger SQL):**
   - Do TiDB Cloud không hỗ trợ `TRIGGER`, mọi logic tự động (sinh mã `NV00xx`, ghi lịch sử `ONBOARDING`, đếm lại `dependents_count`, đồng bộ lương hợp đồng sang bảng nhân viên, khóa tài khoản khi nghỉ việc) bắt buộc phải thực hiện bằng câu lệnh SQL tuần tự ngay trong API Backend.
5. **Nguyên tắc 5 — Không xây dựng trang Quản lý Phân quyền:**
   - Không làm giao diện thêm/sửa/xóa Role hay bảng tích chọn bật/tắt quyền.
   - Chỉ sử dụng quyền (`permissions`) và phạm vi (`data_scope`) đã nạp sẵn khi đăng nhập để kiểm soát hiển thị và chặn API.
6. **Nguyên tắc 6 — Bảo mật 3 lớp (Scope + Permission + Salary Masking):**
   - **Lớp 1 (`data_scope`):** Lọc bản ghi theo `ALL` (Toàn công ty), `DEPARTMENT` (Chỉ phòng ban của Trưởng phòng đang đăng nhập), hoặc `SELF` (Chỉ bản ghi của cá nhân đang đăng nhập).
   - **Lớp 2 (`permission_code`):** Chỉ hiển thị Thẻ menu và Nút bấm thao tác (`Thêm`, `Sửa`, `Gia hạn`, `Lập quyết định`) khi tài khoản có mã quyền tương ứng.
   - **Lớp 3 (`Salary Masking`):** Khi tài khoản có `role_id` là `OFFICE_ADMIN` (Hành chính) hoặc `SUPER_ADMIN` (IT Admin) xem danh sách nhân sự hoặc mở Hồ sơ 360 của người khác, bắt buộc ẩn/che (`***`) toàn bộ các cột tiền lương (`base_salary`, `insurance_salary`, `meal_fuel_allowance`, `signed_salary`). Họ chỉ được xem lương của chính mình ở màn hình Self Service.

---

## II. CẤU TRÚC 11 BẢNG DATABASE TRÊN TIDB CLOUD (SCHEMA CHUẨN)

Code Backend và Frontend bắt buộc gọi đúng tên bảng và tên cột dưới đây:

1. **Bảng `roles` (Vai trò hệ thống):**
   - Cột: `id` (PK: `'SUPER_ADMIN'`, `'DIRECTOR'`, `'HR_ADMIN'`, `'CB_PAYROLL'`, `'OFFICE_ADMIN'`, `'MANAGER'`, `'EMPLOYEE'`), `name`, `data_scope` (`'ALL'`, `'DEPARTMENT'`, `'SELF'`), `description`.
2. **Bảng `permissions` (Danh mục 25 quyền hạn):**
   - Cột: `id` (PK: `'P01'` -> `'P25'`), `module_code`, `permission_code`, `name`, `action`.
3. **Bảng `role_permissions` (Phân quyền theo vai trò):**
   - Cột: `role_id` (FK -> `roles.id`), `permission_id` (FK -> `permissions.id`).
4. **Bảng `users` (Tài khoản đăng nhập):**
   - Cột: `id` (PK AUTO_INCREMENT), `employee_id` (UNIQUE FK -> `employees.id`), `role_id` (FK -> `roles.id`), `username` (UNIQUE), `password_hash`, `is_active` (`1`: Hoạt động, `0`: Đã khóa), `last_login`, `created_at`.
5. **Bảng `departments` (Phòng ban & Định biên):**
   - Cột: `id` (PK AUTO_INCREMENT), `parent_id`, `department_code` (UNIQUE: `'PB001'`..), `name`, `headcount_limit`.
6. **Bảng `positions` (Chức vụ, Mô tả công việc JD & Khung lương):**
   - Cột: `id` (PK AUTO_INCREMENT), `department_id` (FK -> `departments.id`), `position_code` (UNIQUE: `'VT001'`..), `title`, `grade_level` (`'C-LEVEL'`, `'M2'`, `'S2'`, `'S1'`), `job_description`, `job_requirements`, `min_salary`, `max_salary`, `position_allowance`.
7. **Bảng `employees` (Hồ sơ nhân viên & Lương cá nhân):**
   - Cột: `id` (PK AUTO_INCREMENT), `employee_code` (UNIQUE: `'NV0001'`..), `department_id` (FK), `position_id` (FK), `full_name`, `gender`, `dob`, `phone`, `email`, `address`, `citizen_id`, `tax_code`, `base_salary`, `insurance_salary`, `meal_fuel_allowance`, `dependents_count`, `bank_account`, `bank_name`, `hire_date`, `resign_date`, `work_status` (`'WORKING'`, `'MATERNITY'`, `'RESIGNED'`), `created_at`.
8. **Bảng `contracts` (Hợp đồng lao động):**
   - Cột: `id` (PK AUTO_INCREMENT), `contract_code` (UNIQUE: `'HDLD-2025/001'`..), `employee_id` (FK -> `employees.id`), `contract_type`, `start_date`, `end_date`, `signed_salary`, `insurance_salary`, `status` (`'ACTIVE'`, `'EXPIRING_SOON'`, `'EXPIRED'`, `'TERMINATED'`), `note`, `created_at`.
9. **Bảng `work_histories` (Quá trình công tác & Điều chỉnh lương):**
   - Cột: `id` (PK AUTO_INCREMENT), `decision_code` (UNIQUE), `employee_id` (FK -> `employees.id`), `action_type` (`'ONBOARDING'`, `'PROMOTION'`, `'TRANSFER'`, `'SALARY_REVIEW'`, `'MATERNITY_LEAVE'`, `'RESIGNATION'`), `from_department_id`, `to_department_id`, `from_position_id`, `to_position_id`, `old_salary`, `new_salary`, `effective_date`, `note`.
10. **Bảng `dependents` (Người phụ thuộc giảm trừ gia cảnh):**
    - Cột: `id` (PK AUTO_INCREMENT), `employee_id` (FK -> `employees.id`), `full_name`, `relationship`, `dob`, `citizen_or_birth_cert`, `tax_code`, `deduction_start`, `deduction_end`, `status` (`'ACTIVE'`, `'INACTIVE'`).
11. **Bảng `rewards_disciplines` (Khen thưởng, Kỷ luật & Nội quy):**
    - Cột: `id` (PK AUTO_INCREMENT), `decision_code` (UNIQUE), `employee_id` (FK -> `employees.id`), `record_type` (`'REWARD'`, `'DISCIPLINE'`), `title`, `reason`, `amount` (Số dương cho Khen thưởng, số âm cho Kỷ luật), `applied_month` (`'YYYY-MM'`), `decision_date`, `status`.

---

## III. ĐẶC TẢ 5 MÀN HÌNH HIỂN THỊ ĐỘNG (DYNAMIC VIEWS)

### 1. VIEW 1: Màn hình Danh sách Nhân sự (`#view-employees`)

- **Áp dụng chung cho 4 thẻ trên Menu:** _Tất cả nhân viên_, _Nhân viên đang làm_, _Nhân viên đã nghỉ_, _Sinh nhật trong tháng_.
- **Thanh công cụ lọc & tìm kiếm:**
  - Ô tìm kiếm từ khóa: Tìm theo `employee_code`, `full_name`, `phone`, `email`, `citizen_id`.
  - Bộ lọc Dropdown: Phòng ban (`department_id`), Chức vụ (`position_id`), Trạng thái (`ALL`, `WORKING`, `MATERNITY`, `RESIGNED`), Tháng sinh nhật (`1` -> `12`).
  - Tự động kích hoạt bộ lọc khi bấm từ thẻ Menu:
    - Thẻ _"Nhân viên đang làm"_: Lọc `work_status IN ('WORKING', 'MATERNITY')`.
    - Thẻ _"Nhân viên đã nghỉ"_: Lọc `work_status = 'RESIGNED'`.
    - Thẻ _"Sinh nhật trong tháng"_: Lọc `MONTH(dob)` bằng tháng đang chọn (mặc định là tháng hiện tại hoặc tháng 11).
- **Bảng hiển thị:**
  - Các cột: `Mã NV`, `Họ và tên`, `Giới tính`, `Ngày sinh`, `Phòng ban`, `Chức vụ (kèm Ngạch bậc)`, `Lương cơ bản` _(ẩn nếu là `OFFICE_ADMIN` hoặc `SUPER_ADMIN`)_, `Trạng thái làm việc` (Badge màu), `Thao tác` (`[Xem 360°]`, `[Sửa]`).
  - Nút hành động góc trên: **`[+ Thêm nhân viên mới]`** (Chỉ hiện khi có quyền `HR.PROFILE_MANAGE`).

### 2. VIEW 2: Màn hình Cơ cấu Tổ chức, Chức vụ & Mô tả Công việc JD (`#view-org-jd`)

- **Chia làm 2 Tab hiển thị:**
  - **Tab 2.1 — Phòng ban & Định biên (`departments`):**
    - Hiển thị: `Mã PB`, `Tên phòng ban`, `Số nhân sự đang làm thực tế` / `Định biên tối đa (headcount_limit)` kèm thanh tiến độ (Progress Bar) đổi màu cảnh báo nếu chạm hoặc vượt định biên.
    - Nút **`[+ Thêm / Sửa Phòng ban]`** (Chỉ hiện khi có quyền `HR.PROFILE_MANAGE`).
  - **Tab 2.2 — Chức vụ, Mô tả công việc (JD) & Khung lương (`positions`):**
    - Hiển thị: `Mã CV`, `Tên chức vụ`, `Phòng ban`, `Ngạch bậc`, `Mô tả chi tiết công việc (job_description)`, `Yêu cầu năng lực (job_requirements)`, `Khung lương định mức (min_salary - max_salary)`, `Phụ cấp chức vụ (position_allowance)`.
    - Nút **`[+ Thêm / Sửa Chức vụ & JD]`** (Chỉ hiện khi có quyền `HR.PROFILE_MANAGE`).

### 3. VIEW 3: Màn hình Quản lý Hợp đồng Lao động (`#view-contracts`)

- **Điều kiện truy cập:** Tài khoản phải có quyền `HR.CONTRACT_MANAGE`.
- **Áp dụng cho 3 thẻ trên Menu:** _Tất cả hợp đồng_, _Hợp đồng hiện hành_, _Hợp đồng quá hạn_.
- **Thanh lọc trạng thái nhanh:**
  - Tất cả | Hiện hành (`ACTIVE` - Badge Xanh lá) | Sắp hết hạn (`EXPIRING_SOON` - Badge Vàng cam) | Quá hạn (`EXPIRED` - Badge Đỏ) | Đã thanh lý (`TERMINATED` - Badge Xám).
- **Bảng hiển thị:**
  - Các cột: `Số HĐ`, `Mã NV`, `Họ tên`, `Phòng ban`, `Loại hợp đồng`, `Ngày bắt đầu`, `Ngày kết thúc`, `Lương ký HĐ`, `Lương đóng BHXH`, `Trạng thái`, `Ghi chú`.
- **Nút hành động (Chỉ hiện khi có cả `HR.CONTRACT_MANAGE` và `HR.PROFILE_MANAGE` - tức `HR_ADMIN`):**
  - **`[+ Tạo hợp đồng mới]`**, **`[Gia hạn / Tái ký]`**, **`[Thanh lý HĐ]`**.

### 4. VIEW 4: Màn hình Khen thưởng, Kỷ luật & Nội quy (`#view-rewards-disciplines`)

- **Thanh lọc:** Lọc theo Tháng áp dụng (`applied_month` dạng `YYYY-MM`) và Loại quyết định (`ALL`, `REWARD`, `DISCIPLINE`).
- **Bảng hiển thị:**
  - Các cột: `Số QĐ`, `Mã NV`, `Họ tên`, `Phòng ban`, `Phân loại` (Khen thưởng màu xanh / Kỷ luật màu đỏ), `Tiêu đề & Lý do`, `Số tiền` (`+` thưởng hoặc `-` phạt trừ lương), `Tháng áp dụng`, `Ngày ký`.
- **Nút hành động:** **`[+ Lập quyết định Khen thưởng / Kỷ luật]`** (Chỉ hiện khi có quyền `HR.REWARD_DISCIPLINE`).

### 5. VIEW 5: Màn hình Hồ sơ Cá nhân của Tôi - Self Service (`#view-my-profile`)

- **Điều kiện truy cập:** Mở cho mọi tài khoản đang đăng nhập (xem dữ liệu của chính `currentUser.employee_id`) và là màn hình mặc định của Role `EMPLOYEE`.
- **Bố cục hiển thị 3 khối:**
  - **Khối 1 (Thông tin cá nhân & Liên hệ):** Mã NV, Họ tên, Ngày sinh, Giới tính, SĐT, Email, Địa chỉ, Số CCCD, Mã số thuế TNCN, Số tài khoản & Ngân hàng.
  - **Khối 2 (Công việc JD & Chế độ đãi ngộ của tôi):** Phòng ban, Chức vụ, Ngạch bậc, **Bản mô tả công việc (`job_description`)**, **Yêu cầu công việc (`job_requirements`)**, Lương cơ bản hiện hưởng, Lương đóng BHXH, Phụ cấp chức vụ, Phụ cấp ăn trưa & xăng xe.
  - **Khối 3 (Hồ sơ liên quan của tôi):** Bảng Hợp đồng lao động của tôi, Quá trình công tác của tôi, Người phụ thuộc của tôi (`dependents_count`) và Lịch sử Khen thưởng/Kỷ luật của tôi.
- **Nút thao tác cá nhân:** **`[Cập nhật thông tin liên hệ & Ngân hàng]`** và **`[Đổi mật khẩu đăng nhập]`**.

---

## IV. ĐẶC TẢ 5 CỬA SỔ THAO TÁC (POPUP MODALS) & LOGIC ĐỒNG BỘ TỰ ĐỘNG

### 1. MODAL 1: Hồ sơ Nhân sự 360 Độ (`#modal-employee-360`)

Mở ra khi click vào một nhân viên bất kỳ trên bảng Danh sách nhân sự, gồm **4 Tab**:

- **Tab 1 — Thông tin chung & JD Công việc:** Hiển thị toàn bộ hồ sơ cá nhân, thuế, ngân hàng, kèm khung Mô tả công việc (JD) và Khung lương vị trí đối chiếu với Lương thực tế.
- **Tab 2 — Hợp đồng lao động:** Danh sách các hợp đồng của nhân viên đó.
- **Tab 3 — Quá trình công tác (`work_histories`):**
  - Hiển thị lịch sử Onboard, bổ nhiệm, điều chuyển, tăng lương, nghỉ việc.
  - Nếu có quyền `HR.PROFILE_MANAGE`: Có form **`[+ Thêm quyết định công tác / Điều chỉnh lương]`**. Khi lưu quyết định mới, Backend tự động cập nhật `department_id = to_department_id`, `position_id = to_position_id`, `base_salary = new_salary` vào bảng `employees`.
- **Tab 4 — Người phụ thuộc (`dependents`):**
  - Hiển thị danh sách người phụ thuộc giảm trừ thuế TNCN.
  - Nếu có quyền `HR.PROFILE_MANAGE`: Có form **`[+ Thêm / Xóa người phụ thuộc]`**. Sau khi thêm/xóa, Backend tự động chạy lệnh đếm lại số người phụ thuộc `ACTIVE` và cập nhật vào cột `employees.dependents_count`.

### 2. MODAL 2: Form Thêm mới / Chỉnh sửa Nhân viên (`#modal-employee-form`)

- **Chỉ dành cho tài khoản có quyền `HR.PROFILE_MANAGE` (`HR_ADMIN`).**
- **Logic tự động khi Thêm mới:**
  1. Tự động lấy `MAX(id) + 1` để gợi ý mã `employee_code` tiếp theo (Ví dụ: `NV0013`).
  2. Khi chọn Phòng ban (`department_id`) -> Lọc danh sách Chức vụ (`position_id`) thuộc phòng ban đó.
  3. Khi chọn Chức vụ (`position_id`) -> Hiển thị ngay **Mô tả công việc (`job_description`)** và **Khung lương quy định (`min_salary` - `max_salary`)** bên dưới ô nhập lương; cảnh báo nếu mức lương nhập vào nằm ngoài khung.
  4. Khi bấm Lưu nhân viên mới: Ngoài việc `INSERT INTO employees`, Backend tự động `INSERT` 1 dòng `action_type = 'ONBOARDING'` vào bảng `work_histories`.
- **Logic tự động khi Cập nhật trạng thái Nghỉ việc (`RESIGNED`):**
  - Khi đổi `work_status = 'RESIGNED'`, bắt buộc nhập `resign_date`, đồng thời Backend tự động:
    - Khóa tài khoản đăng nhập: `UPDATE users SET is_active = 0 WHERE employee_id = ?`.
    - Đổi hợp đồng hiện hành sang đã thanh lý: `UPDATE contracts SET status = 'TERMINATED' WHERE employee_id = ? AND status = 'ACTIVE'`.
    - Ghi 1 dòng `RESIGNATION` vào bảng `work_histories`.

### 3. MODAL 3: Form Tạo mới / Gia hạn Hợp đồng (`#modal-contract-form`)

- Chọn nhân viên, nhập `contract_code`, `contract_type`, `start_date`, `end_date`, `signed_salary`, `insurance_salary`, `status`, `note`.
- **Logic đồng bộ:** Nếu tạo mới hoặc gia hạn hợp đồng có trạng thái `ACTIVE`, Backend tự động cập nhật `base_salary = signed_salary` và `insurance_salary` mới nhất sang bảng `employees`.

### 4. MODAL 4: Form Lập Quyết định Khen thưởng / Kỷ luật (`#modal-reward-discipline-form`)

- Chọn nhân viên, chọn Loại (`REWARD` hoặc `DISCIPLINE`), nhập `decision_code`, `title`, `reason`, `amount`, `applied_month`, `decision_date`.
- **Logic chuẩn hóa dấu số tiền:** Nếu `record_type = 'REWARD'` thì lưu `amount` là số dương (`+`); nếu `record_type = 'DISCIPLINE'` thì tự động chuyển `amount` thành số âm (`-`) để kỳ lương sau khấu trừ.

### 5. MODAL 5: Form Tự cập nhật Liên hệ & Đổi mật khẩu (`#modal-self-update`)

- Chỉ cho phép sửa 4 trường của chính người đang đăng nhập (`currentUser.employee_id`): `phone`, `address`, `bank_account`, `bank_name` (Tuyệt đối không cho sửa Lương, Phòng ban, Chức vụ, CCCD).
- Khu vực Đổi mật khẩu: Kiểm tra mật khẩu hiện tại, nếu khớp thì cập nhật `password_hash` mới vào bảng `users`.

---

## V. MA TRẬN PHÂN QUYỀN & HIỂN THỊ CHẶNG 1 THEO 7 VAI TRÒ

| Vai trò (`role_id`) | Tài khoản Demo                       | `data_scope` | Màn hình (Views) được xem trong Chặng 1                                                 | Quyền thao tác (Buttons) & Bảo mật cột Lương                                                                                                                   |
| :------------------ | :----------------------------------- | :----------: | :-------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`HR_ADMIN`**      | `hr_admin`                           |    `ALL`     | Xem đủ cả **5 Views** (Toàn bộ 12 nhân viên).                                           | **Toàn quyền CRUD Chặng 1:** Thêm/Sửa NV, Phòng ban, Chức vụ/JD, Hợp đồng, Công tác, Người phụ thuộc, Khen thưởng/Kỷ luật. Thấy toàn bộ lương.                 |
| **`DIRECTOR`**      | `giamdoc`                            |    `ALL`     | Xem **View 1, 2, 3, 5** (Toàn bộ 12 nhân viên & Hợp đồng).                              | Chỉ xem & đối chiếu tổng thể (Không hiện nút sửa hồ sơ chi tiết hay tạo hợp đồng). Thấy toàn bộ lương công ty.                                                 |
| **`CB_PAYROLL`**    | `cb_payroll`                         |    `ALL`     | Xem **View 1, 2, 3, 5** (Toàn bộ 12 nhân viên & Hợp đồng).                              | Xem hồ sơ, người phụ thuộc, mức lương cơ bản và hợp đồng để làm căn cứ tính lương & BHXH. Thấy toàn bộ lương công ty.                                          |
| **`OFFICE_ADMIN`**  | `hanhchinh`                          |    `ALL`     | Xem **View 1, 2, 4, 5** _(Ẩn View 3 - Hợp đồng)_.                                       | Được bấm **`[+ Lập quyết định Khen thưởng / Kỷ luật]`** ở View 4. **Bắt buộc ẩn/che (`\***`) toàn bộ cột lương của nhân viên khác ở View 1 và Modal 360.\*\*   |
| **`SUPER_ADMIN`**   | `admin_it`                           |    `ALL`     | Xem **View 1, 2, 5** _(Ẩn View 3 - Hợp đồng & View 4)_.                                 | Chỉ xem danh bạ nhân sự & phòng ban để hỗ trợ kỹ thuật. **Bắt buộc ẩn/che (`\***`) toàn bộ cột lương của nhân viên khác.\*\*                                   |
| **`MANAGER`**       | `truongphong_it`<br>`truongphong_kd` | `DEPARTMENT` | Xem **View 1, 2, 4, 5** _(Chỉ hiển thị nhân viên thuộc đúng `department_id` của mình)_. | Xem Hồ sơ 360, JD và lương của nhân viên cấp dưới trong phòng mình; không có nút Thêm/Sửa hồ sơ gốc hay Hợp đồng.                                              |
| **`EMPLOYEE`**      | `nhanvien_dev`                       |    `SELF`    | Mặc định vào thẳng **View 5 (Hồ sơ cá nhân của tôi)**.                                  | Chỉ xem duy nhất hồ sơ, JD, hợp đồng, quá trình công tác, người phụ thuộc của chính mình (`NV0006`). Được bấm **`[Cập nhật liên hệ]`** & **`[Đổi mật khẩu]`**. |
