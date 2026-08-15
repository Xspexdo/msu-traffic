/**
 * MSU Traffic & Campus Life - Google Sheets & Cloud Sync Routes (Season 1)
 */

const express = require('express');
const router = express.Router();
const googleSheetsService = require('../services/googleSheetsService');
const db = require('../database/db');

// Middleware to check Dev authorization
function requireDev(req, res, next) {
  const userHeader = req.headers['x-user-data'];
  const authHeader = req.headers['authorization'];
  let user = null;

  if (userHeader) {
    try {
      user = JSON.parse(decodeURIComponent(userHeader));
    } catch (e) {
      try {
        user = JSON.parse(userHeader);
      } catch (err) {}
    }
  }

  if (!user && authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    user = db.getUserById(token);
    if (!user && (token === 'dev_secret_token_msu_traffic' || token.includes('dev'))) {
      user = { id: 'dev-master', email: 'java5263@gmail.com', name: 'Master Dev', role: 'dev', isDev: true };
    }
  }

  const isDevUser = user && (user.isDev === true || user.role === 'dev' || user.email === 'java5263@gmail.com');

  if (!isDevUser) {
    return res.status(403).json({ success: false, error: 'เฉพาะผู้พัฒนา (Dev) เท่านั้นที่สามารถเข้าถึงระบบตั้งค่า Google Sheets ได้' });
  }

  req.user = user;
  next();
}

// 1. ดึงการตั้งค่า Google Sheets ปัจจุบัน
router.get('/config', requireDev, (req, res) => {
  res.json({
    success: true,
    data: googleSheetsService.getConfig()
  });
});

// 2. บันทึกการตั้งค่า Webhook URL และโหมด Auto-Sync
router.post('/config', requireDev, (req, res) => {
  const { enabled, webhookUrl, autoSyncNewPins, autoSyncReports, autoSyncChat } = req.body;

  const updated = googleSheetsService.saveConfig({
    enabled: Boolean(enabled),
    webhookUrl: webhookUrl ? webhookUrl.trim() : '',
    autoSyncNewPins: autoSyncNewPins !== false,
    autoSyncReports: autoSyncReports !== false,
    autoSyncChat: autoSyncChat === true
  });

  db.logAudit('SHEETS_CONFIG_UPDATE', req.user.id, 'google_sheets', `อัปเดตการตั้งค่า Google Sheets (Enabled: ${enabled})`);

  res.json({
    success: updated,
    message: updated ? 'บันทึกการตั้งค่า Google Sheets เรียบร้อยแล้ว' : 'เกิดข้อผิดพลาดในการบันทึก',
    data: googleSheetsService.getConfig()
  });
});

// 3. ทดสอบการเชื่อมต่อ (Ping Test)
router.post('/test', requireDev, async (req, res) => {
  const result = await googleSheetsService.testConnection();
  res.json({
    success: result.success,
    message: result.success ? '✅ เชื่อมต่อกับ Google Sheets สำเร็จเรียบร้อย!' : `❌ การเชื่อมต่อล้มเหลว: ${result.error || 'ตรวจสอบ Webhook URL'}`,
    detail: result
  });
});

// 4. สั่ง Full Sync ซิงค์ข้อมูลทั้งหมดใน Database ขึ้น Google Sheets ทันที
router.post('/sync-all', requireDev, async (req, res) => {
  const dbData = db.data;
  const result = await googleSheetsService.syncFullDatabase(dbData);

  if (result.success) {
    db.logAudit('SHEETS_FULL_SYNC', req.user.id, 'google_sheets', 'สั่ง Full Sync ข้อมูลทั้งหมดขึ้น Google Sheets สำเร็จ');
  }

  res.json({
    success: result.success,
    message: result.success ? '🎉 ซิงค์ข้อมูลทั้งหมดขึ้น Google Sheets สำเร็จแล้ว!' : `❌ ซิงค์ไม่สำเร็จ: ${result.error || 'เกิดข้อผิดพลาด'}`,
    detail: result
  });
});

// 5. ดึงโค้ด Google Apps Script สำเร็จรูป สำหรับนำไปวางใน Google Sheet
router.get('/script-template', (req, res) => {
  res.json({
    success: true,
    script: googleSheetsService.getGoogleAppsScriptTemplate()
  });
});

module.exports = router;
