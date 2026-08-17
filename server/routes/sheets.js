const express = require('express');
const router = express.Router();
const googleSheetsService = require('../services/googleSheetsService');
const db = require('../database/db');
const { requireDev } = require('../middleware/authMiddleware');

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
    message: result.success ? '🎉 ซิงค์ข้อมูลทั้งหมด (หมุด, ยศ, ห้องแชท, การตั้งค่า) ขึ้น Google Sheets สำเร็จแล้ว!' : `❌ ซิงค์ไม่สำเร็จ: ${result.error || 'เกิดข้อผิดพลาด'}`,
    detail: result
  });
});

// 4.1 สั่งซิงค์เฉพาะการตั้งค่าเว็บ, ยศ, ห้องแชท ขึ้น Google Sheets ทันที
router.post('/sync-settings', requireDev, async (req, res) => {
  const result = await googleSheetsService.syncSettingsUpdate(db.data);
  res.json({
    success: result ? result.success : false,
    message: (result && result.success) ? '⚙️ ซิงค์การตั้งค่าเว็บและห้องแชทขึ้น Google Sheets เรียบร้อยแล้ว!' : 'เกิดข้อผิดพลาดในการซิงค์การตั้งค่า',
    detail: result
  });
});

// 4.2 สั่งดึงข้อมูลล่าสุดจาก Google Sheets กลับมาทันที (Pull Now)
router.post('/pull-now', requireDev, async (req, res) => {
  const result = await googleSheetsService.pullAndApplyFromSheets(db);
  if (result.success) {
    db.logAudit('SHEETS_PULL_NOW', req.user.id, 'google_sheets', `ดึงข้อมูลจาก Google Sheets สำเร็จ (${result.applied?.changes?.length || 0} รายการที่อัปเดต)`);
  }

  res.json({
    success: result.success,
    message: result.success 
      ? `📥 ดึงและอัปเดตข้อมูลจาก Google Sheets สำเร็จเรียบร้อย! (${result.applied?.changes?.length || 0} รายการ)` 
      : `❌ ดึงข้อมูลไม่สำเร็จ: ${result.reason || result.error || 'ตรวจสอบ Webhook URL'}`,
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

