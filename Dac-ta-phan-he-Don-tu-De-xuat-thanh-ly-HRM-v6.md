# ĐẶC TẢ PHÂN HỆ ĐƠN TỪ -- ĐỀ XUẤT THANH LÝ HỢP ĐỒNG HRM

## Phiên bản 6.0 -- Thiết kế database gắn với công việc triển khai

> Phạm vi tài liệu: chỉ mô tả phần việc phụ trách của thành viên gồm đơn
> từ, đề xuất thanh lý hợp đồng, quy trình duyệt, bàn giao, soạn văn bản
> A4 và lưu hồ sơ. Đây không phải tài liệu thiết kế toàn bộ hệ thống
> HRM.

------------------------------------------------------------------------

## 1. Mục tiêu và phạm vi

Phân hệ cần hỗ trợ:

1.  Nhân viên gửi đơn xin nghỉ việc hoặc đơn xin tạm nghỉ.
2.  Trưởng bộ phận xem xét đơn theo đúng phòng ban.
3.  HR kiểm tra hồ sơ, yêu cầu bổ sung hoặc trình Giám đốc.
4.  Giám đốc duyệt hoặc từ chối đơn nghỉ việc.
5.  HR hoặc Trưởng bộ phận tạo đề xuất chấm dứt/thanh lý hợp đồng.
6.  Giám đốc duyệt hoặc từ chối đề xuất thanh lý.
7.  Sau khi được duyệt, HR thực hiện bàn giao, lập biên bản và hoàn tất
    hồ sơ.
8.  Lưu văn bản A4, phiên bản nội dung, PDF và lịch sử xử lý.
9.  Khi HR xác nhận hoàn tất, cập nhật trạng thái hợp đồng thông qua
    phân hệ Hợp đồng hiện có.

### Ngoài phạm vi

-   Không xây dựng lại quản lý người dùng, nhân viên, phòng ban hoặc hợp
    đồng.
-   Không xây dựng hệ thống quản lý kho/tài sản riêng. Chỉ ghi nhận tài
    sản được bàn giao trong hồ sơ nghỉ việc.
-   Không tự động xóa hợp đồng.
-   Không tự động chuyển hợp đồng sang Đã thanh lý ngay khi Giám đốc vừa
    duyệt.
-   Không gộp bài tập CRUD Posts/Auth bằng Node.js vào dự án HRM.

------------------------------------------------------------------------

## 2. Vai trò

  -----------------------------------------------------------------------
  Vai trò                             Nhiệm vụ
  ----------------------------------- -----------------------------------
  Nhân viên                           Tạo đơn xin nghỉ việc/tạm nghỉ; xem
                                      trạng thái; bổ sung hồ sơ khi được
                                      yêu cầu

  Trưởng bộ phận                      Xem đơn của nhân viên thuộc bộ
                                      phận; duyệt/từ chối ở bước của
                                      mình; có thể tạo đề xuất thanh lý

  HR                                  Kiểm tra hồ sơ; yêu cầu bổ sung;
                                      trình Giám đốc; tạo đề xuất; lập
                                      biên bản; hoàn tất hồ sơ

  Giám đốc                            Duyệt/từ chối đơn nghỉ việc và đề
                                      xuất thanh lý; có thể tự tạo đề
                                      xuất

  Admin kỹ thuật                      Quản lý quyền truy cập kỹ thuật;
                                      không mặc nhiên có quyền duyệt
                                      nghiệp vụ
  -----------------------------------------------------------------------

**Quy tắc quyền:** - Người tạo đề xuất không được tự duyệt đề xuất đó. -
Người dùng chỉ xem và xử lý hồ sơ phù hợp với vai trò/phạm vi được
cấp. - HR không thay Giám đốc duyệt đề xuất thanh lý. - Trưởng bộ phận
không được tự xác nhận hoàn tất thanh lý. - Giám đốc tạo đề xuất của
chính mình thì hồ sơ chuyển cho HR xử lý, không quay lại Giám đốc để tự
duyệt.

------------------------------------------------------------------------

## 3. Quy trình nghiệp vụ

### 3.1. Đơn xin nghỉ việc

1.  Nhân viên tạo đơn và gửi.
2.  Trưởng bộ phận xem xét:
    -   Đồng ý: chuyển HR kiểm tra.
    -   Từ chối: kết thúc với trạng thái `REJECTED`.
3.  HR kiểm tra:
    -   Hồ sơ hợp lệ: trình Giám đốc.
    -   Thiếu thông tin: chuyển `WAITING_EMPLOYEE_UPDATE`, ghi rõ nội
        dung cần bổ sung.
4.  Nhân viên bổ sung và gửi lại. Đơn quay về HR, không phải duyệt lại
    từ đầu ở Trưởng bộ phận.
