# Hướng dẫn triển khai Migration Tái ký Hợp đồng (cho DBA/Operator)

- **Mục đích**: Hướng dẫn người có quyền truy cập máy chủ DB staging chạy migration an toàn, từng phase, không chạy toàn file một lúc.
- **Phạm vi**: Chỉ DB migration cho chức năng tái ký hợp đồng theo `taiKyHopDong1.md`. Không sửa code nghiệp vụ, không thay đổi 12 bước / 6 kết quả cuối / 13 trường hợp đặc biệt.
- **Trạng thái**: Tài liệu hướng dẫn. **Không tự chạy SQL, không kết nối DB, không sửa dữ liệu.**

## 1. File liên quan

| File | Vai trò | Khi dùng |
|---|---|---|
| `backend/sql/20261123_contract_renewal_staging.sql` | SQL migration chính thức, chia phase, có precheck/postcheck/STOP-RESUME | Chạy thủ công theo phase/statement |
| `backend/sql/20261123_contract_renewal_staging_verify.sql` | SQL verify hành vi (CHECK/generated/UNIQUE) | Chỉ sau Phase 5 schema pass, chỉ trên staging |
| `docs/contract-renewal-migration-staging-checklist.md` | Checklist vận hành | Điền PASS/STOP/RESUME trong quá trình chạy |
| `docs/contract-renewal-db-design-final.md` | Thiết kế DB cuối | Tham chiếu khi cần đối chiếu định nghĩa |

## 2. Nguyên tắc bắt buộc

- **Không chạy toàn bộ file SQL cùng lúc.** Copy/paste hoặc chạy từng block theo phase.
- **Không chạy trên production** trước khi staging pass toàn bộ.
- **Không DML sửa/xóa dữ liệu nghiệp vụ, không sửa `role_permissions`.**
- **Không coi `IF NOT EXISTS` là idempotent hoàn toàn.** `CREATE TABLE/ADD COLUMN/ADD INDEX IF NOT EXISTS` chỉ giúp tránh lỗi tồn tại đơn giản; không bảo đảm định nghĩa giống nhau.
- **Không rerun mù quáng sau lỗi.** Mỗi lần dừng phải xác định phase/statement đã PASS bằng `information_schema` + log.
- **ADD CONSTRAINT không có `IF NOT EXISTS` an toàn mặc định.** Trước mỗi `ADD CONSTRAINT`, phải precheck `information_schema.TABLE_CONSTRAINTS` theo tên; nếu tồn tại và đúng nghĩa: SKIP; nếu tồn tại khác nghĩa: STOP; nếu chưa tồn tại: mới chạy.
- **Không rollback bằng DROP bảng/cột nếu đã có dữ liệu nghiệp vụ mới phụ thuộc.** Rollback chỉ thủ công trên staging khi an toàn.
- **Không bật FK optional trên production** trong đợt này. Phase 4 chỉ staging sau verify.

## 3. Chuẩn bị trước khi chạy

| Việc | PASS | STOP |
|---|---|---|
| Xác nhận DB đích là staging, đúng `DATABASE()` | Tên DB đúng | Sai DB / production |
| Backup/snapshot trước khi chạy | Có backup/snapshot và thời điểm | Không có backup |
| Chốt cửa sổ bảo trì / hạn chế write ứng dụng | Có kế hoạch | Ứng dụng đang ghi mạnh, không kiểm soát |
| Chuẩn bị log triển khai | Có file log ghi phase, thời gian, người chạy, output | Không có log |
| Đã đọc checklist + file SQL | Người chạy hiểu STOP/RESUME | Chạy mù |

## 4. Thứ tự phase tổng quát

| Thứ tự | Phase | Loại | Mục tiêu |
|---|---|---|---|
| 1 | Phase 0.1-0.8 | READ ONLY | Baseline, collision, legacy risk, orphan hiện có |
| 2 | Phase 1 | DDL additive | Tạo 4 bảng mới |
| 3 | Postcheck P1 | READ ONLY | Xác nhận 4 bảng tạo đúng |
| 4 | Phase 2 | DDL additive | Thêm cột/index `contracts` |
| 5 | Postcheck P2 | READ ONLY | Xác nhận cột/index contracts |
| 6 | Phase 3A | DDL additive | Thêm cột/index `contract_files` (chưa constraint) |
| 7 | Postcheck P3A | READ ONLY | Xác nhận cột/index contract_files |
| 8 | Phase 3B | READ ONLY | Kiểm tra collision/invalid sau khi có cột mới |
| 9 | Phase 3C | DDL guarded | Thêm UNIQUE/CHECK `contract_files` từng câu |
| 10 | Postcheck P3C | READ ONLY | Xác nhận 5 constraint |
| 11 | Phase 3D | READ ONLY | Orphan precheck cho FK optional mới |
| 12 | Phase 4 | DDL guarded, STAGING ONLY | CHECK contracts + optional FK sau orphan pass |
| 13 | Phase 5 | READ ONLY | Postcheck schema toàn bộ |
| 14 | Verify script | Staging test + ROLLBACK | Xác nhận enforcement hành vi |

## 5. Hướng dẫn chạy chi tiết

### Phase 0 - READ ONLY (bắt buộc trước mọi DDL)

Chạy từng block 0.1→0.8 trong `backend/sql/20261123_contract_renewal_staging.sql`. Lưu output.

