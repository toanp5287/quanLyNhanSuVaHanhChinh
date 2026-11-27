# ĐẶC TẢ KỸ THUẬT: MODULE GIẢI TRÌNH ĐI MUỘN (LATE EXPLANATION)

- **Hệ thống:** `hr_management` (Node.js / Express 5 / ES Modules / MySQL-TiDB / Vanilla JS + Tailwind CSS)
- **Phiên bản:** `v1.0`
- **Đường dẫn gợi ý:** `docs/specs/late-explanation-spec.md`

---

## 1. Tổng quan & Nguyên tắc Thiết kế

Module chuẩn hóa quy trình xử lý đi muộn trên **một kênh duy nhất**, áp dụng **một biểu mẫu chung** cho mọi cấp bậc nhân sự và tách bạch rõ trách nhiệm giữa cấp quản lý trực tiếp với phòng Hành chính - Nhân sự (HR).

### 5 Nguyên tắc cốt lõi

1. **Ít cấp duyệt — Định tuyến động:** Chỉ duyệt 1 cấp duy nhất bởi quản lý trực tiếp (`employees.manager_id`). Tổng Giám đốc tự khai báo để lưu hồ sơ, không cần duyệt.
2. **Tách biệt Duyệt nội dung & Ghi nhận công:** Cấp trên trực tiếp chịu trách nhiệm duyệt tính xác thực của lý do (`approval_status`). HR không phán xử nội dung, chỉ kiểm tra tính hợp lệ hồ sơ (đúng hạn, đủ minh chứng), ghi nhận công và thống kê (`hr_status`).
3. **Cấm tuyệt đối tự duyệt (Anti-Self-Approval):** Người duyệt không bao giờ được trùng người tạo đơn (`actor_id !== employee_id`), áp dụng cho cả người duyệt chính lẫn người được ủy quyền.
4. **Ân hạn thông minh (Grace Period):** Tự động miễn giải trình cho các lần đi trễ ngắn trong hạn mức tháng để giảm nhiễu vận hành.
5. **Siết bằng Ngưỡng leo thang & SLA:** Kiểm soát kỷ luật qua tần suất vi phạm tháng / liên tiếp (nâng ngưỡng đối với cấp quản lý) và tự động nhắc/leo thang khi quá hạn duyệt 24h/48h.

---

## 2. Cấu trúc Dữ liệu & Quy chế (Database & Policy JSON)

### 2.1. Các bảng sử dụng

| Bảng                              | Loại                          | Vai trò trong module                                                   |
| :-------------------------------- | :---------------------------- | :--------------------------------------------------------------------- |
| `attendance_policies`             | Có sẵn (mở rộng `rules_json`) | Lưu tham số ân hạn, hạn nộp, SLA 24h/48h và ngưỡng leo thang.          |
| `employees`                       | Có sẵn                        | Lấy `id`, `manager_id`, `position_id`, `department_id`.                |
| `positions`                       | Có sẵn                        | Lấy `level_rank`, `pos_code` để xác định cấp quản lý và Tổng Giám đốc. |
| `attendances`                     | Có sẵn                        | Bản ghi chấm công gốc (`id`, `employee_id`, `shift_id`, `work_date`).  |
| `work_shifts`                     | Có sẵn                        | Lấy `policy_id` và giờ bắt đầu ca chuẩn.                               |
| `notifications`                   | Có sẵn                        | Gửi thông báo realtime (SSE) / hệ thống cho nhắc duyệt & leo thang.    |
| `rewards_disciplines`             | Có sẵn                        | Đối chiếu / tạo đề xuất kỷ luật khi chạm `LEVEL_3_DISCIPLINARY`.       |
| `approval_delegations`            | Mới tạo                       | Cấu hình ủy quyền duyệt thay theo khoảng thời gian.                    |
| `attendance_grace_usages`         | Mới tạo                       | Theo dõi số lần đã dùng ân hạn đầu giờ trong từng tháng (`YYYY-MM`).   |
| `attendance_late_explanations`    | Mới tạo                       | Lưu toàn bộ vòng đời đơn giải trình đi muộn.                           |
| `attendance_late_escalation_logs` | Mới tạo                       | Lưu lịch sử nhắc nhở, leo thang vi phạm và quá hạn duyệt.              |

