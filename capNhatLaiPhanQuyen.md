# PROMPT ĐẶC TẢ: NÂNG CẤP HỆ THỐNG & GIAO DIỆN BẢNG PHÂN QUYỀN ĐỘNG (DYNAMIC RBAC MATRIX)

## 1. Vai trò & Mục tiêu

Bạn là Senior Full-Stack Engineer. Hãy nâng cấp đồng bộ **Backend API** và **Frontend UI** cho trang **Bảng Phân Quyền (RBAC Matrix)** trong dự án `hr_management` (Node.js / Express 5 / ES Modules / MySQL-TiDB / Zod / Vite / Vanilla JS / Tailwind CSS / Lucide Icons).

**Mục tiêu cốt lõi:**

- Loại bỏ hoàn toàn việc hardcode danh sách quyền trên frontend/backend.
- Tự động đọc và hiển thị động toàn bộ quyền trong bảng `permissions` (bao gồm 4 quyền mới `P27`–`P30` của module Giải trình đi muộn `ATT.LATE_EXPLAIN_*` và mọi quyền thêm mới sau này).
- Thiết kế giao diện **Ma trận Gom nhóm theo Module (Collapsible Matrix)** chuẩn **Dark-mode Glassmorphism**, gọn gàng, hỗ trợ chọn nhanh theo nhóm module, lọc nhanh, khóa an toàn `SUPER_ADMIN` và thanh lưu thay đổi nổi (Dirty-State Floating Bar).

---

## 2. Ràng buộc Cô lập (STRICT GUARDRAILS — BẮT BUỘC TUÂN THỦ)

1. **PHẠM VI CHỈNH SỬA:** Chỉ làm việc trên các file liên quan đến module RBAC / Phân quyền (routes, controllers, services, validators, auth middleware nếu cần làm mới quyền, và trang UI phân quyền).
2. **KHÔNG ĐỤNG MODULE KHÁC:** Tuyệt đối không chỉnh sửa logic FaceID, chấm công, giải trình đi muộn, hợp đồng, bảng lương hay schema database của các phân hệ khác.
3. **KHÔNG HARDCODE QUYỀN:** Không khai báo cứng danh sách `P01..P30` ở frontend. Mọi module, quyền, vai trò và trạng thái tick đều phải render 100% từ dữ liệu API `GET /api/rbac/matrix`.
4. **CHỐNG TỰ KHÓA HỆ THỐNG (ANTI-LOCKOUT):** Cấm chỉnh sửa quyền hoặc thay đổi `data_scope` của vai trò `SUPER_ADMIN` cả ở Backend (trả `403 Forbidden`) lẫn Frontend (khóa bằng icon ổ khóa).

---

## 3. Cấu trúc Database Hiện Có (Đã Xác Minh trên TiDB/MySQL)

- **`roles`**: `id (varchar(30))`, `name (varchar(100))`, `data_scope (varchar(20))`, `description (text)`
  - 7 vai trò hiện hành: `SUPER_ADMIN` (`ALL`), `HR_ADMIN` (`ALL`), `DIRECTOR` (`ALL`), `MANAGER` (`DEPARTMENT`), `CB_PAYROLL` (`ALL`), `OFFICE_ADMIN` (`ALL`), `EMPLOYEE` (`SELF`).
- **`permissions`**: `id (varchar(20))`, `module_code (varchar(30))`, `permission_code (varchar(60))`, `name (varchar(150))`, `action (varchar(20))`
  - Ví dụ phân hệ `M02_ATTENDANCE` gồm `P06`, `P07` và 4 quyền mới: `P27 (ATT.LATE_EXPLAIN_SELF)`, `P28 (ATT.LATE_EXPLAIN_APPROVE)`, `P29 (ATT.LATE_EXPLAIN_HR_VERIFY)`, `P30 (ATT.LATE_EXPLAIN_POLICY)`.
