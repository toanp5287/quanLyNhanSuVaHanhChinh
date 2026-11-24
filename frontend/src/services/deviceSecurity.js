import api from "./api.js";

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char],
  );

const DEVICE_ERROR_META = {
  DEVICE_NOT_REGISTERED: {
    title: "Thiết bị chưa được cấp phép",
    tone: "error",
    icon: "devices_off",
  },
  DEVICE_LOCKED: {
    title: "Thiết bị đang bị khóa",
    tone: "warn",
    icon: "lock",
  },
  DEVICE_IP_MISMATCH: {
    title: "IP không được phép điểm danh",
    tone: "warn",
    icon: "wrong_location",
  },
  DEVICE_FACE_ENROLL_DENIED: {
    title: "Chưa có quyền đăng ký FaceID",
    tone: "warn",
    icon: "face_retouching_off",
  },
};

export const checkDevicePermission = async (action) => {
  const fallback = {
    allowed: false,
    code: "PERMISSION_CHECK_FAILED",
    message: "Không thể kiểm tra quyền thiết bị. Vui lòng thử lại.",
    deviceName: null,
    clientIp: "",
    allowedIps: null,
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
      ...data,
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
  const meta = DEVICE_ERROR_META[permission.code] || {
    title: "Truy cập bị chặn",
    tone: "error",
    icon: "gpp_maybe",
  };
  const toneClass = meta.tone === "warn" ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-900";
  const badgeClass = meta.tone === "warn" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800";

  const overlay = document.createElement("div");
  overlay.id = "hrmDeviceBlocked";
  overlay.className =
    "fixed inset-0 z-[190] flex items-center justify-center bg-slate-900/45 px-4 backdrop-blur-[2px]";

  const detailRows = [
    permission.deviceName ? ["Thiết bị", permission.deviceName] : null,
    permission.clientIp ? ["IP hiện tại", permission.clientIp] : null,
    permission.allowedIps ? ["IP được phép", permission.allowedIps] : null,
    permission.code ? ["Mã lỗi", permission.code] : null,
  ].filter(Boolean);

  overlay.innerHTML = `
    <div class="w-full max-w-[460px] overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5">
      <div class="${toneClass} px-5 py-4 border-b border-black/5">
        <div class="flex items-start gap-3">
          <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${badgeClass}">
            <span class="material-symbols-outlined text-[24px]">${meta.icon}</span>
          </span>
          <div class="min-w-0">
            <p class="text-xs font-semibold uppercase tracking-wide opacity-80">Kiểm soát thiết bị & mạng</p>
            <h2 class="mt-1 text-lg font-bold">${escapeHtml(meta.title)}</h2>
          </div>
        </div>
      </div>
      <div class="px-5 py-4">
        <p class="text-sm leading-6 text-slate-700">${escapeHtml(permission.message || "Thiết bị này không được phép thực hiện thao tác.")}</p>
        ${detailRows.length ? `
          <div class="mt-4 rounded-lg bg-slate-50 p-3 space-y-2 text-sm">
            ${detailRows.map(([label, value]) => `
              <div class="flex items-start justify-between gap-3">
                <span class="text-slate-500">${escapeHtml(label)}</span>
                <span class="font-medium text-slate-900 text-right break-all">${escapeHtml(value)}</span>
              </div>`).join("")}
          </div>` : ""}
        <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" data-device-blocked-close class="h-10 px-4 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium">Đóng</button>
          <button type="button" data-device-blocked-retry class="h-10 px-4 rounded-lg bg-[#0B57D0] text-white hover:opacity-90 text-sm font-medium inline-flex items-center justify-center gap-2">
            <span class="material-symbols-outlined text-[18px]">refresh</span>Kiểm tra lại
          </button>
        </div>
      </div>
    </div>`;

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

export const adminDevicesApi = {
  list: (params = {}) => api.get("/api/admin/devices", { params }),
  create: (payload) => api.post("/api/admin/devices", payload),
  update: (id, payload) => api.put(`/api/admin/devices/${id}`, payload),
  toggle: (id, isActive) => api.patch(`/api/admin/devices/${id}/toggle`, { is_active: isActive }),
  bindCurrent: (id) => api.post(`/api/admin/devices/${id}/bind-current`),
  remove: (id) => api.delete(`/api/admin/devices/${id}`),
  saveNetworkSettings: (payload) => api.patch("/api/admin/devices/network-settings", payload),
};
