/**
 * MSU Traffic & Campus Life - Google Sheets & Cloud Auto-Sync Service (Season 1)
 * ระบบเชื่อมต่อและซิงค์ข้อมูลกับ Google Sheets อัตโนมัติ (Real-time & Scheduled Sync)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const CONFIG_FILE = path.join(__dirname, '../../data/sheets_config.json');

class GoogleSheetsService {
  constructor() {
    this.config = this.loadConfig();
    this.isSyncing = false;
    this.timer = null;
  }

  startAutoSyncTimer(db, intervalMs = 30000) {
    if (this.timer) clearInterval(this.timer);
    // รันทุกๆ 30 วินาทีในเบื้องหลังอัตโนมัติ (ดึงและดันข้อมูลกับ Google Sheets สม่ำเสมอ)
    this.timer = setInterval(() => {
      if (this.config.enabled && this.config.webhookUrl && !this.isSyncing) {
        this.syncFullDatabase(db.data).catch(err => {
          console.warn('⚠️ Background Auto-Sync to Google Sheets failed:', err.message);
        });
      }
    }, intervalMs);
    console.log(`🔄 Google Sheets Auto-Sync background timer started (Every ${intervalMs / 1000}s)`);
  }

  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.warn('⚠️ Could not load sheets_config.json:', err.message);
    }
    return {
      enabled: false,
      webhookUrl: process.env.GOOGLE_SHEET_WEBHOOK_URL || '',
      autoSyncNewPins: true,
      autoSyncChat: false,
      autoSyncReports: true,
      lastSyncAt: null
    };
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    try {
      const dir = path.dirname(CONFIG_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error('❌ Error saving sheets config:', err);
      return false;
    }
  }

  getConfig() {
    return {
      enabled: this.config.enabled === true && Boolean(this.config.webhookUrl),
      webhookUrl: this.config.webhookUrl || '',
      autoSyncNewPins: this.config.autoSyncNewPins !== false,
      autoSyncChat: this.config.autoSyncChat === true,
      autoSyncReports: this.config.autoSyncReports !== false,
      lastSyncAt: this.config.lastSyncAt || null
    };
  }

  /**
   * ส่งข้อมูลผ่าน Webhook ไปยัง Google Apps Script (Google Sheets)
   */
  async sendPayload(action, data) {
    if (!this.config.enabled || !this.config.webhookUrl) {
      return { success: false, error: 'Google Sheets integration is disabled or Webhook URL is missing.' };
    }

    const payload = JSON.stringify({
      action,
      timestamp: new Date().toISOString(),
      source: 'MSU_Traffic_Server',
      data
    });

    return new Promise((resolve) => {
      try {
        const urlObj = new URL(this.config.webhookUrl);
        const isHttps = urlObj.protocol === 'https:';
        const client = isHttps ? https : http;

        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port || (isHttps ? 443 : 80),
          path: urlObj.pathname + urlObj.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          },
          timeout: 10000
        };

        const req = client.request(options, (res) => {
          // ถ้ามี 302/301/303 redirect จาก Google Apps Script
          if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303) && res.headers.location) {
            https.get(res.headers.location, (res2) => {
              let body2 = '';
              res2.on('data', chunk => body2 += chunk);
              res2.on('end', () => {
                this.config.lastSyncAt = Date.now();
                this.saveConfig(this.config);
                try {
                  const json = JSON.parse(body2);
                  resolve({ success: true, statusCode: res2.statusCode, data: json, body: body2 });
                } catch (e) {
                  resolve({ success: true, statusCode: res2.statusCode, body: body2 });
                }
              });
            }).on('error', (err2) => {
              resolve({ success: true, statusCode: res.statusCode, body: 'Redirect succeeded' });
            });
            return;
          }

          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              if (res.statusCode >= 200 && res.statusCode < 400) {
                this.config.lastSyncAt = Date.now();
                this.saveConfig(this.config);
                resolve({ success: true, statusCode: res.statusCode, body });
              } else {
                resolve({ success: false, statusCode: res.statusCode, error: body });
              }
            } catch (e) {
              resolve({ success: true, body });
            }
          });
        });

        req.on('error', (e) => {
          console.error('❌ Google Sheets Webhook Error:', e.message);
          resolve({ success: false, error: e.message });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({ success: false, error: 'Webhook request timed out (10s)' });
        });

        req.write(payload);
        req.end();
      } catch (err) {
        console.error('❌ Error executing Google Sheets payload:', err);
        resolve({ success: false, error: err.message });
      }
    });
  }

  // 1. ซิงค์เมื่อมีหมุดด่านใหม่ (Real-time Instant Push 0.0s)
  async syncNewPin(pin) {
    if (!this.config.enabled || !this.config.autoSyncNewPins) return;
    return this.sendPayload('NEW_PIN', {
      id: pin.id,
      title: pin.title || pin.locationName,
      type: pin.type,
      locationName: pin.locationName,
      campusZone: pin.campusZone,
      lat: pin.lat,
      lng: pin.lng,
      direction: pin.direction || '',
      description: pin.description || '',
      reporterName: pin.reporter?.name || 'นิรนาม',
      reporterEmail: pin.reporter?.email || '',
      reporterBadge: pin.reporter?.badge || 'Member',
      isOfficial: pin.isAnnouncement || pin.reporter?.name === 'MSU Traffic',
      status: pin.status || 'active',
      createdAt: new Date(pin.createdAt).toLocaleString('th-TH'),
      expiresAt: new Date(pin.expiresAt).toLocaleString('th-TH')
    });
  }

  // 2. ซิงค์เมื่อหมุดถูกอัปเดต / โหวต / ปรับสถานะ / ย้ายจุด (Real-time Instant Push 0.0s)
  async syncPinUpdate(pin) {
    if (!this.config.enabled) return;
    return this.sendPayload('UPDATE_PIN', {
      id: pin.id,
      status: pin.status,
      upVotes: pin.votes?.up?.length || 0,
      downVotes: pin.votes?.down?.length || 0,
      likes: pin.likes?.length || 0,
      chatCount: pin.chatCount || 0,
      moveCount: pin.moveCount || 0,
      lat: pin.lat,
      lng: pin.lng,
      updatedAt: new Date().toLocaleString('th-TH')
    });
  }

  // 3. ซิงค์เมื่อหมุดถูกลบ
  async syncPinDelete(pinId) {
    if (!this.config.enabled) return;
    return this.sendPayload('DELETE_PIN', {
      id: pinId,
      deletedAt: new Date().toLocaleString('th-TH')
    });
  }

  // 4. ซิงค์รายงานรีพอร์ตหมุดเท็จ/ไม่เหมาะสม
  async syncPinReport(reportObj) {
    if (!this.config.enabled || !this.config.autoSyncReports) return;
    return this.sendPayload('PIN_REPORT', {
      id: reportObj.id,
      pinId: reportObj.pinId,
      reason: reportObj.reason,
      details: reportObj.details,
      weight: reportObj.weight,
      reporterId: reportObj.reporterId,
      reporterEmail: reportObj.reporterEmail,
      createdAt: new Date(reportObj.createdAt).toLocaleString('th-TH')
    });
  }

  // 5. Full Sync: ส่งข้อมูลทั้งหมดขึ้น Google Sheets
  async syncFullDatabase(dbData) {
    if (this.isSyncing) return { success: false, error: 'กำลังดำเนินการซิงค์อยู่' };
    this.isSyncing = true;

    try {
      const pinsList = (dbData.pins || []).map(p => ({
        id: p.id,
        title: p.title || p.locationName,
        type: p.type,
        locationName: p.locationName,
        campusZone: p.campusZone,
        lat: p.lat,
        lng: p.lng,
        direction: p.direction || '',
        description: p.description || '',
        reporterName: p.reporter?.name || 'นิรนาม',
        reporterEmail: p.reporter?.email || '',
        reporterBadge: p.reporter?.badge || 'Member',
        status: p.status,
        upVotes: p.votes?.up?.length || 0,
        downVotes: p.votes?.down?.length || 0,
        createdAt: new Date(p.createdAt).toLocaleString('th-TH'),
        expiresAt: new Date(p.expiresAt).toLocaleString('th-TH')
      }));

      const usersList = Object.values(dbData.users || {}).map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        score: u.score || 0,
        weeklyScore: u.weeklyScore || 0,
        trustScore: u.trustScore || 50,
        role: u.role || 'user',
        pinsCreated: u.pinsCreated || 0,
        lastActive: u.lastActive ? new Date(u.lastActive).toLocaleString('th-TH') : ''
      }));

      const reportsList = (dbData.pin_reports || []).map(r => ({
        id: r.id,
        pinId: r.pinId,
        reason: r.reason,
        details: r.details,
        weight: r.weight,
        reporterEmail: r.reporterEmail,
        createdAt: new Date(r.createdAt).toLocaleString('th-TH')
      }));

      const result = await this.sendPayload('FULL_SYNC', {
        summary: {
          totalPins: pinsList.length,
          totalUsers: usersList.length,
          totalReports: reportsList.length,
          syncedAt: new Date().toLocaleString('th-TH')
        },
        pins: pinsList,
        users: usersList,
        reports: reportsList
      });

      this.isSyncing = false;
      return result;
    } catch (err) {
      this.isSyncing = false;
      return { success: false, error: err.message };
    }
  }

  // 6. ดึงข้อมูลหมุดทั้งหมดจาก Google Sheets กลับมา (Two-Way Pull & Auto Restore)
  async fetchPinsFromSheets() {
    if (!this.config.enabled || !this.config.webhookUrl) return null;
    return new Promise((resolve) => {
      try {
        const urlObj = new URL(this.config.webhookUrl);
        const isHttps = urlObj.protocol === 'https:';
        const client = isHttps ? https : http;

        const req = client.get(this.config.webhookUrl, (res) => {
          if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303) && res.headers.location) {
            https.get(res.headers.location, (res2) => {
              let body2 = '';
              res2.on('data', chunk => body2 += chunk);
              res2.on('end', () => {
                try {
                  const json = JSON.parse(body2);
                  resolve(json);
                } catch (e) {
                  resolve(null);
                }
              });
            }).on('error', () => resolve(null));
            return;
          }

          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              const json = JSON.parse(body);
              resolve(json);
            } catch (e) {
              resolve(null);
            }
          });
        });

        req.on('error', () => resolve(null));
        req.setTimeout(8000, () => { req.destroy(); resolve(null); });
      } catch (err) {
        resolve(null);
      }
    });
  }

  // 7. ฟังก์ชันกู้คืนหมุดอัตโนมัติเมื่อเซิร์ฟเวอร์เปิดขึ้นมาใหม่ (Startup Restore)
  async restorePinsFromSheets(db) {
    if (!this.config.enabled || !this.config.webhookUrl) return;
    console.log('🔄 [SHEETS RESTORE] Checking & Restoring pins from Google Sheets on boot...');
    try {
      const result = await this.fetchPinsFromSheets();
      if (result && Array.isArray(result.pins) && result.pins.length > 0) {
        let restoredCount = 0;
        result.pins.forEach(sheetPin => {
          if (!sheetPin.id) return;
          const exists = db.data.pins.find(p => p.id === sheetPin.id);
          if (!exists && sheetPin.lat && sheetPin.lng) {
            db.data.pins.push({
              id: sheetPin.id,
              title: sheetPin.title || sheetPin.locationName,
              locationName: sheetPin.locationName,
              campusZone: sheetPin.campusZone || 'มอใหม่ (ขามเรียง)',
              lat: sheetPin.lat,
              lng: sheetPin.lng,
              type: sheetPin.type || 'checkpoint',
              direction: sheetPin.direction || '',
              description: sheetPin.description || '',
              status: sheetPin.status || 'active',
              reporter: sheetPin.reporter || { name: 'ผู้ใช้ มมส', badge: 'Member' },
              reporterId: sheetPin.reporter?.email || 'restored_user',
              likes: [],
              views: 1,
              votes: { up: [], down: [] },
              moveCount: 0,
              createdAt: typeof sheetPin.createdAt === 'string' ? new Date(sheetPin.createdAt).getTime() || Date.now() : Date.now(),
              expiresAt: Date.now() + (6 * 3600 * 1000)
            });
            restoredCount++;
          }
        });
        if (restoredCount > 0) {
          db.saveData();
          console.log(`✅ [SHEETS RESTORE] Successfully restored ${restoredCount} pins from Google Sheets!`);
        }
      }
    } catch (e) {
      console.warn('⚠️ [SHEETS RESTORE] Could not restore from sheets:', e.message);
    }
  }

  // 8. ทดสอบการเชื่อมต่อ
  async testConnection() {
    return this.sendPayload('PING', {
      message: 'ทดสอบการเชื่อมต่อระบบ MSU Traffic กับ Google Sheets สำเร็จ! 🚀'
    });
  }

  getGoogleAppsScriptTemplate() {
    return `/**
 * ========================================================
 * 🚀 MSU Traffic & Campus Life - Google Sheets Webhook App
 * วางโค้ดนี้ใน: Google Sheets > ส่วนขยาย (Extensions) > Apps Script
 * จากนั้นกด "ทำให้ใช้งานได้ (Deploy)" > "การทำให้ใช้งานได้ใหม่ (New Deployment)" > เลือก "เว็บแอป (Web App)"
 * ตั้งค่า "ผู้มีสิทธิ์เข้าถึง (Who has access)" เป็น "ทุกคน (Anyone)"
 * ========================================================
 */

var SPREADSHEET_ID = ""; 

function getSpreadsheet() {
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim()) {
    var id = SPREADSHEET_ID.trim();
    if (id.indexOf("/d/") !== -1) {
      id = id.split("/d/")[1].split("/")[0];
    }
    return SpreadsheetApp.openById(id);
  }
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error("ไม่พบ Active Spreadsheet กรุณาระบุ SPREADSHEET_ID ในบรรทัดที่ 2 ของโค้ด");
}

function doGet(e) {
  try {
    var ss = getSpreadsheet();
    var pinSheet = ss.getSheetByName("📌 รายงานด่าน (Pins)");
    var pins = [];
    if (pinSheet && pinSheet.getLastRow() > 1) {
      var data = pinSheet.getRange(2, 1, pinSheet.getLastRow() - 1, pinSheet.getLastColumn()).getValues();
      pins = data.map(function(row) {
        return {
          id: row[0],
          title: row[1],
          type: row[2],
          locationName: row[3],
          campusZone: row[4],
          lat: parseFloat(row[5]),
          lng: parseFloat(row[6]),
          direction: row[7],
          description: row[8],
          reporter: { name: row[9], email: row[10], badge: row[11] },
          status: row[12],
          createdAt: row[13],
          expiresAt: row[14]
        };
      });
    }
    return ContentService.createTextOutput(JSON.stringify({ status: "OK", pins: pins }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "ERROR", error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var rawData = e.postData.contents;
    var json = JSON.parse(rawData);
    var action = json.action;
    var data = json.data;
    var ss = getSpreadsheet();

    if (action === "PING") {
      return ContentService.createTextOutput(JSON.stringify({ status: "OK", message: "Connected successfully to: " + ss.getName() }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "NEW_PIN") {
      var sheet = getOrCreateSheet(ss, "📌 รายงานด่าน (Pins)", [
        "รหัสหมุด", "หัวข้อ", "ประเภท", "สถานที่", "โซน", "ละติจูด", "ลองจิจูด", "ทิศทาง", "รายละเอียด", "ผู้รายงาน", "อีเมล", "ป้าย", "สถานะ", "เวลาโพสต์", "เวลาหมดอายุ"
      ]);
      sheet.appendRow([
        data.id, data.title, data.type, data.locationName, data.campusZone, data.lat, data.lng, data.direction, data.description, data.reporterName, data.reporterEmail, data.reporterBadge, data.status, data.createdAt, data.expiresAt
      ]);
    }

    if (action === "FULL_SYNC") {
      var pinSheet = getOrCreateSheet(ss, "📌 รายงานด่าน (Pins)", [
        "รหัสหมุด", "หัวข้อ", "ประเภท", "สถานที่", "โซน", "ละติจูด", "ลองจิจูด", "ทิศทาง", "รายละเอียด", "ผู้รายงาน", "อีเมล", "ป้าย", "สถานะ", "เวลาโพสต์", "เวลาหมดอายุ"
      ]);
      clearDataRows(pinSheet);
      if (data.pins && data.pins.length > 0) {
        var pinRows = data.pins.map(function(p) {
          return [p.id, p.title, p.type, p.locationName, p.campusZone, p.lat, p.lng, p.direction, p.description, p.reporterName, p.reporterEmail, p.reporterBadge, p.status, p.createdAt, p.expiresAt];
        });
        pinSheet.getRange(2, 1, pinRows.length, pinRows[0].length).setValues(pinRows);
      }

      var userSheet = getOrCreateSheet(ss, "🏆 ผู้ใช้งาน & คะแนน (Users)", [
        "User ID", "ชื่อ", "อีเมล", "คะแนนรวม (EXP)", "คะแนนสัปดาห์นี้", "Trust Score", "บทบาท", "จำนวนหมุดที่สร้าง", "ใช้งานล่าสุด"
      ]);
      clearDataRows(userSheet);
      if (data.users && data.users.length > 0) {
        var userRows = data.users.map(function(u) {
          return [u.id, u.name, u.email, u.score, u.weeklyScore, u.trustScore, u.role, u.pinsCreated, u.lastActive];
        });
        userSheet.getRange(2, 1, userRows.length, userRows[0].length).setValues(userRows);
      }

      var reportSheet = getOrCreateSheet(ss, "🛡️ รายงานแจ้งลบ (Reports)", [
        "Report ID", "รหัสหมุด", "เหตุผล", "รายละเอียด", "น้ำหนัก (Trust Weight)", "อีเมลผู้แจ้ง", "วันที่แจ้ง"
      ]);
      clearDataRows(reportSheet);
      if (data.reports && data.reports.length > 0) {
        var repRows = data.reports.map(function(r) {
          return [r.id, r.pinId, r.reason, r.details, r.weight, r.reporterEmail, r.createdAt];
        });
        reportSheet.getRange(2, 1, repRows.length, repRows[0].length).setValues(repRows);
      }
    }

    if (action === "PIN_REPORT") {
      var rSheet = getOrCreateSheet(ss, "🛡️ รายงานแจ้งลบ (Reports)", [
        "Report ID", "รหัสหมุด", "เหตุผล", "รายละเอียด", "น้ำหนัก (Trust Weight)", "อีเมลผู้แจ้ง", "วันที่แจ้ง"
      ]);
      rSheet.appendRow([
        data.id, data.pinId, data.reason, data.details, data.weight, data.reporterEmail, data.createdAt
      ]);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "SUCCESS", action: action }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "ERROR", error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateSheet(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    var allSheets = ss.getSheets();
    if (allSheets.length === 1 && (allSheets[0].getName().indexOf("แผ่น") !== -1 || allSheets[0].getName().indexOf("Sheet") !== -1) && allSheets[0].getLastRow() <= 1) {
      sheet = allSheets[0];
      sheet.setName(sheetName);
    } else {
      sheet = ss.insertSheet(sheetName);
    }
    sheet.clear();
    sheet.appendRow(headers);
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground("#2563EB").setFontColor("#FFFFFF").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function clearDataRows(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
}
`;
  }
}

module.exports = new GoogleSheetsService();
