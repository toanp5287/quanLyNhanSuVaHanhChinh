# PROMPT ĐẶC TẢ TÁI CẤU TRÚC GIAO DIỆN: MODULE GIẢI TRÌNH ĐI MUỘN (RBAC-STRICT UI)

## 1. Vai trò & Mục tiêu

Bạn là Senior Frontend Engineer. Hãy tái cấu trúc **toàn bộ giao diện (UI/CSS & Frontend state)** của module **Giải trình đi muộn (Late Explanation)** trong dự án `hr_management` (Vite + Vanilla JavaScript + Tailwind CSS + Lucide Icons).

Mục tiêu: Dọn sạch tình trạng hiển thị lộn xộn hiện tại, chuyển sang cơ chế **render chặt chẽ theo phân quyền (Capability-Based UI)** dựa trên đúng **7 `role_id`** và **4 mã quyền `ATT.LATE_EXPLAIN_*` (`P27`–`P30`)**, với phong cách **Dark-mode Glassmorphism** gọn gàng, ưu tiên **nút Icon vuông kèm CSS Tooltip**.

---

## 2. Ràng buộc Cô lập (STRICT GUARDRAILS — BẮT BUỘC TUÂN THỦ)

1. **KHÔNG CHỈNH SỬA BACKEND:** Tuyệt đối không sửa đổi bất kỳ file nào thuộc backend (Express routes, controllers, services, validators, cronjobs), database schema, hay logic chấm công/FaceID.
2. **GIỮ NGUYÊN API CONTRACT:** Chỉ gọi đúng các endpoint hiện có của module giải trình đi muộn & ủy quyền (`/api/attendance-late-explanations/*`, `/api/approval-delegations/*`).
3. **KHÔNG RENDER DOM KHI KHÔNG CÓ QUYỀN:** Không dùng `display: none`, `opacity-50` hay `disabled` để che các tab/nút mà người dùng không có quyền. **Không có quyền thì không tạo phần tử đó trong DOM.**
4. **CHỐNG TỰ DUYỆT TRÊN UI:** Bắt buộc kiểm tra `row.employee_id !== currentUser.employee_id` trước khi render nút `Duyệt`, `Từ chối`, `HR Ghi nhận`, hoặc `Hồ sơ không hợp lệ`.

---

## 3. Nguồn Chân lý Phân quyền (Access Control Matrix)

Tạo (hoặc chuẩn hóa) một file helper duy nhất: `src/utils/lateExplainAccess.js` để điều khiển toàn bộ việc hiển thị Tab, Header Action và Row Action.

### 3.1. 4 Mã quyền nguyên tử (`M02_ATTENDANCE`)

- `P27` — `ATT.LATE_EXPLAIN_SELF`: Xem & nộp giải trình của bản thân.
- `P28` — `ATT.LATE_EXPLAIN_APPROVE`: Xem tab Cần duyệt, duyệt/từ chối đơn cấp dưới & cấu hình ủy quyền duyệt thay.
- `P29` — `ATT.LATE_EXPLAIN_HR_VERIFY`: Xem tab HR Ghi nhận, xác nhận công (`RECORDED` / `INVALID_SUBMISSION`) & theo dõi ngưỡng leo thang.
- `P30` — `ATT.LATE_EXPLAIN_POLICY`: Mở modal xem/cấu hình quy chế ân hạn, SLA 24h/48h & ngưỡng vi phạm.

### 3.2. Ma trận Hiển thị theo 7 `role_id`

| `role_id`      | Quyền sở hữu | Thanh Tab (`showTabBar`)               | Tab được render (đúng thứ tự)             | Đặc thù UI                                                     |
| :------------- | :----------- | :------------------------------------- | :---------------------------------------- | :------------------------------------------------------------- |
| `EMPLOYEE`     | `P27`        | **Ẩn hoàn toàn** (`tabs.length === 1`) | `Của tôi`                                 | Chỉ thấy đơn của mình + badge quota ân hạn                     |
| `MANAGER`      | `P27`, `P28` | Hiện (2 tab)                           | `Của tôi` \| `Cần duyệt`                  | Có nút `Ủy quyền` trên tab `Cần duyệt`                         |
| `OFFICE_ADMIN` | `P27`, `P28` | Hiện (2 tab)                           | `Của tôi` \| `Cần duyệt`                  | Tab `Cần duyệt` chỉ hiện đơn được giao duyệt                   |
| `DIRECTOR`     | `P27`, `P28` | Hiện (2 tab)                           | `Cần duyệt` (mặc định) \| `Tự khai báo`   | Đổi nhãn tab cá nhân thành `Tự khai báo`, ẩn cột `Người duyệt` |
| `CB_PAYROLL`   | `P27`, `P29` | Hiện (2 tab)                           | `Của tôi` \| `HR Ghi nhận`                | Không có tab `Cần duyệt` (trừ khi đang có ủy quyền)            |
| `HR_ADMIN`     | `P27`–`P30`  | Hiện (3 tab)                           | `Của tôi` \| `Cần duyệt` \| `HR Ghi nhận` | Có thêm nút icon `Cấu hình quy chế` (`P30`)                    |
| `SUPER_ADMIN`  | `P27`–`P30`  | Hiện (3 tab)                           | `Của tôi` \| `Cần duyệt` \| `HR Ghi nhận` | Toàn quyền cấu hình & giám sát                                 |

