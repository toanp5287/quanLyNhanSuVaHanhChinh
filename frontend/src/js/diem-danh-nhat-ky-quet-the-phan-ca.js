import api from "../services/api.js";
import { captureFaceSamples, ensureFaceModels } from "./home.js";

export const initFaceKiosk = () => {
  const app = document.getElementById("app");
  document.body.className = "bg-slate-950 text-white font-body-md";
  app.innerHTML = `
    <main id="faceKiosk" class="min-h-screen p-5 md:p-10 max-w-6xl mx-auto">
      <header class="flex flex-wrap items-center justify-between gap-4 mb-8"><div><p class="text-cyan-300 text-sm tracking-widest uppercase">HRM • Trạm điểm danh</p><h1 class="text-3xl font-bold mt-2">Điểm danh bằng FaceID</h1></div><a href="#/dang-nhap" class="border border-slate-600 rounded-lg px-4 py-2 text-sm">Đăng nhập quản lý</a></header>
      <div class="grid lg:grid-cols-5 gap-6">
        <section class="lg:col-span-3 rounded-2xl border border-slate-700 bg-slate-900 overflow-hidden">
          <div class="p-4 flex justify-between text-sm"><span id="kioskCameraLabel">Camera chưa bật</span><time id="kioskClock"></time></div>
          <div class="relative aspect-[4/3] bg-black flex items-center justify-center"><video id="kioskVideo" autoplay muted playsinline class="w-full h-full object-cover" style="transform:scaleX(-1)"></video><div class="absolute pointer-events-none inset-[14%] border-2 border-cyan-300/70 rounded-[35%]"></div><span id="kioskCameraHint" class="absolute bottom-5 bg-black/70 rounded-lg px-4 py-2 text-sm text-center">Đứng một mình trước camera, nhìn thẳng và đủ ánh sáng</span></div>
          <div class="p-4 flex gap-3"><button id="kioskCamera" class="rounded-lg bg-slate-700 px-4 py-3 text-sm">Bật camera</button><button id="kioskStop" class="rounded-lg border border-slate-600 px-4 py-3 text-sm">Tắt camera</button></div>
        </section>
        <section class="lg:col-span-2 flex flex-col gap-5">
          <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6"><h2 class="text-xl font-semibold">Chọn thao tác điểm danh</h2><p class="text-slate-300 text-sm mt-2 leading-6">Không cần đăng nhập hoặc nhập mã nhân viên. Hệ thống nhận diện khuôn mặt đã đăng ký để ghi nhận đúng người.</p><div class="grid gap-3 mt-6"><button id="kioskCheckIn" class="rounded-xl bg-emerald-500 text-slate-950 font-bold px-5 py-4 disabled:opacity-40">Quét FaceID • Vào ca</button><button id="kioskCheckOut" class="rounded-xl bg-cyan-300 text-slate-950 font-bold px-5 py-4 disabled:opacity-40">Quét FaceID • Tan ca</button></div></div>
          <div id="kioskResult" role="status" aria-live="polite" class="rounded-2xl border border-slate-700 bg-slate-900 p-6"><h2 id="kioskResultTitle" class="font-bold text-lg">Sẵn sàng điểm danh</h2><p id="kioskResultText" class="text-slate-300 mt-3 leading-6">Bật camera rồi chọn Vào ca hoặc Tan ca. Mỗi lượt chỉ dành cho một người.</p><div id="kioskIdentity" class="mt-4 text-sm space-y-2"></div></div>
          <p class="text-slate-400 text-sm leading-6">Chưa có FaceID? Đăng nhập hồ sơ cá nhân để đăng ký mẫu khuôn mặt trước khi điểm danh.</p>
        </section>
      </div>
    </main>`;
  const root = document.getElementById("faceKiosk");
  const video = document.getElementById("kioskVideo");
  const el = id => document.getElementById(`kiosk${id}`);
  let stream = null, busy = false, starting = false, session = 0, resultTimer;
  const deviceId = (() => {
    const key = "hrm_kiosk_device_id";
    let id = localStorage.getItem(key);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id); }
    return id;
  })();
  const active = () => root.isConnected;
  const status = (title, text, error = false) => {
    if (!active()) return;
    el("ResultTitle").textContent = title; el("ResultText").textContent = text;
    el("ResultTitle").className = `font-bold text-lg ${error ? "text-rose-300" : "text-cyan-300"}`;
  };
  const controls = () => {
    if (!active()) return;
    el("CheckIn").disabled = busy || starting || !stream?.active;
    el("CheckOut").disabled = busy || starting || !stream?.active;
    el("Camera").disabled = busy || starting;
  };
  const stop = () => {
    session++;
    stream?.getTracks().forEach(track => track.stop()); stream = null; video.srcObject = null;
    if (active()) { el("CameraLabel").textContent = "Camera đã tắt"; controls(); }
  };
  const start = async () => {
    if (busy || starting) return;
    stop(); starting = true; controls(); const current = session;
    try {
      status("Đang chuẩn bị", "Đang mở camera và tải mô hình nhận diện khuôn mặt...");
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Trình duyệt không hỗ trợ camera. Mở bằng localhost hoặc HTTPS và kiểm tra webcam.");
      const opened = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      if (!active() || current !== session) { opened.getTracks().forEach(track => track.stop()); return; }
      stream = opened; video.srcObject = stream; await video.play();
      await ensureFaceModels();
      if (!active() || current !== session) return;
      el("CameraLabel").textContent = "Camera sẵn sàng";
      status("Sẵn sàng điểm danh", "Chọn Vào ca hoặc Tan ca. Chỉ một người đứng trước camera.");
    } catch (error) { if (active() && current === session) { stop(); status("Không thể bật nhận diện", error.name === "NotAllowedError" ? "Camera bị chặn. Cho phép camera trong trình duyệt rồi bấm Bật camera." : error.message, true); } }
    finally { starting = false; controls(); }
  };
  const scan = async action => {
    if (busy || starting || !stream?.active) return;
    busy = true; controls(); clearTimeout(resultTimer); el("Identity").replaceChildren(); const current = session;
    try {
      status("Đang quét khuôn mặt", "Giữ khuôn mặt trong khung hình. Hệ thống đang lấy 5 mẫu để đối chiếu.");
      const samples = await captureFaceSamples(video, (count, total) => status("Đang quét khuôn mặt", `Đã thu ${count}/${total} mẫu. Vui lòng giữ yên.`), () => active() && current === session && Boolean(stream?.active));
      if (!active() || current !== session) return;
      status("Đang xác thực", "Đang đối chiếu khuôn mặt và ghi nhận giờ trên máy chủ...");
      const response = await api.post(`/attendance/kiosk/${action}`, { face_samples: samples, device_id: deviceId }, { timeout: 30000, headers: { Authorization: undefined, "X-Device-Id": deviceId } });
      if (!active() || current !== session) return;
      const { employee, log } = response.data.data;
      status(response.data.message, action === "check-in" ? "Đã ghi nhận giờ vào ca. Chúc bạn một ngày làm việc hiệu quả." : "Đã ghi nhận giờ tan ca.");
      for (const text of [`${employee.employee_code} • ${employee.full_name}`, employee.department_name || "", `Giờ vào: ${log.check_in || "—"} • Giờ ra: ${log.check_out || "—"}`, `Công: ${Number(log.work_unit).toFixed(2)} • Đi muộn: ${Number(log.late_minutes || 0)} phút`]) {
        const line = document.createElement("p"); line.textContent = text; el("Identity").appendChild(line);
      }
    } catch (error) {
      if (active() && current === session) status("Chưa ghi nhận điểm danh", error.response?.data?.message || (error.code === "ECONNABORTED" ? "Máy chủ phản hồi chậm. Kiểm tra lại kết quả trước khi quét lại." : error.message || "Không thể kết nối máy chủ."), true);
    } finally {
      busy = false; controls();
      if (active()) resultTimer = setTimeout(() => { if (active() && !busy) { el("Identity").replaceChildren(); status("Sẵn sàng cho người tiếp theo", "Chọn Vào ca hoặc Tan ca để quét khuôn mặt."); } }, 15000);
    }
  };
  el("Camera").addEventListener("click", start); el("Stop").addEventListener("click", stop);
  el("CheckIn").addEventListener("click", () => scan("check-in")); el("CheckOut").addEventListener("click", () => scan("check-out"));
  const tick = () => { if (active()) el("Clock").textContent = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }); };
  const clock = setInterval(tick, 1000); tick(); controls();
  const cleanup = () => { stop(); clearInterval(clock); clearTimeout(resultTimer); window.removeEventListener("hashchange", cleanup); window.removeEventListener("pagehide", cleanup); document.removeEventListener("visibilitychange", visibility); };
  const visibility = () => { if (document.hidden) stop(); };
  window.addEventListener("hashchange", cleanup); window.addEventListener("pagehide", cleanup); document.addEventListener("visibilitychange", visibility);
};

