const express = require('express');
const router = express.Router();
const { 
  checkIpStatus, 
  getClientIp, 
  adminUnbanIp, 
  adminUnbanAll, 
  getSecurityTelemetry,
  detectVpnOrProxy,
  isVerifiedAdminOrDev,
  ADMIN_MASTER_KEY,
  CONFIG 
} = require('../middleware/rateLimiter');

// GET /api/security/status - ตรวจสอบสถานะความปลอดภัยและการเชื่อมต่อของ Client
router.get('/status', (req, res) => {
  const ip = getClientIp(req);
  const status = checkIpStatus(ip);

  res.json({
    success: true,
    client: {
      ip: ip,
      banned: status.banned,
      bannedUntil: status.bannedUntil || null,
      remainingSeconds: status.remainingSeconds || 0,
      reason: status.reason || null,
      rayId: status.rayId,
      quotaRemaining: status.quotaRemaining
    },
    waf: {
      status: 'ACTIVE',
      engine: 'Sliding Window Token Bucket (Multi-Tier)',
      securityLevel: 'ENTERPRISE_HIGH',
      tiers: {
        readBrowsing: `${CONFIG.TIER_READ.MAX_REQUESTS} req/min (Burst: ${CONFIG.TIER_READ.BURST_LIMIT} reqs/3s)`,
        writeMutation: `${CONFIG.TIER_WRITE.MAX_REQUESTS} writes/min (Burst: ${CONFIG.TIER_WRITE.BURST_LIMIT} writes/5s)`,
        antiFlood: `Max ${CONFIG.ANTI_FLOOD.SPIKE_THRESHOLD} req/s`
      }
    }
  });
});

// GET /api/security/vpn-check - ตรวจสอบว่า Client มุด VPN หรือใช้ Proxy หรือไม่
router.get('/vpn-check', (req, res) => {
  const ip = getClientIp(req);
  const isDev = isVerifiedAdminOrDev(req);
  const vpnStatus = detectVpnOrProxy(req);

  res.json({
    success: true,
    ip: ip,
    isDev: isDev,
    isVpn: !isDev && vpnStatus.isVpn,
    reason: vpnStatus.reason || null,
    blocked: !isDev && vpnStatus.isVpn,
    timestamp: new Date().toISOString()
  });
});

// POST /api/security/verify-gps - ตรวจสอบความถูกต้องของพิกัด GPS จริง (Anti-Mock Location)
router.post('/verify-gps', (req, res) => {
  const { lat, lng, accuracy, timezone, timezoneOffset } = req.body;
  const isDev = isVerifiedAdminOrDev(req);

  if (lat === undefined || lng === undefined) {
    return res.status(400).json({
      success: false,
      error: 'GPS_COORDINATES_REQUIRED',
      message: 'กรุณาส่งพิกัด Latitude และ Longitude'
    });
  }

  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);

  // 1. Check Range Validity
  if (isNaN(latitude) || isNaN(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_COORDINATES',
      message: 'พิกัด GPS ไม่ถูกต้องตามหลักสากล'
    });
  }

  // 2. Check Thailand / Regional Bounding Box (Lat: 5.0 - 21.0, Lng: 97.0 - 106.0)
  const isWithinThailand = (latitude >= 5.0 && latitude <= 21.0 && longitude >= 97.0 && longitude <= 106.0);

  // 3. Check Distance to MSU
  const MSU_KHAMRIANG = { lat: 16.2468, lng: 103.2520 };
  const MSU_DOWNTOWN = { lat: 16.1983, lng: 103.2798 };

  const R = 6371; // km
  function dist(lat1, lon1, lat2, lon2) {
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
    return Math.round((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))) * 10) / 10;
  }

  const distKhamriang = dist(latitude, longitude, MSU_KHAMRIANG.lat, MSU_KHAMRIANG.lng);
  const distDowntown = dist(latitude, longitude, MSU_DOWNTOWN.lat, MSU_DOWNTOWN.lng);
  const minMsuDist = Math.min(distKhamriang, distDowntown);

  res.json({
    success: true,
    valid: true,
    isDev,
    coordinates: { lat: latitude, lng: longitude },
    accuracy: accuracy || null,
    isWithinThailand,
    inMsuZone: minMsuDist <= 25.0,
    distanceKm: minMsuDist,
    nearCampus: distKhamriang <= distDowntown ? 'มอใหม่ (ขามเรียง)' : 'มอเก่า (ในเมือง)',
    timestamp: new Date().toISOString()
  });
});

