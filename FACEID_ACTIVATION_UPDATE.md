# Đặc tả Chi tiết: Những phần Đã sửa & Kế hoạch Chỉnh sửa Hệ thống FaceID

- **Ngày lập tài liệu:** 21/11/2026
- **Trạng thái tổng thể:** Đã hoàn tất nâng cấp Database (`employees`) — Đang chờ cập nhật Backend & Frontend.
- **Engine nhận diện thực tế trong hệ thống:**
  - Thư viện: `@vladmandic/human`
  - Model lưu trong DB: `human-faceres1024-subjectlock-v2`
  - Định dạng vector: **1024 chiều** (`embedding`), lưu dạng JSON object gồm 3 key: `{"model", "centroid", "samples"}` với **5 mẫu/nhân viên** (dung lượng thực tế ~33.323 ký tự/bản ghi).
- **Dữ liệu hiện trạng lúc kiểm tra DB:** Bảng `employees` có 12 nhân viên, trong đó 1 nhân viên (`id = 2`) đã đăng ký FaceID.

---

## 1. Phân tích nguyên nhân gốc (Root Cause Analysis)

| STT | Vấn đề thực tế                                                   | Nguyên nhân kỹ thuật                                                                                                                                                                                                                                                                      | Mức độ ảnh hưởng                                                            |
| :-- | :--------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------- |
| 1   | **Cười hoặc đổi sắc mặt là lách được check trùng khi kích hoạt** | (a) Màn hình kích hoạt không chặn biểu cảm cười/nhăn mặt nên cho chụp mẫu bị biến dạng cơ mặt.<br>(b) Hàm check trùng dùng chung ngưỡng chặt với luồng điểm danh (hoặc dùng điều kiện khoảng cách Top-1 vs Top-2), khiến cùng 1 người khi cười bị lệch điểm nhẹ và vượt qua bộ lọc trùng. | **Nghiêm trọng** (1 người có thể kích hoạt nhiều tài khoản để chấm công hộ) |
| 2   | **Nguy cơ cắt cụt JSON gây crash hệ thống**                      | Cột `face_descriptor` ban đầu có kiểu `TEXT` (trần tối đa ~65 KB), trong khi 1 nhân viên (5 mẫu + 1 centroid) đã chiếm **33,3 KB**. Chỉ cần tăng số mẫu hoặc độ chính xác số thập phân là MySQL tự cắt chuỗi gây lỗi `JSON.parse`.                                                        | **Cao** (Hỏng dữ liệu sinh trắc học)                                        |
| 3   | **Thiếu cơ chế khóa 1-1 & truy vết Reset**                       | Bảng `employees` trước đó chỉ có duy nhất cột `face_descriptor`, không có trạng thái khóa `ACTIVE`, không chặn Race Condition khi gửi 2 request song song, và không lưu lịch sử ai đã reset khuôn mặt nhân viên.                                                                          | **Cao** (Lỗ hổng bảo mật & kiểm toán HR)                                    |
| 4   | **Tốc độ quét & kẹt Liveness ở luồng camera**                    | Quét liên tục tần suất cao gây nặng trình duyệt; khung hình mờ/ngược sáng/lệch góc vẫn bị đưa vào trích xuất vector; ngưỡng chớp mắt cố định dễ gây kẹt với người đeo kính hoặc mắt nhỏ.                                                                                                  | **Trung bình – Cao** (Trải nghiệm kém, hay báo lỗi sai)                     |

---

## 2. Chi tiết các phần ĐÃ SỬA XONG (Layer: Database — MySQL / MariaDB)

### 2.1. Bảng đối chiếu thay đổi cấu trúc bảng `employees`