| Block | SQL cần chạy | PASS mong đợi | STOP nếu |
|---|---|---|---|
| 0.1 | `SELECT DATABASE()..., @@version, @@collation_database`; `SELECT NOW()`; `SHOW CREATE TABLE contracts/contract_files/employees/users` | Đúng DB staging; TiDB 8.5.x; 4 bảng tồn tại; baseline hợp lý | Sai DB/prod; thiếu bảng; version/schema bất thường |
| 0.2 | `SELECT ... FROM information_schema.COLUMNS WHERE ... TABLE_NAME IN ('contracts','contract_files')` | Có cột baseline; không thiếu cột cốt lõi | Thiếu cột baseline, kiểu/null/default/collation khác giả định nghiêm trọng |
| 0.3 | `SELECT ... FROM information_schema.STATISTICS ...` | Có `PRIMARY`, `uq_contract_code`, `fk_contract_emp`, `idx_contract_files_contract` | Thiếu index baseline quan trọng hoặc trùng tên đích với định nghĩa khác |
| 0.4 | `SELECT ... FROM information_schema.KEY_COLUMN_USAGE ... REFERENCED_TABLE_NAME IS NOT NULL` | Có `fk_contract_emp` | FK lạ ảnh hưởng migration; thiếu FK baseline cần giải thích |
| 0.5 | 2 query: `TABLES` cho 4 bảng mới; `TABLE_CONSTRAINTS` cho tên constraint đích | Cả 2 query trả **0 row** | Có bảng mới/constraint đích đã tồn tại: phải đối chiếu định nghĩa; khác nghĩa = STOP |
| 0.6 | 3 query trên `contract_files` dùng **chỉ cột hiện có** | `rows_per_contract > 1` trả **0 row**; `rows_that_would_default_current > 1` trả **0 row** | Bất kỳ row xung đột => **STOP trước Phase 3C**. Cần mapping thủ công ngoài migration, không auto-fix |
| 0.7 | `0.7.1` orphan `contract_files.contract_id -> contracts.id` | **0 row** | Có row => orphan hiện có; không bật FK `contract_files.contract_id->contracts`; điều tra dữ liệu |
| 0.8 | `SELECT ... COLUMNS` cho các cột dự kiến ADD ở `contracts/contract_files` | **0 row** | Có cột trùng tên: kiểm tra type/null/default/meaning; khác nghĩa = STOP |

**Kết luận P0**: chỉ chuyển Phase 1 khi mọi STOP condition ở trên đều PASS và đã lưu output.

### Phase 1 - Tạo 4 bảng mới (DDL additive)

| Bước | SQL | PASS | STOP/RESUME |
|---|---|---|---|
| P1.1 | 4 `CREATE TABLE IF NOT EXISTS ...` cho `contract_renewals`, `contract_renewal_assignments`, `contract_renewal_assignment_histories`, `contract_renewal_logs` | Lệnh chạy thành công | Lỗi SQL/permission/timeout: STOP, lưu lỗi, không chạy tiếp Phase 2 |
| P1.Post | Postcheck 4 bảng + nên `SHOW CREATE TABLE` | Đủ 4 bảng, định nghĩa khớp file SQL | Thiếu/khác định nghĩa: STOP. Nếu tồn tại từ trước và đúng nghĩa: ghi `SKIP P1 - exists+matches` |

**Resume P1**: kiểm tra từng bảng bằng `SHOW CREATE TABLE`; chỉ tạo bảng còn thiếu sau khi xác nhận bảng đã có đúng nghĩa.

### Phase 2 - Extend `contracts` (DDL additive)

| Bước | SQL | PASS | STOP/RESUME |
|---|---|---|---|
| P2.1 | `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS ...` (11 cột) | Thành công | Lỗi => STOP. Không chạy Phase 3A khi chưa rõ trạng thái cột |
| P2.2 | `ALTER TABLE contracts ADD INDEX IF NOT EXISTS ...` (4 index) | Thành công | Lỗi => STOP, kiểm tra index trùng tên/định nghĩa |
| P2.Post | Postcheck Phase 2 | Đủ 11 cột, type/null/default đúng | Thiếu/khác định nghĩa => STOP |

### Phase 3A - Extend `contract_files` columns/indexes (DDL additive, chưa constraint)

| Bước | SQL | PASS | STOP/RESUME |
|---|---|---|---|
| P3A.1 | `ALTER TABLE contract_files ADD COLUMN IF NOT EXISTS ...` (11 cột) | Thành công | Lỗi => STOP. Đặc biệt chú ý generated `current_flag` |
| P3A.2 | `ALTER TABLE contract_files ADD INDEX IF NOT EXISTS ...` (3 index) | Thành công | Lỗi => STOP |
| P3A.Post | Postcheck Phase 3A | Đủ 11 cột, `current_flag` là generated STORED | Thiếu cột => không chạy 3B/3C |

### Phase 3B - Post-column data prechecks (READ ONLY, bắt buộc)

Chỉ chạy sau P3A.Post PASS.

| Block | SQL | PASS | STOP |
|---|---|---|---|
| 3B.1 | Xác nhận đủ 4 cột `file_group_code,version_no,is_current,current_flag` | Đủ 4 cột | Thiếu cột => STOP, quay lại P3A |
| 3B.2 | 3 query collision: trùng `(contract_id,file_group_code,version_no)`, trùng current theo group, proxy rows/current | **Tất cả 0 row** | Có row => **STOP trước 3C**. Không add unique constraint. Cần mapping thủ công ngoài migration |
| 3B.3 | 3 query invalid: `is_current NOT IN (0,1)`, `current_flag` invalid, `version_no < 1` | **0 row** | Có row => STOP, điều tra dữ liệu |

### Phase 3C - `contract_files` constraints (GUARDED, từng câu một)

**Không chạy 3C nếu 3B chưa PASS.** Mỗi constraint: `Precheck tên -> ADD CONSTRAINT -> postcheck`.

| Constraint | Precheck | SQL | PASS | STOP/RESUME |
|---|---|---|---|---|
| `uk_cf_group_ver` | `TABLE_CONSTRAINTS WHERE CONSTRAINT_NAME='uk_cf_group_ver'` | `ADD CONSTRAINT uk_cf_group_ver UNIQUE (contract_id, file_group_code, version_no);` | Constraint tồn tại đúng | Tồn tại+matches => SKIP; khác nghĩa => STOP; lỗi duplicate => STOP |
| `uk_cf_group_current` | precheck tên | `ADD CONSTRAINT uk_cf_group_current UNIQUE (contract_id, file_group_code, current_flag);` | OK | tương tự |
| `chk_cf_is_current` | precheck tên | `ADD CONSTRAINT chk_cf_is_current CHECK (is_current IN (0,1));` | OK | tương tự |
| `chk_cf_current_flag` | precheck tên | `ADD CONSTRAINT chk_cf_current_flag CHECK (current_flag IS NULL OR current_flag = 1);` | OK | tương tự |
| `chk_cf_version_no` | precheck tên | `ADD CONSTRAINT chk_cf_version_no CHECK (version_no >= 1);` | OK | tương tự |
| P3C.Post | `TABLE_CONSTRAINTS ... IN (5 tên)` | - | Đủ 5 constraint | Thiếu => STOP, xác định câu chưa chạy |

### Phase 3D - Optional FK orphan prechecks (READ ONLY, trước Phase 4)

