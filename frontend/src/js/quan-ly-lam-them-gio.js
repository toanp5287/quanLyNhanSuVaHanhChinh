import api from "../services/api.js";
import { getCurrentUser, hasPermission } from "../services/auth.service.js";

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char],
  );

const formatNumber = (value) => Number(value || 0).toFixed(2);
const formatTime = (value) => (value ? String(value).slice(0, 5) : "-");
const currentMonth = () => new Date().toISOString().slice(0, 7);

const apiErrorMessage = (error) => {
  if (error.response?.data?.message) return error.response.data.message;
  if (error.response?.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (error.response?.status === 403) return "Bạn không có quyền thực hiện thao tác này.";
  if (error.response?.status === 404) return "Không tìm thấy API tăng ca. Vui lòng khởi động lại backend.";
  if (error.response?.status === 409) return "Đơn OT bị trùng khung giờ hoặc đã được xử lý.";
  if (error.response) return `Máy chủ không xử lý được yêu cầu (HTTP ${error.response.status}).`;
  return "Không thể kết nối máy chủ. Kiểm tra backend đang chạy.";
};

const statusBadge = (status) => {
  const tone = {
    PENDING: "bg-amber-100 text-amber-800",
    APPROVED: "bg-emerald-100 text-emerald-800",
    REJECTED: "bg-red-100 text-red-700",
  }[status] || "bg-surface-container text-on-surface-variant";
  const label = {
    PENDING: "Chờ duyệt",
    APPROVED: "Đã duyệt",
    REJECTED: "Từ chối",
  }[status] || status;
  return `<span class="rounded px-2 py-0.5 text-xs ${tone}">${escapeHtml(label)}</span>`;
};

const normalizeTime = (value) => {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const computeRequestedHours = (start, end) => {
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return 0;
  const toMinutes = (value) => {
    const [hour, minute] = value.split(":").map(Number);
    return hour * 60 + minute;
  };
  return Math.round((Math.max(0, toMinutes(end) - toMinutes(start)) / 60) * 100) / 100;
};

export function initQuanLyLamThemGio(user = getCurrentUser()) {
  const main = document.querySelector("main");
  if (!main) return;

  const canManage = hasPermission("ATT.SHIFT_OT_MANAGE", user);
  const canCreate = Boolean(user?.employee_id);
  const wrapper = document.createElement("section");
  wrapper.id = "otWorkspace";
  wrapper.className = "flex flex-col gap-4 pb-6";
  wrapper.innerHTML = `
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold text-on-surface">Làm thêm giờ (OT)</h1>
        <p id="otScope" class="text-sm text-on-surface-variant mt-1"></p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" id="btnRefreshOt" class="h-9 px-space-md rounded border text-on-surface hover:bg-surface-container-high text-label-md">Làm mới</button>
        <button type="button" id="btnCreateOt" class="h-9 px-space-md rounded bg-primary text-on-primary hover:bg-primary-container font-semibold text-label-md">Tạo đơn OT</button>
      </div>
    </div>

    <div id="otNotice" class="hidden rounded p-3 text-sm"></div>

    <div class="flex flex-wrap items-end gap-3 rounded border border-surface-variant bg-surface-container-lowest p-3">
      <label class="text-sm">Kỳ công
        <input id="otMonth" type="month" value="${currentMonth()}" class="block rounded border border-surface-variant px-3 py-2 mt-1 bg-surface" />
      </label>
      <label class="text-sm">Trạng thái
        <select id="otStatus" class="block rounded border border-surface-variant px-3 py-2 mt-1 bg-surface">
          <option value="">Tất cả</option>
          <option value="PENDING">Chờ duyệt</option>
          <option value="APPROVED">Đã duyệt</option>
          <option value="REJECTED">Từ chối</option>
        </select>
      </label>
      <p class="text-xs text-on-surface-variant ml-auto">Giờ xin được tự tính từ khung giờ; giờ ghi nhận và hệ số (1.5x / 2.0x / 3.0x) được chốt sau khi đối chiếu chấm công.</p>
    </div>

    <div id="otMetrics" class="grid grid-cols-2 md:grid-cols-4 gap-3"></div>

    <div class="overflow-x-auto rounded border border-surface-variant bg-surface-container-lowest">
      <table class="w-full text-sm">
        <thead class="bg-surface-container-low text-on-surface-variant">
          <tr>
            <th class="text-left px-3 py-2">Mã đơn</th>
            <th class="text-left px-3 py-2">Nhân viên</th>
            <th class="text-left px-3 py-2">Ngày / khung giờ</th>
            <th class="text-right px-3 py-2">Giờ xin</th>
            <th class="text-right px-3 py-2">Giờ ghi nhận</th>
            <th class="text-left px-3 py-2">Loại</th>
            <th class="text-left px-3 py-2">Trạng thái</th>
            <th class="text-left px-3 py-2">Lý do từ chối</th>
            <th class="text-left px-3 py-2">Thao tác</th>
          </tr>
        </thead>
        <tbody id="otBody" class="divide-y divide-surface-container"></tbody>
      </table>
    </div>

    <div id="otFormModal" class="hidden fixed inset-0 z-[150] bg-black/50 items-center justify-center p-4">
      <form id="otForm" class="w-full max-w-lg rounded-xl bg-surface-container-lowest p-5 flex flex-col gap-3">
        <h3 class="font-bold text-lg">Đăng ký làm thêm giờ</h3>
        <p class="text-xs text-on-surface-variant">Chỉ bấm chấm công đầu ca và cuối ca OT. Khoảng nghỉ trước giờ OT sẽ tự động bị loại.</p>
        <label class="text-sm">Ngày làm OT
          <input id="otDate" name="ot_date" type="date" required class="block w-full rounded border border-surface-variant px-3 py-2 mt-1 bg-surface" />
        </label>
        <div class="grid grid-cols-2 gap-3">
          <label class="text-sm">Từ
            <input id="otStart" name="start_time" type="text" inputmode="numeric" maxlength="5" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" placeholder="17:30" title="Giờ 24h, định dạng HH:MM" required class="block w-full rounded border border-surface-variant px-3 py-2 mt-1 bg-surface" />
          </label>
          <label class="text-sm">Đến
            <input id="otEnd" name="end_time" type="text" inputmode="numeric" maxlength="5" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" placeholder="20:30" title="Giờ 24h, định dạng HH:MM" required class="block w-full rounded border border-surface-variant px-3 py-2 mt-1 bg-surface" />
          </label>
        </div>
        <p id="otHint" class="text-xs text-on-surface-variant"></p>
        <label class="text-sm">Lý do
          <textarea id="otReason" name="reason" rows="3" required maxlength="500" class="block w-full rounded border border-surface-variant px-3 py-2 mt-1 bg-surface"></textarea>
        </label>
        <div class="flex justify-end gap-2 pt-1">
          <button type="button" data-close-ot-form class="h-9 px-space-md rounded text-on-surface-variant hover:bg-surface-container-high">Hủy</button>
          <button type="submit" id="btnSaveOt" class="h-9 px-space-md rounded bg-primary text-on-primary hover:opacity-90 font-semibold">Gửi đơn</button>
        </div>
      </form>
    </div>

    <div id="otRejectModal" class="hidden fixed inset-0 z-[150] bg-black/50 items-center justify-center p-4">
      <div class="w-full max-w-md rounded-xl bg-surface-container-lowest p-5 flex flex-col gap-3">
        <h3 class="font-bold text-lg">Từ chối đơn OT</h3>
        <textarea id="otRejectReason" rows="3" maxlength="255" placeholder="Nhập lý do từ chối" class="rounded border border-surface-variant px-3 py-2 bg-surface"></textarea>
        <div class="flex justify-end gap-2">
          <button type="button" data-close-ot-reject class="h-9 px-space-md rounded text-on-surface-variant hover:bg-surface-container-high">Hủy</button>
          <button type="button" id="btnConfirmReject" class="h-9 px-space-md rounded bg-error text-on-error hover:opacity-90">Xác nhận</button>
        </div>
      </div>
    </div>
  `;
  main.replaceChildren(wrapper);

  const q = (selector) => wrapper.querySelector(selector);
  const qa = (selector) => Array.from(wrapper.querySelectorAll(selector));
  const state = { rows: [], rejectId: null, busy: false };

  q("#otScope").textContent = canManage
    ? "Quản lý đơn tăng ca của nhân viên trong phạm vi phụ trách."
    : "Đăng ký và theo dõi đơn tăng ca của chính bạn.";
  if (!canCreate) q("#btnCreateOt").disabled = true;

  const setNotice = (message = "", type = "info") => {
    const box = q("#otNotice");
    if (!message) {
      box.className = "hidden rounded p-3 text-sm";
      box.textContent = "";
      return;
    }
    const tone =
      type === "error"
        ? "bg-red-50 text-red-700 border border-red-200"
        : type === "success"
          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
          : "bg-sky-50 text-sky-800 border border-sky-200";
    box.className = `rounded p-3 text-sm ${tone}`;
    box.textContent = message;
  };

  const setBusy = (busy) => {
    state.busy = busy;
    qa("button, input, select, textarea").forEach((element) => {
      element.disabled = busy || (element.id === "btnCreateOt" && !canCreate);
    });
  };

  const openModal = (id, focusId) => {
    const modal = q(id);
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    q(focusId)?.focus();
  };

  const closeModal = (id) => {
    const modal = q(id);
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  };

  const renderMetrics = () => {
    const rows = state.rows;
    const pending = rows.filter((row) => row.status === "PENDING").length;
    const approvedHours = rows
      .filter((row) => row.status === "APPROVED")
      .reduce((total, row) => total + Number(row.actual_ot_hours || 0), 0);
    const rejected = rows.filter((row) => row.status === "REJECTED").length;
    const items = [
      ["Tổng đơn", rows.length],
      ["Chờ duyệt", pending],
      ["Giờ OT đã chốt", formatNumber(approvedHours)],
      ["Bị từ chối", rejected],
    ];
    q("#otMetrics").innerHTML = items
      .map(
        ([label, value]) => `
          <div class="rounded border border-surface-variant bg-surface-container-lowest p-3">
            <p class="text-xs text-on-surface-variant">${escapeHtml(label)}</p>
            <p class="text-lg font-bold mt-1">${escapeHtml(value)}</p>
          </div>`,
      )
      .join("");
  };

  const renderRows = () => {
    const body = q("#otBody");
    if (!state.rows.length) {
      body.innerHTML = `<tr><td colspan="9" class="px-3 py-6 text-center text-on-surface-variant">Không có đơn OT trong kỳ này.</td></tr>`;
      renderMetrics();
      return;
    }
    body.innerHTML = state.rows
      .map((row) => {
        const actions = [];
        if (row.status === "PENDING") {
          if (canManage) {
            actions.push(`<button type="button" data-action="approve" data-id="${row.id}" class="px-2 py-1 rounded bg-emerald-600 text-white hover:opacity-90">Duyệt</button>`);
            actions.push(`<button type="button" data-action="reject" data-id="${row.id}" class="px-2 py-1 rounded border border-error text-error hover:bg-error-container">Từ chối</button>`);
          }
          if (Number(row.employee_id) === Number(user?.employee_id)) {
            actions.push(`<button type="button" data-action="cancel" data-id="${row.id}" class="px-2 py-1 rounded border border-surface-variant hover:bg-surface-container-high">Hủy</button>`);
          }
        }
        return `
          <tr class="hover:bg-surface-container-low">
            <td class="px-3 py-2 font-medium">${escapeHtml(row.ot_code)}</td>
            <td class="px-3 py-2">${escapeHtml(row.full_name)}<div class="text-xs text-on-surface-variant">${escapeHtml(row.employee_code)}</div></td>
            <td class="px-3 py-2">${escapeHtml(row.ot_date)}<div class="text-xs text-on-surface-variant">${formatTime(row.start_time)} - ${formatTime(row.end_time)}</div></td>
            <td class="px-3 py-2 text-right">${formatNumber(row.requested_hours)}</td>
            <td class="px-3 py-2 text-right font-semibold">${row.actual_ot_hours === null || row.actual_ot_hours === undefined ? "—" : formatNumber(row.actual_ot_hours)}</td>
            <td class="px-3 py-2">${escapeHtml(row.ot_type || "-")} <span class="text-xs text-on-surface-variant">${formatNumber(row.multiplier)}x</span></td>
            <td class="px-3 py-2">${statusBadge(row.status)}</td>
            <td class="px-3 py-2 text-xs text-on-surface-variant">${row.reject_reason ? escapeHtml(row.reject_reason) : "—"}</td>
            <td class="px-3 py-2"><div class="flex flex-wrap gap-1">${actions.join("") || "—"}</div></td>
          </tr>`;
      })
      .join("");
    renderMetrics();
  };

  const load = async (showMessage = false) => {
    const month = q("#otMonth").value;
    const status = q("#otStatus").value;
    if (!month) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await api.get("/overtime", { params: { month, ...(status ? { status } : {}) } });
      state.rows = Array.isArray(response.data?.data) ? response.data.data : [];
      renderRows();
      if (showMessage) setNotice("Đã tải danh sách OT.", "success");
    } catch (error) {
      setNotice(apiErrorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (action, id, payload = {}, successMessage) => {
    setBusy(true);
    setNotice("");
    try {
      if (action === "approve") await api.patch(`/overtime/${id}/approve`, payload);
      if (action === "reject") await api.patch(`/overtime/${id}/reject`, payload);
      if (action === "cancel") await api.delete(`/overtime/${id}`);
      closeModal("#otRejectModal");
      setNotice(successMessage, "success");
      await load();
    } catch (error) {
      setNotice(apiErrorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  q("#btnRefreshOt").addEventListener("click", () => load(true));
  q("#otMonth").addEventListener("change", () => load());
  q("#otStatus").addEventListener("change", () => load());

  q("#btnCreateOt").addEventListener("click", () => {
    const form = q("#otForm");
    form.reset();
    q("#otDate").value = new Date().toISOString().slice(0, 10);
    q("#otHint").textContent = "";
    openModal("#otFormModal", "#otDate");
  });

  qa("[data-close-ot-form]").forEach((button) =>
    button.addEventListener("click", () => closeModal("#otFormModal")),
  );
  qa("[data-close-ot-reject]").forEach((button) =>
    button.addEventListener("click", () => closeModal("#otRejectModal")),
  );

  const updateHint = () => {
    const start = normalizeTime(q("#otStart").value);
    const end = normalizeTime(q("#otEnd").value);
    const hours = computeRequestedHours(start || "", end || "");
    q("#otHint").textContent = hours > 0 ? `Giờ xin: ${formatNumber(hours)} giờ (24h). Hệ số sẽ tự động theo ngày lễ/ca làm.` : "";
  };
  q("#otStart").addEventListener("change", updateHint);
  q("#otEnd").addEventListener("change", updateHint);

  q("#otForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const start = normalizeTime(q("#otStart").value);
    const end = normalizeTime(q("#otEnd").value);
    if (!start || !end) {
      setNotice("Nhập giờ theo định dạng 24h, ví dụ 17:30.", "error");
      return;
    }
    q("#otStart").value = start;
    q("#otEnd").value = end;
    const payload = {
      ot_date: q("#otDate").value,
      start_time: start,
      end_time: end,
      reason: q("#otReason").value.trim(),
    };
    setBusy(true);
    setNotice("");
    try {
      await api.post("/overtime", payload);
      closeModal("#otFormModal");
      setNotice("Đã gửi đơn OT. Vui lòng chờ quản lý duyệt.", "success");
      await load();
    } catch (error) {
      setNotice(apiErrorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  });

  q("#otBody").addEventListener("click", (event) => {
    if (state.busy) return;
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const { action, id } = button.dataset;
    if (action === "reject") {
      state.rejectId = id;
      q("#otRejectReason").value = "";
      openModal("#otRejectModal", "#otRejectReason");
      return;
    }
    if (action === "approve") {
      runAction("approve", id, {}, "Đã duyệt đơn OT.");
      return;
    }
    if (action === "cancel") runAction("cancel", id, {}, "Đã hủy đơn OT.");
  });

  q("#btnConfirmReject").addEventListener("click", () => {
    const reason = q("#otRejectReason").value.trim();
    if (!reason) {
      setNotice("Vui lòng nhập lý do từ chối.", "error");
      return;
    }
    if (!state.rejectId) return;
    runAction("reject", state.rejectId, { reject_reason: reason }, "Đã từ chối đơn OT.");
  });

  load();
}
