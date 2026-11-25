import "../css/device-management.css";
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

const STATUS_META = {
  AUTHORIZED: { label: "Đã cấp phép", badge: "dm-badge-active", icon: "verified_user", tone: "text-emerald-700" },
  DEVICE_LOCKED: { label: "Đang bị khóa", badge: "dm-badge-inactive", icon: "lock", tone: "text-red-700" },
  DEVICE_IP_MISMATCH: { label: "Sai IP điểm danh", badge: "dm-badge-inactive", icon: "wrong_location", tone: "text-amber-700" },
  DEVICE_NOT_REGISTERED: { label: "Chưa cấp phép", badge: "dm-badge-mode", icon: "devices_off", tone: "text-slate-700" },
};

export const initQuanLyThietBi = (user = getCurrentUser()) => {
  if (!user || user.role_id !== "SUPER_ADMIN") return;
  const main = document.querySelector("main");
  if (!main) return;

  const doc = new DOMParser().parseFromString(deviceHtml, "text/html");
  main.replaceChildren(doc.getElementById("deviceWorkspace"));
  const root = document.getElementById("deviceWorkspace");
  if (!root) return;

  const q = (selector) => root.querySelector(selector);
  const qa = (selector) => Array.from(root.querySelectorAll(selector));
  const state = {
    devices: [],
    networkSettings: { office_allowed_ips: null, login_allowed_ips: null },
    currentClient: { ip: "", hasDeviceCookie: false, matchedDevice: null, attendanceStatus: "DEVICE_NOT_REGISTERED", effectiveAllowedIps: null },
  };

  const setNotice = (message = "", type = "info") => {
    const box = q("#deviceNotice");
    if (!box) return;
    if (!message) {
      box.className = "hidden";
      box.textContent = "";
      return;
    }
    const tones = { info: "bg-sky-50 text-sky-800", success: "bg-emerald-50 text-emerald-800", error: "bg-red-50 text-red-700" };
    box.className = `rounded-lg p-3 text-sm ${tones[type] || tones.info}`;
    box.textContent = message;
  };

  const setBusy = (busy) => {
    qa("button, input, select").forEach((el) => { el.disabled = busy; });
  };

  const renderCurrent = () => {
    const { currentClient, networkSettings } = state;
    const meta = STATUS_META[currentClient.attendanceStatus] || STATUS_META.DEVICE_NOT_REGISTERED;
    const matched = currentClient.matchedDevice;
    q("#deviceCurrentStatus").textContent = currentClient.attendanceStatus === "AUTHORIZED"
      ? `Thiết bị "${matched?.device_name || "hiện tại"}" đã cấp phép và sẵn sàng điểm danh.`
      : currentClient.attendanceStatus === "DEVICE_LOCKED"
        ? `Thiết bị "${matched?.device_name || "hiện tại"}" đang bị KHÓA quyền điểm danh.`
        : currentClient.attendanceStatus === "DEVICE_IP_MISMATCH"
          ? `Thiết bị "${matched?.device_name || "hiện tại"}" không đúng IP điểm danh được phép.`
          : "Máy này chưa được thêm vào hệ thống cấp phép điểm danh.";
    q("#deviceCurrentStatus").className = `font-body-md text-body-md font-semibold ${meta.tone}`;
    const badge = q("#deviceCurrentBadge");
    badge.className = `dm-badge ${meta.badge}`;
    badge.textContent = meta.label;
    q("#deviceCurrentIcon").innerHTML = `<span class="material-symbols-outlined text-[24px]">${meta.icon}</span>`;
    q("#deviceCurrentDetail").textContent = currentClient.attendanceStatus === "DEVICE_IP_MISMATCH"
      ? `IP hiện tại: ${currentClient.ip || "—"} | IP quy định: ${currentClient.effectiveAllowedIps || "—"}`
      : currentClient.attendanceStatus === "DEVICE_LOCKED"
        ? "Bạn có thể mở khóa nhanh để cho phép điểm danh lại ngay."
        : currentClient.attendanceStatus === "DEVICE_NOT_REGISTERED"
          ? "Máy lạ dù đúng IP công ty cũng bị chặn nếu chưa được cấp phép."
          : `IP hiện tại: ${currentClient.ip || "—"}`;
    q("#deviceCurrentIp").textContent = currentClient.ip || "—";
    q("#deviceCurrentMatch").textContent = matched?.device_name || "Không khớp";
    q("#deviceEffectiveIps").textContent = currentClient.effectiveAllowedIps || "Theo IP chung / Không giới hạn";

    const unlockBtn = q("#deviceUnlockBtn");
    const updateIpBtn = q("#deviceUpdateIpBtn");
    const approveBtn = q("#deviceApproveBtn");
    unlockBtn.classList.toggle("hidden", !(currentClient.attendanceStatus === "DEVICE_LOCKED" && matched));
    unlockBtn.classList.toggle("flex", currentClient.attendanceStatus === "DEVICE_LOCKED" && !!matched);
    updateIpBtn.classList.toggle("hidden", !(currentClient.attendanceStatus === "DEVICE_IP_MISMATCH" && matched));
    updateIpBtn.classList.toggle("flex", currentClient.attendanceStatus === "DEVICE_IP_MISMATCH" && !!matched);
    const canApprove = currentClient.attendanceStatus === "DEVICE_NOT_REGISTERED";
    approveBtn.classList.toggle("hidden", !canApprove);
    approveBtn.classList.toggle("flex", canApprove);
    approveBtn.disabled = !canApprove;

    q("#officeAllowedIpsInput").value = networkSettings.office_allowed_ips || "";
    q("#loginAllowedIpsInput").value = networkSettings.login_allowed_ips || "";
  };

  const renderTable = () => {
    const tbody = q("#devicesTableBody");
    if (!state.devices.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="py-4 px-3 text-center text-on-surface-variant">Chưa có thiết bị nào được cấp phép.</td></tr>`;
      return;
    }
    const currentId = state.currentClient.matchedDevice?.id;
    tbody.innerHTML = state.devices.map((device) => {
      const active = Boolean(device.is_active);
      const isCurrent = currentId === device.id;
      return `<tr class="hover:bg-surface-container-low/60">
        <td class="py-2.5 px-3 align-top">
          <div class="flex flex-wrap items-center gap-1">
            <span class="font-semibold text-on-surface">${escapeHtml(device.device_name)}</span>
            ${isCurrent ? `<span class="dm-badge dm-badge-active">Máy này</span>` : ""}
          </div>
          <div class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">${escapeHtml(device.location || "Chưa có vị trí")}</div>
          ${device.mac_note ? `<div class="font-body-sm text-body-sm text-on-surface-variant">MAC/Note: ${escapeHtml(device.mac_note)}</div>` : ""}
          ${device.note ? `<div class="font-body-sm text-body-sm text-on-surface-variant">${escapeHtml(device.note)}</div>` : ""}
        </td>
        <td class="py-2.5 px-3 align-top font-body-sm text-body-sm text-on-surface-variant break-all">
          ${escapeHtml(device.allowed_ip || "Theo IP chung / Không giới hạn")}
        </td>
        <td class="py-2.5 px-3 align-top">
          <div class="flex flex-wrap gap-1 mb-2">
            <span class="dm-badge ${device.allow_attendance ? "dm-badge-active" : "dm-badge-inactive"}">Điểm danh</span>
            <span class="dm-badge ${device.allow_face_enroll ? "dm-badge-active" : "dm-badge-mode"}">Đăng ký mặt</span>
          </div>
          <label class="dm-switch" title="${active ? "Khóa thiết bị" : "Mở khóa thiết bị"}">
            <input type="checkbox" data-toggle-device="${device.id}" ${active ? "checked" : ""} />
            <span class="dm-slider"></span>
          </label>
          <div class="mt-1 font-body-sm text-body-sm ${active ? "text-emerald-700" : "text-red-700"}">${active ? "Đang mở" : "Đang khóa"}</div>
        </td>
        <td class="py-2.5 px-3 align-top font-body-sm text-body-sm text-on-surface-variant">
          <div>${escapeHtml(formatDateTime(device.last_used_at))}</div>
          <div class="mt-0.5">IP: ${escapeHtml(device.last_ip || "—")}</div>
        </td>
        <td class="py-2.5 px-3 align-top text-right whitespace-nowrap">
          <button type="button" data-action="edit" data-device-id="${device.id}" class="inline-flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high" title="Sửa"><span class="material-symbols-outlined text-[18px]">edit</span></button>
          <button type="button" data-action="bind" data-device-id="${device.id}" class="inline-flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high" title="Gắn trình duyệt hiện tại"><span class="material-symbols-outlined text-[18px]">key</span></button>
          <button type="button" data-action="delete" data-device-id="${device.id}" class="inline-flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-red-50 hover:text-error" title="Xóa"><span class="material-symbols-outlined text-[18px]">delete</span></button>
        </td>
      </tr>`;
    }).join("");
  };

  const renderAll = () => { renderCurrent(); renderTable(); };

  const load = async (showMessage = false) => {
    setBusy(true);
    try {
      const response = await adminDevicesApi.list();
      const data = response.data?.data || {};
      state.devices = data.devices || [];
      state.networkSettings = data.networkSettings || state.networkSettings;
      state.currentClient = data.currentClient || state.currentClient;
      renderAll();
      if (showMessage) setNotice("Đã làm mới dữ liệu thiết bị.", "success");
    } catch (error) {
      setNotice(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const openForm = (device = null, { bindCurrent = false } = {}) => {
    q("#deviceFormId").value = device?.id || "";
    q("#deviceModalTitle").textContent = device ? "Cập nhật thiết bị" : "Thêm thiết bị";
    q("#deviceFormName").value = device?.device_name || "";
    q("#deviceFormLocation").value = device?.location || "";
    q("#deviceFormAllowedIp").value = device?.allowed_ip || "";
    q("#deviceFormMacNote").value = device?.mac_note || "";
    q("#deviceFormNote").value = device?.note || "";
    q("#deviceFormAllowAttendance").checked = device ? Boolean(device.allow_attendance) : true;
    q("#deviceFormAllowFaceEnroll").checked = device ? Boolean(device.allow_face_enroll) : false;
    q("#deviceFormBindCurrent").checked = bindCurrent || (!device && state.currentClient.attendanceStatus === "DEVICE_NOT_REGISTERED");
    q("#deviceModal").classList.remove("hidden");
  };
  const closeForm = () => q("#deviceModal").classList.add("hidden");

  const saveNetworkSettings = async (patch) => {
    setBusy(true);
    try {
      const response = await adminDevicesApi.saveNetworkSettings(patch);
      const data = response.data?.data || {};
      state.networkSettings = { ...state.networkSettings, ...data };
      setNotice("Đã cập nhật cấu hình IP.", "success");
      await load(false);
    } catch (error) {
      setNotice(errorMessage(error), "error");
    } finally { setBusy(false); }
  };

  q("#deviceRefreshBtn").addEventListener("click", () => load(true));
  q("#deviceApproveBtn").addEventListener("click", () => openForm(null, { bindCurrent: true }));
  q("#deviceAddBtn").addEventListener("click", () => openForm(null, { bindCurrent: false }));
  q("#deviceModalClose").addEventListener("click", closeForm);
  q("#deviceFormCancel").addEventListener("click", closeForm);
  q("#deviceModal").addEventListener("click", (e) => { if (e.target.id === "deviceModal") closeForm(); });

  q("#deviceUnlockBtn").addEventListener("click", async () => {
    const matched = state.currentClient.matchedDevice;
    if (!matched) return;
    setBusy(true);
    try {
      await adminDevicesApi.toggle(matched.id, true);
      setNotice("Đã mở khóa thiết bị.", "success");
      await load(false);
    } catch (error) { setNotice(errorMessage(error), "error"); } finally { setBusy(false); }
  });

  q("#deviceUpdateIpBtn").addEventListener("click", async () => {
    const matched = state.currentClient.matchedDevice;
    if (!matched) return;
    setBusy(true);
    try {
      await adminDevicesApi.update(matched.id, { ...matched, allowed_ip: state.currentClient.ip || "" });
      setNotice("Đã cập nhật IP hiện tại cho thiết bị.", "success");
      await load(false);
    } catch (error) { setNotice(errorMessage(error), "error"); } finally { setBusy(false); }
  });

  q("#officeGetIpBtn").addEventListener("click", () => { q("#officeAllowedIpsInput").value = state.currentClient.ip || ""; });
  q("#loginGetIpBtn").addEventListener("click", () => { q("#loginAllowedIpsInput").value = state.currentClient.ip || ""; });
  q("#officeSaveIpBtn").addEventListener("click", () => saveNetworkSettings({ office_allowed_ips: q("#officeAllowedIpsInput").value }));
  q("#loginSaveIpBtn").addEventListener("click", () => saveNetworkSettings({ login_allowed_ips: q("#loginAllowedIpsInput").value }));
  q("#officeClearIpBtn").addEventListener("click", () => { q("#officeAllowedIpsInput").value = ""; saveNetworkSettings({ office_allowed_ips: null }); });
  q("#loginClearIpBtn").addEventListener("click", () => { q("#loginAllowedIpsInput").value = ""; saveNetworkSettings({ login_allowed_ips: null }); });
  q("#deviceFormGetIp").addEventListener("click", () => { q("#deviceFormAllowedIp").value = state.currentClient.ip || ""; });

  q("#deviceForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = Number(q("#deviceFormId").value) || null;
    const payload = {
      device_name: q("#deviceFormName").value.trim(),
      location: q("#deviceFormLocation").value.trim() || null,
      allowed_ip: q("#deviceFormAllowedIp").value.trim() || null,
      mac_note: q("#deviceFormMacNote").value.trim() || null,
      note: q("#deviceFormNote").value.trim() || null,
      allow_attendance: q("#deviceFormAllowAttendance").checked,
      allow_face_enroll: q("#deviceFormAllowFaceEnroll").checked,
    };
    const bindCurrent = q("#deviceFormBindCurrent").checked;
    if (!payload.device_name) { setNotice("Vui lòng nhập tên thiết bị.", "error"); return; }

    setBusy(true);
    try {
      if (id) {
        await adminDevicesApi.update(id, payload);
        if (bindCurrent) await adminDevicesApi.bindCurrent(id);
        setNotice("Đã cập nhật thiết bị.", "success");
      } else {
        await adminDevicesApi.create({ ...payload, bindCurrentBrowser: bindCurrent });
        setNotice("Đã thêm thiết bị.", "success");
      }
      closeForm();
      await load(false);
    } catch (error) {
      setNotice(errorMessage(error), "error");
    } finally { setBusy(false); }
  });

  q("#devicesTableBody").addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-action]");
    if (!btn) return;
    const id = Number(btn.getAttribute("data-device-id"));
    const device = state.devices.find((d) => d.id === id);
    if (!device) return;
    const action = btn.getAttribute("data-action");

    if (action === "edit") return openForm(device);
    if (action === "bind") {
      if (!window.confirm(`Gắn trình duyệt hiện tại vào "${device.device_name}"?`)) return;
      setBusy(true);
      try { await adminDevicesApi.bindCurrent(id); setNotice("Đã gắn trình duyệt hiện tại.", "success"); await load(false); }
      catch (error) { setNotice(errorMessage(error), "error"); } finally { setBusy(false); }
      return;
    }
    if (action === "delete") {
      if (!window.confirm(`Xóa thiết bị "${device.device_name}"?`)) return;
      setBusy(true);
      try { await adminDevicesApi.remove(id); setNotice("Đã xóa thiết bị.", "success"); await load(false); }
      catch (error) { setNotice(errorMessage(error), "error"); } finally { setBusy(false); }
    }
  });

  q("#devicesTableBody").addEventListener("change", async (event) => {
    const input = event.target.closest("[data-toggle-device]");
    if (!input) return;
    const id = Number(input.getAttribute("data-toggle-device"));
    setBusy(true);
    try {
      await adminDevicesApi.toggle(id, input.checked);
      setNotice(input.checked ? "Đã mở khóa thiết bị." : "Đã khóa thiết bị.", "success");
      await load(false);
    } catch (error) { setNotice(errorMessage(error), "error"); await load(false); }
    finally { setBusy(false); }
  });

  qa("aside nav a[data-path]").forEach((link) => {
    const active = link.getAttribute("data-path") === "quan-ly-thiet-bi";
    link.classList.toggle("bg-secondary-fixed", active);
    link.classList.toggle("text-on-secondary-fixed", active);
    link.classList.toggle("font-bold", active);
    if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  });

  load();
};
