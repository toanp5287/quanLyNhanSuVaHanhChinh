import { randomBytes } from "node:crypto";
import { db } from "../../config/database.js";
import { assertCanApprove, buildEmployeeScope } from "../../utils/helper.js";
import { recalculateEmployeeMonth } from "../tong-hop-chot-cong/tongHopChotCong.service.js";
import {
  buildPolicySnapshot,
  computeWorkDay,
  ensureAttendancePolicySchema,
  getKioskConfig,
  getPolicyForShift,
  getShiftWorkWindow,
  normalizeRules,
} from "../attendance-policy/attendancePolicy.service.js";
import {
  notifyEmployee,
  publishNotificationRow,
} from "../notifications/notification.service.js";

export const attendanceError = (message, status = 400) =>
  Object.assign(new Error(message), { status });

const ATTENDANCE_CHALLENGE_TTL_MS = 30000;
const attendanceChallenges = new Map();

export const ATTENDANCE_LIVENESS_CONFIG = Object.freeze({
  realMedianMin: 0.55,
  liveMedianMin: 0.5,
  staticVectorMax: 0.9988,
  unstableVectorMin: 0.76,
  margin: 0.08,
});

const fraudError = (code, message, scores = null, status = 403) =>
  Object.assign(attendanceError(message, status), { code, fraud: true, scores });

export const logAttendanceFraud = ({ reason, scores = null, ip = null, deviceId = null, path = null, userAgent = null }) => {
  console.warn("[ATTENDANCE_FRAUD]", JSON.stringify({
    reason: reason || "UNKNOWN",
    scores,
    ip,
    deviceId,
    path,
    userAgent,
    timestamp: new Date().toISOString(),
  }));
};

export const createAttendanceChallenge = () => {
  const now = Date.now();
  for (const [token, challenge] of attendanceChallenges)
    if (challenge.expiresAt <= now) attendanceChallenges.delete(token);
  const token = randomBytes(24).toString("hex");
  const challenge = {
    token,
    expiresAt: now + ATTENDANCE_CHALLENGE_TTL_MS,
  };
  attendanceChallenges.set(token, challenge);
  return {
    challengeToken: token,
    expiresIn: ATTENDANCE_CHALLENGE_TTL_MS / 1000,
  };
};

export const consumeAttendanceChallenge = (token) => {
  const challenge = attendanceChallenges.get(String(token || ""));
  if (!challenge)
    throw fraudError("CHALLENGE_INVALID", "Phiên xác thực không hợp lệ hoặc đã được sử dụng");
  attendanceChallenges.delete(String(token));
  if (challenge.expiresAt <= Date.now())
    throw fraudError("CHALLENGE_EXPIRED", "Phiên xác thực đã hết hạn. Vui lòng quét lại");
  return challenge;
};

const columnCache = new Map();
let workShiftSchemaPromise;
const hasColumn = async (connection, table, column) => {
  const key = `${table}.${column}`;
  const cached = columnCache.get(key);
  if (cached && Date.now() - cached.at < 30000) return cached.value;
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  const value = Number(rows[0]?.total) > 0;
  columnCache.set(key, { at: Date.now(), value });
  return value;
};

const ensureWorkShiftSchema = async () => {
  if (!workShiftSchemaPromise) {
    workShiftSchemaPromise = (async () => {
      const definitions = [
        ["grace_period", "INT NOT NULL DEFAULT 15"],
        ["checkin_start", "TIME NULL"],
        ["checkin_end", "TIME NULL"],
        ["checkout_start", "TIME NULL"],
        ["checkout_end", "TIME NULL"],
        ["grace_period_minutes", "INT NOT NULL DEFAULT 15"],
        ["is_active", "TINYINT(1) NOT NULL DEFAULT 1"],
      ];
      for (const [column, definition] of definitions) {
        if (await hasColumn(db, "work_shifts", column)) continue;
        await db.query(
          `ALTER TABLE work_shifts ADD COLUMN ${column} ${definition}`,
        );
        columnCache.delete(`work_shifts.${column}`);
        columnCache.delete(`work_shifts.grace_period`);
        if (column === "grace_period_minutes") {
          const hasLegacyGrace = await hasColumn(
            db,
            "work_shifts",
            "grace_period",
          );
          if (hasLegacyGrace) {
            await db.query(
              "UPDATE work_shifts SET grace_period_minutes = COALESCE(grace_period, 15)",
            );
          }
        }
      }
    })().catch((error) => {
      workShiftSchemaPromise = null;
      throw error;
    });
  }
  await workShiftSchemaPromise;
  await ensureAttendancePolicySchema();
};