| Tên cột             | Trước khi sửa | Sau khi sửa                                                      | Ghi chú kỹ thuật                                                                                                                          |
| :------------------ | :------------ | :--------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------- |
| `face_descriptor`   | `TEXT NULL`   | `LONGTEXT NULL`                                                  | Nâng trần lưu trữ lên 4 GB; giữ nguyên kiểu chuỗi (không đổi sang `JSON` native) để không phá vỡ các đoạn `JSON.parse()` sẵn có ở Node.js |
| `face_status`       | _(Chưa có)_   | `ENUM('UNREGISTERED', 'ACTIVE') NOT NULL DEFAULT 'UNREGISTERED'` | Cờ khóa trạng thái kích hoạt 1-1 theo từng tài khoản                                                                                      |
| `face_enrolled_at`  | _(Chưa có)_   | `DATETIME NULL`                                                  | Thời điểm kích hoạt thành công                                                                                                            |
| `face_reset_by`     | _(Chưa có)_   | `INT NULL`                                                       | Lưu ID tài khoản Admin/HR thực hiện lệnh Reset                                                                                            |
| `face_reset_at`     | _(Chưa có)_   | `DATETIME NULL`                                                  | Thời điểm thực hiện Reset                                                                                                                 |
| `face_reset_reason` | _(Chưa có)_   | `VARCHAR(255) NULL`                                              | Lý do bắt buộc khi mở khóa cho nhân viên đăng ký lại                                                                                      |

### 2.2. Câu lệnh SQL đã thực thi thành công

_(Đã bỏ mệnh đề `AFTER` để tránh lỗi `Unknown column` trên MariaDB/MySQL khi thêm nhiều cột trong cùng một lệnh `ALTER TABLE`)_

```sql
-- 1. Nâng cấp kiểu dữ liệu và thêm 5 cột quản lý trạng thái + truy vết Reset
ALTER TABLE `employees`
  MODIFY COLUMN `face_descriptor` LONGTEXT NULL,
  ADD COLUMN `face_status` ENUM('UNREGISTERED', 'ACTIVE') NOT NULL DEFAULT 'UNREGISTERED',
  ADD COLUMN `face_enrolled_at` DATETIME NULL,
  ADD COLUMN `face_reset_by` INT NULL,
  ADD COLUMN `face_reset_at` DATETIME NULL,
  ADD COLUMN `face_reset_reason` VARCHAR(255) NULL;

-- 2. Đồng bộ nhân viên đã có FaceID sẵn (id = 2) sang trạng thái ACTIVE
UPDATE `employees`
SET
  `face_status` = 'ACTIVE',
  `face_enrolled_at` = COALESCE(`face_enrolled_at`, NOW())
WHERE `id` > 0
  AND `face_descriptor` IS NOT NULL
  AND TRIM(`face_descriptor`) != '';
```

### 2.3. Quy chuẩn dữ liệu lưu trong cột `face_descriptor`

Giữ nguyên cấu trúc JSON hiện hành của `human-faceres1024-subjectlock-v2` (không tạo thêm cột vector dư thừa):

```json
{
  "model": "human-faceres1024-subjectlock-v2",
  "centroid": [
    /* 1024 số thực */
  ],
  "samples": [
    [
      /* Mẫu 1: 1024 số thực */
    ],
    [
      /* Mẫu 2: 1024 số thực */
    ],
    [
      /* Mẫu 3: 1024 số thực */
    ],
    [
      /* Mẫu 4: 1024 số thực */
    ],
    [
      /* Mẫu 5: 1024 số thực */
    ]
  ]
}
```

### 2.4. Script Rollback dự phòng (nếu cần hoàn tác cấu trúc cột mới)

```sql
ALTER TABLE `employees`
  DROP COLUMN `face_reset_reason`,
  DROP COLUMN `face_reset_at`,
  DROP COLUMN `face_reset_by`,
  DROP COLUMN `face_enrolled_at`,
  DROP COLUMN `face_status`;
```

_(Tuyệt đối không hạ cột `face_descriptor` về lại `TEXT` để tránh mất dữ liệu)._

---

## 3. Chi tiết các phần CẦN CHỈNH SỬA — Phase 1: Luồng Kích hoạt & Reset FaceID

> **Thứ tự ưu tiên:** Hoàn thiện và test dứt điểm toàn bộ Phase 1 trước khi tối ưu sang luồng chấm công hằng ngày (Phase 2).