Chỉ chạy sau P2/P3A có cột cần thiết. Mọi query trả 0 row mới PASS cho FK tương ứng.

| Block | Cột/FK mục tiêu | PASS | STOP |
|---|---|---|---|
| 3D.1 | `contracts.renewal_case_id -> contract_renewals.id` | 0 row | Có orphan => không add FK đó |
| 3D.2 | `contracts.previous_contract_id -> contracts.id` | 0 row | Có orphan => không add |
| 3D.3 | `contracts.signed_by_company_user_id -> users.id` | 0 row | Có orphan => không add |
| 3D.4 | `contracts.signed_by_employee_id -> employees.id` | 0 row | Có orphan => không add |
| 3D.5 | `contract_files.replaced_file_id -> contract_files.id` | 0 row | Có orphan => không add |
| 3D.6 | `contract_files.renewal_case_id -> contract_renewals.id` | 0 row | Có orphan => không add |
| 3D.7 | `contract_files.uploaded_by_user_id -> users.id` | 0 row | Có orphan => không add |
| 3D.8 | `contract_renewal_logs.related_file_id -> contract_files.id` | 0 row | Có orphan => không add |

### Phase 4 - Optional hardening (STAGING ONLY, NOT PRODUCTION)

| Bước | SQL | PASS | STOP |
|---|---|---|---|
| P4.Pre | Precheck 4 constraint P4 trong `TABLE_CONSTRAINTS` | Biết constraint nào đã có/chưa | Tên trùng nghĩa khác => STOP |
| P4.1a | Guarded `ADD CONSTRAINT chk_contracts_previous_not_self ...` | Có constraint | Fail/exists khác nghĩa => STOP |
| P4.1b | Guarded `ADD CONSTRAINT chk_contracts_effective_after_start ...` | Có constraint | Fail/exists khác nghĩa => STOP |
| P4.2 | Optional FK: chỉ khi 3D.x PASS, precheck tên, rerun 3D.x ngay trước add. **Commented trong file - chỉ uncomment khi đủ điều kiện** | Constraint add được | Orphan/exists khác nghĩa/lỗi => STOP FK đó |

**Tuyệt đối không**: add `contract_files.contract_id -> contracts.id` khi chưa validate legacy; không bật FK optional trên production.

### Phase 5 - Schema postchecks (READ ONLY)

Chạy tất cả query Phase 5 trong file migration. PASS khi: 4 bảng mới tồn tại; cột/index/constraint/FK mong đợi có mặt; không thiếu object bắt buộc; object optional chỉ có nếu đã chủ động bật.

### Behavior Verification - `backend/sql/20261123_contract_renewal_staging_verify.sql` (STAGING ONLY)

- Chạy **sau Phase 5 PASS**. Chạy **từng block A-E**, không chạy mù cả file.
- Trước khi chạy, thay placeholder `@old_contract_id, @employee_id, @user_id` bằng ID hợp lệ trên staging.
- Mỗi block dùng `START TRANSACTION ... ROLLBACK`; các dòng `EXPECTED FAIL` phải fail với duplicate/check error.
- PASS khi: A1 current_flag/open_old_contract_id đúng; A2/A4 fail đúng; A3 cho phép mở sau đóng; B1/B2/B3 đúng; C1-C6 đúng; D fail đúng; E trả 0 row dữ liệu test còn sót.
- Nếu block để lại dữ liệu test, STOP và dọn thủ công trên staging. Không chạy verify trên production.

## 6. Xử lý khi Phase chạy lỗi / bị gián đoạn

| Tình huống | Hành động |
|---|---|
| Lỗi trong Phase 0 | Không chạy DDL. Ghi output, phân loại STOP condition, xử lý ngoài migration nếu cần. |
| `CREATE/ADD COLUMN/ADD INDEX IF NOT EXISTS` lỗi | STOP. Kiểm tra permission, syntax, lock, schema drift. Resume chỉ sau khi xác nhận object hiện có (nếu có) đúng nghĩa. |
| `ADD CONSTRAINT` lỗi | **STOP ngay**, không chạy constraint tiếp theo/các phase sau. Kiểm tra `TABLE_CONSTRAINTS`; nếu chưa tạo, chẩn đoán data/schema; nếu đã tạo, đối chiếu định nghĩa. Không rerun toàn file. |
| Chạy dở giữa phase | Lấy snapshot `information_schema` cho bảng/cột/index/constraint liên quan. Đánh dấu `NOT STARTED / IN PROGRESS / PASS / STOPPED`. Resume từ statement hợp lệ tiếp theo. |
| 3B có row rủi ro | STOP trước 3C. Không sửa data bằng migration. Lập kế hoạch mapping `file_group_code/version_no/is_current` thủ công ngoài migration, review riêng. |
| 3D có orphan | Không add FK tương ứng. Ghi nhận data quality issue. Có thể tiếp tục FK khác chỉ khi orphan precheck của FK đó PASS. |
| Verify fail | STOP go-live. Không coi schema migration là hoàn tất về hành vi. Điều tra constraint/phiên bản TiDB/data. |
| Cần rollback sau khi có dữ liệu nghiệp vụ mới | **Không DROP bảng/cột**. Giữ additive schema, tắt tính năng ở app/release, lập incident runbook. |

## 7. Điều kiện PASS/STOP cuối cùng

**PASS để chuyển staging schema readiness** khi:
- Phase 0-5 PASS theo checklist.
- Phase 3C đủ 5 constraint.
- Phase 3D đã chạy và ghi rõ FK nào PASS/STOP/defer.
- Verify script PASS trên staging, không còn dữ liệu test.
- Không có sửa dữ liệu nghiệp vụ/quyền.

**STOP tuyệt đối** khi: sai DB/prod; không có backup; collision schema khác nghĩa; 3B có collision legacy; bất kỳ ADD CONSTRAINT fail chưa chẩn đoán; orphan khi muốn bật FK; verify fail; yêu cầu xóa/sửa role_permissions/data nghiệp vụ.

## 8. Những việc đã kiểm tra khi lập hướng dẫn này