let overtimeSchemaPromise;
export const ensureOvertimeSchema = async () => {
  if (!overtimeSchemaPromise) {
    overtimeSchemaPromise = (async () => {
      await db.query(
        `CREATE TABLE IF NOT EXISTS holidays (
           id INT AUTO_INCREMENT PRIMARY KEY,
           holiday_date DATE NOT NULL UNIQUE,
           name VARCHAR(150) NOT NULL,
           ot_rate DECIMAL(3,2) NOT NULL DEFAULT 3.00,
           is_paid TINYINT(1) NOT NULL DEFAULT 1,
           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      );
      const columns = [
        ["requested_hours", "DECIMAL(4,2) NULL DEFAULT NULL AFTER end_time"],
        ["actual_ot_hours", "DECIMAL(4,2) NULL DEFAULT NULL AFTER requested_hours"],
        ["reject_reason", "VARCHAR(255) NULL DEFAULT NULL AFTER approved_at"],
      ];
      for (const [column, definition] of columns) {
        if (await hasColumn(db, "overtime_requests", column)) continue;
        await db.query(
          `ALTER TABLE overtime_requests ADD COLUMN ${column} ${definition}`,
        );
        columnCache.delete(`overtime_requests.${column}`);
      }
      const [indexRows] = await db.query(
        `SELECT COUNT(*) AS total FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'overtime_requests'
            AND INDEX_NAME = 'idx_ot_emp_date_status'`,
      );
      if (!Number(indexRows[0]?.total)) {
        await db.query(
          `CREATE INDEX idx_ot_emp_date_status
             ON overtime_requests (employee_id, work_date, status)`,
        );
      }
    })().catch((error) => {
      overtimeSchemaPromise = null;
      throw error;
    });
  }
  await overtimeSchemaPromise;
};

const readFaceThreshold = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 && value < 1 ? value : fallback;
};
export const ATTENDANCE_MATCH_THRESHOLD = readFaceThreshold("ATTENDANCE_MATCH_THRESHOLD", 0.76);
export const DUPLICATE_FACE_THRESHOLD = readFaceThreshold("DUPLICATE_FACE_THRESHOLD", 0.7);
export const FACE_MATCH_THRESHOLD = ATTENDANCE_MATCH_THRESHOLD;
export const FACE_STORAGE_MODEL = "human-faceres1024-subjectlock-v2";
export const FACE_MIN_PASS_RATIO = 0.8;
export const FACE_AMBIGUITY_MARGIN = 0.06;
export const FACE_CAPTURE_MODEL = "human-faceres1024-subjectlock-v3";
export const FACE_ENROLLMENT_CONFIG = Object.freeze({
  sampleCount: 5,
  vectorDimension: 1024,
  duplicateHardThreshold: 0.72,
  duplicateWarnThreshold: 0.64,
  intraMin: 0.84,
  staticSampleMax: 0.9988,
  minReal: 0.72,
  minLive: 0.68,
});
const CAPTURE_MIN = {
  score: 0.85,
  real: 0.7,
  live: 0.7,
  sharpness: 30,
  brightnessMin: 50,
  brightnessMax: 220,
  faceWidth: 130,
  stableFrames: 8,
  maxSpeed: 18,
};
const assertMin = (value, min, message) => {
  if (!Number.isFinite(Number(value)) || Number(value) < min)
    throw attendanceError(`${message} chưa đạt yêu cầu. Vui lòng quét lại.`, 400);
};
const assertCaptureMetadata = (capture, total, options = {}) => {
  if (!capture || typeof capture !== "object")
    throw attendanceError("Thiếu dữ liệu xác thực chất lượng khuôn mặt. Vui lòng tải lại trang và quét lại.", 400);
  if (capture.model !== FACE_CAPTURE_MODEL)
    throw attendanceError("Phiên bản mô hình nhận diện không khớp. Vui lòng tải lại trang và quét lại.", 400);
  if (capture.face_only !== true || capture.subject?.locked !== true)
    throw attendanceError("Chưa khóa đúng người quét. Vui lòng đứng yên và quét lại.", 400);
  const quality = capture.quality || {};
  const liveness = capture.liveness || {};
  const subject = capture.subject || {};
  assertMin(quality.min_score, CAPTURE_MIN.score, "Độ tin cậy khuôn mặt");
  assertMin(quality.min_real, CAPTURE_MIN.real, "Khả năng chống ảnh giả");
  assertMin(quality.min_live, CAPTURE_MIN.live, "Xác thực sống");
  assertMin(quality.min_sharpness, CAPTURE_MIN.sharpness, "Độ nét khuôn mặt");
  assertMin(quality.min_face_width, CAPTURE_MIN.faceWidth, "Kích thước khuôn mặt");
  assertMin(quality.brightness_min, CAPTURE_MIN.brightnessMin, "Độ sáng tối thiểu");
  if (!Number.isFinite(Number(quality.brightness_max)) || Number(quality.brightness_max) > CAPTURE_MIN.brightnessMax)
    throw attendanceError("Ánh sáng quá chói. Vui lòng quét lại.", 400);
  if (
    options.liveness_enabled !== false &&
    (liveness.blink_verified !== true ||
      !Number.isFinite(Number(liveness.blink_count)) ||
      Number(liveness.blink_count) < 1)
  )
    throw attendanceError("Chưa xác thực chớp mắt. Vui lòng quét lại.", 400);
  if (options.liveness_enabled !== false)
    assertMin(subject.stable_frames, CAPTURE_MIN.stableFrames, "Thời gian đứng yên");
  if (!Number.isFinite(Number(subject.max_speed)) || Number(subject.max_speed) > CAPTURE_MIN.maxSpeed)
    throw attendanceError("Người quét di chuyển quá nhiều. Vui lòng đứng yên và quét lại.", 400);
  if (Number(capture.samples) !== Number(total))
    throw attendanceError("Số mẫu khuôn mặt không khớp. Vui lòng quét lại.", 400);
};
const requiredPassCount = (total, votingFrames = 0) =>
  Math.min(
    total,
    Math.max(1, Math.ceil(total * FACE_MIN_PASS_RATIO), Math.round(votingFrames || 0)),
  );
export const l2Normalize = (vec) => {
  if (
    !Array.isArray(vec) ||
    !vec.length ||
    vec.length > 4096 ||
    vec.some((value) => typeof value !== "number" || !Number.isFinite(value))
  )
    throw attendanceError("Vector sinh trắc học không hợp lệ");
  const norm = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm < 1e-10)
    throw attendanceError("Vector sinh trắc học rỗng");
  return vec.map((value) => value / norm);
};
export const cosineSimilarity = (vecA, vecB) => {
  if (!vecA || !vecB || vecA.length !== vecB.length) return -1;
  const a = l2Normalize(vecA),
    b = l2Normalize(vecB);
  return Math.max(
    -1,
    Math.min(
      1,
      a.reduce((sum, value, index) => sum + value * b[index], 0),
    ),
  );
};
export const computeCentroid = (embeddings) => {
  if (!Array.isArray(embeddings) || !embeddings.length)
    throw attendanceError("Không có mẫu khuôn mặt");
  const normalized = embeddings.map(l2Normalize);
  if (normalized.some((vector) => vector.length !== normalized[0].length))
    throw attendanceError("Các mẫu không cùng mô hình nhận diện");
  return l2Normalize(
    normalized[0].map(
      (_, index) =>
        normalized.reduce((sum, vector) => sum + vector[index], 0) /
        normalized.length,
    ),
  );
};
export const verifyInternalConsistency = (
  embeddings,
  minInternalSim = 0.82,
) => {
  const centroid = computeCentroid(embeddings);
  const valid = embeddings.every(
    (vector) => cosineSimilarity(vector, centroid) >= minInternalSim,
  );
  return {
    valid,
    message: valid
      ? ""
      : "Khuôn mặt di chuyển quá nhanh hoặc bị nhòe khi quét, vui lòng giữ thẳng mặt và quét lại!",
  };
};
export const parseStoredFaceData = (rawJson) => {
  try {
    const raw = typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;
    const source = Array.isArray(raw)
      ? typeof raw[0] === "number"
        ? [raw]
        : raw
      : raw?.samples || (raw?.centroid ? [raw.centroid] : []);
    if (!source.length || source.length > 8) return null;
    const samples = source.map(l2Normalize);
    if (samples.some((sample) => sample.length !== samples[0].length))
      return null;
    const centroid = raw?.centroid
      ? l2Normalize(raw.centroid)
      : computeCentroid(samples);
    if (centroid.length !== samples[0].length) return null;
    return { centroid, samples };
  } catch {
    return null;
  }
};
export const extractVectors = (rawDescriptor) => {
  const stored = parseStoredFaceData(rawDescriptor);
  if (!stored) return [];
  return [...stored.samples, stored.centroid];
};
export const findDuplicateFace = (
  incomingVectors,
  employees,
  threshold = DUPLICATE_FACE_THRESHOLD,
) => {
  let best = null;
  for (const employee of employees || []) {
    const existingVectors = extractVectors(employee.face_descriptor);
    for (const incoming of incomingVectors || []) {
      for (const existing of existingVectors) {
        const score = cosineSimilarity(incoming, existing);
        if (!Number.isFinite(score)) continue;
        if (!best || score > best.score) best = { employee, score };
      }
    }
  }
  return {
    isDuplicate: Boolean(best && best.score >= threshold),
    bestMatchScore: best?.score ?? 0,
    matchedEmployeeId: best?.employee?.id ?? null,
    matchedEmployee: best?.employee ?? null,
    thresholdUsed: threshold,
  };
};

export const evaluateEnrollmentDuplicate = (
  incomingCentroid,
  incomingSamples,
  employees,
  config = FACE_ENROLLMENT_CONFIG,
) => {
  const centroid = l2Normalize(incomingCentroid);
  const samples = Array.isArray(incomingSamples) ? incomingSamples.map(l2Normalize) : [];
  let best = null;
  for (const employee of employees || []) {
    const stored = parseStoredFaceData(employee.face_descriptor);
    if (!stored) continue;
    const centroidScore = cosineSimilarity(centroid, stored.centroid);
    const sampleScore = stored.samples.reduce(
      (max, sample) => Math.max(max, cosineSimilarity(centroid, sample)),
      -1,
    );
    const score = Math.max(centroidScore, sampleScore);
    if (!Number.isFinite(score)) continue;
    if (!best || score > best.score) {
      best = {
        employee,
        score,
        centroidScore,
        sampleScore,
        comparedSamples: samples.length,
      };
    }
  }
  const bestMatchScore = best?.score ?? 0;
  const hard = bestMatchScore >= config.duplicateHardThreshold;
  const warn = !hard && bestMatchScore >= config.duplicateWarnThreshold;
  return {
    status: hard ? "DUPLICATE_FACE_DETECTED" : warn ? "SIMILAR_FACE_REVIEW_REQUIRED" : "OK",
    isDuplicate: hard || warn,
    bestMatchScore,
    matchedEmployeeId: best?.employee?.id ?? null,
    matchedEmployee: best?.employee ?? null,
    thresholdUsed: hard ? config.duplicateHardThreshold : config.duplicateWarnThreshold,
  };
};
export const computeIntraFaceScore = (embeddings) => {
  const centroid = computeCentroid(embeddings);
  return embeddings.reduce(
    (minimum, vector) => Math.min(minimum, cosineSimilarity(vector, centroid)),
    1,
  );
};
export const evaluateFullSetMatch = (
  liveEmbeddings,
  storedFaceJson,
  threshold = FACE_MATCH_THRESHOLD,
  votingFrames = 0,
) => {
  const stored = parseStoredFaceData(storedFaceJson);
  const empty = {
    isMatch: false,
    avgScore: 0,
    centroidScore: 0,
    passCount: 0,
    requiredPassCount: 0,
    totalSamples: liveEmbeddings?.length || 0,
  };
  if (
    !stored ||
    !liveEmbeddings?.length ||
    liveEmbeddings.some((vector) => vector.length !== stored.centroid.length)
  )
    return empty;
  const scores = liveEmbeddings.map((vector) =>
    Math.max(
      cosineSimilarity(vector, stored.centroid),
      ...stored.samples.map((sample) => cosineSimilarity(vector, sample)),
    ),
  );
  const centroidScore = cosineSimilarity(
    computeCentroid(liveEmbeddings),
    stored.centroid,
  );
  const avgScore =
    (scores.reduce((sum, score) => sum + score, 0) / scores.length) * 0.5 +
    centroidScore * 0.5;
  const passCount = scores.filter((score) => score >= threshold - 0.02).length;
  const required = requiredPassCount(scores.length, votingFrames);
  return {
    isMatch: avgScore >= threshold && passCount >= required,
    avgScore,
    centroidScore,
    passCount,
    requiredPassCount: required,
    totalSamples: liveEmbeddings.length,
  };
};
export const validateBiometricCapture = (
  embeddings,
  blinkVerified,
  minInternalSim = 0.8,
  capture = null,
  options = {},
) => {
  if (options.liveness_enabled !== false && blinkVerified !== true)
    throw attendanceError(
      "Vui lòng CHỚP MẮT trước khi quét khuôn mặt chấm công!",
      400,
    );
  if (!Array.isArray(embeddings) || embeddings.length !== 5)
    throw attendanceError("Cần đúng 5 mẫu khuôn mặt để xác thực", 400);
  if (embeddings.some((vector) => !Array.isArray(vector) || vector.length < 64))
    throw attendanceError("Mẫu sinh trắc học không hợp lệ", 400);
  if (capture) assertCaptureMetadata(capture, embeddings.length, options);
  const samples = embeddings.map(l2Normalize);
  const consistency = verifyInternalConsistency(samples, minInternalSim);
  if (!consistency.valid) throw attendanceError(consistency.message, 400);
  return samples;
};
export const identifyFace = (samples, employees, options = {}) => {
  const candidates = employees
    .map((employee) => ({
      employee,
      ...evaluateFullSetMatch(
        samples,
        employee.face_descriptor,
        Number(options.similarity_threshold) || FACE_MATCH_THRESHOLD,
        Number(options.voting_frames) || 0,
      ),
    }))
    .sort((left, right) => right.avgScore - left.avgScore);
  const best = candidates[0];
  if (!best?.isMatch)
    throw attendanceError(
      "Không tìm thấy khuôn mặt đã đăng ký phù hợp. Vui lòng đăng ký lại FaceID bằng Human nếu mẫu cũ dùng mô hình khác.",
      403,
    );
  if (
    candidates[1]?.isMatch &&
    best.avgScore - candidates[1].avgScore <= FACE_AMBIGUITY_MARGIN
  )
    throw attendanceError(
      "Bộ mẫu khớp với nhiều hồ sơ và chưa đủ rõ để phân biệt. Vui lòng cập nhật lại FaceID.",
      409,
    );
  return best;
};

const assertAttendanceCaptureMetadata = (capture) => {
  if (!capture || typeof capture !== "object")
    throw attendanceError("Thiếu dữ liệu xác thực chất lượng khuôn mặt. Vui lòng quét lại.", 400);
  if (capture.model !== FACE_CAPTURE_MODEL)
    throw attendanceError("Phiên bản mô hình nhận diện không khớp. Vui lòng tải lại trang.", 400);
  if (capture.face_only !== true || capture.subject?.locked !== true)
    throw attendanceError("Chưa khóa đúng khuôn mặt. Vui lòng quét lại.", 400);
  if (Number(capture.samples) !== 3)
    throw attendanceError("Cần đúng 3 khung hình xác thực", 400);
  const quality = capture.quality || {};
  if (!Number.isFinite(Number(quality.min_score)) || Number(quality.min_score) < 0.7)
    throw attendanceError("Độ tin cậy khuôn mặt chưa đạt yêu cầu", 400);
  if (!Number.isFinite(Number(quality.min_box_score)) || Number(quality.min_box_score) < 0.7)
    throw attendanceError("Khuôn mặt chưa rõ, tiến gần hơn", 400);
  if (!Number.isFinite(Number(quality.min_sharpness)) || Number(quality.min_sharpness) < 10)
    throw attendanceError("Giữ yên mặt 1 giây", 400);
  if (!Number.isFinite(Number(quality.brightness_min)) || Number(quality.brightness_min) < 40)
    throw attendanceError("Thiếu sáng. Vui lòng quét lại.", 400);
  if (!Number.isFinite(Number(quality.brightness_max)) || Number(quality.brightness_max) > 230)
    throw attendanceError("Ánh sáng quá chói. Vui lòng quét lại.", 400);
  if (!Number.isFinite(Number(quality.glare_ratio_max)) || Number(quality.glare_ratio_max) > 0.25)
    throw attendanceError("Bị chói sáng, vui lòng điều chỉnh ánh sáng", 400);
};

export const validateAttendanceCapture = (payload) => {
  const { embeddings, capture, liveness } = payload || {};
  if (!Array.isArray(embeddings) || embeddings.length !== 3)
    throw attendanceError("Cần đúng 3 mẫu khuôn mặt để xác thực", 400);
  if (embeddings.some((vector) => !Array.isArray(vector) || vector.length < 64))
    throw attendanceError("Mẫu sinh trắc học không hợp lệ", 400);
  const samples = embeddings.map(l2Normalize);
  const scores = {
    s12: Number(cosineSimilarity(samples[0], samples[1]).toFixed(6)),
    s23: Number(cosineSimilarity(samples[1], samples[2]).toFixed(6)),
    s13: Number(cosineSimilarity(samples[0], samples[2]).toFixed(6)),
  };
  if (Math.max(scores.s12, scores.s23, scores.s13) > ATTENDANCE_LIVENESS_CONFIG.staticVectorMax)
    throw fraudError("SPOOF_STATIC_VECTOR", "Phát hiện ảnh tĩnh không hợp lệ", scores);
  if (Math.min(scores.s12, scores.s23, scores.s13) < ATTENDANCE_LIVENESS_CONFIG.unstableVectorMin) {
    const error = attendanceError("Khuôn mặt chưa ổn định, giữ yên 1 giây", 400);
    error.code = "UNSTABLE_FACE";
    error.scores = scores;
    throw error;
  }
  assertAttendanceCaptureMetadata(capture);
  const realMedian = Number(liveness?.realMedian);
  const liveMedian = Number(liveness?.liveMedian);
  const livenessScores = { ...scores, realMedian, liveMedian };
  if (
    !Number.isFinite(realMedian) || !Number.isFinite(liveMedian) ||
    realMedian < ATTENDANCE_LIVENESS_CONFIG.realMedianMin ||
    liveMedian < ATTENDANCE_LIVENESS_CONFIG.liveMedianMin
  )
    throw fraudError("SPOOF_DETECTED", "Phát hiện hình ảnh/màn hình không hợp lệ", livenessScores);
  return {
    samples,
    scores,
    liveness: {
      realMedian,
      liveMedian,
      gateReason: liveness?.gateReason || "Đạt",
      windowSize: Number(liveness?.windowSize) || 5,
      motion: liveness?.motion || null,
    },
  };
};

export const prepareAttendanceVerification = (meta) => {
  if (!meta?.challengeToken) return null;
  consumeAttendanceChallenge(meta.challengeToken);
  return validateAttendanceCapture(meta);
};

export const identifyAttendanceFace = (samples, employees, options = {}) => {
  const threshold = Number(options.similarity_threshold) || FACE_MATCH_THRESHOLD;
  const candidates = (employees || [])
    .map((employee) => {
      const stored = parseStoredFaceData(employee.face_descriptor);
      if (!stored || samples.some((sample) => sample.length !== stored.centroid.length)) return null;
      const perFrame = samples.map((sample) =>
        Math.max(
          cosineSimilarity(sample, stored.centroid),
          ...stored.samples.map((storedSample) => cosineSimilarity(sample, storedSample)),
        ));
      const centroidScore = cosineSimilarity(computeCentroid(samples), stored.centroid);
      const score = Math.min(...perFrame, centroidScore);
      return {
        employee,
        score,
        perFrame: perFrame.map((value) => Number(value.toFixed(6))),
        centroidScore: Number(centroidScore.toFixed(6)),
        passCount: perFrame.filter((value) => value >= threshold).length,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);
  const best = candidates[0];
  if (!best || best.score < threshold || best.passCount !== samples.length)
    throw attendanceError(
      `Không tìm thấy khuôn mặt đã đăng ký phù hợp. Độ khớp cao nhất: ${((best?.score || 0) * 100).toFixed(1)}%, cần ${(threshold * 100).toFixed(1)}% trên cả 3 khung hình.`,
      403,
    );
  const second = candidates[1];
  if (second && best.score - second.score < ATTENDANCE_LIVENESS_CONFIG.margin)
    throw fraudError(
      "AMBIGUOUS_FACE",
      "Khuôn mặt khớp với nhiều hồ sơ, chưa đủ rõ để phân biệt. Vui lòng quét lại.",
      { top1Score: best.score, top2Score: second.score },
      409,
    );
  return best;
};

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const round2 = (value) => Number(Number(value).toFixed(2));
const normalizeWorkdayValue = (value) => {
  const number = toNumber(value, 1);
  return number === 0.5 ? 0.5 : 1;
};
const toMinutes = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const [hour, minute] = String(value)
    .split(":")
    .map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
};
const formatTime = (minutes) => {
  const safe = Math.max(0, Math.min(1439, Math.round(minutes)));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}:00`;
};
const formatTimeWithSeconds = (minutes) => {
  const safe = ((Number(minutes) % 1440) + 1440) % 1440;
  const totalSeconds = Math.round(safe * 60);
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor((totalSeconds % 3600) / 60))}:${pad(totalSeconds % 60)}`;
};
const formatDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date)
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value);
  return String(value).slice(0, 10);
};

const addDaysToDate = (dateValue, days) => {
  const date = formatDateOnly(dateValue);
  if (!date) return null;
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + Number(days || 0));
  return next.toISOString().slice(0, 10);
};

const listDateRange = (fromDate, toDate) => {
  const start = formatDateOnly(fromDate);
  const end = formatDateOnly(toDate);
  if (!start || !end || end < start) return [];
  const dates = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    cursor = addDaysToDate(cursor, 1);
  }
  return dates;
};

const monthFromDate = (dateValue) => String(formatDateOnly(dateValue) || "").slice(0, 7);

const OT_TYPE_RATES = { WEEKDAY: 1.5, WEEKEND: 2, HOLIDAY: 3 };
const DAY_NAME_CODES = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

const normalizeWorkingDays = (rawValue) => {
  if (rawValue == null || rawValue === "") return null;
  let values = rawValue;
  if (typeof values === "string") {
    const text = values.trim();
    if (!text) return null;
    try {
      const parsed = JSON.parse(text);
      values = parsed;
    } catch {
      values = text.split(/[\s,;|/]+/).filter(Boolean);
    }
  }
  if (!Array.isArray(values) || !values.length) return null;
  const configured = [...new Set(values
    .map((value) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        if (value >= 1 && value <= 7) return Math.trunc(value);
        if (value === 0) return 7;
        return null;
      }
      const text = String(value ?? "").trim().toUpperCase();
      if (!text) return null;
      if (/^[1-7]$/.test(text)) return Number(text);
      const code = DAY_NAME_CODES[text.slice(0, 3)];
      if (code === undefined) return null;
      return code === 0 ? 7 : code;
    })
    .filter((value) => value !== null))].sort((a, b) => a - b);
  return configured.length ? configured : null;
};

const getIsoWeekday = (dateValue) => {
  const date = formatDateOnly(dateValue);
  const parsedDate = new Date(`${date}T00:00:00Z`);
  const jsDay = parsedDate.getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
};

export const isShiftWorkingOnDate = (shift, dateValue) => {
  if (!shift) return false;
  const configured = normalizeWorkingDays(shift.working_days);
  if (!configured) return true;
  return configured.includes(getIsoWeekday(dateValue));
};

export const resolveOvertimeType = async (connection, employeeId, workDate) => {
  await ensureOvertimeSchema();
  const date = formatDateOnly(workDate);
  const [holidays] = await connection.query(
    "SELECT ot_rate FROM holidays WHERE holiday_date = ? LIMIT 1",
    [date],
  );
  if (holidays.length) {
    const rate = toNumber(holidays[0].ot_rate, OT_TYPE_RATES.HOLIDAY);
    return {
      ot_type: "HOLIDAY",
      ot_rate: rate > 0 ? rate : OT_TYPE_RATES.HOLIDAY,
    };
  }

  const isoDay = getIsoWeekday(date);
  let isWorkingDay = isoDay >= 1 && isoDay <= 5;
  let shiftRows = [];
  try {
    [shiftRows] = await connection.query(
      `SELECT s.working_days
         FROM work_shifts s
         INNER JOIN employee_shifts es ON es.shift_id = s.id
        WHERE es.employee_id = ? AND es.effective_from <= ?
          AND (es.effective_to IS NULL OR es.effective_to >= ?)
          AND s.is_active = 1
        ORDER BY es.effective_from DESC, es.id DESC
        LIMIT 1`,
      [employeeId, date, date],
    );
  } catch {
    shiftRows = [];
  }
  const configured = normalizeWorkingDays(shiftRows[0]?.working_days);
  if (configured) isWorkingDay = configured.includes(isoDay);
  const ot_type = isWorkingDay ? "WEEKDAY" : "WEEKEND";
  return { ot_type, ot_rate: OT_TYPE_RATES[ot_type] };
};

const LEGACY_STATUS = {
  IN_PROGRESS: "MISSING_CHECKOUT",
  MISSING_OUT: "MISSING_CHECKOUT",
  COMPLETED: "VALID",
  LATE_OR_EARLY: "LATE",
  ON_LEAVE: "LEAVE_SYNC",
  ABSENT: "ABSENT",
};

export const resolveActiveAccount = async (connection, employeeId) => {
  const [rows] = await connection.query(
    `SELECT u.id AS user_id, u.username, u.role_id, u.is_active,
            e.employee_code, e.full_name
       FROM users u
      INNER JOIN employees e ON e.id = u.employee_id
      WHERE e.id = ? AND u.is_active = 1
      LIMIT 1`,
    [employeeId],
  );
  if (!rows.length)
    throw attendanceError(
      "Nhân viên chưa có tài khoản đăng nhập hoặc tài khoản đã bị khóa",
      403,
    );
  return rows[0];
};

export const serverDate = async (connection = db) => {
  const [rows] = await connection.query(
    "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today",
  );
  return rows[0].today;
};
const serverNow = async (connection = db) => {
  const [rows] = await connection.query(
    `SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today,
            DATE_FORMAT(CURTIME(), '%H:%i:%s') AS now_time,
            DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') AS datetime`,
  );
  return rows[0];
};

export const validateDate = (value) => {
  const date = String(value || "");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  ) {
    throw attendanceError("Ngày chấm công không hợp lệ");
  }
  return date;
};

