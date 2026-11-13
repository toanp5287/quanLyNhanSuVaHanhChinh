// Các hàm dùng chung cho dự án

export const hasPermission = (permissions, permissionCode) => {
  if (!Array.isArray(permissions) || !permissionCode) return false;
  return permissions.includes(permissionCode);
};

export const hasAnyPermission = (permissions, permissionCodes = []) => {
  return permissionCodes.some((code) => hasPermission(permissions, code));
};

export const buildEmployeeScope = (user) => {
  if (!user) {
    return { clause: "WHERE 1 = 0", params: [] };
  }

  switch (user.data_scope) {
    case "ALL":
      return { clause: "", params: [] };
    case "DEPARTMENT":
      return {
        clause: user.department_id ? "WHERE e.department_id = ?" : "WHERE 1 = 0",
        params: user.department_id ? [user.department_id] : [],
      };
    case "SELF":
      return {
        clause: user.employee_id ? "WHERE e.id = ?" : "WHERE 1 = 0",
        params: user.employee_id ? [user.employee_id] : [],
      };
    default:
      return { clause: "WHERE 1 = 0", params: [] };
  }
};

export const canViewSalary = (user) => {
  if (!user) return false;

  if (hasPermission(user.permissions, "PAY.RUN_PAYROLL")) return true;
  if (hasPermission(user.permissions, "HR.PROFILE_MANAGE")) return true;

  return user.data_scope === "SELF";
};

export const toPublicUser = (row) => {
  if (!row) return null;

  return {
    user_id: row.user_id,
    username: row.username,
    is_active: row.is_active,
    last_login: row.last_login,
    role_id: row.role_id,
    role_name: row.role_name,
    data_scope: row.data_scope,
    employee_id: row.employee_id,
    employee_code: row.employee_code,
    full_name: row.full_name,
    gender: row.gender,
    dob: row.dob,
    phone: row.phone,
    email: row.email,
    address: row.address,
    citizen_id: row.citizen_id,
    tax_code: row.tax_code,
    base_salary: row.base_salary,
    insurance_salary: row.insurance_salary,
    meal_fuel_allowance: row.meal_fuel_allowance,
    dependents_count: row.dependents_count,
    bank_account: row.bank_account,
    bank_name: row.bank_name,
    hire_date: row.hire_date,
    resign_date: row.resign_date,
    work_status: row.work_status,
    department_id: row.department_id,
    department_code: row.department_code,
    department_name: row.department_name,
    position_id: row.position_id,
    position_code: row.position_code,
    position_title: row.position_title,
    grade_level: row.grade_level,
    permissions: row.permissions || [],
  };
};
