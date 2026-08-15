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

module.exports = router;
