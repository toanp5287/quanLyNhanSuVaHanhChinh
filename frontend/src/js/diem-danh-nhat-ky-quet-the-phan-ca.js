import api from "../services/api.js";
import {
  checkDevicePermission,
  hideDeviceBlocked,
  showDeviceBlocked,
} from "../services/deviceSecurity.js";
import {
  ATTENDANCE_CAMERA_CONFIG,
  ensureAttendanceFaceModels,
  openAttendanceCamera,
  runAttendanceFaceScan,
} from "./attendance-camera.js";

const SCAN_STATE_TEXT = Object.freeze({
  IDLE: "Sẵn sàng",
  INIT_CAM: "Khởi tạo camera",
  SCANNING: "Đang quét không thao tác",
  VERIFYING: "Đang xác thực",
  SUCCESS: "Thành công",
  SPOOF_BLOCKED: "Chặn gian lận",
  ERROR: "Lỗi",
});

const SCAN_STATE_COLOR = Object.freeze({
  IDLE: "#94a3b8",
  INIT_CAM: "#94a3b8",
  SCANNING: "#818cf8",
  VERIFYING: "#38bdf8",
  SUCCESS: "#22c55e",
  SPOOF_BLOCKED: "#ef4444",
  ERROR: "#ef4444",
});

const SPOOF_COOLDOWN_SECONDS = ATTENDANCE_CAMERA_CONFIG.passive.cooldownMs / 1000;

