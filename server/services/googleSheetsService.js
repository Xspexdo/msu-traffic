/**
 * MSU Traffic & Campus Life - Google Sheets & Cloud Auto-Sync Service (Season 1)
 * ระบบเชื่อมต่อและซิงค์ข้อมูลกับ Google Sheets แบบ Two-Way Real-time อัตโนมัติ (ดึงและดันข้อมูลตลอดเวลา)
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
    
    // ดึงข้อมูลการตั้งค่าและหมุดจาก Google Sheets ทันทีตอนเริ่มต้น
    this.pullAndApplyFromSheets(db).catch(err => {
      console.warn('⚠️ Initial Google Sheets pull failed:', err.message);
    });

    // รันทุกๆ 30 วินาทีในเบื้องหลัง: ดึงข้อมูลล่าสุดจาก Sheets และซิงค์ข้อมูลกลับไป
    this.timer = setInterval(async () => {
      if (this.config.enabled && this.config.webhookUrl && !this.isSyncing) {
        try {
          await this.pullAndApplyFromSheets(db);
          await this.syncFullDatabase(db.data);
        } catch (err) {
          console.warn('⚠️ Background Auto-Sync with Google Sheets failed:', err.message);
        }
      }
    }, intervalMs);

    console.log(`🔄 Google Sheets Two-Way Auto-Sync background timer started (Every ${intervalMs / 1000}s)`);
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
      enabled: true,
      webhookUrl: process.env.GOOGLE_SHEET_WEBHOOK_URL || 'https://script.google.com/macros/s/AKfycbxv7jL62zv04UFv6xNkFlzAdhmCI1YN2E1jt_g3Aj91LbpgLx1Zz59ZPKlb-_lcdYGqTQ/exec',
      autoSyncNewPins: true,
      autoSyncChat: false,
      autoSyncReports: true,
      autoSyncSettings: true,
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
      autoSyncSettings: this.config.autoSyncSettings !== false,
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

  // 1. ซิงค์เมื่อมีหมุดด่านใหม่ (Real-time Instant Push)
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

  // 2. ซิงค์เมื่อหมุดถูกอัปเดต / โหวต / ปรับสถานะ / ย้ายจุด
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

  // 5. ซิงค์การตั้งค่าเว็บ, ประกาศ, โหมดระบบ (Instant Push)
  async syncSettingsUpdate(dbData) {
    if (!this.config.enabled) return;
    const settingsPayload = this.formatSettingsPayload(dbData);
    return this.sendPayload('SYNC_SETTINGS', settingsPayload);
  }

  // 6. ซิงค์สถานะห้องแชททั้งหมด (Instant Push เมื่อเปิด/ปิดห้องแชท)
  async syncChatRoomsUpdate(chatRooms) {
    if (!this.config.enabled) return;
    return this.sendPayload('UPDATE_CHAT_ROOMS', {
      chatRooms: (chatRooms || []).map(r => ({
        id: r.id,
        name: r.name,
        icon: r.icon || '💬',
        desc: r.desc || '',
        status: r.enabled !== false ? 'เปิดใช้งาน' : 'ปิดปรับปรุง',
        enabled: r.enabled !== false,
        msgCount: r.msgCount || 0,
        lastReset: r.lastAutoResetDate || '-'
      }))
    });
  }

  // 7. ซิงค์ระดับยศ Rank Tiers (Instant Push เมื่อปรับแต่งยศ)
  async syncRankTiersUpdate(rankTiers) {
    if (!this.config.enabled) return;
    return this.sendPayload('UPDATE_RANK_TIERS', {
      rankTiers: (rankTiers || []).map(t => ({
        level: t.level,
        key: t.key,
        name: t.name,
        title: t.title || t.name,
        minExp: t.minExp,
        maxExp: t.maxExp === Infinity ? 'ไม่จำกัด' : t.maxExp,
        icon: t.icon || '🎖️',
        color: t.color || '#2563EB',
        badgeClass: t.badgeClass || ''
      }))
    });
  }

  // 8. ซิงค์หมวดหมู่และตัวกรองด่าน (Instant Push)
  async syncCategoriesUpdate(categories) {
    if (!this.config.enabled) return;
    return this.sendPayload('UPDATE_CATEGORIES', {
      categories: (categories || []).map(c => ({
        key: c.key,
        name: c.name,
        icon: c.icon || '📍',
        sub: c.sub || c.name
      }))
    });
  }

  // 9. ตัวจัดรูปแบบข้อมูลการตั้งค่าสำหรับส่งขึ้นชีต
  formatSettingsPayload(dbData) {
    const sys = dbData.system_config || {};
    const ann = sys.announcement || { enabled: true, text: '' };

    return {
      settings: [
        { key: 'globalChatEnabled', name: 'โหมดแชททั่วโลก (Global Chat)', value: sys.globalChatEnabled !== false ? 'เปิดใช้งาน' : 'ปิดใช้งาน', enabled: sys.globalChatEnabled !== false },
        { key: 'allowAllEmails', name: 'อนุญาตทุกอีเมล (Allow All Emails)', value: sys.allowAllEmails !== false ? 'เปิดใช้งาน' : 'ปิดใช้งาน', enabled: sys.allowAllEmails !== false },
        { key: 'donateEnabled', name: 'ปุ่มสนับสนุน Donate (PromptPay)', value: sys.donateEnabled !== false ? 'เปิดใช้งาน' : 'ปิดใช้งาน', enabled: sys.donateEnabled !== false },
        { key: 'announcementEnabled', name: 'แถบประชาสัมพันธ์ตัววิ่ง (Announcement Ticker)', value: ann.enabled !== false ? 'เปิดใช้งาน' : 'ปิดใช้งาน', enabled: ann.enabled !== false },
        { key: 'announcementText', name: 'ข้อความประชาสัมพันธ์ตัววิ่ง', value: ann.text || '📢 ยินดีต้อนรับสู่ MSU Traffic', enabled: true },
        { key: 'minExpForRanking', name: 'EXP ขั้นต่ำในการจัดอันดับประจำวัน', value: (dbData.leaderboard_snapshot?.minExpRequired || 200).toString(), enabled: true },
        { key: 'seasonName', name: 'ชื่อ Season ปัจจุบัน', value: dbData.seasonName || 'Season 1: ปฐมบทชาว มมส', enabled: true },
        { key: 'seasonNumber', name: 'หมายเลข Season', value: (dbData.season || 1).toString(), enabled: true },
        { key: 'lastSyncedAt', name: 'เวลาซิงค์ข้อมูลล่าสุด', value: new Date().toLocaleString('th-TH'), enabled: true }
      ],
      chatRooms: (dbData.chat_rooms || []).map(r => ({
        id: r.id,
        name: r.name,
        icon: r.icon || '💬',
        desc: r.desc || '',
        status: r.enabled !== false ? 'เปิดใช้งาน' : 'ปิดปรับปรุง',
        enabled: r.enabled !== false,
        msgCount: r.msgCount || 0,
        lastReset: r.lastAutoResetDate || '-'
      })),
      rankTiers: ((Array.isArray(dbData.rank_tiers) && dbData.rank_tiers.length > 0) ? dbData.rank_tiers : [
        { level: 1, key: 'novice', name: 'ผู้สัญจรมือใหม่', minExp: 0, maxExp: 99, icon: '🥉', color: '#B45309', badgeClass: 'rank-bronze', title: 'Novice Scout' },
        { level: 2, key: 'scout', name: 'สายสืบ มมส', minExp: 100, maxExp: 299, icon: '🥈', color: '#475569', badgeClass: 'rank-silver', title: 'Campus Scout' },
        { level: 3, key: 'warden', name: 'ผู้พิทักษ์ทางหลวง', minExp: 300, maxExp: 699, icon: '🥇', color: '#D97706', badgeClass: 'rank-gold', title: 'Traffic Warden' },
        { level: 4, key: 'veteran', name: 'ยอดสายตรวจขามเรียง', minExp: 700, maxExp: 1499, icon: '💎', color: '#2563EB', badgeClass: 'rank-diamond', title: 'Khamriang Veteran' },
        { level: 5, key: 'legend', name: 'ตำนานมีด่านบอกด้วย', minExp: 1500, maxExp: Infinity, icon: '👑', color: '#7C3AED', badgeClass: 'rank-legend', title: 'MSU Legend' }
      ]).map(t => ({
        level: t.level,
        key: t.key,
        name: t.name,
        title: t.title || t.name,
        minExp: t.minExp,
        maxExp: t.maxExp === Infinity ? 'ไม่จำกัด' : t.maxExp,
        icon: t.icon || '🎖️',
        color: t.color || '#2563EB',
        badgeClass: t.badgeClass || ''
      })),
      categories: (dbData.categories || []).map(c => ({
        key: c.key,
        name: c.name,
        icon: c.icon || '📍',
        sub: c.sub || c.name
      }))
    };
  }

  // 10. Full Sync: ส่งข้อมูลทั้งหมดขึ้น Google Sheets (ทุกชีต)
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

      const settingsData = this.formatSettingsPayload(dbData);

      const result = await this.sendPayload('FULL_SYNC', {
        summary: {
          totalPins: pinsList.length,
          totalUsers: usersList.length,
          totalReports: reportsList.length,
          totalRooms: settingsData.chatRooms.length,
          totalTiers: settingsData.rankTiers.length,
          syncedAt: new Date().toLocaleString('th-TH')
        },
        pins: pinsList,
        users: usersList,
        reports: reportsList,
        settings: settingsData.settings,
        chatRooms: settingsData.chatRooms,
        rankTiers: settingsData.rankTiers,
        categories: settingsData.categories
      });

      this.isSyncing = false;
      return result;
    } catch (err) {
      this.isSyncing = false;
      return { success: false, error: err.message };
    }
  }

  // 11. ดึงข้อมูลทั้งหมดจาก Google Sheets กลับมา (Two-Way Pull)
  async fetchFullDataFromSheets() {
    if (!this.config.enabled || !this.config.webhookUrl) return null;

    // วิธีที่ 1: ดึงข้อมูลผ่าน POST 'FETCH_ALL' (เสถียรที่สุดและรองรับ Redirects อัตโนมัติ)
    try {
      const postResult = await this.sendPayload('FETCH_ALL', {});
      if (postResult && postResult.success && postResult.data && postResult.data.status === 'OK') {
        return postResult.data;
      }
    } catch (e) {
      // Continue to GET fallback
    }

    // วิธีที่ 2: Fallback ดึงข้อมูลผ่าน GET (doGet)
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

  // 12. ฟังก์ชันดึงและประยุกต์ใช้ข้อมูลจาก Google Sheets (Auto Apply Remote Changes)
  async pullAndApplyFromSheets(db) {
    if (!this.config.enabled || !this.config.webhookUrl) return { success: false, reason: 'Sheets sync disabled' };
    
    try {
      const sheetData = await this.fetchFullDataFromSheets();
      if (!sheetData || sheetData.status !== 'OK') {
        return { success: false, reason: 'Invalid response from Google Sheets' };
      }

      // นำข้อมูลจาก Sheets มาประยุกต์ใช้ใน database
      const applied = db.applyRemoteSheetsData(sheetData);
      return { success: true, applied };
    } catch (e) {
      console.warn('⚠️ Error pulling from Google Sheets:', e.message);
      return { success: false, error: e.message };
    }
  }

  // 13. ฟังก์ชันกู้คืนหมุดและการตั้งค่าเมื่อเซิร์ฟเวอร์เปิดขึ้นมาใหม่ (Startup Restore)
  async restorePinsFromSheets(db) {
    console.log('🔄 [SHEETS RESTORE] Checking & Restoring pins and settings from Google Sheets on boot...');
    return this.pullAndApplyFromSheets(db);
  }

  // 14. ทดสอบการเชื่อมต่อ (Ping Test)
  async testConnection() {
    return this.sendPayload('PING', {
      message: 'ทดสอบการเชื่อมต่อระบบ MSU Traffic กับ Google Sheets สำเร็จ! 🚀'
    });
  }

  getGoogleAppsScriptTemplate() {
    return `/**
 * ==============================================================================
 * 🚀 MSU Traffic & Campus Life - Google Sheets Webhook App (Season 1 Edition)
 * ระบบเชื่อมต่อและซิงค์ข้อมูลกับ Google Sheets อัตโนมัติ (หมุด, ยศ, ห้องแชท, การตั้งค่า)
 * ==============================================================================
 * วิธีติดตั้ง:
 * 1. วางโค้ดนี้ใน: Google Sheets > ส่วนขยาย (Extensions) > Apps Script
 * 2. กด "ทำให้ใช้งานได้ (Deploy)" > "การทำให้ใช้งานได้ใหม่ (New Deployment)"
 * 3. เลือกประเภทเป็น "เว็บแอป (Web App)"
 * 4. ตั้งค่า "ผู้มีสิทธิ์เข้าถึง (Who has access)" เป็น "ทุกคน (Anyone)"
 * 5. กด Deploy แล้วคัดลอก URL เว็บแอปมาใส่ในเว็บ MSU Traffic
 * ==============================================================================
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
  throw new Error("ไม่พบ Active Spreadsheet กรุณาระบุ SPREADSHEET_ID ในบรรทัดที่ 16 ของโค้ด");
}

function readAllSheetsData(ss) {
  // 1. ดึงข้อมูลหมุด
  var pinSheet = ss.getSheetByName("📌 รายงานด่าน (Pins)");
  var pins = [];
  if (pinSheet && pinSheet.getLastRow() > 1) {
    var pinData = pinSheet.getRange(2, 1, pinSheet.getLastRow() - 1, pinSheet.getLastColumn()).getValues();
    pins = pinData.map(function(row) {
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

  // 2. ดึงข้อมูลการตั้งค่าเว็บไซต์
  var settingSheet = ss.getSheetByName("⚙️ ตั้งค่าเว็บไซต์ (Settings)");
  var settings = {};
  if (settingSheet && settingSheet.getLastRow() > 1) {
    var sData = settingSheet.getRange(2, 1, settingSheet.getLastRow() - 1, settingSheet.getLastColumn()).getValues();
    sData.forEach(function(row) {
      var key = row[0];
      var val = row[2];
      var enabled = row[3];
      if (key) {
        settings[key] = {
          name: row[1],
          value: val,
          enabled: enabled === true || enabled === "เปิดใช้งาน" || enabled === "TRUE"
        };
      }
    });
  }

  // 3. ดึงข้อมูลห้องแชท
  var roomSheet = ss.getSheetByName("💬 ห้องแชต (Chat Rooms)");
  var chatRooms = [];
  if (roomSheet && roomSheet.getLastRow() > 1) {
    var rData = roomSheet.getRange(2, 1, roomSheet.getLastRow() - 1, roomSheet.getLastColumn()).getValues();
    chatRooms = rData.map(function(row) {
      var st = row[4];
      var isEn = (st === "เปิดใช้งาน" || st === true || st === "TRUE" || row[5] === true || row[5] === "TRUE");
      return {
        id: row[0],
        name: row[1],
        icon: row[2],
        desc: row[3],
        status: isEn ? "เปิดใช้งาน" : "ปิดปรับปรุง",
        enabled: isEn,
        msgCount: parseInt(row[6]) || 0
      };
    });
  }

  // 4. ดึงข้อมูลระดับยศ Rank Tiers
  var rankSheet = ss.getSheetByName("🎖️ ระดับยศ (Rank Tiers)");
  var rankTiers = [];
  if (rankSheet && rankSheet.getLastRow() > 1) {
    var rkData = rankSheet.getRange(2, 1, rankSheet.getLastRow() - 1, rankSheet.getLastColumn()).getValues();
    rankTiers = rkData.map(function(row) {
      return {
        level: parseInt(row[0]) || 1,
        key: row[1],
        name: row[2],
        title: row[3],
        minExp: parseInt(row[4]) || 0,
        maxExp: (row[5] === "ไม่จำกัด" || row[5] === "" || row[5] === 999999) ? Infinity : (parseInt(row[5]) || 999),
        icon: row[6],
        color: row[7],
        badgeClass: row[8]
      };
    });
  }

  // 5. ดึงข้อมูลหมวดหมู่ด่าน
  var catSheet = ss.getSheetByName("🏷️ หมวดหมู่ด่าน (Categories)");
  var categories = [];
  if (catSheet && catSheet.getLastRow() > 1) {
    var cData = catSheet.getRange(2, 1, catSheet.getLastRow() - 1, catSheet.getLastColumn()).getValues();
    categories = cData.map(function(row) {
      return {
        key: row[0],
        name: row[1],
        icon: row[2],
        sub: row[3]
      };
    });
  }

  return {
    status: "OK",
    timestamp: new Date().toISOString(),
    pins: pins,
    settings: settings,
    chatRooms: chatRooms,
    rankTiers: rankTiers,
    categories: categories
  };
}

function doGet(e) {
  try {
    var ss = getSpreadsheet();
    var result = readAllSheetsData(ss);
    return ContentService.createTextOutput(JSON.stringify(result))
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

    if (action === "FETCH_ALL" || action === "GET_DATA" || action === "PULL") {
      var result = readAllSheetsData(ss);
      return ContentService.createTextOutput(JSON.stringify(result))
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
      // 1. Pins Sheet
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

      // 2. Users Sheet
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

      // 3. Reports Sheet
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

      // 4. Settings Sheet
      if (data.settings) {
        saveSettingsToSheet(ss, data.settings);
      }

      // 5. Chat Rooms Sheet
      if (data.chatRooms) {
        saveChatRoomsToSheet(ss, data.chatRooms);
      }

      // 6. Rank Tiers Sheet
      if (data.rankTiers) {
        saveRankTiersToSheet(ss, data.rankTiers);
      }

      // 7. Categories Sheet
      if (data.categories) {
        saveCategoriesToSheet(ss, data.categories);
      }
    }

    if (action === "SYNC_SETTINGS") {
      if (data.settings) saveSettingsToSheet(ss, data.settings);
      if (data.chatRooms) saveChatRoomsToSheet(ss, data.chatRooms);
      if (data.rankTiers) saveRankTiersToSheet(ss, data.rankTiers);
      if (data.categories) saveCategoriesToSheet(ss, data.categories);
    }

    if (action === "UPDATE_CHAT_ROOMS" && data.chatRooms) {
      saveChatRoomsToSheet(ss, data.chatRooms);
    }

    if (action === "UPDATE_RANK_TIERS" && data.rankTiers) {
      saveRankTiersToSheet(ss, data.rankTiers);
    }

    if (action === "UPDATE_CATEGORIES" && data.categories) {
      saveCategoriesToSheet(ss, data.categories);
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

function saveSettingsToSheet(ss, settingsList) {
  var sheet = getOrCreateSheet(ss, "⚙️ ตั้งค่าเว็บไซต์ (Settings)", [
    "Setting Key", "ชื่อการตั้งค่า", "ค่าปัจจุบัน (Value)", "สถานะ (Enabled)", "คำอธิบาย"
  ]);
  clearDataRows(sheet);
  if (Array.isArray(settingsList) && settingsList.length > 0) {
    var rows = settingsList.map(function(s) {
      return [s.key, s.name, s.value, s.enabled ? "เปิดใช้งาน" : "ปิดใช้งาน", ""];
    });
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function saveChatRoomsToSheet(ss, roomsList) {
  var sheet = getOrCreateSheet(ss, "💬 ห้องแชต (Chat Rooms)", [
    "Room ID", "ชื่อห้องแชต", "ไอคอน", "คำอธิบาย", "สถานะห้อง (Status)", "เปิดใช้งาน (Boolean)", "จำนวนข้อความ", "รีเซ็ตล่าสุด"
  ]);
  clearDataRows(sheet);
  if (Array.isArray(roomsList) && roomsList.length > 0) {
    var rows = roomsList.map(function(r) {
      return [r.id, r.name, r.icon, r.desc, r.status, r.enabled ? "TRUE" : "FALSE", r.msgCount, r.lastReset || "-"];
    });
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function saveRankTiersToSheet(ss, tiersList) {
  var sheet = getOrCreateSheet(ss, "🎖️ ระดับยศ (Rank Tiers)", [
    "Level", "Rank Key", "ชื่อยศ (Rank Name)", "Title", "EXP ขั้นต่ำ (Min EXP)", "EXP สูงสุด (Max EXP)", "ไอคอน (Icon)", "รหัสสี (Hex Color)", "Badge Class"
  ]);
  clearDataRows(sheet);
  if (Array.isArray(tiersList) && tiersList.length > 0) {
    var rows = tiersList.map(function(t) {
      return [t.level, t.key, t.name, t.title, t.minExp, t.maxExp, t.icon, t.color, t.badgeClass];
    });
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function saveCategoriesToSheet(ss, catList) {
  var sheet = getOrCreateSheet(ss, "🏷️ หมวดหมู่ด่าน (Categories)", [
    "Category Key", "ชื่อหมวดหมู่ / คำค้นหา", "ไอคอน", "คำอธิบายย่อย"
  ]);
  clearDataRows(sheet);
  if (Array.isArray(catList) && catList.length > 0) {
    var rows = catList.map(function(c) {
      return [c.key, c.name, c.icon, c.sub];
    });
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
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
    headerRange.setBackground("#1E3A8A").setFontColor("#FFFFFF").setFontWeight("bold");
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
