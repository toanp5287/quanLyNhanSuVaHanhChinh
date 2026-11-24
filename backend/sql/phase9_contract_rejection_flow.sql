ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS rejected_by INT NULL,
  ADD COLUMN IF NOT EXISTS rejected_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS revision_request TEXT NULL;

ALTER TABLE contract_files
  ADD COLUMN IF NOT EXISTS version_no INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source_key VARCHAR(255) NULL;

ALTER TABLE contract_submission_history
  ADD COLUMN IF NOT EXISTS approver_id INT NULL,
  ADD COLUMN IF NOT EXISTS approved_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS rejected_by INT NULL,
  ADD COLUMN IF NOT EXISTS rejected_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS revision_request TEXT NULL,
  ADD COLUMN IF NOT EXISTS previous_rejection_reason TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_approval_status ON contracts (approval_status);
CREATE INDEX IF NOT EXISTS idx_contract_files_version ON contract_files (contract_id, version_no);
