import { db } from "../../config/database.js";
import { buildEmployeeScope } from "../../utils/helper.js";

export const getEmployeesByScope = async (user) => {
  const { clause, params } = buildEmployeeScope(user);

  const [rows] = await db.query(
    `SELECT
       e.id,
       e.employee_code,
       e.full_name,
       e.gender,
       e.dob,
       e.phone,
       e.email,
       e.address,
       e.base_salary,
       e.insurance_salary,
       e.work_status,
       e.hire_date,
       d.id AS department_id,
       d.department_code,
       d.name AS department_name,
       p.id AS position_id,
       p.position_code,
       p.title AS position_title,
       p.grade_level
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN positions p ON p.id = e.position_id
     ${clause}
     ORDER BY e.employee_code ASC`,
    params,
  );

  return rows;
};
