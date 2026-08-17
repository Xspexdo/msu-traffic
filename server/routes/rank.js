const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { optionalAuth, requireAuth } = require('../middleware/authMiddleware');

// 1. GET /api/rank/weekly - ดึงตารางอันดับรายสัปดาห์ (Season 1)
router.get('/weekly', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const weeklyData = db.getWeeklyLeaderboard(limit);
    res.json({ success: true, data: weeklyData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. GET /api/rank/all-time - ดึงตารางอันดับตลอดกาล (All-Time Hall of Fame)
router.get('/all-time', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const allTimeList = db.getAllTimeLeaderboard(limit);
    res.json({ success: true, data: allTimeList });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. GET /api/rank/my-stats - ดึงสถิติส่วนบุคคลของผู้ใช้ปัจจุบัน (Trust Score + Rank)
router.get('/my-stats', optionalAuth, (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.json({
        success: true,
        authenticated: false,
        stats: null
      });
    }

    const fullUser = db.getOrCreateUser(req.user);
    res.json({
      success: true,
      authenticated: true,
      user: fullUser
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. GET /api/rank/tiers - ดึงระดับยศทั้งหมด (Rank Tiers Config)
router.get('/tiers', (req, res) => {
  try {
    const tiers = db.getRankTiers();
    res.json({ success: true, data: tiers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. POST /api/rank/tiers - อัปเดตการตั้งค่าระดับยศ (เฉพาะ Dev)
router.post('/tiers', requireAuth, (req, res) => {
  try {
    const userEmail = (req.user.email || '').toLowerCase().trim();
    const isDev = req.user.isDev === true || userEmail === 'java5263@gmail.com';
    if (!isDev) {
      return res.status(403).json({ success: false, error: 'เฉพาะ Developer เท่านั้นที่สามารถปรับค่าระดับยศได้' });
    }

    const { tiers } = req.body;
    if (!Array.isArray(tiers) || tiers.length === 0) {
      return res.status(400).json({ success: false, error: 'กรุณาส่งรายการระดับยศที่ถูกต้อง' });
    }

    const updated = db.saveRankTiers(tiers, req.user.id);
    res.json({
      success: true,
      message: 'บันทึกการตั้งค่าระดับยศ และซิงค์ขึ้น Google Sheets สำเร็จแล้ว',
      data: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

