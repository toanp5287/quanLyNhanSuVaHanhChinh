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

const addColumnIfMissing = async (tableName, columnName, definition) => {
  if (await hasColumn(tableName, columnName)) {
    console.log(`Giữ nguyên cột ${tableName}.${columnName}`);
    return;
  }
  await db.query(
    `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`,
  );
  console.log(`Đã thêm cột ${tableName}.${columnName}`);
};

const main = async () => {
  await addColumnIfMissing(
    "employee_requests",
    "document_id",
    "BIGINT DEFAULT NULL AFTER `reason`",
  );
  await addColumnIfMissing(
    "employee_requests",
    "document_title",
    "VARCHAR(255) DEFAULT NULL AFTER `document_id`",
  );
  await addColumnIfMissing(
    "employee_requests",
    "document_template_code",
    "VARCHAR(50) DEFAULT NULL AFTER `document_title`",
  );
  await addColumnIfMissing(
    "employee_requests",
    "document_content_json",
    "LONGTEXT DEFAULT NULL AFTER `document_template_code`",
  );
  await addColumnIfMissing(
    "employee_requests",
    "document_content_html",
    "LONGTEXT DEFAULT NULL AFTER `document_content_json`",
  );
  console.log("Hoàn tất migration cột văn bản đính kèm cho đơn từ.");
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Migration thất bại:", error);
    process.exit(1);
  });
