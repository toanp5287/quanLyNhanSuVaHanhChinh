import { db } from "../../config/database.js";

const ROLE_ORDER = [
  "SUPER_ADMIN",
  "DIRECTOR",
  "HR_ADMIN",
  "MANAGER",
  "CB_PAYROLL",
  "OFFICE_ADMIN",
  "EMPLOYEE",
];

const MODULE_LABELS = {
  M00_SYSTEM: "Hệ thống & Tài khoản",
  M01_HR: "Hồ sơ & Hợp đồng",
  M02_ATTENDANCE: "Chấm công & Giải trình",
  M03_LEAVE: "Nghỉ phép",
  M04_INSURANCE: "Bảo hiểm & Chế độ",
  M05_P3_SALARY: "Lương hiệu quả P3",
  M06_PAYROLL: "Tiền lương & Thuế",
  M07_RECRUIT: "Tuyển dụng & Onboard",
  M08_TRAINING: "Đào tạo",
  M09_EVAL: "Đánh giá nhân viên",
  M10_ASSET: "Trang thiết bị & Tài sản",
  M12_BI: "Báo cáo quản trị (BI)",
};

const serviceError = (message, status = 400, code = null) =>
  Object.assign(new Error(message), { status, code });

const normalizeModuleCode = (moduleCode) =>
  String(moduleCode || "").trim() === "HR" ? "M01_HR" : String(moduleCode || "").trim();

const moduleLabel = (moduleCode) => MODULE_LABELS[moduleCode] || moduleCode || "Khác";

const sortRoles = (roles) =>
  roles.sort((a, b) => {
    const indexA = ROLE_ORDER.indexOf(a.id);
    const indexB = ROLE_ORDER.indexOf(b.id);

    if (indexA === -1 && indexB === -1) return String(a.name).localeCompare(String(b.name));
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

const ensureRole = async (connection, roleId) => {
  const [rows] = await connection.query("SELECT id FROM roles WHERE id = ? LIMIT 1", [roleId]);
  if (!rows.length) throw serviceError("Không tìm thấy vai trò", 404, "ROLE_NOT_FOUND");
};

export const getPermissionMatrix = async () => {
  const [roleRows] = await db.query(
    `SELECT r.id, r.name, r.data_scope, r.description,
            (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id AND u.is_active = 1) AS user_count
       FROM roles r`,
  );

  const [permissionRows] = await db.query(
    `SELECT id, module_code, permission_code, name, action
       FROM permissions
      ORDER BY module_code ASC, id ASC`,
  );

  const [mappingRows] = await db.query(
    `SELECT role_id, permission_id FROM role_permissions`,
  );

  const matrix = {};
  roleRows.forEach((role) => {
    matrix[role.id] = [];
  });

  mappingRows.forEach((row) => {
    if (matrix[row.role_id]) matrix[row.role_id].push(row.permission_id);
  });

  const permissions = permissionRows.map((permission) => ({
    ...permission,
    module_code: normalizeModuleCode(permission.module_code),
  }));

  const modulesMap = new Map();
  permissions.forEach((permission) => {
    if (!modulesMap.has(permission.module_code)) {
      modulesMap.set(permission.module_code, []);
    }
    modulesMap.get(permission.module_code).push(permission);
  });

  const modules = Array.from(modulesMap.entries()).map(([moduleCode, items]) => ({
    module_code: moduleCode,
    module_label: moduleLabel(moduleCode),
    permissions: items,
  }));

  const roles = sortRoles(
    roleRows.map((role) => ({
      id: role.id,
      name: role.name,
      data_scope: role.data_scope,
      description: role.description,
      user_count: Number(role.user_count || 0),
      is_locked: role.id === "SUPER_ADMIN",
      permission_ids: matrix[role.id] || [],
    })),
  );

  return {
    roles,
    modules,
    matrix,
    permissions,
    totals: {
      roles: roles.length,
      permissions: permissions.length,
      assignments: mappingRows.length,
    },
  };
};

export const updateRolePermissions = async (roleId, permissionIds) => {
  if (roleId === "SUPER_ADMIN") {
    throw serviceError("Không thể chỉnh sửa quyền của SUPER_ADMIN", 403, "SUPER_ADMIN_LOCKED");
  }

  const connection = await db.getConnection();
  let transactionStarted = false;

  try {
    await ensureRole(connection, roleId);

    const ids = [...new Set((Array.isArray(permissionIds) ? permissionIds : []).map(String).filter(Boolean))];

    if (ids.length) {
      const placeholders = ids.map(() => "?").join(", ");
      const [validRows] = await connection.query(
        `SELECT id FROM permissions WHERE id IN (${placeholders})`,
        ids,
      );
      if (validRows.length !== ids.length) {
        throw serviceError("Có quyền không tồn tại trong hệ thống", 400, "INVALID_PERMISSION_ID");
      }
    }

    await connection.beginTransaction();
    transactionStarted = true;
    await connection.query("DELETE FROM role_permissions WHERE role_id = ?", [roleId]);

    if (ids.length) {
      const values = ids.map((permissionId) => [roleId, permissionId]);
      await connection.query(
        "INSERT INTO role_permissions (role_id, permission_id) VALUES ?",
        [values],
      );
    }

    await connection.commit();
    return { role_id: roleId, permission_ids: ids };
  } catch (error) {
    if (transactionStarted) await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
};

export const updateRoleScope = async (roleId, dataScope) => {
  if (roleId === "SUPER_ADMIN") {
    throw serviceError("Không thể chỉnh sửa phạm vi của SUPER_ADMIN", 403, "SUPER_ADMIN_LOCKED");
  }

  const connection = await db.getConnection();

  try {
    await ensureRole(connection, roleId);
    await connection.query("UPDATE roles SET data_scope = ? WHERE id = ?", [dataScope, roleId]);
    return { role_id: roleId, data_scope: dataScope };
  } finally {
    connection.release();
  }
};
