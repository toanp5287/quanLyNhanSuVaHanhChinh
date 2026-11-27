import cron from "node-cron";
import { db } from "../config/database.js";
import {
  ensureLateExplanationSchema,
  getOverdueSubmitCandidates,
  getSlaCandidates,
  markApprovalReminder,
  markExplanationOverdue,
  mergeLateRules,
} from "../services/late-explanation/lateExplanation.service.js";

let started = false;
let tasks = [];

const runSafely = async (label, operation) => {
  try {
    await operation();
  } catch (error) {
    console.error(`[late-explanation] ${label}:`, error);
  }
};

const runOverdueJob = () =>
  runSafely("quét quá hạn nộp giải trình", async () => {
    await ensureLateExplanationSchema();
    const candidates = await getOverdueSubmitCandidates();
    for (const item of candidates) {
      await markExplanationOverdue(item.id);
    }
  });

const runReminderJob = (kind) =>
  runSafely(`${kind === "24H" ? "nhắc duyệt 24h" : "leo thang duyệt 48h"}`, async () => {
    await ensureLateExplanationSchema();
    const [policies] = await db.query(
      "SELECT rules_json FROM attendance_policies WHERE is_default = 1 OR is_default = 0",
    );
    const ruleSets = policies.length
      ? policies.map((policy) => mergeLateRules(policy.rules_json))
      : [mergeLateRules(null)];
    const seen = new Set();
    for (const rules of ruleSets) {
      const candidates = await getSlaCandidates(kind, rules);
      for (const item of candidates) {
        if (seen.has(Number(item.id))) continue;
        seen.add(Number(item.id));
        await markApprovalReminder(item.id, kind);
      }
    }
  });

export const startLateExplanationSlaJobs = () => {
  if (started) return tasks;
  started = true;
  tasks = [
    cron.schedule("*/15 * * * *", runOverdueJob, { timezone: "Asia/Ho_Chi_Minh" }),
    cron.schedule("*/15 * * * *", () => runReminderJob("24H"), { timezone: "Asia/Ho_Chi_Minh" }),
    cron.schedule("*/15 * * * *", () => runReminderJob("48H"), { timezone: "Asia/Ho_Chi_Minh" }),
  ];
  return tasks;
};

export const stopLateExplanationSlaJobs = async () => {
  for (const task of tasks) await task.stop();
  tasks = [];
  started = false;
};

export { runOverdueJob, runReminderJob };