// GET /api/security/telemetry - สถิติความปลอดภัยของ WAF แบบ Real-time
router.get('/telemetry', (req, res) => {
  const telemetryData = getSecurityTelemetry();
  res.json({
    success: true,
    telemetry: telemetryData
  });
});

// POST /api/security/admin/unban - ปลดแบนอย่างปลอดภัยโดยใช้ Admin Security Key
router.post('/admin/unban', (req, res) => {
  const { adminKey, targetIp, unbanAll } = req.body;
  const key = adminKey || req.headers['x-admin-key'];

  if (!key) {
    return res.status(401).json({
      success: false,
      error: 'ADMIN_KEY_REQUIRED',
      message: 'กรุณาระบุ Admin Master Security Key เพื่อปลดการระงับ'
    });
  }

  if (unbanAll === true) {
    const result = adminUnbanAll(key);
    if (!result.success) {
      return res.status(403).json(result);
    }
    return res.json(result);
  }

  const ipToUnban = targetIp || getClientIp(req);
  const result = adminUnbanIp(ipToUnban, key);

  if (!result.success) {
    return res.status(403).json(result);
  }

  res.json(result);
});

// ----------------------------------------------------
// 👑 DEV / ADMIN MODERATION & MANAGEMENT ROUTES
// ----------------------------------------------------
const db = require('../database/db');
const { requireDev, requireAuth } = require('../middleware/authMiddleware');

function checkDevPermission(req) {
  const adminKey = req.headers['x-admin-key'] || req.body?.adminKey;
  if (adminKey && adminKey === ADMIN_MASTER_KEY) return true;

  const rawUser = req.headers['x-user-data'];
  if (rawUser) {
    try {
      const u = JSON.parse(decodeURIComponent(rawUser));
      if (u.isDev || u.email === 'java5263@gmail.com') return true;
    } catch (e) {}
  }
  return false;
}

// 1. POST /api/security/admin/ban-user - แบนผู้ใช้ (แบนจากหมุด หรือ Moderation Queue)
router.post('/admin/ban-user', (req, res) => {
  if (!checkDevPermission(req)) {
    return res.status(403).json({ success: false, error: 'DEV_PERMISSION_REQUIRED', message: 'คุณไม่มีสิทธิ์ Developer ในการแบนผู้ใช้' });
  }

  const { targetUserId, reason } = req.body;
  if (!targetUserId) {
    return res.status(400).json({ success: false, error: 'กรุณาระบุ targetUserId' });
  }

  const result = db.banUser(targetUserId, reason || 'ละเมิดข้อกำหนด/สแปมรายงานเท็จ', 'dev_admin');
  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
});

// 2. POST /api/security/admin/unban-user - ปลดแบนผู้ใช้งาน
router.post('/admin/unban-user', (req, res) => {
  if (!checkDevPermission(req)) {
    return res.status(403).json({ success: false, error: 'DEV_PERMISSION_REQUIRED', message: 'คุณไม่มีสิทธิ์ Developer' });
  }

  const { targetUserId } = req.body;
  if (!targetUserId) {
    return res.status(400).json({ success: false, error: 'กรุณาระบุ targetUserId' });
  }

  const result = db.unbanUser(targetUserId, 'dev_admin');
  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
});

