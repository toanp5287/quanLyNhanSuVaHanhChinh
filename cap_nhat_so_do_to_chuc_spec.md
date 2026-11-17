# ĐẶC TẢ CẬP NHẬT CƠ CẤU TỔ CHỨC PHÂN CẤP (1 PHÒNG TỔNG - 3 PHÒNG PHỤ)

## Áp dụng cho Phân hệ Quản lý Nhân sự (Chặng 1) & Chấm công - Nghỉ phép (Chặng 2)

---

## I. MÔ HÌNH TỔ CHỨC & ĐỊNH BIÊN NHÂN SỰ (3 CẤP BẬC)

Hệ thống áp dụng mô hình quản lý phân cấp đa tầng thông qua cặp khóa tự tham chiếu `departments.parent_id` (Phòng ban cấp trên) và `employees.manager_id` (Người quản lý trực tiếp):

```text
[BAN GIÁM ĐỐC (ID Nhân viên = 1)]
       │
       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ CẤP 1 (PHÒNG TO): PHÒNG QUẢN LÝ HÀNH CHÍNH (dept_id = 10, parent = NULL)│
│ 👤 Người đứng đầu: Trưởng phòng Quản lý Hành chính (emp_id = 2)         │
└──────┬─────────────────────────────────┬────────────────────────┬───────┘
       │ parent_id = 10                  │ parent_id = 10         │ parent_id = 10
       ▼                                 ▼                        ▼
┌──────────────────────┐        ┌──────────────────────┐ ┌──────────────────────┐
│ CẤP 2 (PHÒNG PHỤ 1)  │        │ CẤP 2 (PHÒNG PHỤ 2)  │ │ CẤP 2 (PHÒNG PHỤ 3)  │
│ HÀNH CHÍNH – NHÂN SỰ │        │ CÔNG NGHỆ & PHẦN MỀM │ │ KINH DOANH & TM      │
│ (dept_id = 2)        │        │ (dept_id = 3)        │ │ (dept_id = 4)        │
├──────────────────────┤        ├──────────────────────┤ ├──────────────────────┤
│ 👤 Đứng đầu Phòng 1  │        │ 👤 Đứng đầu Phòng 2  │ │ 👤 Đứng đầu Phòng 3  │
│ Trưởng BP HC–NS      │        │ Trưởng BP CN&PM      │ │ Trưởng BP KD&TM      │
│ (emp_id = 3)         │        │ (emp_id = 5)         │ │ (emp_id = 8)         │
│ -> Báo cáo: emp_id 2 │        │ -> Báo cáo: emp_id 2 │ │ -> Báo cáo: emp_id 2 │
├──────────────────────┤        ├──────────────────────┤ ├──────────────────────┤
│ CẤP 3 (NHÂN VIÊN):   │        │ CẤP 3 (NHÂN VIÊN):   │ │ CẤP 3 (NHÒM KD):     │
│ • Chuyên viên        │        │ • Lập trình viên     │ │ • Nhân viên          │
│   tuyển dụng         │        │   (emp_id = 6, 7)    │ │   kinh doanh         │
│   (emp_id = 4)       │        │ -> Báo cáo: emp_id 5 │ │   (emp_id = 9, 11)   │
│ -> Báo cáo: emp_id 3 │        │                      │ │ -> Báo cáo: emp_id 8 │
└──────────────────────┘        └──────────────────────┘ └──────────────────────┘
```

# ĐẶC TẢ PHÂN QUYỀN & CƠ CẤU TỔ CHỨC PHÂN CẤP (1 PHÒNG TO - 3 PHÒNG PHỤ)

## Đồng bộ chuẩn Schema thực tế trên TiDB Cloud (hr_management)

## I. SƠ ĐỒ PHÂN CẤP TỔ CHỨC & QUẢN LÝ 3 TẦNG

Hệ thống phân quyền dựa trực tiếp trên 3 cột của bảng `employees` (`department_id`, `manager_id`, `data_scope`) kết hợp với cột phân cấp phòng cha `parent_id` của bảng `departments`:

