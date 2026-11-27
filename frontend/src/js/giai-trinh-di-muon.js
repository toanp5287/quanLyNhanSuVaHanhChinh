import api from "../services/api.js";
import { getCurrentUser } from "../services/auth.service.js";
import { buildLateExplainAccess } from "../utils/lateExplainAccess.js";

const BASE = "/attendance-late-explanations";
const DELEGATION_BASE = "/approval-delegations";

const ICONS = {
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  "user-cog":
    '<path d="M15 14a5 5 0 0 0-10 0"/><circle cx="10" cy="8" r="4"/><path d="M18 8v3M18 14v3M15.5 11.5h5M15.5 17.5h5"/>',
  sliders:
    '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1L11 5"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1L13 19"/>',
};

const DEFAULT_RULES = {
  grace_late_minutes: 5,
  grace_late_monthly_quota: 3,
  late_explain_deadline_hours: 24,
  late_approval_reminder_hours: 24,
  late_approval_escalate_hours: 48,
  late_escalation: {
    warning_min_count: 1,
    escalation_min_count: 3,
    disciplinary_min_count: 5,
    consecutive_days_limit: 3,
    manager_level_offset: 1,
  },
};

const state = {
  root: null,
  user: null,
  access: null,
  tab: "my",
  rules: DEFAULT_RULES,
  grace: {},
  delegations: { created: [], received: [] },
  my: [],
  approval: [],
  hr: [],
  hrFilter: "ALL",
  counts: { approve: 0, hr: 0 },
  tick: null,
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const icon = (name, className = "w-4 h-4") =>
  `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.file}</svg>`;

const unwrap = (response) => response?.data?.data ?? response?.data;

const errorMessage = (error) => {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.response?.status === 401) return "Phiên đăng nhập đã hết hạn.";
  if (error?.response?.status === 403) return "Bạn không có quyền thực hiện thao tác này.";
  if (error?.response?.status === 404) return "Không tìm thấy API giải trình đi muộn (404).";
  if (error?.response?.status >= 500) return "Máy chủ gặp lỗi khi xử lý giải trình đi muộn.";
  if (error?.code === "ECONNABORTED") return "Máy chủ phản hồi quá chậm.";
  return "Không thể kết nối máy chủ. Kiểm tra backend đang chạy ở cổng 8080.";
};

const apiGet = async (path, base = BASE) => {
  try {
    return unwrap(await api.get(`${base}${path}`));
  } catch (error) {
    throw new Error(errorMessage(error));
  }
};

const apiMutation = async (method, path, payload, base = BASE) => {
  try {
    const response = await api.request({
      method,
      url: `${base}${path}`,
      ...(payload !== undefined ? { data: payload } : {}),
    });
    return unwrap(response);
  } catch (error) {
    throw new Error(errorMessage(error));
  }
};

const parseDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const pad = (value) => String(value).padStart(2, "0");

const toDateTimeLocal = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

