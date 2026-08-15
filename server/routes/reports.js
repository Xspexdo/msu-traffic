const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireAuth } = require('../middleware/authMiddleware');

module.exports = function(io) {
  // GET /api/reports - ดึงรายงานทั้งหมด (เข้าดูได้โดยไม่ต้อง Login)
  router.get('/', (req, res) => {
    try {
      const { zone, type, status, search } = req.query;
      const reports = db.getReports({ zone, type, status, search });
      res.json({
        success: true,
        data: reports,
        count: reports.length
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/reports/stats - ดึงสถิติด่านวันนี้ (เข้าดูได้โดยไม่ต้อง Login)
  router.get('/stats', (req, res) => {
    try {
      const stats = db.getStatistics();
      res.json({
        success: true,
        data: stats
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/reports/:id - ดูรายงานเดี่ยว
  router.get('/:id', (req, res) => {
    try {
      const report = db.getReportById(req.params.id);
      if (!report) {
        return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลรายงานนี้' });
      }
      res.json({ success: true, data: report });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/reports - สร้างรายงานด่านใหม่ (ต้อง LOGIN)
  router.post('/', requireAuth, (req, res) => {
    try {
      const { locationName, customLocation, campusZone, lat, lng, type, direction, description, severity, imageUrl } = req.body;

      if (!type) {
        return res.status(400).json({ success: false, error: 'กรุณาระบุประเภทด่านหรือเหตุการณ์' });
      }

      if (!lat || !lng) {
        return res.status(400).json({ success: false, error: 'กรุณาระบุพิกัดสถานที่' });
      }

      const isAnonymous = req.body.isAnonymous === true;
      const userEmail = (req.user.email || '').toLowerCase().trim();
      const isDev = req.user.isDev === true || userEmail === 'java5263@gmail.com';
      const isMsu = userEmail.endsWith('@msu.ac.th');

      let userBadge = '👤 Member';
      if (isDev) {
        userBadge = '👑 DEV';
      } else if (isMsu) {
        userBadge = '🎓 MSU';
      }

      const reportData = {
        title: req.body.title || null,
        locationName: locationName || customLocation || 'จุดตรวจรอบ มมส',
        customLocation: customLocation || '',
        campusZone: campusZone || 'มอใหม่ (ขามเรียง)',
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        type,
        direction: direction || 'ไม่ระบุฝั่งทาง',
        description: description || '',
        severity: isDev ? 'high' : (severity || 'medium'),
        imageUrl: imageUrl || null,
        isAnonymous: isAnonymous,
        reporter: {
          id: req.user.id,
          name: isAnonymous ? 'นิสิตนิรนาม' : req.user.name,
          email: isAnonymous ? '' : req.user.email,
          picture: isAnonymous ? 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60' : req.user.picture,
          isDev: isDev,
          isMsuStudent: isMsu,
          isAnonymous: isAnonymous,
          badge: userBadge,
          role: isDev ? 'dev' : (isMsu ? 'student' : 'member')
        }
      };

      const newReport = db.addReport(reportData);

      // Real-time broadcast ผ่าน WebSocket
      if (io) {
        io.emit('new_report', newReport);
        io.emit('stats_update', db.getStatistics());
        io.emit('leaderboard_update', db.getLeaderboard(10));
      }

      res.status(201).json({
        success: true,
        message: 'รายงานจุดตรวจ/สภาพจราจรสำเร็จแล้ว (+15 EXP 🎖️)',
        data: newReport
      });
    } catch (err) {
      console.error('Error creating report:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/reports/:id/vote - โหวตยืนยันด่าน (ต้อง LOGIN)
  router.post('/:id/vote', requireAuth, (req, res) => {
    try {
      const { voteType } = req.body;
      if (!voteType || !['up', 'down'].includes(voteType)) {
        return res.status(400).json({ success: false, error: 'กรุณาระบุประเภทการโหวต up หรือ down' });
      }

      const voteResult = db.voteReport(req.params.id, req.user.id, voteType, req.user);
      if (!voteResult || !voteResult.report) {
        return res.status(404).json({ success: false, error: 'ไม่พบรายงานที่ต้องการโหวต' });
      }

      const { report: updatedReport, rankReward } = voteResult;

      if (io) {
        io.emit('report_updated', updatedReport);
        io.emit('stats_update', db.getStatistics());
        if (rankReward) {
          io.emit('rank_update', {
            reportId: req.params.id,
            authorId: updatedReport.reporter?.id,
            voterId: req.user.id,
            rankReward
          });
          io.emit('leaderboard_update', db.getLeaderboard(10));
        }
      }

      res.json({
        success: true,
        message: voteType === 'up' ? 'ยืนยันว่ายังมีด่านอยู่สำเร็จ (+2 EXP ให้คุณ, +10 EXP ให้ผู้รายงาน 🎖️)' : 'แจ้งว่ายกด่านแล้วสำเร็จ',
        data: updatedReport,
        rankReward
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/reports/:id/clear - แจ้งยกด่านทันที (ผู้ใช้ หรือ Dev)
  router.post('/:id/clear', requireAuth, (req, res) => {
    try {
      const clearedReport = db.clearReport(req.params.id, req.user.id);
      if (!clearedReport) {
        return res.status(404).json({ success: false, error: 'ไม่พบรายงาน' });
      }

      if (io) {
        io.emit('report_updated', clearedReport);
        io.emit('stats_update', db.getStatistics());
      }

      res.json({
        success: true,
        message: 'แจ้งยกด่านเรียบร้อยแล้ว',
        data: clearedReport
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PUT /api/reports/:id/location - Dev หรือเจ้าของ ลากย้ายตำแหน่งหมุดด่านบนแผนที่
  router.put('/:id/location', requireAuth, (req, res) => {
    try {
      const { lat, lng, locationName } = req.body;
      const report = db.getReportById(req.params.id);
      if (!report) {
        return res.status(404).json({ success: false, error: 'ไม่พบรายงานด่านนี้' });
      }

      // Check if user is Dev or author
      const isAuthor = (report.reporter?.id === req.user.id || report.reporter?.email === req.user.email);
      const isDev = req.user.isDev || (req.user.email === 'java5263@gmail.com');

      if (!isDev && !isAuthor) {
        return res.status(403).json({ success: false, error: 'เฉพาะ Developer หรือเจ้าของโพสต์เท่านั้นที่สามารถย้ายหมุดนี้ได้' });
      }

      if (!lat || !lng) {
        return res.status(400).json({ success: false, error: 'กรุณาระบุพิกัด lat, lng ให้ถูกต้อง' });
      }

      const updated = db.updateReportLocation(req.params.id, lat, lng, locationName);
      if (updated) {
        if (io) {
          io.emit('report_updated', updated);
        }
        res.json({
          success: true,
          message: '👑 ย้ายตำแหน่งหมุดด่านเรียบร้อยแล้ว',
          data: updated
        });
      } else {
        res.status(400).json({ success: false, error: 'ไม่สามารถอัปเดตตำแหน่งได้' });
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/reports/:id - ลบรายงานด่าน (สิทธิ์ Dev หรือ เจ้าของโพสต์)
  router.delete('/:id', requireAuth, (req, res) => {
    try {
      const report = db.getReportById(req.params.id);
      if (!report) {
        return res.status(404).json({ success: false, error: 'ไม่พบรายงาน' });
      }

      // Check if user is Dev or author
      const isAuthor = (report.reporter?.id === req.user.id || report.reporter?.email === req.user.email);
      const isDev = req.user.isDev || (req.user.email === 'java5263@gmail.com');

      if (!isDev && !isAuthor) {
        return res.status(403).json({ success: false, error: 'คุณไม่มีสิทธิ์ลบรายงานนี้ (เฉพาะ Dev หรือเจ้าของโพสต์)' });
      }

      const deleted = db.deleteReport(req.params.id);
      if (deleted) {
        if (io) {
          io.emit('report_deleted', { id: req.params.id });
          io.emit('stats_update', db.getStatistics());
        }
        res.json({
          success: true,
          message: 'ลบรายงานด่านสำเร็จแล้ว'
        });
      } else {
        res.status(400).json({ success: false, error: 'ไม่สามารถลบข้อมูลได้' });
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