> **Trường hợp Ủy quyền động:** Nếu người dùng không có `P28` (ví dụ `EMPLOYEE` hoặc `CB_PAYROLL`) nhưng `hasActiveDelegation === true`, tự động mở thêm tab `Cần duyệt` và gắn badge `[Được ủy quyền]` trên các dòng đơn duyệt thay.

### 3.3. Logic chuẩn cho `src/utils/lateExplainAccess.js`

```js
export function buildLateExplainAccess(
  user,
  { hasActiveDelegation = false } = {},
) {
  const perms = new Set(user?.permissions || []);
  const roleId = user?.role_id;
  const isDirector = roleId === "DIRECTOR";

  const canSelf = perms.has("ATT.LATE_EXPLAIN_SELF");
  const canApprove =
    perms.has("ATT.LATE_EXPLAIN_APPROVE") || hasActiveDelegation;
  const canHrVerify = perms.has("ATT.LATE_EXPLAIN_HR_VERIFY");
  const canConfigPolicy = perms.has("ATT.LATE_EXPLAIN_POLICY");

  const tabs = [];
  if (isDirector && canApprove)
    tabs.push({ id: "approve", label: "Cần duyệt" });
  if (canSelf)
    tabs.push({ id: "my", label: isDirector ? "Tự khai báo" : "Của tôi" });
  if (!isDirector && canApprove)
    tabs.push({ id: "approve", label: "Cần duyệt" });
  if (canHrVerify) tabs.push({ id: "hr", label: "HR Ghi nhận" });

  return {
    tabs,
    showTabBar: tabs.length > 1,
    defaultTab: tabs[0]?.id || "my",
    isDirector,
    canDelegate: perms.has("ATT.LATE_EXPLAIN_APPROVE"),
    canConfigPolicy,

    canSubmitRow(row) {
      return (
        canSelf &&
        row.employee_id === user.employee_id &&
        row.submission_status === "PENDING_SUBMIT"
      );
    },

    canApproveRow(row) {
      if (!canApprove) return false;
      if (row.employee_id === user.employee_id) return false;
      return (
        row.submission_status === "SUBMITTED" &&
        row.approval_status === "PENDING"
      );
    },

    canHrVerifyRow(row) {
      if (!canHrVerify) return false;
      if (row.employee_id === user.employee_id) return false;
      return (
        row.approval_status !== "PENDING" && row.hr_status === "PENDING_HR"
      );
    },
  };
}
```

---

## 4. Hệ thống Thiết kế (Design System — Dark-mode Glassmorphism)

1. **Bề mặt Glassmorphism:**
   - Card / Container: `bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-xl shadow-lg`.
   - Modal: `bg-slate-950/85 backdrop-blur-xl border border-white/15 rounded-2xl`.
   - Bảng dữ liệu: `divide-y divide-white/5`, hàng hover `hover:bg-white/[0.03] transition-colors`, chữ chính `text-slate-100`, chữ phụ `text-slate-400`.
2. **Nút Icon vuông kèm Pure CSS Tooltip (KHÔNG dùng nút chữ dài trong bảng):**
   - Mỗi dòng bảng chỉ hiển thị nút icon vuông `w-8 h-8 rounded-lg flex items-center justify-center border border-white/10`.
   - Dùng CSS thuần qua attribute `data-tooltip="..."` (pseudo-element `::after` hiện phía trên nút khi `:hover`, `z-50`, `pointer-events-none`, `whitespace-nowrap`).
   - Màu sắc ngữ nghĩa cho icon action:
     - `Xem chi tiết` (`eye`): `bg-white/5 text-slate-300 hover:bg-white/10`
     - `Nộp giải trình` (`send` / `file-pen-line`): `bg-sky-500/15 text-sky-300 border-sky-500/30 hover:bg-sky-500/25`
     - `Duyệt` / `HR Ghi nhận` (`check`): `bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25`
     - `Từ chối` / `Không hợp lệ` (`x`): `bg-rose-500/15 text-rose-300 border-rose-500/30 hover:bg-rose-500/25`
3. **Tách đôi cột Trạng thái bằng 2 Pill Badge gọn:**
   - **Badge Quản lý (`approval_status`):**
     - `PENDING`: Vàng (`amber`) — `Chờ duyệt`
     - `APPROVED`: Xanh lá (`emerald`) — `Đã duyệt`
     - `REJECTED`: Đỏ (`rose`) — `Từ chối`
     - `AUTO_SELF_DECLARED`: Xanh dương (`sky`) — `Tự khai báo`
     - `EXPIRED`: Xám/Đỏ (`slate/rose`) — `Quá hạn nộp`
   - **Badge HR (`hr_status`):**
     - `PENDING_HR`: Vàng nhạt (`amber`) — `Chờ HR`
     - `RECORDED`: Xanh ngọc (`teal`) — `Đã ghi nhận`
     - `INVALID_SUBMISSION`: Đỏ (`rose`) — `Không hợp lệ`

