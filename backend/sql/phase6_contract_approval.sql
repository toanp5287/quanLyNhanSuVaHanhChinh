ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' AFTER status;

CREATE TABLE IF NOT EXISTS contract_submission_history (
  id BIGINT NOT NULL AUTO_INCREMENT,
  contract_id INT NOT NULL,
  employee_id INT NOT NULL,
  submitted_by INT NOT NULL,
  submitted_at DATETIME NOT NULL,
  status VARCHAR(30) NOT NULL,
  version_id INT NOT NULL,
  approval_round INT NOT NULL,
  note TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_contract_submission_round (contract_id, approval_round),
  KEY idx_contract_submission_status (contract_id, status)
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT NOT NULL AUTO_INCREMENT,
  recipient_user_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id INT NOT NULL,
  event_key VARCHAR(120) NOT NULL,
  payload JSON NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_notification_event (recipient_user_id, event_key),
  KEY idx_notification_recipient_created (recipient_user_id, created_at DESC)
);