export const assertMonthOpen = async (connection, employeeId, date) => {
  const month = date.slice(0, 7);
  await connection.query(
    `INSERT INTO monthly_timesheets
      (employee_id, month_year, standard_days, actual_work_days, paid_leave_days,
       unpaid_leave_days, total_payable_days, late_count, total_late_minutes,
       ot_hours_150, ot_hours_200, ot_hours_300, status)
     VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'OPEN')
     ON DUPLICATE KEY UPDATE employee_id = employee_id`,
    [employeeId, month],
  );
  const [rows] = await connection.query(
    "SELECT status FROM monthly_timesheets WHERE employee_id = ? AND month_year = ? FOR UPDATE",
    [employeeId, month],
  );
  if (rows[0]?.status === "LOCKED")
    throw attendanceError("Bảng công tháng này đã khóa", 409);
};

const SHIFT_SELECT = `SELECT s.id AS shift_id, s.code AS shift_code, s.name,
  s.start_time, s.end_time, s.checkin_start, s.checkin_end,
  s.checkout_start, s.checkout_end, s.break_start, s.break_end,
  s.grace_period_minutes, s.grace_period,
  s.min_ot_minutes, s.standard_hours, s.workday_value, s.is_default, s.is_active,
  s.is_overnight, s.has_break, s.require_break_punch, s.standard_work_hours,
  s.checkin_open_before_min, s.checkin_close_after_min, s.allow_checkout_anytime,
  s.working_days, s.policy_id
  FROM work_shifts s`;

const getShiftById = async (shiftId, connection = db) => {
  const [rows] = await connection.query(`${SHIFT_SELECT} WHERE s.id = ? LIMIT 1`, [
    shiftId,
  ]);
  return rows[0] || null;
};

const getDefaultShift = async (connection = db) => {
  const [rows] = await connection.query(
    `${SHIFT_SELECT} WHERE s.is_default = 1 AND s.is_active = 1 ORDER BY s.id LIMIT 1`,
  );
  return rows[0] || null;
};

const getTodayShift = async (employeeId, connection = db, dateValue = null) => {
  const date = dateValue || (await serverDate(connection));
  const [rows] = await connection.query(
    `${SHIFT_SELECT}
      INNER JOIN employee_shifts es ON es.shift_id = s.id
      WHERE es.employee_id = ? AND es.effective_from <= ?
        AND (es.effective_to IS NULL OR es.effective_to >= ?)
        AND s.is_active = 1
      ORDER BY es.effective_from DESC, es.id DESC
      LIMIT 1`,
    [employeeId, date, date],
  );
  const assigned = shiftWithAllowedLimit(rows[0] || null);
  if (rows[0]) {
    return isShiftWorkingOnDate(assigned, date) ? assigned : null;
  }
  const defaultShift = await getDefaultShift(connection);
  return isShiftWorkingOnDate(defaultShift, date) ? defaultShift : null;
};

export const getShiftForDate = async (employeeId, dateValue, connection = db) => {
  const date = validateDate(dateValue);
  return getTodayShift(employeeId, connection, date);
};

const ATTENDANCE_SELECT = async (connection = db) => {
  const withUser = await hasColumn(connection, "attendances", "user_id");
  return `SELECT a.*, s.code AS shift_code, s.name AS shift_name, s.start_time,
            s.end_time, s.checkin_start, s.checkin_end,
            s.checkout_start, s.checkout_end, s.break_start, s.break_end,
            s.grace_period_minutes, s.grace_period,
            s.min_ot_minutes, s.standard_hours, s.workday_value,
            s.is_overnight, s.has_break, s.require_break_punch,
            s.standard_work_hours, s.checkin_open_before_min,
            s.checkin_close_after_min, s.allow_checkout_anytime, s.policy_id,
            ${withUser ? "u.username, u.role_id" : "NULL AS username, NULL AS role_id"}
       FROM attendances a
       LEFT JOIN work_shifts s ON s.id = a.shift_id
       ${withUser ? "LEFT JOIN users u ON u.id = a.user_id" : ""}`;
};

const getAttendanceForDate = async (
  employeeId,
  workDate,
  connection = db,
) => {
  await ensureWorkShiftSchema();
  const select = await ATTENDANCE_SELECT(connection);
  const [rows] = await connection.query(
    `${select}
      WHERE a.employee_id = ? AND a.work_date = ?
      LIMIT 1`,
    [employeeId, workDate],
  );
  return shiftWithAllowedLimit(rows[0] || null);
};

const getOpenOvernightAttendance = async (
  employeeId,
  dateValue,
  connection = db,
) => {
  await ensureWorkShiftSchema();
  const date = formatDateOnly(dateValue);
  if (!date) return null;
  const previousDate = addDaysToDate(date, -1);
  const candidate = await getAttendanceForDate(employeeId, previousDate, connection);
  if (!candidate?.check_in || candidate.check_out) return null;
  if (!isOvernightShift(candidate)) return null;
  const cutoffPassed = await checkoutCutoffPassed(candidate, previousDate, connection);
  if (cutoffPassed) return null;
  return candidate;
};

const getLatestValidCheckOut = async (
  connection,
  employeeId,
  workDate,
  fallbackMinutes,
  overnight = false,
  fallbackTime = null,
) => {
  const date = formatDateOnly(workDate);
  if (!date) return fallbackMinutes;
  const nextDate = addDaysToDate(date, 1);
  const scanTo = overnight ? `${nextDate} 12:00:00` : `${date} 23:59:59`;
  const [rows] = await connection.query(
    `SELECT DATE_FORMAT(scan_time, '%Y-%m-%d %H:%i:%s') AS scan_time, scan_type
       FROM attendance_logs
      WHERE employee_id = ? AND scan_type <> 'CHECK_IN' AND is_valid = 1
        AND scan_time >= ? AND scan_time <= ?
      ORDER BY scan_time DESC
      LIMIT 1`,
    [employeeId, `${date} 00:00:00`, scanTo],
  );
  const row = rows[0];
  if (!row) return null;
  const fallback =
    fallbackMinutes === null
      ? null
      : {
          minutes: fallbackMinutes,
          time: /^\d{1,2}:\d{2}:\d{2}$/.test(String(fallbackTime || ""))
            ? String(fallbackTime).slice(0, 8)
            : formatTimeWithSeconds(fallbackMinutes),
        };
  if (row.scan_type !== "CHECK_OUT") return fallback;
  const scanTime = row.scan_time;
  if (!scanTime) return fallback;
  const scanDate = String(scanTime).slice(0, 10);
  const [hour, minute, second] = String(scanTime).slice(11, 19).split(":").map(Number);
  if ([hour, minute, second].some((value) => !Number.isFinite(value)))
    return fallback;
  const minutes =
    hour * 60 + minute + second / 60 + (scanDate > date ? 1440 : 0);
  if (fallback && fallback.minutes >= minutes) return fallback;
  const pad = (value) => String(value).padStart(2, "0");
  return {
    minutes,
    time: `${pad(hour)}:${pad(minute)}:${pad(second)}`,
  };
};

const isOvernightShift = (shift) => {
  const start = toMinutes(shift?.start_time);
  const end = toMinutes(shift?.end_time);
  return Number(shift?.is_overnight) === 1 && start !== null && end !== null && end <= start;
};

const shiftTimeWindow = (shift, type) => {
  const shiftStart = toMinutes(shift.start_time) ?? 0;
  const rawShiftEnd = toMinutes(shift.end_time) ?? 1439;
  const overnight = isOvernightShift(shift) ? 1 : 0;
  const shiftEnd = overnight ? rawShiftEnd + 1440 : rawShiftEnd;
  const grace = toNumber(shift.grace_period_minutes ?? shift.grace_period, 15);
  const wrap = (value) => ((value % 1440) + 1440) % 1440;
  if (type === "CHECK_IN") {
    const openBefore = Math.max(0, toNumber(shift.checkin_open_before_min, 120));
    return {
      start:
        toMinutes(shift.checkin_start) ?? Math.max(0, shiftStart - openBefore),
      end: toMinutes(shift.checkin_end),
      allowedLimit: wrap(shiftStart + grace),
      wraps: false,
      overnight: false,
    };
  }
  const start =
    toMinutes(shift.checkout_start) ?? wrap(Math.max(shiftStart, shiftEnd - 120));
  const end = toMinutes(shift.checkout_end) ?? wrap(shiftEnd + 120);
  return { start, end, wraps: start > end, overnight: Boolean(overnight) };
};

const checkoutCutoffPassed = async (attendance, workDate, connection) => {
  const today = await serverDate(connection);
  const date = formatDateOnly(workDate);
  if (!date) return false;
  const window = shiftTimeWindow(attendance, "CHECK_OUT");
  const overnight = isOvernightShift(attendance) || window.overnight || window.wraps;
  const cutoffDate = overnight ? addDaysToDate(date, 1) : date;
  if (cutoffDate < today) return true;
  if (cutoffDate > today) return false;
  const now = await serverNow(connection);
  const nowMinutes = toMinutes(now.now_time);
  const endMinutes = toMinutes(window.end);
  if (nowMinutes === null || endMinutes === null) return false;
  return nowMinutes > endMinutes;
};

const shiftWithAllowedLimit = (shift) => {
  if (!shift) return shift;
  const grace = toNumber(shift.grace_period_minutes ?? shift.grace_period, 15);
  const start = toMinutes(shift.start_time);
  const window = getShiftWorkWindow(shift);
  return {
    ...shift,
    grace_period_minutes: grace,
    workday_value: normalizeWorkdayValue(shift.workday_value),
    standard_work_hours:
      window && window.work_minutes > 0
        ? round2(window.work_minutes / 60)
        : toNumber(shift.standard_work_hours ?? shift.standard_hours, 8),
    allowed_limit_time:
      start === null ? null : formatTime(start + grace),
  };
};

const checkScanWindow = (shift, type, scanTime) => {
  const window = shiftTimeWindow(shift, type);
  const scanMinutes = toMinutes(scanTime);
  if (scanMinutes === null) return { allowed: false, window };
  const hasStart = window.start !== null && window.start !== undefined;
  const hasEnd = window.end !== null && window.end !== undefined;
  let inWindow = true;
  if (hasStart && hasEnd) {
    inWindow = window.wraps
      ? scanMinutes >= window.start || scanMinutes <= window.end
      : scanMinutes >= window.start && scanMinutes <= window.end;
  } else if (hasStart) {
    inWindow = scanMinutes >= window.start;
  } else if (hasEnd) {
    inWindow = scanMinutes <= window.end;
  }
  if (!inWindow) return { allowed: false, window };
  return { allowed: true, window };
};

const reconcileMissingCheckout = async (employeeId, workDate) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const attendance = await getAttendanceForDate(employeeId, workDate, connection);
    if (!attendance?.check_in || attendance.check_out) {
      await connection.commit();
      return attendance;
    }
    const cutoffPassed = await checkoutCutoffPassed(attendance, workDate, connection);
    if (!cutoffPassed) {
      await connection.commit();
      return attendance;
    }
    const [timesheets] = await connection.query(
      "SELECT status FROM monthly_timesheets WHERE employee_id = ? AND month_year = ? LIMIT 1",
      [employeeId, workDate.slice(0, 7)],
    );
    if (timesheets[0]?.status === "LOCKED") {
      await connection.commit();
      return attendance;
    }
    const withUpdatedAt = await hasColumn(connection, "attendances", "updated_at");
    await connection.query(
      `UPDATE attendances
          SET status = 'MISSING_CHECKOUT'${withUpdatedAt ? ", updated_at = NOW()" : ""}
        WHERE id = ? AND check_in IS NOT NULL AND check_out IS NULL`,
      [attendance.id],
    );
    await recalculateEmployeeMonth(
      connection,
      employeeId,
      workDate.slice(0, 7),
    );
    await connection.commit();
    const today = await serverDate(connection);
    const notificationRows = await notifyEmployee(db, employeeId, {
      type: "MISSING_CHECKOUT",
      title: "Quên chấm công ra ca",
      message: `Ngày ${workDate} bạn có giờ vào nhưng chưa có giờ ra. Vui lòng liên hệ HR để điều chỉnh.`,
      priority: "HIGH",
      action_url: "#/diem-danh",
      action_label: "Xem chấm công",
      require_action: true,
      dedupe_key: `MISSING_CHECKOUT:${employeeId}:${workDate}:${today}`,
      payload: { work_date: workDate, employee_id: employeeId },
    });
    notificationRows.forEach(publishNotificationRow);
    return { ...attendance, status: "MISSING_CHECKOUT" };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const reconcileMissingCheckoutsForDate = async (workDate, user) => {
  await ensureWorkShiftSchema();
  const scope = buildEmployeeScope(user);
  const [rows] = await db.query(
    `SELECT a.employee_id FROM attendances a
       INNER JOIN employees e ON e.id = a.employee_id
      WHERE a.work_date = ? AND a.check_in IS NOT NULL AND a.check_out IS NULL
        ${scope.clause ? `AND ${scope.clause.replace(/^WHERE\s+/i, "")}` : ""}`,
    [workDate, ...scope.params],
  );
  for (const row of rows) {
    await reconcileMissingCheckout(row.employee_id, workDate);
  }
};

const insertRawScan = async (
  connection,
  employeeId,
  account,
  scanType,
  meta = {},
  faceScore = null,
) => {
  const withUser = await hasColumn(connection, "attendance_logs", "user_id");
  const withDevice = await hasColumn(connection, "attendance_logs", "device_id");
  const withClientIp = await hasColumn(connection, "attendance_logs", "client_ip");
  const columns = ["employee_id"];
  const values = [employeeId];
  const placeholders = ["?"];
  if (withUser) {
    columns.push("user_id");
    values.push(account.user_id);
    placeholders.push("?");
  }
  columns.push("scan_time");
  placeholders.push("NOW()");
  columns.push("scan_type", "face_score", "ip_address", "device_info", "is_valid", "reject_reason");
  values.push(scanType, faceScore, meta.ip || null, meta.device_info || null);
  placeholders.push("?", "?", "?", "?", "1", "NULL");
  if (withDevice) {
    columns.push("device_id");
    values.push(meta.device_id || null);
    placeholders.push("?");
  }
  if (withClientIp) {
    columns.push("client_ip");
    values.push(meta.client_ip || null);
    placeholders.push("?");
  }
  await connection.query(
    `INSERT INTO attendance_logs (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`,
    values,
  );
};

