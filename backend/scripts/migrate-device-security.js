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