### 3.1. Phần Backend (Node.js / Express)

#### A. Khóa kích hoạt 1-1 & Chống Race Condition

- [ ] **Kiểm tra trạng thái đầu vào:** Tại API kích hoạt FaceID, truy vấn `face_status` của nhân viên hiện tại trước khi chạy so khớp. Nếu `face_status === 'ACTIVE'`, trả ngay HTTP `403 Forbidden` hoặc `409 Conflict` kèm thông báo: `"Tài khoản đã kích hoạt FaceID. Liên hệ Admin/HR để Reset nếu cần đăng ký lại"`.
- [ ] **Khóa nguyên tử ở câu lệnh SQL (Atomic Update):** Khi ghi dữ liệu xuống DB, câu lệnh `UPDATE` bắt buộc có điều kiện bảo vệ ở mệnh đề `WHERE`:
  ```sql
  UPDATE employees
  SET
    face_descriptor = ?,
    face_status = 'ACTIVE',
    face_enrolled_at = NOW()
  WHERE id = ? AND face_status = 'UNREGISTERED'
  ```
- [ ] **Kiểm tra `affectedRows`:** Nếu `result.affectedRows !== 1`, trả lỗi từ chối (chặn trường hợp nhân viên bấm kích hoạt song song trên 2 thiết bị cùng lúc).

#### B. Kiểm tra tính hợp lệ dữ liệu phía Server (Server-side Validation)

- [ ] **Kiểm tra định dạng `samples`:** Payload gửi lên phải chứa mảng `samples` từ **3 đến 5 phần tử** (khuyến nghị chốt cứng **5 mẫu** đồng bộ với bản ghi `id = 2` hiện có).
- [ ] **Kiểm tra kích thước & giá trị vector:** Mỗi mẫu bắt buộc có đúng **1024 phần tử**, mọi phần tử phải thỏa `typeof v === 'number' && Number.isFinite(v)` (loại bỏ `NaN`, `null`, `Infinity`, chuỗi rỗng).
- [ ] **Tự tính lại `centroid` ở Backend:** Không tin tưởng hoàn toàn `centroid` client gửi lên; Backend tự tính vector trung bình cộng từ `samples` hợp lệ (và chuẩn hóa L2 nếu công thức so khớp hiện tại yêu cầu) rồi mới đóng gói JSON `{"model": "human-faceres1024-subjectlock-v2", "centroid": ..., "samples": ...}`.
- [ ] **Chạy lại Intra-check phía Server:** Tính độ khớp giữa từng cặp mẫu trong `samples` gửi lên. Nếu có bất kỳ mẫu nào lệch mạnh so với phần còn lại (chứng tỏ trong lúc chụp có người khác bước vào khung hoặc người dùng quay mặt/biến dạng cơ mặt đột ngột), từ chối ngay với HTTP `400 Bad Request` (`"Dữ liệu khuôn mặt không đồng nhất, vui lòng kích hoạt lại"`).

#### C. Sửa triệt để logic Check Trùng Khuôn Mặt (Chống lách khi cười)

- [ ] **Xác minh công thức đo hiện tại trước khi đặt số:** Đọc lại hàm so khớp hiện có cho `human-faceres1024-subjectlock-v2` xem hệ thống đang dùng:
  - **Chiều Cosine Similarity (`0 -> 1`, càng cao càng giống)** — mặc định của `human.match.similarity`, HAY
  - **Chiều Euclidean Distance (`0 -> 1+`, càng thấp càng giống)**.
- [ ] **Tách riêng 2 hằng số cấu hình độc lập ở đầu file service/config:**
  - `ATTENDANCE_MATCH_THRESHOLD`: Ngưỡng chặt chỉ dành cho **Điểm danh**.
  - `DUPLICATE_FACE_THRESHOLD`: Ngưỡng nhạy hơn chỉ dành cho **Chặn trùng khi kích hoạt**:
    - Nếu dùng **Cosine Similarity (cao = giống):** `DUPLICATE_FACE_THRESHOLD` phải **THẤP HƠN** ngưỡng điểm danh (để bắt cả trường hợp cùng 1 người cố tình cười làm điểm tương đồng tụt nhẹ).
    - Nếu dùng **Euclidean Distance (thấp = giống):** `DUPLICATE_FACE_THRESHOLD` phải **CAO HƠN** ngưỡng điểm danh.
