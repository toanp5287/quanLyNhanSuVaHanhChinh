import { z } from "zod";

export const updateRolePermissionsSchema = z.object({
  permission_ids: z
    .array(z.string().trim().min(1).max(20))
    .default([])
    .transform((ids) => [...new Set(ids)]),
});

export const updateRoleScopeSchema = z.object({
  data_scope: z.enum(["ALL", "DEPARTMENT", "SELF"]),
});

export const validationMessage = (error) =>
  error?.issues?.[0]?.message || "Dữ liệu không hợp lệ";
