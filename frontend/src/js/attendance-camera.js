import { Human } from "@vladmandic/human";

export const ATTENDANCE_CAMERA_CONFIG = Object.freeze({
  stream: Object.freeze({
    width: 640,
    height: 480,
    frameRate: 30,
    facingMode: "user",
  }),
  virtualCameraPatterns: Object.freeze([
    "obs",
    "virtual",
    "manycam",
    "snap camera",
    "splitcam",
    "youcam",
    "camtwist",
    "vcam",
    "iriun",
    "droidcam",
  ]),
  model: Object.freeze({
    backend: "webgl",
    modelBasePath: "https://cdn.jsdelivr.net/npm/@vladmandic/human/models/",
    detectorMaxDetected: 2,
    detectorMinConfidence: 0.75,
  }),
  quality: Object.freeze({
    faceHeightMin: 0.2,
    faceHeightMax: 0.72,
    boxScoreMin: 0.7,
    yawMaxDeg: 20,
    pitchMaxDeg: 24,
    rollMaxDeg: 16,
    analysisSize: 64,
    sharpnessMin: 10,
    brightnessMin: 40,
    brightnessMax: 230,
    whiteOutMax: 0.25,
    stableMs: 200,
  }),
  passive: Object.freeze({
    windowSize: 5,
    realBlock: 0.55,
    liveBlock: 0.5,
    hardReal: 0.42,
    hardLive: 0.38,
    hardFrameCount: 3,
    cooldownMs: 3000,
    frozenMeanDeltaMax: 0.0015,
    frozenMaxDeltaMax: 0.006,
  }),
  capture: Object.freeze({
    windowSize: 5,
    intervalMs: 120,
    sampleIndexes: Object.freeze([0, 2, 4]),
    embeddingMinLength: 512,
  }),
  scan: Object.freeze({
    timeoutMs: 20000,
    frameIntervalMs: 45,
  }),
});

const FACE_CAPTURE_MODEL = "human-faceres1024-subjectlock-v3";
const MESH_INDEX = Object.freeze({
  NOSE: 1,
  LEFT_EYE: 33,
  RIGHT_EYE: 263,
  FOREHEAD: 10,
  CHIN: 152,
  LEFT_CHEEK: 234,
  RIGHT_CHEEK: 454,
});

const HUMAN_CONFIG = {
  backend: ATTENDANCE_CAMERA_CONFIG.model.backend,
  modelBasePath: ATTENDANCE_CAMERA_CONFIG.model.modelBasePath,
  cacheSensitivity: 0,
  deallocate: true,
  filter: { enabled: false, equalization: false },
  face: {
    enabled: true,
    detector: {
      modelPath: "blazeface.json",
      rotation: true,
      maxDetected: ATTENDANCE_CAMERA_CONFIG.model.detectorMaxDetected,
      minConfidence: ATTENDANCE_CAMERA_CONFIG.model.detectorMinConfidence,
      return: false,
      skipFrames: 0,
      skipTime: 0,
    },
    mesh: { enabled: true, skipFrames: 0, skipTime: 0 },
    attention: { enabled: false },
    iris: { enabled: false },
    emotion: { enabled: false },
    age: { enabled: false },
    gender: { enabled: false },
    description: { enabled: true, skipFrames: 0, skipTime: 0 },
    antispoof: { enabled: true, skipFrames: 0, skipTime: 0 },
    liveness: { enabled: true, skipFrames: 0, skipTime: 0 },
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: false },
  segmentation: { enabled: false },
};

const human = new Human(HUMAN_CONFIG);
let modelPromise = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const degrees = (value) => Number.isFinite(Number(value)) ? Number(value) * 180 / Math.PI : 0;
const round = (value) => Number(Number(value || 0).toFixed(3));
const scanError = (code, message, state) => Object.assign(new Error(message), { code, state });

export const ensureAttendanceFaceModels = async () => {
  if (!modelPromise) {
    modelPromise = (async () => {
      await human.load(HUMAN_CONFIG);
      await human.warmup(HUMAN_CONFIG);
    })().catch((error) => {
      modelPromise = null;
      throw error;
    });
  }
  await modelPromise;
};

