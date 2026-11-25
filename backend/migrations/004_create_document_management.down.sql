ALTER TABLE `documents` DROP FOREIGN KEY `fk_doc_current_version`;
ALTER TABLE `document_versions` DROP FOREIGN KEY `fk_dv_restored_from`;

DROP TABLE IF EXISTS `document_files`;
DROP TABLE IF EXISTS `document_versions`;
DROP TABLE IF EXISTS `documents`;
