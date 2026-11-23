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
  overlay.className = "fixed inset-0 z-[190] flex items-center justify-center bg-black/50 px-4";
  const detail = [
    permission.code ? `Mã: ${permission.code}` : "",
    permission.clientIp ? `IP hiện tại: ${permission.clientIp}` : "",
  ]
    .filter(Boolean)
    .join(" • ");
  overlay.innerHTML = `
    <div class="w-full max-w-md rounded-lg bg-surface-container-lowest p-space-lg shadow-xl">
      <div class="flex items-start gap-space-md">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-error-container text-on-error-container">
          <span class="material-symbols-outlined text-[22px]">device_lock</span>
        </span>
        <div>
          <p class="font-headline-sm text-headline-sm font-bold text-on-surface">Thiết bị chưa được phép</p>
          <p class="mt-1 font-body-sm text-body-sm text-on-surface-variant">${escapeHtml(permission.message || "")}</p>
          ${detail ? `<p class="mt-2 font-body-sm text-body-sm text-on-surface-variant">${escapeHtml(detail)}</p>` : ""}
        </div>
      </div>
      <div class="mt-space-lg flex justify-end gap-space-xs">
        <button type="button" data-device-blocked-close class="h-9 px-space-md rounded text-on-surface-variant hover:bg-surface-container-high font-label-lg text-label-lg">Đóng</button>
        <button type="button" data-device-blocked-retry class="h-9 px-space-md rounded bg-primary text-white font-label-lg text-label-lg hover:opacity-90">Thử kiểm tra lại</button>
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