- Đã đọc toàn bộ 3 file: `backend/sql/20261123_contract_renewal_staging.sql`, `backend/sql/20261123_contract_renewal_staging_verify.sql`, `docs/contract-renewal-migration-staging-checklist.md`.
- Đã rà thứ tự phase: P0→P1→P2→P3A→P3B→P3C→P3D→P4→P5→Verify; có STOP/RESUME notes.
- Đã rà các điểm rủi ro đã sửa: P0.6/P0.7 chỉ dùng cột hiện có; orphan cột mới nằm P3D; P3C guarded từng constraint; verify dùng transaction/rollback.
- Không chạy SQL, không kết nối DB, không sửa dữ liệu, không sửa code nghiệp vụ.
## Phụ lục A - SQL chạy theo phase (copy từng block, không chạy cả file)

> Nguồn: ackend/sql/20261123_contract_renewal_staging.sql. Chỉ copy block phase đang chạy. Không chạy file end-to-end.

### Phase 0 - Prechecks (READ ONLY)
`sql
-- ============================================================
-- PHASE 0 - PRECHECKS (READ ONLY, REQUIRED BEFORE ANY DDL)
-- ============================================================

-- 0.1 Environment / baseline
SELECT DATABASE() AS db_name, @@version AS db_version, @@collation_database AS db_collation;
SELECT NOW() AS checked_at;

SHOW CREATE TABLE contracts;
SHOW CREATE TABLE contract_files;
SHOW CREATE TABLE employees;
SHOW CREATE TABLE users;

-- 0.2 Existing columns/types/defaults/nullability/extra
SELECT TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA, COLLATION_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('contracts','contract_files')
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- 0.3 Existing indexes
SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('contracts','contract_files')
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

-- 0.4 Existing foreign keys
SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('contracts','contract_files')
  AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION;

-- 0.5 Existing table/constraint name collisions
SELECT TABLE_NAME, TABLE_TYPE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'contract_renewals',
    'contract_renewal_assignments',
    'contract_renewal_assignment_histories',
    'contract_renewal_logs'
  );
-- STOP if any table exists with unexpected definition. Do not assume IF NOT EXISTS means compatible.

SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    (TABLE_NAME = 'contracts' AND CONSTRAINT_NAME IN (
      'chk_contracts_previous_not_self','chk_contracts_effective_after_start',
      'fk_contracts_renewal_case','fk_contracts_previous','fk_contracts_signed_company_user','fk_contracts_signed_employee'
    ))
    OR (TABLE_NAME = 'contract_files' AND CONSTRAINT_NAME IN (
      'uk_cf_group_ver','uk_cf_group_current','chk_cf_is_current','chk_cf_current_flag','chk_cf_version_no',
      'fk_cf_replaced','fk_cf_renewal_case','fk_cf_uploaded_by_user'
    ))
    OR (TABLE_NAME = 'contract_renewal_logs' AND CONSTRAINT_NAME IN ('fk_crl_related_file'))
  );
-- STOP if any target constraint name already exists. Inspect definition before any ADD CONSTRAINT.

-- 0.6 contract_files legacy data risk (USES ONLY EXISTING COLUMNS - SAFE BEFORE PHASE 3)
SELECT COUNT(*) AS contract_files_rows FROM contract_files;

-- Legacy collision proxy: multiple rows per contract_id mean default
-- (file_group_code='LEGACY_DEFAULT', version_no=1, is_current=1) will collide.
SELECT contract_id, COUNT(*) AS rows_per_contract
FROM contract_files
GROUP BY contract_id
HAVING COUNT(*) > 1;
-- STOP if any row returned. Do NOT add uk_cf_group_ver / uk_cf_group_current.
-- Manual mapping plan required outside this migration (no data update/delete here).

-- Current-flag collision proxy: if any contract has >1 row, all would default is_current=1.
SELECT contract_id, COUNT(*) AS rows_that_would_default_current
FROM contract_files
GROUP BY contract_id
HAVING COUNT(*) > 1;
-- STOP if any row returned (same condition, explicit for current_flag risk).

-- 0.7 Orphan checks (READ ONLY, EXISTING COLUMNS ONLY)
-- 0.7.1 contract_files.contract_id -> contracts.id (existing columns)
SELECT cf.id, cf.contract_id
FROM contract_files cf
LEFT JOIN contracts c ON c.id = cf.contract_id
WHERE c.id IS NULL
LIMIT 100;
-- Any row = orphan risk. Do NOT add FK contract_files.contract_id -> contracts.id.

-- NOTE: Orphan checks for columns added in Phase 2/3A
-- (contracts.renewal_case_id/previous_contract_id/signed_by_*,
--  contract_files.replaced_file_id/renewal_case_id/uploaded_by_user_id,
--  contract_renewal_logs.related_file_id)
-- are placed in PHASE 3D, immediately before Phase 4, after those columns exist.

-- 0.8 Column collision precheck for planned ADD COLUMN
SELECT TABLE_NAME, COLUMN_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    (TABLE_NAME='contracts' AND COLUMN_NAME IN ('renewal_case_id','previous_contract_id','effective_date','signed_at','signed_by_company_user_id','signed_by_company_name','signed_by_employee_id','signed_by_employee_name','superseded_at','actual_end_reason','actual_end_at'))
    OR (TABLE_NAME='contract_files' AND COLUMN_NAME IN ('renewal_case_id','file_category','file_group_code','version_no','is_current','current_flag','replaced_file_id','checksum_sha256','uploaded_by_user_id','storage_provider','note'))
  );
-- STOP if any column exists with incompatible type/meaning. IF NOT EXISTS will skip but not fix mismatch.
` 

