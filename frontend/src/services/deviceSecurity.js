import api from "./api.js";

export const checkDevicePermission = async (action) => {
  const fallback = {
    allowed: false,
    code: "PERMISSION_CHECK_FAILED",
    message: "Không thể kiểm tra quyền thiết bị. Vui lòng thử lại.",
    deviceName: null,
    clientIp: "",
    requireDeviceCheck: true,
    requireIpCheck: false,
  };
  try {
    const response = await api.get("/api/devices/check-permission", {
      params: { action },
      skipAuth: true,
      timeout: 8000,
    });
    return { ...fallback, ...(response.data || {}) };
  } catch (error) {
    const data = error.response?.data || {};
    return {
      ...fallback,
      code: data.code || fallback.code,
      message: data.message || fallback.message,
      clientIp: data.clientIp || "",
    };
  }
};

export const hideDeviceBlocked = () => {
  document.getElementById("hrmDeviceBlocked")?.remove();
};

export const showDeviceBlocked = (permission, onRetry) => {
  hideDeviceBlocked();
  const overlay = document.createElement("div");
  overlay.id = "hrmDeviceBlocked";
  overlay.className =
    "fixed inset-0 z-[190] flex items-center justify-center bg-slate-900/45 px-4 backdrop-blur-[2px]";
  const details = [
    permission.deviceName
      ? { icon: "devices", label: "Thiết bị", value: permission.deviceName }
      : null,
    permission.clientIp
      ? { icon: "language", label: "IP hiện tại", value: permission.clientIp }
      : null,
    permission.code ? { icon: "info", label: "Mã lỗi", value: permission.code } : null,
  ].filter(Boolean);
  const detailHtml = details.length
    ? `<div class="mt-space-md grid gap-2 rounded-lg bg-surface-container-low p-space-sm">
        ${details
          .map(
            (item) => `
          <div class="flex items-center gap-2 font-body-sm text-body-sm">
            <span class="material-symbols-outlined text-[18px] text-on-surface-variant">${item.icon}</span>
            <span class="text-on-surface-variant">${escapeHtml(item.label)}:</span>
            <span class="ml-auto font-medium text-on-surface text-right break-all">${escapeHtml(item.value)}</span>
          </div>`,
          )
          .join("")}
      </div>`
    : "";
  overlay.innerHTML = `
    <div class="w-full max-w-[440px] overflow-hidden rounded-xl bg-surface-container-lowest shadow-2xl ring-1 ring-black/5">
      <div class="bg-error-container/40 px-space-lg pt-space-lg pb-space-md">
        <div class="flex items-start gap-space-md">
          <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-error-container text-on-error-container shadow-sm">
            <span class="material-symbols-outlined text-[26px]">gpp_maybe</span>
          </span>
          <div class="min-w-0">
            <p class="font-label-lg text-label-lg font-semibold uppercase tracking-wide text-error">Truy cập bị chặn</p>
            <h2 class="mt-1 font-headline-sm text-headline-sm font-bold text-on-surface">Thiết bị chưa được cấp phép</h2>
          </div>
        </div>
      </div>
      <div class="px-space-lg pb-space-lg pt-space-md">
        <p class="font-body-md text-body-md leading-6 text-on-surface-variant">${escapeHtml(permission.message || "Thiết bị này chưa được cấp phép để thực hiện thao tác. Vui lòng liên hệ quản trị viên.")}</p>
        ${detailHtml}
        <div class="mt-space-lg flex flex-col-reverse gap-space-xs sm:flex-row sm:justify-end">
          <button type="button" data-device-blocked-close class="h-10 px-space-lg rounded-lg border border-outline-variant/60 text-on-surface-variant hover:bg-surface-container-high font-label-lg text-label-lg transition-colors">Đóng</button>
          <button type="button" data-device-blocked-retry class="inline-flex h-10 items-center justify-center gap-2 px-space-lg rounded-lg bg-primary text-white font-label-lg text-label-lg hover:opacity-90 transition-opacity">
            <span class="material-symbols-outlined text-[18px]">refresh</span>
            Kiểm tra lại
          </button>
        </div>
      </div>
    </div>
  `;
  const close = () => hideDeviceBlocked();
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.closest("[data-device-blocked-close]")) {
      close();
      return;
    }
    if (event.target.closest("[data-device-blocked-retry]")) {
      close();
      if (typeof onRetry === "function") onRetry();
    }
  });
  document.body.appendChild(overlay);
};

export const requireDevicePermission = async (action, onAllowed) => {
  const retry = async () => {
    const next = await checkDevicePermission(action);
    if (!next.allowed) {
      showDeviceBlocked(next, retry);
      return false;
    }
    hideDeviceBlocked();
    if (typeof onAllowed === "function") await onAllowed(next);
    return true;
  };
  return retry();
};

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[char],
  );

export const adminDevicesApi = {
  list: () => api.get("/api/admin/devices"),
  approveCurrent: (payload) => api.post("/api/admin/devices/approve-current", payload),
  update: (id, payload) => api.patch(`/api/admin/devices/${id}`, payload),
  remove: (id) => api.delete(`/api/admin/devices/${id}`),
  currentIp: () => api.get("/api/admin/security-settings/current-ip"),
  saveSettings: (payload) => api.put("/api/admin/security-settings", payload),
};
