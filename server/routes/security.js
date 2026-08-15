const express = require('express');
const router = express.Router();
const { 
  checkIpStatus, 
  getClientIp, 
  adminUnbanIp, 
  adminUnbanAll, 
  getSecurityTelemetry,
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

// POST /api/security/test-burst - ทดสอบส่ง Ping แบบควบคุม
router.post('/test-burst', (req, res) => {
  res.json({
    success: true,
    timestamp: Date.now(),
    message: 'WAF Health Check OK - Request Processed Successfully'
  });
});

// GET /api/security/test-ping - ทดสอบ Ping ทั่วไป
router.get('/test-ping', (req, res) => {
  res.json({
    success: true,
    timestamp: Date.now(),
    message: 'Ping OK - Security Check Passed'
  });
});

module.exports = router;
