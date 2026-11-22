import api from "../services/api.js";
import { getToken } from "../services/auth.service.js";

const state = {
  active: false,
  userKey: null,
  source: null,
  reconnectTimer: null,
  notifications: [],
  blocking: [],
  unread: 0,
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const priorityLabel = { CRITICAL: "Khẩn cấp", HIGH: "Cao", MEDIUM: "Trung bình", LOW: "Thấp" };
const priorityColor = {
  CRITICAL: "bg-error text-on-error",
  HIGH: "bg-error-container text-on-error-container",
  MEDIUM: "bg-tertiary-container text-on-tertiary-container",
  LOW: "bg-surface-container-high text-on-surface-variant",
};

const ensureContainers = () => {
  if (document.getElementById("hrmNotificationContainers")) return;

  const style = document.createElement("style");
  style.id = "hrmNotificationContainers";
  style.textContent = `
    body.hrm-banner-open header.hrm-header { top: 48px !important; }
    body.hrm-banner-open aside.hrm-sidebar { top: calc(3.5rem + 48px) !important; height: calc(100vh - 3.5rem - 48px) !important; }
    body.hrm-banner-open main.hrm-main { padding-top: calc(6.25rem + 48px) !important; }
    @keyframes hrm-notif-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
    .hrm-notif-in { animation: hrm-notif-in 180ms ease both; }
  `;
  document.head.appendChild(style);

  const banner = document.createElement("div");
  banner.id = "hrmNotificationBanner";
  document.body.appendChild(banner);

  const modal = document.createElement("div");
  modal.id = "hrmNotificationModal";
  document.body.appendChild(modal);

  const toasts = document.createElement("div");
  toasts.id = "hrmNotificationToasts";
  toasts.className = "fixed top-20 right-6 z-[160] flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)] pointer-events-none";
  document.body.appendChild(toasts);

  const dropdown = document.createElement("div");
  dropdown.id = "hrmNotificationDropdown";
  dropdown.className = "hidden fixed z-[120] w-[380px] max-w-[calc(100vw-2rem)] bg-surface-container-lowest rounded-lg shadow-xl border border-outline-variant overflow-hidden";
  document.body.appendChild(dropdown);

  document.addEventListener("click", (event) => {
    if (
      !event.target.closest("#notificationBellBtn") &&
      !event.target.closest("#hrmNotificationDropdown")
    ) {
      dropdown.classList.add("hidden");
    }
  });
};

const addBannerOffset = () => {
  document.querySelector("header")?.classList.add("hrm-header");
  document.querySelector("aside")?.classList.add("hrm-sidebar");
  document.querySelector("main")?.classList.add("hrm-main");
};

const deferredKey = (id) => `hrm_notif_deferred:${id}`;
const isFaceAlert = (item) =>
  ["FACE_ENROLLMENT_REQUIRED", "FACE_RESET"].includes(item?.type);

const updateBadge = () => {
  const badge = document.getElementById("notificationBadge");
  if (!badge) return;
  const count = Math.max(0, state.unread);
  badge.textContent = count > 99 ? "99+" : String(count);
  badge.classList.toggle("hidden", count === 0);
};

const navigate = (url) => {
  if (!url) return;
  document.getElementById("hrmNotificationDropdown")?.classList.add("hidden");
  if (url.startsWith("#/")) {
    window.location.hash = url;
    return;
  }
  window.location.href = url;
};

const resolveBlocking = async (item) => {
  if (!item) return;
  if (item.id && !String(item.id).startsWith("FACE_ENROLLMENT_REQUIRED:")) {
    try {
      await api.patch(`/api/v1/notifications/${item.id}/resolve`);
    } catch {
      return;
    }
  }
  sessionStorage.removeItem(deferredKey(item.id));
  state.blocking = state.blocking.filter((entry) => entry.id !== item.id);
  state.notifications = state.notifications.filter((entry) => entry.id !== item.id);
  renderAll();
};

const deferBlocking = (item) => {
  if (!item) return;
  sessionStorage.setItem(deferredKey(item.id), "1");
  renderAll();
};

const renderBanner = () => {
  const banner = document.getElementById("hrmNotificationBanner");
  if (!banner) return;
  const item = state.blocking.find(
    (entry) =>
      entry.priority === "CRITICAL" &&
      !sessionStorage.getItem(deferredKey(entry.id)),
  );

  if (!item) {
    banner.innerHTML = "";
    banner.className = "hidden";
    document.body.classList.remove("hrm-banner-open");
    return;
  }

  banner.className =
    "hrm-notif-in fixed top-0 left-0 right-0 z-[130] flex items-center gap-3 px-5 h-12 bg-error text-on-error shadow-lg";
  banner.innerHTML = `
    <span class="material-symbols-outlined text-[20px] shrink-0">warning</span>
    <span class="font-semibold text-sm whitespace-nowrap">${escapeHtml(item.title)}</span>
    <span class="text-sm opacity-90 truncate">${escapeHtml(item.message)}</span>
    <div class="ml-auto flex items-center gap-2 shrink-0">
      ${item.action_url ? `<button type="button" data-banner-action class="h-7 px-3 rounded bg-white/20 hover:bg-white/30 text-xs font-semibold">${escapeHtml(item.action_label || "Xử lý")}</button>` : ""}
      ${isFaceAlert(item) ? "" : `<button type="button" data-banner-resolve class="h-7 px-3 rounded bg-white/20 hover:bg-white/30 text-xs font-semibold">Đã xử lý</button>`}
    </div>
  `;
  banner.querySelector("[data-banner-action]")?.addEventListener("click", () => navigate(item.action_url));
  banner.querySelector("[data-banner-resolve]")?.addEventListener("click", () => resolveBlocking(item));
  addBannerOffset();
  document.body.classList.add("hrm-banner-open");
};

const renderModal = () => {
  const container = document.getElementById("hrmNotificationModal");
  if (!container) return;
  const item = state.blocking.find(
    (entry) =>
      entry.priority === "CRITICAL" &&
      !sessionStorage.getItem(deferredKey(entry.id)),
  );

  if (!item) {
    container.innerHTML = "";
    container.className = "hidden";
    return;
  }

  container.className = "fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm";
  container.innerHTML = `
    <div class="bg-surface-container-lowest rounded-lg shadow-2xl w-[440px] max-w-[calc(100vw-2rem)] p-6 flex flex-col gap-4">
      <div class="flex items-center gap-3">
        <span class="w-11 h-11 rounded-full bg-error-container text-on-error-container flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined">emergency_home</span>
        </span>
        <div>
          <p class="text-xs font-bold uppercase tracking-wide text-error">${escapeHtml(priorityLabel[item.priority] || item.priority)}</p>
          <p class="text-lg font-bold text-on-surface">${escapeHtml(item.title)}</p>
        </div>
      </div>
      <p class="text-sm text-on-surface-variant leading-relaxed">${escapeHtml(item.message)}</p>
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" data-modal-later class="h-9 px-4 rounded text-on-surface-variant hover:bg-surface-container-high font-semibold text-sm">Để sau</button>
        ${item.action_url ? `<button type="button" data-modal-action class="h-9 px-4 rounded bg-error text-on-error hover:opacity-90 font-semibold text-sm">${escapeHtml(item.action_label || "Xử lý ngay")}</button>` : ""}
        ${isFaceAlert(item) ? "" : `<button type="button" data-modal-resolve class="h-9 px-4 rounded bg-primary text-on-primary hover:opacity-90 font-semibold text-sm">Đã xử lý</button>`}
      </div>
    </div>
  `;
  container.querySelector("[data-modal-later]")?.addEventListener("click", () => deferBlocking(item));
  container.querySelector("[data-modal-action]")?.addEventListener("click", () => navigate(item.action_url));
  container.querySelector("[data-modal-resolve]")?.addEventListener("click", () => resolveBlocking(item));
};

const renderDropdown = () => {
  const dropdown = document.getElementById("hrmNotificationDropdown");
  if (!dropdown) return;
  const items = state.notifications.slice(0, 20);
  dropdown.innerHTML = `
    <div class="flex items-center justify-between px-4 py-3 border-b border-outline-variant">
      <div>
        <p class="font-bold text-on-surface">Thông báo</p>
        <p class="text-xs text-on-surface-variant">${state.unread} chưa đọc</p>
      </div>
      <button type="button" data-mark-all class="text-xs font-semibold text-primary hover:underline">Đánh dấu đã đọc</button>
    </div>
    <div class="max-h-[420px] overflow-y-auto">
      ${
        items.length
          ? items
              .map(
                (item) => `
        <div class="px-4 py-3 border-b border-outline-variant/60 hover:bg-surface-container-low cursor-pointer" data-notif-id="${escapeHtml(item.id)}">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${priorityColor[item.priority] || priorityColor.MEDIUM}">${escapeHtml(priorityLabel[item.priority] || item.priority)}</span>
            <p class="font-semibold text-sm text-on-surface truncate">${escapeHtml(item.title)}</p>
          </div>
          <p class="text-xs text-on-surface-variant mt-1 line-clamp-2">${escapeHtml(item.message)}</p>
        </div>`,
              )
              .join("")
          : `<p class="px-4 py-8 text-center text-sm text-on-surface-variant">Không có thông báo nào</p>`
      }
    </div>
  `;
  dropdown.querySelector("[data-mark-all]")?.addEventListener("click", markAllRead);
  dropdown.querySelectorAll("[data-notif-id]").forEach((element) => {
    element.addEventListener("click", () => {
      const item = itemFromDom(element);
      if (!item) return;
      markRead(item.id);
      navigate(item.action_url);
    });
  });
};

const itemFromDom = (element) => {
  const id = element.getAttribute("data-notif-id");
  return state.notifications.find((item) => String(item.id) === String(id));
};

const showToast = (item) => {
  const container = document.getElementById("hrmNotificationToasts");
  if (!container || !item || item.display_mode === "INBOX_ONLY") return;
  const sticky = item.priority === "CRITICAL" || item.priority === "HIGH";
  const toast = document.createElement("div");
  toast.className = `hrm-notif-in pointer-events-auto rounded-lg border border-outline-variant bg-surface-container-lowest shadow-xl p-3`;
  toast.innerHTML = `
    <div class="flex items-start gap-3">
      <span class="px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${priorityColor[item.priority] || priorityColor.MEDIUM}">${escapeHtml(priorityLabel[item.priority] || item.priority)}</span>
      <div class="min-w-0 flex-1">
        <p class="font-semibold text-sm text-on-surface">${escapeHtml(item.title)}</p>
        <p class="text-xs text-on-surface-variant mt-0.5">${escapeHtml(item.message)}</p>
        ${item.action_url ? `<button type="button" data-toast-action class="mt-2 text-xs font-bold text-primary hover:underline">${escapeHtml(item.action_label || "Xem chi tiết")}</button>` : ""}
      </div>
      <button type="button" data-toast-close class="text-on-surface-variant hover:text-on-surface shrink-0" aria-label="Đóng">
        <span class="material-symbols-outlined text-[18px]">close</span>
      </button>
    </div>
  `;
  toast.querySelector("[data-toast-action]")?.addEventListener("click", () => navigate(item.action_url));
  toast.querySelector("[data-toast-close]")?.addEventListener("click", () => toast.remove());
  container.appendChild(toast);
  window.setTimeout(() => toast.remove(), sticky ? 10000 : 5000);
};

const renderAll = () => {
  updateBadge();
  renderDropdown();
  renderBanner();
  renderModal();
};

const markRead = async (id) => {
  const local = state.notifications.find((item) => String(item.id) === String(id));
  if (local) local.is_read = true;
  if (state.unread > 0) state.unread -= 1;
  updateBadge();
  try {
    await api.patch(`/api/v1/notifications/${id}/read`);
  } catch {
    return;
  }
};

const markAllRead = async () => {
  try {
    await api.patch("/api/v1/notifications/read-all");
    state.notifications.forEach((item) => {
      item.is_read = true;
    });
    state.unread = 0;
    renderAll();
  } catch {
    return;
  }
};

const handleIncoming = (payload) => {
  if (!payload) return;
  const item = {
    ...payload,
    payload: payload.payload || {},
    priority_rank: Number(payload.priority_rank || 2),
  };
  state.notifications = [item, ...state.notifications.filter((entry) => String(entry.id) !== String(item.id))];
  state.unread += 1;
  if (item.priority === "CRITICAL" && !state.blocking.some((entry) => String(entry.id) === String(item.id))) {
    state.blocking.unshift(item);
  }
  renderAll();
  showToast(item);
};

const handleResolved = (payload) => {
  const id = String(payload?.id ?? "");
  const type = payload?.type;
  state.blocking = state.blocking.filter(
    (entry) =>
      String(entry.id) !== id &&
      !(type && entry.type === type),
  );
  state.notifications = state.notifications.filter(
    (entry) => String(entry.id) !== id && !(type && entry.type === type),
  );
  renderAll();
};

const connectStream = () => {
  const token = getToken();
  if (!state.active || !token || state.source) return;
  const base = String(api.defaults.baseURL || "").replace(/\/$/, "");
  const stream = new EventSource(
    `${base}/api/v1/notifications/stream?token=${encodeURIComponent(token)}`,
  );
  state.source = stream;

  stream.addEventListener("notification:new", (event) => {
    try {
      handleIncoming(JSON.parse(event.data));
    } catch {
      return;
    }
  });
  stream.addEventListener("notification:resolved", (event) => {
    try {
      handleResolved(JSON.parse(event.data));
    } catch {
      return;
    }
  });
  stream.onerror = () => {
    stream.close();
    if (state.source === stream) state.source = null;
    if (!state.active) return;
    window.clearTimeout(state.reconnectTimer);
    state.reconnectTimer = window.setTimeout(connectStream, 5000);
  };
};

const bootstrap = async () => {
  try {
    const response = await api.get("/api/v1/notifications/bootstrap");
    const data = response.data?.data || {};
    state.blocking = data.blocking_alerts || [];
    state.notifications = data.notifications || [];
    state.unread = Number(data.unread_count || 0);
    renderAll();
    if (data.startup_popup && data.startup_popup.priority !== "CRITICAL") {
      showToast(data.startup_popup);
    }
  } catch {
    return;
  }
};

export const mountBell = () => {
  const button = document.getElementById("notificationBellBtn");
  if (!button || button.dataset.bound === "1") {
    updateBadge();
    return;
  }
  button.dataset.bound = "1";
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const dropdown = document.getElementById("hrmNotificationDropdown");
    if (!dropdown) return;
    const rect = button.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 8}px`;
    dropdown.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
    dropdown.classList.toggle("hidden");
    if (!dropdown.classList.contains("hidden")) renderDropdown();
  });
  updateBadge();
};

export const initNotifications = async (user) => {
  if (!user?.user_id || !getToken()) return;
  const key = `${user.user_id}:${user.employee_id ?? ""}`;
  if (state.active && state.userKey === key) {
    mountBell();
    return;
  }

  state.source?.close();
  window.clearTimeout(state.reconnectTimer);
  state.active = true;
  state.userKey = key;
  state.notifications = [];
  state.blocking = [];
  state.unread = 0;

  ensureContainers();
  mountBell();
  await bootstrap();
  connectStream();
};

window.addEventListener("hrm:face-updated", () => handleResolved({ type: "FACE_ENROLLMENT_REQUIRED" }));