export const recalculateDailyAttendance = async (
  connection,
  employeeId,
  workDate,
) => {
  await ensureOvertimeSchema();
  const attendance = await getAttendanceForDate(
    employeeId,
    workDate,
    connection,
  );
  if (!attendance) return null;

  const [leaveRows] = await connection.query(
    `SELECT * FROM leave_requests
      WHERE employee_id = ? AND work_date = ? AND status = 'APPROVED'
      ORDER BY id LIMIT 1`,
    [employeeId, workDate],
  );
  const leave = leaveRows[0] || null;
  const [otRows] = await connection.query(
    `SELECT * FROM overtime_requests
      WHERE employee_id = ? AND work_date = ? AND status = 'APPROVED'
      ORDER BY start_time, id`,
    [employeeId, workDate],
  );

  let snapshot = null;
  try {
    snapshot = attendance.policy_snapshot
      ? typeof attendance.policy_snapshot === "string"
        ? JSON.parse(attendance.policy_snapshot)
        : attendance.policy_snapshot
      : null;
  } catch {
    snapshot = null;
  }
  const policy = snapshot?.policy
    ? null
    : await getPolicyForShift(attendance, connection);
  const rules = normalizeRules(snapshot?.policy || policy?.rules);
  const shiftConfig = snapshot?.shift || attendance;
  const shiftWindow = getShiftWorkWindow(shiftConfig);
  const shiftStart = shiftWindow?.start ?? null;
  const shiftEnd = shiftWindow?.end ?? null;
  const overnight = Boolean(shiftWindow?.overnight);
  let breakStart = shiftWindow?.break_start ?? null;
  let breakEnd = shiftWindow?.break_end ?? null;
  const workdayCap = Math.min(
    normalizeWorkdayValue(shiftConfig.workday_value),
    Math.max(0, toNumber(rules.max_work_day, 1)),
  );
  let effectiveStart = shiftStart;
  let effectiveEnd = shiftEnd;
  if (leave?.leave_type === "MORNING" && breakEnd !== null)
    effectiveStart = breakEnd;
  if (leave?.leave_type === "AFTERNOON" && breakStart !== null)
    effectiveEnd = breakStart;

  const checkIn = toMinutes(attendance.check_in);
  let checkOut = toMinutes(attendance.check_out);
  if (
    overnight &&
    checkIn !== null &&
    checkOut !== null &&
    checkOut < shiftStart &&
    checkIn >= shiftStart - 720
  )
    checkOut += 1440;
  const latestCheckOut = await getLatestValidCheckOut(
    connection,
    employeeId,
    workDate,
    checkOut,
    overnight,
    attendance.check_out,
  );
  const effectiveCheckOut = latestCheckOut ? latestCheckOut.minutes : checkOut;
  const storedCheckOut = latestCheckOut
    ? latestCheckOut.time
    : checkOut === null
      ? null
      : /^\d{1,2}:\d{2}:\d{2}$/.test(String(attendance.check_out || ""))
        ? String(attendance.check_out).slice(0, 8)
        : formatTimeWithSeconds(checkOut);
  const gracePeriod = toNumber(
    shiftConfig.grace_period_minutes ?? shiftConfig.grace_period,
    rules.grace_late_minutes,
  );
  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  let actualWorkHours = 0;
  let netWorkMinutes = 0;
  let baseWorkday = 0;
  let paidLeaveWorkday = leave
    ? round2(Math.min(workdayCap, toNumber(leave.paid_workday, 0)))
    : 0;
  let totalWorkday = 0;
  let rawOtMinutes = 0;
  let approvedOtHours = 0;
  let otRate = toNumber(attendance.ot_rate, 1.5) || 1.5;
  const minimumOtMinutes = Math.max(0, toNumber(attendance.min_ot_minutes, 30));
  const otDetails = [];
  let overtimeType = null;
  let status = "IN_PROGRESS";

  if (leave?.leave_type === "FULL_DAY") {
    paidLeaveWorkday = round2(Math.min(workdayCap, toNumber(leave.paid_workday, 0)));
    totalWorkday = paidLeaveWorkday;
    status = "ON_LEAVE";
  } else {
    if (
      checkIn !== null &&
      effectiveStart !== null &&
      checkIn > effectiveStart + toNumber(attendance.grace_period, 0)
    ) {
      lateMinutes = checkIn - effectiveStart;
      if (leave?.leave_type === "LATE_EARLY_EXEMPT")
        lateMinutes = Math.max(0, lateMinutes - toNumber(leave.exempt_minutes, 0));
    }

    if (checkIn === null || effectiveCheckOut === null) {
      totalWorkday = paidLeaveWorkday;
      status = leave
        ? "ON_LEAVE"
        : checkIn === null
          ? "ABSENT"
          : "IN_PROGRESS";
    } else {
      if (effectiveEnd !== null && effectiveCheckOut < effectiveEnd) {
        earlyLeaveMinutes = effectiveEnd - effectiveCheckOut;
        if (leave?.leave_type === "LATE_EARLY_EXEMPT")
          earlyLeaveMinutes = Math.max(
            0,
            earlyLeaveMinutes - toNumber(leave.exempt_minutes, 0),
          );
      }

      const clampIn =
        rules.clamp_early_in && checkIn !== null && effectiveStart !== null
          ? Math.max(checkIn, effectiveStart)
          : checkIn;
      const clampOut =
        rules.clamp_late_out && effectiveCheckOut !== null && effectiveEnd !== null
          ? Math.min(effectiveCheckOut, effectiveEnd)
          : effectiveCheckOut;
      const workEnd =
        effectiveEnd !== null && clampOut !== null
          ? Math.min(clampOut, effectiveEnd)
          : clampOut;
      if (clampIn !== null && workEnd !== null) {
        const overlap =
          breakStart !== null && breakEnd !== null
            ? Math.max(
                0,
                Math.min(workEnd, breakEnd) - Math.max(clampIn, breakStart),
              )
            : 0;
        netWorkMinutes = Math.max(0, workEnd - clampIn - overlap);
        actualWorkHours = round2(netWorkMinutes / 60);
        baseWorkday = round2(
          Math.min(
            workdayCap,
            computeWorkDay({
              netHours: actualWorkHours,
              rules,
              shift: { ...shiftConfig, workday_value: workdayCap },
            }),
          ),
        );
      }

      paidLeaveWorkday = leave
        ? round2(Math.min(workdayCap, toNumber(leave.paid_workday, 0)))
        : 0;
      totalWorkday = round2(
        Math.min(workdayCap, baseWorkday + paidLeaveWorkday),
      );

      if (
        effectiveEnd !== null &&
        effectiveCheckOut !== null &&
        effectiveCheckOut > effectiveEnd
      )
        rawOtMinutes = Math.round(effectiveCheckOut - effectiveEnd);
      if (otRows.length && rawOtMinutes > 0) {
        overtimeType = await resolveOvertimeType(
          connection,
          employeeId,
          workDate,
        );
        otRate = overtimeType.ot_rate;
        const adjustOt = (value) =>
          overnight && value !== null && shiftStart !== null && value <= shiftStart
            ? value + 1440
            : value;
        for (const overtime of otRows) {
          let otStart = adjustOt(toMinutes(overtime.start_time));
          if (effectiveEnd !== null)
            otStart = Math.max(effectiveEnd, otStart ?? effectiveEnd);
          const otEnd = adjustOt(toMinutes(overtime.end_time)) ?? 0;
          const validStart = Math.max(checkIn ?? 0, otStart ?? 0);
          const validEnd = Math.min(effectiveCheckOut, otEnd);
          const validMinutes = Math.max(0, Math.round(validEnd - validStart));
          if (validMinutes >= minimumOtMinutes) {
            const hours = round2(validMinutes / 60);
            otDetails.push({ id: overtime.id, hours });
            approvedOtHours = round2(approvedOtHours + hours);
          }
        }
      }

      status = lateMinutes > 0 || earlyLeaveMinutes > 0
        ? "LATE_OR_EARLY"
        : "COMPLETED";
    }
  }

  if (checkIn !== null && effectiveCheckOut === null && !leave) {
    const pastCheckoutCutoff = await checkoutCutoffPassed(attendance, workDate, connection);
    if (pastCheckoutCutoff && rules.missing_checkout_action !== "IGNORE")
      status = "MISSING_CHECKOUT";
  }

  await connection.query(
    "UPDATE overtime_requests SET actual_ot_hours = 0 WHERE employee_id = ? AND work_date = ?",
    [employeeId, workDate],
  );
  if (otDetails.length && overtimeType) {
    for (const detail of otDetails) {
      await connection.query(
        `UPDATE overtime_requests
            SET actual_ot_hours = ?, ot_type = ?, ot_rate = ?
          WHERE id = ?`,
        [detail.hours, overtimeType.ot_type, overtimeType.ot_rate, detail.id],
      );
    }
  }

  let snapshotJson = null;
  const shouldCaptureSnapshot = Boolean(checkIn);
  if (shouldCaptureSnapshot && !snapshot) {
    const built = await buildPolicySnapshot(attendance, policy);
    snapshot = built;
    snapshotJson = JSON.stringify(built);
  }

  await connection.query(
    `UPDATE attendances
        SET check_out = ?, late_minutes = ?, early_leave_minutes = ?, actual_work_hours = ?,
            base_workday = ?, paid_leave_workday = ?, total_workday = ?,
            net_work_minutes = ?, work_day = ?, policy_snapshot = COALESCE(policy_snapshot, ?),
            recalculated_at = NOW(),
            raw_ot_minutes = ?, approved_ot_hours = ?, ot_rate = ?, status = ?
      WHERE id = ?`,
    [
      storedCheckOut,
      lateMinutes,
      earlyLeaveMinutes,
      actualWorkHours,
      baseWorkday,
      paidLeaveWorkday,
      totalWorkday,
      netWorkMinutes,
      baseWorkday,
      snapshotJson,
      rawOtMinutes,
      approvedOtHours,
      otRate,
      status,
      attendance.id,
    ],
  );

  return {
    ...attendance,
    check_out: storedCheckOut,
    late_minutes: lateMinutes,
    early_leave_minutes: earlyLeaveMinutes,
    actual_work_hours: actualWorkHours,
    net_work_minutes: netWorkMinutes,
    work_day: baseWorkday,
    policy_snapshot: snapshot,
    base_workday: baseWorkday,
    paid_leave_workday: paidLeaveWorkday,
    total_workday: totalWorkday,
    raw_ot_minutes: rawOtMinutes,
    approved_ot_hours: approvedOtHours,
    ot_rate: otRate,
    status,
  };
};

const legacyLog = (attendance, source = null) => {
  if (!attendance) return null;
  const rawStatus = attendance.status ?? attendance.raw_status ?? null;
  return {
    id: attendance.id,
    log_id: attendance.id,
    employee_id: attendance.employee_id,
    user_id: attendance.user_id ?? null,
    username: attendance.username ?? null,
    work_date: attendance.work_date
      ? typeof attendance.work_date === "string"
        ? attendance.work_date.slice(0, 10)
        : attendance.work_date
      : null,
    check_in: attendance.check_in || null,
    check_out: attendance.check_out || null,
    late_minutes: toNumber(attendance.late_minutes, 0),
    early_leave_minutes: toNumber(attendance.early_leave_minutes, 0),
    work_unit: toNumber(attendance.total_workday, 0),
    total_workday: toNumber(attendance.total_workday, 0),
    work_day: toNumber(attendance.work_day ?? attendance.total_workday, 0),
    net_work_minutes: toNumber(attendance.net_work_minutes, 0),
    status: LEGACY_STATUS[rawStatus] || rawStatus,
    raw_status: rawStatus,
    source:
      source ||
      (toNumber(attendance.face_score, 0) > 0 ? "FACE_ID" : "MANUAL_ADJUST"),
    note: attendance.note || null,
    shift_id: attendance.shift_id ?? null,
    shift_code: attendance.shift_code ?? null,
    face_score: attendance.face_score ?? null,
  };
};

const upsertDailyAttendance = async (
  connection,
  employeeId,
  account,
  shift,
  workDate,
  values,
) => {
  const withUser = await hasColumn(connection, "attendances", "user_id");
  const checkOutUpdate = values.overwriteCheckOut
    ? "check_out = VALUES(check_out), check_out_ip = VALUES(check_out_ip),"
    : "check_out = COALESCE(check_out, VALUES(check_out)), check_out_ip = COALESCE(check_out_ip, VALUES(check_out_ip)),";
  await connection.query(
    `INSERT INTO attendances
      (employee_id, ${withUser ? "user_id, " : ""}shift_id, work_date,
       check_in, check_out, check_in_ip, check_out_ip, note, status)
     VALUES (?, ${withUser ? "?, " : ""}?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       ${withUser ? "user_id = VALUES(user_id)," : ""}
       shift_id = VALUES(shift_id),
       check_in = COALESCE(check_in, VALUES(check_in)),
        ${checkOutUpdate}
        check_in_ip = COALESCE(check_in_ip, VALUES(check_in_ip)),
        note = COALESCE(note, VALUES(note)),

       status = VALUES(status)`,
    [
      employeeId,
      ...(withUser ? [account.user_id] : []),
      shift.shift_id,
      workDate,
      values.checkIn || null,
      values.checkOut || null,
      values.checkInIp || null,
      values.checkOutIp || null,
      values.note || null,
      values.status,
    ],
  );
};

const assertNoDoublePunch = async (employeeId, now, connection) => {
  const config = await getKioskConfig(connection);
  const cooldown = toNumber(config.anti_double_punch_minutes, 3);
  if (cooldown <= 0) return null;
  const [rows] = await connection.query(
    `SELECT DATE_FORMAT(MAX(scan_time), '%Y-%m-%d %H:%i:%s') AS last_scan
       FROM attendance_logs
      WHERE employee_id = ? AND DATE(scan_time) = ?
        AND scan_type IN ('CHECK_IN', 'CHECK_OUT')`,
    [employeeId, now.today],
  );
  const lastScan = rows[0]?.last_scan;
  if (!lastScan) return null;
  const diffSeconds =
    (Date.parse(now.datetime.replace(" ", "T")) -
      Date.parse(lastScan.replace(" ", "T"))) /
    1000;
  if (diffSeconds >= 0 && diffSeconds < cooldown * 60) {
    return {
      error: "DOUBLE_PUNCH_TOO_FAST",
      cooldown_minutes: cooldown,
      wait_seconds: Math.ceil(cooldown * 60 - diffSeconds),
    };
  }
  return null;
};

const checkInInternal = async (employeeId, account, meta, connection) => {
  if (!employeeId) return { error: "NO_EMPLOYEE" };
  const now = await serverNow(connection);
  const openOvernight = await getOpenOvernightAttendance(employeeId, now.today, connection);
  if (openOvernight) {
    return {
      error: "OVERNIGHT_SHIFT_OPEN",
      log: legacyLog(openOvernight, "FACE_ID"),
      shift: await getShiftById(openOvernight.shift_id, connection),
    };
  }
  const shift = await getTodayShift(employeeId, connection, now.today);
  if (!shift) return { error: "NO_SHIFT" };
  const existing = await getAttendanceForDate(
    employeeId,
    now.today,
    connection,
  );
  if (existing?.check_in)
    return {
      error: "ALREADY_CHECKED_IN",
      log: legacyLog(existing, "FACE_ID"),
      shift: await getShiftById(existing.shift_id, connection),
    };
  const scanWindow = checkScanWindow(shift, "CHECK_IN", now.now_time);
  if (!scanWindow.allowed)
    return { error: "CHECK_IN_WINDOW_CLOSED", shift, window: scanWindow.window };
  const doublePunch = await assertNoDoublePunch(employeeId, now, connection);
  if (doublePunch) return { ...doublePunch, shift };

  await insertRawScan(
    connection,
    employeeId,
    account,
    "CHECK_IN",
    meta,
    meta.face_score ?? null,
  );
  await upsertDailyAttendance(connection, employeeId, account, shift, now.today, {
    checkIn: now.now_time,
    checkInIp: meta.ip || null,
    note: meta.note || null,
    status: "IN_PROGRESS",
  });
  await recalculateDailyAttendance(connection, employeeId, now.today);
  await recalculateEmployeeMonth(connection, employeeId, now.today.slice(0, 7));
  const final = await getAttendanceForDate(employeeId, now.today, connection);
  return { log: legacyLog(final, "FACE_ID"), shift, account };
};

