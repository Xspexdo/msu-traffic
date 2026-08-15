const express = require('express');
const router = express.Router();
const db = require('../database/db');

// GET /api/rank/leaderboard - ดึงตารางอันดับผู้รายงานยอดเยี่ยม (Top Contributors)
router.get('/leaderboard', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || 10, 10);
    const leaderboard = db.getLeaderboard(limit);

    res.json({
      success: true,
      data: leaderboard,
      totalRanked: leaderboard.length
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/rank/tiers - ดึงข้อมูลลำดับยศและเกณฑ์คะแนนทั้งหมด
router.get('/tiers', (req, res) => {
  try {
    const tiers = db.getRankTiers();
    res.json({
      success: true,
      data: tiers
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/rank/me - ดึงข้อมูลคะแนนและยศของตนเอง
router.get('/me', (req, res) => {
  try {
    const userHeader = req.headers['x-user-data'];
    let user = null;

    if (userHeader) {
      try {
        user = JSON.parse(decodeURIComponent(userHeader));
      } catch (e) {
        try { user = JSON.parse(userHeader); } catch (err) {}
      }
    }

    if (!user || !user.id) {
      return res.status(401).json({
        success: false,
        error: 'AUTH_REQUIRED',
        message: 'กรุณาเข้าสู่ระบบเพื่อดูข้อมูลยศของตนเอง'
      });
    }

    const stats = db.getUserStats(user.id, user);
    res.json({
      success: true,
      data: stats
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/rank/user/:id - ดูข้อมูลยศและสถิติของผู้ใช้ตาม ID
router.get('/user/:id', (req, res) => {
  try {
    const stats = db.getUserStats(req.params.id);
    if (!stats) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลผู้ใช้นี้' });
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