- [ ] **Quét chéo toàn bộ mẫu (All-pairs Cross Check):**
  - Truy vấn toàn bộ nhân viên KHÁC đang có khuôn mặt hoạt động:
    `SELECT id, employee_code, full_name, face_descriptor FROM employees WHERE id != ? AND face_status = 'ACTIVE' AND face_descriptor IS NOT NULL`
  - Viết hàm helper `extractVectors(rawDescriptor)` tương thích an toàn: đọc được đầy đủ cả `centroid` + toàn bộ mảng `samples` (và không crash nếu gặp bản ghi JSON lỗi).
  - Tập vector đầu vào cần đối chiếu (`incomingVectors`) = `[...incomingSamples, calculatedCentroid]`.
  - Tập vector từng nhân viên khác (`existingVectors`) = `[...empSamples, empCentroid]`.
  - So sánh **mọi cặp** `(vIn, vExist)` giữa `incomingVectors` và `existingVectors` để tìm ra điểm khớp mạnh nhất (`bestMatchScore`).
- [ ] **Quy tắc chặn tuyệt đối:**
  - Chỉ cần **1 cặp bất kỳ vượt ngưỡng `DUPLICATE_FACE_THRESHOLD`** → trả ngay HTTP `409 Conflict` (`"Khuôn mặt này đã được đăng ký cho tài khoản khác"`).
  - **Bỏ hoàn toàn** điều kiện so sánh khoảng cách giữa Top-1 và Top-2 (margin gap) và **không dùng** multi-frame voting trong hàm check trùng.
- [ ] **Ghi log đối soát phía Server:** Mỗi lần chạy API kích hoạt, in log ra server console gồm:
      `{ currentUserId, bestMatchScore, matchedEmployeeId, thresholdUsed, isDuplicate, intraCheckScore }` để kiểm chứng thực tế cả 2 ca (không cười vs cố tình cười).

#### D. API Reset FaceID cho Admin / HR

- [ ] **Endpoint & Phân quyền (RBAC):** Tạo/cập nhật API Reset FaceID (ví dụ `POST /api/employees/:id/reset-face`), kiểm tra chặt middleware phân quyền — **chỉ cho phép Admin / HR** gọi; nhân viên thường gọi trả `403 Forbidden`.
- [ ] **Bắt buộc lý do Reset:** Validate `reason` không được rỗng (tối thiểu 5 ký tự, tối đa 255 ký tự).
- [ ] **Cập nhật DB & lưu dấu vết:**
  ```sql
  UPDATE employees
  SET
    face_descriptor = NULL,
    face_status = 'UNREGISTERED',
    face_enrolled_at = NULL,
    face_reset_by = ?,
    face_reset_at = NOW(),
    face_reset_reason = ?
  WHERE id = ?
  ```
- [ ] **Bổ sung thông tin trạng thái vào API lấy hồ sơ / danh sách nhân viên:** Trả thêm `face_status`, `face_enrolled_at`, `face_reset_at`, `face_reset_reason` (KHÔNG trả nguyên chuỗi `face_descriptor` 33 KB ra danh sách nhân viên để tránh nặng payload mạng).

---

### 3.2. Phần Frontend (Màn hình Kích hoạt FaceID & Giao diện Reset)

#### A. Tối ưu Camera & Pipeline của `@vladmandic/human`