const checkOutInternal = async (employeeId, account, meta, connection) => {
  if (!employeeId) return { error: "NO_EMPLOYEE" };
  const now = await serverNow(connection);
  const todayAttendance = await getAttendanceForDate(
    employeeId,
    now.today,
    connection,
  );
  const overnightAttendance = todayAttendance?.check_in && !todayAttendance.check_out
    ? null
    : await getOpenOvernightAttendance(employeeId, now.today, connection);
  const existing = todayAttendance?.check_in ? todayAttendance : overnightAttendance;
  const attendanceDate = todayAttendance?.check_in
    ? now.today
    : overnightAttendance
      ? formatDateOnly(overnightAttendance.work_date)
      : now.today;
  if (!existing?.check_in) return { error: "NO_CHECK_IN_FOUND" };
  const config = await getKioskConfig(connection);
  if (
    existing.check_out &&
    config.checkout_repeat_policy === "LOCK_FIRST"
  )
    return {
      error: "ALREADY_CHECKED_OUT",
      log: legacyLog(existing, "FACE_ID"),
    };

  const shift =
    (await getShiftById(existing.shift_id, connection)) ||
    (await getTodayShift(employeeId, connection, attendanceDate));
  if (!shift) return { error: "NO_SHIFT" };
  if (Number(shift.allow_checkout_anytime ?? 1) === 0) {
    const scanWindow = checkScanWindow(shift, "CHECK_OUT", now.now_time);
    if (!scanWindow.allowed)
      return { error: "CHECK_OUT_WINDOW_CLOSED", shift, window: scanWindow.window };
  }
  const doublePunch = await assertNoDoublePunch(employeeId, now, connection);
  if (doublePunch) return { ...doublePunch, shift };

  await insertRawScan(
    connection,
    employeeId,
    account,
    "CHECK_OUT",
    meta,
    meta.face_score ?? null,
  );
  await upsertDailyAttendance(connection, employeeId, account, shift, attendanceDate, {
    checkIn: existing.check_in,
    checkOut: now.now_time,
    checkInIp: existing.check_in_ip,
    checkOutIp: meta.ip || null,
    note: existing.note || meta.note || null,
    status: existing.status,
    overwriteCheckOut: config.checkout_repeat_policy === "OVERWRITE_LATEST",
  });
  await recalculateDailyAttendance(connection, employeeId, attendanceDate);
  await recalculateEmployeeMonth(connection, employeeId, attendanceDate.slice(0, 7));
  const final = await getAttendanceForDate(employeeId, attendanceDate, connection);
  return { log: legacyLog(final, "FACE_ID"), shift, account, work_date: attendanceDate };
};