- **`role_permissions`**: `role_id (varchar(30))`, `permission_id (varchar(20))`
- **`users`**: `id (int)`, `employee_id (int)`, `role_id (varchar(30))`, `username (varchar(50))`, `is_active (tinyint(1))`

_(Ghi chú dữ liệu: Nếu quyền `P26` đang có `module_code = 'HR'`, hãy gộp chung hoặc chuẩn hóa về `'M01_HR'` khi hiển thị nếu cần.)_

---

## 4. Đặc tả Backend API (Node.js / Express 5 / Zod)

### 4.1. Quyền truy cập API

- Chỉ cho phép vai trò `SUPER_ADMIN` (hoặc `HR_ADMIN` nếu hệ thống đang mở quyền quản trị phân quyền cho HR — nhưng `HR_ADMIN` tuyệt đối không được sửa `SUPER_ADMIN` và không được tự gỡ quyền quản trị của chính mình).

### 4.2. Các Endpoint bắt buộc

#### A. Lấy toàn bộ Ma trận Phân quyền — `GET /api/rbac/matrix`

- Truy vấn đồng thời:
  1. Danh sách `roles` kèm số lượng tài khoản đang active (`user_count` từ bảng `users WHERE is_active = 1`), sắp xếp theo thứ tự ưu tiên cấp bậc (`SUPER_ADMIN`, `DIRECTOR`, `HR_ADMIN`, `MANAGER`, `CB_PAYROLL`, `OFFICE_ADMIN`, `EMPLOYEE`).
  2. Toàn bộ `permissions` sắp xếp theo `module_code ASC, id ASC` và gom nhóm sẵn thành mảng `modules`.
  3. Toàn bộ bản ghi trong `role_permissions` chuyển thành map `{ [role_id]: string[] }` (mảng các `permission_id`).
- **Response chuẩn:**

```json
{
  "roles": [
    {
      "id": "SUPER_ADMIN",
      "name": "Quản trị hệ thống (IT Admin)",
      "data_scope": "ALL",
      "user_count": 1,
      "is_locked": true
    }
  ],
  "modules": [
    {
      "module_code": "M02_ATTENDANCE",
      "module_label": "Chấm công & Giải trình",
      "permissions": [
        {
          "id": "P27",
          "permission_code": "ATT.LATE_EXPLAIN_SELF",
          "name": "Xem & nộp giải trình đi muộn của bản thân",
          "action": "CREATE"
        }
      ]
    }
  ],
  "matrix": {
    "EMPLOYEE": ["P06", "P08", "P15", "P20", "P22", "P25", "P27"]
  }
}
```

_(Bổ sung map nhãn tiếng Việt thân thiện cho `module_code` như `M01_HR` -> `Hồ sơ & Hợp đồng`, `M02_ATTENDANCE` -> `Chấm công & Giải trình`, `M03_LEAVE` -> `Nghỉ phép`, v.v.; nếu gặp `module_code` mới chưa có trong map thì fallback về chính `module_code` đó)._

#### B. Cập nhật danh sách quyền của 1 vai trò — `PUT /api/rbac/roles/:roleId/permissions`

- **Zod Validation:**
  - `permission_ids`: `z.array(z.string().min(1).max(20)).default([])` (loại bỏ trùng lặp bằng `Set`).
- **Guardrails & Transaction:**
  1. Nếu `roleId === 'SUPER_ADMIN'` -> trả về `403 Forbidden` (`SUPER_ADMIN_LOCKED`).
  2. Kiểm tra `roleId` tồn tại trong `roles` (không có -> `404`).
  3. Kiểm tra toàn bộ `permission_ids` gửi lên đều tồn tại trong bảng `permissions` (có mã không hợp lệ -> `400 Bad Request`).
  4. Chạy trong **DB Transaction** (`BEGIN ... COMMIT`, `ROLLBACK` nếu lỗi):
     - `DELETE FROM role_permissions WHERE role_id = ?`
     - Bulk `INSERT INTO role_permissions (role_id, permission_id) VALUES ...` (nếu mảng không rỗng).
  5. Trả về danh sách `permission_ids` mới nhất của `roleId`.

