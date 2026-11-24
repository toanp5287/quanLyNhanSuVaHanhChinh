CREATE TABLE IF NOT EXISTS authorized_devices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_name VARCHAR(120) NOT NULL,
  device_code VARCHAR(50) NULL,
  auth_mode ENUM('IP','DEVICE_TOKEN','BOTH') NOT NULL DEFAULT 'BOTH',
  ip_address VARCHAR(64) NULL,
  mac_address VARCHAR(32) NULL,
  device_token_hash VARCHAR(255) NULL,
  location VARCHAR(120) NULL,
  note TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  allow_face_enroll TINYINT(1) NOT NULL DEFAULT 0,
  last_used_at DATETIME NULL,
  last_ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  created_by INT NULL,
  updated_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_authorized_devices_code (device_code),
  UNIQUE KEY uk_authorized_devices_token (device_token_hash),
  KEY idx_authorized_devices_active (is_active),
  KEY idx_authorized_devices_ip (ip_address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS allowed_devices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_name VARCHAR(100) NOT NULL,
  device_token_hash CHAR(64) NOT NULL UNIQUE,
  allow_attendance TINYINT(1) NOT NULL DEFAULT 1,
  allow_face_enroll TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  mac_note VARCHAR(32) NULL,
  user_agent VARCHAR(255) NULL,
  approved_by INT NULL,
  last_used_at DATETIME NULL,
  last_ip VARCHAR(45) NULL,
  note VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_allowed_devices_flags (is_active, allow_attendance, allow_face_enroll)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO authorized_devices (
  id, device_name, auth_mode, mac_address, device_token_hash, location,
  note, is_active, allow_face_enroll, last_used_at, last_ip, user_agent,
  created_by, created_at, updated_at
)
SELECT
  old.id,
  old.device_name,
  CASE WHEN old.device_token_hash IS NULL THEN 'IP' ELSE 'DEVICE_TOKEN' END,
  old.mac_note,
  old.device_token_hash,
  NULL,
  old.note,
  CASE WHEN old.is_active = 1 AND old.allow_attendance = 1 THEN 1 ELSE 0 END,
  old.allow_face_enroll,
  old.last_used_at,
  old.last_ip,
  old.user_agent,
  old.approved_by,
  old.created_at,
  old.updated_at
FROM allowed_devices old
WHERE NOT EXISTS (SELECT 1 FROM authorized_devices ad WHERE ad.id = old.id);
