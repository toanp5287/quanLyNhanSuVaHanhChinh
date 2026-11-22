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
          <p class="text-on-surface-variant text-body-sm mt-1">Không cần đăng nhập. Hệ thống tự tách khuôn mặt để quét, kể cả khi cả thân nằm trong khung hình; người đi qua lại bị bỏ qua.</p>
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
              <span id="kioskCameraHint" class="absolute bottom-space-sm left-1/2 -translate-x-1/2 max-w-[90%] rounded-lg bg-inverse-surface text-inverse-on-surface px-space-sm py-1 text-body-sm text-center">Đứng yên trước camera để hệ thống khóa đúng người quét</span>
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
                  <div class="flex justify-between gap-2"><dt class="text-on-surface-variant">Người quét</dt><dd id="kioskSubject" class="text-right">Chưa khóa</dd></div>
                  <div class="flex justify-between gap-2"><dt class="text-on-surface-variant">Người đi qua (bỏ qua)</dt><dd id="kioskPasserby" class="text-right">0</dd></div>
                  <div class="flex justify-between gap-2"><dt class="text-on-surface-variant">Chất lượng khuôn mặt</dt><dd id="kioskQuality" class="text-right">Chưa kiểm tra</dd></div>
                <div class="flex justify-between gap-2"><dt class="text-on-surface-variant">Xác minh chớp mắt</dt><dd id="kioskBlink" class="text-right">Chưa thực hiện</dd></div>
                <div class="flex justify-between gap-2"><dt class="text-on-surface-variant">Nhận diện</dt><dd id="kioskRecognition" class="text-right">Chưa quét</dd></div>
                <div class="flex justify-between gap-2"><dt class="text-on-surface-variant">Trạng thái chấm công</dt><dd id="kioskAttendance" class="text-right">Chưa ghi nhận</dd></div>
              </dl>
              <div class="grid gap-space-sm mt-space-md">
                <button id="kioskAuto" class="h-12 rounded-lg bg-primary text-on-primary font-label-lg text-label-lg disabled:opacity-40">Quét FaceID • Tự động Vào/Ra</button>
                <button id="kioskCheckIn" class="h-12 rounded-lg bg-emerald-600 text-white font-label-lg text-label-lg disabled:opacity-40">Quét FaceID • Vào ca</button>
                <button id="kioskCheckOut" class="h-12 rounded-lg bg-primary text-on-primary font-label-lg text-label-lg disabled:opacity-40">Quét FaceID • Tan ca</button>
              </div>
              <div id="kioskConfirm" class="hidden mt-space-md rounded-lg border border-primary bg-primary-container/30 p-space-sm">
                <p id="kioskConfirmText" class="text-body-sm text-on-surface"></p>
                <p id="kioskConfirmCountdown" class="text-body-sm text-on-surface-variant mt-1"></p>
                <div class="flex gap-space-sm mt-space-sm">
                  <button id="kioskConfirmOk" class="h-9 px-space-md rounded-lg bg-primary text-on-primary font-label-lg disabled:opacity-40" disabled>Xác nhận</button>
                  <button id="kioskConfirmCancel" class="h-9 px-space-md rounded-lg border border-surface-variant font-label-lg">Hủy</button>
                </div>
              </div>
              <p id="kioskCooldown" class="hidden mt-space-sm text-body-sm text-error"></p>
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
    resultTimer,
    config = null,
    pendingAction = null,
    confirmTimer = null,
    cooldownTimer = null,
    cooldownUntil = 0;
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
    const autoMode = config?.punch_mode === "AUTO_SMART";
    el("Auto").classList.toggle("hidden", !autoMode);
    el("CheckIn").classList.toggle("hidden", autoMode);
    el("CheckOut").classList.toggle("hidden", autoMode);
    const locked =
      busy || starting || !stream?.active || Boolean(pendingAction) ||
      Date.now() < cooldownUntil;
    el("Auto").disabled = locked;
    el("CheckIn").disabled = locked;
    el("CheckOut").disabled = locked;
    el("Camera").disabled = busy || starting;
  };
  const beep = (ok) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const audio = new AudioCtx();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = ok ? 880 : 220;
      gain.gain.value = 0.08;
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + (ok ? 0.12 : 0.3));
      oscillator.onended = () => audio.close();
    } catch {
      return;
    }
  };
  const startCooldown = (seconds) => {
    const wait = Math.max(0, Math.ceil(Number(seconds) || 0));
    if (!wait) return;
    cooldownUntil = Date.now() + wait * 1000;
    const tick = () => {
      if (!active()) return;
      const left = Math.ceil((cooldownUntil - Date.now()) / 1000);
      if (left <= 0) {
        cooldownUntil = 0;
        clearInterval(cooldownTimer);
        el("Cooldown").classList.add("hidden");
      } else {
        el("Cooldown").classList.remove("hidden");
        el("Cooldown").textContent = `Quét quá nhanh. Vui lòng đợi ${left} giây trước khi quét lại.`;
      }
      controls();
    };
    clearInterval(cooldownTimer);
    tick();
    cooldownTimer = setInterval(tick, 500);
  };
  const loadConfig = async () => {
    try {
      const response = await api.get("/attendance/kiosk/config", {
        skipAuth: true,
      });
      config = response.data?.data || config;
    } catch {
      config = config || { punch_mode: "AUTO_SMART", checkout_confirm_seconds: 2 };
    }
    if (active()) controls();
  };
  const cancelConfirm = () => {
    clearInterval(confirmTimer);
    pendingAction = null;
    if (active()) el("Confirm").classList.add("hidden");
    controls();
  };
  const askConfirm = (action) => {
    if (busy || starting || !stream?.active || Date.now() < cooldownUntil) return;
    pendingAction = action;
    if (active()) el("Confirm").classList.remove("hidden");
    let remaining = Math.max(0, Number(config?.checkout_confirm_seconds) || 0);
    const render = () => {
      if (!active()) return;
      el("ConfirmText").textContent =
        action === "check-in"
          ? "Xác nhận quét FaceID để chấm Vào ca."
          : action === "auto"
            ? "Xác nhận quét FaceID. Hệ thống sẽ tự chọn Vào hoặc Ra."
            : "Xác nhận quét FaceID để chấm Ra. Ra ca không cần đúng giờ, nhưng phải đã có giờ Vào.";
      el("ConfirmCountdown").textContent = remaining
        ? `Vui lòng đợi ${remaining} giây...`
        : "Sẵn sàng. Nhấn Xác nhận để quét.";
      el("ConfirmOk").disabled = remaining > 0;
    };
    render();
    clearInterval(confirmTimer);
    if (remaining > 0)
      confirmTimer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) clearInterval(confirmTimer);
        render();
      }, 1000);
    controls();
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
      el("Subject").textContent = "Chưa khóa";
      el("Passerby").textContent = "0";
      el("Quality").textContent = "Đang chờ khuôn mặt";
      el("Blink").textContent = "Chưa thực hiện";
      status(
        "Sẵn sàng điểm danh",
        "Chọn Vào ca hoặc Tan ca. Đứng yên để khóa đúng người quét.",
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
        "Đứng yên để hệ thống tự tách mặt và khóa. Chỉ khuôn mặt được phân tích.",
      );
      el("Subject").textContent = "Đang xác định";
      el("Passerby").textContent = "0";
      el("Quality").textContent = "Đang kiểm tra";
      el("Blink").textContent = "Chờ chớp mắt hợp lệ";
      el("Recognition").textContent = "Đang chờ xác minh";
       el("Attendance").textContent = "Đang xác thực...";
      const capture = await captureFaceSamples(
        video,
        (count, total) => {
          el("Subject").textContent = "Đã khóa • đang quét";
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
          if (text.includes("Đã khóa")) el("Subject").textContent = "Đã khóa • giữ yên";
          if (text.includes("đi qua lại")) {
            el("Subject").textContent = "Đã khóa • bỏ qua người đi qua";
            el("Passerby").textContent = String(
              Number(el("Passerby").textContent || 0) + 1,
            );
          }
          if (text.includes("CHỚP MẮT")) el("Blink").textContent = "Đang chờ thao tác";
          status("Xác thực khuôn mặt", text);
        },
      );
      el("Subject").textContent = "Đã khóa • hoàn tất";
      el("Passerby").textContent = String(capture.capture?.subject?.rejected_moving_persons || 0);
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
       const { employee, log, account, shift, already_recorded: alreadyRecorded, attendance_state: attendanceState } = response.data.data;
       const scannedAction = response.data.data.action || action;
       beep(true);
        el("Recognition").textContent = `Đã xác nhận • ${employee.full_name}`;

       const completed = attendanceState === "COMPLETED" || Boolean(log.check_out);
       el("Attendance").textContent = alreadyRecorded
         ? completed ? "Đã hoàn thành hôm nay" : `Đã vào ca lúc ${String(log.check_in || "—").slice(0, 5)}`
         : "Đã ghi nhận thành công";
      const toMin = (t) => {
        if (!t) return null;
        const [h, m] = String(t).split(":").map(Number);
        return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
      };
      const checkInMin = toMin(log.check_in);
      const startMin = toMin(shift?.start_time);
      const grace = Number(shift?.grace_period_minutes ?? shift?.grace_period ?? 15);
      const allowedMin = toMin(shift?.allowed_limit_time) ?? (startMin == null ? null : startMin + grace);
      const lateMinutes = Number(log?.late_minutes || 0);
      let punctuality = "";
      let punctualityDetail = "";
       if (scannedAction === "check-in" && checkInMin != null && startMin != null) {

        if (lateMinutes > 0) {
          punctuality = "Đi muộn";
          punctualityDetail = `Đi muộn ${lateMinutes} phút (quá ân hạn ${grace} phút so với giờ bắt đầu ca)`;
        } else if (checkInMin > startMin && allowedMin != null && checkInMin <= allowedMin) {
          const within = checkInMin - startMin;
          punctuality = "Đúng giờ (ân hạn)";
          punctualityDetail = `Đúng giờ - trong ân hạn ${grace} phút (trễ ${within} phút nhưng không tính đi muộn)`;
        } else {
          punctuality = "Đúng giờ";
          punctualityDetail = "Đúng giờ";
        }
      }

      status(
        alreadyRecorded
          ? completed
            ? "Đã hoàn thành chấm công hôm nay"
            : "Đã vào ca hôm nay"
          : response.data.message,
        alreadyRecorded
          ? response.data.message
           : scannedAction === "check-in"
             ? `Đã ghi nhận giờ vào ca. ${punctualityDetail || "Đúng giờ"}.`
             : "Đã ghi nhận giờ tan ca. Công đã được tính theo quy chế.",

      );
      for (const text of [
        `${employee.employee_code} - ${employee.full_name}`,
        `Tài khoản: ${account?.username || employee.username || "-"}`,
        employee.department_name || "",
        `Giờ vào: ${String(log.check_in || "-").slice(0, 5)} - Giờ ra: ${String(log.check_out || "-").slice(0, 5)}`,
        punctualityDetail ? `Trạng thái vào ca: ${punctualityDetail}` : "",
        `Công: ${Number(log.work_day ?? log.work_unit).toFixed(2)} - Đi muộn: ${lateMinutes} phút`,
        ...(Number(config?.show_estimated_workday)
          ? [`Thời gian làm ròng: ${Number(log.net_work_minutes || 0)} phút`]
          : []),
      ].filter(Boolean)) {
        const line = document.createElement("p");
        line.textContent = text;
        el("Identity").appendChild(line);
      }
    } catch (error) {
      beep(false);
      if (active() && current === session) {
        el("Recognition").textContent = "Không nhận diện được";
        el("Attendance").textContent = "Không ghi nhận";
      }
       if (active() && current === session) {
          const payload = error.response?.data || {};
          const message = payload.message ||
            (error.code === "ECONNABORTED"
              ? "Máy chủ phản hồi chậm. Kiểm tra lại kết quả trước khi quét lại."
              : error.message || "Không thể kết nối máy chủ.");
          if (payload.code === "NO_CHECK_IN_FOUND") {
            el("Recognition").textContent = "Đã xác nhận khuôn mặt";
            el("Attendance").textContent = "Chưa có giờ Vào";
            status("Không thể chấm Ra", `${message} Vui lòng quét Vào ca trước.`, true);
          } else if (payload.code === "DOUBLE_PUNCH_TOO_FAST") {
            startCooldown(payload.wait_seconds);
            status("Quét quá nhanh", message, true);
          } else if (/đã vào ca hôm nay/i.test(message)) {

           el("Recognition").textContent = "Đã xác nhận khuôn mặt";
           el("Attendance").textContent = "Đã vào ca hôm nay";
           status("Đã vào ca hôm nay", message);
         } else if (/hoàn thành chấm công hôm nay/i.test(message)) {
           el("Recognition").textContent = "Đã xác nhận khuôn mặt";
           el("Attendance").textContent = "Đã hoàn thành hôm nay";
           status("Đã hoàn thành chấm công hôm nay", message);
         } else {
           status("Chưa ghi nhận điểm danh", message, true);
         }
       }
    } finally {
      busy = false;
      controls();
      if (active())
        resultTimer = setTimeout(() => {
          if (active() && !busy) {
            el("Identity").replaceChildren();
             status(
               "Sẵn sàng cho người tiếp theo",
               config?.punch_mode === "AUTO_SMART"
                 ? "Nhấn Quét FaceID để hệ thống tự chọn Vào hoặc Ra."
                 : "Chọn Vào ca hoặc Tan ca để quét khuôn mặt.",
             );

          }
        }, 15000);
    }
  };
  el("Camera").addEventListener("click", start);
  el("Stop").addEventListener("click", stop);
  el("Auto").addEventListener("click", () => askConfirm("auto"));
  el("CheckIn").addEventListener("click", () => scan("check-in"));
  el("CheckOut").addEventListener("click", () => askConfirm("check-out"));
  el("ConfirmOk").addEventListener("click", () => {
    const action = pendingAction;
    cancelConfirm();
    if (action) scan(action);
  });
  el("ConfirmCancel").addEventListener("click", cancelConfirm);
  const clockFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const tick = () => {
    if (active())
      el("Clock").textContent = clockFormatter.format(new Date()).replace(",", "");
  };
  const clock = setInterval(tick, 1000);
  tick();
  loadConfig();
  controls();
  const cleanup = () => {
    stop();
    clearInterval(clock);
    clearTimeout(resultTimer);
    clearInterval(confirmTimer);
    clearInterval(cooldownTimer);
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