5.  HR kiểm tra lại và trình Giám đốc.
6.  Giám đốc duyệt hoặc từ chối.
7.  Nếu đơn nghỉ việc được duyệt, HR tạo đề xuất thanh lý riêng. Đơn
    nghỉ việc được duyệt không đồng nghĩa hợp đồng đã thanh lý.

### 3.2. Đơn xin tạm nghỉ

1.  Nhân viên tạo đơn, nêu thời gian và lý do.
2.  Trưởng bộ phận xem xét.
3.  HR kiểm tra và xử lý theo quy định công ty.
4.  Không tạo đề xuất thanh lý hợp đồng cho đơn tạm nghỉ.

> Việc có cần Giám đốc duyệt đơn tạm nghỉ hay không cần xác nhận theo
> quy định của doanh nghiệp. Không mặc định mọi đơn tạm nghỉ đều phải
> qua Giám đốc.

### 3.3. Đề xuất thanh lý hợp đồng

-   HR hoặc Trưởng bộ phận tạo đề xuất: chuyển Giám đốc duyệt.
-   Giám đốc tạo đề xuất: chuyển HR tiếp nhận xử lý, không tự duyệt.
-   Giám đốc duyệt: đề xuất chuyển sang chờ HR thực hiện.
-   Giám đốc từ chối: kết thúc `REJECTED`, lưu người từ chối, thời điểm
    và lý do.
-   HR chỉ hoàn tất sau khi các thủ tục và tài liệu bắt buộc đã được xử
    lý.

`Đề xuất chấm dứt HĐLĐ` và `Đề xuất thanh lý hợp đồng` được xem là cùng
một loại nghiệp vụ trong phân hệ, không tạo hai bảng riêng chỉ vì khác
cách gọi.

### 3.4. Công việc HR sau khi Giám đốc duyệt

1.  Kiểm tra lại nhân viên, hợp đồng, lý do và quyết định duyệt.
2.  Xác định có cần bàn giao công việc hay không.
3.  Lập biên bản bàn giao công việc nếu có.
4.  Lập biên bản bàn giao tài sản nếu nhân viên có tài sản công ty cần
    hoàn trả.
5.  Soạn biên bản thanh lý hợp đồng trên trang A4 bằng Tiptap.
6.  Xuất PDF, lưu hồ sơ và các tài liệu liên quan.
7.  Ghi ngày hoàn tất, ghi chú và người xác nhận.
8.  Gọi chức năng/API của phân hệ Hợp đồng để cập nhật trạng thái hợp
    đồng thành `Đã thanh lý`.
9.  Lưu lịch sử xử lý. Không xóa hợp đồng cũ.

**Lưu ý:** Biên bản bàn giao công việc, biên bản bàn giao tài sản và
biên bản thanh lý hợp đồng là các tài liệu khác nhau. Hai loại bàn giao
chỉ áp dụng khi có nội dung cần bàn giao.

------------------------------------------------------------------------

## 4. Thiết kế database

### 4.1. Nguyên tắc trước khi tạo bảng



Trước khi viết migration/SQL phải: 1. Kiểm tra DBMS đang dùng (MySQL,
PostgreSQL hoặc hệ khác). 2. Kiểm tra file cấu hình kết nối database. 3.
Kiểm tra migrations, schema, models và tên bảng thật. 4. Kiểm tra khóa
chính, kiểu dữ liệu ID và các khóa ngoại hiện có. 5. Trao đổi với thành
viên phụ trách phân hệ Hợp đồng về tên bảng, khóa chính và cách cập nhật
trạng thái. 6. Chỉ tạo bảng còn thiếu. Không tạo bản sao của bảng dùng
chung.


### 4.2. Danh sách bảng mới

Dự kiến **9 bảng**:

  ----------------------------------------------------------------------------------------
                    STT Bảng                             Mục đích         Công việc sử
                                                                          dụng
  --------------------- -------------------------------- ---------------- ----------------
                      1 `employee_requests`              Lưu đơn nghỉ     Nhân viên tạo
                                                         việc và tạm nghỉ đơn, Trưởng bộ
                                                                          phận/HR/Giám đốc
                                                                          xử lý

                      2 `liquidation_proposals`          Lưu đề xuất chấm HR/Trưởng bộ
                                                         dứt/thanh lý hợp phận/Giám đốc
                                                         đồng             tạo đề xuất

                      3 `workflow_actions`               Lưu lịch sử từng Duyệt, từ chối,
                                                         hành động trong  yêu cầu bổ sung,
                                                         quy trình        trình duyệt,
                                                                          hoàn tất

                      4 `request_information_requests`   Lưu các lần yêu  HR yêu cầu bổ
                                                         cầu nhân viên bổ sung và nhân
                                                         sung hồ sơ       viên phản hồi

                      5 `handover_records`               Lưu từng         Bàn giao công
                                                         đợt/biên bản bàn việc hoặc tài
                                                         giao             sản

                      6 `handover_items`                 Lưu từng đầu     Chi tiết nội
                                                         việc/tài sản     dung bàn giao
                                                         trong một biên   
                                                         bản bàn giao     

                      7 `document_templates`             Lưu mẫu văn bản  HR chọn mẫu biên
                                                         và cấu hình mẫu  bản
                                                         A4               

                      8 `document_versions`              Lưu nội dung và  Tiptap, chỉnh
                                                         phiên bản từng   sửa, chốt nội
                                                         văn bản          dung, xuất PDF

                      9 `workflow_attachments`           Lưu thông tin    Đơn, đề xuất,
                                                         file đính kèm    biên bản, PDF và
                                                                          tài liệu chứng
                                                                          minh
  ----------------------------------------------------------------------------------------



