import { db } from "../../config/database.js";

const ROLE_ORDER = [
  "SUPER_ADMIN",
  "DIRECTOR",
  "HR_ADMIN",
  "CB_PAYROLL",
  "OFFICE_ADMIN",
  "MANAGER",
  "EMPLOYEE",
];

const PROTECTED_PERMISSION = "P01";

const sortRoles = (roles) => {
  return roles.sort((a, b) => {
    const indexA = ROLE_ORDER.indexOf(a.id);
    const indexB = ROLE_ORDER.indexOf(b.id);

    if (indexA === -1 && indexB === -1) return a.name.localeCompare(b.name);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;

    return indexA - indexB;
  });
};

export const getPermissionMatrix = async () => {
  const [roleRows] = await db.query(
    `SELECT
       r.id,
       r.name,
       r.data_scope,
       r.description,
       (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS user_count
     FROM roles r`,
  );

  const [permissionRows] = await db.query(
    `SELECT id, module_code, permission_code, name, action
     FROM permissions
     ORDER BY id`,
  );

  const [mappingRows] = await db.query(
    `SELECT role_id, permission_id FROM role_permissions`,
  );

  const permissionsByRole = new Map();

  mappingRows.forEach((row) => {
    if (!permissionsByRole.has(row.role_id)) {
      permissionsByRole.set(row.role_id, []);
    }

    permissionsByRole.get(row.role_id).push(row.permission_id);
  });

  const roles = sortRoles(
    roleRows.map((role) => ({
      ...role,
      user_count: Number(role.user_count),
      permission_ids: permissionsByRole.get(role.id) || [],
    })),
  );

  return {
    roles,
    permissions: permissionRows,
    totals: {
      roles: roles.length,
      permissions: permissionRows.length,
      assignments: mappingRows.length,
    },
  };
};

export const updateRolePermissions = async (roleId, permissionIds) => {
  const [roleRows] = await db.query("SELECT id FROM roles WHERE id = ? LIMIT 1", [
    roleId,
  ]);

  if (!roleRows.length) {
    return { notFound: true };
  }

  const ids = [
    ...new Set(
      (Array.isArray(permissionIds) ? permissionIds : [])
        .map((id) => String(id).trim())
        .filter(Boolean),
    ),
  ];

  if (roleId === "SUPER_ADMIN" && !ids.includes(PROTECTED_PERMISSION)) {
    ids.push(PROTECTED_PERMISSION);
  }

  if (ids.length) {
    const placeholders = ids.map(() => "?").join(", ");
    const [validRows] = await db.query(
      `SELECT id FROM permissions WHERE id IN (${placeholders})`,
      ids,
    );

    if (validRows.length !== ids.length) {
      return { invalid: true };
    }
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    await connection.query("DELETE FROM role_permissions WHERE role_id = ?", [
      roleId,
    ]);

    if (ids.length) {
      const values = ids.map((permissionId) => [roleId, permissionId]);
      await connection.query(
        "INSERT INTO role_permissions (role_id, permission_id) VALUES ?",
        [values],
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return { role_id: roleId, permission_ids: ids };
};