#### C. Cập nhật phạm vi dữ liệu của vai trò — `PATCH /api/rbac/roles/:roleId/scope`

- **Zod Validation:**
  - `data_scope`: `z.enum(['ALL', 'DEPARTMENT', 'SELF'])`
- **Guardrails:**
  1. Nếu `roleId === 'SUPER_ADMIN'` -> trả về `403 Forbidden`.
  2. Cập nhật `UPDATE roles SET data_scope = ? WHERE id = ?`.

#### D. Đồng bộ quyền tức thì (Fresh Permissions)

- Rà soát endpoint `/api/auth/me` và middleware phân quyền: đảm bảo danh sách `permissions` (mảng `permission_code`) được query trực tiếp từ `role_permissions JOIN permissions` (hoặc xóa cache ngay sau khi `PUT /api/rbac/roles/:roleId/permissions` thành công) để thay đổi phân quyền có hiệu lực ngay lập tức.

---

## 5. Đặc tả Giao diện Bảng Phân Quyền (Dark-mode Glassmorphism)

### 5.1. Hệ thống Thiết kế (Design System)

- **Container / Card:** `bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-xl shadow-lg`.
- **Nút Icon vuông kèm Pure CSS Tooltip:** Kích thước `w-8 h-8 rounded-lg flex items-center justify-center border border-white/10`, dùng `data-tooltip="..."` hiện tooltip phía trên bằng CSS `::after` khi `:hover` (không dùng thư viện tooltip ngoài).
- **Badge màu theo `action`:**
  - `VIEW`: `bg-slate-500/15 text-slate-300 border-slate-500/30`
  - `CREATE` / `UPDATE`: `bg-sky-500/15 text-sky-300 border-sky-500/30`
  - `APPROVE`: `bg-emerald-500/15 text-emerald-300 border-emerald-500/30`
  - `MANAGE`: `bg-violet-500/15 text-violet-300 border-violet-500/30`
  - `LOCK` / `EXECUTE`: `bg-rose-500/15 text-rose-300 border-rose-500/30`

### 5.2. Thanh Công cụ Phía Trên (Sticky Toolbar)

1. **Ô tìm kiếm nhanh:** Lọc realtime theo `id` (`P27`), `permission_code` (`ATT.LATE_EXPLAIN`), hoặc `name` (không phân biệt hoa thường/dấu nếu có thể).
2. **Dropdown lọc Module:** `Tất cả phân hệ` + danh sách các `module_code` trả về từ API.
3. **Nhóm Pill lọc `action`:** `Tất cả`, `VIEW`, `CREATE`, `APPROVE`, `MANAGE`, `LOCK`, `EXECUTE`.
4. **3 Nút Icon bên phải (có CSS Tooltip):**
   - `Mở rộng tất cả` (`chevrons-down`)
   - `Thu gọn tất cả` (`chevrons-up`)
   - `Tải lại ma trận` (`refresh-cw`)

### 5.3. Ma trận 2 chiều Gom nhóm (Collapsible Matrix)

- **Sticky Header & Sticky First Column:** Cố định hàng tiêu đề 7 vai trò khi cuộn dọc và cố định cột tên quyền bên trái khi cuộn ngang (`backdrop-blur-md bg-slate-950/90`).
- **Tiêu đề mỗi cột Role:**
  - Tên vai trò gọn + mã `role_id`.
  - Badge số lượng user đang gắn vai trò (ví dụ `3 NV`).
  - Selector / Pill chọn `data_scope` (`ALL` / `DEPT` / `SELF`) ngay dưới tên role (khóa cứng trên `SUPER_ADMIN`).