### 4.3. Chi tiết các bảng

#### Bảng 1: `employee_requests`

Lưu đơn do nhân viên gửi.

  -----------------------------------------------------------------------
  Cột                     Kiểu dữ liệu gợi ý      Ý nghĩa
  ----------------------- ----------------------- -----------------------
  `id`                    BIGINT, PK              ID đơn

  `employee_id`           cùng kiểu ID nhân viên  Người làm đơn

  `department_id`         cùng kiểu ID phòng ban, Phòng ban tại thời điểm
                          có thể nullable         gửi

  `request_type`          VARCHAR(30)             `RESIGNATION` hoặc
                                                  `TEMPORARY_LEAVE`

  `title`                 VARCHAR(255)            Tiêu đề đơn

  `reason`                TEXT                    Lý do

  `start_date`            DATE                    Ngày bắt đầu nghỉ/tạm
                                                  nghỉ

  `last_working_date`     DATE, nullable          Ngày làm việc cuối, chủ
                                                  yếu cho đơn nghỉ việc

  `end_date`              DATE, nullable          Ngày kết thúc tạm nghỉ

  `status`                VARCHAR(40)             Trạng thái hiện tại

  `submitted_at`          DATETIME, nullable      Thời điểm gửi

  `created_at`            DATETIME                Ngày tạo

  `updated_at`            DATETIME                Ngày cập nhật
  -----------------------------------------------------------------------

Ghi chú: - Có thể bổ sung trường dữ liệu riêng khi chốt nghiệp vụ. -
Không lưu tên nhân viên/phòng ban thành dữ liệu lặp nếu có thể lấy từ
bảng dùng chung; `department_id` chỉ lưu nếu cần cố định phạm vi tại
thời điểm gửi. - File PDF/ảnh đính kèm quản lý qua
`workflow_attachments`.

#### Bảng 2: `liquidation_proposals`

Lưu đề xuất thanh lý hợp đồng.

  -----------------------------------------------------------------------------
  Cột                           Kiểu dữ liệu gợi ý      Ý nghĩa
  ----------------------------- ----------------------- -----------------------
  `id`                          BIGINT, PK              ID đề xuất

  `employee_id`                 cùng kiểu ID nhân viên  Nhân viên liên quan

  `contract_id`                 cùng kiểu ID hợp đồng   Hợp đồng cần thanh lý

  `source_request_id`           cùng kiểu ID đơn,       Đơn nghỉ việc đã duyệt
                                nullable                nếu có

  `created_by`                  cùng kiểu ID người dùng Người tạo đề xuất

  `proposal_type`               VARCHAR(30)             Loại chấm dứt theo
                                                        nghiệp vụ nếu cần phân
                                                        loại

  `reason`                      TEXT                    Lý do đề xuất

  `proposed_termination_date`   DATE                    Ngày dự kiến chấm dứt

  `status`                      VARCHAR(40)             Trạng thái đề xuất

  `approved_by`                 cùng kiểu ID người      Người duyệt
                                dùng, nullable          

  `approved_at`                 DATETIME, nullable      Thời điểm duyệt

  `rejection_reason`            TEXT, nullable          Lý do từ chối

  `completed_by`                cùng kiểu ID người      HR xác nhận hoàn tất
                                dùng, nullable          

  `completed_at`                DATETIME, nullable      Thời điểm hoàn tất

  `completion_note`             TEXT, nullable          Ghi chú hoàn tất

  `created_at`                  DATETIME                Ngày tạo

  `updated_at`                  DATETIME                Ngày cập nhật
  -----------------------------------------------------------------------------

Ràng buộc nghiệp vụ: - `contract_id` phải trỏ tới hợp đồng đúng của nhân
viên. - `source_request_id` chỉ được gắn khi là đơn nghỉ việc phù hợp đã
được duyệt. - Chặn tạo nhiều đề xuất đang xử lý cho cùng một hợp đồng,
trừ khi quy định dự án cho phép. - Người tạo không được tự duyệt. -
Không cập nhật hợp đồng thành Đã thanh lý tại thời điểm mới duyệt đề
xuất.

