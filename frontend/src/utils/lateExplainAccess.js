export function buildLateExplainAccess(user, { hasActiveDelegation = false } = {}) {
  const perms = new Set(user?.permissions || []);
  const roleId = user?.role_id;
  const isDirector = roleId === "DIRECTOR";

  const canSelf = perms.has("ATT.LATE_EXPLAIN_SELF");
  const canApprove =
    perms.has("ATT.LATE_EXPLAIN_APPROVE") || hasActiveDelegation;
  const canHrVerify = perms.has("ATT.LATE_EXPLAIN_HR_VERIFY");
  const canConfigPolicy = perms.has("ATT.LATE_EXPLAIN_POLICY");

  const tabs = [];
  if (isDirector && canApprove)
    tabs.push({ id: "approve", label: "Cần duyệt" });
  if (canSelf)
    tabs.push({ id: "my", label: isDirector ? "Tự khai báo" : "Của tôi" });
  if (!isDirector && canApprove)
    tabs.push({ id: "approve", label: "Cần duyệt" });
  if (canHrVerify) tabs.push({ id: "hr", label: "HR Ghi nhận" });

  return {
    tabs,
    showTabBar: tabs.length > 1,
    defaultTab: tabs[0]?.id || "my",
    isDirector,
    canDelegate: perms.has("ATT.LATE_EXPLAIN_APPROVE"),
    canConfigPolicy,
    hasActiveDelegation,

    canSubmitRow(row) {
      return (
        canSelf &&
        Number(row?.employee_id) === Number(user?.employee_id) &&
        row?.submission_status === "PENDING_SUBMIT"
      );
    },

    canApproveRow(row) {
      if (!canApprove) return false;
      if (Number(row?.employee_id) === Number(user?.employee_id)) return false;
      return (
        row?.submission_status === "SUBMITTED" &&
        row?.approval_status === "PENDING"
      );
    },

    canHrVerifyRow(row) {
      if (!canHrVerify) return false;
      if (Number(row?.employee_id) === Number(user?.employee_id)) return false;
      return (
        row?.approval_status !== "PENDING" && row?.hr_status === "PENDING_HR"
      );
    },
  };
}
