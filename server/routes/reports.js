const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireAuth, requireDev, optionalAuth } = require('../middleware/authMiddleware');
const { requirePoW } = require('../middleware/powSecurity');
const profanityFilter = require('../services/profanityFilter');

module.exports = function(io) {
  // 🏷️ GET /api/reports/categories - ดึงรายการหมวดหมู่/ประเภทด่านทั้งหมด (Dynamic)
  router.get('/categories', (req, res) => {
    try {
      const categories = db.getCategories();
      res.json({ success: true, data: categories });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 🏷️ POST /api/reports/categories - เพิ่มหรือแก้ไขหมวดหมู่ด่าน (เฉพาะ Dev)
  router.post('/categories', requireDev, (req, res) => {
    try {
      const { key, name, icon, sub, adminOnly } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, error: 'กรุณาระบุชื่อหมวดหมู่' });
      }

      const updated = db.addCategory({ 
        key, 
        name: name.trim(), 
        icon: icon || '📍', 
        sub: sub || name,
        adminOnly: adminOnly === true || adminOnly === 'true'
      }, req.user.id);
      res.json({ success: true, message: `เพิ่ม/แก้ไขหมวดหมู่ [${name}] เรียบร้อยแล้ว`, data: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 🏷️ POST /api/reports/categories/:key/toggle-admin-only - สลับสิทธิ์เฉพาะแอดมิน (เฉพาะ Dev)
  router.post('/categories/:key/toggle-admin-only', requireDev, (req, res) => {
    try {
      const { key } = req.params;
      const cat = db.toggleCategoryAdminOnly(key, req.user.id);
      res.json({ 
        success: true, 
        message: `สลับสิทธิ์หมวดหมู่ [${cat.name}] เป็น: ${cat.adminOnly ? '🔒 เฉพาะแอดมิน' : '🌐 ทุกคนเรียกใช้ได้'}`, 
        category: cat 
      });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // 🏷️ DELETE /api/reports/categories/:key - ลบหมวดหมู่ด่าน (เฉพาะ Dev)
  router.delete('/categories/:key', requireDev, (req, res) => {
    try {
      const { key } = req.params;
      const updated = db.deleteCategory(key, req.user.id);
      res.json({ success: true, message: `ลบหมวดหมู่เรียบร้อยแล้ว`, data: updated });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

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

  // GET /api/reports/quota - ตรวจสอบโควตาการปักหมุดของผู้ใช้ปัจจุบัน
  router.get('/quota', optionalAuth, (req, res) => {
    try {
      if (!req.user || !req.user.id) {
        return res.json({
          success: true,
          quota: { allowed: true, countToday: 0, maxPerDay: 3, remainingToday: 3 }
        });
      }
      const userEmail = (req.user.email || '').toLowerCase().trim();
      const isDev = req.user.isDev === true || userEmail === 'java5263@gmail.com';
      const quota = db.checkUserPinQuota(req.user.id, userEmail, isDev);
      res.json({
        success: true,
        quota
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/reports - สร้างหมุดรายงานด่านใหม่
  router.post('/', requireAuth, requirePoW, (req, res) => {
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

      const userEmail = (req.user.email || '').toLowerCase().trim();
      const isDev = req.user.isDev === true || userEmail === 'java5263@gmail.com';

      // 🔒 ตรวจสอบโควตา: 1 คน ต่อ 1 หมุด ต่อ 1 ชม. และไม่เกิน 3 หมุดต่อวัน (ยกเว้น Dev)
      const quota = db.checkUserPinQuota(req.user.id, userEmail, isDev);
      if (!quota.allowed) {
        return res.status(429).json({
          success: false,
          error: quota.reason,
          message: quota.message,
          quota: quota
        });
      }

      const { locationName, customLocation, campusZone, lat, lng, type, direction, description, severity, imageUrl, isAnonymous } = req.body;

      if (!type) {
        return res.status(400).json({ success: false, error: 'กรุณาระบุประเภทด่านหรือเหตุการณ์' });
      }

      // 🔒 ตรวจสอบว่าหมวดหมู่นี้สงวนสิทธิ์เฉพาะ Admin/Dev หรือไม่
      const allCategories = db.getCategories();
      const chosenCat = allCategories.find(c => c.key === type);
      if (chosenCat && chosenCat.adminOnly && !isDev) {
        return res.status(403).json({
          success: false,
          error: 'CATEGORY_DEV_ONLY',
          message: `🔒 หมวดหมู่ [${chosenCat.name}] สงวนสิทธิ์เฉพาะผู้ดูแลระบบ (Admin/Dev) เท่านั้น`
        });
      }

      if (!lat || !lng) {
        return res.status(400).json({ success: false, error: 'กรุณาระบุพิกัดสถานที่' });
      }

      const isAnon = isAnonymous === true;
      const isMsu = userEmail.endsWith('@msu.ac.th');

      let cleanTitle = req.body.title || '';
      let cleanLocationName = locationName || customLocation || 'จุดตรวจรอบ มมส';
      let cleanCustomLocation = customLocation || '';
      let cleanDescription = description || '';
      let cleanDirection = direction || 'ไม่ระบุฝั่งทาง';

      // 🧠 3-Layer Profanity Check สำหรับข้อความปักหมุด
      const textToCheck = `${cleanTitle} ${cleanLocationName} ${cleanCustomLocation} ${cleanDescription} ${cleanDirection}`.trim();
      if (textToCheck) {
        const toxCheck = profanityFilter.analyzeToxicity(textToCheck);
        if (toxCheck.isToxic) {
          if (isDev) {
            // 👑 Dev: เซนเซอร์เป็น ****** อัตโนมัติ
            cleanTitle = profanityFilter.censorProfanity(cleanTitle);
            cleanLocationName = profanityFilter.censorProfanity(cleanLocationName);
            cleanCustomLocation = profanityFilter.censorProfanity(cleanCustomLocation);
            cleanDescription = profanityFilter.censorProfanity(cleanDescription);
            cleanDirection = profanityFilter.censorProfanity(cleanDirection);
            db.logAudit('DEV_PIN_PROFANITY_CENSORED', req.user.id, 'pin_submit', `Dev ปักหมุดที่มีคำหยาบ (เซนเซอร์ข้อความเรียบร้อย)`);
          } else {
            // 👤 สมาชิกทั่วไป: บล็อกและลดคะแนน Trust
            db.updateTrustScore(req.user.id, -10, `ตรวจพบคำหยาบในการรายงานด่าน: ${toxCheck.reason}`);
            db.logAudit('PIN_PROFANITY_BLOCKED', req.user.id, 'pin_submit', `บล็อกโพสต์ด่าน: ${textToCheck} (${toxCheck.reason})`);
            return res.status(400).json({
              success: false,
              error: 'PROFANITY_DETECTED',
              message: `🚫 ไม่สามารถปักหมุดได้: ตรวจพบคำไม่สุภาพหรือคำหยาบ (${toxCheck.reason}) กรุณาใช้ถ้อยคำที่สุภาพและสร้างสรรค์`
            });
          }
        }
      }

      let userBadge = '👤 Member';
      if (isDev) userBadge = '👑 DEV';
      else if (isMsu) userBadge = '🎓 MSU';

      const newPin = db.addPin({
        title: cleanTitle || null,
        locationName: cleanLocationName,
        customLocation: cleanCustomLocation,
        campusZone: campusZone || 'มอใหม่ (ขามเรียง)',
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        type,
        direction: cleanDirection,
        description: cleanDescription,
        severity: isDev ? 'high' : (severity || 'medium'),
        lifespanHours: req.body.lifespanHours || null,
        imageUrl: imageUrl || null,
        isAnonymous: isAnon,
        isAnnouncement: req.body.isAnnouncement === true && isDev,
        reporterId: req.user.id,
        reporter: {
          id: req.user.id,
          name: (req.body.isAnnouncement === true && isDev) ? 'MSU Traffic' : (isAnon ? 'นิสิตนิรนาม' : req.user.name),
          email: isAnon ? '' : req.user.email,
          picture: (req.body.isAnnouncement === true && isDev)
            ? 'https://ui-avatars.com/api/?name=MSU+Traffic&background=1E3A8A&color=fff' 
            : (isAnon ? 'https://ui-avatars.com/api/?name=Anon&background=475569&color=fff' : req.user.picture),
          isDev: isDev,
          isMsuStudent: isMsu,
          isAnonymous: isAnon,
          isAnnouncement: req.body.isAnnouncement === true && isDev,
          badge: (req.body.isAnnouncement === true && isDev) ? '📢 MSU Traffic' : userBadge,
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
        message: 'รายงานจุดตรวจสำเร็จแล้ว (+5 EXP 🎖️)',
        data: newPin
      });
    } catch (err) {
      console.error('Error creating pin:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/reports/:id/vote - โหวตยืนยันสถานะด่าน (👍 / 🚀)
  router.post('/:id/vote', requireAuth, requirePoW, (req, res) => {
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
  router.post('/:id/report', requireAuth, requirePoW, (req, res) => {
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
  router.delete('/:id', optionalAuth, (req, res) => {
    try {
      const pinId = req.params.id;
      const user = req.user || {};
      
      const result = db.deletePin(pinId, user.id || 'dev_admin');

      if (io) {
        io.emit('report_deleted', pinId);
        io.emit('stats_update', db.getStatistics());
      }

      res.json({
        success: true,
        message: 'ลบหมุดรายงานสำเร็จแล้ว',
        data: { id: pinId }
      });
    } catch (err) {
      console.error('Error deleting report:', err);
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
  router.post('/:id/chat', requireAuth, requirePoW, (req, res) => {
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