#### Bảng 3: `workflow_actions`

Lưu lịch sử xử lý để xem timeline và truy vết.

  ------------------------------------------------------------------------
  Cột                     Kiểu dữ liệu gợi ý      Ý nghĩa
  ----------------------- ----------------------- ------------------------
  `id`                    BIGINT, PK              ID lịch sử

  `entity_type`           VARCHAR(30)             `EMPLOYEE_REQUEST` hoặc
                                                  `LIQUIDATION_PROPOSAL`

  `entity_id`             BIGINT                  ID đơn/đề xuất

  `actor_id`              cùng kiểu ID người dùng Người thực hiện

  `action`                VARCHAR(50)             `SUBMIT`, `APPROVE`,
                                                  `REJECT`,
                                                  `REQUEST_UPDATE`,
                                                  `RESUBMIT`, `FORWARD`,
                                                  `COMPLETE`...

  `from_status`           VARCHAR(40), nullable   Trạng thái trước

  `to_status`             VARCHAR(40), nullable   Trạng thái sau

  `comment`               TEXT, nullable          Nội dung/lý do

  `created_at`            DATETIME                Thời điểm thao tác
  ------------------------------------------------------------------------

Ghi chú: - Đây là nhật ký, không dùng để thay thế trạng thái hiện tại
trong bảng đơn/đề xuất. - Nếu cần khóa ngoại chặt chẽ, có thể tách bảng
lịch sử theo từng loại đối tượng thay vì dùng `entity_type` +
`entity_id`.

#### Bảng 4: `request_information_requests`

Lưu từng lần HR yêu cầu bổ sung hồ sơ.

  Cột               Kiểu dữ liệu gợi ý        Ý nghĩa
  ----------------- ------------------------- -------------------------------------
  `id`              BIGINT, PK                ID yêu cầu
  `request_id`      cùng kiểu ID đơn          Đơn cần bổ sung
  `requested_by`    cùng kiểu ID người dùng   HR yêu cầu
  `content`         TEXT                      Nội dung cần bổ sung
  `status`          VARCHAR(20)               `PENDING`, `SUBMITTED`, `CANCELLED`
  `requested_at`    DATETIME                  Thời điểm yêu cầu
  `responded_at`    DATETIME, nullable        Thời điểm nhân viên phản hồi
  `response_note`   TEXT, nullable            Ghi chú phản hồi

Một đơn có thể có nhiều lần yêu cầu bổ sung; không ghi đè nội dung yêu
cầu cũ.

#### Bảng 5: `handover_records`

Lưu thông tin chung của từng biên bản bàn giao.

  -----------------------------------------------------------------------------
  Cột                           Kiểu dữ liệu gợi ý      Ý nghĩa
  ----------------------------- ----------------------- -----------------------
  `id`                          BIGINT, PK              ID biên bản

  `proposal_id`                 cùng kiểu ID đề xuất    Đề xuất thanh lý liên
                                                        quan

  `handover_type`               VARCHAR(30)             `WORK` hoặc `ASSET`

  `handover_date`               DATE, nullable          Ngày bàn giao

  `handover_from_employee_id`   cùng kiểu ID nhân viên  Người bàn giao

  `handover_to_employee_id`     cùng kiểu ID nhân viên, Người nhận
                                nullable                

  `confirmed_by`                cùng kiểu ID người      Người xác nhận
                                dùng, nullable          

  `status`                      VARCHAR(20)             `DRAFT`, `COMPLETED`,
                                                        `NOT_APPLICABLE`

  `note`                        TEXT, nullable          Ghi chú

  `created_at`                  DATETIME                Ngày tạo

  `updated_at`                  DATETIME                Ngày cập nhật
  -----------------------------------------------------------------------------

#### Bảng 6: `handover_items`

Lưu các dòng chi tiết trong biên bản.

  -----------------------------------------------------------------------
  Cột                     Kiểu dữ liệu gợi ý      Ý nghĩa
  ----------------------- ----------------------- -----------------------
  `id`                    BIGINT, PK              ID dòng

  `handover_record_id`    cùng kiểu ID biên bản   Biên bản cha

  `item_name`             VARCHAR(255)            Tên công việc/tài
                                                  sản/tài liệu

  `description`           TEXT, nullable          Mô tả

  `quantity`              DECIMAL(10,2), nullable Số lượng nếu là tài sản

  `condition_note`        TEXT, nullable          Tình trạng tài sản hoặc
                                                  trạng thái công việc

  `item_status`           VARCHAR(30), nullable   Trạng thái bàn giao

  `created_at`            DATETIME                Ngày tạo
  -----------------------------------------------------------------------

Không dùng bảng này để quản lý kho tài sản. Đây chỉ là chi tiết ghi nhận
bàn giao trong hồ sơ nghỉ việc.