---

## 5. Đặc tả Chi tiết từng Khu vực Giao diện

### 5.1. Thanh Header theo ngữ cảnh (Contextual Header)

- **Bên trái:** Tiêu đề trang (`Giải trình đi muộn`) + **Segmented Pill Tab Bar** (chỉ render nếu `access.showTabBar === true`, hiển thị badge đếm số lượng nhỏ trên tab `Cần duyệt` và `HR Ghi nhận`).
- **Bên phải (chỉ hiện công cụ thuộc tab đang mở):**
  - Khi ở tab `Của tôi` / `Tự khai báo`: Hiển thị **Grace Quota Pill** (ví dụ: `Ân hạn 5p: còn 2/3 lần`).
  - Khi ở tab `Cần duyệt`: Nếu `access.canDelegate === true`, hiển thị nút icon/pill gọn **`Ủy quyền duyệt thay`** (`user-cog`).
  - Khi ở tab `HR Ghi nhận`: Hiển thị nhóm **Quick Filter Pills** (`Tất cả`, `Chờ ghi nhận`, `Quá 48h`, `Level 2`, `Level 3`) + nút icon **`Cấu hình quy chế`** (`sliders-horizontal`) nếu `access.canConfigPolicy === true`.

### 5.2. Tab 1: `Của tôi` / `Tự khai báo`

- **Cột bảng:** `Ngày làm việc` | `Giờ vào / Muộn (phút)` | `Phân loại lý do` | `Hạn nộp (24h)` | `Quản lý` _(ẩn nếu `isDirector`)_ | `HR` | `Thao tác`.
- Hiển thị đồng hồ/nhãn đếm ngược hạn nộp 24h (`submit_deadline_at`) cho các dòng `PENDING_SUBMIT`.
- **Thao tác trên dòng:**
  - Icon `Nộp giải trình` (nếu `canSubmitRow(row)`).
  - Icon `Xem chi tiết` (luôn có).

### 5.3. Tab 2: `Cần duyệt`

- **Cột bảng:** `Nhân sự` _(kèm badge nhỏ số lần muộn trong tháng + tag `[Ủy quyền]` nếu là đơn duyệt thay)_ | `Ngày / Muộn` | `Lý do & Minh chứng` | `Báo trước` | `SLA duyệt` | `Thao tác`.
- **Thao tác trên dòng:**
  - Icon `Duyệt` + Icon `Từ chối` (CHỈ render khi `canApproveRow(row) === true`).
  - Icon `Xem chi tiết`.
- **Modal Từ chối:** Bắt buộc nhập `approver_note` tối thiểu 5 ký tự mới bật nút xác nhận.
- **Modal Ủy quyền duyệt thay:** Cho phép chọn `delegate_id` (lọc bỏ chính mình), `start_at`, `end_at`, `reason`, và danh sách ủy quyền đang hiệu lực kèm nút icon `Thu hồi` (`ban`).

### 5.4. Tab 3: `HR Ghi nhận`

- **Cột bảng:** `Nhân sự / Phòng ban` | `Ngày / Muộn` | `Tầng 1 (Quản lý)` | `Tầng 2 (HR)` | `Cảnh báo / Ngưỡng` _(badge `Quá 48h`, `Level 2`, `Level 3 - Kỷ luật`)_ | `Thao tác`.
- **Thao tác trên dòng:**
  - Icon `Ghi nhận công` (`RECORDED`) + Icon `Không hợp lệ` (`INVALID_SUBMISSION`) — CHỈ render khi `canHrVerifyRow(row) === true`.
  - Icon `Xem chi tiết` (hiện đầy đủ timeline: giờ check-in, báo trước, nộp đơn, người duyệt, lịch sử leo thang `attendance_late_escalation_logs`).

---

## 6. Tiêu chí Nghiệm thu (Self-Verification Checklist)

Trước khi hoàn tất, hãy tự kiểm tra đủ 6 tiêu chí sau:

1. Đăng nhập với `EMPLOYEE`: Không thấy thanh Tab, không thấy nút Ủy quyền, không thấy bất kỳ phần tử DOM nào của `Cần duyệt` hay `HR Ghi nhận`.
2. Đăng nhập với `DIRECTOR`: Mở mặc định tab `Cần duyệt`, tab thứ 2 tên `Tự khai báo` và không hiện cột `Người duyệt`.
3. Đăng nhập với `MANAGER` / `HR_ADMIN`: Nếu bản thân có đơn đi muộn xuất hiện trong bảng, nút `Duyệt` / `Từ chối` / `HR Ghi nhận` trên chính dòng đó **không được render**.
4. Đăng nhập với `CB_PAYROLL`: Chỉ thấy `Của tôi` và `HR Ghi nhận` (không thấy nút `Cấu hình quy chế` `P30`).
5. Toàn bộ nút thao tác trong bảng đều là nút icon vuông có CSS tooltip rõ ràng, không tràn chữ làm vỡ layout trên màn hình `1280px` trở lên.
6. Không có bất kỳ file backend hoặc SQL nào bị chỉnh sửa.
