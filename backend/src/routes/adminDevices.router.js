import express from "express";
import { db } from "../config/database.js";
import {
  normalizeClientIp,
  generateDeviceToken,
  hashDeviceToken,
  DEVICE_COOKIE_NAME,
  DEVICE_COOKIE_OPTIONS,
  sanitizeIpList,
  toBoolean,
} from "../utils/deviceSecurity.js";
import { requireRole, verifyToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.use(verifyToken, requireRole("SUPER_ADMIN"));

const DEVICE_COLUMNS = `
  id, device_name, allow_attendance, allow_face_enroll, is_active,
  mac_note, user_agent, approved_by, last_used_at, last_ip, note,
  created_at, updated_at
`;

const parseDeviceId = (rawId) => {
  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const getCurrentDeviceHash = (req) => {
  const rawToken = req.cookies?.[DEVICE_COOKIE_NAME];
  return rawToken ? hashDeviceToken(rawToken) : null;
};

const readSettings = async () => {
  const [rows] = await db.query(
    `SELECT id, require_device_check, require_ip_check, allowed_ips, updated_by, updated_at
       FROM attendance_security_settings
      WHERE id = 1
      LIMIT 1`,
  );
  return (
    rows[0] || {
      id: 1,
      require_device_check: 1,
      require_ip_check: 0,
      allowed_ips: "[]",
      updated_by: null,
      updated_at: null,
    }
  );
};

const formatSettings = (row) => ({
  require_device_check: Number(row.require_device_check) === 1,
  require_ip_check: Number(row.require_ip_check) === 1,
  allowed_ips: JSON.parse(
    typeof row.allowed_ips === "string" ? row.allowed_ips : JSON.stringify(row.allowed_ips || []),
  ),
  updated_by: row.updated_by || null,
  updated_at: row.updated_at || null,
});

const hasDeviceHistory = async (id) => {
  const checks = [
    "SELECT 1 FROM attendance_logs WHERE device_id = ? LIMIT 1",
    "SELECT 1 FROM employees WHERE device_id = ? LIMIT 1",
  ];
  for (const sql of checks) {
    try {
      const [rows] = await db.query(sql, [id]);
      if (rows.length) return true;
    } catch (error) {
      console.error("Không thể kiểm tra lịch sử thiết bị:", error.message);
    }
  }
  return false;
};

router.get("/devices", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT device_token_hash, ${DEVICE_COLUMNS}
         FROM allowed_devices
        ORDER BY id DESC`,
    );
    const currentHash = getCurrentDeviceHash(req);
    const devices = rows.map((row) => {
      const { device_token_hash: hash, ...device } = row;
      return {
        ...device,
        allow_attendance: Number(device.allow_attendance) === 1,
        allow_face_enroll: Number(device.allow_face_enroll) === 1,
        is_active: Number(device.is_active) === 1,
        is_current_device: Boolean(currentHash && hash === currentHash),
      };
    });
    const settings = formatSettings(await readSettings());
    return res.json({
      success: true,
      data: {
        devices,
        settings,
        current_ip: normalizeClientIp(req),
      },
    });
  } catch (error) {
    console.error("Lỗi tải danh sách thiết bị:", error);
    return res.status(500).json({ success: false, message: "Không thể tải danh sách thiết bị" });
  }
});

router.post("/devices/approve-current", async (req, res) => {
  try {
    const deviceName = String(req.body?.device_name || "").trim();
    if (!deviceName || deviceName.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Tên máy phải có từ 1 đến 100 ký tự.",
      });
    }

    const rawToken = generateDeviceToken();
    const tokenHash = hashDeviceToken(rawToken);
    const currentHash = getCurrentDeviceHash(req);
    const values = {
      device_name: deviceName,
      device_token_hash: tokenHash,
      allow_attendance: toBoolean(req.body?.allow_attendance, true) ? 1 : 0,
      allow_face_enroll: toBoolean(req.body?.allow_face_enroll, false) ? 1 : 0,
      is_active: 1,
      mac_note: req.body?.mac_note ? String(req.body.mac_note).trim().slice(0, 32) : null,
      user_agent: String(req.headers["user-agent"] || "").slice(0, 255) || null,
      approved_by: parseDeviceId(req.user?.user_id),
      last_ip: normalizeClientIp(req),
      note: req.body?.note ? String(req.body.note).trim().slice(0, 255) : null,
    };

    const [existing] = currentHash
      ? await db.query(
          "SELECT id FROM allowed_devices WHERE device_token_hash = ? LIMIT 1",
          [currentHash],
        )
      : [[]];
    const currentDeviceId = existing[0]?.id || null;

    let deviceId = currentDeviceId;
    if (currentDeviceId) {
      await db.query(
        `UPDATE allowed_devices
            SET device_name = ?, device_token_hash = ?, allow_attendance = ?,
                allow_face_enroll = ?, is_active = 1, mac_note = ?, user_agent = ?,
                approved_by = ?, last_ip = ?, last_used_at = NOW(), note = ?
          WHERE id = ?`,
        [
          values.device_name,
          values.device_token_hash,
          values.allow_attendance,
          values.allow_face_enroll,
          values.mac_note,
          values.user_agent,
          values.approved_by,
          values.last_ip,
          values.note,
          currentDeviceId,
        ],
      );
    } else {
      const [result] = await db.query(
        `INSERT INTO allowed_devices
           (device_name, device_token_hash, allow_attendance, allow_face_enroll,
            is_active, mac_note, user_agent, approved_by, last_ip, last_used_at, note)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, NOW(), ?)`,
        [
          values.device_name,
          values.device_token_hash,
          values.allow_attendance,
          values.allow_face_enroll,
          values.mac_note,
          values.user_agent,
          values.approved_by,
          values.last_ip,
          values.note,
        ],
      );
      deviceId = result.insertId;
    }

    res.cookie(DEVICE_COOKIE_NAME, rawToken, DEVICE_COOKIE_OPTIONS);

    const [rows] = await db.query(
      `SELECT ${DEVICE_COLUMNS} FROM allowed_devices WHERE id = ? LIMIT 1`,
      [deviceId],
    );
    const device = rows[0]
      ? {
          ...rows[0],
          allow_attendance: Number(rows[0].allow_attendance) === 1,
          allow_face_enroll: Number(rows[0].allow_face_enroll) === 1,
          is_active: Number(rows[0].is_active) === 1,
          is_current_device: true,
        }
      : null;

    return res.json({
      success: true,
      message: currentDeviceId
        ? "Đã cập nhật quyền và xoay vòng token cho thiết bị hiện tại."
        : "Đã cấp phép cho thiết bị hiện tại.",
      data: { device, current_ip: values.last_ip },
    });
  } catch (error) {
    console.error("Lỗi cấp phép thiết bị:", error);
    return res.status(500).json({ success: false, message: "Không thể cấp phép thiết bị" });
  }
});

router.patch("/devices/:id", async (req, res) => {
  try {
    const id = parseDeviceId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: "Mã thiết bị không hợp lệ." });
    }

    const updates = [];
    const params = [];
    if (req.body?.device_name !== undefined) {
      const name = String(req.body.device_name).trim();
      if (!name || name.length > 100) {
        return res.status(400).json({ success: false, message: "Tên máy phải có từ 1 đến 100 ký tự." });
      }
      updates.push("device_name = ?");
      params.push(name);
    }
    for (const key of ["allow_attendance", "allow_face_enroll", "is_active"]) {
      if (req.body?.[key] !== undefined) {
        updates.push(`${key} = ?`);
        params.push(toBoolean(req.body[key]) ? 1 : 0);
      }
    }
    for (const [key, maxLength] of [["mac_note", 32], ["note", 255]]) {
      if (req.body?.[key] !== undefined) {
        const text = String(req.body[key] || "").trim().slice(0, maxLength);
        updates.push(`${key} = ?`);
        params.push(text || null);
      }
    }
    if (!updates.length) {
      return res.status(400).json({ success: false, message: "Không có thông tin nào để cập nhật." });
    }

    const [result] = await db.query(
      `UPDATE allowed_devices SET ${updates.join(", ")} WHERE id = ?`,
      [...params, id],
    );
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: "Không tìm thấy thiết bị." });
    }
    return res.json({ success: true, message: "Đã cập nhật thiết bị." });
  } catch (error) {
    console.error("Lỗi cập nhật thiết bị:", error);
    return res.status(500).json({ success: false, message: "Không thể cập nhật thiết bị" });
  }
});

router.delete("/devices/:id", async (req, res) => {
  try {
    const id = parseDeviceId(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: "Mã thiết bị không hợp lệ." });
    }
    const hasHistory = await hasDeviceHistory(id);
    if (hasHistory) {
      await db.query(
        "UPDATE allowed_devices SET is_active = 0, device_token_hash = ? WHERE id = ?",
        [hashDeviceToken(generateDeviceToken()), id],
      );
      return res.json({
        success: true,
        message: "Thiết bị đã phát sinh lịch sử nên đã được khóa và thu hồi token thay vì xóa.",
      });
    }
    await db.query("DELETE FROM allowed_devices WHERE id = ?", [id]);
    return res.json({ success: true, message: "Đã xóa thiết bị." });
  } catch (error) {
    console.error("Lỗi thu hồi thiết bị:", error);
    return res.status(500).json({ success: false, message: "Không thể thu hồi thiết bị" });
  }
});

router.get("/security-settings/current-ip", (req, res) => {
  return res.json({ success: true, data: { current_ip: normalizeClientIp(req) } });
});

router.put("/security-settings", async (req, res) => {
  try {
    const sanitized = sanitizeIpList(req.body?.allowed_ips);
    if (!sanitized) {
      return res.status(400).json({
        success: false,
        message: "allowed_ips phải là một mảng địa chỉ IP.",
      });
    }
    if (sanitized.error) {
      return res.status(400).json({ success: false, message: sanitized.error });
    }

    const requireDeviceCheck = toBoolean(req.body?.require_device_check, true) ? 1 : 0;
    const requireIpCheck = toBoolean(req.body?.require_ip_check, false) ? 1 : 0;
    if (requireIpCheck && !sanitized.ips.length) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng thêm ít nhất 1 IP trước khi bật bắt buộc đúng IP văn phòng.",
      });
    }

    await db.query(
      `UPDATE attendance_security_settings
          SET require_device_check = ?, require_ip_check = ?, allowed_ips = ?, updated_by = ?
        WHERE id = 1`,
      [
        requireDeviceCheck,
        requireIpCheck,
        JSON.stringify(sanitized.ips),
        parseDeviceId(req.user?.user_id),
      ],
    );
    const settings = formatSettings(await readSettings());
    return res.json({ success: true, message: "Đã lưu cấu hình bảo mật.", data: settings });
  } catch (error) {
    console.error("Lỗi lưu cấu hình bảo mật:", error);
    return res.status(500).json({ success: false, message: "Không thể lưu cấu hình bảo mật" });
  }
});

export default router;