#### Bảng 7: `document_templates`

Lưu mẫu văn bản A4.

  ------------------------------------------------------------------------
  Cột                     Kiểu dữ liệu gợi ý      Ý nghĩa
  ----------------------- ----------------------- ------------------------
  `id`                    BIGINT, PK              ID mẫu

  `template_code`         VARCHAR(50), UNIQUE     Mã mẫu

  `template_name`         VARCHAR(255)            Tên mẫu

  `document_type`         VARCHAR(40)             `WORK_HANDOVER`,
                                                  `ASSET_HANDOVER`,
                                                  `CONTRACT_LIQUIDATION`

  `content_json`          JSON hoặc LONGTEXT      Nội dung mẫu Tiptap

  `page_config`           JSON hoặc LONGTEXT      Cấu hình A4, lề, font

  `is_active`             BOOLEAN                 Đang sử dụng

  `created_by`            cùng kiểu ID người dùng Người tạo mẫu

  `created_at`            DATETIME                Ngày tạo

  `updated_at`            DATETIME                Ngày cập nhật
  ------------------------------------------------------------------------

#### Bảng 8: `document_versions`

Lưu từng văn bản được soạn từ mẫu hoặc tạo cho một hồ sơ.

  ------------------------------------------------------------------------
  Cột                     Kiểu dữ liệu gợi ý      Ý nghĩa
  ----------------------- ----------------------- ------------------------
  `id`                    BIGINT, PK              ID phiên bản

  `entity_type`           VARCHAR(30)             `EMPLOYEE_REQUEST` hoặc
                                                  `LIQUIDATION_PROPOSAL`

  `entity_id`             BIGINT                  ID hồ sơ liên quan

  `template_id`           cùng kiểu ID mẫu,       Mẫu được sử dụng
                          nullable                

  `document_type`         VARCHAR(40)             Loại văn bản

  `version_number`        INT                     Số phiên bản

  `title`                 VARCHAR(255)            Tên văn bản

  `content_json`          JSON hoặc LONGTEXT      Nội dung Tiptap

  `rendered_html`         LONGTEXT, nullable      HTML kết xuất nếu cần

  `pdf_attachment_id`     cùng kiểu ID file,      File PDF đã xuất
                          nullable                

  `status`                VARCHAR(20)             `DRAFT`, `FINALIZED`

  `created_by`            cùng kiểu ID người dùng Người soạn

  `created_at`            DATETIME                Ngày tạo
  ------------------------------------------------------------------------

Mỗi lần sửa sau khi đã chốt phải tạo phiên bản mới hoặc bản nháp mới;
không ghi đè bản đã chốt. Cần thống nhất cách tạo quan hệ file để tránh
vòng tham chiếu giữa `document_versions` và `workflow_attachments`.

#### Bảng 9: `workflow_attachments`

Lưu metadata của file; file thật nằm trong thư mục storage hoặc dịch vụ
lưu trữ của dự án.

  -----------------------------------------------------------------------
  Cột                     Kiểu dữ liệu gợi ý      Ý nghĩa
  ----------------------- ----------------------- -----------------------
  `id`                    BIGINT, PK              ID file

  `entity_type`           VARCHAR(30)             Loại hồ sơ

  `entity_id`             BIGINT                  ID hồ sơ

  `document_version_id`   cùng kiểu ID phiên bản, Phiên bản văn bản nếu
                          nullable                có

  `file_name`             VARCHAR(255)            Tên file

  `file_path`             VARCHAR(500)            Đường dẫn lưu file

  `mime_type`             VARCHAR(100)            Loại file

  `file_size`             BIGINT                  Dung lượng

  `uploaded_by`           cùng kiểu ID người dùng Người tải lên

  `created_at`            DATETIME                Ngày tải lên
  -----------------------------------------------------------------------

Kiểm tra quyền tải lên/tải xuống, loại file, dung lượng và tên file.
Không lưu nội dung file nhị phân trực tiếp trong bảng nếu dự án đang
dùng file storage.

### 4.4. Quan hệ chính

``` text
Bảng dùng chung (cần kiểm tra tên thật):
Employees ─────┬── Employee Requests
               ├── Liquidation Proposals ───── Contracts
               └── Handover Records

Employee Requests ──< Request Information Requests
Employee Requests ──< Workflow Actions (liên kết theo entity)
Liquidation Proposals ──< Workflow Actions (liên kết theo entity)

Liquidation Proposals ──< Handover Records ──< Handover Items

Document Templates ──< Document Versions
Employee Requests / Liquidation Proposals ──< Document Versions
Employee Requests / Liquidation Proposals ──< Workflow Attachments
Document Versions ── Workflow Attachments (PDF)
```


------------------------------------------------------------------------

## 5. Trạng thái đề xuất

### 5.1. Đơn nghỉ việc

