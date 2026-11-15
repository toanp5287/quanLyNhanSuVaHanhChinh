import {
  getEmployeeFilterOptions,
  getEmployeeList,
  getEmployeeSummary,
  validateEmployeeFilters,
} from "../../services/employees/employees.service.js";
import { canViewSalary } from "../../utils/helper.js";

export const listEmployees = async (req, res) => {
  const { filters, error } = validateEmployeeFilters(req.query);

  if (error) {
    return res.status(400).json({ success: false, message: error });
  }

  try {
    const user = req.user;

    const [employees, summary, options] = await Promise.all([
      getEmployeeList(user, filters),
      getEmployeeSummary(user),
      getEmployeeFilterOptions(),
    ]);

    const showSalary = canViewSalary(user);

    const data = employees.map((employee) => {
      if (showSalary) return employee;

      const { base_salary, ...rest } = employee;
      return rest;
    });

    return res.status(200).json({
      success: true,
      data_scope: user.data_scope,
      show_salary: showSalary,
      total: data.length,
      summary,
      filters: options,
      employees: data,
    });
  } catch (error) {
    console.error("Lỗi lấy danh sách nhân sự:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra khi lấy danh sách nhân sự",
    });
  }
};