### 2.2. Cấu trúc tham số trong `attendance_policies.rules_json`

Khi tính toán, backend ưu tiên lấy `policy_id` từ `work_shifts.policy_id`; nếu `NULL`, fallback về bản ghi có `is_default = 1` (`DEFAULT_OFFICE`):

```json
{
  "grace_late_minutes": 5,
  "grace_late_monthly_quota": 3,
  "late_explain_deadline_hours": 24,
  "late_approval_reminder_hours": 24,
  "late_approval_escalate_hours": 48,
  "late_escalation": {
    "warning_min_count": 1,
    "escalation_min_count": 3,
    "disciplinary_min_count": 5,
    "consecutive_days_limit": 3,
    "manager_level_offset": 1
  }
}
```

---

## 3. Luồng Nghiệp vụ Chi tiết (Business Logic)

### 3.1. Cơ chế Ân hạn đầu giờ (Grace Period)

Kích hoạt ngay tại thời điểm ghi nhận check-in FaceID (trong service xử lý `attendances`) khi `late_minutes > 0`:

1. Đọc `grace_late_minutes` và `grace_late_monthly_quota` từ `attendance_policies.rules_json`.
2. Đếm số bản ghi trong `attendance_grace_usages` theo `(employee_id, cycle_month = YYYY-MM)`.
3. **Trường hợp ĐƯỢC áp ân hạn:**
   - Điều kiện: `late_minutes <= grace_late_minutes` **VÀ** `used_quota < grace_late_monthly_quota`.
   - Hành động:
     - `INSERT` 1 dòng vào `attendance_grace_usages` (`attendance_id`, `work_date`, `late_minutes`, `grace_applied_minutes = late_minutes`, `cycle_month`).
     - Không tạo bản ghi trong `attendance_late_explanations`.
     - Bản ghi chấm công `attendances` được xem là đúng giờ (không tính phạt muộn).
4. **Trường hợp KHÔNG được áp ân hạn** (`late_minutes > grace_late_minutes` hoặc đã hết quota tháng):
   - Tự động sinh 1 bản ghi trong `attendance_late_explanations` với:
     - `submission_status = 'PENDING_SUBMIT'`
     - `approval_status = 'PENDING'` (hoặc `'AUTO_SELF_DECLARED'` nếu là Tổng Giám đốc)
     - `hr_status = 'PENDING_HR'`
     - `submit_deadline_at = checkin_time + late_explain_deadline_hours` (mặc định `+24 giờ`).
   - Bắn thông báo vào `notifications` nhắc nhân sự nộp giải trình trước `submit_deadline_at`.

---

### 3.2. Định tuyến Người duyệt & Ủy quyền (Approval Routing & Delegation)

Hàm `resolveLateApprover(employeeId, now)` chạy khi sinh đơn hoặc khi nhân sự nộp giải trình:

| Đối tượng đi muộn                     | Điều kiện nhận diện trên DB                                                                           | `approver_id`          | `approval_status` khởi tạo | Vai trò HR                      |
| :------------------------------------ | :---------------------------------------------------------------------------------------------------- | :--------------------- | :------------------------- | :------------------------------ |
| **Tổng Giám đốc (CEO)**               | `employees.manager_id IS NULL` hoặc `positions.pos_code = 'CEO'` (hoặc `level_rank` cao nhất công ty) | `NULL`                 | `AUTO_SELF_DECLARED`       | Ghi nhận & lưu hồ sơ            |
| **Giám đốc / Trưởng phòng / Quản lý** | Có `manager_id` trỏ tới Tổng Giám đốc / Giám đốc khối                                                 | `employees.manager_id` | `PENDING`                  | Kiểm tra hợp lệ & ghi nhận công |
| **Nhân viên**                         | Có `manager_id` trỏ tới Trưởng phòng / Quản lý trực tiếp                                              | `employees.manager_id` | `PENDING`                  | Kiểm tra hợp lệ & ghi nhận công |