-   `DRAFT`: Nháp.
-   `PENDING_DEPARTMENT`: Chờ Trưởng bộ phận.
-   `PENDING_HR`: Chờ HR kiểm tra.
-   `WAITING_EMPLOYEE_UPDATE`: Chờ nhân viên bổ sung.
-   `PENDING_DIRECTOR`: Chờ Giám đốc.
-   `APPROVED`: Đã duyệt.
-   `REJECTED`: Từ chối.
-   `CANCELLED`: Đã hủy nếu nghiệp vụ cho phép.

### 5.2. Đơn tạm nghỉ

Có thể dùng chung bảng `employee_requests`, nhưng cần xác định luồng
duyệt riêng. Ví dụ: `DRAFT` → `PENDING_DEPARTMENT` → `PENDING_HR` →
`APPROVED`/`REJECTED`. Không ép qua Giám đốc nếu quy định doanh nghiệp
không yêu cầu.

### 5.3. Đề xuất thanh lý

-   `DRAFT`: Nháp.
-   `PENDING_DIRECTOR`: Chờ Giám đốc.
-   `PENDING_HR_PROCESSING`: Giám đốc đã duyệt, chờ HR thực hiện.
-   `IN_PROGRESS`: HR đang xử lý bàn giao/văn bản.
-   `COMPLETED`: Đã hoàn tất thanh lý.
-   `REJECTED`: Bị từ chối.
-   `CANCELLED`: Đã hủy nếu được phép.

Trường hợp Giám đốc là người tạo: có thể khởi tạo ở trạng thái
`PENDING_HR_PROCESSING` hoặc trạng thái chờ HR tiếp nhận theo quy tắc hệ
thống; phải lưu rõ việc bỏ qua bước tự duyệt.

------------------------------------------------------------------------

## 6. Công việc triển khai theo thứ tự

### Giai đoạn 1 -- Khảo sát dự án và database hiện có

-   [ ] Mở repository và xác định framework/backend.
-   [ ] Xác định DBMS và file cấu hình kết nối.
-   [ ] Kiểm tra migrations/schema hiện tại.
-   [ ] Tìm bảng người dùng, nhân viên, phòng ban, hợp đồng thực tế.
-   [ ] Kiểm tra cách phân quyền và lấy user đang đăng nhập.
-   [ ] Trao đổi với thành viên làm phân hệ Hợp đồng về khóa chính và
    API cập nhật trạng thái.
-   [ ] Chốt tên bảng, kiểu ID và quy ước đặt tên.

**Đầu ra:** Bảng đối chiếu giữa tên bảng dự kiến và tên bảng thật của dự
án. Chưa tạo bảng trùng.

### Giai đoạn 2 -- Tạo database cho phần việc của mình

Thực hiện migrations theo nhóm:

1.  [ ] `employee_requests`
2.  [ ] `liquidation_proposals`
3.  [ ] `workflow_actions`
4.  [ ] `request_information_requests`
5.  [ ] `handover_records`
6.  [ ] `handover_items`
7.  [ ] `document_templates`
8.  [ ] `document_versions`
9.  [ ] `workflow_attachments`

Sau khi tạo: - \[ \] Kiểm tra khóa chính, khóa ngoại và index. - \[ \]
Kiểm tra kiểu ID có khớp bảng dùng chung. - \[ \] Kiểm tra các trạng
thái hợp lệ. - \[ \] Tạo dữ liệu mẫu phục vụ kiểm thử. - \[ \] Chạy
migration trên database phát triển, không chạy thẳng production.

**Đầu ra:** Database phân hệ được tạo và có thể truy vấn.

### Giai đoạn 3 -- Backend/API theo từng nghiệp vụ

-   [ ] API tạo/xem/cập nhật/gửi đơn nghỉ việc.
-   [ ] API tạo/xem/gửi đơn tạm nghỉ.
-   [ ] API Trưởng bộ phận duyệt/từ chối.
-   [ ] API HR kiểm tra, yêu cầu bổ sung, nhận bổ sung và trình Giám
    đốc.
-   [ ] API Giám đốc duyệt/từ chối đơn nghỉ việc.
-   [ ] API tạo đề xuất thanh lý.
-   [ ] API Giám đốc duyệt/từ chối đề xuất.
-   [ ] API HR tiếp nhận và cập nhật tiến độ xử lý.
-   [ ] API ghi lịch sử vào `workflow_actions`.
-   [ ] API tạo biên bản bàn giao và chi tiết bàn giao.
-   [ ] API quản lý mẫu, phiên bản văn bản và file đính kèm.
-   [ ] API hoàn tất thanh lý và tích hợp phân hệ Hợp đồng.

Mọi API phải kiểm tra quyền ở backend; ẩn nút ở frontend không được xem
là biện pháp bảo mật.

### Giai đoạn 4 -- Giao diện