### Phase 1 - Create tables (DDL) + Postcheck P1
`sql
-- ============================================================
-- PHASE 1 - CREATE NEW TABLES (ADDITIVE)
-- Resume marker: if all 4 tables exist with expected schema, skip to Phase 2.
-- ============================================================

CREATE TABLE IF NOT EXISTS contract_renewals (
  id BIGINT NOT NULL AUTO_INCREMENT,
  case_code VARCHAR(40) NOT NULL,
  old_contract_id INT NOT NULL,
  employee_id INT NOT NULL,
  department_id_snapshot INT NULL,
  manager_employee_id_snapshot INT NULL,
  new_contract_id INT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'DETECTED' COMMENT 'Business progress only; MUST NOT be PENDING_ASSIGNMENT',
  result_code VARCHAR(40) NULL COMMENT 'SIGNED_RENEWAL_CONTRACT|NOT_RENEWED|PENDING_EMPLOYEE_DECISION|PENDING_APPROVAL|PROPOSAL_IN_PROGRESS|EXPIRED_BEFORE_DECISION',
  current_stage VARCHAR(40) NOT NULL DEFAULT 'STEP_1_DETECTED',
  assignment_status VARCHAR(30) NOT NULL DEFAULT 'NOT_REQUIRED' COMMENT 'Assignee state only: NOT_REQUIRED|PENDING_ASSIGNMENT|ASSIGNED|IN_PROGRESS|COMPLETED',
  current_assignee_user_id INT NULL,
  is_open TINYINT(1) NOT NULL DEFAULT 1,
  open_old_contract_id INT GENERATED ALWAYS AS (CASE WHEN is_open = 1 THEN old_contract_id ELSE NULL END) STORED,
  detected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  detected_by_user_id INT NULL,
  old_contract_end_date DATE NULL,
  reminder_milestone_days SMALLINT NULL,
  response_due_at DATETIME NULL,
  legal_review_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  legal_review_note TEXT NULL,
  renewal_count_snapshot JSON NULL,
  employee_intent VARCHAR(30) NULL,
  employee_intent_note TEXT NULL,
  employee_responded_at DATETIME NULL,
  manager_recommendation VARCHAR(30) NULL,
  manager_reason TEXT NULL,
  manager_evaluated_at DATETIME NULL,
  proposal_status VARCHAR(30) NULL,
  proposed_contract_type VARCHAR(80) NULL,
  proposed_start_date DATE NULL,
  proposed_end_date DATE NULL,
  proposed_signed_salary DECIMAL(15,2) NULL,
  proposed_insurance_salary DECIMAL(15,2) NULL,
  proposed_allowances_json JSON NULL,
  proposal_note TEXT NULL,
  cb_review_status VARCHAR(30) NULL,
  cb_review_note TEXT NULL,
  approval_status VARCHAR(30) NULL,
  approved_by_user_id INT NULL,
  approved_at DATETIME NULL,
  approval_note TEXT NULL,
  draft_status VARCHAR(30) NULL,
  employee_review_status VARCHAR(30) NULL,
  employee_review_note TEXT NULL,
  sign_status VARCHAR(30) NULL,
  signed_at DATETIME NULL,
  completion_status VARCHAR(30) NULL,
  termination_notice_status VARCHAR(30) NULL,
  handover_status VARCHAR(30) NULL,
  final_settlement_status VARCHAR(30) NULL,
  special_case_code VARCHAR(50) NULL,
  special_case_note TEXT NULL,
  closed_reason TEXT NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_cr_case_code (case_code),
  UNIQUE KEY uk_cr_open_old_contract (open_old_contract_id),
  KEY idx_cr_status_stage (status, current_stage),
  KEY idx_cr_employee_status (employee_id, status),
  KEY idx_cr_assignee_status (current_assignee_user_id, assignment_status, status),
  KEY idx_cr_end_date (old_contract_end_date, status),
  KEY idx_cr_result (result_code, completed_at),
  KEY idx_cr_new_contract (new_contract_id),
  CONSTRAINT fk_cr_old_contract FOREIGN KEY (old_contract_id) REFERENCES contracts(id),
  CONSTRAINT fk_cr_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_cr_new_contract FOREIGN KEY (new_contract_id) REFERENCES contracts(id),
  CONSTRAINT fk_cr_assignee_user FOREIGN KEY (current_assignee_user_id) REFERENCES users(id),
  CONSTRAINT fk_cr_detected_by FOREIGN KEY (detected_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_cr_approved_by FOREIGN KEY (approved_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_cr_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_cr_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users(id),
  CONSTRAINT chk_cr_is_open CHECK (is_open IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contract_renewal_assignments (
  id BIGINT NOT NULL AUTO_INCREMENT,
  renewal_case_id BIGINT NOT NULL,
  stage_code VARCHAR(40) NOT NULL,
  assignee_user_id INT NOT NULL,
  assignee_employee_id INT NULL,
  assigned_by_user_id INT NULL,
  assignment_status VARCHAR(30) NOT NULL DEFAULT 'ASSIGNED',
  is_current TINYINT(1) NOT NULL DEFAULT 1,
  current_flag TINYINT(1) GENERATED ALWAYS AS (CASE WHEN is_current = 1 THEN 1 ELSE NULL END) STORED,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at DATETIME NULL,
  due_at DATETIME NULL,
  completed_at DATETIME NULL,
  note TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_cra_current (renewal_case_id, stage_code, current_flag),
  KEY idx_cra_renewal_current (renewal_case_id, is_current),
  KEY idx_cra_assignee_status (assignee_user_id, assignment_status),
  KEY idx_cra_stage (stage_code, assignment_status),
  CONSTRAINT fk_cra_renewal FOREIGN KEY (renewal_case_id) REFERENCES contract_renewals(id),
  CONSTRAINT fk_cra_assignee_user FOREIGN KEY (assignee_user_id) REFERENCES users(id),
  CONSTRAINT fk_cra_assigned_by FOREIGN KEY (assigned_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_cra_assignee_employee FOREIGN KEY (assignee_employee_id) REFERENCES employees(id),
  CONSTRAINT chk_cra_is_current CHECK (is_current IN (0,1)),
  CONSTRAINT chk_cra_current_flag CHECK (current_flag IS NULL OR current_flag = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contract_renewal_assignment_histories (
  id BIGINT NOT NULL AUTO_INCREMENT,
  renewal_case_id BIGINT NOT NULL,
  assignment_id BIGINT NULL,
  stage_code VARCHAR(40) NOT NULL,
  from_assignee_user_id INT NULL,
  to_assignee_user_id INT NULL,
  changed_by_user_id INT NULL,
  change_type VARCHAR(30) NOT NULL,
  reason TEXT NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_crah_renewal_changed (renewal_case_id, changed_at),
  KEY idx_crah_to_changed (to_assignee_user_id, changed_at),
  CONSTRAINT fk_crah_renewal FOREIGN KEY (renewal_case_id) REFERENCES contract_renewals(id),
  CONSTRAINT fk_crah_assignment FOREIGN KEY (assignment_id) REFERENCES contract_renewal_assignments(id),
  CONSTRAINT fk_crah_from_user FOREIGN KEY (from_assignee_user_id) REFERENCES users(id),
  CONSTRAINT fk_crah_to_user FOREIGN KEY (to_assignee_user_id) REFERENCES users(id),
  CONSTRAINT fk_crah_changed_by FOREIGN KEY (changed_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contract_renewal_logs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  renewal_case_id BIGINT NOT NULL,
  stage_code VARCHAR(40) NOT NULL,
  action_code VARCHAR(60) NOT NULL,
  from_status VARCHAR(40) NULL,
  to_status VARCHAR(40) NULL,
  actor_type VARCHAR(20) NOT NULL DEFAULT 'USER',
  actor_user_id INT NULL,
  actor_employee_id INT NULL,
  actor_role_id VARCHAR(30) NULL,
  comment TEXT NULL,
  payload_before JSON NULL,
  payload_after JSON NULL,
  related_contract_id INT NULL,
  related_file_id INT NULL COMMENT 'INT to match existing contract_files.id',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_crl_renewal_created (renewal_case_id, created_at),
  KEY idx_crl_action (action_code, created_at),
  KEY idx_crl_actor (actor_user_id, created_at),
  CONSTRAINT fk_crl_renewal FOREIGN KEY (renewal_case_id) REFERENCES contract_renewals(id),
  CONSTRAINT fk_crl_actor_user FOREIGN KEY (actor_user_id) REFERENCES users(id),
  CONSTRAINT fk_crl_actor_employee FOREIGN KEY (actor_employee_id) REFERENCES employees(id),
  CONSTRAINT fk_crl_related_contract FOREIGN KEY (related_contract_id) REFERENCES contracts(id),
  CONSTRAINT chk_crl_actor_type CHECK (actor_type IN ('SYSTEM','USER'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Postcheck Phase 1
SELECT TABLE_NAME FROM information_schema.TABLES
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('contract_renewals','contract_renewal_assignments','contract_renewal_assignment_histories','contract_renewal_logs');
` 

