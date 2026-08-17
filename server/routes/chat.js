const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireAuth } = require('../middleware/authMiddleware');

const profanityFilter = require('../services/profanityFilter');

// ⏱️ ระบบกันสแปมข้อความแชต (Rate Limiter: 10 วินาที / ข้อความ)
const userLastChatTimestamp = new Map();
const CHAT_COOLDOWN_MS = 10000; // 10 วินาที

module.exports = function(io) {
  // 1. GET /api/chat/rooms - ดึงห้องแชตทั้งหมด
  router.get('/rooms', (req, res) => {
    try {
      const rooms = db.getChatRooms();
      res.json({ success: true, data: rooms });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 2. GET /api/chat/messages/:roomId - ดึงข้อความในห้องแชต
  router.get('/messages/:roomId', (req, res) => {
    try {
      const { roomId } = req.params;
      const limit = parseInt(req.query.limit) || 50;
      const messages = db.getChatMessages(roomId, limit);
      res.json({ success: true, data: messages, count: messages.length });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. GET /api/chat/geocheck - ตรวจสอบพิกัด GPS ว่าอยู่ในเขต มมส หรือไม่
  router.get('/geocheck', (req, res) => {
    try {
      const lat = parseFloat(req.query.lat);
      const lng = parseFloat(req.query.lng);
      if (!lat || !lng) {
        return res.json({ success: true, inZone: false, distanceKm: 999, message: 'กรุณาอนุญาตให้เข้าถึงตำแหน่ง GPS' });
      }
      const geo = db.data ? db.getChatRooms() : null; // sanity
      // Use Haversine check
      const dKhamriang = Math.round((6371 * 2 * Math.atan2(
        Math.sqrt(Math.sin((16.2468 - lat) * Math.PI / 360) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(16.2468 * Math.PI / 180) * Math.sin((103.2520 - lng) * Math.PI / 360) ** 2),
        Math.sqrt(1 - (Math.sin((16.2468 - lat) * Math.PI / 360) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(16.2468 * Math.PI / 180) * Math.sin((103.2520 - lng) * Math.PI / 360) ** 2))
      )) * 10) / 10;

      const inZone = dKhamriang <= 25.0;
      res.json({
        success: true,
        inZone,
        distanceKm: dKhamriang,
        nearCampus: dKhamriang <= 10 ? 'มอใหม่ (ขามเรียง)' : 'พื้นที่รอบ มมส',
        message: inZone ? 'คุณอยู่ในรัศมี มมส สามารถแชตได้' : `คุณอยู่นอกพื้นที่ (${dKhamriang} กม.) สามารถอ่านได้อย่างเดียว`
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. POST /api/chat/messages - ส่งข้อความแชต (ต้องผ่านตัวกรองคำหยาบ + @msu.ac.th + ในรัศมี GPS)
  router.post('/messages', requireAuth, (req, res) => {
    try {
      const { roomId, text, lat, lng, isAnonymous, isAnnouncement } = req.body;
      if (!text || !text.trim()) {
        return res.status(400).json({ success: false, error: 'กรุณาพิมพ์ข้อความที่ต้องการส่ง' });
      }

      const userEmail = (req.user.email || '').toLowerCase().trim();
      const isDev = req.user.isDev === true || userEmail === 'java5263@gmail.com';

      // ⏱️ ระบบกันสแปมในแชต (Anti-Spam 10s Cooldown) สำหรับผู้ใช้ทั่วไป
      if (!isDev) {
        const lastSent = userLastChatTimestamp.get(req.user.id) || 0;
        const elapsed = Date.now() - lastSent;
        if (elapsed < CHAT_COOLDOWN_MS) {
          const remainingSec = Math.ceil((CHAT_COOLDOWN_MS - elapsed) / 1000);
          return res.status(429).json({
            success: false,
            error: `⏱️ ระบบกันสแปม: กรุณารออีก ${remainingSec} วินาทีก่อนส่งข้อความถัดไป (ดีเลย์ 10 วิ)`,
            remainingSec
          });
        }
      }

      let finalText = text;

      // 🧠 3-Layer Profanity & Anti-Spam Check (จาก profanity_filter.py)
      const filterResult = profanityFilter.processUserMessage(req.user.id, text);
      if (filterResult.isToxic) {
        if (isDev) {
          // 👑 สิทธิ์ Dev: ไม่บล็อก แต่จะเซนเซอร์คำหยาบเป็น ****** ให้โดยอัตโนมัติ
          finalText = profanityFilter.censorProfanity(text);
          db.logAudit('DEV_PROFANITY_CENSORED', req.user.id, roomId, `Dev ส่งข้อความที่มีคำหยาบ (เซนเซอร์เป็น: ${finalText})`);
        } else {
          // 👤 สมาชิกทั่วไป: ลด Trust Score, บันทึก Strike และบล็อกทันที
          db.updateTrustScore(req.user.id, -10, `ตรวจพบคำหยาบ/สแปม: ${filterResult.reason}`);
          db.logAudit('PROFANITY_BLOCKED', req.user.id, roomId, `บล็อกข้อความ: ${text} | เหตุผล: ${filterResult.reason} | บทลงโทษ: ${filterResult.penaltyDesc}`);

          return res.status(400).json({
            success: false,
            error: `🚫 ข้อความไม่ผ่านการตรวจสอบ: ${filterResult.reason}`,
            penaltyDesc: filterResult.penaltyDesc,
            strikeCount: filterResult.strikeCount
          });
        }
      }

      const result = db.addChatMessage({
        roomId: roomId || 'general',
        sender: req.user,
        text: finalText,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        isAnonymous: isAnonymous === true,
        isAnnouncement: isAnnouncement === true
      });

      if (!result.success) {
        return res.status(403).json(result);
      }

      // บันทึกเวลาส่งข้อความล่าสุดเพื่อกันสแปม 10 วินาที
      if (!isDev) {
        userLastChatTimestamp.set(req.user.id, Date.now());
      }

      // Real-time broadcast ผ่าน WebSocket
      if (io) {
        io.emit('chat_message', result.message);
      }

      res.status(201).json({ success: true, data: result.message });
    } catch (err) {
      console.error('Chat Error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. POST /api/chat/messages/:id/report - รีพอร์ตข้อความในแชต
  router.post('/messages/:id/report', requireAuth, (req, res) => {
    try {
      const { reason } = req.body;
      const reportEntry = {
        id: `mreport-${Date.now()}`,
        messageId: req.params.id,
        reporterId: req.user.id,
        reason: reason || 'ข้อความไม่เหมาะสม / Spam',
        createdAt: Date.now()
      };
      db.data.message_reports.push(reportEntry);
      db.saveData();
      db.logAudit('MESSAGE_REPORT', req.user.id, req.params.id, `รีพอร์ตข้อความแชต: ${reason}`);

      res.json({ success: true, message: 'บันทึกการรายงานข้อความแล้ว ขอบคุณที่ช่วยดูแลชุมชน' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6. DELETE /api/chat/rooms/:roomId/messages - ล้างประวัติแชต (เฉพาะ Dev ที่ยืนยัน 2 ครั้ง)
  router.delete('/rooms/:roomId/messages', requireAuth, (req, res) => {
    try {
      const userEmail = (req.user.email || '').toLowerCase().trim();
      const isDev = req.user.isDev === true || userEmail === 'java5263@gmail.com';

      if (!isDev) {
        return res.status(403).json({ success: false, error: 'เฉพาะผู้พัฒนา (Dev) เท่านั้นที่มีสิทธิ์ล้างประวัติแชท' });
      }

      const { roomId } = req.params;
      const clearResult = db.clearChatRoom(roomId, req.user);

      // แจ้งเตือนทุกคนในห้องผ่าน WebSocket
      if (io) {
        io.emit('chat_cleared', {
          roomId,
          clearedBy: req.user.name,
          isAuto: false,
          reason: 'ผู้พัฒนา (Dev) ทำการล้างประวัติการสนทนา',
          timestamp: Date.now()
        });
      }

      res.json({
        success: true,
        message: `ล้างข้อความในห้องแชท [${roomId}] สำเร็จแล้ว (${clearResult.count} ข้อความ)`,
        data: clearResult
      });
    } catch (err) {
      console.error('Clear Chat Error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 7. GET /api/chat/reset-status/:roomId - ดึงสถานะเวลารีเซ็ตแชตประจำวัน
  router.get('/reset-status/:roomId', (req, res) => {
    try {
      const { roomId } = req.params;
      const statusInfo = db.getChatResetInfo(roomId);
      res.json({ success: true, data: statusInfo });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8. PUT /api/chat/messages/:id - แก้ไขข้อความ (เจ้าของข้อความ หรือ Dev)
  router.put('/messages/:id', requireAuth, (req, res) => {
    try {
      const { text } = req.body;
      if (!text || !text.trim()) {
        return res.status(400).json({ success: false, error: 'กรุณาระบุข้อความใหม่ที่ต้องการแก้ไข' });
      }

      const userEmail = (req.user.email || '').toLowerCase().trim();
      const isDev = req.user.isDev === true || userEmail === 'java5263@gmail.com';

      let cleanText = text.trim();

      // 🧠 3-Layer Profanity Check สำหรับข้อความที่แก้ไข
      const filterResult = profanityFilter.processUserMessage(req.user.id, cleanText);
      if (filterResult.isToxic) {
        if (isDev) {
          cleanText = profanityFilter.censorProfanity(cleanText);
        } else {
          return res.status(400).json({
            success: false,
            error: `🚫 ข้อความไม่ผ่านการตรวจสอบ: ${filterResult.reason}`
          });
        }
      }

      const result = db.editChatMessage(req.params.id, cleanText, req.user);
      if (!result.success) {
        return res.status(403).json(result);
      }

      // Real-time broadcast ผ่าน WebSocket
      if (io) {
        io.emit('chat_message_edited', result.message);
      }

      res.json({
        success: true,
        message: 'แก้ไขข้อความสำเร็จแล้ว',
        data: result.message
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 9. DELETE /api/chat/messages/:id - ยกเลิก / ลบข้อความ (เจ้าของข้อความ หรือ Dev)
  router.delete('/messages/:id', requireAuth, (req, res) => {
    try {
      const result = db.deleteChatMessage(req.params.id, req.user);
      if (!result.success) {
        return res.status(403).json(result);
      }

      // Real-time broadcast ผ่าน WebSocket
      if (io) {
        io.emit('chat_message_deleted', {
          messageId: req.params.id,
          roomId: result.roomId
        });
      }

      res.json({
        success: true,
        message: 'ยกเลิกข้อความสำเร็จแล้ว',
        messageId: req.params.id,
        roomId: result.roomId
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 10. POST /api/chat/rider/request - ยื่นขอสิทธิ์และป้าย RIDER
  router.post('/rider/request', requireAuth, (req, res) => {
    try {
      const { platform, phone, note } = req.body;
      const result = db.requestRiderRole({
        userId: req.user.id,
        userName: req.user.name,
        userEmail: req.user.email,
        userPicture: req.user.picture,
        platform: platform || 'Grab / Lineman / Rider',
        phone: phone || '',
        note: note || ''
      });

      if (!result.success) {
        return res.status(400).json(result);
      }

      if (io) {
        io.emit('rider_request_created', {
          request: result.request
        });
      }

      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 11. GET /api/chat/rider/status - ตรวจสอบสถานะการขอสิทธิ์ RIDER ของผู้ใช้ปัจจุบัน
  router.get('/rider/status', requireAuth, (req, res) => {
    try {
      const statusInfo = db.getUserRiderStatus(req.user.id, req.user.email);
      res.json({ success: true, data: statusInfo });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
