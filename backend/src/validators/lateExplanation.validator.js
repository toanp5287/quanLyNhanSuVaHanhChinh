import { z } from "zod";

const isDateTime = (value) => {
  if (typeof value !== "string" || !value.trim()) return false;
  return Number.isFinite(Date.parse(value));
};

const isUrlOrPath = (value) => {
  if (typeof value !== "string" || !value.trim()) return false;
  if (value.startsWith("/")) return true;
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
};

const nullableDateTime = z
  .string()
  .refine(isDateTime, "Thời gian không hợp lệ")
  .nullable()
  .optional();

export const submitExplanationSchema = z.object({
  reason_category: z.enum(["LEGITIMATE", "PERSONAL_ROUTINE"]),
  reason_detail: z.string().trim().min(10, "Lý do phải từ 10 ký tự").max(1000),
  evidence_url: z
    .string()
    .refine(isUrlOrPath, "Minh chứng phải là đường dẫn hợp lệ")
    .nullable()
    .optional(),
  pre_notified: z.boolean().default(false),
  pre_notified_at: nullableDateTime,
});

export const approveExplanationSchema = z
  .object({
    decision: z.enum(["APPROVED", "REJECTED"]),
    approver_note: z.string().trim().max(500).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === "REJECTED" && String(value.approver_note || "").trim().length < 5) {
      ctx.addIssue({
        code: "custom",
        path: ["approver_note"],
        message: "Bắt buộc ghi chú tối thiểu 5 ký tự khi từ chối",
      });
    }
  });

export const hrVerifySchema = z.object({
  hr_status: z.enum(["RECORDED", "INVALID_SUBMISSION"]),
  hr_note: z.string().trim().max(1000).nullable().optional(),
});

export const delegationSchema = z
  .object({
    delegate_id: z.number().int().positive(),
    scope: z.enum(["LATE_EXPLANATION", "ALL_APPROVALS"]).default("LATE_EXPLANATION"),
    start_at: z.string().refine(isDateTime, "Thời gian bắt đầu không hợp lệ"),
    end_at: z.string().refine(isDateTime, "Thời gian kết thúc không hợp lệ"),
    reason: z.string().trim().max(500).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (Date.parse(value.end_at) <= Date.parse(value.start_at)) {
      ctx.addIssue({
        code: "custom",
        path: ["end_at"],
        message: "Thời gian kết thúc phải sau thời gian bắt đầu",
      });
    }
  });

export const validateBody = (schema, payload) => {
  const result = schema.safeParse(payload ?? {});
  if (result.success) return result.data;
  const error = new Error("Dữ liệu không hợp lệ");
  error.status = 400;
  error.code = "VALIDATION_ERROR";
  error.details = result.error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
  throw error;
};