const tbody = document.getElementById("attendanceLogsBody");

const loadLogs = async () => {
  if (!tbody) return;
  try {
    const date = new Date().toISOString().slice(0, 10);
    const res = await api.get("/attendance/logs", { params: { date } });
    const rows = res.data?.data?.rows || [];
    if (!rows.length) {
      tbody.innerHTML = `<tr><td class="py-4 text-center text-on-surface-variant" colspan="7">Chưa có dữ liệu chấm công</td></tr>`;
      return;
    }
    tbody.innerHTML = rows
      .map((r) => {
        const checkIn = r.check_in ? String(r.check_in).slice(0, 5) : "—";
        const checkOut = r.check_out ? String(r.check_out).slice(0, 5) : "—";
        const unit = r.work_unit != null ? Number(r.work_unit).toFixed(2) : "—";
        return `<tr class="hover:bg-surface-container-low/60 transition-colors">
          <td class="py-2.5 px-3 font-semibold text-on-surface">${escapeHtml(r.employee_code)}</td>
          <td class="py-2.5 px-3">${escapeHtml(r.full_name)}</td>
          <td class="py-2.5 px-3 text-on-surface-variant">${escapeHtml(r.department_name || "—")}</td>
          <td class="py-2.5 px-3">${checkIn} - ${checkOut}</td>
          <td class="py-2.5 px-3">${escapeHtml(r.status || "—")}</td>
          <td class="py-2.5 px-3">${unit}</td>
          <td class="py-2.5 px-3 text-on-surface-variant">${escapeHtml(r.source || "—")}</td>
        </tr>`;
      })
      .join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td class="py-4 text-center text-error" colspan="7">Không tải được dữ liệu chấm công</td></tr>`;
  }
};

const escapeHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));

export const initDiemDanh = () => {
  loadLogs();
  setInterval(loadLogs, 10000);
};

if (!window.__HRM_SPA__) {
  loadLogs();
  setInterval(loadLogs, 10000);
}
