import { db } from "../src/config/database.js";

const hasColumn = async (tableName, columnName) => {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [tableName, columnName],
  );
  return Number(rows[0]?.total) > 0;
};

const hasTable = async (tableName) => {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?`,
    [tableName],
  );
  return Number(rows[0]?.total) > 0;
};

const hasIndex = async (tableName, indexName) => {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?`,
    [tableName, indexName],
  );
  return Number(rows[0]?.total) > 0;
};

const addColumnIfMissing = async (tableName, columnName, definition) => {
  if (await hasColumn(tableName, columnName)) {
    console.log(`Giữ nguyên cột ${tableName}.${columnName}`);
    return;
  }
  await db.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
  console.log(`Đã thêm cột ${tableName}.${columnName}`);
};

const addIndexIfMissing = async (tableName, indexName, columns) => {
  if (await hasIndex(tableName, indexName)) {
    console.log(`Giữ nguyên index ${tableName}.${indexName}`);
    return;
  }
  await db.query(
    `ALTER TABLE \`${tableName}\` ADD INDEX \`${indexName}\` (${columns})`,
  );
  console.log(`Đã thêm index ${tableName}.${indexName}`);
};

const addUniqueIndexIfMissing = async (tableName, indexName, columnName) => {
  if (await hasIndex(tableName, indexName)) {
    console.log(`Giữ nguyên index ${tableName}.${indexName}`);
    return;
  }
  await db.query(
    `ALTER TABLE \`${tableName}\` ADD UNIQUE INDEX \`${indexName}\` (\`${columnName}\`)`,
  );
  console.log(`Đã thêm index ${tableName}.${indexName}`);
};

const ensureAuthorizedDevicesTable = async () => {
  await db.query(
    `CREATE TABLE IF NOT EXISTS authorized_devices (
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
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
  await addUniqueIndexIfMissing("authorized_devices", "uk_authorized_devices_code", "device_code");
  await addUniqueIndexIfMissing("authorized_devices", "uk_authorized_devices_token", "device_token_hash");
  await addIndexIfMissing("authorized_devices", "idx_authorized_devices_active", "is_active");
  await addIndexIfMissing("authorized_devices", "idx_authorized_devices_ip", "ip_address");
  console.log("Đã đảm bảo bảng authorized_devices");

  if (await hasTable("allowed_devices")) {
    const [rows] = await db.query(
      `SELECT COUNT(*) AS total
         FROM allowed_devices old
        WHERE NOT EXISTS (SELECT 1 FROM authorized_devices ad WHERE ad.id = old.id)`,
    );
    const missing = Number(rows[0]?.total) || 0;
    if (missing > 0) {
      await db.query(
        `INSERT IGNORE INTO authorized_devices
           (id, device_name, auth_mode, mac_address, device_token_hash, location,
            note, is_active, allow_face_enroll, last_used_at, last_ip, user_agent,
            created_by, created_at, updated_at)
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
          WHERE NOT EXISTS (SELECT 1 FROM authorized_devices ad WHERE ad.id = old.id)`,
      );
      console.log(`Đã chuyển ${missing} thiết bị cũ sang authorized_devices`);
    }
  }
};

export const runDeviceSecurityMigration = async () => {
  await db.query(
    `CREATE TABLE IF NOT EXISTS allowed_devices (
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
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
  console.log("Đã đảm bảo bảng allowed_devices");

  await db.query(
    `CREATE TABLE IF NOT EXISTS attendance_security_settings (
       id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
       require_device_check TINYINT(1) NOT NULL DEFAULT 1,
       require_ip_check TINYINT(1) NOT NULL DEFAULT 0,
       allowed_ips JSON NOT NULL,
       updated_by INT NULL,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
  await db.query(
    `INSERT IGNORE INTO attendance_security_settings
       (id, require_device_check, require_ip_check, allowed_ips)
     VALUES (1, 1, 0, JSON_ARRAY())`,
  );
  console.log("Đã đảm bảo bảng attendance_security_settings");

  await ensureAuthorizedDevicesTable();

  await addColumnIfMissing("attendance_logs", "device_id", "INT NULL");
  await addColumnIfMissing("attendance_logs", "client_ip", "VARCHAR(45) NULL");
  await addIndexIfMissing(
    "attendance_logs",
    "idx_attendance_logs_device_id",
    "device_id",
  );

  await addColumnIfMissing("employees", "device_id", "INT NULL");
  await addColumnIfMissing("employees", "client_ip", "VARCHAR(45) NULL");
  await addIndexIfMissing("employees", "idx_employees_device_id", "device_id");

  console.log("Migration khóa thiết bị hoàn tất");
};

const isDirectRun = process.argv[1] && /migrate-device-security\.js$/.test(process.argv[1]);

if (isDirectRun) {
  runDeviceSecurityMigration()
    .then(async () => {
      await db.end();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error("Migration khóa thiết bị thất bại:", error);
      await db.end().catch(() => undefined);
      process.exit(1);
    });
}
