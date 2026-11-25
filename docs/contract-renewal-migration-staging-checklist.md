# Checklist Staging - Migration DB Tái ký hợp đồng

- **Hướng dẫn triển khai cho DBA/Operator**: `docs/contract-renewal-deployment-handoff.md` (đọc trước, không chạy toàn file SQL)
- **Migration file**: `backend/sql/20261123_contract_renewal_staging.sql`
- **Verification file**: `backend/sql/20261123_contract_renewal_staging_verify.sql` (STAGING ONLY, không production)

- **Thiết kế**: `docs/contract-renewal-db-design-final.md`
- **Nguồn nghiệp vụ**: `taiKyHopDong1.md`
- **Trạng thái**: CHƯA CHẠY. Chỉ chuẩn bị kiểm tra/quyết định.

## 0. Nguyên tắc an toàn
- [ ] Không chạy trên production trước khi staging pass toàn bộ.
- [ ] Không xóa/sửa dữ liệu nghiệp vụ, không xóa/sửa `role_permissions`.
- [ ] Backup/snapshot DB đích trước khi chạy.
- [ ] **Không coi `IF NOT EXISTS` là idempotent hoàn toàn**. Luôn chạy precheck và đối chiếu định nghĩa.
- [ ] **Không rerun toàn bộ migration mù quáng** sau khi chạy dở. Chỉ resume theo phase/statement đã xác định.
- [ ] Không giả định DDL rollback toàn bộ bằng transaction.
- [ ] Không rollback bằng DROP bảng/cột nếu đã có dữ liệu nghiệp vụ mới phụ thuộc; ưu tiên giữ additive object unused và xử lý theo runbook.

## 1. Xác định trạng thái migration (trước/sau khi chạy dở)
Ghi lại kết quả vào log triển khai staging:

| Phase/Marker | Cách xác nhận | PASS/Trạng thái |
|---|---|---|
| P0 Precheck | Đã lưu output 0.1-0.8 | |
| P1 Tables | `information_schema.TABLES` có đủ 4 bảng + `SHOW CREATE TABLE` khớp | |
| P2 Contracts columns/indexes | `COLUMNS/STATISTICS` có đủ 11 cột + 4 index | |
| P3A Contract_files columns/indexes | `COLUMNS/STATISTICS` có đủ 11 cột + 3 index | |
| P3B Data precheck | Query 3B trả 0 row rủi ro | |
| P3C Constraints | `TABLE_CONSTRAINTS` có đủ 5 constraint | |
| P3D Optional FK orphan prechecks | 3D.1-3D.8 trả 0 row orphan | |
| P4 Optional | Constraint nào đã add/skip/defer, có precheck orphan | |
| P5 Schema postcheck | SHOW CREATE + information_schema khớp | |
| Verify script | `20261123_contract_renewal_staging_verify.sql` pass | |

## 2. Precheck bắt buộc (Phase 0 - READ ONLY)
- [ ] 0.1 Xác nhận `DATABASE()`, version TiDB/MySQL, collation DB.
- [ ] 0.2-0.4 Lưu `SHOW CREATE TABLE contracts/contract_files`; snapshot `COLUMNS/STATISTICS/KEY_COLUMN_USAGE`.
- [ ] 0.5 Kiểm tra 4 bảng mới: nếu đã tồn tại, đối chiếu định nghĩa đầy đủ; khác định nghĩa = **STOP**.
- [ ] 0.5 Kiểm tra collision constraint/index đích. Nếu trùng tên khác nghĩa = **STOP**.
- [ ] 0.6 Kiểm tra `contract_files` legacy **chỉ bằng cột hiện có** (`contract_id, id,...`), không dùng `is_current/file_group_code/version_no/current_flag` trước Phase 3A.
  - [ ] `rows_per_contract > 1` => **STOP** trước Phase 3C. Không auto-fix data. Cần kế hoạch mapping thủ công ngoài migration.
  - [ ] `contract_files_rows == 0` hoặc mọi contract chỉ có 1 row => tiếp tục, vẫn phải chạy 3B sau 3A.
- [ ] 0.7 chỉ kiểm tra orphan bằng cột hiện có (contract_files.contract_id -> contracts.id). **Không** query cột chưa tạo (
eplaced_file_id/renewal_case_id/uploaded_by_user_id...).
- [ ] 3D (sau Phase 2/3A, trước Phase 4): chạy orphan precheck 3D.1-3D.8 cho FK optional mới; bất kỳ row trả về => STOP FK tương ứng.
- [ ] 0.8 Column collision check cho ADD COLUMN; nếu có cột trùng nghĩa khác = **STOP**.