- [ ] **Cấu hình webcam chuẩn:** Mở `getUserMedia` với `video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }` (giảm tải CPU/GPU so với 1080p nhưng vẫn đủ sắc nét cho `faceres`).
- [ ] **Preload & Warm-up:** Tải sẵn weights ngay khi mở trang kích hoạt, ưu tiên backend `webgl` (fallback `wasm`), chạy `human.warmup()` 1 lần trước khi cho người dùng quét để loại bỏ độ trễ 3–5 giây ở frame đầu tiên.
- [ ] **Giới hạn tần suất quét (Throttle):** Không chạy AI theo `requestAnimationFrame` (60 FPS). Dùng vòng lặp bất đồng bộ có biến khóa `isProcessing` nghỉ **120–150ms** mỗi chu kỳ (~6–8 FPS).
- [ ] **Tách nhẹ luồng kiểm tra:** Kiểm tra Quality Gate và Neutral Gate trước; chỉ giữ và lưu `face.embedding` (1024 số) vào mảng `capturedSamples` khi frame vượt qua 100% điều kiện.

#### B. Bộ lọc chất lượng khung hình — Quality Gate (chỉ hiển thị thông báo đã debounce 300ms)

1. **Vùng trung tâm & Tỉ lệ mặt:**
   - Hiển thị khung oval căn giữa trên viewport camera.
   - Tâm bounding box khuôn mặt phải nằm trong khung oval; chiều cao khuôn mặt chiếm **25% đến 55%** chiều cao khung hình.
   - Thông báo hướng dẫn ngắn: `"Đưa mặt vào giữa khung"` / `"Lại gần hơn một chút"` / `"Lùi ra một chút"`.
2. **Góc nhìn thẳng (Head Pose):**
   - Đọc trực tiếp từ `face.rotation.angle` (`yaw`, `pitch`, `roll`) do `@vladmandic/human` cung cấp.
   - Nếu `|yaw|`, `|pitch|` hoặc `|roll|` vượt quá **~15–18 độ** (tương đương ~0.26–0.31 radian) → dừng thu mẫu, báo `"Nhìn thẳng vào camera"`.
3. **Độ sáng (Luminance):**
   - Cắt vùng mặt ra canvas ẩn, tính độ sáng trung bình `0.299*R + 0.587*G + 0.114*B`.
   - Từ chối nếu `< 65` (`"Thiếu sáng, hãy hướng mặt về nguồn sáng"`) hoặc `> 215` (`"Ánh sáng quá chói hoặc ngược sáng"`).
4. **Độ sắc nét (Anti-blur):**
   - Tính nhanh phương sai Laplacian trên ảnh xám vùng crop mặt. Nếu dưới ngưỡng sắc nét (do đang di chuyển) → báo `"Giữ yên khuôn mặt"`.

#### C. Khóa biểu cảm tự nhiên — Neutral Face Gate _(CHỈ áp dụng ở màn Kích hoạt)_

- [ ] **Lớp 1 — Dùng module `emotion` của `@vladmandic/human`** (nếu bật sẵn trong cấu hình Human):
  - Kiểm tra mảng `face.emotion`. Nếu xuất hiện `happy`, `surprised`, `angry`, `disgust` với điểm `score` vượt ngưỡng (ví dụ `> 0.25–0.30`) hoặc biểu cảm chủ đạo không phải `neutral` → chặn ngay frame đó.
- [ ] **Lớp 2 — Kiểm tra hình học miệng từ `face.mesh` (chống cười mím / há miệng ngay cả khi tắt `emotion`):**
  - Tính **Độ mở miệng (MAR):** khoảng cách dọc môi trong chia chiều ngang 2 khóe miệng. Chặn nếu `> 0.14` (cười hở răng / há miệng).
  - Tính **Tỉ lệ kéo rộng khóe miệng:** chiều ngang miệng chia chiều ngang hàm. Chặn nếu `> 0.44` (cười mím kéo khóe môi).
- [ ] **Phản hồi UI:** Khi rớt Neutral Gate, **không cộng dồn mẫu**, giữ nguyên bộ đếm hoặc reset nếu cố tình đổi sắc mặt liên tục, hiện thông báo: `"Giữ khuôn mặt tự nhiên, không cười khi kích hoạt"`.

#### D. Liveness chống ảnh tĩnh & không gây kẹt người đeo kính

