import { db } from "../../config/database.js";
import { hasPermission } from "../../utils/helper.js";

const GRADE_LEVELS = ["C-LEVEL", "M1", "M2", "S1", "S2", "S3"];
const CODE_PATTERN = /^[A-Z0-9_-]{2,20}$/;

const normalizeText = (value) => String(value ?? "").trim();

const parsePositiveInt = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

const parseNonNegativeNumber = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const getDepartmentRows = async () => {
  const [rows] = await db.query(
    `SELECT
      d.id,
      d.parent_id,
      d.department_code,
      d.name,
      d.headcount_limit,
      COUNT(DISTINCT CASE WHEN e.work_status IN ('WORKING', 'MATERNITY') THEN e.id END) AS active_count,
      COUNT(DISTINCT p.id) AS position_count
    FROM departments d
    LEFT JOIN employees e ON e.department_id = d.id
    LEFT JOIN positions p ON p.department_id = d.id
    GROUP BY d.id, d.parent_id, d.department_code, d.name, d.headcount_limit
    ORDER BY d.id ASC`,
  );

  return rows.map((row) => ({
    ...row,
    id: Number(row.id),
    parent_id: row.parent_id === null ? null : Number(row.parent_id),
    headcount_limit: Number(row.headcount_limit || 0),
    active_count: Number(row.active_count || 0),
    position_count: Number(row.position_count || 0),
  }));
};

const getPositionRows = async () => {
  const [rows] = await db.query(
    `SELECT
      p.id,
      p.department_id,
      d.department_code,
      d.name AS department_name,
      p.position_code,
      p.title,
      p.grade_level,
      p.job_description,
      p.job_requirements,
      p.min_salary,
      p.max_salary,
      p.position_allowance
    FROM positions p
    LEFT JOIN departments d ON d.id = p.department_id
    ORDER BY p.department_id ASC, p.id ASC`,
  );

  return rows.map((row) => ({
    ...row,
    id: Number(row.id),
    department_id: Number(row.department_id),
    min_salary: Number(row.min_salary || 0),
    max_salary: Number(row.max_salary || 0),
    position_allowance: Number(row.position_allowance || 0),
  }));
};

const filterDepartmentsByScope = (user, departments) => {
  if (user.data_scope !== "DEPARTMENT") return departments;

  const ownDepartmentId = Number(user.department_id);
  if (!ownDepartmentId) return [];

  const allowedIds = new Set([ownDepartmentId]);
  let changed = true;

  while (changed) {
    changed = false;

    departments.forEach((department) => {
      if (
        department.parent_id !== null &&
        allowedIds.has(department.parent_id) &&
        !allowedIds.has(department.id)
      ) {
        allowedIds.add(department.id);
        changed = true;
      }
    });
  }

  return departments.filter((department) => allowedIds.has(department.id));
};

export const getOrganizationData = async (user) => {
  const canManage = hasPermission(user?.permissions, "HR.PROFILE_MANAGE");

  const [allDepartments, allPositions] = await Promise.all([
    getDepartmentRows(),
    getPositionRows(),
  ]);

  const departments = filterDepartmentsByScope(user, allDepartments);
  const departmentIds = new Set(departments.map((department) => department.id));
  const positions = allPositions.filter((position) =>
    departmentIds.has(position.department_id),
  );

  const summary = {
    departments: departments.length,
    positions: positions.length,
    active_employees: departments.reduce(
      (total, department) => total + department.active_count,
      0,
    ),
    headcount_limit: departments.reduce(
      (total, department) => total + department.headcount_limit,
      0,
    ),
  };

  summary.utilization_percent =
    summary.headcount_limit > 0
      ? Math.round((summary.active_employees / summary.headcount_limit) * 100)
      : 0;

  return {
    can_manage: canManage,
    data_scope: user.data_scope,
    summary,
    departments,
    positions,
    options: {
      departments: departments.map((department) => ({
        id: department.id,
        department_code: department.department_code,
        name: department.name,
      })),
      grade_levels: GRADE_LEVELS,
    },
  };
};