const toIsoLocal = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const formatDateVi = (value) => {
  const date = parseDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

const formatTime = (value) => {
  const date = parseDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const formatDateTimeVi = (value) => {
  const date = parseDate(value);
  if (!date) return "—";
  return `${formatDateVi(date)} ${formatTime(date)}`;
};

const countdownText = (target) => {
  const date = parseDate(target);
  if (!date) return "—";
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return "Đã quá hạn";
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  if (hours >= 24) return `${Math.floor(hours / 24)}n ${hours % 24}g`;
  if (hours > 0) return `${hours}g ${pad(minutes)}p`;
  return `${minutes}p ${pad(seconds)}s`;
};

const countdownTone = (target) => {
  const date = parseDate(target);
  if (!date) return "text-slate-400";
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return "text-rose-300";
  if (diff <= 2 * 3600000) return "text-amber-300";
  return "text-sky-300";
};

const categoryLabel = (category) =>
  ({
    LEGITIMATE: "Lý do chính đáng",
    PERSONAL_ROUTINE: "Việc cá nhân",
    UNSUBMITTED_OVERDUE: "Không nộp / quá hạn",
  })[category] || "Chưa phân loại";

const categoryTone = (category) =>
  ({
    LEGITIMATE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
    PERSONAL_ROUTINE: "bg-sky-500/15 text-sky-300 border-sky-500/25",
    UNSUBMITTED_OVERDUE: "bg-rose-500/15 text-rose-300 border-rose-500/25",
  })[category] || "bg-white/5 text-slate-300 border-white/10";

const pill = (label, tone = "bg-white/5 text-slate-300 border-white/10") =>
  `<span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}">${escapeHtml(label)}</span>`;

const approvalBadge = (status) => {
  const map = {
    PENDING: ["Chờ duyệt", "bg-amber-500/15 text-amber-300 border-amber-500/25"],
    APPROVED: ["Đã duyệt", "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"],
    REJECTED: ["Từ chối", "bg-rose-500/15 text-rose-300 border-rose-500/25"],
    AUTO_SELF_DECLARED: ["Tự khai báo", "bg-sky-500/15 text-sky-300 border-sky-500/25"],
    EXPIRED: ["Quá hạn nộp", "bg-slate-500/15 text-slate-300 border-slate-500/25"],
  };
  const entry = map[status] || ["—", "bg-white/5 text-slate-300 border-white/10"];
  return pill(entry[0], entry[1]);
};

const hrBadge = (status) => {
  const map = {
    PENDING_HR: ["Chờ HR", "bg-amber-500/15 text-amber-300 border-amber-500/25"],
    RECORDED: ["Đã ghi nhận", "bg-teal-500/15 text-teal-300 border-teal-500/25"],
    INVALID_SUBMISSION: ["Không hợp lệ", "bg-rose-500/15 text-rose-300 border-rose-500/25"],
  };
  const entry = map[status] || ["—", "bg-white/5 text-slate-300 border-white/10"];
  return pill(entry[0], entry[1]);
};

const warningBadges = (row) => {
  const badges = [];
  if (row.escalated_48h_at) badges.push(pill("Quá 48h", "bg-rose-500/15 text-rose-300 border-rose-500/25"));
  if (row.escalation_level === "LEVEL_2_ESCALATED")
    badges.push(pill("Level 2", "bg-amber-500/15 text-amber-300 border-amber-500/25"));
  if (row.escalation_level === "LEVEL_3_DISCIPLINARY")
    badges.push(pill("Level 3 - Kỷ luật", "bg-rose-500/15 text-rose-300 border-rose-500/25"));
  return badges.length ? badges.join(" ") : '<span class="text-slate-500">—</span>';
};

const slaInfo = (row) => {
  if (["APPROVED", "REJECTED", "AUTO_SELF_DECLARED", "EXPIRED"].includes(row.approval_status))
    return { text: "Đã xử lý", tone: "text-emerald-300" };
  const submitted = parseDate(row.submitted_at);
  if (!submitted) return { text: "—", tone: "text-slate-400" };
  const hours = Number(state.rules?.late_approval_escalate_hours ?? 48);
  const deadline = new Date(submitted.getTime() + hours * 3600000).toISOString();
  return { text: countdownText(deadline), tone: countdownTone(deadline) };
};

const evidenceLink = (row) => {
  if (!row.evidence_url) return '<span class="text-slate-500">—</span>';
  const url = String(row.evidence_url);
  const href = /^https?:\/\//.test(url) ? url : url.startsWith("/") ? url : `/api/${url}`;
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200">${icon("link", "w-3.5 h-3.5")} Minh chứng</a>`;
};

const actionButton = (action, iconName, tooltip, tone, id) =>
  `<button type="button" data-action="${action}" data-id="${escapeHtml(id)}" data-tooltip="${escapeHtml(tooltip)}" class="icon-btn ${tone}">${icon(iconName)}</button>`;

const content = () => state.root?.querySelector("#lateContent");
const modalRoot = () => document.getElementById("lateModalRoot");

const hasTab = (id) => Boolean(state.access?.tabs?.some((tab) => tab.id === id));

const activeReceivedDelegation = () =>
  (state.delegations.received || []).some((item) => {
    if (Number(item.is_active) !== 1) return false;
    const end = parseDate(item.end_at);
    return !end || end.getTime() >= Date.now();
  });

const loadDelegations = async () => {
  try {
    state.delegations = (await apiGet("/my", DELEGATION_BASE)) || { created: [], received: [] };
  } catch {
    state.delegations = { created: [], received: [] };
  }
};

const loadRules = async () => {
  try {
    const rules = await apiGet("/rules");
    state.rules = { ...DEFAULT_RULES, ...(rules || {}) };
  } catch {
    state.rules = DEFAULT_RULES;
  }
};

const loadCounts = async () => {
  const tasks = [];
  if (hasTab("approve"))
    tasks.push(
      apiGet("/pending-approval")
        .then((rows) => {
          state.counts.approve = Array.isArray(rows) ? rows.length : 0;
        })
        .catch(() => {
          state.counts.approve = 0;
        }),
    );
  if (hasTab("hr"))
    tasks.push(
      apiGet("/hr-queue")
        .then((rows) => {
          state.counts.hr = Array.isArray(rows) ? rows.length : 0;
        })
        .catch(() => {
          state.counts.hr = 0;
        }),
    );
  await Promise.all(tasks);
};

const refreshHeaderCounts = () => {
  const approve = content()?.ownerDocument?.querySelector('[data-count-tab="approve"]');
  const hr = content()?.ownerDocument?.querySelector('[data-count-tab="hr"]');
  if (approve) approve.textContent = String(state.counts.approve);
  if (hr) hr.textContent = String(state.counts.hr);
};

const showToast = (message, tone = "info") => {
  const colors =
    tone === "error"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
      : tone === "success"
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
        : "border-sky-500/30 bg-sky-500/10 text-sky-200";
  const toast = document.createElement("div");
  toast.className = `fixed bottom-5 right-5 z-[240] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl ${colors}`;
  toast.textContent = String(message);
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 4000);
};

const shellStyles = `
  <style>
    .late-shell .late-tab { border-radius: 9999px; padding: 6px 14px; font-size: 12px; font-weight: 600; color: #94a3b8; border: 1px solid transparent; transition: all .15s ease; }
    .late-shell .late-tab:hover { color: #e2e8f0; background: rgba(255,255,255,.05); }
    .late-shell .late-tab.active { color: #e0f2fe; background: rgba(14,165,233,.15); border-color: rgba(56,189,248,.35); box-shadow: 0 0 0 1px rgba(56,189,248,.08) inset; }
    .late-shell .icon-btn { position: relative; width: 2rem; height: 2rem; flex: 0 0 2rem; display: inline-flex; align-items: center; justify-content: center; border-radius: .5rem; border: 1px solid rgba(255,255,255,.1); transition: all .15s ease; }
    .late-shell .icon-btn[data-tooltip]::after { content: attr(data-tooltip); position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%); z-index: 50; pointer-events: none; white-space: nowrap; border-radius: .375rem; border: 1px solid rgba(255,255,255,.12); background: #020617; padding: 4px 8px; font-size: 11px; font-weight: 500; color: #e2e8f0; opacity: 0; visibility: hidden; transition: opacity .12s ease; box-shadow: 0 10px 25px rgba(0,0,0,.35); }
    .late-shell .icon-btn[data-tooltip]:hover::after, .late-shell .icon-btn[data-tooltip]:focus-visible::after { opacity: 1; visibility: visible; }
    .late-shell .tone-neutral { background: rgba(255,255,255,.05); color: #cbd5e1; }
    .late-shell .tone-neutral:hover { background: rgba(255,255,255,.1); }
    .late-shell .tone-info { background: rgba(14,165,233,.15); color: #7dd3fc; border-color: rgba(56,189,248,.3); }
    .late-shell .tone-info:hover { background: rgba(14,165,233,.25); }
    .late-shell .tone-success { background: rgba(16,185,129,.15); color: #6ee7b7; border-color: rgba(52,211,153,.3); }
    .late-shell .tone-success:hover { background: rgba(16,185,129,.25); }
    .late-shell .tone-danger { background: rgba(244,63,94,.15); color: #fda4af; border-color: rgba(251,113,133,.3); }
    .late-shell .tone-danger:hover { background: rgba(244,63,94,.25); }
    .late-shell .filter-pill { border-radius: 9999px; border: 1px solid rgba(255,255,255,.1); padding: 5px 11px; font-size: 11px; font-weight: 600; color: #94a3b8; background: rgba(255,255,255,.03); transition: all .15s ease; }
    .late-shell .filter-pill:hover { color: #e2e8f0; }
    .late-shell .filter-pill.active { color: #e0f2fe; border-color: rgba(56,189,248,.35); background: rgba(14,165,233,.15); }
    .late-shell fieldset legend { padding: 0 .25rem; }
  </style>
`;

const headerTools = () => {
  if (state.tab === "my") {
    const quota = Number(state.grace?.quota ?? state.rules?.grace_late_monthly_quota ?? 0);
    const used = Number(state.grace?.used ?? 0);
    const remaining = Number(state.grace?.remaining ?? Math.max(0, quota - used));
    return `<div class="inline-flex items-center gap-2 rounded-full border border-sky-500/25 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200"><span class="h-1.5 w-1.5 rounded-full bg-sky-400"></span>Ân hạn ${escapeHtml(state.rules?.grace_late_minutes ?? 5)}p: còn ${remaining}/${quota} lần</div>`;
  }

  if (state.tab === "approve") {
    if (!state.access.canDelegate) return "";
    return `<button type="button" data-action="open-delegation" data-tooltip="Ủy quyền duyệt thay" class="icon-btn tone-info">${icon("user-cog")}</button>`;
  }

  if (state.tab === "hr") {
    const filters = [
      ["ALL", "Tất cả"],
      ["PENDING_HR", "Chờ ghi nhận"],
      ["OVERDUE_48H", "Quá 48h"],
      ["LEVEL_2", "Level 2"],
      ["LEVEL_3", "Level 3"],
    ];
    return `<div class="flex flex-wrap items-center justify-end gap-1.5">
      ${filters
        .map(
          ([value, label]) =>
            `<button type="button" data-action="hr-filter" data-queue="${value}" class="filter-pill ${state.hrFilter === value ? "active" : ""}">${label}</button>`,
        )
        .join("")}
      ${
        state.access.canConfigPolicy
          ? `<button type="button" data-action="open-policy" data-tooltip="Cấu hình quy chế" class="icon-btn tone-neutral">${icon("sliders")}</button>`
          : ""
      }
    </div>`;
  }

  return "";
};

const tabBar = () => {
  if (!state.access.showTabBar) return "";
  return `<div class="mt-3 inline-flex items-center gap-1 rounded-full border border-white/10 bg-slate-950/60 p-1 backdrop-blur-md">
    ${state.access.tabs
      .map((tab) => {
        const hasCount = tab.id === "approve" || tab.id === "hr";
        const count =
          tab.id === "approve" ? state.counts.approve : tab.id === "hr" ? state.counts.hr : 0;
        return `<button type="button" data-action="tab" data-tab="${tab.id}" class="late-tab ${state.tab === tab.id ? "active" : ""}">${escapeHtml(tab.label)}${hasCount ? `<span data-count-tab="${tab.id}" class="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-200">${count}</span>` : ""}</button>`;
      })
      .join("")}
  </div>`;
};

const renderShell = () => {
  if (!state.root) return;
  state.root.innerHTML = `
    ${shellStyles}
    <section class="late-shell flex flex-col gap-4">
      <header class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-500/25 bg-sky-500/10 text-sky-300">${icon("clock", "w-5 h-5")}</span>
            <div>
              <h1 class="text-lg font-semibold tracking-tight text-slate-100">Giải trình đi muộn</h1>
              <p class="text-xs text-slate-400">Nộp giải trình, duyệt theo thẩm quyền và ghi nhận công đúng quy chế.</p>
            </div>
          </div>
          ${tabBar()}
        </div>
        <div class="flex flex-wrap items-center gap-2">${headerTools()}</div>
      </header>
      <div id="lateContent"></div>
    </section>
    <div id="lateModalRoot"></div>
  `;
  bindModal();
};

const emptyRow = (colspan, message) => `
  <tr><td colspan="${colspan}" class="px-4 py-10 text-center text-sm text-slate-500">${escapeHtml(message)}</td></tr>
`;

const tableWrap = (thead, body) => `
  <div class="overflow-hidden rounded-xl border border-white/10 bg-slate-900/60 shadow-lg backdrop-blur-md">
    <div class="overflow-x-auto">
      <table class="w-full min-w-[900px] text-left text-sm">
        <thead class="bg-white/[0.03] text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <tr>${thead}</tr>
        </thead>
        <tbody class="divide-y divide-white/5">${body}</tbody>
      </table>
    </div>
  </div>
`;

const th = (label) => `<th class="whitespace-nowrap px-4 py-3 font-semibold">${label}</th>`;
const td = (children, className = "") => `<td class="px-4 py-3 align-middle ${className}">${children}</td>`;

const renderMy = () => {
  const rows = state.my || [];
  const body = rows.length
    ? rows
        .map((row) => {
          const canSubmit = state.access.canSubmitRow(row);
          const deadlineCell =
            row.submission_status === "PENDING_SUBMIT" && row.submit_deadline_at
              ? `<span data-deadline="${escapeHtml(row.submit_deadline_at)}" class="font-semibold ${countdownTone(row.submit_deadline_at)}">${countdownText(row.submit_deadline_at)}</span>`
              : '<span class="text-slate-500">—</span>';
          return `<tr class="transition-colors hover:bg-white/[0.03]">
            ${td(`<div class="font-medium text-slate-100">${formatDateVi(row.work_date)}</div><div class="text-[11px] text-slate-500">${escapeHtml(row.shift_name || row.shift_code || "—")}</div>`)}
            ${td(`<div class="text-slate-100">${formatTime(row.checkin_time || row.check_in)}</div><div class="text-[11px] text-rose-300">+${Number(row.late_minutes || 0)} phút</div>`)}
            ${td(`<span class="inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${categoryTone(row.reason_category)}">${categoryLabel(row.reason_category)}</span>`)}
            ${td(`<div class="flex items-center gap-1.5 ${countdownTone(row.submit_deadline_at)}">${icon("clock", "w-3.5 h-3.5")}${deadlineCell}</div>`)}
            ${
              state.access.isDirector
                ? ""
                : td(`<div>${approvalBadge(row.approval_status)}</div><div class="mt-1 text-[11px] text-slate-500">${row.approver_id ? `Người duyệt #${row.approver_id}` : "Chưa phân duyệt"}</div>`)
            }
            ${td(`<div>${hrBadge(row.hr_status)}</div>`)}
            ${td(`<div class="flex items-center gap-1.5">
              ${canSubmit ? actionButton("submit-form", "send", "Nộp giải trình", "tone-info", row.id) : ""}
              ${actionButton("detail", "eye", "Xem chi tiết", "tone-neutral", row.id)}
            </div>`)}
          </tr>`;
        })
        .join("")
    : emptyRow(state.access.isDirector ? 6 : 7, "Không có đơn đi muộn trong tháng này.");

  const headers = [
    th("Ngày làm việc"),
    th("Giờ vào / Muộn"),
    th("Phân loại lý do"),
    th("Hạn nộp (24h)"),
  ];
  if (!state.access.isDirector) headers.push(th("Quản lý"));
  headers.push(th("HR"), th("Thao tác"));

  content().innerHTML = tableWrap(headers.join(""), body);
};

const renderApprove = () => {
  const rows = state.approval || [];
  const body = rows.length
    ? rows
        .map((row) => {
          const lateCount = Number(row.monthly_late_count_at_submit ?? row.monthly_late_count ?? 0);
          const sla = slaInfo(row);
          return `<tr class="transition-colors hover:bg-white/[0.03]">
            ${td(`<div class="font-medium text-slate-100">${escapeHtml(row.full_name || `NV${row.employee_id}`)} ${row.is_delegated || row.delegated_approver_id ? pill("Ủy quyền", "bg-violet-500/15 text-violet-300 border-violet-500/25") : ""}</div><div class="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">${escapeHtml(row.employee_code || "")}${pill(`Muộn ${lateCount} lần/tháng`, "bg-white/5 text-slate-300 border-white/10")}</div>`)}
            ${td(`<div class="text-slate-100">${formatDateVi(row.work_date)}</div><div class="text-[11px] text-rose-300">+${Number(row.late_minutes || 0)} phút · ${formatTime(row.checkin_time || row.check_in)}</div>`)}
            ${td(`<div class="line-clamp-2 max-w-[280px] text-slate-200">${escapeHtml(row.reason_detail || categoryLabel(row.reason_category))}</div><div class="mt-1">${evidenceLink(row)}</div>`)}
            ${td(row.pre_notified ? `<span class="text-emerald-300">Báo trước</span><div class="text-[11px] text-slate-500">${formatDateTimeVi(row.pre_notified_at)}</div>` : '<span class="text-slate-500">Không</span>')}
            ${td(`<div class="flex items-center gap-1.5 ${sla.tone}">${icon("clock", "w-3.5 h-3.5")}<span class="font-semibold">${escapeHtml(sla.text)}</span></div>`)}
            ${td(`<div class="flex items-center gap-1.5">
              ${
                state.access.canApproveRow(row)
                  ? `${actionButton("approve", "check", "Duyệt", "tone-success", row.id)}${actionButton("reject", "x", "Từ chối", "tone-danger", row.id)}`
                  : ""
              }
              ${actionButton("detail", "eye", "Xem chi tiết", "tone-neutral", row.id)}
            </div>`)}
          </tr>`;
        })
        .join("")
    : emptyRow(6, "Không có đơn nào chờ duyệt.");

  content().innerHTML = tableWrap(
    [
      th("Nhân sự"),
      th("Ngày / Muộn"),
      th("Lý do & Minh chứng"),
      th("Báo trước"),
      th("SLA duyệt"),
      th("Thao tác"),
    ].join(""),
    body,
  );
};

const renderHr = () => {
  const rows = state.hr || [];
  const body = rows.length
    ? rows
        .map(
          (row) => `<tr class="transition-colors hover:bg-white/[0.03]">
            ${td(`<div class="font-medium text-slate-100">${escapeHtml(row.full_name || `NV${row.employee_id}`)}</div><div class="text-[11px] text-slate-500">${escapeHtml(row.department_name || "—")} · ${escapeHtml(row.employee_code || "")}</div>`)}
            ${td(`<div class="text-slate-100">${formatDateVi(row.work_date)}</div><div class="text-[11px] text-rose-300">+${Number(row.late_minutes || 0)} phút · ${formatTime(row.checkin_time || row.check_in)}</div>`)}
            ${td(`<div>${approvalBadge(row.approval_status)}</div><div class="mt-1 line-clamp-2 max-w-[220px] text-[11px] text-slate-500">${escapeHtml(row.approver_note || "Không có ghi chú")}</div>`)}
            ${td(`<div>${hrBadge(row.hr_status)}</div><div class="mt-1 line-clamp-2 max-w-[220px] text-[11px] text-slate-500">${escapeHtml(row.hr_note || "Chưa có ghi chú HR")}</div>`)}
            ${td(`<div class="flex flex-wrap gap-1">${warningBadges(row)}</div>`)}
            ${td(`<div class="flex items-center gap-1.5">
              ${
                state.access.canHrVerifyRow(row)
                  ? `${actionButton("hr-record", "check", "Ghi nhận công", "tone-success", row.id)}${actionButton("hr-invalid", "ban", "Hồ sơ không hợp lệ", "tone-danger", row.id)}`
                  : ""
              }
              ${actionButton("detail", "eye", "Xem chi tiết", "tone-neutral", row.id)}
            </div>`)}
          </tr>`,
        )
        .join("")
    : emptyRow(6, "Không có hồ sơ nào theo bộ lọc này.");

  content().innerHTML = tableWrap(
    [
      th("Nhân sự / Phòng ban"),
      th("Ngày / Muộn"),
      th("Tầng 1 (Quản lý)"),
      th("Tầng 2 (HR)"),
      th("Cảnh báo / Ngưỡng"),
      th("Thao tác"),
    ].join(""),
    body,
  );
};

const renderTab = () => {
  if (!content()) return;
  if (state.tab === "approve") renderApprove();
  else if (state.tab === "hr") renderHr();
  else renderMy();
  refreshHeaderCounts();
};

const loadTab = async () => {
  if (!content()) return;
  try {
    if (state.tab === "approve") {
      state.approval = (await apiGet("/pending-approval")) || [];
    } else if (state.tab === "hr") {
      const query = state.hrFilter === "ALL" ? "" : `?queue=${state.hrFilter}`;
      state.hr = (await apiGet(`/hr-queue${query}`)) || [];
    } else {
      const result = (await apiGet("/my")) || {};
      state.my = result.items || [];
      state.grace = result.grace || {};
    }
    renderTab();
  } catch (error) {
    content().innerHTML = `<div class="rounded-xl border border-rose-500/25 bg-rose-500/10 p-5 text-sm text-rose-200">${escapeHtml(error.message)}</div>`;
  }
};

const findRow = (id) => {
  const numericId = Number(id);
  return (
    state.my.find((row) => Number(row.id) === numericId) ||
    state.approval.find((row) => Number(row.id) === numericId) ||
    state.hr.find((row) => Number(row.id) === numericId) ||
    null
  );
};

const closeModal = () => {
  if (modalRoot()) modalRoot().innerHTML = "";
};

const modalHtml = (title, subtitle, body) => `
  <div data-modal-overlay class="fixed inset-0 z-[230] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
    <div class="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/15 bg-slate-950/85 shadow-2xl backdrop-blur-xl">
      <div class="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
        <div>
          <h2 class="text-base font-semibold text-slate-100">${escapeHtml(title)}</h2>
          ${subtitle ? `<p class="mt-0.5 text-xs text-slate-400">${escapeHtml(subtitle)}</p>` : ""}
        </div>
        <button type="button" data-action="close-modal" data-tooltip="Đóng" class="icon-btn tone-neutral">${icon("x")}</button>
      </div>
      <div class="max-h-[75vh] overflow-y-auto px-5 py-4">${body}</div>
    </div>
  </div>
`;

const detailLine = (label, value) => `
  <div class="flex items-start justify-between gap-4 border-b border-white/5 py-2 last:border-0">
    <span class="text-xs text-slate-400">${escapeHtml(label)}</span>
    <span class="text-right text-xs font-medium text-slate-200">${escapeHtml(value || "—")}</span>
  </div>
`;

const openDetailModal = (row) => {
  const approver = row.approver_id ? `NV${row.approver_id}` : "—";
  const body = `
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <div class="text-xs font-semibold text-slate-300">Thông tin đi muộn</div>
        ${detailLine("Ngày làm việc", formatDateVi(row.work_date))}
        ${detailLine("Giờ check-in", formatTime(row.checkin_time || row.check_in))}
        ${detailLine("Số phút muộn", `${Number(row.late_minutes || 0)} phút`)}
        ${detailLine("Ca làm", row.shift_name || row.shift_code || "—")}
        ${detailLine("Đã báo trước", row.pre_notified ? formatDateTimeVi(row.pre_notified_at) : "Không")}
      </div>
      <div class="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <div class="text-xs font-semibold text-slate-300">Giải trình & duyệt</div>
        ${detailLine("Phân loại", categoryLabel(row.reason_category))}
        ${detailLine("Lý do", row.reason_detail || "—")}
        ${detailLine("Minh chứng", row.evidence_url ? "Có" : "Không")}
        ${detailLine("Hạn nộp", formatDateTimeVi(row.submit_deadline_at))}
        ${detailLine("Người duyệt", approver)}
        ${detailLine("Ghi chú duyệt", row.approver_note || "—")}
      </div>
    </div>
    <div class="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div class="mb-1 text-xs font-semibold text-slate-300">Lịch sử leo thang & ghi nhận</div>
      ${detailLine("Nộp đơn", formatDateTimeVi(row.submitted_at))}
      ${detailLine("Nhắc duyệt 24h", formatDateTimeVi(row.reminded_24h_at))}
      ${detailLine("Leo thang 48h", formatDateTimeVi(row.escalated_48h_at))}
      ${detailLine("Cấp leo thang", row.escalation_level || "NONE")}
      ${detailLine("HR ghi nhận", formatDateTimeVi(row.hr_verified_at))}
      ${detailLine("Ghi chú HR", row.hr_note || "—")}
    </div>
  `;
  modalRoot().innerHTML = modalHtml("Chi tiết giải trình", `Đơn #${row.id}`, body);
};

const fieldClass =
  "w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/20";
const labelClass = "mb-1.5 block text-xs font-semibold text-slate-300";

const openSubmitModal = (row) => {
  const now = toDateTimeLocal();
  const body = `
    <form data-form="submit-form" data-id="${row.id}" class="grid gap-4">
      <div>
        <label class="${labelClass}" for="lateReasonCategory">Phân loại lý do</label>
        <select id="lateReasonCategory" name="reason_category" class="${fieldClass}" required>
          <option value="LEGITIMATE">Lý do chính đáng</option>
          <option value="PERSONAL_ROUTINE">Việc cá nhân</option>
        </select>
      </div>
      <div>
        <label class="${labelClass}" for="lateReasonDetail">Diễn giải cụ thể (tối thiểu 10 ký tự)</label>
        <textarea id="lateReasonDetail" name="reason_detail" rows="4" minlength="10" maxlength="1000" class="${fieldClass}" placeholder="Ví dụ: xe gặp tai nạn trên đường đến công ty..." required></textarea>
      </div>
      <div>
        <label class="${labelClass}" for="lateEvidence">Minh chứng (ảnh/PDF, không bắt buộc)</label>
        <input id="lateEvidence" name="evidence" type="file" accept="image/*,application/pdf" class="${fieldClass}" />
      </div>
      <div class="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <label class="flex items-start gap-2 text-xs text-slate-300">
          <input type="checkbox" name="pre_notified" class="mt-0.5 h-4 w-4 rounded border-white/20 bg-slate-900" ${row.pre_notified ? "checked" : ""} />
          <span>Đã báo trước cho quản lý</span>
        </label>
        <input type="datetime-local" name="pre_notified_at" value="${row.pre_notified ? escapeHtml(toDateTimeLocal(parseDate(row.pre_notified_at) || new Date())) : now}" class="${fieldClass} mt-2" />
      </div>
      <div class="flex justify-end gap-2 border-t border-white/10 pt-4">
        <button type="button" data-action="close-modal" class="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">Hủy</button>
        <button type="submit" class="rounded-lg border border-sky-500/30 bg-sky-500/20 px-4 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/30">Nộp giải trình</button>
      </div>
    </form>
  `;
  modalRoot().innerHTML = modalHtml("Nộp giải trình", `Đơn #${row.id} · hạn ${formatDateTimeVi(row.submit_deadline_at)}`, body);
};

const openDecisionModal = (row, decision) => {
  const isReject = decision === "REJECTED";
  const body = `
    <form data-form="decision-form" data-id="${row.id}" data-decision="${decision}" class="grid gap-4">
      <div class="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm text-slate-300">
        ${escapeHtml(row.full_name || `NV${row.employee_id}`)} · ${formatDateVi(row.work_date)} · +${Number(row.late_minutes || 0)} phút
      </div>
      <div>
        <label class="${labelClass}" for="lateApproverNote">Ghi chú ${isReject ? "(bắt buộc, tối thiểu 5 ký tự)" : "(không bắt buộc)"}</label>
        <textarea id="lateApproverNote" name="approver_note" rows="4" minlength="${isReject ? 5 : 0}" maxlength="1000" class="${fieldClass}" placeholder="${isReject ? "Nêu rõ lý do từ chối..." : "Ghi chú cho nhân viên..."}"></textarea>
      </div>
      <div class="flex justify-end gap-2 border-t border-white/10 pt-4">
        <button type="button" data-action="close-modal" class="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">Hủy</button>
        <button type="submit" class="rounded-lg border px-4 py-2 text-sm font-semibold ${isReject ? "border-rose-500/30 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30" : "border-emerald-500/30 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30"}">${isReject ? "Xác nhận từ chối" : "Xác nhận duyệt"}</button>
      </div>
    </form>
  `;
  modalRoot().innerHTML = modalHtml(isReject ? "Từ chối giải trình" : "Duyệt giải trình", `Đơn #${row.id}`, body);
};

const openHrModal = (row, decision) => {
  const isInvalid = decision === "INVALID_SUBMISSION";
  const body = `
    <form data-form="hr-form" data-id="${row.id}" data-decision="${decision}" class="grid gap-4">
      <div class="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm text-slate-300">
        ${escapeHtml(row.full_name || `NV${row.employee_id}`)} · ${formatDateVi(row.work_date)} · ${approvalBadge(row.approval_status)}
      </div>
      <div>
        <label class="${labelClass}" for="lateHrNote">Ghi chú HR</label>
        <textarea id="lateHrNote" name="hr_note" rows="4" maxlength="1000" class="${fieldClass}" placeholder="${isInvalid ? "Nêu rõ lý do hồ sơ không hợp lệ..." : "Ghi chú ghi nhận công..."}"></textarea>
      </div>
      <div class="flex justify-end gap-2 border-t border-white/10 pt-4">
        <button type="button" data-action="close-modal" class="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">Hủy</button>
        <button type="submit" class="rounded-lg border px-4 py-2 text-sm font-semibold ${isInvalid ? "border-rose-500/30 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30" : "border-teal-500/30 bg-teal-500/20 text-teal-100 hover:bg-teal-500/30"}">${isInvalid ? "Xác nhận không hợp lệ" : "Ghi nhận công"}</button>
      </div>
    </form>
  `;
  modalRoot().innerHTML = modalHtml(isInvalid ? "Hồ sơ không hợp lệ" : "Ghi nhận công", `Đơn #${row.id}`, body);
};

const openPolicyModal = () => {
  const rules = state.rules || DEFAULT_RULES;
  const escalation = rules.late_escalation || DEFAULT_RULES.late_escalation;
  const item = (label, value) => detailLine(label, String(value));
  const body = `
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <div class="mb-1 text-xs font-semibold text-slate-300">Ân hạn & nộp đơn</div>
        ${item("Ân hạn đi muộn", `${rules.grace_late_minutes ?? 5} phút`)}
        ${item("Hạn ngạch ân hạn/tháng", `${rules.grace_late_monthly_quota ?? 3} lần`)}
        ${item("Hạn nộp giải trình", `${rules.late_explain_deadline_hours ?? 24} giờ`)}
      </div>
      <div class="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <div class="mb-1 text-xs font-semibold text-slate-300">SLA duyệt & leo thang</div>
        ${item("Nhắc duyệt", `${rules.late_approval_reminder_hours ?? 24} giờ`)}
        ${item("Leo thang duyệt", `${rules.late_approval_escalate_hours ?? 48} giờ`)}
        ${item("Cảnh báo / Level 2 / Kỷ luật", `${escalation.warning_min_count ?? 1} / ${escalation.escalation_min_count ?? 3} / ${escalation.disciplinary_min_count ?? 5} lần`)}
        ${item("Giới hạn ngày liên tiếp", `${escalation.consecutive_days_limit ?? 3} ngày`)}
      </div>
    </div>
    <p class="mt-4 text-xs text-slate-500">Quy chế được đọc từ API hiện có của hệ thống.</p>
  `;
  modalRoot().innerHTML = modalHtml("Cấu hình quy chế", "Ân hạn, SLA 24h/48h và ngưỡng kỷ luật", body);
};

const openDelegationModal = async () => {
  try {
    const candidates = (await apiGet("/candidates", DELEGATION_BASE)) || [];
    const active = (state.delegations.created || []).filter(
      (item) => Number(item.is_active) === 1,
    );
    const options = candidates
      .filter((candidate) => Number(candidate.id) !== Number(state.user?.employee_id))
      .map(
        (candidate) =>
          `<option value="${candidate.id}">${escapeHtml(candidate.full_name)} · ${escapeHtml(candidate.employee_code || "")}</option>`,
      )
      .join("");
    const body = `
      <form data-form="delegation-form" class="grid gap-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="${labelClass}" for="lateDelegateId">Người được ủy quyền</label>
            <select id="lateDelegateId" name="delegate_id" class="${fieldClass}" required>${options || '<option value="">Không có nhân viên phù hợp</option>'}</select>
          </div>
          <div>
            <label class="${labelClass}" for="lateDelegationScope">Phạm vi</label>
            <select id="lateDelegationScope" name="scope" class="${fieldClass}">
              <option value="LATE_EXPLANATION">Giải trình đi muộn</option>
              <option value="ALL_APPROVALS">Tất cả phê duyệt</option>
            </select>
          </div>
          <div>
            <label class="${labelClass}" for="lateDelegationStart">Từ</label>
            <input id="lateDelegationStart" name="start_at" type="datetime-local" value="${toDateTimeLocal()}" class="${fieldClass}" required />
          </div>
          <div>
            <label class="${labelClass}" for="lateDelegationEnd">Đến</label>
            <input id="lateDelegationEnd" name="end_at" type="datetime-local" value="${toDateTimeLocal(new Date(Date.now() + 3 * 86400000))}" class="${fieldClass}" required />
          </div>
        </div>
        <div>
          <label class="${labelClass}" for="lateDelegationReason">Lý do ủy quyền</label>
          <textarea id="lateDelegationReason" name="reason" rows="2" maxlength="500" class="${fieldClass}" placeholder="Ví dụ: đi công tác..." required></textarea>
        </div>
        <div class="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div class="mb-2 text-xs font-semibold text-slate-300">Ủy quyền đang hiệu lực</div>
          ${
            active.length
              ? active
                  .map(
                    (item) => `<div class="flex items-center justify-between gap-3 border-b border-white/5 py-2 last:border-0">
                      <div class="text-xs text-slate-200">${escapeHtml(item.delegate_name || `NV${item.delegate_id}`)} · ${formatDateTimeVi(item.start_at)} → ${formatDateTimeVi(item.end_at)}</div>
                      ${actionButton("revoke-delegation", "ban", "Thu hồi ủy quyền", "tone-danger", item.id)}
                    </div>`,
                  )
                  .join("")
              : '<div class="text-xs text-slate-500">Chưa có ủy quyền nào đang hiệu lực.</div>'
          }
        </div>
        <div class="flex justify-end gap-2 border-t border-white/10 pt-4">
          <button type="button" data-action="close-modal" class="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">Hủy</button>
          <button type="submit" class="rounded-lg border border-sky-500/30 bg-sky-500/20 px-4 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/30">Tạo ủy quyền</button>
        </div>
      </form>
    `;
    modalRoot().innerHTML = modalHtml("Ủy quyền duyệt thay", "Chỉ áp dụng cho đơn giải trình đi muộn hoặc toàn bộ phê duyệt", body);
  } catch (error) {
    showToast(error.message, "error");
  }
};

const reloadAfterMutation = async () => {
  closeModal();
  await loadDelegations();
  state.access = buildLateExplainAccess(state.user, {
    hasActiveDelegation: activeReceivedDelegation(),
  });
  if (!hasTab(state.tab)) state.tab = state.access.defaultTab;
  renderShell();
  await Promise.all([loadCounts(), loadTab()]);
};

const handleAction = async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const row = findRow(button.dataset.id);

  if (action === "close-modal") {
    closeModal();
    return;
  }

  if (action === "tab") {
    state.tab = button.dataset.tab;
    renderShell();
    await loadTab();
    return;
  }

  if (action === "hr-filter") {
    state.hrFilter = button.dataset.queue || "ALL";
    renderShell();
    await loadTab();
    return;
  }

  if (action === "open-policy") {
    if (!state.access.canConfigPolicy) return;
    openPolicyModal();
    return;
  }

  if (action === "open-delegation") {
    if (!state.access.canDelegate) return;
    await openDelegationModal();
    return;
  }

  if (!row) return;

  if (action === "detail") {
    openDetailModal(row);
    return;
  }

  if (action === "submit-form") {
    if (!state.access.canSubmitRow(row)) return;
    openSubmitModal(row);
    return;
  }

  if (action === "approve" || action === "reject") {
    if (!state.access.canApproveRow(row)) return;
    openDecisionModal(row, action === "approve" ? "APPROVED" : "REJECTED");
    return;
  }

  if (action === "hr-record" || action === "hr-invalid") {
    if (!state.access.canHrVerifyRow(row)) return;
    openHrModal(row, action === "hr-record" ? "RECORDED" : "INVALID_SUBMISSION");
  }
};

