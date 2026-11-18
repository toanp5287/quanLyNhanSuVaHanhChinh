import api from "../services/api.js";
import { captureFaceSamples, ensureFaceModels } from "./home.js";

export const initFaceKiosk = () => {
  const app = document.getElementById("app");
  document.body.className = "bg-surface font-body-md text-on-surface";
  app.innerHTML = `
    <main id="faceKiosk" class="min-h-screen bg-surface">
      <header class="h-14 bg-primary-container px-space-md flex items-center justify-between shadow-[0_1px_8px_rgba(0,0,0,0.08)]">
        <div class="flex items-center gap-space-sm">
          <span class="material-symbols-outlined text-on-primary text-[24px]">face</span>
          <span class="font-headline-sm text-headline-sm text-on-primary font-bold">HRM • Trạm điểm danh FaceID</span>
        </div>
        <a href="#/dang-nhap" class="h-9 px-space-md rounded-lg bg-primary text-on-primary font-label-lg text-label-lg hover:opacity-90 flex items-center gap-1">
          <span class="material-symbols-outlined text-[18px]">login</span>
          Đăng nhập quản lý
        </a>
      </header>
      <div class="max-w-5xl mx-auto px-space-lg py-space-md">
        <div class="mb-space-md">
          <h1 class="font-headline-lg text-headline-lg text-on-surface">Điểm danh bằng FaceID</h1>
          <p class="text-on-surface-variant text-body-sm mt-1">Không cần đăng nhập. Hệ thống nhận diện khuôn mặt đã đăng ký để ghi nhận đúng người.</p>
        </div>
        <div class="grid lg:grid-cols-[minmax(0,720px)_minmax(300px,1fr)] gap-space-lg items-start">
          <section class="rounded-lg border border-surface-variant bg-surface-container-lowest shadow-sm overflow-hidden">
            <div class="px-space-md py-space-sm bg-surface-container-low flex items-center justify-between gap-space-sm border-b border-surface-variant">
              <span id="kioskCameraLabel" class="font-label-lg text-label-lg text-on-surface">Camera chưa bật</span>
              <time id="kioskClock" class="font-label-sm text-label-sm text-on-surface-variant"></time>
            </div>
            <div class="relative aspect-[4/3] bg-surface-container-high flex items-center justify-center">
              <video id="kioskVideo" autoplay muted playsinline class="w-full h-full object-cover" style="transform:scaleX(-1)"></video>
              <div class="absolute pointer-events-none inset-[16%] border-2 border-primary/70 rounded-[32%]"></div>
              <span id="kioskCameraHint" class="absolute bottom-space-sm left-1/2 -translate-x-1/2 max-w-[90%] rounded-lg bg-inverse-surface text-inverse-on-surface px-space-sm py-1 text-body-sm text-center">Đứng một mình trước camera, nhìn thẳng và đủ ánh sáng</span>
            </div>
            <div class="p-space-md flex flex-wrap gap-space-sm">
              <button id="kioskCamera" class="h-10 px-space-md rounded-lg bg-primary text-on-primary font-label-lg text-label-lg hover:bg-primary-container">Bật camera</button>
              <button id="kioskStop" class="h-10 px-space-md rounded-lg border border-surface-variant bg-surface-container-lowest text-on-surface font-label-lg text-label-lg hover:bg-surface-container-high">Tắt camera</button>
            </div>
          </section>
          <section class="flex flex-col gap-space-md">
            <div class="rounded-lg border border-surface-variant bg-surface-container-lowest shadow-sm p-space-md">
              <h2 class="font-headline-md text-headline-md text-on-surface">Chọn thao tác điểm danh</h2>
              <p class="text-on-surface-variant text-body-sm mt-1 leading-6">Hệ thống nhận diện khuôn mặt đã đăng ký để ghi nhận đúng người.</p>
              <dl class="mt-space-sm space-y-1 text-body-sm">
                <div class="flex justify-between gap-2"><dt class="text-on-surface-variant">Chất lượng khuôn mặt</dt><dd id="kioskQuality" class="text-right">Chưa kiểm tra</dd></div>
                <div class="flex justify-between gap-2"><dt class="text-on-surface-variant">Xác minh chớp mắt</dt><dd id="kioskBlink" class="text-right">Chưa thực hiện</dd></div>
                <div class="flex justify-between gap-2"><dt class="text-on-surface-variant">Nhận diện</dt><dd id="kioskRecognition" class="text-right">Chưa quét</dd></div>
                <div class="flex justify-between gap-2"><dt class="text-on-surface-variant">Trạng thái chấm công</dt><dd id="kioskAttendance" class="text-right">Chưa ghi nhận</dd></div>
              </dl>
              <div class="grid gap-space-sm mt-space-md">
                <button id="kioskCheckIn" class="h-12 rounded-lg bg-emerald-600 text-white font-label-lg text-label-lg disabled:opacity-40">Quét FaceID • Vào ca</button>
                <button id="kioskCheckOut" class="h-12 rounded-lg bg-primary text-on-primary font-label-lg text-label-lg disabled:opacity-40">Quét FaceID • Tan ca</button>
              </div>
            </div>
            <div id="kioskResult" role="status" aria-live="polite" class="rounded-lg border border-surface-variant bg-surface-container-lowest shadow-sm p-space-md">
              <h2 id="kioskResultTitle" class="font-headline-sm text-headline-sm text-on-surface">Sẵn sàng điểm danh</h2>
              <p id="kioskResultText" class="text-on-surface-variant text-body-sm mt-2 leading-6">Bật camera rồi chọn Vào ca hoặc Tan ca. Mỗi lượt chỉ dành cho một người.</p>
              <div id="kioskIdentity" class="mt-space-sm text-body-sm space-y-1"></div>
            </div>
            <p class="text-on-surface-variant text-body-sm leading-6">Chưa có FaceID? Đăng nhập hồ sơ cá nhân để đăng ký mẫu khuôn mặt trước khi điểm danh.</p>
          </section>
        </div>
      </div>
    </main>`;
  const root = document.getElementById("faceKiosk");
  const video = document.getElementById("kioskVideo");
  const el = (id) => document.getElementById(`kiosk${id}`);
  let stream = null,
    busy = false,
    starting = false,
    session = 0,
    resultTimer;
  const deviceId =
    localStorage.getItem("hrm_kiosk_device_id") || crypto.randomUUID();
  localStorage.setItem("hrm_kiosk_device_id", deviceId);
  const active = () => root.isConnected;
  const status = (title, text, error = false) => {
    if (!active()) return;
    el("ResultTitle").textContent = title;
    el("ResultText").textContent = text;
    el("ResultTitle").className =
      `font-bold text-lg ${error ? "text-error" : "text-primary"}`;
    el("CameraHint").textContent = text;
  };
  const controls = () => {
    if (!active()) return;
    el("CheckIn").disabled = busy || starting || !stream?.active;
    el("CheckOut").disabled = busy || starting || !stream?.active;
    el("Camera").disabled = busy || starting;
  };
  const stop = () => {
    session++;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
    if (active()) {
      el("CameraLabel").textContent = "Camera đã tắt";
      controls();
    }
  };
  const start = async () => {
    if (busy || starting) return;
    stop();
    starting = true;
    controls();
    const current = session;
    try {
      status(
        "Đang chuẩn bị",
        "Đang mở camera và tải mô hình nhận diện khuôn mặt...",
      );
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Trình duyệt không hỗ trợ camera. Mở bằng localhost hoặc HTTPS và kiểm tra webcam.",
        );
      const opened = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      if (!active() || current !== session) {
        opened.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = opened;
      video.srcObject = stream;
      await video.play();
      await ensureFaceModels();
      if (!active() || current !== session) return;
      el("CameraLabel").textContent = "Camera sẵn sàng";
      el("Quality").textContent = "Đang chờ khuôn mặt";
      el("Blink").textContent = "Chưa thực hiện";
      status(
        "Sẵn sàng điểm danh",
        "Chọn Vào ca hoặc Tan ca. Chỉ một người đứng trước camera.",
      );
    } catch (error) {
      if (active() && current === session) {
        stop();
        status(
          "Không thể bật nhận diện",
          error.name === "NotAllowedError"
            ? "Camera bị chặn. Cho phép camera trong trình duyệt rồi bấm Bật camera."
            : error.message,
          true,
        );
      }
    } finally {
      starting = false;
      controls();
    }
  };
  const scan = async (action) => {
    if (busy || starting || !stream?.active) return;
    busy = true;
    controls();
    clearTimeout(resultTimer);
    el("Identity").replaceChildren();
    const current = session;
    try {
      status(
        "Đang quét khuôn mặt",
        "Giữ khuôn mặt trong khung hình. Hệ thống đang lấy 5 mẫu để đối chiếu.",
      );
      el("Quality").textContent = "Đang kiểm tra";
      el("Blink").textContent = "Chờ chớp mắt hợp lệ";
      el("Recognition").textContent = "Đang chờ xác minh";
      el("Attendance").textContent = "Chưa ghi nhận";
      const capture = await captureFaceSamples(
        video,
        (count, total) => {
          el("Quality").textContent = `Đạt • ${count}/${total} mẫu`;
          el("Blink").textContent = "Đã xác minh";
          status(
            "Đang quét khuôn mặt",
            `Đang quét mẫu: ${count}/${total} (${Math.round((count / total) * 100)}%)`,
          );
        },
        () => active() && current === session && Boolean(stream?.active),
        (text) => {
          el("Quality").textContent = text;
          if (text.includes("CHỚP MẮT"))
            el("Blink").textContent = "Đang chờ thao tác";
          if (text.includes("Đã xác thực chớp mắt"))
            el("Blink").textContent = "Đã xác minh";
          status("Xác thực khuôn mặt", text);
        },
      );
      if (!active() || current !== session) return;
      status(
        "Đang xác thực",
        "Đang đối chiếu khuôn mặt và ghi nhận giờ trên máy chủ...",
      );
      el("Recognition").textContent = "Đang đối chiếu hồ sơ";
      const response = await api.post(
        `/attendance/kiosk/${action}`,
        capture,
        {
          timeout: 30000,
          skipAuth: true,
          headers: { "X-Device-Id": deviceId },
        },
      );
      if (!active() || current !== session) return;
      const { employee, log } = response.data.data;
      el("Recognition").textContent = `Đã xác nhận • ${employee.full_name}`;
      el("Attendance").textContent = "Đã ghi nhận thành công";
      status(
        response.data.message,
        action === "check-in"
          ? "Đã ghi nhận giờ vào ca. Chúc bạn một ngày làm việc hiệu quả."
          : "Đã ghi nhận giờ tan ca.",
      );
      for (const text of [
        `${employee.employee_code} • ${employee.full_name}`,
        employee.department_name || "",
        `Giờ vào: ${log.check_in || "—"} • Giờ ra: ${log.check_out || "—"}`,
        `Công: ${Number(log.work_unit).toFixed(2)} • Đi muộn: ${Number(log.late_minutes || 0)} phút`,
      ]) {
        const line = document.createElement("p");
        line.textContent = text;
        el("Identity").appendChild(line);
      }
    } catch (error) {
      if (active() && current === session) {
        el("Recognition").textContent = "Không nhận diện được";
        el("Attendance").textContent = "Không ghi nhận";
      }
      if (active() && current === session)
        status(
          "Chưa ghi nhận điểm danh",
          error.response?.data?.message ||
            (error.code === "ECONNABORTED"
              ? "Máy chủ phản hồi chậm. Kiểm tra lại kết quả trước khi quét lại."
              : error.message || "Không thể kết nối máy chủ."),
          true,
        );
    } finally {
      busy = false;
      controls();
      if (active())
        resultTimer = setTimeout(() => {
          if (active() && !busy) {
            el("Identity").replaceChildren();
            status(
              "Sẵn sàng cho người tiếp theo",
              "Chọn Vào ca hoặc Tan ca để quét khuôn mặt.",
            );
          }
        }, 15000);
    }
  };
  el("Camera").addEventListener("click", start);
  el("Stop").addEventListener("click", stop);
  el("CheckIn").addEventListener("click", () => scan("check-in"));
  el("CheckOut").addEventListener("click", () => scan("check-out"));
  const tick = () => {
    if (active())
      el("Clock").textContent = new Date().toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
      });
  };
  const clock = setInterval(tick, 1000);
  tick();
  controls();
  const cleanup = () => {
    stop();
    clearInterval(clock);
    clearTimeout(resultTimer);
    window.removeEventListener("hashchange", cleanup);
    window.removeEventListener("pagehide", cleanup);
    document.removeEventListener("visibilitychange", visibility);
  };
  const visibility = () => {
    if (document.hidden) stop();
  };
  window.addEventListener("hashchange", cleanup);
  window.addEventListener("pagehide", cleanup);
  document.addEventListener("visibilitychange", visibility);
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

const escapeHtml = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[c],
  );

export const initDiemDanh = () => {
  loadLogs();
  setInterval(loadLogs, 10000);
};