export const getDepartmentDetail = async (user, departmentId) => {
  if (user?.data_scope === "SELF") return null;

  const [allDepartments, allPositions] = await Promise.all([
    getDepartmentRows(),
    getPositionRows(),
  ]);

  const visibleIds = new Set(
    filterDepartmentsByScope(user, allDepartments).map((item) => item.id),
  );

  if (!visibleIds.has(departmentId)) return null;

  const department = allDepartments.find((item) => item.id === departmentId);
  if (!department) return null;

  const parent = department.parent_id
    ? allDepartments.find((item) => item.id === department.parent_id) || null
    : null;

  const children = allDepartments
    .filter((item) => item.parent_id === departmentId)
    .sort((a, b) => a.department_code.localeCompare(b.department_code));

  const positions = allPositions
    .filter((item) => item.department_id === departmentId)
    .sort((a, b) => a.position_code.localeCompare(b.position_code));

  const [members] = await db.query(
    `SELECT
      e.id,
      e.employee_code,
      e.full_name,
      e.gender,
      DATE_FORMAT(e.dob, '%Y-%m-%d') AS dob,
      e.phone,
      e.email,
      e.position_id,
      p.position_code,
      p.title AS position_title,
      p.grade_level,
      e.work_status,
      DATE_FORMAT(e.hire_date, '%Y-%m-%d') AS hire_date
    FROM employees e
    LEFT JOIN positions p ON p.id = e.position_id
    WHERE e.department_id = ?
      AND e.work_status IN ('WORKING', 'MATERNITY')
    ORDER BY e.employee_code ASC`,
    [departmentId],
  );

  return {
    department: {
      ...department,
      parent_code: parent?.department_code || null,
      parent_name: parent?.name || null,
    },
    members: members.map((member) => ({
      ...member,
      id: Number(member.id),
      position_id: member.position_id === null ? null : Number(member.position_id),
    })),
    positions,
    children,
  };
};

export const validateDepartmentPayload = (payload = {}) => {
  const departmentCode = normalizeText(payload.department_code).toUpperCase();
  if (!CODE_PATTERN.test(departmentCode)) {
    return {
      error:
        "Mã phòng ban phải từ 2-20 ký tự, chỉ gồm chữ in hoa, số, gạch ngang hoặc gạch dưới",
    };
  }

  const name = normalizeText(payload.name);
  if (!name) return { error: "Tên phòng ban không được để trống" };
  if (name.length > 100) {
    return { error: "Tên phòng ban không được vượt quá 100 ký tự" };
  }

  const parentId = parsePositiveInt(payload.parent_id);
  if (
    payload.parent_id !== undefined &&
    payload.parent_id !== null &&
    payload.parent_id !== "" &&
    !parentId
  ) {
    return { error: "Phòng ban cấp trên không hợp lệ" };
  }

  const headcountLimit =
    payload.headcount_limit === undefined ||
    payload.headcount_limit === null ||
    payload.headcount_limit === ""
      ? 0
      : Number(payload.headcount_limit);

  if (
    !Number.isInteger(headcountLimit) ||
    headcountLimit < 0 ||
    headcountLimit > 100000
  ) {
    return { error: "Định biên tối đa phải là số nguyên từ 0 đến 100.000" };
  }

  return {
    payload: {
      department_code: departmentCode,
      name,
      parent_id: parentId,
      headcount_limit: headcountLimit,
    },
  };
};

