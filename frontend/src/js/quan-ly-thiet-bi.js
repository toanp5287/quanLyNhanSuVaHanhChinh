import deviceHtml from "../pages/quan-ly-thiet-bi.html?raw";
import { adminDevicesApi } from "../services/deviceSecurity.js";
import { getCurrentUser } from "../services/auth.service.js";

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char],
  );

const formatDateTime = (value) =>
  value ? String(value).replace("T", " ").slice(0, 19) : "Chưa từng sử dụng";

const errorMessage = (error) =>
  error.response?.data?.message ||
  (error.response ? `Máy chủ không xử lý được yêu cầu (HTTP ${error.response.status}).` : "Không thể kết nối máy chủ.");

export const initQuanLyThietBi = (user = getCurrentUser()) => {
  if (!user || user.role_id !== "SUPER_ADMIN") return;
  const main = document.querySelector("main");
  if (!main) return;

  const doc = new DOMParser().parseFromString(deviceHtml, "text/html");
  main.replaceChildren(doc.getElementById("deviceWorkspace"));
  const root = document.getElementById("deviceWorkspace");
  if (!root) return;

  const q = (selector) => root.querySelector(selector);
  const state = {
    devices: [],
    settings: { require_device_check: true, require_ip_check: false, allowed_ips: [] },
    currentIp: "",
  };

  const setNotice = (message = "", type = "info") => {
    const box = q("#deviceNotice");
    if (!box) return;
    if (!message) {
      box.className = "hidden";
      box.textContent = "";
      return;
    }
    const tones = {
      info: "bg-sky-50 text-sky-800",
      success: "bg-emerald-50 text-emerald-800",
      error: "bg-red-50 text-red-700",
    };
    box.className = `rounded-lg p-3 text-sm ${tones[type] || tones.info}`;
    box.textContent = message;
  };

  const setBusy = (busy) => {
    [
      "#deviceApproveBtn",
      "#deviceRefreshBtn",
      "#deviceAddIpBtn",
      "#deviceRefreshIpBtn",
      "#deviceSaveSettingsBtn",
    ].forEach((selector) => {
      const button = q(selector);
      if (button) button.disabled = busy;
    });
  };

  const renderCurrentStatus = () => {
    const current = state.devices.find((device) => device.is_current_device);
    const box = q("#deviceCurrentStatus");
    if (!box) return;
    if (!current) {
      box.className = "mt-space-md rounded bg-amber-50 px-3 py-2 font-body-sm text-body-sm text-amber-800";
      box.textContent = "Máy này CHƯA được cấp phép. Các màn hình điểm danh / Face ID sẽ bị chặn.";
      return;
    }
    const rights = [
      current.allow_attendance ? "Điểm danh" : null,
      current.allow_face_enroll ? "Face ID" : null,
    ].filter(Boolean).join(", ") || "không có quyền chức năng";
    box.className = `mt-space-md rounded px-3 py-2 font-body-sm text-body-sm ${current.is_active ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`;
    box.textContent = `${current.is_active ? "Máy này ĐÃ được cấp phép" : "Máy này đã bị KHÓA"} • ${current.device_name} • Quyền: ${rights}`;
  };

  const renderIps = () => {
    const list = q("#deviceIpsList");
    if (!list) return;
    const ips = state.settings.allowed_ips || [];
    if (!ips.length) {
      list.innerHTML = `<p class="rounded bg-surface-container-low px-3 py-2 font-body-sm text-body-sm text-on-surface-variant">Chưa có IP nào trong danh sách.</p>`;
      return;
    }
    list.innerHTML = ips
      .map(
        (ip, index) => `
        <div class="flex items-center justify-between rounded bg-surface-container-low px-3 py-2">
          <span class="font-body-sm text-body-sm text-on-surface">${escapeHtml(ip)}${ip === state.currentIp ? " • IP hiện tại" : ""}</span>
          <button type="button" data-remove-ip="${index}" class="text-on-surface-variant hover:text-error" title="Xóa IP">
            <span class="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>`,
      )
      .join("");
  };

  const renderDevices = () => {
    const tbody = q("#devicesTableBody");
    if (!tbody) return;
    if (!state.devices.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="py-4 px-3 text-center text-on-surface-variant">Chưa có thiết bị nào được cấp phép.</td></tr>`;
      return;
    }
    const toggle = (device, field, checked) => `
      <input type="checkbox" data-device-id="${device.id}" data-field="${field}" ${checked ? "checked" : ""} class="h-4 w-4 accent-[var(--md-sys-color-primary)]" />`;
    tbody.innerHTML = state.devices
      .map((device) => {
        const usedAt = device.last_used_at ? formatDateTime(device.last_used_at) : "Chưa từng sử dụng";
        return `<tr class="hover:bg-surface-container-low/60">
          <td class="py-2.5 px-3 font-semibold text-on-surface">
            ${escapeHtml(device.device_name)}
            ${device.is_current_device ? '<span class="ml-1 rounded bg-primary-fixed px-2 py-0.5 text-[11px] text-on-primary-fixed">Máy này</span>' : ""}
            ${device.mac_note ? `<span class="block font-body-sm text-body-sm text-on-surface-variant">${escapeHtml(device.mac_note)}</span>` : ""}
            ${device.note ? `<span class="block font-body-sm text-body-sm text-on-surface-variant">${escapeHtml(device.note)}</span>` : ""}
          </td>
          <td class="py-2.5 px-3">${toggle(device, "allow_attendance", device.allow_attendance)}</td>
          <td class="py-2.5 px-3">${toggle(device, "allow_face_enroll", device.allow_face_enroll)}</td>
          <td class="py-2.5 px-3">
            <label class="flex items-center gap-2 font-body-sm text-body-sm ${device.is_active ? "text-emerald-700" : "text-red-700"}">
              ${toggle(device, "is_active", device.is_active)}
              ${device.is_active ? "Hoạt động" : "Đã khóa"}
            </label>
          </td>
          <td class="py-2.5 px-3 text-on-surface-variant">${escapeHtml(usedAt)}</td>
          <td class="py-2.5 px-3 text-on-surface-variant">${escapeHtml(device.last_ip || "—")}</td>
          <td class="py-2.5 px-3 text-right">
            <button type="button" data-delete-device="${device.id}" class="text-on-surface-variant hover:text-error" title="Xóa / thu hồi">
              <span class="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </td>
        </tr>`;
      })
      .join("");
  };

  const renderAll = () => {
    const ipInput = q("#deviceCurrentIp");
    if (ipInput) ipInput.textContent = state.currentIp || "—";
    const requireIp = q("#deviceRequireIpCheck");
    if (requireIp) requireIp.checked = Boolean(state.settings.require_ip_check);
    renderCurrentStatus();
    renderIps();
    renderDevices();
  };

  const load = async (showMessage = false) => {
    setBusy(true);
    try {
      const response = await adminDevicesApi.list();
      const data = response.data?.data || {};
      state.devices = data.devices || [];
      state.settings = data.settings || state.settings;
      state.currentIp = data.current_ip || "";
      renderAll();
      if (showMessage) setNotice("Đã làm mới dữ liệu thiết bị.", "success");
      else setNotice();
    } catch (error) {
      setNotice(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const refreshCurrentIp = async () => {
    try {
      const response = await adminDevicesApi.currentIp();
      state.currentIp = response.data?.data?.current_ip || "";
      const box = q("#deviceCurrentIp");
      if (box) box.textContent = state.currentIp || "—";
      setNotice("Đã cập nhật IP hiện tại.", "success");
      renderIps();
    } catch (error) {
      setNotice(errorMessage(error), "error");
    }
  };

  const persistSettings = async () => {
    const allowedIps = state.settings.allowed_ips || [];
    const requireIpCheck = Boolean(q("#deviceRequireIpCheck")?.checked);
    setBusy(true);
    try {
      const response = await adminDevicesApi.saveSettings({
        require_device_check: state.settings.require_device_check !== false,
        require_ip_check: requireIpCheck,
        allowed_ips: allowedIps,
      });
      state.settings = response.data?.data || state.settings;
      renderAll();
      setNotice("Đã lưu cấu hình bảo mật.", "success");
    } catch (error) {
      const requireIp = q("#deviceRequireIpCheck");
      if (requireIp) requireIp.checked = Boolean(state.settings.require_ip_check);
      setNotice(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  q("#deviceRefreshBtn")?.addEventListener("click", () => load(true));
  q("#deviceRefreshIpBtn")?.addEventListener("click", refreshCurrentIp);

  q("#deviceApproveBtn")?.addEventListener("click", async () => {
    const name = q("#deviceName")?.value.trim();
    if (!name) {
      setNotice("Vui lòng nhập tên máy trước khi cấp phép.", "error");
      return;
    }
    setBusy(true);
    try {
      await adminDevicesApi.approveCurrent({
        device_name: name,
        allow_attendance: Boolean(q("#deviceAllowAttendance")?.checked),
        allow_face_enroll: Boolean(q("#deviceAllowFaceEnroll")?.checked),
        mac_note: q("#deviceMacNote")?.value.trim() || null,
        note: q("#deviceNote")?.value.trim() || null,
      });
      await load(false);
      setNotice("Đã cấp phép cho máy này. Cookie thiết bị đã được lưu trên trình duyệt.", "success");
    } catch (error) {
      setNotice(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  });

  q("#deviceAddIpBtn")?.addEventListener("click", async () => {
    if (!state.currentIp) {
      setNotice("Chưa xác định được IP hiện tại. Vui lòng cập nhật IP.", "error");
      return;
    }
    const ips = Array.from(new Set([...(state.settings.allowed_ips || []), state.currentIp]));
    state.settings = { ...state.settings, allowed_ips: ips };
    renderIps();
    await persistSettings();
  });

  q("#deviceIpsList")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-remove-ip]");
    if (!button) return;
    const index = Number(button.getAttribute("data-remove-ip"));
    state.settings = {
      ...state.settings,
      allowed_ips: (state.settings.allowed_ips || []).filter((_, i) => i !== index),
    };
    renderIps();
    await persistSettings();
  });

  q("#deviceRequireIpCheck")?.addEventListener("change", (event) => {
    state.settings = { ...state.settings, require_ip_check: event.target.checked };
    void persistSettings();
  });

  q("#deviceSaveSettingsBtn")?.addEventListener("click", persistSettings);

  q("#devicesTableBody")?.addEventListener("change", async (event) => {
    const input = event.target.closest("input[data-device-id][data-field]");
    if (!input) return;
    const id = Number(input.getAttribute("data-device-id"));
    const field = input.getAttribute("data-field");
    setBusy(true);
    try {
      await adminDevicesApi.update(id, { [field]: input.checked });
      await load(false);
      setNotice("Đã cập nhật thiết bị.", "success");
    } catch (error) {
      setNotice(errorMessage(error), "error");
      await load(false);
    } finally {
      setBusy(false);
    }
  });

  q("#devicesTableBody")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-device]");
    if (!button) return;
    const id = Number(button.getAttribute("data-delete-device"));
    if (!window.confirm("Thu hồi quyền của thiết bị này? Thiết bị đã có lịch sử sẽ bị khóa thay vì xóa.")) return;
    setBusy(true);
    try {
      const response = await adminDevicesApi.remove(id);
      await load(false);
      setNotice(response.data?.message || "Đã thu hồi thiết bị.", "success");
    } catch (error) {
      setNotice(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  });

  document.querySelectorAll("aside nav a[data-path]").forEach((link) => {
    const active = link.getAttribute("data-path") === "quan-ly-thiet-bi";
    link.classList.toggle("bg-secondary-fixed", active);
    link.classList.toggle("text-on-secondary-fixed", active);
    link.classList.toggle("font-bold", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  load();
};