- [ ] **Ngưỡng chớp mắt EAR động (Dynamic EAR):**
  - Đo `baselineEAR` bằng trung bình cộng 3–5 frame mở mắt bình thường ban đầu của chính nhân viên đó.
  - Xác nhận 1 lần chớp mắt hợp lệ khi EAR tụt xuống dưới **`0.75 * baselineEAR`** rồi mở lại trên **`0.90 * baselineEAR`** trong khoảng thời gian **100ms – 800ms**.
- [ ] **Kết hợp điểm chống giả mạo của Human (nếu đã bật model `antispoof` / `liveness`):** Kiểm tra `face.real` / `face.live` vượt ngưỡng tối thiểu trước khi cho hoàn tất kích hoạt.

#### E. Thu thập 5 mẫu sạch & Kiểm tra đồng nhất nội bộ (Client Intra-check)

- [ ] Tự động lấy liên tiếp **5 mẫu `embedding` (1024 chiều)** cách nhau **300–400ms** sau khi đã qua Quality Gate + Neutral Gate + Liveness.
- [ ] Sau khi đủ 5 mẫu, chạy kiểm tra đồng nhất giữa các mẫu với nhau ngay tại trình duyệt: nếu có mẫu lệch mạnh khỏi các mẫu còn lại → xóa mảng tạm, báo `"Giữ yên khuôn mặt và thử lại"` và tự chụp lại.
- [ ] Chỉ khóa nút / gọi API kích hoạt đúng 1 lần khi đủ 5 mẫu sạch (tránh double-submit).

#### F. Cờ Debug hiệu chỉnh thực tế (`DEBUG_FACE_SCAN`)

- [ ] Đặt cờ `const DEBUG_FACE_SCAN = false;` ở đầu file (tập trung toàn bộ ngưỡng vào 1 object `FACE_ENROLL_CONFIG`).
- [ ] Khi bật `true`, log ra Browser Console mỗi chu kỳ quét:
      `detectMs`, `faceHeightRatio`, `yaw/pitch/roll`, `luminance`, `blurScore`, `emotion`, `mar`, `mouthWidthRatio`, `ear / baselineEAR`, `intraScore`.

#### G. Cập nhật UI trạng thái (không phá vỡ layout hiện có)

- [ ] **Màn hình nhân viên:**
  - Nếu `face_status === 'UNREGISTERED'`: cho phép mở camera kích hoạt.
  - Nếu `face_status === 'ACTIVE'`: ẩn/khóa nút kích hoạt, hiển thị huy hiệu `"Đã kích hoạt FaceID"` kèm ngày giờ `face_enrolled_at` và hướng dẫn liên hệ Admin/HR nếu cần Reset.
- [ ] **Màn hình quản trị (Admin/HR):**
  - Hiển thị cột trạng thái `face_status` của từng nhân viên.
  - Bổ sung nút **"Reset FaceID"** cho nhân viên đang `ACTIVE` → mở modal nhỏ bắt buộc nhập **Lý do Reset** → gọi API Reset và cập nhật lại trạng thái ngay lập tức.

---

## 4. Chi tiết các phần CẦN CHỈNH SỬA — Phase 2: Tối ưu Điểm danh hằng ngày _(Làm sau Phase 1)_

> **Nguyên tắc:** Không đụng vào luồng Điểm danh trong khi đang làm Phase 1. Sau khi Phase 1 pass sạch 100% Test Case mới tối ưu tiếp các điểm sau cho màn hình chấm công:

- [ ] **Tốc độ quét dưới 1–2 giây:** Áp dụng lại cấu hình cam `640x480`, warm-up model WebGL và vòng lặp throttle `120–150ms` (không chạy 60 FPS).
- [ ] **Áp dụng Quality Gate cơ bản (KHÔNG bật Neutral Gate):** Chặn ảnh quá tối/chói/nhòe/lệch góc mạnh, nhưng **vẫn cho phép nhân viên cười nhẹ khi điểm danh** hằng ngày cho tự nhiên.
- [ ] **Chốt đa khung hình (Multi-frame Voting):** Yêu cầu **2–3 frame hợp lệ liên tiếp khớp cùng 1 `employee_id`** mới gửi lệnh chấm công (giảm tỉ lệ nhận nhầm gần như bằng 0).
- [ ] **Kiểm tra khoảng cách Top-1 vs Top-2 (Margin Gap):** Khi so khớp 1-N để điểm danh, ngoài việc `bestScore` phải vượt `ATTENDANCE_MATCH_THRESHOLD`, khoảng cách giữa người khớp nhất (Top-1) và người khớp nhì (Top-2) phải đạt độ chênh tối thiểu để loại trừ trường hợp hai khuôn mặt có điểm sát nhau.
- [ ] **Tương thích bộ 5 mẫu mới:** Khi điểm danh so khớp với nhân viên trong DB, tính điểm khớp với cả `centroid` và toàn bộ 5 `samples` của nhân viên đó (lấy điểm tốt nhất).

---

## 5. Bảng tổng hợp các hằng số cần cấu hình & tinh chỉnh thực tế

| Nhóm              | Thông số                              | Giá trị khởi điểm đề xuất                       | Hướng dẫn chỉnh khi test webcam thật                                   |
| :---------------- | :------------------------------------ | :---------------------------------------------- | :--------------------------------------------------------------------- |
| **Camera**        | Độ phân giải                          | `640 x 480`                                     | Giữ cố định để tối ưu FPS                                              |
| **Camera**        | Chu kỳ quét (Throttle)                | `120 – 150 ms`                                  | Tăng lên `180ms` nếu máy văn phòng yếu                                 |
| **Quality Gate**  | Tỉ lệ chiều cao mặt                   | `0.25 – 0.55`                                   | Đảm bảo mặt gọn trong khung oval                                       |
| **Quality Gate**  | Góc lệch `yaw / pitch / roll`         | Tối đa `15° – 18°`                              | Tính bằng radian `~0.26 – 0.31`                                        |
| **Quality Gate**  | Độ sáng (`luminance`)                 | `65 – 215`                                      | Hạ min xuống `55` nếu góc văn phòng hơi tối                            |
| **Quality Gate**  | Độ nét (`blurScore`)                  | Tinh chỉnh theo log thực tế                     | Bật `DEBUG_FACE_SCAN` xem số lúc đứng yên vs lúc lắc đầu               |
| **Neutral Gate**  | Độ mở miệng (`MAR`)                   | Tối đa `0.14`                                   | Chặn há miệng / cười hở răng                                           |
| **Neutral Gate**  | Tỉ lệ miệng / hàm (`mouthWidthRatio`) | Tối đa `0.44`                                   | So log lúc mặt thẳng (~0.37) và lúc cười (~0.48) để đặt mốc ở giữa     |
| **Neutral Gate**  | Điểm cảm xúc `happy` (Human)          | Tối đa `0.25 – 0.30`                            | Chặn cười trực tiếp bằng model emotion                                 |
| **Liveness**      | Chớp mắt động (`EAR`)                 | Tụt `< 0.75×` → mở `> 0.90×`                    | Trong cửa sổ `100 – 800 ms` theo `baselineEAR`                         |
| **Enrollment**    | Số mẫu thu thập                       | `5 mẫu`                                         | Khớp đúng bản ghi hiện có (`id = 2`)                                   |
| **Backend Match** | `ATTENDANCE_MATCH_THRESHOLD`          | Giữ/chỉnh chặt theo công thức đo hiện có        | Chỉ dùng cho **Điểm danh** (chống nhận nhầm người khác)                |
| **Backend Match** | `DUPLICATE_FACE_THRESHOLD`            | Nới rộng vùng bắt trùng so với ngưỡng điểm danh | Chỉ dùng cho **Check trùng kích hoạt** (bắt luôn khi cười/đổi sắc mặt) |

---

## 6. Ràng buộc kỹ thuật bắt buộc (Không được vi phạm khi code)