export const validatePositionPayload = (payload = {}) => {
  const departmentId = parsePositiveInt(payload.department_id);
  if (!departmentId) return { error: "Vui lòng chọn phòng ban" };

  const positionCode = normalizeText(payload.position_code).toUpperCase();
  if (!CODE_PATTERN.test(positionCode)) {
    return {
      error:
        "Mã chức vụ phải từ 2-20 ký tự, chỉ gồm chữ in hoa, số, gạch ngang hoặc gạch dưới",
    };
  }

  const title = normalizeText(payload.title);
  if (!title) return { error: "Tên chức vụ không được để trống" };
  if (title.length > 150) {
    return { error: "Tên chức vụ không được vượt quá 150 ký tự" };
  }

  const gradeLevel = normalizeText(payload.grade_level).toUpperCase();
  if (!GRADE_LEVELS.includes(gradeLevel)) {
    return { error: "Ngạch bậc không hợp lệ" };
  }

  const minSalary = parseNonNegativeNumber(payload.min_salary);
  const maxSalary = parseNonNegativeNumber(payload.max_salary);
  const positionAllowance = parseNonNegativeNumber(payload.position_allowance);

  if (minSalary === null || maxSalary === null) {
    return { error: "Khung lương không hợp lệ" };
  }

  if (maxSalary < minSalary) {
    return { error: "Lương tối đa phải lớn hơn hoặc bằng lương tối thiểu" };
  }

  if (positionAllowance === null) {
    return { error: "Phụ cấp chức vụ không hợp lệ" };
  }

  const jobDescription = normalizeText(payload.job_description);
  if (!jobDescription) return { error: "Mô tả công việc không được để trống" };
  if (jobDescription.length > 5000) {
    return { error: "Mô tả công việc không được vượt quá 5.000 ký tự" };
  }

  const jobRequirements = normalizeText(payload.job_requirements);
  if (!jobRequirements) {
    return { error: "Yêu cầu năng lực không được để trống" };
  }
  if (jobRequirements.length > 5000) {
    return { error: "Yêu cầu năng lực không được vượt quá 5.000 ký tự" };
  }

  return {
    payload: {
      department_id: departmentId,
      position_code: positionCode,
      title,
      grade_level: gradeLevel,
      job_description: jobDescription,
      job_requirements: jobRequirements,
      min_salary: minSalary,
      max_salary: maxSalary,
      position_allowance: positionAllowance,
    },
  };
};

const getVisibleDepartmentIds = async (user) => {
  if (user.data_scope === "SELF") return new Set();

  const departments = await getDepartmentRows();
  return new Set(
    filterDepartmentsByScope(user, departments).map(
      (department) => department.id,
    ),
  );
};

const getDescendantIds = (departments, departmentId) => {
  const descendants = new Set();
  let changed = true;

  while (changed) {
    changed = false;

    departments.forEach((department) => {
      if (
        department.parent_id !== null &&
        (department.parent_id === departmentId ||
          descendants.has(department.parent_id)) &&
        !descendants.has(department.id)
      ) {
        descendants.add(department.id);
        changed = true;
      }
    });
  }

  return descendants;
};

export const createDepartment = async (user, payload) => {
  const visibleIds = await getVisibleDepartmentIds(user);
  if (!visibleIds.size) return { notFound: true };

  const [duplicateRows] = await db.query(
    "SELECT id FROM departments WHERE department_code = ? LIMIT 1",
    [payload.department_code],
  );

  if (duplicateRows.length) return { duplicateCode: true };

  if (payload.parent_id) {
    const [parentRows] = await db.query(
      "SELECT id FROM departments WHERE id = ? LIMIT 1",
      [payload.parent_id],
    );

    if (!parentRows.length || !visibleIds.has(payload.parent_id)) {
      return { invalidParent: true };
    }
  }

  try {
    const [result] = await db.query(
      `INSERT INTO departments (parent_id, department_code, name, headcount_limit)
       VALUES (?, ?, ?, ?)`,
      [
        payload.parent_id,
        payload.department_code,
        payload.name,
        payload.headcount_limit,
      ],
    );

    return { success: true, department_id: result.insertId };
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return { duplicateCode: true };
    throw error;
  }
};

