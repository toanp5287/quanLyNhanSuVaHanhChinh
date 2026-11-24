INSERT IGNORE INTO permissions (id, module_code, permission_code, name, action)
VALUES ('P26', 'HR', 'HR.CONTRACT_SIGN', 'Ký hợp đồng lao động sau khi được phê duyệt', 'EXECUTE');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
VALUES
  ('CB_PAYROLL', 'P26'),
  ('OFFICE_ADMIN', 'P26'),
  ('SUPER_ADMIN', 'P26');

ALTER TABLE contract_approval_logs
  MODIFY action ENUM(
    'CREATE',
    'EDIT_SAVE_DOCX',
    'SUBMIT_APPROVAL',
    'DIRECTOR_APPROVE',
    'DIRECTOR_REJECT',
    'SIGN_OFFICIAL',
    'SIGN_REVISION_REQUEST',
    'TERMINATE',
    'FILE_UPLOAD',
    'FILE_REPLACE',
    'FILE_DELETE'
  ) NOT NULL;

CREATE TABLE IF NOT EXISTS contract_signatures (
  id BIGINT NOT NULL AUTO_INCREMENT,
  contract_id INT NOT NULL,
  contract_code VARCHAR(30) NOT NULL,
  employee_id INT NOT NULL,
  submission_id BIGINT NOT NULL,
  file_id INT NOT NULL,
  version_no INT NOT NULL,
  signer_id INT NOT NULL,
  signer_role VARCHAR(30) NOT NULL,
  signer_name VARCHAR(150) NOT NULL,
  signed_at DATETIME NOT NULL,
  result VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
  signature_method VARCHAR(40) NOT NULL DEFAULT 'INTERNAL_CONFIRMATION',
  transaction_ref VARCHAR(100) DEFAULT NULL,
  official_file_path VARCHAR(500) NOT NULL,
  official_file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_contract_signatures_submission (submission_id),
  UNIQUE KEY uk_contract_signatures_contract_version (contract_id, version_no),
  KEY idx_contract_signatures_contract (contract_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
