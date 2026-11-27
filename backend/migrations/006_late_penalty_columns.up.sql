ALTER TABLE attendances ADD COLUMN final_workday DECIMAL(3,2) NOT NULL DEFAULT 0.00;
ALTER TABLE attendances ADD COLUMN penalty_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE attendances ADD COLUMN penalty_note VARCHAR(255) NULL;

UPDATE attendances
   SET final_workday = COALESCE(base_workday, 0.00)
 WHERE final_workday = 0.00 AND COALESCE(base_workday, 0) > 0;

ALTER TABLE monthly_timesheets ADD COLUMN total_late_penalty DECIMAL(12,2) NOT NULL DEFAULT 0.00;
