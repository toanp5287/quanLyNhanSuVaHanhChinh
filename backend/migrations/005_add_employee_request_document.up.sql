ALTER TABLE `employee_requests`
  ADD COLUMN `document_id` BIGINT DEFAULT NULL AFTER `reason`,
  ADD COLUMN `document_title` VARCHAR(255) DEFAULT NULL AFTER `document_id`,
  ADD COLUMN `document_template_code` VARCHAR(50) DEFAULT NULL AFTER `document_title`,
  ADD COLUMN `document_content_json` LONGTEXT DEFAULT NULL AFTER `document_template_code`,
  ADD COLUMN `document_content_html` LONGTEXT DEFAULT NULL AFTER `document_content_json`;