// 3. GET /api/security/admin/banned-users - รายชื่อผู้ใช้ที่ถูกแบน
router.get('/admin/banned-users', (req, res) => {
  if (!checkDevPermission(req)) {
    return res.status(403).json({ success: false, error: 'DEV_PERMISSION_REQUIRED', message: 'คุณไม่มีสิทธิ์ Developer' });
  }

  const banned = db.getBannedUsers();
  res.json({ success: true, count: banned.length, data: banned });
});

// 4. POST /api/security/admin/reset-leaderboard - ล้างอันดับคะแนน (Weekly หรือ Season)
router.post('/admin/reset-leaderboard', (req, res) => {
  if (!checkDevPermission(req)) {
    return res.status(403).json({ success: false, error: 'DEV_PERMISSION_REQUIRED', message: 'คุณไม่มีสิทธิ์ Developer ในการล้างอันดับ' });
  }

  const { mode } = req.body; // 'weekly' หรือ 'all'
  const result = db.resetLeaderboard(mode || 'weekly', 'dev_admin');
  res.json(result);
});

// 4.1 POST /api/security/admin/system-reset - ล้างข้อมูลระบบแบบเลือกติ๊กได้ (1. ยศ 2. แต้ม 3. หมุด 4. แชท)
router.post('/admin/system-reset', (req, res) => {
  if (!checkDevPermission(req)) {
    return res.status(403).json({ success: false, error: 'DEV_PERMISSION_REQUIRED', message: 'คุณไม่มีสิทธิ์ Developer ในการล้างข้อมูลระบบ' });
  }

  const { resetRanks, resetPoints, resetPins, resetChat } = req.body;
  if (!resetRanks && !resetPoints && !resetPins && !resetChat) {
    return res.status(400).json({ success: false, error: 'กรุณาเลือกอย่างน้อย 1 รายการที่ต้องการล้าง' });
  }

  const result = db.resetSystemData({
    resetRanks: resetRanks === true,
    resetPoints: resetPoints === true,
    resetPins: resetPins === true,
    resetChat: resetChat === true
  }, 'dev_admin');

  res.json(result);
});

// 5. GET /api/security/admin/reports-queue - รายการหมุดที่ถูกรีพอร์ต (Moderation Queue)
router.get('/admin/reports-queue', (req, res) => {
  if (!checkDevPermission(req)) {
    return res.status(403).json({ success: false, error: 'DEV_PERMISSION_REQUIRED', message: 'คุณไม่มีสิทธิ์ Developer' });
  }

  const status = req.query.status || 'pending';
  const queue = db.getFlaggedReports(status);
  res.json({ success: true, count: queue.length, data: queue });
});

// 6. POST /api/security/admin/reports-queue/:id/action - จัดการรายการรีพอร์ต
router.post('/admin/reports-queue/:id/action', (req, res) => {
  if (!checkDevPermission(req)) {
    return res.status(403).json({ success: false, error: 'DEV_PERMISSION_REQUIRED', message: 'คุณไม่มีสิทธิ์ Developer' });
  }

  const { action } = req.body; // 'ban_user', 'delete_pin', 'deduct_trust', 'dismiss'
  const flagId = req.params.id;

  const result = db.resolveFlaggedReport(flagId, action, 'dev_admin');
  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
});

// 7. GET /api/security/admin/all-pins - ดึงหมุดทั้งหมดในระบบสำหรับ Dev Table
router.get('/admin/all-pins', (req, res) => {
  if (!checkDevPermission(req)) {
    return res.status(403).json({ success: false, error: 'DEV_PERMISSION_REQUIRED', message: 'คุณไม่มีสิทธิ์ Developer' });
  }

  const pins = db.getAllPinsAdmin();
  res.json({ success: true, count: pins.length, data: pins });
});