[BAN GIÁM ĐỐC (emp_id = 1 | data_scope = 'ALL')]
│
▼
┌─────────────────────────────────────────────────────────────────────────┐
│ CẤP 1 (PHÒNG TO): PHÒNG QUẢN LÝ HÀNH CHÍNH (dept_id = 10, parent = NULL)│
│ Người đứng đầu: Trưởng phòng Quản lý Hành chính (emp_id = 2) │
│ Phạm vi quyền: data_scope = 'DEPARTMENT' (Bao trùm dept_id 10, 2, 3, 4) │
└──────┬─────────────────────────────────┬────────────────────────┬───────┘
│ parent_id = 10 │ parent_id = 10 │ parent_id = 10
▼ ▼ ▼
┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
│ CẤP 2 (PHÒNG PHỤ 1) │ │ CẤP 2 (PHÒNG PHỤ 2) │ │ CẤP 2 (PHÒNG PHỤ 3) │
│ HÀNH CHÍNH – NHÂN SỰ │ │ CÔNG NGHỆ & PHẦN MỀM │ │ KINH DOANH & TM │
│ (dept_id = 2) │ │ (dept_id = 3) │ │ (dept_id = 4) │
├──────────────────────┤ ├──────────────────────┤ ├──────────────────────┤
│ Đứng đầu Phòng 1: │ │ Đứng đầu Phòng 2: │ │ Đứng đầu Phòng 3: │
│ Trưởng BP HC–NS │ │ Trưởng BP CN&PM │ │ Trưởng BP KD&TM │
│ (emp_id = 3) │ │ (emp_id = 5) │ │ (emp_id = 8) │
│ manager_id = 2 │ │ manager_id = 2 │ │ manager_id = 2 │
│ scope = 'DEPARTMENT' │ │ scope = 'DEPARTMENT' │ │ scope = 'DEPARTMENT' │
├──────────────────────┤ ├──────────────────────┤ ├──────────────────────┤
│ CẤP 3 (NHÂN VIÊN): │ │ CẤP 3 (NHÂN VIÊN): │ │ CẤP 3 (NHÂN VIÊN): │
│ Chuyên viên │ │ Lập trình viên │ │ Nhân viên │
│ tuyển dụng │ │ (emp_id = 6, 7) │ │ kinh doanh │
│ (emp_id = 4) │ │ manager_id = 5 │ │ (emp_id = 9, 11) │
│ manager_id = 3 │ │ scope = 'SELF' │ │ manager_id = 8 │
│ scope = 'SELF' │ │ │ │ scope = 'SELF' │
└──────────────────────┘ └──────────────────────┘ └──────────────────────┘

## II. QUY TẮC TƯƠNG THÍCH CỘT DATABASE (CHỐNG LỖI SQL)

1. Tuyệt đối KHÔNG truy vấn bảng `user_accounts` (không tồn tại trong database `hr_management`). Toàn bộ thông tin phân quyền (`data_scope`, `department_id`, `position_id`, `manager_id`) được đọc trực tiếp từ bảng `employees` (hoặc bảng xác thực hiện có trong file Backend).
2. Tương thích tên cột trên bảng `departments`:
   - Khi `SELECT`: Luôn dùng `COALESCE(d.department_name, d.name) AS department_name` và `COALESCE(d.department_code, d.dept_code) AS dept_code`.
   - Khi `INSERT` / `UPDATE`: Ghi đồng thời cả 2 cột (`department_name` và `name`, `department_code` và `dept_code`).
3. Tương thích tên cột trên bảng `positions`:
   - Khi `SELECT`: Luôn dùng `COALESCE(p.position_name, p.name) AS position_name` và `COALESCE(p.position_code, p.pos_code) AS pos_code`.
   - Khi `INSERT` / `UPDATE`: Ghi đồng thời cả 2 cột (`position_name` và `name`, `position_code` và `pos_code`).

## III. BẢNG ÁNH XẠ PHÂN QUYỀN NHÂN SỰ & PHÒNG BAN

### 1. Danh mục Phòng ban (`departments`)

| ID  | Mã phòng | Tên phòng ban            | `parent_id` | `manager_id` |
| :-: | :------- | :----------------------- | :---------: | :----------: |
| 10  | P_QLHC   | Phòng Quản lý Hành chính |    NULL     |      2       |
|  2  | P_HCNS   | Hành chính – Nhân sự     |     10      |      3       |
|  3  | P_CNPM   | Công nghệ & Phần mềm     |     10      |      5       |
|  4  | P_KDTM   | Kinh doanh & Thương mại  |     10      |      8       |

### 2. Ma trận Phân quyền theo Nhân sự (`employees`)

| `emp_id` | Chức vụ                                | `department_id` | `manager_id` | `data_scope` |
| :------: | :------------------------------------- | :-------------: | :----------: | :----------- |
|    1     | Giám đốc                               |        1        |     NULL     | ALL          |
|    2     | Trưởng phòng Quản lý Hành chính        |       10        |      1       | DEPARTMENT   |
|    3     | Trưởng bộ phận Hành chính – Nhân sự    |        2        |      2       | DEPARTMENT   |
|    5     | Trưởng bộ phận Công nghệ & Phần mềm    |        3        |      2       | DEPARTMENT   |
|    8     | Trưởng bộ phận Kinh doanh & Thương mại |        4        |      2       | DEPARTMENT   |
|    4     | Chuyên viên tuyển dụng                 |        2        |      3       | SELF         |
|   6, 7   | Lập trình viên                         |        3        |      5       | SELF         |
|  9, 11   | Nhân viên kinh doanh                   |        4        |      8       | SELF         |

## IV. LOGIC KIỂM SOÁT QUYỀN XEM & PHÊ DUYỆT TẠI BACKEND

### 1. Logic lọc dữ liệu theo `data_scope` (Dùng cho Nhân sự, Điểm danh, Bảng công, OT, Nghỉ phép)

- Nếu `currentUser.data_scope === 'ALL'` (hoặc `emp_id === 1` hoặc vai trò HR/C&B toàn công ty):
  - Xem được toàn bộ nhân viên trong công ty.
- Nếu `currentUser.data_scope === 'DEPARTMENT'`:
  - Lọc nhân viên thuộc phòng hiện tại HOẶC thuộc các phòng phụ có `parent_id` bằng phòng hiện tại HOẶC có `manager_id` là người đang đăng nhập:
  ```sql
  WHERE (
      e.department_id = :currentDeptId
      OR e.department_id IN (SELECT id FROM departments WHERE parent_id = :currentDeptId)
      OR e.manager_id = :currentEmpId
  )
  ```