-   [ ] Nhân viên: danh sách đơn, tạo đơn, chi tiết, timeline, bổ sung
    hồ sơ.
-   [ ] Trưởng bộ phận: danh sách đơn thuộc bộ phận, màn hình duyệt/từ
    chối.
-   [ ] HR: hộp thư xử lý đơn, yêu cầu bổ sung, trình Giám đốc.
-   [ ] HR: tạo và theo dõi đề xuất thanh lý.
-   [ ] Giám đốc: danh sách chờ duyệt, chi tiết, duyệt/từ chối.
-   [ ] HR: màn hình bàn giao công việc/tài sản.
-   [ ] HR: trình soạn văn bản A4 bằng Tiptap.
-   [ ] HR: xem PDF, tải lên hồ sơ và hoàn tất thanh lý.

Có thể dựng giao diện trước bằng mock data để làm song song, nhưng phải
thay bằng API thật khi backend sẵn sàng. Không để mock data lẫn trong
logic production.

### Giai đoạn 5 -- Tiptap, A4 và PDF

-   [ ] Tạo mẫu biên bản bàn giao công việc.
-   [ ] Tạo mẫu biên bản bàn giao tài sản.
-   [ ] Tạo mẫu biên bản thanh lý hợp đồng.
-   [ ] Cấu hình khổ A4 210 × 297 mm, lề, font và căn chỉnh.
-   [ ] Lưu nội dung Tiptap JSON.
-   [ ] Tạo phiên bản mới khi chỉnh sửa nội dung đã chốt.
-   [ ] Xuất PDF và lưu metadata trong `workflow_attachments`.
-   [ ] Kiểm tra tiếng Việt, bảng dài, nhiều trang và ngắt trang.

CSS đặt kích thước A4 không tự đảm bảo phân trang khi biên tập. Nếu cần
soạn nhiều trang trực tiếp, phải kiểm tra giải pháp phân trang tương
thích với phiên bản Tiptap đang dùng.

### Giai đoạn 6 -- Kiểm thử và tích hợp

-   [ ] Nhân viên không xem được đơn của người khác.
-   [ ] Trưởng bộ phận không xem/duyệt đơn ngoài phạm vi được giao.
-   [ ] Người tạo đề xuất không thể tự duyệt.
-   [ ] Đơn bị từ chối thì dừng đúng quy trình.
-   [ ] Đơn được yêu cầu bổ sung quay lại HR sau khi nhân viên gửi lại.
-   [ ] Đơn tạm nghỉ không tạo đề xuất thanh lý.
-   [ ] Đề xuất bị từ chối không cho HR hoàn tất.
-   [ ] Giám đốc duyệt xong chưa làm hợp đồng đổi trạng thái ngay.
-   [ ] Thiếu bàn giao/tài liệu bắt buộc thì chưa cho hoàn tất.
-   [ ] Hoàn tất xong mới gọi API cập nhật hợp đồng.
-   [ ] Hợp đồng cũ và lịch sử vẫn được giữ nguyên.
-   [ ] File PDF mở được và chỉ người có quyền mới tải được.

------------------------------------------------------------------------

## 7. API dự kiến

Tên endpoint chỉ là đề xuất, cần theo quy ước router hiện tại của dự án.

  -----------------------------------------------------------------------------------------------
  Method                  Endpoint gợi ý                                  Mục đích
  ----------------------- ----------------------------------------------- -----------------------
  GET                     `/employee-requests`                            Danh sách đơn theo
                                                                          quyền

  POST                    `/employee-requests`                            Tạo đơn

  GET                     `/employee-requests/:id`                        Chi tiết đơn

  PUT                     `/employee-requests/:id`                        Sửa đơn nháp

  POST                    `/employee-requests/:id/submit`                 Gửi đơn

  POST                    `/employee-requests/:id/approve`                Duyệt tại bước hiện tại

  POST                    `/employee-requests/:id/reject`                 Từ chối

  POST                    `/employee-requests/:id/request-update`         Yêu cầu bổ sung

  POST                    `/employee-requests/:id/resubmit`               Gửi bổ sung

  GET                     `/liquidation-proposals`                        Danh sách đề xuất

  POST                    `/liquidation-proposals`                        Tạo đề xuất

  GET                     `/liquidation-proposals/:id`                    Chi tiết đề xuất

  POST                    `/liquidation-proposals/:id/approve`            Giám đốc duyệt

  POST                    `/liquidation-proposals/:id/reject`             Giám đốc từ chối

  POST                    `/liquidation-proposals/:id/complete`           HR xác nhận hoàn tất

  POST                    `/liquidation-proposals/:id/handover-records`   Tạo biên bản bàn giao

  POST                    `/documents/templates`                          Tạo/quản lý mẫu theo
                                                                          quyền

  POST                    `/documents/:id/versions`                       Lưu phiên bản văn bản

  POST                    `/attachments`                                  Tải file lên

  GET                     `/workflow/:type/:id/history`                   Xem lịch sử xử lý
  -----------------------------------------------------------------------------------------------

