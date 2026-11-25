CREATE TABLE IF NOT EXISTS `request_information_requests` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `request_id` BIGINT NOT NULL,
  `requested_by` INT NOT NULL,
  `content` TEXT NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  `requested_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `responded_at` DATETIME DEFAULT NULL,
  `response_note` TEXT DEFAULT NULL,
  INDEX `idx_rir_request` (`request_id`, `status`),
  INDEX `idx_rir_requested_by` (`requested_by`, `requested_at`),
  CONSTRAINT `fk_rir_request` FOREIGN KEY (`request_id`) REFERENCES `employee_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rir_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