1. **Tách biệt nghiệp vụ chấm công:** Tuyệt đối không thay đổi logic kiểm tra **IP mạng công ty**, **Device ID**, **ghép cặp check-in/check-out**, **cấu hình ca làm việc (`work_shifts`)**, **giải trình đi muộn/về sớm**, hay hệ thống **RBAC** sẵn có.
2. **Bảo toàn giao diện:** Không refactor CSS/layout của các khu vực ngoài khung camera kích hoạt và modal Reset FaceID.
3. **Không dùng dữ liệu giả:** Toàn bộ dữ liệu trạng thái, danh sách khuôn mặt đối chiếu và lịch sử Reset phải đọc/ghi 100% từ bảng `employees` trên MySQL; không hardcode bypass để qua kiểm tra.
4. **Không cài thêm thư viện trùng chức năng:** Tái sử dụng hoàn toàn `@vladmandic/human` và model `human-faceres1024-subjectlock-v2` đang chạy ổn định trong hệ thống.

---

## 7. Bộ Test Case nghiệm thu chi tiết

| Mã TC     | Kịch bản kiểm thử                                                                                                                                                      | Kết quả mong đợi (Frontend / Backend / DB)                                                                                                                                                                             |
| :-------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TC-01** | **Kích hoạt mới thành công** với tài khoản `UNREGISTERED` (nhìn thẳng, mặt tự nhiên, chớp mắt 1 lần)                                                                   | Frontend gom đủ 5 mẫu trong ~3–4 giây → API trả `200 OK` → DB cập nhật `face_status = 'ACTIVE'`, có `face_enrolled_at`, `face_descriptor` là JSON hợp lệ đủ 5 mẫu 1024 chiều                                           |
| **TC-02** | **Chặn kích hoạt lại khi đã `ACTIVE`** (tải lại trang hoặc gọi thẳng API bằng Postman/cURL)                                                                            | UI hiển thị trạng thái đã kích hoạt & khóa nút quét; gọi thẳng API bị Backend chặn trả `403`/`409`, DB không bị ghi đè                                                                                                 |
| **TC-03** | **Cố tình cười / há miệng / nhăn mặt lúc kích hoạt** trên tài khoản thứ 2                                                                                              | Frontend dừng lấy mẫu ngay tại Neutral Gate và hiện `"Giữ khuôn mặt tự nhiên, không cười khi kích hoạt"`                                                                                                               |
| **TC-04** | **Test xuyên lớp Backend chống trùng khi cười** (tạm bỏ qua Neutral Gate trên client hoặc gửi payload khuôn mặt đang cười của người đã có ở TC-01 cho tài khoản thứ 2) | Backend so toàn bộ `samples + centroid` với nhân viên cũ → vượt ngưỡng `DUPLICATE_FACE_THRESHOLD` → trả HTTP `409 Conflict` kèm log server chỉ rõ `matchedEmployeeId` và `bestMatchScore`                              |
| **TC-05** | **Test người thứ 2 khác khuôn mặt thật sự** kích hoạt trên tài khoản thứ 2                                                                                             | Không bị báo trùng nhầm → kích hoạt thành công, lưu `ACTIVE` bình thường                                                                                                                                               |
| **TC-06** | **Test Liveness với người đeo kính / mắt nhỏ**                                                                                                                         | Hệ thống tự đo `baselineEAR` riêng → chớp mắt tự nhiên 1 lần là vượt qua, không bị treo                                                                                                                                |
| **TC-07** | **Admin / HR bấm Reset FaceID** (nhập lý do) & **Nhân viên thường thử gọi API Reset**                                                                                  | Nhân viên thường bị chặn `403`; Admin/HR reset thành công → DB xóa `face_descriptor`, chuyển `face_status = 'UNREGISTERED'`, ghi đủ `face_reset_by`, `face_reset_at`, `face_reset_reason` → nhân viên đăng ký lại được |
| **TC-08** | **Kiểm tra hồi quy điểm danh (Regression)**                                                                                                                            | Nhân viên `id = 2` (dữ liệu cũ đồng bộ sang `ACTIVE`) và nhân viên mới đăng ký ở TC-01 đều điểm danh vào/ra bình thường với đầy đủ kiểm tra IP, Device ID và ca làm việc                                               |