const handleModalAction = async (event) => {
  if (event.target.matches("[data-modal-overlay]")) {
    closeModal();
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;

  if (button.dataset.action === "close-modal") {
    closeModal();
    return;
  }

  if (button.dataset.action === "revoke-delegation") {
    if (!state.access.canDelegate) return;
    try {
      await apiMutation("PATCH", `/${button.dataset.id}/revoke`, {}, DELEGATION_BASE);
      showToast("Đã hủy ủy quyền", "success");
      await reloadAfterMutation();
      await openDelegationModal();
    } catch (error) {
      showToast(error.message, "error");
    }
  }
};

const handleModalSubmit = async (event) => {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();

  const formData = new FormData(form);
  const formName = form.dataset.form;

  try {
    if (formName === "submit-form") {
      const row = findRow(form.dataset.id);
      if (!row || !state.access.canSubmitRow(row)) return;
      const reasonDetail = String(formData.get("reason_detail") || "").trim();
      if (reasonDetail.length < 10) throw new Error("Diễn giải lý do phải tối thiểu 10 ký tự.");
      let evidenceUrl = row.evidence_url || null;
      const file = formData.get("evidence");
      if (file && typeof file === "object" && file.size > 0) {
        const upload = new FormData();
        upload.append("evidence", file);
        const uploaded = await apiMutation("POST", "/evidence", upload);
        evidenceUrl = uploaded?.evidence_url || null;
      }
      await apiMutation("PATCH", `/${row.id}/submit`, {
        reason_category: formData.get("reason_category"),
        reason_detail: reasonDetail,
        evidence_url: evidenceUrl,
        pre_notified: formData.get("pre_notified") === "on",
        pre_notified_at: formData.get("pre_notified_at") ? toIsoLocal(formData.get("pre_notified_at")) : null,
      });
      showToast("Đã nộp giải trình", "success");
      await reloadAfterMutation();
      return;
    }

    if (formName === "decision-form") {
      const row = findRow(form.dataset.id);
      const decision = form.dataset.decision;
      if (!row || !state.access.canApproveRow(row)) return;
      const note = String(formData.get("approver_note") || "").trim();
      if (decision === "REJECTED" && note.length < 5) throw new Error("Ghi chú từ chối phải tối thiểu 5 ký tự.");
      await apiMutation("PATCH", `/${row.id}/approve`, {
        decision,
        approver_note: note || null,
      });
      showToast(decision === "REJECTED" ? "Đã từ chối giải trình" : "Đã duyệt giải trình", "success");
      await reloadAfterMutation();
      return;
    }

    if (formName === "hr-form") {
      const row = findRow(form.dataset.id);
      const decision = form.dataset.decision;
      if (!row || !state.access.canHrVerifyRow(row)) return;
      await apiMutation("PATCH", `/${row.id}/hr-verify`, {
        hr_status: decision,
        hr_note: String(formData.get("hr_note") || "").trim() || null,
      });
      showToast(decision === "RECORDED" ? "Đã ghi nhận công" : "Đã đánh dấu hồ sơ không hợp lệ", "success");
      await reloadAfterMutation();
      return;
    }

    if (formName === "delegation-form") {
      if (!state.access.canDelegate) return;
      const startAt = toIsoLocal(formData.get("start_at"));
      const endAt = toIsoLocal(formData.get("end_at"));
      if (!startAt || !endAt) throw new Error("Vui lòng nhập đúng thời gian ủy quyền.");
      if (new Date(endAt).getTime() <= new Date(startAt).getTime())
        throw new Error("Thời gian kết thúc phải sau thời gian bắt đầu.");
      await apiMutation(
        "POST",
        "/",
        {
          delegate_id: Number(formData.get("delegate_id")),
          scope: formData.get("scope"),
          start_at: startAt,
          end_at: endAt,
          reason: String(formData.get("reason") || "").trim(),
        },
        DELEGATION_BASE,
      );
      showToast("Đã tạo ủy quyền duyệt thay", "success");
      await reloadAfterMutation();
      await openDelegationModal();
    }
  } catch (error) {
    showToast(error.message, "error");
  }
};

const bindModal = () => {
  const root = modalRoot();
  if (!root) return;
  root.onclick = handleModalAction;
  root.onsubmit = handleModalSubmit;
};

const tickDeadlines = () => {
  document.querySelectorAll("[data-deadline]").forEach((node) => {
    const target = node.dataset.deadline;
    node.textContent = countdownText(target);
    node.className = `font-semibold ${countdownTone(target)}`;
  });
};

export async function initGiaiTrinhDiMuon(user) {
  if (state.tick) window.clearInterval(state.tick);
  state.tick = null;

  const root = document.getElementById("homeMain");
  if (!root) return;

  state.root = root;
  state.user = user || getCurrentUser();
  state.tab = "my";
  state.hrFilter = "ALL";
  state.my = [];
  state.approval = [];
  state.hr = [];
  state.counts = { approve: 0, hr: 0 };
  state.grace = {};
  state.access = buildLateExplainAccess(state.user, { hasActiveDelegation: false });

  root.onclick = handleAction;

  await Promise.all([loadRules(), loadDelegations()]);
  state.access = buildLateExplainAccess(state.user, {
    hasActiveDelegation: activeReceivedDelegation(),
  });
  state.tab = state.access.defaultTab;

  renderShell();
  await Promise.all([loadCounts(), loadTab()]);

  state.tick = window.setInterval(tickDeadlines, 1000);
}