export const openAttendanceCamera = async () => {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error("Trình duyệt không hỗ trợ camera. Mở bằng localhost hoặc HTTPS và kiểm tra webcam.");
  const { width, height, frameRate, facingMode } = ATTENDANCE_CAMERA_CONFIG.stream;
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: width, max: width },
      height: { ideal: height, max: height },
      frameRate: { ideal: frameRate, max: frameRate },
    },
    audio: false,
  });
  const track = stream.getVideoTracks()[0];
  const label = String(track?.label || "").toLowerCase();
  const deviceId = String(track?.getSettings?.().deviceId || "");
  const matched = ATTENDANCE_CAMERA_CONFIG.virtualCameraPatterns.find((pattern) => label.includes(pattern));
  if (matched || !deviceId) {
    stream.getTracks().forEach((item) => item.stop());
    throw scanError("VIRTUAL_CAMERA", "Không hỗ trợ camera ảo", "ERROR");
  }
  return stream;
};

const drawRegion = (video, box, canvas) => {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const centerX = box[0] + box[2] / 2;
  const centerY = box[1] + box[3] / 2;
  const side = Math.min(box[2], box[3]);
  const x = Math.max(0, Math.min(centerX - side / 2, video.videoWidth - side));
  const y = Math.max(0, Math.min(centerY - side / 2, video.videoHeight - side));
  context.drawImage(video, x, y, side, side, 0, 0, canvas.width, canvas.height);
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
};

const frameMetrics = (pixels, size) => {
  const gray = new Float32Array(size * size);
  let brightness = 0;
  let white = 0;
  for (let index = 0, pixel = 0; index < gray.length; index++, pixel += 4) {
    const r = pixels[pixel];
    const g = pixels[pixel + 1];
    const b = pixels[pixel + 2];
    gray[index] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    brightness += gray[index];
    if (r > 245 && g > 245 && b > 245) white += 1;
  }
  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const index = y * size + x;
      const laplacian = 4 * gray[index] - gray[index - 1] - gray[index + 1] - gray[index - size] - gray[index + size];
      sum += laplacian;
      sumSquares += laplacian * laplacian;
      count += 1;
    }
  }
  const mean = sum / count;
  return {
    brightness: brightness / gray.length,
    whiteRatio: white / gray.length,
    sharpness: Math.max(0, sumSquares / count - mean * mean),
  };
};

const evaluateQuality = (face, video, analysisCanvas) => {
  const { quality } = ATTENDANCE_CAMERA_CONFIG;
  const box = face?.box;
  const angle = face?.rotation?.angle;
  const yaw = degrees(angle?.yaw);
  const pitch = degrees(angle?.pitch);
  const roll = degrees(angle?.roll);
  const heightRatio = box ? box[3] / (video.videoHeight || 1) : 0;
  const boxScore = Number(face?.score) || 0;
  const metrics = box
    ? frameMetrics(drawRegion(video, box, analysisCanvas), quality.analysisSize)
    : { brightness: 0, whiteRatio: 0, sharpness: 0 };
  const common = {
    yaw,
    pitch,
    roll,
    heightRatio,
    boxScore,
    brightness: metrics.brightness,
    whiteRatio: metrics.whiteRatio,
    sharpness: metrics.sharpness,
  };
  const fail = (reason) => ({
    ...common,
    ok: false,
    message: reason,
    gateReason: reason,
  });
  if (!box) return fail("Đưa khuôn mặt vào khung hình");
  if (boxScore < quality.boxScoreMin) return fail("Khuôn mặt chưa rõ, tiến gần hơn");
  if (heightRatio < quality.faceHeightMin) return fail("Tiến gần hơn");
  if (heightRatio > quality.faceHeightMax) return fail("Lùi ra một chút");
  if (Math.abs(yaw) > quality.yawMaxDeg || Math.abs(pitch) > quality.pitchMaxDeg || Math.abs(roll) > quality.rollMaxDeg)
    return fail("Nhìn thẳng camera");
  if (metrics.sharpness < quality.sharpnessMin) return fail("Giữ yên mặt 1 giây");
  if (metrics.brightness < quality.brightnessMin) return fail("Thiếu sáng");
  if (metrics.brightness > quality.brightnessMax) return fail("Ánh sáng quá chói, vui lòng lùi ra chỗ khác");
  if (metrics.whiteRatio >= quality.whiteOutMax) return fail("Bị chói sáng, vui lòng điều chỉnh ánh sáng");
  return { ...common, ok: true, message: "Đạt", gateReason: "Đạt" };
};