### Phase 2 - Extend contracts (DDL) + Postcheck P2
`sql
-- ============================================================
-- PHASE 2 - EXTEND CONTRACTS (ADDITIVE ONLY)
-- Resume marker: check columns/indexes in information_schema before rerun.
-- ============================================================

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS renewal_case_id BIGINT NULL COMMENT 'Link to contract_renewals.id',
  ADD COLUMN IF NOT EXISTS previous_contract_id INT NULL COMMENT 'Old contract for renewed contract only',
  ADD COLUMN IF NOT EXISTS effective_date DATE NULL,
  ADD COLUMN IF NOT EXISTS signed_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS signed_by_company_user_id INT NULL,
  ADD COLUMN IF NOT EXISTS signed_by_company_name VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS signed_by_employee_id INT NULL,
  ADD COLUMN IF NOT EXISTS signed_by_employee_name VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS superseded_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS actual_end_reason VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS actual_end_at DATETIME NULL;

ALTER TABLE contracts
  ADD INDEX IF NOT EXISTS idx_contracts_renewal_case (renewal_case_id),
  ADD INDEX IF NOT EXISTS idx_contracts_previous (previous_contract_id),
  ADD INDEX IF NOT EXISTS idx_contracts_employee_status_end (employee_id, status, end_date),
  ADD INDEX IF NOT EXISTS idx_contracts_effective (effective_date);

-- Postcheck Phase 2
SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='contracts'
  AND COLUMN_NAME IN ('renewal_case_id','previous_contract_id','effective_date','signed_at','signed_by_company_user_id','signed_by_company_name','signed_by_employee_id','signed_by_employee_name','superseded_at','actual_end_reason','actual_end_at')
ORDER BY COLUMN_NAME;
` 

### Phase 3A - Extend contract_files (DDL) + Postcheck P3A
`sql
-- ============================================================
-- PHASE 3A - EXTEND CONTRACT_FILES COLUMNS/INDEXES (ADDITIVE ONLY)
-- STOP if Phase 0.6 indicated legacy collision risk.
-- Resume marker: check columns/indexes before rerun.
-- ============================================================

ALTER TABLE contract_files
  ADD COLUMN IF NOT EXISTS renewal_case_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS file_category VARCHAR(40) NOT NULL DEFAULT 'CONTRACT_OTHER',
  ADD COLUMN IF NOT EXISTS file_group_code VARCHAR(64) NOT NULL DEFAULT 'LEGACY_DEFAULT' COMMENT 'Logical document group; versions share same group code',
  ADD COLUMN IF NOT EXISTS version_no INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_current TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS current_flag TINYINT(1) GENERATED ALWAYS AS (CASE WHEN is_current = 1 THEN 1 ELSE NULL END) STORED,
  ADD COLUMN IF NOT EXISTS replaced_file_id INT NULL COMMENT 'Self ref to contract_files.id INT',
  ADD COLUMN IF NOT EXISTS checksum_sha256 CHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS uploaded_by_user_id INT NULL,
  ADD COLUMN IF NOT EXISTS storage_provider VARCHAR(20) NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN IF NOT EXISTS note TEXT NULL;

ALTER TABLE contract_files
  ADD INDEX IF NOT EXISTS idx_cf_renewal (renewal_case_id),
  ADD INDEX IF NOT EXISTS idx_cf_replaced (replaced_file_id),
  ADD INDEX IF NOT EXISTS idx_cf_contract_cat (contract_id, file_category, is_current);

-- Postcheck Phase 3A
SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='contract_files'
  AND COLUMN_NAME IN ('renewal_case_id','file_category','file_group_code','version_no','is_current','current_flag','replaced_file_id','checksum_sha256','uploaded_by_user_id','storage_provider','note')
ORDER BY COLUMN_NAME;
` 

### Phase 3B - Post-column data prechecks (READ ONLY)
`sql
-- ============================================================
-- PHASE 3B - POST-COLUMN DATA PRECHECKS (READ ONLY, REQUIRED BEFORE 3C)
-- Uses columns added in Phase 3A. Do not run before 3A completes.
-- ============================================================

-- 3B.1 Confirm required columns exist
SELECT COLUMN_NAME FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='contract_files'
  AND COLUMN_NAME IN ('file_group_code','version_no','is_current','current_flag');
-- STOP if count < 4.

-- 3B.2 Legacy/default collision check after columns exist
SELECT contract_id, file_group_code, version_no, COUNT(*) AS cnt
FROM contract_files
GROUP BY contract_id, file_group_code, version_no
HAVING COUNT(*) > 1;
-- STOP if any row returned. Unique uk_cf_group_ver would fail.

SELECT contract_id, file_group_code, current_flag, COUNT(*) AS cnt
FROM contract_files
WHERE current_flag = 1
GROUP BY contract_id, file_group_code, current_flag
HAVING COUNT(*) > 1;
-- STOP if any row returned. Unique uk_cf_group_current would fail.

SELECT contract_id, COUNT(*) AS rows_per_contract, SUM(CASE WHEN is_current=1 THEN 1 ELSE 0 END) AS current_rows
FROM contract_files
GROUP BY contract_id
HAVING COUNT(*) > 1 OR SUM(CASE WHEN is_current=1 THEN 1 ELSE 0 END) > 1;
-- STOP if any row returned when defaults are LEGACY_DEFAULT/version_no=1/is_current=1.
-- Manual mapping plan required outside migration. NO data update/delete in this migration.

-- 3B.3 Invalid values that would fail CHECKs
SELECT id, is_current FROM contract_files WHERE is_current NOT IN (0,1);
SELECT id, current_flag FROM contract_files WHERE current_flag IS NOT NULL AND current_flag <> 1;
SELECT id, version_no FROM contract_files WHERE version_no < 1;
-- STOP if any row returned.
` 

