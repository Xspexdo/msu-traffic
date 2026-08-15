const express = require('express');
const router = express.Router();
const db = require('../database/db');

// GET /api/zones - ดึงรายชื่อจุดยอดนิยมรอบ มมส
router.get('/', (req, res) => {
  try {
    const zones = db.getMSUZones();
    res.json({
      success: true,
      data: zones
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
