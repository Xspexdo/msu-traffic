const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireAuth, optionalAuth } = require('../middleware/authMiddleware');
const profanityFilter = require('../services/profanityFilter');

module.exports = function(io) {
  // GET /api/reports - ดึงหมุดทั้งหมด
  router.get('/', (req, res) => {
    try {
      const { zone, type, status, search } = req.query;
      const pins = db.getPins({ zone, type, status, search });
      res.json({
        success: true,
        data: pins,
        count: pins.length
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/reports/stats - ดึงสถิติภาพรวม
  router.get('/stats', (req, res) => {
    try {
      const stats = db.getStatistics();
      res.json({ success: true, data: stats });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/reports/:id - ดูหมุดเดี่ยว
  router.get('/:id', (req, res) => {
    try {
      const pin = db.getPinById(req.params.id);
      if (!pin) {
        return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลรายงานนี้' });
      }
      db.viewPin(pin.id);
      res.json({ success: true, data: pin });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/reports - สร้างหมุดรายงานด่านใหม่
  router.post('/', requireAuth, (req, res) => {
    try {
      // 🚫 Ban Check
      const checkUser = db.getUserById(req.user.id);
      if (checkUser && checkUser.status === 'banned') {
        return res.status(403).json({
          success: false,
          error: 'ACCOUNT_BANNED',
          message: `🚫 บัญชีของคุณถูกระงับการใช้งาน (${checkUser.banReason || 'ละเมิดข้อกำหนด'})`
        });
      }

      const { locationName, customLocation, campusZone, lat, lng, type, direction, description, severity, imageUrl, isAnonymous } = req.body;

      if (!type) {
        return res.status(400).json({ success: false, error: 'กรุณาระบุประเภทด่านหรือเหตุการณ์' });
      }

      if (!lat || !lng) {
        return res.status(400).json({ success: false, error: 'กรุณาระบุพิกัดสถานที่' });
      }

      const isAnon = isAnonymous === true;
      const userEmail = (req.user.email || '').toLowerCase().trim();
      const isDev = req.user.isDev === true || userEmail === 'java5263@gmail.com';
      const isMsu = userEmail.endsWith('@msu.ac.th');

      let cleanCustomLocation = customLocation || '';
      let cleanDescription = description || '';
      let cleanDirection = direction || 'ไม่ระบุฝั่งทาง';

      // 🧠 3-Layer Profanity Check สำหรับข้อความปักหมุด
      const textToCheck = `${cleanCustomLocation} ${cleanDescription} ${cleanDirection}`.trim();
      if (textToCheck) {
        const toxCheck = profanityFilter.analyzeToxicity(textToCheck);
        if (toxCheck.isToxic) {
          if (isDev) {
            // 👑 Dev: เซนเซอร์เป็น ****** อัตโนมัติ
            cleanCustomLocation = profanityFilter.censorProfanity(cleanCustomLocation);
            cleanDescription = profanityFilter.censorProfanity(cleanDescription);
            cleanDirection = profanityFilter.censorProfanity(cleanDirection);
            db.logAudit('DEV_PIN_PROFANITY_CENSORED', req.user.id, 'pin_submit', `Dev ปักหมุดที่มีคำหยาบ (เซนเซอร์เป็น: ${cleanDescription})`);
          } else {
            // 👤 สมาชิกทั่วไป: บล็อกและลดคะแนน Trust
            db.updateTrustScore(req.user.id, -10, `ตรวจพบคำหยาบในการรายงานด่าน: ${toxCheck.reason}`);
            db.logAudit('PIN_PROFANITY_BLOCKED', req.user.id, 'pin_submit', `บล็อกโพสต์ด่าน: ${textToCheck} (${toxCheck.reason})`);
            return res.status(400).json({
              success: false,
              error: `🚫 ไม่สามารถโพสต์ได้เนื่องจาก: ${toxCheck.reason}`
            });
          }
        }
      }

      const isAnnouncementPost = (type === 'announcement' || req.body.isAnnouncement === true) && isDev;

      // 🚫 ป้องกันผู้ใช้ทั่วไปแอบส่ง type announcement หรือ isAnnouncement
      if ((type === 'announcement' || req.body.isAnnouncement === true) && !isDev) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'สิทธิ์การปักหมุดประกาศทางการสงวนไว้สำหรับ Admin / Dev เท่านั้น'
        });
      }

      let userBadge = '👤 Member';
      if (isDev) userBadge = '👑 DEV';
      else if (isMsu) userBadge = '🎓 MSU';

      const announcementTitle = req.body.title || locationName || customLocation || '📢 ประกาศทางการจาก MSU Traffic';

      const newPin = db.addPin({
        title: isAnnouncementPost ? announcementTitle : (req.body.title || null),
        locationName: locationName || customLocation || (isAnnouncementPost ? 'ประกาศทางการ' : 'จุดตรวจรอบ มมส'),
        customLocation: customLocation || '',
        campusZone: campusZone || 'มอใหม่ (ขามเรียง)',
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        type: type,
        direction: direction || '',
        description: description || '',
        severity: isDev ? 'high' : (severity || 'medium'),
        lifespanHours: req.body.lifespanHours || (isAnnouncementPost ? 24 : null),
        imageUrl: imageUrl || null,
        isAnonymous: isAnnouncementPost ? false : isAnon,
        isAnnouncement: isAnnouncementPost,
        reporterId: req.user.id,
        reporter: {
          id: req.user.id,
          name: isAnnouncementPost ? 'MSU Traffic' : (isAnon ? 'นิสิตนิรนาม' : req.user.name),
          email: isAnon ? '' : req.user.email,
          picture: isAnnouncementPost
            ? 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=120&auto=format&fit=crop&q=80' 
            : (isAnon ? 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60' : req.user.picture),
          isDev: isDev,
          isMsuStudent: isMsu,
          isAnonymous: isAnnouncementPost ? false : isAnon,
          isAnnouncement: isAnnouncementPost,
          badge: isAnnouncementPost ? '📢 MSU Traffic' : userBadge,
          role: isDev ? 'dev' : (isMsu ? 'student' : 'member')
        }
      });

      if (io) {
        io.emit('new_report', newPin);
        io.emit('stats_update', db.getStatistics());
        io.emit('leaderboard_update', db.getWeeklyLeaderboard(10));
      }

      res.status(201).json({
        success: true,
        message: 'รายงานจุดตรวจสำเร็จแล้ว (+15 EXP 🎖️)',
        data: newPin
      });
    } catch (err) {
      console.error('Error creating pin:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/reports/:id/vote - โหวตยืนยันสถานะด่าน (👍 / 🚀)
  router.post('/:id/vote', requireAuth, (req, res) => {
    try {
      const { voteType } = req.body;
      if (!['up', 'down'].includes(voteType)) {
        return res.status(400).json({ success: false, error: 'ประเภทโหวตไม่ถูกต้อง' });
      }

      const updated = db.votePin(req.params.id, req.user.id, voteType);
      if (!updated) {
        return res.status(404).json({ success: false, error: 'ไม่พบหมุดนี้' });
      }

      if (io) {
        io.emit('report_updated', updated);
        io.emit('stats_update', db.getStatistics());
      }

      res.json({
        success: true,
        message: voteType === 'up' ? 'โหวตยืนยันว่ายังมีด่าน (+2 EXP)' : 'โหวตยืนยันว่ายกด่านแล้ว (+2 EXP)',
        data: updated
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/reports/:id/like - กดไลก์หมุด
  router.post('/:id/like', requireAuth, (req, res) => {
    try {
      const result = db.likePin(req.params.id, req.user.id);
      if (!result) {
        return res.status(404).json({ success: false, error: 'ไม่พบหมุดนี้' });
      }

      if (io) {
        io.emit('report_updated', result.pin);
      }

      res.json({
        success: true,
        liked: result.liked,
        totalLikes: result.totalLikes,
        data: result.pin
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/reports/:id/report - รีพอร์ตหมุดด้วยระบบ Weighted Anti-Abuse
  router.post('/:id/report', requireAuth, (req, res) => {
    try {
      const { reason, details } = req.body;
      if (!reason) {
        return res.status(400).json({ success: false, error: 'กรุณาระบุเหตุผลในการรายงาน' });
      }

      const result = db.reportPin(req.params.id, req.user, reason, details);
      if (!result.success) {
        return res.status(404).json(result);
      }

      if (io && result.pin.status === 'under_review') {
        io.emit('report_updated', result.pin);
      }

      res.json({
        success: true,
        message: 'ส่งรายงานเพื่อตรวจสอบเรียบร้อยแล้ว ขอบคุณที่ช่วยดูแลความถูกต้องของข้อมูล',
        data: result.pin
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/reports/:id - ลบหมุดรายงาน (เจ้าของโพสต์ หรือ Dev)
  router.delete('/:id', requireAuth, (req, res) => {
    try {
      const pin = db.getPinById(req.params.id);
      if (!pin) {
        return res.status(404).json({ success: false, error: 'ไม่พบหมุดนี้' });
      }

      const isDev = req.user.isDev === true || req.user.email === 'java5263@gmail.com';
      const isAuthor = req.user.id === pin.reporterId || req.user.email === pin.reporter?.email;

      if (!isDev && !isAuthor) {
        return res.status(403).json({ success: false, error: 'คุณไม่มีสิทธิ์ลบหมุดของผู้อื่น' });
      }

      const result = db.updatePinStatus(req.params.id, 'deleted', req.user.id);

      if (io) {
        io.emit('report_deleted', req.params.id);
        io.emit('stats_update', db.getStatistics());
      }

      res.json({
        success: true,
        message: 'ลบหมุดรายงานสำเร็จแล้ว',
        data: result
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PUT /api/reports/:id/location - ย้ายพิกัดหมุด (เจ้าของโพสต์ หรือ Dev)
  router.put('/:id/location', requireAuth, (req, res) => {
    try {
      const { lat, lng, locationName } = req.body;
      const pin = db.getPinById(req.params.id);

      if (!pin) {
        return res.status(404).json({ success: false, error: 'ไม่พบหมุดนี้' });
      }

      const isDev = req.user.isDev === true || req.user.email === 'java5263@gmail.com';
      const isAuthor = req.user.id === pin.reporterId || req.user.email === pin.reporter?.email;

      if (!isDev && !isAuthor) {
        return res.status(403).json({ success: false, error: 'คุณไม่มีสิทธิ์แก้ไขพิกัดหมุดของผู้อื่น' });
      }

      const updateResult = db.updatePinLocation(req.params.id, parseFloat(lat), parseFloat(lng), locationName, isDev);

      if (!updateResult.success) {
        return res.status(400).json(updateResult);
      }

      if (io) {
        io.emit('report_updated', updateResult.pin);
      }

      res.json({
        success: true,
        message: isDev
          ? '👑 DEV: อัปเดตพิกัดหมุดสำเร็จ (ไม่จำกัดจำนวนครั้ง)'
          : `📍 อัปเดตพิกัดสำเร็จ (ย้ายไปแล้ว ${updateResult.moveCount}/3 ครั้ง เหลืออีก ${updateResult.remainingMoves} ครั้ง)`,
        data: updateResult.pin,
        moveCount: updateResult.moveCount,
        remainingMoves: updateResult.remainingMoves
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ----------------------------------------------------
  // 📍 PIN LIVE CHAT ROOM ROUTES
  // ----------------------------------------------------

  // GET /api/reports/:id/chat - ดึงประวัติแชทของหมุดนี้
  router.get('/:id/chat', (req, res) => {
    try {
      const pin = db.getPinById(req.params.id);
      if (!pin) {
        return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลหมุดรายงานนี้' });
      }

      const messages = db.getPinChatMessages(req.params.id, 60);
      res.json({
        success: true,
        data: messages,
        pin: {
          id: pin.id,
          locationName: pin.locationName,
          campusZone: pin.campusZone,
          type: pin.type,
          status: pin.status
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/reports/:id/chat - ส่งข้อความเข้าห้องแชทหมุด (พร้อมตรวจคำหยาบ)
  router.post('/:id/chat', requireAuth, (req, res) => {
    try {
      const { text, isAnonymous, isAnnouncement } = req.body;
      const pinId = req.params.id;

      const pin = db.getPinById(pinId);
      if (!pin) {
        return res.status(404).json({ success: false, error: 'ไม่พบหมุดรายงานนี้' });
      }

      if (!text || !text.trim()) {
        return res.status(400).json({ success: false, error: 'กรุณากรอกข้อความ' });
      }

      // 🚫 Ban Check
      const checkUser = db.getUserById(req.user.id);
      if (checkUser && checkUser.status === 'banned') {
        return res.status(403).json({
          success: false,
          error: 'ACCOUNT_BANNED',
          message: `🚫 บัญชีของคุณถูกระงับการใช้งาน (${checkUser.banReason || 'ละเมิดข้อกำหนด'})`
        });
      }

      const result = db.addPinChatMessage({
        pinId,
        sender: req.user,
        text: text.trim(),
        isAnonymous: isAnonymous === true,
        isAnnouncement: isAnnouncement === true
      });

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      // ⚡ Real-time Socket Broadcast to Room & Live Counters
      if (io) {
        // Broadcast message to everyone viewing this pin's chat
        io.to(`pin_${pinId}`).emit('pin_chat_new', {
          pinId,
          message: result.message
        });

        // Broadcast count update to everyone on the map and feed
        io.emit('pin_chat_count_update', {
          pinId,
          chatCount: result.chatCount
        });

        // Emit leaderboard update since EXP was gained (+3 EXP)
        io.emit('leaderboard_update', db.getAllTimeLeaderboard(15));
      }

      res.status(201).json({
        success: true,
        message: 'ส่งข้อความสำเร็จ (+3 EXP 🎖️)',
        data: result.message,
        chatCount: result.chatCount,
        expGained: result.expGained,
        userStats: result.userStats
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/reports/:id/flag - ส่งรีพอร์ตหมุดเท็จ/ข้อมูลไม่เหมาะสม
  router.post('/:id/flag', requireAuth, (req, res) => {
    try {
      const pinId = req.params.id;
      const { reason, details } = req.body;

      const result = db.flagReport({
        pinId,
        reason: reason || 'ข้อมูลตำแหน่งเท็จ/ไม่ถูกต้อง',
        details: details || '',
        reporterId: req.user.id,
        reporterName: req.user.name || 'นิสิต มมส'
      });

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