- **Hàng Nhóm Module (Accordion Header Row):**
  - Bấm vào tên module để đóng/mở danh sách quyền con; hiển thị badge tổng số quyền trong module (ví dụ: `M02_ATTENDANCE • 6 quyền`).
  - Tại giao điểm `[Module × Role]`: Đặt **Group Checkbox** cho phép tick/bỏ tick toàn bộ quyền trong module cho vai trò đó. Hỗ trợ đầy đủ 3 trạng thái: `checked` (đủ 100%), `unchecked` (0%), và `indeterminate` (có một phần).
- **Hàng Quyền Chi tiết:**
  - Cột đầu tiên: Tên quyền (dòng 1) + mã `P27` · `ATT.LATE_EXPLAIN_SELF` + badge màu `action` (dòng 2, cỡ chữ nhỏ `text-xs text-slate-400`).
  - Các ô giao điểm:
    - Nếu `role.id === 'SUPER_ADMIN'`: Hiển thị icon ổ khóa (`lock`) màu hổ phách nhạt kèm `data-tooltip="Toàn quyền hệ thống (không thể chỉnh sửa)"`, không cho tương tác.
    - Các role khác: Checkbox tùy chỉnh rõ nét; nếu ô đang bị thay đổi so với bản gốc từ DB (dirty), viền ô phát sáng nhẹ (`ring-1 ring-amber-400/60 bg-amber-500/10`) để admin dễ nhận biết mình vừa sửa ô nào.

### 5.4. Thanh Lưu Thay Đổi Nổi (Dirty-State Floating Bar)

- **Không gọi API rời rạc** ngay khi bấm từng checkbox. Lưu trạng thái chỉnh sửa tạm (`draftMatrix` và `draftScopes`) so sánh với `originalMatrix` / `originalScopes`.
- Khi phát hiện có ít nhất 1 thay đổi: Hiển thị thanh glassmorphism nổi ở mép dưới màn hình (`fixed bottom-5 left-1/2 -translate-x-1/2 z-40`) gồm:
  - Chấm trạng thái màu vàng + thống kê ngắn: _"Đang thay đổi X quyền trên Y vai trò"_.
  - Nút **`Hoàn tác`**: Reset toàn bộ `draft` về đúng `original` từ DB.
  - Nút **`Lưu phân quyền`**: Gọi song song `PUT /api/rbac/roles/:roleId/permissions` (và `PATCH .../scope` nếu có đổi scope) cho các role bị thay đổi; hiển thị trạng thái loading, sau đó đồng bộ lại `original`, ẩn thanh nổi và hiện toast thông báo thành công.

---

## 6. Tiêu chí Nghiệm thu (Self-Verification Checklist)

1. Mở trang Bảng phân quyền thấy ngay 4 quyền mới `P27`–`P30` nằm gọn trong nhóm `M02_ATTENDANCE` mà không cần hardcode ở frontend.
2. Gõ `LATE_EXPLAIN` vào ô tìm kiếm lọc ra đúng 4 dòng `P27`–`P30` kèm header nhóm `M02_ATTENDANCE`.
3. Tick checkbox ở hàng nhóm `M02_ATTENDANCE` cho role `MANAGER` sẽ chọn toàn bộ quyền trong nhóm; bỏ tick 1 quyền con thì checkbox nhóm tự chuyển sang trạng thái `indeterminate`.
4. Cột `SUPER_ADMIN` hiển thị icon ổ khóa, không thể tick; gọi trực tiếp API `PUT /api/rbac/roles/SUPER_ADMIN/permissions` bị backend chặn `403`.
5. Tick thay đổi quyền cho 2 role bất kỳ -> thanh nổi hiện đúng số thay đổi -> bấm `Lưu phân quyền` -> reload trang (F5) dữ liệu giữ nguyên chính xác từ TiDB.
6. Không có bất kỳ file nào ngoài phạm vi module RBAC/Auth bị chỉnh sửa ngoài ý muốn.
