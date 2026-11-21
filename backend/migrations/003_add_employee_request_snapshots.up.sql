ALTER TABLE `employee_requests` ADD COLUMN `employee_code_snapshot` VARCHAR(50) DEFAULT NULL AFTER `department_id`;
ALTER TABLE `employee_requests` ADD COLUMN `full_name_snapshot` VARCHAR(255) DEFAULT NULL AFTER `employee_code_snapshot`;
ALTER TABLE `employee_requests` ADD COLUMN `department_name_snapshot` VARCHAR(255) DEFAULT NULL AFTER `full_name_snapshot`;

UPDATE `employee_requests` r
LEFT JOIN `employees` e ON e.id = r.employee_id
LEFT JOIN `departments` d ON d.id = r.department_id
SET r.employee_code_snapshot = e.employee_code,
    r.full_name_snapshot = e.full_name,
    r.department_name_snapshot = COALESCE(d.department_name, d.name)
WHERE r.employee_code_snapshot IS NULL
   OR r.full_name_snapshot IS NULL
   OR r.department_name_snapshot IS NULL;