### Phase 3C - Contract_files constraints (GUARDED)
`sql
-- ============================================================
-- PHASE 3C - CONTRACT_FILES CONSTRAINTS (GUARDED, RUN ONE BY ONE)
-- DO NOT rerun blindly. Before EACH statement, check constraint existence:
--   SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
--   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='contract_files' AND CONSTRAINT_NAME='<name>';
-- If exists: verify definition matches intent; if matches, mark RESUME and skip; if different, STOP.
-- If not exists: run statement. If statement fails, STOP, diagnose, do not rerun full migration.
-- ============================================================

-- Precheck 3C
SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='contract_files'
  AND CONSTRAINT_NAME IN ('uk_cf_group_ver','uk_cf_group_current','chk_cf_is_current','chk_cf_current_flag','chk_cf_version_no');

-- 3C.1 (run only if uk_cf_group_ver not exists)
ALTER TABLE contract_files
  ADD CONSTRAINT uk_cf_group_ver UNIQUE (contract_id, file_group_code, version_no);

-- 3C.2 (run only if uk_cf_group_current not exists)
ALTER TABLE contract_files
  ADD CONSTRAINT uk_cf_group_current UNIQUE (contract_id, file_group_code, current_flag);

-- 3C.3 (run only if chk_cf_is_current not exists)
ALTER TABLE contract_files
  ADD CONSTRAINT chk_cf_is_current CHECK (is_current IN (0,1));

-- 3C.4 (run only if chk_cf_current_flag not exists)
ALTER TABLE contract_files
  ADD CONSTRAINT chk_cf_current_flag CHECK (current_flag IS NULL OR current_flag = 1);

-- 3C.5 (run only if chk_cf_version_no not exists)
ALTER TABLE contract_files
  ADD CONSTRAINT chk_cf_version_no CHECK (version_no >= 1);

-- Postcheck Phase 3C
SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='contract_files'
  AND CONSTRAINT_NAME IN ('uk_cf_group_ver','uk_cf_group_current','chk_cf_is_current','chk_cf_current_flag','chk_cf_version_no')
ORDER BY CONSTRAINT_NAME;
` 

### Phase 3D - Optional FK orphan prechecks (READ ONLY)
`sql
-- ============================================================
-- PHASE 3D - OPTIONAL FK ORPHAN PRECHECKS (READ ONLY, BEFORE PHASE 4)
-- Run ONLY after Phase 2/3A columns exist. STOP if any orphan row returned.
-- These checks are required before adding corresponding optional FKs in Phase 4.
-- ============================================================

-- 3D.1 contracts.renewal_case_id -> contract_renewals.id (Phase 2 column)
SELECT id, renewal_case_id
FROM contracts
WHERE renewal_case_id IS NOT NULL
  AND renewal_case_id NOT IN (SELECT id FROM contract_renewals)
LIMIT 100;
-- STOP if any row returned.

-- 3D.2 contracts.previous_contract_id -> contracts.id (Phase 2 column)
SELECT id, previous_contract_id
FROM contracts
WHERE previous_contract_id IS NOT NULL
  AND previous_contract_id NOT IN (SELECT id FROM contracts)
LIMIT 100;
-- STOP if any row returned.

-- 3D.3 contracts.signed_by_company_user_id -> users.id (Phase 2 column)
SELECT id, signed_by_company_user_id
FROM contracts
WHERE signed_by_company_user_id IS NOT NULL
  AND signed_by_company_user_id NOT IN (SELECT id FROM users)
LIMIT 100;
-- STOP if any row returned.

-- 3D.4 contracts.signed_by_employee_id -> employees.id (Phase 2 column)
SELECT id, signed_by_employee_id
FROM contracts
WHERE signed_by_employee_id IS NOT NULL
  AND signed_by_employee_id NOT IN (SELECT id FROM employees)
LIMIT 100;
-- STOP if any row returned.

-- 3D.5 contract_files.replaced_file_id -> contract_files.id (Phase 3A column)
SELECT cf.id, cf.replaced_file_id
FROM contract_files cf
LEFT JOIN contract_files p ON p.id = cf.replaced_file_id
WHERE cf.replaced_file_id IS NOT NULL AND p.id IS NULL
LIMIT 100;
-- STOP if any row returned.

-- 3D.6 contract_files.renewal_case_id -> contract_renewals.id (Phase 3A column)
SELECT id, renewal_case_id
FROM contract_files
WHERE renewal_case_id IS NOT NULL
  AND renewal_case_id NOT IN (SELECT id FROM contract_renewals)
LIMIT 100;
-- STOP if any row returned.

-- 3D.7 contract_files.uploaded_by_user_id -> users.id (Phase 3A column)
SELECT id, uploaded_by_user_id
FROM contract_files
WHERE uploaded_by_user_id IS NOT NULL
  AND uploaded_by_user_id NOT IN (SELECT id FROM users)
LIMIT 100;
-- STOP if any row returned.

-- 3D.8 contract_renewal_logs.related_file_id -> contract_files.id (Phase 1 table, Phase 3A target safe)
SELECT l.id, l.related_file_id
FROM contract_renewal_logs l
LEFT JOIN contract_files f ON f.id = l.related_file_id
WHERE l.related_file_id IS NOT NULL AND f.id IS NULL
LIMIT 100;
-- STOP if any row returned.
` 