#### Cơ chế Ủy quyền duyệt thay (`approval_delegations`)

1. Khi xác định được `approver_id`, hệ thống truy vấn `approval_delegations`:
   - `delegator_id = approver_id`
   - `is_active = 1`
   - `scope IN ('LATE_EXPLANATION', 'ALL_APPROVALS')`
   - `start_at <= NOW() AND end_at >= NOW()`
2. Nếu tìm thấy bản ghi hợp lệ và `delegate_id !== employee_id`:
   - Gán `delegated_approver_id = delegate_id`.
   - Cả `approver_id` và `delegated_approver_id` đều có quyền thao tác duyệt trên đơn này (ai xử lý trước sẽ chốt đơn và ghi nhận vào `approved_by`).
3. **Phòng chống kẹt đơn (Orphan fallback):** Nếu nhân viên không phải CEO nhưng `manager_id IS NULL` do lỗi cấu hình hồ sơ, hệ thống báo cảnh báo tới nhóm HR Admin để bổ sung `manager_id` trước khi duyệt.

---

### 3.3. Phân loại Lý do & Tác động Bảng công

| `reason_category`     | Ví dụ thực tế                                                                          | Cách xử lý khi được duyệt                                       | Tác động bảng công / vi phạm                                                                   |
| :-------------------- | :------------------------------------------------------------------------------------- | :-------------------------------------------------------------- | :--------------------------------------------------------------------------------------------- |
| `LEGITIMATE`          | Ốm đau, tai nạn/sự cố giao thông lớn, việc gia đình khẩn, đi gặp khách hàng / công tác | Cấp trên bấm `APPROVED`, HR xác nhận `RECORDED`                 | **Không tính vi phạm**; không cộng vào ngưỡng leo thang kỷ luật; giữ nguyên công theo quy chế. |
| `PERSONAL_ROUTINE`    | Ngủ quên, kẹt xe thường ngày, việc cá nhân không khẩn                                  | Cấp trên bấm `APPROVED` hoặc `REJECTED`, HR xác nhận `RECORDED` | **Ghi nhận đi muộn**; cộng vào bộ đếm vi phạm tháng/liên tiếp và tính công theo thực tế.       |
| `UNSUBMITTED_OVERDUE` | Quá hạn 24h không nộp giải trình                                                       | Cronjob tự đánh dấu `OVERDUE` & `EXPIRED`                       | **Đi muộn không lý do**; cộng vào bộ đếm vi phạm và xử lý theo nội quy.                        |

> **Quy tắc báo trước (`pre_notified`):** Đánh dấu `pre_notified = 1` (kèm `pre_notified_at`) chỉ có giá trị tham khảo thái độ tuân thủ cho người duyệt, **không thay thế** việc nộp giải trình trên hệ thống.

---

### 3.4. Hai tầng Trạng thái Độc lập

1. **Tầng 1 — Duyệt nội dung (`approval_status`):**
   - `PENDING` -> `APPROVED` / `REJECTED` (bắt buộc nhập `approver_note` ngắn khi từ chối).
   - `AUTO_SELF_DECLARED` (dành riêng cho Tổng Giám đốc ngay khi nộp đơn).
   - `EXPIRED` (khi nhân sự không nộp giải trình quá hạn 24h).
2. **Tầng 2 — HR Kiểm tra hợp lệ & Ghi nhận (`hr_status`):**
   - HR chỉ được chuyển `hr_status` từ `PENDING_HR` sang `RECORDED` hoặc `INVALID_SUBMISSION` **sau khi** đơn đã qua Tầng 1 (`approval_status IN ('APPROVED', 'REJECTED', 'AUTO_SELF_DECLARED', 'EXPIRED')`).
   - Nếu HR đánh dấu `INVALID_SUBMISSION` (ví dụ: nộp thiếu minh chứng bắt buộc cho lý do `LEGITIMATE` hoặc sai quy cách), đơn bị tính như vi phạm đi muộn thường và thông báo ngược lại cho nhân sự + quản lý trực tiếp.
   - Khi HR bấm `RECORDED`: hệ thống cập nhật trạng thái đồng bộ vào `attendances` / `monthly_timesheets` theo `reason_category` và `approval_status`.