Không bắt buộc dùng nguyên các URL này. Cần xem cấu trúc backend và quy
ước hiện có trước khi triển khai.

------------------------------------------------------------------------

## 8. Quy tắc dữ liệu và bảo mật

-   Dùng transaction khi cập nhật trạng thái hồ sơ và ghi lịch sử.
-   Mọi thao tác duyệt/từ chối phải lưu người thực hiện, thời điểm và lý
    do nếu có.
-   Không tin `employee_id`, `created_by`, `approved_by` gửi từ
    frontend; backend phải xác định người đăng nhập và kiểm tra quyền.
-   Không cho sửa hồ sơ đã hoàn tất nếu không có quy trình điều chỉnh
    riêng.
-   Không xóa cứng đơn/đề xuất đã phát sinh lịch sử; ưu tiên trạng thái
    hủy.
-   File tải lên cần kiểm tra MIME type, dung lượng, quyền truy cập và
    tên file.
-   Dữ liệu văn bản đã chốt phải giữ phiên bản để truy xuất.
-   Không lưu mật khẩu hoặc thông tin nhạy cảm không cần thiết trong các
    bảng của phân hệ.

------------------------------------------------------------------------

## 9. Những điểm cần xác nhận với nhóm

1.  Tên thật và khóa chính của bảng nhân viên, người dùng, phòng ban,
    hợp đồng.
2.  Trạng thái hợp đồng hợp lệ và API mà thành viên phụ trách Hợp đồng
    cung cấp.
3.  Đơn tạm nghỉ có cần Giám đốc duyệt không.
4.  Đơn nghỉ việc do HR hoặc Giám đốc tạo sẽ đi theo luồng phê duyệt
    nào.
5.  Ai là người nhận bàn giao công việc/tài sản và có cần chữ ký điện tử
    không.
6.  Điều kiện bắt buộc trước khi HR được xác nhận hoàn tất.
7.  Nơi lưu file PDF và giới hạn loại/dung lượng file.

------------------------------------------------------------------------

## 10. Prompt dùng với OpenCode

### Prompt 1 -- Khảo sát trước, không sửa code

``` text
Hãy khảo sát repository HRM hiện tại. Chỉ đọc, không sửa hoặc tạo file.
Xác định framework, DBMS, file cấu hình database, hệ thống migration,
các bảng/model liên quan đến user, employee, department, contract,
cơ chế đăng nhập và phân quyền.
Tìm quy ước đặt tên, kiểu khóa chính và cách tạo API hiện có.
Báo cáo đường dẫn file và tên bảng/cột thực tế.
Không tự giả định tên bảng và không tạo bảng trùng.
```

### Prompt 2 -- Đối chiếu thiết kế database

``` text
Dựa trên kết quả khảo sát repository, đối chiếu thiết kế 9 bảng của
phân hệ Đơn từ – Đề xuất thanh lý trong tài liệu này với database hiện tại.
Chỉ ra bảng nào cần tạo, bảng nào đã có, khóa ngoại nào cần dùng,
cột nào cần điều chỉnh theo DBMS và kiểu ID thực tế.
Chưa chạy migration và chưa sửa dữ liệu.
```

### Prompt 3 -- Tạo migration theo từng nhóm

``` text
Chỉ tạo migration cho nhóm bảng được yêu cầu trong lần làm việc này.
Tuân thủ DBMS, kiểu ID, quy ước tên và cấu trúc migration hiện tại.
Không tạo lại bảng dùng chung. Có khóa ngoại, index, unique constraint
phù hợp. Tạo migration down/rollback nếu framework hỗ trợ.
Sau khi tạo, giải thích từng bảng và cách chạy migration.
Không tự chạy trên production.
```

### Prompt 4 -- Làm từng nghiệp vụ

``` text
Triển khai từng nghiệp vụ theo tài liệu: database -> model -> API ->
kiểm tra quyền -> kiểm thử. Không làm tất cả trong một lần.
Không thay đổi module Hợp đồng của thành viên khác.
Khi cần cập nhật trạng thái hợp đồng, tích hợp qua API/service đã thống nhất.
Bắt đầu bằng nghiệp vụ tạo và gửi đơn nghỉ việc; báo cáo file đã tạo/sửa
và hướng dẫn kiểm thử trước khi chuyển sang nghiệp vụ tiếp theo.
```

------------------------------------------------------------------------



**Kết luận:** 9 bảng là thiết kế dự kiến cho phạm vi hiện tại, không
phải khẳng định database dự án đang thiếu đúng 9 bảng. Sau bước khảo
sát, số bảng thực tế có thể giảm hoặc cần điều chỉnh để khớp kiến trúc
hiện có.