const detectFaces = async (video) => {
  const result = await human.detect(video, HUMAN_CONFIG);
  return (Array.isArray(result?.face) ? result.face : []).filter((face) => Array.isArray(face?.box) && face.box.length === 4);
};

const meshSignature = (face) => {
  const mesh = face?.mesh;
  const box = face?.box;
  if (!Array.isArray(mesh) || !Array.isArray(box)) return null;
  const point = (index) => {
    const value = mesh[index];
    return Array.isArray(value) && value.length >= 2 ? value : null;
  };
  const nose = point(MESH_INDEX.NOSE);
  const leftEye = point(MESH_INDEX.LEFT_EYE);
  const rightEye = point(MESH_INDEX.RIGHT_EYE);
  const forehead = point(MESH_INDEX.FOREHEAD);
  const chin = point(MESH_INDEX.CHIN);
  const leftCheek = point(MESH_INDEX.LEFT_CHEEK);
  const rightCheek = point(MESH_INDEX.RIGHT_CHEEK);
  if (!nose || !leftEye || !rightEye || !forehead || !chin || !leftCheek || !rightCheek) return null;
  const diagonal = Math.max(1, Math.hypot(box[2], box[3]));
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) / diagonal;
  const eye = Math.max(distance(leftEye, rightEye), 0.001);
  const centerX = box[0] + box[2] / 2;
  const centerY = box[1] + box[3] / 2;
  return [
    eye,
    distance(nose, leftEye) / eye,
    distance(nose, rightEye) / eye,
    distance(forehead, chin) / eye,
    distance(leftCheek, rightCheek) / eye,
    distance(nose, chin) / eye,
    (nose[0] - centerX) / Math.max(1, box[2]),
    (nose[1] - centerY) / Math.max(1, box[3]),
  ];
};

const motionDelta = (signatures) => {
  if (signatures.length < 2 || signatures.some((item) => !item)) return null;
  let total = 0;
  let max = 0;
  let comparisons = 0;
  for (let index = 1; index < signatures.length; index++) {
    const previous = signatures[index - 1];
    const current = signatures[index];
    if (previous.length !== current.length) return null;
    for (let item = 0; item < current.length; item++) {
      const diff = Math.abs(current[item] - previous[item]);
      total += diff;
      max = Math.max(max, diff);
      comparisons += 1;
    }
  }
  if (!comparisons) return null;
  return { mean: total / comparisons, max, comparisons };
};