---

### 3.5. Cơ chế Ngưỡng Leo thang Vi phạm (Escalation Matrix)

Bộ đếm vi phạm chỉ tính các bản ghi đi muộn **bị tính lỗi** trong cùng tháng (`YYYY-MM`):

- Không tính các lần đã dùng ân hạn (`attendance_grace_usages`).
- Không tính các đơn có `reason_category = 'LEGITIMATE'` đã được `approval_status = 'APPROVED'` (hoặc `AUTO_SELF_DECLARED`) và `hr_status = 'RECORDED'`.
- Tính tất cả đơn `PERSONAL_ROUTINE`, `UNSUBMITTED_OVERDUE`, đơn bị `REJECTED`, hoặc bị HR đánh dấu `INVALID_SUBMISSION`.

#### Bảng ngưỡng áp dụng

| Mức độ (`escalation_level`) | Điều kiện cho Nhân viên                                | Điều kiện cho Quản lý (`isManager`)                            | Hành động hệ thống & Người nhận cảnh báo (`attendance_late_escalation_logs`)                                                                                                           |
| :-------------------------- | :----------------------------------------------------- | :------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LEVEL_1_REMINDER`          | 1 – 2 lần / tháng                                      | 1 lần / tháng _(siết sớm hơn theo `manager_level_offset = 1`)_ | Nhắc nhở trực tiếp qua `notifications` cho nhân sự và `approver_id`.                                                                                                                   |
| `LEVEL_2_ESCALATED`         | 3 – 4 lần / tháng                                      | 2 – 3 lần / tháng                                              | HR nhận cảnh báo + tự động báo lên `approver_id` **và cấp trên cao hơn 1 bậc** (`manager.manager_id`). Ghi log `trigger_type = 'MONTHLY_COUNT'`.                                       |
| `LEVEL_3_DISCIPLINARY`      | >= 5 lần / tháng **HOẶC** >= 3 ngày làm việc liên tiếp | >= 4 lần / tháng **HOẶC** >= 3 ngày làm việc liên tiếp         | Đánh dấu lập biên bản / đề xuất xét kỷ luật (liên kết tham khảo sang `rewards_disciplines`). Báo HR Manager + cấp trên cao hơn 1 bậc. Ghi log `MONTHLY_COUNT` hoặc `CONSECUTIVE_DAYS`. |

> **Xác định `isManager` từ DB:** Truy vấn `positions.level_rank` của nhân sự (hoặc kiểm tra `EXISTS (SELECT 1 FROM employees sub WHERE sub.manager_id = e.id)`). Nếu nhân sự là quản lý/trưởng phòng, ngưỡng leo thang giảm đi `manager_level_offset` (`1`) và người nhận cảnh báo ở `LEVEL_2`/`LEVEL_3` luôn đẩy lên cấp cao hơn một bậc (`approver.manager_id`).

> **Tính `consecutive_late_days_at_submit`:** Đếm số ngày làm việc liên tiếp tính ngược từ `work_date` (bỏ qua ngày nghỉ cuối tuần theo `work_shifts.working_days` và ngày lễ trong bảng `holidays`) có phát sinh đi muộn bị tính lỗi.

---

## 4. Hệ thống Cronjob & SLA Tự động (24h / 48h)

Chạy định kỳ mỗi **15 phút** (bằng `node-cron` hoặc worker nền trong backend):

### Job 1: Quét quá hạn nộp giải trình (`submit_deadline_at`)

- **Truy vấn:** `submission_status = 'PENDING_SUBMIT' AND submit_deadline_at < NOW()`
- **Xử lý (trong Transaction):**
  1. Cập nhật `submission_status = 'OVERDUE'`, `is_on_time = 0`, `reason_category = 'UNSUBMITTED_OVERDUE'`, `approval_status = 'EXPIRED'`.
  2. Tính lại `monthly_late_count_at_submit`, `consecutive_late_days_at_submit` và đánh giá `escalation_level`.
  3. Ghi `attendance_late_escalation_logs` nếu chạm ngưỡng; bắn thông báo cho nhân sự, `approver_id` và HR để ghi nhận đi muộn không lý do.

### Job 2: Nhắc nhở duyệt quá 24 giờ (1 ngày làm việc)

- **Truy vấn:** `submission_status = 'SUBMITTED' AND approval_status = 'PENDING' AND reminded_24h_at IS NULL AND submitted_at <= NOW() - INTERVAL 24 HOUR`
- **Xử lý:**
  1. Cập nhật `reminded_24h_at = NOW()`.
  2. Ghi log vào `attendance_late_escalation_logs` với `trigger_type = 'APPROVAL_OVERDUE_24H'`, `escalation_level = 'LEVEL_1_REMINDER'`, `notified_to_id = COALESCE(delegated_approver_id, approver_id)`.
  3. Gửi thông báo nhắc duyệt tới `approver_id` (và `delegated_approver_id` nếu có).

### Job 3: Leo thang quá hạn duyệt 48 giờ (quá 2 ngày)

- **Truy vấn:** `submission_status = 'SUBMITTED' AND approval_status = 'PENDING' AND escalated_48h_at IS NULL AND submitted_at <= NOW() - INTERVAL 48 HOUR`
- **Xử lý:**
  1. Cập nhật `escalated_48h_at = NOW()`.
  2. Tìm cấp trên của người duyệt (`approver.manager_id`) và danh sách HR Manager/Admin.
  3. Ghi log vào `attendance_late_escalation_logs` với `trigger_type = 'APPROVAL_OVERDUE_48H'`, `escalation_level = 'LEVEL_2_ESCALATED'`.
  4. Gửi cảnh báo tới **HR** và **cấp trên của người duyệt** để xử lý tránh ngâm đơn chốt công cuối tháng.

---

## 5. Đặc tả RESTful API

Prefix chuẩn: `/api/attendance-late-explanations` và `/api/approval-delegations`. Toàn bộ request body validate bằng **Zod**.

### 5.1. Danh sách Endpoint tổng hợp

| Method  | Endpoint                                             | Quyền truy cập                             | Chức năng                                                                                        |
| :------ | :--------------------------------------------------- | :----------------------------------------- | :----------------------------------------------------------------------------------------------- |
| `GET`   | `/api/attendance-late-explanations/my`               | Authenticated                              | Xem danh sách đi muộn & giải trình của bản thân + quota ân hạn tháng hiện tại.                   |
| `POST`  | `/api/attendance-late-explanations/:id/submit`       | Chủ đơn (`employee_id`)                    | Nộp nội dung giải trình, phân loại lý do, minh chứng, cờ báo trước.                              |
| `GET`   | `/api/attendance-late-explanations/pending-approval` | Manager / Delegate                         | Danh sách đơn chờ mình duyệt (gồm cả đơn được ủy quyền).                                         |
| `PATCH` | `/api/attendance-late-explanations/:id/approve`      | `approver_id` hoặc `delegated_approver_id` | Cấp trên Chấp nhận (`APPROVED`) hoặc Từ chối (`REJECTED`) nội dung.                              |
| `GET`   | `/api/attendance-late-explanations/hr-queue`         | HR / Admin                                 | Danh sách đơn chờ HR kiểm tra hợp lệ & ghi nhận công, lọc theo phòng ban/tháng/ngưỡng leo thang. |
| `PATCH` | `/api/attendance-late-explanations/:id/hr-verify`    | HR / Admin                                 | HR xác nhận `RECORDED` hoặc `INVALID_SUBMISSION` và đồng bộ bảng công.                           |
| `GET`   | `/api/attendance-late-explanations/stats/monthly`    | Manager / HR / Admin                       | Thống kê số lần đi muộn, ngày liên tiếp, nhân sự chạm ngưỡng leo thang theo tháng.               |
| `POST`  | `/api/approval-delegations`                          | Manager / Admin                            | Tạo ủy quyền duyệt thay trong khoảng thời gian.                                                  |
| `GET`   | `/api/approval-delegations/my`                       | Authenticated                              | Xem danh sách ủy quyền mình đã tạo hoặc được nhận.                                               |
| `PATCH` | `/api/approval-delegations/:id/revoke`               | `delegator_id` / Admin                     | Hủy hiệu lực ủy quyền sớm (`is_active = 0`).                                                     |

---

### 5.2. Chi tiết Payload các Endpoint trọng yếu

#### A. Nộp giải trình — `POST /api/attendance-late-explanations/:id/submit`

- **Zod Validation:**
  - `reason_category`: `z.enum(['LEGITIMATE', 'PERSONAL_ROUTINE'])`
  - `reason_detail`: `z.string().trim().min(10).max(1000)`
  - `evidence_url`: `z.string().url().optional().nullable()`
  - `pre_notified`: `z.boolean().default(false)`
  - `pre_notified_at`: `z.string().datetime().optional().nullable()`
- **Logic kiểm tra:**
  - Chỉ cho phép khi `employee_id === req.user.employee_id` và `submission_status === 'PENDING_SUBMIT'`.
  - Nếu `NOW() > submit_deadline_at`: trả về `400 Bad Request` (`EXPLANATION_DEADLINE_PASSED`) và chuyển `OVERDUE`.
  - Tự động tính `monthly_late_count_at_submit`, `consecutive_late_days_at_submit`, gọi `resolveLateApprover()`.
  - Nếu là Tổng Giám đốc: đặt `approval_status = 'AUTO_SELF_DECLARED'`, `approved_at = NOW()`, chuyển thẳng sang hàng đợi HR (`hr_status = 'PENDING_HR'`).

#### B. Cấp trên duyệt nội dung — `PATCH /api/attendance-late-explanations/:id/approve`

```json
{
  "decision": "APPROVED",
  "approver_note": "Đã xác nhận có lịch gặp khách hàng buổi sáng."
}
```

- **Guardrails bắt buộc:**
  1. **Chống tự duyệt:** Nếu `req.user.employee_id === record.employee_id` -> trả về `403 Forbidden` (`SELF_APPROVAL_FORBIDDEN`).
  2. **Đúng thẩm quyền:** `req.user.employee_id` phải khớp `record.approver_id` hoặc `record.delegated_approver_id` (hoặc đang có bản ghi `approval_delegations` còn hiệu lực tại thời điểm bấm duyệt).
  3. **Trạng thái hợp lệ:** Chỉ cho phép khi `submission_status === 'SUBMITTED'` và `approval_status === 'PENDING'`.
  4. Nếu `decision === 'REJECTED'`, bắt buộc `approver_note` dài tối thiểu 5 ký tự.

#### C. HR kiểm tra hợp lệ & ghi nhận công — `PATCH /api/attendance-late-explanations/:id/hr-verify`

```json
{
  "hr_status": "RECORDED",
  "hr_note": "Đủ minh chứng, đã cập nhật công tháng 11."
}
```

- **Guardrails bắt buộc:**
  1. Chỉ role HR / Admin được gọi.
  2. Chặn tự xác nhận cho chính đơn của nhân sự HR (`req.user.employee_id === record.employee_id` -> `403 Forbidden`).
  3. Yêu cầu `record.approval_status !== 'PENDING'`.
  4. Chạy trong DB Transaction: cập nhật `hr_status`, `hr_verified_by`, `hr_verified_at`, tính lại trạng thái vi phạm & ngưỡng leo thang (`attendance_late_escalation_logs`), đồng bộ số phút muộn / công trên bảng `attendances`.

#### D. Tạo ủy quyền duyệt thay — `POST /api/approval-delegations`

```json
{
  "delegate_id": 15,
  "scope": "LATE_EXPLANATION",
  "start_at": "2026-11-27T00:00:00+07:00",
  "end_at": "2026-11-30T23:59:59+07:00",
  "reason": "Đi công tác tại TP.HCM"
}
```

- **Validation:** `delegate_id !== delegator_id`, `end_at > start_at`, không chồng lấn thời gian với ủy quyền đang `is_active = 1` cùng `scope`.

---

## 6. Bảo mật, Chống gian lận & Biên giới Triển khai (Guardrails)

1. **Idempotency & Chống trùng đơn:** Khóa cứng `UNIQUE KEY uq_exp_attendance (attendance_id)` trên `attendance_late_explanations` và `UNIQUE KEY uq_grace_attendance (attendance_id)` trên `attendance_grace_usages` để tránh double-submit hoặc race condition khi quét FaceID.
2. **Transaction Safety:** Mọi thao tác chuyển trạng thái có ảnh hưởng sang `attendances` hoặc `attendance_late_escalation_logs` bắt buộc bọc trong `BEGIN ... COMMIT` (rollback nếu lỗi).
3. **Audit Trail đầy đủ:** Không xóa cứng (`DELETE`) đơn giải trình. Lưu vết toàn bộ `approved_by`, `hr_verified_by`, `reminded_24h_at`, `escalated_48h_at` và bảng `attendance_late_escalation_logs`.
4. **Kiến trúc Modular (Strict Boundary):**
   - Tách riêng thành các file độc lập:
     - `src/validators/lateExplanation.validator.js` (Zod schemas)
     - `src/services/lateExplanation.service.js` (Logic ân hạn, routing, escalation)
     - `src/services/delegation.service.js`
     - `src/controllers/lateExplanation.controller.js`
     - `src/routes/lateExplanation.routes.js`
     - `src/jobs/lateExplanationSla.job.js` (Cronjob 24h/48h)
   - **Không chỉnh sửa** logic nhận diện FaceID hay cấu trúc tính công hiện có ngoài điểm hook gọi `handleLateCheckinHook(attendanceRecord, policy)` sau khi ghi nhận check-in thành công.

---

## 7. Yêu cầu Giao diện (Frontend Views)

1. **Tab "Giải trình của tôi" (Nhân viên & Quản lý):**
   - Badge hiển thị hạn mức ân hạn còn lại trong tháng (ví dụ: _Ân hạn 5 phút: còn 2/3 lần_).
   - Danh sách các buổi đi muộn kèm đồng hồ đếm ngược hạn nộp 24h (`submit_deadline_at`).
   - Form nộp chung cho mọi cấp bậc: chọn phân loại lý do (`Chính đáng` / `Cá nhân`), ô nhập lý do, upload ảnh minh chứng, checkbox `Đã báo trước cho quản lý`.
2. **Tab "Cần duyệt" (Quản lý trực tiếp / Người được ủy quyền):**
   - Hiển thị rõ tag `[Được ủy quyền]` nếu là đơn duyệt thay.
   - Ẩn hoàn toàn nút Duyệt/Từ chối nếu `employee_id === currentUser.employee_id`.
   - Hiển thị lịch sử nhanh số lần đi muộn trong tháng của người nộp ngay trên thẻ duyệt.
   - Nút quản lý **Ủy quyền duyệt thay** (chọn người thay thế, từ ngày – đến ngày).
3. **Tab "HR Ghi nhận & Leo thang" (Phòng Hành chính - Nhân sự):**
   - Bộ lọc nhanh theo: `Chờ HR ghi nhận`, `Quá hạn duyệt > 48h`, `Chạm ngưỡng Level 2 (3-4 lần)`, `Chạm ngưỡng Kỷ luật Level 3 (>= 5 lần / 3 ngày liên tiếp)`.
   - Nút thao tác nhanh: `Ghi nhận công (RECORDED)` / `Hồ sơ không hợp lệ (INVALID_SUBMISSION)` kèm ghi chú.
