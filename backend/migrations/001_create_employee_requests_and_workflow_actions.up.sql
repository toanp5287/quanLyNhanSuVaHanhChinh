CREATE TABLE IF NOT EXISTS `employee_requests` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `employee_id` INT NOT NULL,
  `department_id` INT DEFAULT NULL,
  `request_type` VARCHAR(30) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `reason` TEXT NOT NULL,
  `start_date` DATE NOT NULL,
  `last_working_date` DATE DEFAULT NULL,
  `end_date` DATE DEFAULT NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  `submitted_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_er_employee` (`employee_id`, `status`),
  INDEX `idx_er_department` (`department_id`, `status`),
  INDEX `idx_er_status_created` (`status`, `created_at`),
  CONSTRAINT `fk_er_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_er_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `workflow_actions` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `entity_type` VARCHAR(30) NOT NULL,
  `entity_id` BIGINT NOT NULL,
  `actor_id` INT NOT NULL,
  `action` VARCHAR(50) NOT NULL,
  `from_status` VARCHAR(40) DEFAULT NULL,
  `to_status` VARCHAR(40) DEFAULT NULL,
  `comment` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_wa_entity` (`entity_type`, `entity_id`, `created_at`),
  INDEX `idx_wa_actor` (`actor_id`, `created_at`),
  INDEX `idx_wa_action` (`action`, `created_at`),
  CONSTRAINT `fk_wa_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