export const initFaceKiosk = () => {
  const app = document.getElementById("app");
  document.body.className = "bg-surface font-body-md text-on-surface";
  app.innerHTML = `
    <main id="faceKiosk" class="min-h-screen bg-slate-950 text-slate-100">
      <header class="sticky top-0 z-30 border-b border-white/10 bg-slate-950/90 backdrop-blur">
        <div class="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
              <span class="material-symbols-outlined text-[24px]">face_retouching_natural</span>
            </div>
            <div>
              <p class="text-sm font-semibold text-white">HRM FaceID</p>
              <p class="text-xs text-slate-400">Điểm danh nhanh, không cần thao tác phức tạp</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <time id="kioskClock" class="hidden rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300 sm:block"></time>
            <button id="kioskDebugToggle" type="button" class="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:bg-white/5">Debug</button>
            <a href="#/dang-nhap" class="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15">Đăng nhập</a>
          </div>
        </div>
      </header>
<<<<<<< HEAD
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
=======

      <div class="mx-auto max-w-6xl px-4 py-4 md:py-6">
        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
          <section class="overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/20">
            <div class="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div class="flex items-center gap-2">
                <span id="kioskStateDot" class="h-2.5 w-2.5 rounded-full bg-slate-500"></span>
                <span id="kioskCameraLabel" class="text-sm font-medium text-slate-200">Camera chưa bật</span>
              </div>
              <span id="kioskState" class="rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">Sẵn sàng</span>
            </div>

            <div class="relative aspect-[4/3] bg-slate-950 sm:aspect-[16/10] lg:aspect-[4/3]">
              <video id="kioskVideo" autoplay muted playsinline class="h-full w-full object-cover" style="transform:scaleX(-1)"></video>
              <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(2,6,23,0.35)_100%)]"></div>
              <div id="kioskOval" class="pointer-events-none absolute inset-[12%] rounded-[38%] border-[3px] transition-all duration-300 sm:inset-[14%]" style="border-color:#64748b;box-shadow:0 0 0 9999px rgba(2,6,23,0.12)"></div>
              <div class="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                <div class="mx-auto max-w-xl rounded-2xl bg-slate-950/70 px-4 py-3 text-center backdrop-blur">
                  <p id="kioskCameraHint" class="text-sm font-medium text-white sm:text-base">Bật camera, nhìn thẳng vào khung để điểm danh</p>
                  <p class="mt-1 text-xs text-slate-300">Chỉ cần 1 người trong khung, giữ yên khoảng 1 giây.</p>
                </div>
>>>>>>> origin/main
              </div>
            </div>

            <div class="grid gap-2 p-4 sm:grid-cols-2">
              <button id="kioskCamera" class="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40">
                <span class="material-symbols-outlined text-[20px]">videocam</span>Bật camera
              </button>
              <button id="kioskStop" class="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-40">
                <span class="material-symbols-outlined text-[20px]">videocam_off</span>Tắt camera
              </button>
            </div>

            <div id="kioskDebugPanel" class="hidden border-t border-white/10 bg-slate-950/50 px-4 py-3">
              <p class="text-xs font-medium text-slate-400">Debug quét</p>
              <pre id="kioskDebugContent" class="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-300"></pre>
            </div>
          </section>

          <section class="flex flex-col gap-4">
            <div id="kioskResult" role="status" aria-live="polite" class="rounded-3xl border border-white/10 bg-slate-900 p-5 shadow-xl shadow-black/10">
              <div class="flex items-start gap-3">
                <div id="kioskResultIcon" class="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
                  <span class="material-symbols-outlined text-[24px]">schedule</span>
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Trạng thái</p>
                  <h2 id="kioskResultTitle" class="mt-1 text-xl font-semibold text-white">Sẵn sàng điểm danh</h2>
                  <p id="kioskResultText" class="mt-2 text-sm leading-6 text-slate-300">Bật camera, sau đó bấm một nút điểm danh. Hệ thống sẽ tự nhận diện.</p>
                </div>
              </div>
              <div id="kioskIdentity" class="mt-4 space-y-1 text-sm text-slate-200"></div>
              <p id="kioskCooldown" class="mt-3 hidden rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300"></p>
            </div>

            <div class="rounded-3xl border border-white/10 bg-slate-900 p-5">
              <p class="text-sm font-semibold text-white">Chọn điểm danh</p>
              <p class="mt-1 text-xs leading-5 text-slate-400">Sau khi camera sẵn sàng, chọn đúng thao tác. Hầu hết trường hợp dùng nút tự động.</p>
              <div class="mt-4 grid gap-3">
                <button id="kioskAuto" class="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 text-base font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40">
                  <span class="material-symbols-outlined text-[22px]">fingerprint</span>Quét FaceID tự động
                </button>
                <div class="grid grid-cols-2 gap-3">
                  <button id="kioskCheckIn" class="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-sky-500 px-4 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40">
                    <span class="material-symbols-outlined text-[20px]">login</span>Vào ca
                  </button>
                  <button id="kioskCheckOut" class="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-amber-400 px-4 text-sm font-semibold text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40">
                    <span class="material-symbols-outlined text-[20px]">logout</span>Tan ca
                  </button>
                </div>
              </div>

              <div id="kioskConfirm" class="mt-4 hidden rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4">
                <p id="kioskConfirmText" class="text-sm font-medium text-amber-100"></p>
                <p id="kioskConfirmCountdown" class="mt-1 text-xs text-amber-200/80"></p>
                <div class="mt-3 flex gap-2">
                  <button id="kioskConfirmOk" class="h-10 flex-1 rounded-xl bg-amber-400 text-sm font-semibold text-slate-950 disabled:opacity-40" disabled>Xác nhận</button>
                  <button id="kioskConfirmCancel" class="h-10 flex-1 rounded-xl border border-white/10 text-sm font-medium text-white hover:bg-white/5">Hủy</button>
                </div>
              </div>
            </div>

            <details class="rounded-3xl border border-white/10 bg-slate-900/70 p-4">
              <summary class="cursor-pointer list-none text-sm font-medium text-slate-300">Chi tiết kỹ thuật</summary>
              <dl class="mt-3 space-y-2 text-xs text-slate-400">
                <div class="flex justify-between gap-3"><dt>Khuôn mặt</dt><dd id="kioskSubject" class="text-right text-slate-200">Chưa phát hiện</dd></div>
                <div class="flex justify-between gap-3"><dt>Chất lượng</dt><dd id="kioskQuality" class="text-right text-slate-200">Chưa kiểm tra</dd></div>
                <div class="flex justify-between gap-3"><dt>Kiểm tra sống</dt><dd id="kioskLiveness" class="text-right text-slate-200">Chưa thực hiện</dd></div>
                <div class="flex justify-between gap-3"><dt>Nhận diện</dt><dd id="kioskRecognition" class="text-right text-slate-200">Chưa quét</dd></div>
                <div class="flex justify-between gap-3"><dt>Chấm công</dt><dd id="kioskAttendance" class="text-right text-slate-200">Chưa ghi nhận</dd></div>
              </dl>
            </details>

            <p class="px-1 text-xs leading-5 text-slate-500">Chưa có FaceID? Đăng nhập hồ sơ cá nhân để đăng ký trước khi điểm danh.</p>
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
    cooldownUntil = 0,
    scanState = "IDLE",
    challengeCache = null,
    challengePromise = null,
    challengeTimer = null,
    debugVisible = new URLSearchParams(window.location.search).get("debug") === "1",
    debugData = null;
  const deviceId =
    localStorage.getItem("hrm_kiosk_device_id") || crypto.randomUUID();
  localStorage.setItem("hrm_kiosk_device_id", deviceId);
  const active = () => root.isConnected;
  const renderDebug = () => {
    if (!active() || !debugVisible || !debugData) return;
    const { quality, passive } = ATTENDANCE_CAMERA_CONFIG;
    const lines = [
      `gateReason      : ${debugData.gateReason || "—"}`,
      `frame           : ${debugData.frame}/${debugData.windowSize}`,
      `real / median   : ${debugData.real} / ${debugData.realMedian}  (block < ${debugData.realBlock})`,
      `live / median   : ${debugData.live} / ${debugData.liveMedian}  (block < ${debugData.liveBlock})`,
      `yaw/pitch/roll  : ${debugData.yaw} / ${debugData.pitch} / ${debugData.roll}  (max ${quality.yawMaxDeg}/${quality.pitchMaxDeg}/${quality.rollMaxDeg})`,
      `sizeRatio       : ${debugData.heightRatio}  (${quality.faceHeightMin}-${quality.faceHeightMax})`,
      `boxScore        : ${debugData.boxScore}  (min ${quality.boxScoreMin})`,
      `sharpness       : ${debugData.sharpness}  (min ${quality.sharpnessMin})`,
      `brightness      : ${debugData.brightness}  (${quality.brightnessMin}-${quality.brightnessMax})`,
      `glareRatio      : ${debugData.glareRatio}  (max ${quality.whiteOutMax})`,
      `hardLowFrames   : ${debugData.hardLowFrames}/${passive.hardFrameCount}`,
      `motion mean/max : ${debugData.motionMean ?? "—"} / ${debugData.motionMax ?? "—"}  (frozen=${debugData.frozen})`,
    ];
    el("DebugContent").textContent = lines.join("\n");
  };
  const setDebugVisible = (visible) => {
    debugVisible = Boolean(visible);
    if (!active()) return;
    el("DebugPanel").classList.toggle("hidden", !debugVisible);
    if (debugVisible) renderDebug();
  };
  const setResultTone = (tone = "neutral") => {
    if (!active()) return;
    const tones = {
      neutral: ["bg-slate-500/15 text-slate-300", "schedule"],
      ready: ["bg-emerald-500/15 text-emerald-400", "how_to_reg"],
      scan: ["bg-sky-500/15 text-sky-400", "face_retouching_natural"],
      success: ["bg-emerald-500/15 text-emerald-400", "check_circle"],
      error: ["bg-red-500/15 text-red-400", "error"],
      warn: ["bg-amber-400/15 text-amber-300", "warning"],
    };
    const [cls, icon] = tones[tone] || tones.neutral;
    el("ResultIcon").className = `mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${cls}`;
    el("ResultIcon").innerHTML = `<span class="material-symbols-outlined text-[24px]">${icon}</span>`;
    el("ResultTitle").className = `mt-1 text-xl font-semibold ${tone === "error" ? "text-red-300" : tone === "warn" ? "text-amber-200" : "text-white"}`;
  };
  const status = (title, text, error = false, tone = null) => {
    if (!active()) return;
    el("ResultTitle").textContent = title;
    el("ResultText").textContent = text;
    el("CameraHint").textContent = text;
    setResultTone(tone || (error ? "error" : "ready"));
  };
  const setScanState = (next, message) => {
    scanState = next;
    if (!active()) return;
    const color = SCAN_STATE_COLOR[next] || SCAN_STATE_COLOR.IDLE;
    el("Oval").style.borderColor = color;
    el("Oval").style.boxShadow = next === "SCANNING" ? `0 0 0 9999px rgba(2,6,23,0.12), 0 0 28px ${color}55` : "0 0 0 9999px rgba(2,6,23,0.12)";
    el("State").textContent = SCAN_STATE_TEXT[next] || next;
    const dot = document.getElementById("kioskStateDot");
    if (dot) dot.style.backgroundColor = color;
    if (!message) return;
    el("CameraHint").textContent = message;
    if (next === "SCANNING") {
      setResultTone("scan");
      if (/Tiến gần|Lùi ra|Nhìn thẳng|Thiếu sáng|chói|Giữ yên|chưa rõ|Đưa khuôn|Chỉ 1 người| chuẩn bị/.test(message))
        el("Quality").textContent = message;
      if (/khung hình|kiểm tra sống|Đã lấy/.test(message))
        el("Liveness").textContent = message;
    }
    if (next === "VERIFYING") {
      el("Recognition").textContent = "Đang đối chiếu hồ sơ";
      setResultTone("scan");
    }
  };
  const controls = () => {
    if (!active()) return;
    const autoMode = config?.punch_mode === "AUTO_SMART";
    el("Auto").classList.toggle("hidden", !autoMode);
    el("CheckIn").classList.toggle("hidden", autoMode);
    el("CheckOut").classList.toggle("hidden", autoMode);
    const locked = busy || starting || Boolean(pendingAction) || Date.now() < cooldownUntil;
    const noCam = !stream?.active;
    el("Auto").disabled = locked;
    el("CheckIn").disabled = locked;
    el("CheckOut").disabled = locked;
    el("Camera").disabled = busy || starting;
    el("Camera").innerHTML = noCam
      ? '<span class="material-symbols-outlined text-[20px]">videocam</span>Bật camera'
      : '<span class="material-symbols-outlined text-[20px]">videocam</span>Camera đang bật';
    el("Stop").disabled = busy || starting || noCam;
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
  const startCooldown = (seconds, message = null) => {
    const wait = Math.max(0, Math.ceil(Number(seconds) || 0));
    if (!wait) return;
    cooldownUntil = Date.now() + wait * 1000;
    const tick = () => {
      if (!active()) return;
      const left = Math.ceil((cooldownUntil - Date.now()) / 1000);
      if (left <= 0) {
        cooldownUntil = 0;
        clearInterval(cooldownTimer);
        cooldownTimer = null;
        el("Cooldown").classList.add("hidden");
      } else {
        el("Cooldown").classList.remove("hidden");
        el("Cooldown").textContent = message || `Quét quá nhanh. Vui lòng đợi ${left} giây trước khi quét lại.`;
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
    confirmTimer = null;
    pendingAction = null;
    if (active()) el("Confirm").classList.add("hidden");
    controls();
  };
  const askConfirm = async (action) => {
    if (busy || starting || Date.now() < cooldownUntil) return;
    if (!stream?.active) {
      await start();
      if (!stream?.active || !active()) return;
    }
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
  const fetchChallenge = async () => {
    if (challengePromise) return challengePromise;
    challengePromise = (async () => {
      const response = await api.get("/attendance/challenge", {
        skipAuth: true,
        timeout: 8000,
        headers: { "X-Device-Id": deviceId },
      });
      const data = response?.data?.data || response?.data || response;
      if (!data?.challengeToken) throw new Error("Phiên xác thực không hợp lệ. Vui lòng quét lại.");
      const ttlMs = Math.max(1000, Number(data.expiresIn || 30) * 1000);
      challengeCache = {
        challengeToken: data.challengeToken,
        expiresIn: data.expiresIn,
        expiresAt: Date.now() + ttlMs - 1500,
      };
      return challengeCache;
    })().finally(() => {
      challengePromise = null;
    });
    return challengePromise;
  };
  const getChallenge = async (force = false) => {
    if (!force && challengeCache?.challengeToken && challengeCache.expiresAt - Date.now() > 6000)
      return challengeCache;
    return fetchChallenge();
  };
  const invalidateChallenge = (token = null) => {
    if (!challengeCache) return;
    if (!token || challengeCache.challengeToken === token) challengeCache = null;
  };
  const scheduleChallenge = () => {
    clearInterval(challengeTimer);
    challengeTimer = null;
    if (!stream?.active) return;
    const refresh = () => {
      if (!active() || !stream?.active) {
        clearInterval(challengeTimer);
        challengeTimer = null;
        return;
      }
      if (!challengeCache || challengeCache.expiresAt - Date.now() < 6000)
        fetchChallenge().catch(() => {});
    };
    refresh();
    challengeTimer = setInterval(refresh, 5000);
  };
  const stop = () => {
    session++;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
    clearInterval(challengeTimer);
    challengeTimer = null;
    if (active()) {
      el("CameraLabel").textContent = "Camera đã tắt";
      setScanState("IDLE", "Camera đã tắt");
      controls();
    }
  };
  const start = async () => {
    if (busy || starting) return;
    stop();
    starting = true;
    controls();
    const current = session;
    setScanState("INIT_CAM", "Đang mở camera và tải mô hình nhận diện");
    try {
      status(
        "Đang chuẩn bị",
        "Đang kiểm tra quyền thiết bị...",
        false,
        "scan",
      );
      const permission = await checkDevicePermission("attendance");
      if (!permission.allowed) {
        setScanState("ERROR", permission.message);
        status("Thiết bị chưa được cấp phép", permission.message, true, "warn");
        showDeviceBlocked(permission, () => start());
        return;
      }
      hideDeviceBlocked();
      status(
        "Đang mở camera",
        "Đang mở camera và tải mô hình nhận diện khuôn mặt...",
        false,
        "scan",
      );
      const opened = await openAttendanceCamera();
      if (!active() || current !== session) {
        opened.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = opened;
      video.srcObject = stream;
      await video.play();
      await ensureAttendanceFaceModels();
      if (!active() || current !== session) return;
      el("CameraLabel").textContent = "Camera sẵn sàng";
<<<<<<< HEAD
=======
      el("Subject").textContent = "Chưa phát hiện";
>>>>>>> origin/main
      el("Quality").textContent = "Đang chờ khuôn mặt";
      el("Liveness").textContent = "Chưa thực hiện";
      setScanState("IDLE", "Đứng yên, nhìn thẳng vào khung oval rồi chọn Vào ca hoặc Tan ca");
      status(
        "Sẵn sàng điểm danh",
<<<<<<< HEAD
        "Chọn Vào ca hoặc Tan ca. Chỉ một người đứng trước camera.",
=======
        "Nhìn thẳng vào khung, chọn Vào ca, Tan ca hoặc Tự động.",
        false,
        "ready",
>>>>>>> origin/main
      );
      scheduleChallenge();
    } catch (error) {
      if (active() && current === session) {
        stop();
        setScanState(error.code === "VIRTUAL_CAMERA" ? "SPOOF_BLOCKED" : "ERROR", error.message);
        status(
          error.code === "VIRTUAL_CAMERA" ? "Camera không hợp lệ" : "Không thể bật nhận diện",
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
    if (busy || starting || Date.now() < cooldownUntil) return;
    if (!stream?.active) {
      await start();
      if (!stream?.active || !active()) return;
    }
    busy = true;
    controls();
    clearTimeout(resultTimer);
    el("Identity").replaceChildren();
    const current = session;
    let usedToken = null;
    try {
<<<<<<< HEAD
      status(
        "Đang quét khuôn mặt",
        "Giữ khuôn mặt trong khung hình. Hệ thống đang lấy 5 mẫu để đối chiếu.",
      );
=======
      setScanState("SCANNING", "Đứng yên, nhìn thẳng vào khung oval");
      status("Đang quét khuôn mặt", "Giữ yên 1 giây, nhìn thẳng vào khung.", false, "scan");
      el("Subject").textContent = "Đang phát hiện";
>>>>>>> origin/main
      el("Quality").textContent = "Đang kiểm tra";
      el("Liveness").textContent = "Chưa thực hiện";
      el("Recognition").textContent = "Đang chờ xác minh";
<<<<<<< HEAD
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
=======
      el("Attendance").textContent = "Đang xác thực...";
      await getChallenge();
      const capture = await runAttendanceFaceScan(video, {
        onState: setScanState,
        onStage: (text) => {
          if (!active()) return;
          el("Quality").textContent = text;
        },
        onProgress: (count, total) => {
          if (!active()) return;
          el("Liveness").textContent = `Đã lấy ${count}/${total} khung hình`;
          el("Subject").textContent = "1 khuôn mặt • đã khóa";
        },
        onDebug: (data) => {
          debugData = data;
          renderDebug();
        },
        onChallenge: () => getChallenge(),
        isActive: () => active() && current === session && Boolean(stream?.active),
      });
      usedToken = capture.challengeToken;
      el("Subject").textContent = "1 khuôn mặt • đã khóa";
      el("Liveness").textContent =
        `real ${capture.liveness?.realMedian} • live ${capture.liveness?.liveMedian} • 5 khung • motion ${capture.liveness?.motion?.mean ?? 0}`;
>>>>>>> origin/main
      if (!active() || current !== session) return;
      setScanState("VERIFYING", "Đang đối chiếu hồ sơ và ghi nhận giờ");
      status(
        "Đang xác thực",
        "Đang đối chiếu khuôn mặt và ghi nhận giờ trên máy chủ...",
        false,
        "scan",
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
<<<<<<< HEAD
      const { employee, log, account } = response.data.data;
      el("Recognition").textContent = `Đã xác nhận • ${employee.full_name}`;
      el("Attendance").textContent = "Đã ghi nhận thành công";
      status(
        response.data.message,
        action === "check-in"
          ? "Đã ghi nhận giờ vào ca. Chúc bạn một ngày làm việc hiệu quả."
          : "Đã ghi nhận giờ tan ca.",
=======
      const { employee, log, account, shift, already_recorded: alreadyRecorded, attendance_state: attendanceState } = response.data.data;
      const scannedAction = response.data.data.action || action;
      beep(true);
      setScanState("SUCCESS", "Điểm danh thành công");
      setResultTone("success");
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
      let punctualityDetail = "";
      if (scannedAction === "check-in" && checkInMin != null && startMin != null) {
        if (lateMinutes > 0) {
          punctualityDetail = `Đi muộn ${lateMinutes} phút (quá ân hạn ${grace} phút so với giờ bắt đầu ca)`;
        } else if (checkInMin > startMin && allowedMin != null && checkInMin <= allowedMin) {
          punctualityDetail = `Đúng giờ - trong ân hạn ${grace} phút (trễ ${checkInMin - startMin} phút nhưng không tính đi muộn)`;
        } else {
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
        false,
        "success",
>>>>>>> origin/main
      );
      for (const text of [
        `${employee.employee_code} • ${employee.full_name}`,
        `Tài khoản: ${account?.username || employee.username || "—"}`,
        employee.department_name || "",
<<<<<<< HEAD
        `Giờ vào: ${log.check_in || "—"} • Giờ ra: ${log.check_out || "—"}`,
        `Công: ${Number(log.work_unit).toFixed(2)} • Đi muộn: ${Number(log.late_minutes || 0)} phút`,
      ]) {
=======
        `Giờ vào: ${String(log.check_in || "-").slice(0, 5)} - Giờ ra: ${String(log.check_out || "-").slice(0, 5)}`,
        punctualityDetail ? `Trạng thái vào ca: ${punctualityDetail}` : "",
        `Công: ${Number(log.work_day ?? log.work_unit).toFixed(2)} - Đi muộn: ${lateMinutes} phút`,
        ...(Number(config?.show_estimated_workday)
          ? [`Thời gian làm ròng: ${Number(log.net_work_minutes || 0)} phút`]
          : []),
      ].filter(Boolean)) {
>>>>>>> origin/main
        const line = document.createElement("p");
        line.textContent = text;
        el("Identity").appendChild(line);
      }
    } catch (error) {
      beep(false);
      const payload = error.response?.data || {};
      const code = error.code || payload.code || "";
      const message = payload.message ||
        (error.code === "ECONNABORTED"
          ? "Máy chủ phản hồi chậm. Kiểm tra lại kết quả trước khi quét lại."
          : error.message || "Không thể kết nối máy chủ.");
      const spoof = /^(SPOOF|CHALLENGE|VIRTUAL_CAMERA|MULTIPLE_FACES)/.test(String(code)) || error.state === "SPOOF_BLOCKED";
      if (/^CHALLENGE_(EXPIRED|INVALID)$/.test(String(code))) {
        invalidateChallenge();
        fetchChallenge().catch(() => {});
      }
      if (active() && current === session) {
        setScanState(spoof ? "SPOOF_BLOCKED" : "ERROR", message);
        el("Recognition").textContent = spoof ? "Chặn gian lận" : "Không nhận diện được";
        el("Attendance").textContent = "Không ghi nhận";
        if (spoof) startCooldown(SPOOF_COOLDOWN_SECONDS, `Phát hiện gian lận. Khóa quét trong ${SPOOF_COOLDOWN_SECONDS} giây.`);
        if (payload.code === "NO_CHECK_IN_FOUND") {
          el("Recognition").textContent = "Đã xác nhận khuôn mặt";
          el("Attendance").textContent = "Chưa có giờ Vào";
          status("Không thể chấm Ra", `${message} Vui lòng quét Vào ca trước.`, true, "warn");
        } else if (payload.code === "DOUBLE_PUNCH_TOO_FAST") {
          startCooldown(payload.wait_seconds);
          status("Quét quá nhanh", message, true, "warn");
        } else if (/đã vào ca hôm nay/i.test(message)) {
          el("Recognition").textContent = "Đã xác nhận khuôn mặt";
          el("Attendance").textContent = "Đã vào ca hôm nay";
          status("Đã vào ca hôm nay", message, false, "warn");
        } else if (/hoàn thành chấm công hôm nay/i.test(message)) {
          el("Recognition").textContent = "Đã xác nhận khuôn mặt";
          el("Attendance").textContent = "Đã hoàn thành hôm nay";
          status("Đã hoàn thành chấm công hôm nay", message, false, "success");
        } else if (payload.code === "UNSTABLE_FACE") {
          el("Quality").textContent = message;
          status("Khuôn mặt chưa ổn định", message, true, "warn");
        } else {
          status(spoof ? "Quét bị chặn" : "Chưa ghi nhận điểm danh", message, true, spoof ? "error" : "warn");
        }
      }
<<<<<<< HEAD
      if (active() && current === session)
        status(
          "Chưa ghi nhận điểm danh",
          error.response?.data?.message ||
            (error.code === "ECONNABORTED"
              ? "Máy chủ phản hồi chậm. Kiểm tra lại kết quả trước khi quét lại."
              : error.message || "Không thể kết nối máy chủ."),
          true,
        );
=======
>>>>>>> origin/main
    } finally {
      invalidateChallenge(usedToken);
      scheduleChallenge();
      busy = false;
      controls();
      if (active())
        resultTimer = setTimeout(() => {
          if (active() && !busy && scanState !== "SPOOF_BLOCKED") {
            el("Identity").replaceChildren();
            setScanState("IDLE", "Sẵn sàng cho người tiếp theo");
            status(
              "Sẵn sàng cho người tiếp theo",
              config?.punch_mode === "AUTO_SMART"
                ? "Nhấn Quét FaceID để hệ thống tự chọn Vào hoặc Ra."
                : "Chọn Vào ca hoặc Tan ca để quét khuôn mặt.",
              false,
              "ready",
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
  el("DebugToggle").addEventListener("click", () => setDebugVisible(!debugVisible));
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
  setDebugVisible(debugVisible);
  setScanState("IDLE", "Bật camera để bắt đầu");
  controls();
  void checkDevicePermission("attendance").then((permission) => {
    if (!active() || permission.allowed) {
      hideDeviceBlocked();
      return;
    }
    setScanState("ERROR", permission.message);
    status("Thiết bị chưa được cấp phép", permission.message, true, "warn");
    showDeviceBlocked(permission, () => start());
  });
  const cleanup = () => {
    hideDeviceBlocked();
    stop();
    clearInterval(clock);
    clearInterval(challengeTimer);
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