export const updateDepartment = async (user, departmentId, payload) => {
  const visibleIds = await getVisibleDepartmentIds(user);
  if (!visibleIds.size || !visibleIds.has(departmentId)) {
    return { notFound: true };
  }

  const [existingRows] = await db.query(
    "SELECT id FROM departments WHERE id = ? LIMIT 1",
    [departmentId],
  );

  if (!existingRows.length) return { notFound: true };

  const [duplicateRows] = await db.query(
    "SELECT id FROM departments WHERE department_code = ? AND id <> ? LIMIT 1",
    [payload.department_code, departmentId],
  );

  if (duplicateRows.length) return { duplicateCode: true };

  if (payload.parent_id) {
    if (payload.parent_id === departmentId) return { invalidParent: true };

    const [parentRows] = await db.query(
      "SELECT id FROM departments WHERE id = ? LIMIT 1",
      [payload.parent_id],
    );

    if (!parentRows.length || !visibleIds.has(payload.parent_id)) {
      return { invalidParent: true };
    }

    const departments = await getDepartmentRows();
    const descendants = getDescendantIds(departments, departmentId);

    if (descendants.has(payload.parent_id)) return { invalidParent: true };
  }

  try {
    await db.query(
      `UPDATE departments
       SET parent_id = ?, department_code = ?, name = ?, headcount_limit = ?
       WHERE id = ?`,
      [
        payload.parent_id,
        payload.department_code,
        payload.name,
        payload.headcount_limit,
        departmentId,
      ],
    );

    return { success: true, department_id: departmentId };
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return { duplicateCode: true };
    throw error;
  }
};

export const createPosition = async (user, payload) => {
  const visibleIds = await getVisibleDepartmentIds(user);
  if (!visibleIds.size || !visibleIds.has(payload.department_id)) {
    return { invalidDepartment: true };
  }

  const [duplicateRows] = await db.query(
    "SELECT id FROM positions WHERE position_code = ? LIMIT 1",
    [payload.position_code],
  );

  if (duplicateRows.length) return { duplicateCode: true };

  try {
    const [result] = await db.query(
      `INSERT INTO positions
        (department_id, position_code, title, grade_level, job_description,
         job_requirements, min_salary, max_salary, position_allowance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.department_id,
        payload.position_code,
        payload.title,
        payload.grade_level,
        payload.job_description,
        payload.job_requirements,
        payload.min_salary,
        payload.max_salary,
        payload.position_allowance,
      ],
    );

    return { success: true, position_id: result.insertId };
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return { duplicateCode: true };
    throw error;
  }
};

export const updatePosition = async (user, positionId, payload) => {
  const visibleIds = await getVisibleDepartmentIds(user);
  if (!visibleIds.size) return { notFound: true };

  const [existingRows] = await db.query(
    "SELECT id, department_id FROM positions WHERE id = ? LIMIT 1",
    [positionId],
  );

  if (
    !existingRows.length ||
    !visibleIds.has(Number(existingRows[0].department_id))
  ) {
    return { notFound: true };
  }

  if (!visibleIds.has(payload.department_id)) {
    return { invalidDepartment: true };
  }

  const [duplicateRows] = await db.query(
    "SELECT id FROM positions WHERE position_code = ? AND id <> ? LIMIT 1",
    [payload.position_code, positionId],
  );

  if (duplicateRows.length) return { duplicateCode: true };

  try {
    await db.query(
      `UPDATE positions
       SET department_id = ?, position_code = ?, title = ?, grade_level = ?,
           job_description = ?, job_requirements = ?, min_salary = ?,
           max_salary = ?, position_allowance = ?
       WHERE id = ?`,
      [
        payload.department_id,
        payload.position_code,
        payload.title,
        payload.grade_level,
        payload.job_description,
        payload.job_requirements,
        payload.min_salary,
        payload.max_salary,
        payload.position_allowance,
        positionId,
      ],
    );

    return { success: true, position_id: positionId };
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return { duplicateCode: true };
    throw error;
  }
};