// 8. PATCH /api/security/admin/pin-status - อัปเดตสถานะหมุด (Active / Cleared / Hidden)
router.patch('/admin/pin-status', (req, res) => {
  if (!checkDevPermission(req)) {
    return res.status(403).json({ success: false, error: 'DEV_PERMISSION_REQUIRED', message: 'คุณไม่มีสิทธิ์ Developer' });
  }

  const { pinId, status } = req.body;
  if (!pinId || !status) {
    return res.status(400).json({ success: false, error: 'กรุณาระบุ pinId และ status' });
  }

  const validStatuses = ['active', 'cleared', 'hidden', 'deleted'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: 'สถานะไม่ถูกต้อง' });
  }

  const result = db.updatePinStatus(pinId, status, 'dev_admin');
  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
});

// 9. DELETE /api/security/admin/delete-pin/:id - ลบหมุดทันที
router.delete('/admin/delete-pin/:id', (req, res) => {
  if (!checkDevPermission(req)) {
    return res.status(403).json({ success: false, error: 'DEV_PERMISSION_REQUIRED', message: 'คุณไม่มีสิทธิ์ Developer' });
  }

  const pinId = req.params.id;
  const deleted = db.deletePin(pinId, 'dev_admin');
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'ไม่พบหมุดที่ต้องการลบ' });
  }

  res.json({ success: true, message: `ลบหมุด ${pinId} เรียบร้อยแล้ว` });
});

// 10. POST /api/security/admin/adjust-trust - ปรับคะแนน Trust Score
router.post('/admin/adjust-trust', (req, res) => {
  if (!checkDevPermission(req)) {
    return res.status(403).json({ success: false, error: 'DEV_PERMISSION_REQUIRED', message: 'คุณไม่มีสิทธิ์ Developer' });
  }

  const { userId, delta, reason } = req.body;
  if (!userId || delta === undefined) {
    return res.status(400).json({ success: false, error: 'กรุณาระบุ userId และ delta' });
  }

  const newScore = db.updateTrustScore(userId, parseInt(delta, 10), reason || 'ผู้ดูแลปรับคะแนน Trust Score');
  res.json({ success: true, userId, trustScore: newScore });
});

// 11. POST /api/security/admin/test-filter - ทดสอบ Filter คำหยาบแบบ Sandbox
const profanityFilter = require('../services/profanityFilter');
router.post('/admin/test-filter', (req, res) => {
  if (!checkDevPermission(req)) {
    return res.status(403).json({ success: false, error: 'DEV_PERMISSION_REQUIRED', message: 'คุณไม่มีสิทธิ์ Developer' });
  }

  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ success: false, error: 'กรุณาระบุข้อความที่ต้องการทดสอบ' });
  }

  const normalized = profanityFilter.normalizeHomoglyphs(text);
  const deduplicated = profanityFilter.deduplicateStr(text);
  const analysis = profanityFilter.analyzeToxicity(text);
  const censored = profanityFilter.censorProfanity(text);

  res.json({
    success: true,
    input: text,
    normalized,
    deduplicated,
    censored,
    analysis
  });
});

// 12. GET /api/security/admin/audit-logs - ดึงประวัติ Audit Logs
router.get('/admin/audit-logs', (req, res) => {
  if (!checkDevPermission(req)) {
    return res.status(403).json({ success: false, error: 'DEV_PERMISSION_REQUIRED', message: 'คุณไม่มีสิทธิ์ Developer' });
  }

  const limit = parseInt(req.query.limit, 10) || 100;
  const logs = db.getAuditLogs(limit);
  res.json({ success: true, count: logs.length, data: logs });
});

// 13. POST /api/security/admin/chat-rooms/toggle - เปิด/ปิดห้องแชท
router.post('/admin/chat-rooms/toggle', (req, res) => {
  if (!checkDevPermission(req)) {
    return res.status(403).json({ success: false, error: 'DEV_PERMISSION_REQUIRED', message: 'คุณไม่มีสิทธิ์ Developer' });
  }

  const { roomId, enabled } = req.body;
  if (!roomId || enabled === undefined) {
    return res.status(400).json({ success: false, error: 'กรุณาระบุ roomId และ enabled (true/false)' });
  }

  const result = db.updateChatRoomStatus(roomId, enabled === true, 'dev_admin');
  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
});

module.exports = router;