const recordSelfAttendance = async (
  employeeId,
  meta,
  operation,
  verifiedIdentity = null,
  accountOverride = null,
) => {
  if (!employeeId) return { error: "NO_EMPLOYEE" };
  await ensureWorkShiftSchema();
  await reconcileMissingCheckout(employeeId, await serverDate());
  const aiConfig = (await getKioskConfig()).ai_config;
  const verification = !verifiedIdentity?.samples ? prepareAttendanceVerification(meta) : null;
  const samples = verifiedIdentity?.samples
    ? verifiedIdentity.samples
    : verification
      ? verification.samples
      : validateBiometricCapture(
          meta.embeddings,
          meta.blink_verified,
          0.8,
          meta.capture,
          aiConfig,
        );
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [currentRows] = await connection.query(
      "SELECT face_descriptor, work_status FROM employees WHERE id = ? FOR UPDATE",
      [employeeId],
    );
    const current = currentRows[0];
    if (!current || current.work_status !== "WORKING")
      throw attendanceError("Hồ sơ nhân viên không hoạt động", 403);

    const account =
      accountOverride || (await resolveActiveAccount(connection, employeeId));
    if (
      meta.user_id !== undefined &&
      meta.user_id !== null &&
      Number(meta.user_id) !== Number(account.user_id)
    )
      throw attendanceError(
        "Khuôn mặt không thuộc tài khoản đang chấm công",
        403,
      );

    const selfMatch = evaluateFullSetMatch(
      samples,
      current.face_descriptor,
      Number(aiConfig.similarity_threshold) || FACE_MATCH_THRESHOLD,
      Number(aiConfig.voting_frames) || 0,
    );
    if (!selfMatch.isMatch)
      throw attendanceError(
        `Khuôn mặt không khớp với hồ sơ đăng ký! Độ khớp trung bình bộ mẫu: ${(selfMatch.avgScore * 100).toFixed(1)}% (${selfMatch.passCount}/${selfMatch.totalSamples} mẫu đạt ngưỡng, yêu cầu >= ${(FACE_MATCH_THRESHOLD * 100).toFixed(0)}% và >= ${selfMatch.requiredPassCount}/${selfMatch.totalSamples} mẫu).`,
        403,
      );

    if (!verifiedIdentity) {
      const [others] = await connection.query(
        "SELECT id, employee_code, full_name, face_descriptor FROM employees WHERE id <> ? AND face_descriptor IS NOT NULL AND LENGTH(face_descriptor) > 20",
        [employeeId],
      );
      const other = others
        .map((employee) => ({
          employee,
          ...evaluateFullSetMatch(samples, employee.face_descriptor),
        }))
        .filter(
          (match) =>
            match.isMatch &&
            match.avgScore > selfMatch.avgScore + FACE_AMBIGUITY_MARGIN,
        )
        .sort((a, b) => b.avgScore - a.avgScore)[0];
      if (other)
        throw attendanceError(
          `CẢNH BÁO NHẬN DIỆN: Khuôn mặt trước Camera khớp với hồ sơ [${other.employee.employee_code} - ${other.employee.full_name}] (${(other.avgScore * 100).toFixed(1)}%), không phải tài khoản đang đăng nhập!`,
          403,
        );
    } else if (Number(verifiedIdentity.employee?.id) !== Number(employeeId)) {
      throw attendanceError("Khuôn mặt không thuộc tài khoản đang chấm công", 403);
    }

    const date = await serverDate(connection);
    await assertMonthOpen(connection, employeeId, date);
    const result = await operation(employeeId, account, meta, connection);
    if (result.error) {
      await connection.rollback();
      return result;
    }
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const checkIn = (employeeId, meta = {}) =>
  recordSelfAttendance(employeeId, meta, checkInInternal);
export const checkOut = (employeeId, meta = {}) =>
  recordSelfAttendance(employeeId, meta, checkOutInternal);

export const kioskAttendance = async (
  action,
  values,
  ip,
  deviceInfo = null,
  captureMeta = null,
  attendancePayload = null,
  authorizedDeviceId = null,
  clientIp = null,
) => {
  if (!["check-in", "check-out", "auto"].includes(action))
    throw attendanceError("Thao tác chấm công không hợp lệ");
  const aiConfig = (await getKioskConfig()).ai_config;
  const verification = prepareAttendanceVerification({
    ...(attendancePayload || {}),
    embeddings: values,
    capture: captureMeta,
  });
  if (!verification)
    throw fraudError("CHALLENGE_REQUIRED", "Thiếu phiên xác thực. Vui lòng quét lại", null, 400);
  const samples = verification.samples;
  const [employees] = await db.query(
    `SELECT e.id, e.employee_code, e.full_name, e.face_descriptor,
            COALESCE(d.department_name, d.name) AS department_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.work_status = 'WORKING' AND e.face_descriptor IS NOT NULL`,
  );
  const match = identifyAttendanceFace(samples, employees, aiConfig);
  const account = await resolveActiveAccount(db, match.employee.id);
  let resolvedAction = action;
  if (action === "auto") {
    const today = await serverDate();
    const current = await getAttendanceForDate(match.employee.id, today);
    const openOvernight = current?.check_in && !current.check_out
      ? null
      : await getOpenOvernightAttendance(match.employee.id, today);
    resolvedAction = current?.check_in || openOvernight?.check_in
      ? "check-out"
      : "check-in";
  }
  const result = await recordSelfAttendance(
    match.employee.id,
    {
      ip,
      device_info: deviceInfo,
      device_id: authorizedDeviceId,
      client_ip: clientIp,
      note: `Human FaceID zero-action; similarity=${(match.score * 100).toFixed(1)}%; frames=${match.perFrame.map((score) => (score * 100).toFixed(1)).join("/")}`,
      face_score: match.score,
    },
    resolvedAction === "check-in" ? checkInInternal : checkOutInternal,
    { employee: match.employee, match, samples },
    account,
  );
  if (result.error === "ALREADY_CHECKED_IN" || result.error === "ALREADY_CHECKED_OUT") {
    const log = result.log;
    const shift = shiftWithAllowedLimit(result.shift || null);
    const completed = Boolean(log?.check_out);
    const checkInTime = String(log?.check_in || "-").slice(0, 5);
    const checkOutTime = String(log?.check_out || "-").slice(0, 5);
    return {
      employee: {
        employee_code: match.employee.employee_code,
        full_name: match.employee.full_name,
        department_name: match.employee.department_name,
        user_id: account.user_id,
        username: account.username,
      },
      account: {
        user_id: account.user_id,
        username: account.username,
        role_id: account.role_id,
      },
      log,
      shift,
      action: resolvedAction,
      already_recorded: true,
      attendance_state: completed ? "COMPLETED" : "CHECKED_IN",
      message: completed
        ? `Bạn đã hoàn thành chấm công hôm nay: vào ca lúc ${checkInTime}, tan ca lúc ${checkOutTime}.`
        : `Bạn đã vào ca lúc ${checkInTime}. Chọn Tan ca khi kết thúc làm việc.`,
    };
  }
  const errors = {
    NO_CHECK_IN_FOUND: "Bạn chưa chấm công Vào hôm nay, không thể chấm Ra!",
    NO_SHIFT: "Chưa cấu hình ca làm việc cho nhân viên.",
    CHECK_IN_WINDOW_CLOSED: "Ngoài khung giờ cho phép chấm công vào ca.",
    CHECK_OUT_WINDOW_CLOSED: "Ngoài khung giờ cho phép chấm công tan ca.",
    DOUBLE_PUNCH_TOO_FAST: `Quét quá nhanh sau lần chấm trước. Vui lòng đợi ${result.wait_seconds || 0} giây.`,
  };
  if (result.error) {
    const status = result.error === "NO_CHECK_IN_FOUND" ? 400 : 409;
    const error = attendanceError(
      errors[result.error] || "Không thể chấm công",
      status,
    );
    error.code = result.error;
    error.wait_seconds = result.wait_seconds || 0;
    throw error;
  }
  return {
    employee: {
      employee_code: match.employee.employee_code,
      full_name: match.employee.full_name,
      department_name: match.employee.department_name,
      user_id: account.user_id,
      username: account.username,
    },
    account: {
      user_id: account.user_id,
      username: account.username,
      role_id: account.role_id,
    },
    log: result.log,
    shift: shiftWithAllowedLimit(result.shift),
    action: resolvedAction,
  };
};

export const getTodayStatus = async (employeeId) => {
  const today = await serverDate();
  const log = await getAttendanceForDate(employeeId, today);
  const shift = await getTodayShift(employeeId, db, today);
  const [employees] = await db.query(
    `SELECT e.id, e.employee_code, e.full_name, e.manager_id, e.data_scope,
            COALESCE(d.department_name, d.name) AS department_name,
            (e.face_descriptor IS NOT NULL) AS has_face_descriptor,
            u.id AS user_id, u.username, u.is_active AS account_active,
            COALESCE(mt.status, 'OPEN') AS month_status
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN users u ON u.employee_id = e.id
       LEFT JOIN monthly_timesheets mt ON mt.employee_id = e.id AND mt.month_year = ?
      WHERE e.id = ?
      LIMIT 1`,
    [today.slice(0, 7), employeeId],
  );
  return {
    log: legacyLog(log),
    shift,
    employee: employees[0] || null,
    account: employees[0]?.user_id
      ? {
          user_id: employees[0].user_id,
          username: employees[0].username,
          is_active: employees[0].account_active,
        }
      : null,
  };
};

export const listAttendanceByDate = async (date, user) => {
  const targetDate = validateDate(date || (await serverDate()));
  const scope = buildEmployeeScope(user);
  const withUser = await hasColumn(db, "attendances", "user_id");
  const [rows] = await db.query(
    `SELECT e.id AS employee_id, e.employee_code, e.full_name, e.department_id,
            COALESCE(d.department_name, d.name) AS department_name,
            a.id AS log_id, a.check_in, a.check_out, a.total_workday,
            a.status AS raw_status, a.late_minutes, a.early_leave_minutes,
            a.note, ${withUser ? "a.user_id, u.username" : "NULL AS user_id, NULL AS username"},
            ws.code AS shift_code, ws.start_time, ws.end_time,
            COALESCE(mt.status, 'OPEN') AS month_status,
            (SELECT MAX(lr.paid_workday > 0) FROM leave_requests lr
              WHERE lr.employee_id = e.id AND lr.status = 'APPROVED'
                AND lr.work_date = ?) AS leave_paid,
            (SELECT COUNT(*) FROM attendance_logs al
              WHERE al.employee_id = e.id
                AND DATE_FORMAT(al.scan_time, '%Y-%m-%d') = ?
                AND al.scan_type = 'CHECK_IN') AS face_scan_count
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
        LEFT JOIN attendances a ON a.employee_id = e.id AND a.work_date = ?
        ${withUser ? "LEFT JOIN users u ON u.id = a.user_id" : ""}
        LEFT JOIN work_shifts ws ON ws.id = a.shift_id
       LEFT JOIN monthly_timesheets mt ON mt.employee_id = e.id AND mt.month_year = ?
       ${scope.clause || "WHERE 1 = 1"} AND e.work_status = 'WORKING'
      ORDER BY e.employee_code`,
    [targetDate, targetDate, targetDate, targetDate.slice(0, 7), ...scope.params],
  );

  return {
    date: targetDate,
    rows: rows.map((row) => {
      const explanation = parseExplanationNote(row.note);
      const source =
        row.face_scan_count > 0
          ? "FACE_ID"
          : explanation
            ? "MANUAL_ADJUST"
            : row.leave_paid != null
              ? "LEAVE_SYNC"
              : null;
      return {
        ...row,
        ...legacyLog(row, source),
        leave_paid: row.leave_paid,
        face_scan_count: row.face_scan_count,
      };
    }),
  };
};

const HISTORY_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const getMyAttendanceHistory = async (user, monthValue) => {
  if (!user?.employee_id) {
    throw attendanceError("Tài khoản chưa liên kết hồ sơ nhân sự", 404);
  }
  const month = String(monthValue || "").trim();
  if (!HISTORY_MONTH_PATTERN.test(month)) {
    throw attendanceError("Tháng không hợp lệ (YYYY-MM)");
  }
  const employeeId = Number(user.employee_id);
  const [employees] = await db.query(
    `SELECT e.id, e.employee_code, e.full_name,
            COALESCE(d.department_name, d.name) AS department_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.id = ?
      LIMIT 1`,
    [employeeId],
  );
  if (!employees.length) {
    throw attendanceError("Không tìm thấy hồ sơ nhân sự", 404);
  }

  const [attendances] = await db.query(
    `SELECT DATE_FORMAT(a.work_date, '%Y-%m-%d') AS work_date,
            TIME_FORMAT(a.check_in, '%H:%i') AS check_in,
            TIME_FORMAT(a.check_out, '%H:%i') AS check_out,
            a.check_in_ip, a.status, a.actual_work_hours, a.base_workday,
            a.paid_leave_workday, a.total_workday, a.late_minutes,
            a.early_leave_minutes, a.raw_ot_minutes, a.approved_ot_hours,
            a.ot_rate, a.note,
            ws.code AS shift_code,
            TIME_FORMAT(ws.start_time, '%H:%i') AS start_time,
            TIME_FORMAT(ws.end_time, '%H:%i') AS end_time
       FROM attendances a
       LEFT JOIN work_shifts ws ON ws.id = a.shift_id
      WHERE a.employee_id = ? AND DATE_FORMAT(a.work_date, '%Y-%m') = ?
      ORDER BY a.work_date`,
    [employeeId, month],
  );

  const [leaves] = await db.query(
    `SELECT DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date,
            leave_type, reason, paid_workday, exempt_minutes
       FROM leave_requests
      WHERE employee_id = ? AND status = 'APPROVED'
        AND DATE_FORMAT(work_date, '%Y-%m') = ?
      ORDER BY work_date`,
    [employeeId, month],
  );

  return {
    month,
    employee: employees[0],
    rows: attendances,
    leaves,
  };
};

const MANAGER_ROLES = ["MANAGER", "CB_PAYROLL", "HR_ADMIN", "SUPER_ADMIN"];
const assertManagerScope = (user, employeeId) => {
  if (
    !MANAGER_ROLES.includes(user?.role_id) ||
    !["ALL", "DEPARTMENT"].includes(user?.data_scope)
  )
    throw attendanceError("Không có quyền quản lý chấm công nhân viên này", 403);
  if (!Number.isSafeInteger(Number(employeeId)) || Number(employeeId) <= 0)
    throw attendanceError("Nhân viên không hợp lệ");
};
const assertAttendanceEmployeeScope = async (
  connection,
  employeeId,
  user,
  lock = false,
) => {
  const scope = buildEmployeeScope(user);
  const [rows] = await connection.query(
    `SELECT e.id, e.employee_code, e.full_name,
            COALESCE(d.department_name, d.name) AS department_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       ${scope.clause || "WHERE 1 = 1"} AND e.id = ?
       LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [...scope.params, Number(employeeId)],
  );
  if (!rows.length) throw attendanceError("Nhân viên ngoài phạm vi quản lý", 403);
  return rows[0];
};
export const getAttendanceDetail = async (employeeId, dateValue, user) => {
  await ensureWorkShiftSchema();
  const targetDate = validateDate(dateValue || (await serverDate()));
  if (!user) throw attendanceError("Không có quyền xem chấm công", 403);
  const employee = await assertAttendanceEmployeeScope(db, employeeId, user);
  await reconcileMissingCheckout(employee.id, targetDate);
  const [attendanceRows] = await db.query(
    `SELECT a.*, s.code AS shift_code, s.name AS shift_name,
            s.start_time, s.end_time, s.checkin_start, s.checkin_end,
            s.checkout_start, s.checkout_end, s.break_start, s.break_end,
            s.grace_period_minutes, s.grace_period, s.standard_hours, s.workday_value
       FROM attendances a
       LEFT JOIN work_shifts s ON s.id = a.shift_id
      WHERE a.employee_id = ? AND a.work_date = ?
      LIMIT 1`,
    [employee.id, targetDate],
  );
  const attendance = attendanceRows[0] || null;
  const [scans] = await db.query(
    `SELECT id, DATE_FORMAT(scan_time, '%Y-%m-%d %H:%i:%s') AS scan_time,
            scan_type, face_score, ip_address, device_info, is_valid,
            reject_reason, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM attendance_logs
      WHERE employee_id = ? AND DATE(scan_time) = ?
      ORDER BY scan_time, id`,
    [employee.id, targetDate],
  );
  const [leaves] = await db.query(
    `SELECT id, leave_type, paid_workday, exempt_minutes, reason, status,
            DATE_FORMAT(approved_at, '%Y-%m-%d %H:%i:%s') AS approved_at
       FROM leave_requests
      WHERE employee_id = ? AND work_date = ? AND status = 'APPROVED'
      ORDER BY id`,
    [employee.id, targetDate],
  );
  const [overtimes] = await db.query(
    `SELECT id, start_time, end_time, ot_type, ot_rate, reason, status,
            DATE_FORMAT(approved_at, '%Y-%m-%d %H:%i:%s') AS approved_at
       FROM overtime_requests
      WHERE employee_id = ? AND work_date = ? AND status = 'APPROVED'
      ORDER BY id`,
    [employee.id, targetDate],
  );
  const [monthlyRows] = await db.query(
    `SELECT id, month_year, standard_days, actual_work_days, paid_leave_days,
            unpaid_leave_days, total_payable_days, late_count,
            total_late_minutes, ot_hours_150, ot_hours_200, ot_hours_300,
            status, locked_at
       FROM monthly_timesheets
      WHERE employee_id = ? AND month_year = ?
      LIMIT 1`,
    [employee.id, targetDate.slice(0, 7)],
  );
  const shift = attendance?.shift_id
    ? await getShiftById(attendance.shift_id)
    : await getShiftForDate(employee.id, targetDate);
  const explanation = parseExplanationNote(attendance?.note);
  const source = scans.some((scan) => scan.scan_type === "CHECK_IN")
    ? "FACE_ID"
    : explanation
      ? "MANUAL_ADJUST"
      : leaves.some((leave) => Number(leave.paid_workday) > 0)
        ? "LEAVE_SYNC"
        : null;
  return {
    date: targetDate,
    employee,
    attendance: attendance
      ? { ...attendance, ...legacyLog(attendance, source), explanation }
      : null,
    shift,
    scans,
    leaves,
    overtimes,
    monthly: monthlyRows[0] || null,
    editable: monthlyRows[0]?.status !== "LOCKED",
  };
};
const normalizeManualTime = (value) => {
  if (value === null || value === undefined || String(value).trim() === "")
    return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(value).trim());
  if (!match) throw attendanceError("Giờ vào/ra không hợp lệ. Dùng định dạng HH:mm", 400);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  if (hour > 23 || minute > 59 || second > 59)
    throw attendanceError("Giờ vào/ra không hợp lệ", 400);
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(hour)}:${pad(minute)}:${pad(second)}`;
};
export const updateAttendanceManual = async (payload = {}, user) => {
  await ensureWorkShiftSchema();
  assertManagerScope(user, payload.employee_id);
  const targetDate = validateDate(payload.date || (await serverDate()));
  if (targetDate > (await serverDate()))
    throw attendanceError("Không thể chỉnh sửa chấm công ngày trong tương lai");
  const checkIn = normalizeManualTime(payload.check_in);
  const checkOut = normalizeManualTime(payload.check_out);
  if (checkOut && !checkIn)
    throw attendanceError("Phải có giờ vào trước khi chỉnh giờ ra");
  const inMinutes = checkIn ? toMinutes(checkIn) : null;
  const outMinutes = checkOut ? toMinutes(checkOut) : null;
  if (inMinutes !== null && outMinutes !== null && outMinutes < inMinutes)
    throw attendanceError("Giờ ra không được trước giờ vào");
  const note =
    payload.note === undefined || payload.note === null
      ? null
      : String(payload.note).trim().slice(0, 500) || null;
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const employee = await assertAttendanceEmployeeScope(
      connection,
      payload.employee_id,
      user,
      true,
    );
    await assertMonthOpen(connection, employee.id, targetDate);
    const [existingRows] = await connection.query(
      "SELECT * FROM attendances WHERE employee_id = ? AND work_date = ? FOR UPDATE",
      [employee.id, targetDate],
    );
    const existing = existingRows[0];
    if (!existing)
      throw attendanceError(
        "Chưa có bản ghi chấm công để chỉnh sửa. Hãy điểm danh trước.",
        409,
      );
    const withUpdatedAt = await hasColumn(connection, "attendances", "updated_at");
    await connection.query(
      `UPDATE attendances
          SET check_in = ?, check_out = ?, note = ?,
              ${withUpdatedAt ? "updated_at = NOW()," : ""}
              status = ?
        WHERE id = ?`,
      [checkIn, checkOut, note, existing.status, existing.id],
    );
    await insertRawScan(
      connection,
      employee.id,
      { user_id: user?.user_id || null },
      "RAW_SCAN",
      {
        ip: payload.ip || null,
        device_info: `MANUAL_EDIT_BY_${user?.user_id || "UNKNOWN"}`,
      },
    );
    await recalculateDailyAttendance(connection, employee.id, targetDate);
    await recalculateEmployeeMonth(connection, employee.id, targetDate.slice(0, 7));
    await connection.commit();
    return await getAttendanceDetail(employee.id, targetDate, user);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const markEmployees = async (ids, date, type, user, skipExisting = false) => {
  if (
    !["MANAGER", "CB_PAYROLL", "HR_ADMIN", "SUPER_ADMIN"].includes(
      user?.role_id,
    ) ||
    !["ALL", "DEPARTMENT"].includes(user?.data_scope)
  )
    throw attendanceError("Không có quyền điểm danh nhân viên", 403);
  if (
    !["PRESENT", "HALF", "ABSENT"].includes(type) ||
    ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
  )
    throw attendanceError("Dữ liệu điểm danh không hợp lệ");
  const targetDate = validateDate(date || (await serverDate()));
  if (targetDate > (await serverDate()))
    throw attendanceError("Không thể điểm danh cho ngày trong tương lai");

  const connection = await db.getConnection();
  let count = 0;
  try {
    await connection.beginTransaction();
    for (const id of ids) {
      const scope = buildEmployeeScope(user);
      const [employees] = await connection.query(
        `SELECT e.id FROM employees e ${scope.clause || "WHERE 1 = 1"} AND e.id = ? AND e.work_status = 'WORKING' FOR UPDATE`,
        [...scope.params, id],
      );
      if (!employees.length)
        throw attendanceError("Nhân viên ngoài phạm vi quản lý", 403);

      const account = await resolveActiveAccount(connection, id);
      await assertMonthOpen(connection, id, targetDate);
      const [existing] = await connection.query(
        "SELECT id FROM attendances WHERE employee_id = ? AND work_date = ? FOR UPDATE",
        [id, targetDate],
      );
      const [leave] = await connection.query(
        "SELECT id FROM leave_requests WHERE employee_id = ? AND status = 'APPROVED' AND work_date = ?",
        [id, targetDate],
      );
      if (existing.length || leave.length) {
        if (skipExisting) continue;
        throw attendanceError(
          "Nhân viên đã có chấm công hoặc đơn nghỉ được duyệt trong ngày",
          409,
        );
      }

      const shift = await getShiftForDate(id, targetDate, connection);
      if (!shift)
        throw attendanceError("Chưa cấu hình ca làm việc cho nhân viên");

      const start = toMinutes(shift.start_time) ?? 480;
      const end = toMinutes(shift.end_time) ?? 1050;
      const checkOutMinutes =
        type === "HALF" ? Math.round((start + end) / 2) : end;
      const workdayValue = normalizeWorkdayValue(shift.workday_value);
      const units =
        type === "ABSENT"
          ? 0
          : type === "HALF"
            ? Math.min(0.5, workdayValue)
            : workdayValue;
      const note = `Điểm danh ${type} bởi user ${user.user_id}`;
      const withUser = await hasColumn(connection, "attendances", "user_id");

      await insertRawScan(connection, id, account, "RAW_SCAN", {
        device_info: "MANUAL_ADJUST",
      });
      await connection.query(
        `INSERT INTO attendances
          (employee_id, ${withUser ? "user_id, " : ""}shift_id, work_date,
           check_in, check_out, base_workday, total_workday, status, note)
         VALUES (?, ${withUser ? "?, " : ""}?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           ${withUser ? "user_id = VALUES(user_id)," : ""}
           shift_id = VALUES(shift_id),
           check_in = VALUES(check_in), check_out = VALUES(check_out),
           base_workday = VALUES(base_workday), total_workday = VALUES(total_workday),
           status = VALUES(status), note = VALUES(note)`,
        [
          id,
          ...(withUser ? [account.user_id] : []),
          shift.shift_id,
          targetDate,
          type === "ABSENT" ? null : formatTime(start),
          type === "ABSENT" ? null : formatTime(checkOutMinutes),
          units,
          units,
          type === "ABSENT" ? "ABSENT" : "IN_PROGRESS",
          note,
        ],
      );
      await recalculateDailyAttendance(connection, id, targetDate);
      await recalculateEmployeeMonth(
        connection,
        id,
        targetDate.slice(0, 7),
      );
      count += 1;
    }
    await connection.commit();
    return { count };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const quickMarkAttendance = async (employeeId, date, type, user) =>
  markEmployees([Number(employeeId)], date, type, user);

export const quickMarkAll = async (departmentId, date, user) => {
  const result = await listAttendanceByDate(date, user);
  const rows = result.rows.filter(
    (row) =>
      !row.log_id &&
      row.leave_paid == null &&
      (!departmentId || Number(row.department_id) === Number(departmentId)),
  );
  return markEmployees(
    rows.map((row) => row.employee_id),
    result.date,
    "PRESENT",
    user,
    true,
  );
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const SHIFT_CODE_PATTERN = /^[A-Z0-9_]{2,20}$/;

const isBlankTimeInput = (value) => {
  const text = String(value ?? "").trim();
  return !text || /^[-–—:.\s]*(AM|PM|SA|CH|NG)?$/i.test(text);
};

const normalizeTime = (value) => {
  if (isBlankTimeInput(value)) return null;
  const text = String(value ?? "").trim();
  if (!TIME_PATTERN.test(text)) return null;
  return text.length === 5 ? `${text}:00` : text;
};

const parseDateOnly = (value) => {
  const text = String(value ?? "").trim();
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text
  )
    return null;
  return text;
};

export const validateShiftPayload = (payload = {}) => {
  const code = String(payload.code ?? payload.shift_code ?? "")
    .trim()
    .toUpperCase();
  if (!SHIFT_CODE_PATTERN.test(code))
    return { error: "Mã ca phải từ 2-20 ký tự, chỉ gồm chữ in hoa, số hoặc gạch dưới" };
  const name = String(payload.name ?? "").trim();
  if (!name) return { error: "Tên ca làm việc không được để trống" };
  if (name.length > 100)
    return { error: "Tên ca làm việc không được vượt quá 100 ký tự" };

  const startTime = normalizeTime(payload.start_time);
  const endTime = normalizeTime(payload.end_time);
  if (!startTime || !endTime)
    return { error: "Giờ bắt đầu và giờ kết thúc phải đúng định dạng HH:MM" };
  const isOvernight = Number(payload.is_overnight) ? 1 : 0;
  if (!isOvernight && toMinutes(endTime) <= toMinutes(startTime))
    return { error: "Giờ kết thúc phải lớn hơn giờ bắt đầu trong cùng ngày" };

  const checkinStart = isBlankTimeInput(payload.checkin_start)
    ? null
    : normalizeTime(payload.checkin_start);
  const checkinEnd = isBlankTimeInput(payload.checkin_end)
    ? null
    : normalizeTime(payload.checkin_end);
  const checkoutStart = isBlankTimeInput(payload.checkout_start)
    ? null
    : normalizeTime(payload.checkout_start);
  const checkoutEnd = isBlankTimeInput(payload.checkout_end)
    ? null
    : normalizeTime(payload.checkout_end);
  if (
    (!isBlankTimeInput(payload.checkin_start) && !checkinStart) ||
    (!isBlankTimeInput(payload.checkin_end) && !checkinEnd) ||
    (!isBlankTimeInput(payload.checkout_start) && !checkoutStart) ||
    (!isBlankTimeInput(payload.checkout_end) && !checkoutEnd)
  )
    return { error: "Khung giờ quét vào/ra phải đúng định dạng HH:MM" };
  if (checkinStart && checkinEnd && toMinutes(checkinEnd) < toMinutes(checkinStart))
    return { error: "Giờ kết thúc khung check-in phải sau giờ bắt đầu" };
  if (checkoutStart && checkoutEnd && toMinutes(checkoutEnd) < toMinutes(checkoutStart))
    return { error: "Giờ kết thúc khung check-out phải sau giờ bắt đầu" };

  const hasBreak = payload.has_break === undefined ? 1 : Number(payload.has_break) ? 1 : 0;
  const breakStart = normalizeTime(payload.break_start) || "12:00:00";
  let breakEnd = normalizeTime(payload.break_end);
  if (!breakEnd && payload.break_minutes !== undefined) {
    breakEnd = formatTime(
      toMinutes(breakStart) + toNumber(payload.break_minutes, 0),
    );
  }
  if (!breakEnd) breakEnd = "13:30:00";
  const breakStartMin = toMinutes(breakStart);
  const breakEndMin = toMinutes(breakEnd);
  if (breakEndMin <= breakStartMin)
    return { error: "Gi? k?t th?c ngh? gi?a ca ph?i l?n h?n gi? b?t ??u" };
  const shiftStartMin = toMinutes(startTime);
  const rawShiftEndMin = toMinutes(endTime);
  const shiftEndMin = isOvernight && rawShiftEndMin !== null && shiftStartMin !== null && rawShiftEndMin <= shiftStartMin
    ? rawShiftEndMin + 1440
    : rawShiftEndMin;
  const breakDuration = Math.max(0, (breakEndMin ?? 0) - (breakStartMin ?? 0));
  if (hasBreak && shiftStartMin !== null && shiftEndMin !== null) {
    const shiftDuration = Math.max(0, shiftEndMin - shiftStartMin);
    if (breakDuration >= shiftDuration)
      return { error: "Kho?ng ngh? gi?a ca ph?i n?m trong th?i l??ng ca l?m vi?c" };
    let normalizedBreakStart = breakStartMin;
    let normalizedBreakEnd = breakEndMin;
    if (isOvernight && normalizedBreakStart !== null && normalizedBreakEnd !== null && normalizedBreakEnd <= shiftStartMin) {
      normalizedBreakStart += 1440;
      normalizedBreakEnd += 1440;
    }
    const breakInside = normalizedBreakStart !== null && normalizedBreakEnd !== null
      && normalizedBreakStart >= shiftStartMin && normalizedBreakEnd <= shiftEndMin;
    if (!breakInside)
      return { error: "Kho?ng ngh? gi?a ca ph?i n?m trong khung gi? ca l?m vi?c, k? c? ca qua ??m" };
  }

  const gracePeriod = Number(
    payload.grace_period ?? payload.grace_minutes ?? 15,
  );
  if (
    !Number.isInteger(gracePeriod) ||
    gracePeriod < 0 ||
    gracePeriod > 120
  )
    return { error: "Số phút ân hạn đi muộn phải từ 0 đến 120" };

  const minOtMinutes = Number(payload.min_ot_minutes ?? 30);
  if (
    !Number.isInteger(minOtMinutes) ||
    minOtMinutes < 0 ||
    minOtMinutes > 240
  )
    return { error: "Số phút tối thiểu tính tăng ca phải từ 0 đến 240" };

  const legacyUnits = payload.standard_work_units;
  const standardHours =
    payload.standard_hours !== undefined
      ? toNumber(payload.standard_hours, 8)
      : legacyUnits !== undefined
        ? round2(8 * toNumber(legacyUnits, 1))
        : 8;
  const workdayValue =
    payload.workday_value !== undefined
      ? toNumber(payload.workday_value, 1)
      : legacyUnits !== undefined
        ? toNumber(legacyUnits, 1)
        : 1;
  if (standardHours <= 0 || standardHours > 24)
    return { error: "Số giờ chuẩn của ca không hợp lệ" };
  if (![0.5, 1].includes(workdayValue))
    return { error: "Giá trị công chuẩn chỉ nhận 0.5 hoặc 1.0" };

  const isDefault = payload.is_default === undefined ? 0 : Number(payload.is_default) ? 1 : 0;
  const isActive = payload.is_active === undefined ? 1 : Number(payload.is_active) ? 1 : 0;
  const requireBreakPunch = Number(payload.require_break_punch) ? 1 : 0;
  const allowCheckoutAnytime =
    payload.allow_checkout_anytime === undefined
      ? 1
      : Number(payload.allow_checkout_anytime)
        ? 1
        : 0;
  const checkinOpenBefore = Math.max(
    0,
    Math.min(720, Math.round(toNumber(payload.checkin_open_before_min, 120))),
  );
  const checkinCloseAfter =
    payload.checkin_close_after_min === null ||
    payload.checkin_close_after_min === undefined ||
    payload.checkin_close_after_min === ""
      ? null
      : Math.max(
          0,
          Math.min(720, Math.round(toNumber(payload.checkin_close_after_min, 120))),
        );
  let workingDays = null;
  if (Array.isArray(payload.working_days)) {
    workingDays = JSON.stringify(payload.working_days);
  } else if (typeof payload.working_days === "string" && payload.working_days.trim()) {
    try {
      const parsed = JSON.parse(payload.working_days);
      if (!Array.isArray(parsed))
        return { error: "Ngày làm việc phải là mảng JSON, ví dụ [1,2,3,4,5]" };
      workingDays = JSON.stringify(parsed);
    } catch {
      return { error: "Ngày làm việc phải là mảng JSON, ví dụ [1,2,3,4,5]" };
    }
  }
  const policyId =
    payload.policy_id === null || payload.policy_id === undefined || payload.policy_id === ""
      ? null
      : Number(payload.policy_id);

  const expectedStandardHours = round2(Math.max(0, ((shiftEndMin ?? 0) - (shiftStartMin ?? 0) - (hasBreak ? breakDuration : 0)) / 60));
  const standardWorkHours = round2(toNumber(payload.standard_work_hours, standardHours));
  const warnings = [];
  if (expectedStandardHours > 0 && Math.abs(standardWorkHours - expectedStandardHours) > 0.25) {
    warnings.push(`standard_work_hours (${standardWorkHours}) l?ch > 0.25h so v?i (end-start-break)=${expectedStandardHours}`);
  }

  return {
    warnings,
    payload: {
      code,
      name,
      start_time: startTime,
      end_time: endTime,
      break_start: breakStart,
      break_end: breakEnd,
      grace_period: gracePeriod,
      min_ot_minutes: minOtMinutes,
      standard_hours: round2(standardHours),
      standard_work_hours: standardWorkHours,
      workday_value: round2(workdayValue),
      is_default: isDefault,
      is_active: isActive,
      is_overnight: isOvernight,
      has_break: hasBreak,
      require_break_punch: requireBreakPunch,
      allow_checkout_anytime: allowCheckoutAnytime,
      checkin_open_before_min: checkinOpenBefore,
      checkin_close_after_min: checkinCloseAfter,
      working_days: workingDays,
      policy_id: policyId,
    },
  };
};

export const listWorkShifts = async () => {
  const [rows] = await db.query(
    `SELECT id, code, name, start_time, end_time, break_start, break_end,
            checkin_start, checkin_end, checkout_start, checkout_end,
            grace_period_minutes, grace_period, min_ot_minutes, standard_hours, workday_value,
            is_default, is_active, is_overnight, has_break, require_break_punch,
            standard_work_hours, checkin_open_before_min, checkin_close_after_min,
            allow_checkout_anytime, working_days, policy_id
       FROM work_shifts
      ORDER BY is_active DESC, id ASC`,
  );
  return rows.map((row) => ({
    ...row,
    shift_code: row.code,
    break_minutes:
      (toMinutes(row.break_end) ?? 0) - (toMinutes(row.break_start) ?? 0),
    grace_period_minutes: toNumber(row.grace_period_minutes, row.grace_period ?? 15),
    grace_minutes: toNumber(row.grace_period_minutes, row.grace_period ?? 15),
    standard_work_units: normalizeWorkdayValue(row.workday_value),
    is_default: Number(row.is_default) ? 1 : 0,
    is_active: Number(row.is_active) ? 1 : 0,
    allow_checkout_anytime: Number(row.allow_checkout_anytime ?? 1) ? 1 : 0,
    has_break: Number(row.has_break ?? 1) ? 1 : 0,
    policy_id: row.policy_id ?? null,
    standard_work_hours: toNumber(row.standard_work_hours, row.standard_hours ?? 8),
  }));
};

export const createWorkShift = async (payload) => {
  const [duplicate] = await db.query(
    "SELECT id FROM work_shifts WHERE code = ? LIMIT 1",
    [payload.code],
  );
  if (duplicate.length)
    throw attendanceError("Mã ca làm việc đã tồn tại", 409);
  const [result] = await db.query(
    `INSERT INTO work_shifts
      (code, name, start_time, end_time, checkin_start, checkin_end,
       checkout_start, checkout_end, break_start, break_end, grace_period,
       grace_period_minutes, min_ot_minutes, standard_hours, workday_value,
       is_default, is_active, is_overnight, has_break, require_break_punch,
       standard_work_hours, checkin_open_before_min, checkin_close_after_min,
       allow_checkout_anytime, working_days, policy_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
     [
      payload.code,
      payload.name,
      payload.start_time,
      payload.end_time,
      payload.checkin_start ?? null,
      payload.checkin_end ?? null,
      payload.checkout_start ?? null,
      payload.checkout_end ?? null,
      payload.break_start,
      payload.break_end,
      payload.grace_period,
      payload.grace_period_minutes ?? payload.grace_period,
      payload.min_ot_minutes,
      payload.standard_hours,
      payload.workday_value,
      payload.is_default,
      payload.is_active,
      payload.is_overnight ?? 0,
      payload.has_break ?? 1,
      payload.require_break_punch ?? 0,
      payload.standard_work_hours ?? payload.standard_hours,
      payload.checkin_open_before_min ?? 120,
      payload.checkin_close_after_min ?? null,
      payload.allow_checkout_anytime ?? 1,
      payload.working_days ?? null,
      payload.policy_id ?? null,
    ],
  );
  return { id: result.insertId };
};

export const updateWorkShift = async (shiftId, payload) => {
  const [existing] = await db.query(
    "SELECT id FROM work_shifts WHERE id = ? LIMIT 1",
    [shiftId],
  );
  if (!existing.length) throw attendanceError("Không tìm thấy ca làm việc", 404);
  const [duplicate] = await db.query(
    "SELECT id FROM work_shifts WHERE code = ? AND id <> ? LIMIT 1",
    [payload.code, shiftId],
  );
  if (duplicate.length)
    throw attendanceError("Mã ca làm việc đã tồn tại", 409);
  await db.query(
    `UPDATE work_shifts
        SET code = ?, name = ?, start_time = ?, end_time = ?,
            break_start = ?, break_end = ?, grace_period = ?,
            min_ot_minutes = ?, standard_hours = ?, workday_value = ?,
            is_default = ?, is_active = ?, is_overnight = ?, has_break = ?,
            require_break_punch = ?, standard_work_hours = ?,
            checkin_open_before_min = ?, checkin_close_after_min = ?,
            allow_checkout_anytime = ?, working_days = ?, policy_id = ?
      WHERE id = ?`,
    [
      payload.code,
      payload.name,
      payload.start_time,
      payload.end_time,
      payload.break_start,
      payload.break_end,
      payload.grace_period,
      payload.min_ot_minutes,
      payload.standard_hours,
      payload.workday_value,
      payload.is_default,
      payload.is_active,
      payload.is_overnight ?? 0,
      payload.has_break ?? 1,
      payload.require_break_punch ?? 0,
      payload.standard_work_hours ?? payload.standard_hours,
      payload.checkin_open_before_min ?? 120,
      payload.checkin_close_after_min ?? null,
      payload.allow_checkout_anytime ?? 1,
      payload.working_days ?? null,
      payload.policy_id ?? null,
      shiftId,
    ],
  );
  return { id: Number(shiftId) };
};

const assertEmployeeInScope = async (connection, user, employeeId) => {
  const scope = buildEmployeeScope(user);
  const [employees] = await connection.query(
    `SELECT e.id FROM employees e ${scope.clause || "WHERE 1 = 1"} AND e.id = ? LIMIT 1`,
    [...scope.params, employeeId],
  );
  if (!employees.length)
    throw attendanceError("Nhân viên ngoài phạm vi quản lý", 403);
  return employees[0];
};

export const listShiftAssignments = async (user, filters = {}) => {
  const scope = buildEmployeeScope(user);
  const conditions = [
    scope.clause ? scope.clause.replace(/^WHERE\s+/i, "") : "1 = 1",
  ];
  const params = [...scope.params];
  if (filters.employee_id) {
    conditions.push("es.employee_id = ?");
    params.push(Number(filters.employee_id));
  }
  if (filters.shift_id) {
    conditions.push("es.shift_id = ?");
    params.push(Number(filters.shift_id));
  }
  if (filters.department_id) {
    conditions.push("e.department_id = ?");
    params.push(Number(filters.department_id));
  }
  const [rows] = await db.query(
    `SELECT es.id, es.employee_id, e.employee_code, e.full_name,
            e.department_id, COALESCE(d.department_name, d.name) AS department_name,
            es.shift_id, s.code AS shift_code, s.name AS shift_name,
            s.start_time, s.end_time,
            DATE_FORMAT(es.effective_from, '%Y-%m-%d') AS effective_from,
            DATE_FORMAT(es.effective_to, '%Y-%m-%d') AS effective_to,
            u.id AS user_id, u.username
       FROM employee_shifts es
      INNER JOIN employees e ON e.id = es.employee_id
      LEFT JOIN departments d ON d.id = e.department_id
      INNER JOIN work_shifts s ON s.id = es.shift_id
      LEFT JOIN users u ON u.employee_id = e.id
      WHERE ${conditions.join(" AND ")}
      ORDER BY es.effective_from DESC, es.id DESC`,
    params,
  );
  return rows.map((row) => ({
    ...row,
    work_days: "MON,TUE,WED,THU,FRI",
    note: null,
  }));
};

const getShiftAssignmentImpactDates = async (connection, employeeId, fromDate, toDate) => {
  const start = formatDateOnly(fromDate);
  const end = toDate ? formatDateOnly(toDate) : (await serverDate(connection));
  if (!start || !end) return [];
  const finalEnd = end < start ? start : end;
  const [rows] = await connection.query(
    `SELECT DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date
       FROM attendances
      WHERE employee_id = ? AND work_date >= ? AND work_date <= ?
      ORDER BY work_date`,
    [employeeId, start, finalEnd],
  );
  return [...new Set(rows.map((r) => formatDateOnly(r.work_date)).filter(Boolean))];
};

const recalcImpactedAttendanceDates = async (connection, impacts = []) => {
  const summary = { recalculated_days: 0, recalculated_employees: 0, skipped_locked_days: 0, affected_months: [] };
  const employeeMonths = new Map();
  const seenEmployees = new Set();
  for (const impact of impacts) {
    const employeeId = Number(impact.employee_id);
    const dates = [...new Set((impact.dates || []).map(formatDateOnly).filter(Boolean))];
    if (!employeeId || !dates.length) continue;
    for (const workDate of dates) {
      const month = monthFromDate(workDate);
      const [monthRows] = await connection.query(
        "SELECT status FROM monthly_timesheets WHERE employee_id = ? AND month_year = ? FOR UPDATE",
        [employeeId, month],
      );
      if (monthRows[0]?.status === "LOCKED") { summary.skipped_locked_days += 1; continue; }
      await recalculateDailyAttendance(connection, employeeId, workDate);
      summary.recalculated_days += 1;
      seenEmployees.add(employeeId);
      const key = `${employeeId}:${month}`;
      if (!employeeMonths.has(key)) employeeMonths.set(key, { employee_id: employeeId, month_year: month });
    }
  }
  for (const item of employeeMonths.values()) {
    const [monthRows] = await connection.query(
      "SELECT status FROM monthly_timesheets WHERE employee_id = ? AND month_year = ? FOR UPDATE",
      [item.employee_id, item.month_year],
    );
    if (monthRows[0]?.status === "LOCKED") continue;
    await recalculateEmployeeMonth(connection, item.employee_id, item.month_year);
    summary.affected_months.push(item);
  }
  summary.recalculated_employees = seenEmployees.size;
  return summary;
};

export const createShiftAssignment = async (user, payload = {}) => {
  const employeeId = Number(payload.employee_id);
  const shiftId = Number(payload.shift_id);
  if (!Number.isSafeInteger(employeeId) || employeeId <= 0)
    throw attendanceError("Nhân viên phân ca không hợp lệ");
  if (!Number.isSafeInteger(shiftId) || shiftId <= 0)
    throw attendanceError("Ca làm việc không hợp lệ");
  const effectiveFrom = parseDateOnly(payload.effective_from);
  if (!effectiveFrom)
    throw attendanceError("Ngày hiệu lực không hợp lệ (YYYY-MM-DD)");
  const effectiveTo = payload.effective_to
    ? parseDateOnly(payload.effective_to)
    : null;
  if (payload.effective_to && !effectiveTo)
    throw attendanceError("Ngày kết thúc hiệu lực không hợp lệ (YYYY-MM-DD)");
  if (effectiveTo && effectiveTo < effectiveFrom)
    throw attendanceError("Ngày kết thúc phải lớn hơn hoặc bằng ngày hiệu lực");

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await assertEmployeeInScope(connection, user, employeeId);
    const [shifts] = await connection.query(
      "SELECT id FROM work_shifts WHERE id = ? AND is_active = 1 LIMIT 1",
      [shiftId],
    );
    if (!shifts.length)
      throw attendanceError("Ca làm việc không tồn tại hoặc đã ngừng sử dụng");
    const [overlap] = await connection.query(
      `SELECT id FROM employee_shifts
        WHERE employee_id = ? AND effective_from <= ?
          AND (effective_to IS NULL OR effective_to >= ?)
        LIMIT 1`,
      [employeeId, effectiveTo || "9999-12-31", effectiveFrom],
    );
    if (overlap.length)
      throw attendanceError("Nhân viên đã có phân ca trùng khoảng thời gian này", 409);
    const [result] = await connection.query(
      `INSERT INTO employee_shifts (employee_id, shift_id, effective_from, effective_to)
       VALUES (?, ?, ?, ?)`,
      [employeeId, shiftId, effectiveFrom, effectiveTo],
    );
    const impactDates = await getShiftAssignmentImpactDates(connection, employeeId, effectiveFrom, effectiveTo);
    const recalc_summary = await recalcImpactedAttendanceDates(connection, [{ employee_id: employeeId, dates: impactDates }]);
    await connection.commit();
    return { id: result.insertId, recalc_summary };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const updateShiftAssignment = async (
  user,
  assignmentId,
  payload = {},
) => {
  const id = Number(assignmentId);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw attendanceError("Phân ca cần cập nhật không hợp lệ");
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query(
      "SELECT * FROM employee_shifts WHERE id = ? FOR UPDATE",
      [id],
    );
    if (!existing.length) throw attendanceError("Không tìm thấy phân ca", 404);
    await assertEmployeeInScope(connection, user, existing[0].employee_id);

    const employeeId = Number(payload.employee_id ?? existing[0].employee_id);
    const shiftId = Number(payload.shift_id ?? existing[0].shift_id);
    if (!Number.isSafeInteger(employeeId) || employeeId <= 0)
      throw attendanceError("Nhân viên phân ca không hợp lệ");
    await assertEmployeeInScope(connection, user, employeeId);
    const effectiveFrom = parseDateOnly(
      payload.effective_from ?? existing[0].effective_from,
    );
    if (!effectiveFrom)
      throw attendanceError("Ngày hiệu lực không hợp lệ (YYYY-MM-DD)");
    const rawTo = payload.effective_to ?? existing[0].effective_to;
    const effectiveTo = rawTo ? parseDateOnly(rawTo) : null;
    if (rawTo && !effectiveTo)
      throw attendanceError("Ngày kết thúc hiệu lực không hợp lệ (YYYY-MM-DD)");
    if (effectiveTo && effectiveTo < effectiveFrom)
      throw attendanceError("Ngày kết thúc phải lớn hơn hoặc bằng ngày hiệu lực");

    const [shifts] = await connection.query(
      "SELECT id FROM work_shifts WHERE id = ? AND is_active = 1 LIMIT 1",
      [shiftId],
    );
    if (!shifts.length)
      throw attendanceError("Ca làm việc không tồn tại hoặc đã ngừng sử dụng");
    const [overlap] = await connection.query(
      `SELECT id FROM employee_shifts
        WHERE employee_id = ? AND id <> ? AND effective_from <= ?
          AND (effective_to IS NULL OR effective_to >= ?)
        LIMIT 1`,
      [employeeId, id, effectiveTo || "9999-12-31", effectiveFrom],
    );
    if (overlap.length)
      throw attendanceError(
        "Nhân viên đã có phân ca trùng khoảng thời gian này",
        409,
      );

    await connection.query(
      `UPDATE employee_shifts
          SET employee_id = ?, shift_id = ?, effective_from = ?, effective_to = ?
        WHERE id = ?`,
      [employeeId, shiftId, effectiveFrom, effectiveTo, id],
    );
    await connection.commit();
    return { id };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const deleteShiftAssignment = async (user, assignmentId) => {
  const id = Number(assignmentId);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw attendanceError("Phân ca cần xóa không hợp lệ");
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query(
      "SELECT * FROM employee_shifts WHERE id = ? FOR UPDATE",
      [id],
    );
    if (!existing.length) throw attendanceError("Không tìm thấy phân ca", 404);
    await assertEmployeeInScope(connection, user, existing[0].employee_id);
    await connection.query("DELETE FROM employee_shifts WHERE id = ?", [id]);
    await connection.commit();
    return { id };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const EXPLANATION_PREFIX = "[EXPLAIN_JSON]";

export const parseExplanationNote = (note) => {
  const text = String(note || "");
  if (!text.startsWith(EXPLANATION_PREFIX)) return null;
  try {
    const data = JSON.parse(text.slice(EXPLANATION_PREFIX.length));
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
};

const buildExplanationNote = (data) =>
  `${EXPLANATION_PREFIX}${JSON.stringify(data)}`;

export const submitExplanation = async (user, payload = {}) => {
  const employeeId = user?.employee_id;
  if (!employeeId)
    throw attendanceError("Tài khoản chưa liên kết hồ sơ nhân sự", 404);
  const workDate = validateDate(payload.work_date || payload.date);
  const reason = String(payload.reason ?? "").trim();
  if (!reason) throw attendanceError("Vui lòng nhập lý do giải trình");
  if (reason.length > 500)
    throw attendanceError("Lý do giải trình không được vượt quá 500 ký tự");
  const checkIn = payload.check_in ? normalizeTime(payload.check_in) : null;
  const checkOut = payload.check_out ? normalizeTime(payload.check_out) : null;
  if (payload.check_in && !checkIn)
    throw attendanceError("Giờ vào giải trình không hợp lệ (HH:MM)");
  if (payload.check_out && !checkOut)
    throw attendanceError("Giờ ra giải trình không hợp lệ (HH:MM)");
  if (
    checkIn &&
    checkOut &&
    toMinutes(checkOut) <= toMinutes(checkIn)
  )
    throw attendanceError("Giờ ra phải lớn hơn giờ vào");

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const today = await serverDate(connection);
    await connection.query("SELECT id FROM employees WHERE id = ? FOR UPDATE", [
      employeeId,
    ]);
    if (workDate > today)
      throw attendanceError("Không thể gửi giải trình cho ngày trong tương lai");
    await assertMonthOpen(connection, employeeId, workDate);
    const account = await resolveActiveAccount(connection, employeeId);
    const shift = await getShiftForDate(employeeId, workDate, connection);

    const [rows] = await connection.query(
      "SELECT * FROM attendances WHERE employee_id = ? AND work_date = ? FOR UPDATE",
      [employeeId, workDate],
    );
    let attendance = rows[0] || null;
    const noteData = {
      reason,
      status: "PENDING",
      check_in: checkIn || attendance?.check_in || null,
      check_out: checkOut || attendance?.check_out || null,
      submitted_by: Number(employeeId),
      submitted_at: new Date().toISOString(),
      approved_by: null,
      approved_at: null,
      reject_reason: null,
      original: attendance
        ? {
            check_in: attendance.check_in,
            check_out: attendance.check_out,
            late_minutes: attendance.late_minutes,
            early_leave_minutes: attendance.early_leave_minutes,
            base_workday: attendance.base_workday,
            total_workday: attendance.total_workday,
            status: attendance.status,
          }
        : null,
    };

    if (!attendance) {
      if (!shift)
        throw attendanceError("Chưa cấu hình ca làm việc cho nhân viên");
      const withUser = await hasColumn(connection, "attendances", "user_id");
      await insertRawScan(connection, employeeId, account, "RAW_SCAN", {
        device_info: "MANUAL_ADJUST",
      });
      await connection.query(
        `INSERT INTO attendances
          (employee_id, ${withUser ? "user_id, " : ""}shift_id, work_date, note, status)
         VALUES (?, ${withUser ? "?, " : ""}?, ?, ?, 'IN_PROGRESS')`,
        [
          employeeId,
          ...(withUser ? [account.user_id] : []),
          shift.shift_id,
          workDate,
          buildExplanationNote(noteData),
        ],
      );
    } else {
      const existingExplanation = parseExplanationNote(attendance.note);
      if (existingExplanation?.status === "PENDING")
        throw attendanceError("Đã có giải trình đang chờ duyệt cho ngày này", 409);
      if (existingExplanation?.status === "APPROVED")
        throw attendanceError("Giải trình ngày này đã được duyệt", 409);
      await connection.query(
        "UPDATE attendances SET note = ? WHERE id = ?",
        [buildExplanationNote(noteData), attendance.id],
      );
    }

    await connection.commit();
    return { log: { id: attendance?.id || null }, explanation: noteData };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const listExplanations = async (user, filters = {}) => {
  const scope = buildEmployeeScope(user);
  const conditions = ["a.note LIKE '[EXPLAIN_JSON]%'"];
  const params = [];
  if (scope.clause) conditions.push(scope.clause.replace(/^WHERE\s+/i, ""));
  params.push(...scope.params);
  if (filters.employee_id) {
    conditions.push("a.employee_id = ?");
    params.push(Number(filters.employee_id));
  }
  if (filters.month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(filters.month)))
      throw attendanceError("Kỳ giải trình không hợp lệ (YYYY-MM)");
    conditions.push("DATE_FORMAT(a.work_date, '%Y-%m') = ?");
    params.push(filters.month);
  }

  const withUser = await hasColumn(db, "attendances", "user_id");
  const [rows] = await db.query(
    `SELECT a.id, a.employee_id, ${withUser ? "a.user_id, u.username" : "NULL AS user_id, NULL AS username"},
            e.employee_code, e.full_name,
            e.department_id, COALESCE(d.department_name, d.name) AS department_name,
            DATE_FORMAT(a.work_date, '%Y-%m-%d') AS work_date,
            a.shift_id, s.code AS shift_code, a.check_in, a.check_out,
            a.total_workday, a.status AS raw_status, a.note,
            COALESCE(mt.status, 'OPEN') AS month_status
       FROM attendances a
      INNER JOIN employees e ON e.id = a.employee_id
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN work_shifts s ON s.id = a.shift_id
      ${withUser ? "LEFT JOIN users u ON u.id = a.user_id" : ""}
      LEFT JOIN monthly_timesheets mt ON mt.employee_id = a.employee_id AND mt.month_year = DATE_FORMAT(a.work_date, '%Y-%m')
      WHERE ${conditions.join(" AND ")}
      ORDER BY a.work_date DESC, a.id DESC`,
    params,
  );

  return rows
    .map((row) => {
      const explanation = parseExplanationNote(row.note);
      if (!explanation) return null;
      return {
        ...row,
        note: undefined,
        explanation_status: explanation.status,
        reason: explanation.reason,
        submitted_by: explanation.submitted_by,
        submitted_at: explanation.submitted_at,
        approved_by: explanation.approved_by,
        approved_at: explanation.approved_at,
        reject_reason: explanation.reject_reason,
      };
    })
    .filter(Boolean)
    .filter(
      (row) =>
        !filters.status ||
        row.explanation_status === String(filters.status).toUpperCase(),
    );
};

const loadExplanationLog = async (connection, explanationId) => {
  const id = Number(explanationId);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw attendanceError("Giải trình không hợp lệ");
  const [rows] = await connection.query(
    `SELECT *, DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date_str
       FROM attendances WHERE id = ? FOR UPDATE`,
    [id],
  );
  if (!rows.length) throw attendanceError("Không tìm thấy giải trình", 404);
  const explanation = parseExplanationNote(rows[0].note);
  if (!explanation)
    throw attendanceError("Bản ghi không phải giải trình công", 400);
  return { log: rows[0], explanation };
};

export const approveExplanation = async (user, explanationId, payload = {}) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { log, explanation } = await loadExplanationLog(
      connection,
      explanationId,
    );
    if (explanation.status !== "PENDING")
      throw attendanceError("Giải trình đã được xử lý trước đó", 409);
    await assertCanApprove(connection, user, log.employee_id);
    const workDate = log.work_date_str;
    await assertMonthOpen(connection, log.employee_id, workDate);

    const checkIn = payload.check_in
      ? normalizeTime(payload.check_in)
      : explanation.check_in;
    const checkOut = payload.check_out
      ? normalizeTime(payload.check_out)
      : explanation.check_out;
    if (
      (payload.check_in && !checkIn) ||
      (payload.check_out && !checkOut) ||
      (checkIn && checkOut && toMinutes(checkOut) <= toMinutes(checkIn))
    )
      throw attendanceError("Giờ giải trình không hợp lệ", 400);

    const approved = {
      ...explanation,
      status: "APPROVED",
      check_in: checkIn,
      check_out: checkOut,
      approved_by: Number(user.employee_id),
      approved_at: new Date().toISOString(),
      reject_reason: null,
    };
    await connection.query(
      "UPDATE attendances SET check_in = ?, check_out = ?, note = ? WHERE id = ?",
      [checkIn, checkOut, buildExplanationNote(approved), log.id],
    );
    await recalculateDailyAttendance(connection, log.employee_id, workDate);
    if ([0, 0.5, 1].includes(Number(payload.work_unit))) {
      await connection.query(
        "UPDATE attendances SET base_workday = ?, total_workday = ? WHERE id = ?",
        [Number(payload.work_unit), Number(payload.work_unit), log.id],
      );
    }
    await recalculateEmployeeMonth(
      connection,
      log.employee_id,
      workDate.slice(0, 7),
    );

    await connection.commit();
    return { id: log.id, explanation: approved };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const rejectExplanation = async (user, explanationId, payload = {}) => {
  const rejectReason = String(
    payload.reject_reason ?? payload.reason ?? "",
  ).trim();
  if (!rejectReason)
    throw attendanceError("Vui lòng nhập lý do từ chối giải trình");
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { log, explanation } = await loadExplanationLog(
      connection,
      explanationId,
    );
    if (explanation.status !== "PENDING")
      throw attendanceError("Giải trình đã được xử lý trước đó", 409);
    await assertCanApprove(connection, user, log.employee_id);
    const workDate = log.work_date_str;
    await assertMonthOpen(connection, log.employee_id, workDate);

    const rejected = {
      ...explanation,
      status: "REJECTED",
      approved_by: Number(user.employee_id),
      approved_at: new Date().toISOString(),
      reject_reason: rejectReason,
    };
    await connection.query(
      "UPDATE attendances SET check_in = ?, check_out = ?, note = ? WHERE id = ?",
      [
        explanation.original?.check_in ?? log.check_in,
        explanation.original?.check_out ?? log.check_out,
        buildExplanationNote(rejected),
        log.id,
      ],
    );
    await recalculateDailyAttendance(connection, log.employee_id, workDate);
    await recalculateEmployeeMonth(
      connection,
      log.employee_id,
      workDate.slice(0, 7),
    );

    await connection.commit();
    return { id: log.id, explanation: rejected };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const cancelExplanation = async (user, explanationId) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { log, explanation } = await loadExplanationLog(
      connection,
      explanationId,
    );
    if (Number(log.employee_id) !== Number(user?.employee_id))
      throw attendanceError("Chỉ được hủy giải trình của chính mình", 403);
    await assertMonthOpen(connection, log.employee_id, log.work_date_str);
    if (explanation.status !== "PENDING")
      throw attendanceError("Chỉ có thể hủy giải trình đang chờ duyệt", 409);
    const cancelled = { ...explanation, status: "CANCELLED" };
    await connection.query(
      "UPDATE attendances SET check_in = ?, check_out = ?, note = ? WHERE id = ?",
      [
        explanation.original?.check_in ?? log.check_in,
        explanation.original?.check_out ?? log.check_out,
        buildExplanationNote(cancelled),
        log.id,
      ],
    );
    await recalculateDailyAttendance(
      connection,
      log.employee_id,
      log.work_date_str,
    );
    await recalculateEmployeeMonth(
      connection,
      log.employee_id,
      log.work_date_str.slice(0, 7),
    );

    await connection.commit();
    return { id: log.id, explanation: cancelled };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};