### Phase 4 - Optional hardening (STAGING ONLY, GUARDED)
`sql
-- ============================================================
-- PHASE 4 - OPTIONAL HARDENING (STAGING ONLY FIRST; NOT PRODUCTION)
-- Run ONLY after Phase 3D orphan checks pass.
-- Each statement is guarded: precheck constraint name, run one by one, STOP on failure.
-- DO NOT enable on production until staging verification + risk review complete.
-- ============================================================

-- Precheck 4
SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('contracts','contract_files','contract_renewal_logs')
  AND CONSTRAINT_NAME IN (
    'chk_contracts_previous_not_self','chk_contracts_effective_after_start',
    'fk_contracts_renewal_case','fk_contracts_previous','fk_contracts_signed_company_user','fk_contracts_signed_employee',
    'fk_cf_replaced','fk_cf_renewal_case','fk_cf_uploaded_by_user','fk_crl_related_file'
  );

-- 4.1 (guarded) contracts self-reference/effective checks
-- Precheck: no existing constraint with same name. If exists+matches skip; exists+different STOP.
ALTER TABLE contracts
  ADD CONSTRAINT chk_contracts_previous_not_self
    CHECK (previous_contract_id IS NULL OR previous_contract_id <> id);

-- Precheck: no existing constraint with same name. If exists+matches skip; exists+different STOP.
ALTER TABLE contracts
  ADD CONSTRAINT chk_contracts_effective_after_start
    CHECK (effective_date IS NULL OR start_date IS NULL OR effective_date >= start_date);

-- 4.2 Optional FKs - STAGING ONLY, one by one, after Phase 3D orphan precheck passes.
-- STOP/RESUME: before each, check constraint existence and re-run corresponding 3D orphan query.
-- DO NOT add contract_files.contract_id -> contracts.id without legacy validation.
-- DO NOT enable on production before staging pass + risk review.

-- 3D.1 passed? Precheck constraint name not exists -> then run:
-- ALTER TABLE contracts ADD CONSTRAINT fk_contracts_renewal_case FOREIGN KEY (renewal_case_id) REFERENCES contract_renewals(id);

-- 3D.2 passed? Precheck constraint name not exists -> then run:
-- ALTER TABLE contracts ADD CONSTRAINT fk_contracts_previous FOREIGN KEY (previous_contract_id) REFERENCES contracts(id);

-- 3D.3 passed? Precheck constraint name not exists -> then run:
-- ALTER TABLE contracts ADD CONSTRAINT fk_contracts_signed_company_user FOREIGN KEY (signed_by_company_user_id) REFERENCES users(id);

-- 3D.4 passed? Precheck constraint name not exists -> then run:
-- ALTER TABLE contracts ADD CONSTRAINT fk_contracts_signed_employee FOREIGN KEY (signed_by_employee_id) REFERENCES employees(id);

-- 3D.5 passed? Precheck constraint name not exists -> then run:
-- ALTER TABLE contract_files ADD CONSTRAINT fk_cf_replaced FOREIGN KEY (replaced_file_id) REFERENCES contract_files(id);

-- 3D.6 passed? Precheck constraint name not exists -> then run:
-- ALTER TABLE contract_files ADD CONSTRAINT fk_cf_renewal_case FOREIGN KEY (renewal_case_id) REFERENCES contract_renewals(id);

-- 3D.7 passed? Precheck constraint name not exists -> then run:
-- ALTER TABLE contract_files ADD CONSTRAINT fk_cf_uploaded_by_user FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id);

-- 3D.8 passed? Precheck constraint name not exists -> then run:
-- ALTER TABLE contract_renewal_logs ADD CONSTRAINT fk_crl_related_file FOREIGN KEY (related_file_id) REFERENCES contract_files(id);
` 

### Phase 5 - Schema postchecks (READ ONLY)
`sql
-- ============================================================
-- PHASE 5 - POSTCHECKS (READ ONLY, SCHEMA)
-- ============================================================

SHOW CREATE TABLE contract_renewals;
SHOW CREATE TABLE contract_renewal_assignments;
SHOW CREATE TABLE contract_renewal_assignment_histories;
SHOW CREATE TABLE contract_renewal_logs;
SHOW CREATE TABLE contracts;
SHOW CREATE TABLE contract_files;

SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('contract_renewals','contract_renewal_assignments','contract_renewal_assignment_histories','contract_renewal_logs','contracts','contract_files')
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('contract_renewals','contract_renewal_assignments','contract_renewal_assignment_histories','contract_renewal_logs','contracts','contract_files')
ORDER BY TABLE_NAME, CONSTRAINT_TYPE, CONSTRAINT_NAME;

SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('contract_renewals','contract_renewal_assignments','contract_renewal_assignment_histories','contract_renewal_logs','contracts','contract_files')
  AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION;
` 

### STOP/RESUME & Rollback notes
`sql
-- ============================================================
-- STOP/RESUME & ROLLBACK NOTES (NO DATA DELETE)
-- ============================================================
-- STOP conditions:
-- - Any Phase 0 collision/unexpected existing definition/orphan risk for planned FK.
-- - Phase 0.6/3B legacy collision rows returned.
-- - Any ADD CONSTRAINT fails; do not continue to next phase.
-- - Any postcheck shows missing expected object or unexpected definition.
--
-- Resume procedure:
-- 1. Identify last successful phase/statement from postchecks and information_schema.
-- 2. Do NOT rerun full file. Rerun only remaining phase after confirming preconditions.
-- 3. For ADD COLUMN/INDEX IF NOT EXISTS: safe to rerun only if same definition intended.
-- 4. For ADD CONSTRAINT: always precheck TABLE_CONSTRAINTS by name; skip if exists+matches; STOP if exists+different.
-- 5. For CREATE TABLE IF NOT EXISTS: verify full schema matches; if different, STOP and reconcile manually.
--
-- Rollback (manual, staging only, no data delete):
-- 1. Stop application writes.
-- 2. Drop Phase 4 FKs/checks first if added (after dependency check).
-- 3. Drop Phase 3C constraints if added and no dependent data/process requires them.
-- 4. Drop new tables in reverse dependency order only after confirming unused and no business data to preserve:
--    contract_renewal_logs, contract_renewal_assignment_histories, contract_renewal_assignments, contract_renewals.
-- 5. Drop additive indexes/columns only after confirming no code/data dependency. Prefer leaving additive columns unused.
-- 6. Never delete contract/contract_files business data. No role_permissions changes.
` 