export const runAttendanceFaceScan = async (
  video,
  { onState = () => {}, onStage = () => {}, onProgress = () => {}, onDebug = () => {}, onChallenge, isActive = () => true } = {},
) => {
  await ensureAttendanceFaceModels();
  const { quality, passive, capture, scan } = ATTENDANCE_CAMERA_CONFIG;
  const analysisCanvas = document.createElement("canvas");
  analysisCanvas.width = quality.analysisSize;
  analysisCanvas.height = quality.analysisSize;
  const snapshotCanvas = document.createElement("canvas");
  snapshotCanvas.width = 160;
  snapshotCanvas.height = 120;
  const deadline = performance.now() + scan.timeoutMs;
  const samples = [];
  let stableSince = 0;
  let lastSampleAt = 0;
  let lastGate = { gateReason: "Chưa có khuôn mặt", yaw: 0, pitch: 0, roll: 0, heightRatio: 0, boxScore: 0, brightness: 0, whiteRatio: 0, sharpness: 0 };
  const emitDebug = (extra = {}) => {
    const realValues = samples.map((item) => item.real);
    const liveValues = samples.map((item) => item.live);
    const signatures = samples.map((item) => item.signature);
    const motion = motionDelta(signatures);
    onDebug({
      frame: samples.length,
      windowSize: passive.windowSize,
      real: round(samples[samples.length - 1]?.real || 0),
      live: round(samples[samples.length - 1]?.live || 0),
      realMedian: round(median(realValues)),
      liveMedian: round(median(liveValues)),
      realBlock: passive.realBlock,
      liveBlock: passive.liveBlock,
      yaw: round(lastGate.yaw),
      pitch: round(lastGate.pitch),
      roll: round(lastGate.roll),
      heightRatio: round(lastGate.heightRatio),
      boxScore: round(lastGate.boxScore),
      brightness: round(lastGate.brightness),
      glareRatio: round(lastGate.whiteRatio),
      sharpness: round(lastGate.sharpness),
      gateReason: lastGate.gateReason,
      hardLowFrames: samples.filter((item) => item.real < passive.hardReal || item.live < passive.hardLive).length,
      motionMean: motion ? round(motion.mean) : null,
      motionMax: motion ? round(motion.max) : null,
      motionComparisons: motion?.comparisons || 0,
      frozen: false,
      ...extra,
    });
  };
  try {
    if (!onChallenge) throw new Error("Chưa có máy chủ cấp phiên xác thực.");
    const response = await onChallenge();
    const challenge = response?.data?.data || response?.data || response;
    const challengeToken = challenge?.challengeToken || challenge?.token;
    if (!challengeToken) throw new Error("Phiên xác thực không hợp lệ. Vui lòng quét lại.");
    onState("SCANNING", "Đứng yên, nhìn thẳng vào camera");
    onProgress(0, capture.windowSize);
    emitDebug();
    while (samples.length < capture.windowSize && performance.now() < deadline) {
      if (!isActive()) throw new Error("Đã dừng quét khuôn mặt.");
      const faces = await detectFaces(video);
      if (faces.length >= 2) {
        lastGate = { ...lastGate, gateReason: "Chỉ 1 người trong khung hình" };
        onState("SCANNING", lastGate.gateReason);
        onStage(lastGate.gateReason);
        emitDebug({ frozen: false });
        throw scanError("MULTIPLE_FACES", "Chỉ 1 người trong khung hình", "SPOOF_BLOCKED");
      }
      const face = faces.length === 1 ? faces[0] : null;
      const gate = face
        ? evaluateQuality(face, video, analysisCanvas)
        : { ok: false, gateReason: "Đưa khuôn mặt vào khung hình", message: "Đưa khuôn mặt vào khung hình", yaw: 0, pitch: 0, roll: 0, heightRatio: 0, boxScore: 0, brightness: 0, whiteRatio: 0, sharpness: 0 };
      lastGate = gate;
      if (!gate.ok) {
        samples.length = 0;
        stableSince = 0;
        lastSampleAt = 0;
        onState("SCANNING", gate.message);
        onStage(gate.message);
        onProgress(0, capture.windowSize);
        emitDebug({ frozen: false });
        await sleep(scan.frameIntervalMs);
        continue;
      }
      if (!stableSince) stableSince = performance.now();
      if (performance.now() - stableSince < quality.stableMs) {
        onState("SCANNING", "Giữ yên mặt 1 giây");
        emitDebug({ frozen: false });
        await sleep(scan.frameIntervalMs);
        continue;
      }
      if (performance.now() - lastSampleAt < capture.intervalMs) {
        await sleep(scan.frameIntervalMs);
        continue;
      }
      const embedding = Array.from(face.embedding || []);
      if (embedding.length < capture.embeddingMinLength) {
        onState("SCANNING", "Mô hình đang chuẩn bị, giữ yên mặt 1 giây");
        emitDebug({ frozen: false });
        await sleep(scan.frameIntervalMs);
        continue;
      }
      const real = Number(face.real) || 0;
      const live = Number(face.live) || 0;
      samples.push({
        real,
        live,
        embedding,
        signature: meshSignature(face),
        sharpness: gate.sharpness,
        brightness: gate.brightness,
        whiteRatio: gate.whiteRatio,
        heightRatio: gate.heightRatio,
        boxScore: gate.boxScore,
        boxWidth: face.box[2],
      });
      lastSampleAt = performance.now();
      const hardLowFrames = samples.filter((item) => item.real < passive.hardReal || item.live < passive.hardLive).length;
      if (hardLowFrames >= passive.hardFrameCount) {
        emitDebug({ frozen: false, hardLowFrames });
        throw scanError("SPOOF_DETECTED", "Phát hiện hình ảnh/màn hình không hợp lệ", "SPOOF_BLOCKED");
      }
      if (samples.length >= passive.windowSize) {
        const realMedian = median(samples.map((item) => item.real));
        const liveMedian = median(samples.map((item) => item.live));
        if (realMedian < passive.realBlock || liveMedian < passive.liveBlock) {
          emitDebug({ frozen: false, hardLowFrames });
          throw scanError("SPOOF_DETECTED", "Phát hiện hình ảnh/màn hình không hợp lệ", "SPOOF_BLOCKED");
        }
        const motion = motionDelta(samples.map((item) => item.signature));
        const frozen = Boolean(
          motion &&
          motion.comparisons >= passive.windowSize - 2 &&
          motion.mean < passive.frozenMeanDeltaMax &&
          motion.max < passive.frozenMaxDeltaMax,
        );
        if (frozen) {
          emitDebug({
            frozen,
            hardLowFrames,
            motionMean: round(motion.mean),
            motionMax: round(motion.max),
          });
          throw scanError("SPOOF_STATIC_VECTOR", "Phát hiện ảnh tĩnh không hợp lệ", "SPOOF_BLOCKED");
        }
      }
      onState("SCANNING", `Đang kiểm tra sống • ${samples.length}/${capture.windowSize} khung hình`);
      onStage(gate.message);
      onProgress(samples.length, capture.windowSize);
      emitDebug();
    }
    if (samples.length !== capture.windowSize)
      throw new Error("Không lấy đủ 5 khung hình ổn định. Vui lòng đứng yên và quét lại.");
    const selected = capture.sampleIndexes.map((index) => samples[index]).filter(Boolean);
    if (selected.length !== 3)
      throw new Error("Không lấy đủ 3 mẫu xác thực. Vui lòng quét lại.");
    const realMedian = round(median(samples.map((item) => item.real)));
    const liveMedian = round(median(samples.map((item) => item.live)));
    const motion = motionDelta(samples.map((item) => item.signature));
    const snapshotContext = snapshotCanvas.getContext("2d");
    snapshotContext.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, snapshotCanvas.width, snapshotCanvas.height);
    onState("SCANNING", "Đã lấy 5 khung hình sạch");
    emitDebug({ frozen: false });
    return {
      embeddings: selected.map((item) => item.embedding),
      challengeToken,
      liveness: {
        realMedian,
        liveMedian,
        realScores: samples.map((item) => round(item.real)),
        liveScores: samples.map((item) => round(item.live)),
        windowSize: passive.windowSize,
        sampleIntervalMs: capture.intervalMs,
        hardLowFrames: samples.filter((item) => item.real < passive.hardReal || item.live < passive.hardLive).length,
        motion: {
          mean: motion ? round(motion.mean) : 0,
          max: motion ? round(motion.max) : 0,
          comparisons: motion?.comparisons || 0,
          frozen: false,
        },
        gateReason: "Đạt",
      },
      capture: {
        model: FACE_CAPTURE_MODEL,
        face_only: true,
        samples: 3,
        quality: {
          min_score: round(Math.min(...samples.map((item) => item.boxScore))),
          min_box_score: round(Math.min(...samples.map((item) => item.boxScore))),
          min_sharpness: round(Math.min(...samples.map((item) => item.sharpness))),
          brightness_min: round(Math.min(...samples.map((item) => item.brightness))),
          brightness_max: round(Math.max(...samples.map((item) => item.brightness))),
          glare_ratio_max: round(Math.max(...samples.map((item) => item.whiteRatio))),
          min_face_width: round(Math.min(...samples.map((item) => item.boxWidth))),
        },
        subject: {
          locked: true,
          stable_frames: samples.length,
          max_speed: motion ? round(motion.max) : 0,
          rejected_moving_persons: 0,
        },
      },
      snapshot: snapshotCanvas.toDataURL("image/webp", 0.35),
    };
  } finally {
    analysisCanvas.width = 0;
    analysisCanvas.height = 0;
    snapshotCanvas.width = 0;
    snapshotCanvas.height = 0;
  }
};
