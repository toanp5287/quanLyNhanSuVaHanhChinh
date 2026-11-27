import { hasAnyPermission, hasPermission } from "../services/auth.service.js";

export const UI_PERMISSIONS = {
  system: ["SYS.USER_MANAGE"],
  employeeList: ["HR.PROFILE_VIEW"],
  organization: ["HR.PROFILE_VIEW"],
  attendance: ["ATT.VIEW"],
  shiftManagement: ["ATT.SHIFT_OT_MANAGE", "ATT.VIEW"],
  selfService: ["ESS.SELF_PROFILE"],
  contracts: ["HR.CONTRACT_MANAGE", "HR.CONTRACT_SIGN"],
  requests: ["ESS.SELF_PROFILE", "LEAVE.APPROVE", "HR.PROFILE_MANAGE"],
  approvals: [
    "LEAVE.APPROVE",
    "HR.PROFILE_MANAGE",
    "ATT.SHIFT_OT_MANAGE",
    "ATT.LATE_EXPLAIN_APPROVE",
    "ATT.LATE_EXPLAIN_HR_VERIFY",
    "PAY.RUN_PAYROLL",
    "P3.CALCULATE_APPROVE",
  ],
  lateExplanation: [
    "ATT.LATE_EXPLAIN_SELF",
    "ATT.LATE_EXPLAIN_APPROVE",
    "ATT.LATE_EXPLAIN_HR_VERIFY",
    "ATT.LATE_EXPLAIN_POLICY",
  ],
};

export const getUiAccess = (user) => {
  const isSelfScope = user?.data_scope === "SELF";
  const canManageSystem = hasPermission("SYS.USER_MANAGE", user);

  return {
    canManageSystem,
    canManageDevices: canManageSystem,
    canViewEmployees: hasPermission("HR.PROFILE_VIEW", user) && !isSelfScope,
    canViewOrganization: hasPermission("HR.PROFILE_VIEW", user) && !isSelfScope,
    canViewAttendance: hasPermission("ATT.VIEW", user),
    canManageShifts: hasAnyPermission(UI_PERMISSIONS.shiftManagement, user),
    canViewOwnProfile: hasPermission("ESS.SELF_PROFILE", user),
    canViewContracts: hasAnyPermission(UI_PERMISSIONS.contracts, user),
    canAccessRequests: hasAnyPermission(UI_PERMISSIONS.requests, user),
    canApproveRequests:
      hasAnyPermission(UI_PERMISSIONS.approvals, user) && !isSelfScope,
    canUseLateExplanation: hasAnyPermission(UI_PERMISSIONS.lateExplanation, user),
    canUseDocumentEditor: Boolean(user),
    canViewInformation: Boolean(user),
    isSelfScope,
  };
};