## 3. Thứ tự chạy staging (bắt buộc)
1. **Phase 0**: chạy toàn bộ precheck read-only. Lưu output. Nếu bất kỳ STOP condition => dừng.
2. **Phase 1**: create 4 bảng mới. Postcheck Phase 1. Nếu bảng đã tồn tại với schema đúng => có thể skip, ghi rõ marker.
3. **Phase 2**: extend `contracts` (ADD COLUMN/INDEX IF NOT EXISTS). Postcheck Phase 2.
4. **Phase 3A**: extend `contract_files` columns/indexes. **Không add constraints ở bước này**. Postcheck 3A xác nhận có đủ cột mới, đặc biệt `is_current,file_group_code,version_no,current_flag`.
5. **Phase 3B**: chạy post-column data precheck (read-only). Nếu có bất kỳ row rủi ro/giá trị invalid => **STOP**, không chạy 3C. Không sửa/xóa dữ liệu trong migration.
6. **Phase 3C**: add constraint `contract_files` **từng câu một**. Trước mỗi câu: precheck `TABLE_CONSTRAINTS` theo tên. Nếu đã tồn tại + đúng nghĩa: skip. Nếu tồn tại + khác nghĩa: STOP. Nếu chưa tồn tại: chạy. Nếu lỗi: STOP, chẩn đoán, không chạy tiếp câu sau.
7. **Phase 3D**: chạy orphan precheck read-only 3D.1-3D.8 (sau Phase 2/3A, trước Phase 4). Bất kỳ row trả về => STOP trước FK tương ứng.`n8. **Phase 4**: optional hardening, staging only. Mỗi CHECK/FK guarded; trước mỗi FK rerun query 3D tương ứng + precheck constraint name. **Không bật production**. Không add `contract_files.contract_id -> contracts.id` khi chưa validate.
8. **Phase 5**: schema postcheck (SHOW CREATE, STATISTICS, TABLE_CONSTRAINTS, KEY_COLUMN_USAGE).
9. **Behavior verification**: chạy `backend/sql/20261123_contract_renewal_staging_verify.sql` trên staging bằng dữ liệu test, rollback/cleanup. Không chạy production.

## 4. STOP / RESUME
### STOP khi
- [ ] Bảng/cột/index/constraint đã tồn tại nhưng định nghĩa khác mong đợi.
- [ ] 0.6/3B phát hiện nguy cơ trùng `LEGACY_DEFAULT/version_no/current_flag` hoặc nhiều current/nhóm.
- [ ] Bất kỳ `ADD CONSTRAINT` fail.
- [ ] Postcheck thiếu object hoặc constraint không đúng.
- [ ] Có orphan khi chuẩn bị bật FK optional.
- [ ] Có nhu cầu sửa/xóa dữ liệu nghiệp vụ/quyền.

### RESUME sau chạy dở
- [ ] Xác định phase/statement cuối cùng PASS bằng information_schema + log.
- [ ] Không rerun toàn file. Chỉ chạy phase/statement còn lại sau precheck.
- [ ] `CREATE TABLE/ADD COLUMN/ADD INDEX IF NOT EXISTS`: chỉ rerun khi đã xác nhận định nghĩa mong muốn giống nhau.
- [ ] `ADD CONSTRAINT`: bắt buộc precheck theo tên; skip nếu exists+matches; STOP nếu exists+different.
- [ ] Ghi lại “RESUME FROM: <phase/statement>” trong log staging.

## 5. Xác nhận constraint thực sự được thực thi
- [ ] Schema có constraint: kiểm tra `information_schema.TABLE_CONSTRAINTS` và `SHOW CREATE TABLE`.
- [ ] Enforcement thực tế: chạy `20261123_contract_renewal_staging_verify.sql`.
  - [ ] `uk_cr_open_old_contract` chặn 2 case mở cùng `old_contract_id`.
  - [ ] `open_old_contract_id` generated NULL khi `is_open=0`, bằng `old_contract_id` khi `is_open=1`.
  - [ ] `uk_cra_current` chặn 2 assignment current cùng `(renewal_case_id,stage_code)`.
  - [ ] `current_flag` generated đúng cho assignment/file.
  - [ ] `uk_cf_group_ver` chặn trùng `version_no` trong cùng `(contract_id,file_group_code)`.
  - [ ] `uk_cf_group_current` chặn 2 file current trong cùng nhóm.
  - [ ] CHECK `chk_cr_is_open`, `chk_cra_is_current`, `chk_cf_is_current`, `chk_cf_current_flag`, `chk_cf_version_no`, `chk_crl_actor_type` từ chối giá trị invalid.
- [ ] Mọi test dùng transaction rollback/cleanup và để DB sạch sau verify.

## 6. Rollback an toàn (staging)
- [ ] Chỉ rollback thủ công khi chưa có dữ liệu nghiệp vụ mới phụ thuộc.
- [ ] Nếu đã có dữ liệu nghiệp vụ mới: **không DROP bảng/cột**. Giữ object additive, vô hiệu hóa tính năng ở tầng ứng dụng/release, xử lý theo incident/runbook riêng.
- [ ] Thứ tự drop nếu an toàn: Phase 4 FKs/checks -> Phase 3C constraints -> bảng mới theo thứ tự phụ thuộc ngược (`contract_renewal_logs`, `contract_renewal_assignment_histories`, `contract_renewal_assignments`, `contract_renewals`) -> cuối cùng xem xét index/cột additive chỉ khi chắc chắn không phụ thuộc.
- [ ] Không bao giờ xóa dữ liệu `contracts/contract_files/role_permissions`.

## 7. Quyết định phạm vi (giữ nguyên)
- [ ] FK optional: staging only; production chưa bật.
- [ ] `uploaded_by`: giữ nguyên, không backfill.
- [ ] Collation bảng mới: `utf8mb4_unicode_ci`; không đổi collation cũ.
- [ ] `role_permissions` orphan: không xử lý, tách audit riêng.
- [ ] Không thay đổi 12 bước / 6 kết quả cuối / 13 trường hợp đặc biệt.
