const fs = require('fs');
const path = require('path');
const googleSheetsService = require('../services/googleSheetsService');

const DB_DIR = path.join(__dirname, '../../data');
const DB_FILE = path.join(DB_DIR, 'database.json');

// Ensure data folder exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// 🏛️ MSU Campus Coordinates for Geofencing
const MSU_CENTER = {
  lat: 16.2468,
  lng: 103.2520,
  khamriang: { lat: 16.2468, lng: 103.2520, radiusKm: 12.0 },
  downtown: { lat: 16.1983, lng: 103.2798, radiusKm: 10.0 },
  maxAllowedRadiusKm: 25.0 // รัศมีสูงสุดที่อนุญาตให้แชตได้
};

// 📐 Haversine Formula for Distance Calculation (km)
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round((R * c) * 10) / 10;
}

// Check if user is in MSU Geofence
function isInsideMSUGeofence(lat, lng) {
  if (!lat || !lng) return { inZone: false, distanceKm: 999 };
  const dKhamriang = calculateDistanceKm(lat, lng, MSU_CENTER.khamriang.lat, MSU_CENTER.khamriang.lng);
  const dDowntown = calculateDistanceKm(lat, lng, MSU_CENTER.downtown.lat, MSU_CENTER.downtown.lng);
  const minDistance = Math.min(dKhamriang, dDowntown);
  return {
    inZone: minDistance <= MSU_CENTER.maxAllowedRadiusKm,
    distanceKm: minDistance,
    nearCampus: dKhamriang <= dDowntown ? 'มอใหม่ (ขามเรียง)' : 'มอเก่า (ในเมือง)'
  };
}

// 🎖️ Season 1 Rank Tiers (Default)
const RANK_TIERS = [
  { level: 1, key: 'novice', name: 'ผู้สัญจรมือใหม่', minExp: 0, maxExp: 99, icon: '🥉', color: '#B45309', badgeClass: 'rank-bronze', title: 'Novice Scout' },
  { level: 2, key: 'scout', name: 'สายสืบ มมส', minExp: 100, maxExp: 299, icon: '🥈', color: '#475569', badgeClass: 'rank-silver', title: 'Campus Scout' },
  { level: 3, key: 'warden', name: 'ผู้พิทักษ์ทางหลวง', minExp: 300, maxExp: 699, icon: '🥇', color: '#D97706', badgeClass: 'rank-gold', title: 'Traffic Warden' },
  { level: 4, key: 'veteran', name: 'ยอดสายตรวจขามเรียง', minExp: 700, maxExp: 1499, icon: '💎', color: '#2563EB', badgeClass: 'rank-diamond', title: 'Khamriang Veteran' },
  { level: 5, key: 'legend', name: 'ตำนานมีด่านบอกด้วย', minExp: 1500, maxExp: Infinity, icon: '👑', color: '#7C3AED', badgeClass: 'rank-legend', title: 'MSU Legend' }
];

function calculateRank(exp = 0, isDev = false, customTiers = null) {
  if (isDev) {
    return {
      level: 99,
      key: 'dev',
      name: 'Developer / ผู้พัฒนาระบบ',
      title: 'System Creator',
      icon: '👑',
      color: '#F59E0B',
      badgeClass: 'rank-dev',
      exp: exp,
      nextRank: null,
      pointsToNext: 0,
      progressPercent: 100
    };
  }

  const tiers = (Array.isArray(customTiers) && customTiers.length > 0) ? customTiers : RANK_TIERS;

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const maxExpVal = (tier.maxExp === Infinity || tier.maxExp === 'ไม่จำกัด' || tier.maxExp === null) ? Infinity : Number(tier.maxExp);
    const minExpVal = Number(tier.minExp) || 0;

    if (exp >= minExpVal && (maxExpVal === Infinity || exp <= maxExpVal)) {
      const nextTier = tiers[i + 1] || null;
      let pointsToNext = 0;
      let progressPercent = 100;

      if (nextTier) {
        const nextMinExp = Number(nextTier.minExp) || (minExpVal + 100);
        const range = nextMinExp - minExpVal;
        const currentProgress = exp - minExpVal;
        pointsToNext = Math.max(0, nextMinExp - exp);
        progressPercent = Math.min(100, Math.max(0, Math.round((currentProgress / Math.max(1, range)) * 100)));
      }

      return {
        level: tier.level,
        key: tier.key,
        name: tier.name,
        title: tier.title || tier.name,
        icon: tier.icon || '🎖️',
        color: tier.color || '#2563EB',
        badgeClass: tier.badgeClass || 'rank-bronze',
        exp: exp,
        nextRank: nextTier ? nextTier.name : null,
        pointsToNext: pointsToNext,
        progressPercent: progressPercent
      };
    }
  }

  return {
    ...tiers[0],
    exp: 0,
    nextRank: tiers[1] ? tiers[1].name : null,
    pointsToNext: tiers[1] ? (Number(tiers[1].minExp) || 100) : 100,
    progressPercent: 0
  };
}

// Default Season 1 Data Template
function getInitialData() {
  const now = Date.now();
  const weekInMs = 7 * 24 * 60 * 60 * 1000;

  return {
    season: 1,
    seasonName: 'Season 1: ปฐมบทชาว มมส',
    seasonStart: now,
    weekNumber: 1,
    weekStart: now,
    weekEnd: now + weekInMs,
    rank_tiers: JSON.parse(JSON.stringify(RANK_TIERS)),

    users: {
      "dev_java5263": {
        id: "dev_java5263",
        email: "java5263@gmail.com",
        name: "Java (Lead Developer)",
        picture: "https://ui-avatars.com/api/?name=MSU&background=2563EB&color=fff",
        role: "dev",
        badge: "👑 DEV",
        trustScore: 100,
        weeklyScore: 0,
        allTimeScore: 500,
        pinsCreated: 0,
        pinsVerified: 0,
        reportsCount: 0,
        accurateReports: 0,
        isMsuStudent: true,
        isDev: true,
        status: "active",
        createdAt: now,
        lastActiveAt: now
      }
    },

    pins: [
      {
        id: "pin-init-1",
        title: "จุดตรวจหมวกกันน็อก หน้าป้าย มมส",
        locationName: "หน้าป้าย มมส (มอใหม่ ขามเรียง)",
        campusZone: "มอใหม่ (ขามเรียง)",
        lat: 16.2467,
        lng: 103.2520,
        type: "helmet",
        direction: "ฝั่งขาเข้ามอใหม่ (มุ่งหน้าคณะวิทยาศาสตร์)",
        description: "ตรวจหมวกกันน็อกและใบขับขี่ ขับขี่ปลอดภัยสวมหมวกกันน็อกด้วยครับ",
        imageUrl: null,
        severity: "medium",
        isAnonymous: false,
        reporterId: "dev_java5263",
        reporter: {
          id: "dev_java5263",
          name: "Java (Lead Dev)",
          email: "java5263@gmail.com",
          badge: "👑 DEV",
          isDev: true,
          isMsuStudent: true,
          picture: "https://ui-avatars.com/api/?name=MSU&background=2563EB&color=fff"
        },
        likes: [],
        views: 45,
        votes: {
          up: ["dev_java5263", "user_demo_1", "user_demo_2"],
          down: []
        },
        reports: [],
        status: "active",
        createdAt: now - (35 * 60 * 1000), // 35 mins ago
        expiresAt: now + (6 * 60 * 60 * 1000) // 6 hours decay
      },
      {
        id: "pin-init-2",
        title: "ตรวจเป่าแอลกอฮอล์ โค้งท่าขอนยาง",
        locationName: "โค้งยูเทิร์น ท่าขอนยาง (หน้า 7-Eleven)",
        campusZone: "ท่าขอนยาง (รอบมอใหม่)",
        lat: 16.2398,
        lng: 103.2612,
        type: "alcohol",
        direction: "ฝั่งมุ่งหน้าสะพานข้ามคลอง",
        description: "จุดตรวจเข้มงวดช่วงกลางคืน เมาไม่ขับ กลับรถรับส่ง",
        imageUrl: null,
        severity: "high",
        isAnonymous: true,
        reporterId: "dev_java5263",
        reporter: {
          id: "dev_java5263",
          name: "นิสิตนิรนาม",
          email: "",
          badge: "🎓 MSU",
          isDev: false,
          isMsuStudent: true,
          picture: "https://ui-avatars.com/api/?name=MSU&background=2563EB&color=fff"
        },
        likes: [],
        views: 28,
        votes: {
          up: ["user_demo_3"],
          down: []
        },
        reports: [],
        status: "active",
        createdAt: now - (50 * 60 * 1000),
        expiresAt: now + (8 * 60 * 60 * 1000)
      }
    ],

    pin_reports: [],
    pin_likes: [],

    chat_rooms: [
      { id: "general", name: "ทั่วไป (General)", icon: "💬", desc: "พูดคุยแลกเปลี่ยนข่าวสารทั่วไปรอบ มมส", msgCount: 0 },
      { id: "marketplace", name: "ซื้อ-ขาย (Market)", icon: "🛍️", desc: "ส่งต่อของใช้ หนังสือ หอพัก อุปกรณ์การเรียน", msgCount: 0 },
      { id: "friends", name: "หาเพื่อน (Find Friends)", icon: "👥", desc: "หาเพื่อนติว กินข้าว เล่นกีฬา กลับหอ", msgCount: 0 },
      { id: "help", name: "ช่วยเหลือ & ของหาย (Help)", icon: "🆘", desc: "ของหาย ถามทาง ขอความช่วยเหลือนิสิต", msgCount: 0 },
      { id: "events", name: "กิจกรรม (Events)", icon: "🎪", desc: "กิจกรรมรอบมหาวิทยาลัย คอนเสิร์ต งานคณะ", msgCount: 0 }
    ],

    chat_messages: [
      {
        id: "msg-welcome-1",
        roomId: "general",
        senderId: "dev_java5263",
        senderName: "Java (Lead Dev)",
        senderEmail: "java5263@gmail.com",
        senderBadge: "👑 DEV",
        senderPicture: "https://ui-avatars.com/api/?name=MSU&background=2563EB&color=fff",
        text: "🎉 ยินดีต้อนรับสู่ห้อง Local Chat ของนิสิต มมส (Season 1)! ห้องแชตนี้จะเปิดให้เฉพาะบัญชี @msu.ac.th ที่อยู่ในรัศมีรอบ มมส เท่านั้นครับ",
        isAnonymous: false,
        location: { lat: 16.2468, lng: 103.2520, distKm: 0.0, inZone: true },
        createdAt: now
      }
    ],

    rider_requests: [],
    message_reports: [],
    warnings: [],
    bans: [],
    visitors: {
      total: 0,
      today: 0,
      lastDate: new Date().toISOString().split('T')[0],
      dailyHistory: {}
    },
    system_config: {
      globalChatEnabled: true,
      allowAllEmails: true
    },
    audit_logs: [
      {
        id: "audit-init",
        action: "SEASON_1_LAUNCH",
        userId: "dev_java5263",
        targetId: "system",
        details: "เปิดตัวระบบ MSU Traffic & Campus Life Season 1 อย่างเป็นทางการ",
        createdAt: now
      }
    ]
  };
}

class Database {
  constructor() {
    this.data = this.loadData();
    this.io = null;
    this.checkWeeklyReset();
    this.checkPinDecay();
    this.checkMidnightChatReset();
    
    // 🔄 Two-Way Google Sheets Auto-Restore & Periodic Sync (ทุก 30 วินาที)
    googleSheetsService.restorePinsFromSheets(this);
    googleSheetsService.startAutoSyncTimer(this, 30000);

    // Background interval to decay pins, check weekly reset and midnight chat reset
    setInterval(() => {
      this.checkPinDecay();
      this.checkWeeklyReset();
      this.checkMidnightChatReset();
    }, 60 * 1000);
  }

  setSocketIO(io) {
    this.io = io;
  }

  loadData() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        // Ensure all Season 1 collections exist
        if (!parsed.season || !parsed.chat_rooms || !parsed.users) {
          const fresh = getInitialData();
          this.saveData(fresh);
          return fresh;
        }
        if (!parsed.rank_tiers || !Array.isArray(parsed.rank_tiers) || parsed.rank_tiers.length === 0) {
          parsed.rank_tiers = JSON.parse(JSON.stringify(RANK_TIERS));
          this.saveData(parsed);
        }
        if (!parsed.deleted_pins || !Array.isArray(parsed.deleted_pins)) {
          parsed.deleted_pins = [];
          this.saveData(parsed);
        }
        return parsed;
      }
    } catch (e) {
      console.error('Error loading database, resetting to clean Season 1:', e);
    }
    const init = getInitialData();
    this.saveData(init);
    return init;
  }

  saveData(data = this.data) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('Error saving database:', e);
    }
  }

  // ----------------------------------------------------
  // 🏷️ Dynamic Categories & Filter Words Engine (Dev Configurable)
  // ----------------------------------------------------
  getCategories() {
    if (!this.data.categories || !Array.isArray(this.data.categories) || this.data.categories.length === 0) {
      this.data.categories = [
        { key: "helmet", name: "หมวก/ใบขับขี่", icon: "👮‍♂️", sub: "ใบขับขี่ / อุปกรณ์ส่วนควบ" },
        { key: "alcohol", name: "เป่าแอล", icon: "🍺", sub: "เป่าแอลกอฮอล์ยามค่ำคืน" },
        { key: "security", name: "ตรวจค้น", icon: "🚔", sub: "ตรวจค้นสิ่งผิดกฎหมาย" },
        { key: "traffic", name: "รถติด", icon: "🚗", sub: "ชะลอตัวช่วงเร่งด่วน" },
        { key: "accident", name: "อุบัติเหตุ", icon: "⚠️", sub: "โปรดระมัดระวัง" }
      ];
      this.saveData();
    }
    return this.data.categories;
  }

  saveCategories(categories, userId = 'dev_java5263') {
    if (Array.isArray(categories) && categories.length > 0) {
      this.data.categories = categories;
      this.saveData();
      this.logAudit('UPDATE_CATEGORIES', userId, 'system', `อัปเดตรายการหมวดหมู่/คำค้นหา (${categories.length} รายการ)`);
      
      // 🔄 ซิงค์หมวดหมู่ขึ้น Google Sheets ทันที (Instant Push)
      googleSheetsService.syncCategoriesUpdate(this.data.categories).catch(e => console.warn('Sheets categories sync error:', e));

      if (this.io) {
        this.io.emit('categories_updated', this.data.categories);
      }
      return this.data.categories;
    }
    return this.getCategories();
  }

  // ----------------------------------------------------
  // 🎖️ Dynamic Rank Tiers Engine (Dev & Sheets Configurable)
  // ----------------------------------------------------
  getRankTiers() {
    if (!this.data.rank_tiers || !Array.isArray(this.data.rank_tiers) || this.data.rank_tiers.length === 0) {
      this.data.rank_tiers = JSON.parse(JSON.stringify(RANK_TIERS));
      this.saveData();
    }
    return this.data.rank_tiers;
  }

  saveRankTiers(tiers, adminId = 'dev_admin') {
    if (Array.isArray(tiers) && tiers.length > 0) {
      this.data.rank_tiers = tiers;
      this.saveData();
      this.logAudit('UPDATE_RANK_TIERS', adminId, 'rank_tiers', `อัปเดตการตั้งค่าระดับยศ (${tiers.length} ระดับ)`);
      
      // 🔄 ซิงค์ระดับยศขึ้น Google Sheets ทันที (Instant Push)
      googleSheetsService.syncRankTiersUpdate(this.data.rank_tiers).catch(e => console.warn('Sheets rank tiers sync error:', e));

      if (this.io) {
        this.io.emit('rank_tiers_updated', this.data.rank_tiers);
      }
      return this.data.rank_tiers;
    }
    return this.getRankTiers();
  }

  addCategory(category, userId = 'dev_java5263') {
    const list = this.getCategories();
    const cleanKey = (category.key || category.name || '').toLowerCase().trim().replace(/[^a-z0-9_]/g, '_') || `cat_${Date.now()}`;
    
    // Check if key already exists
    const existsIndex = list.findIndex(c => c.key === cleanKey);
    const newEntry = {
      key: cleanKey,
      name: category.name || 'หมวดหมู่ใหม่',
      icon: category.icon || '📍',
      sub: category.sub || category.name || 'หมวดหมู่เพิ่มเติม'
    };

    if (existsIndex >= 0) {
      list[existsIndex] = newEntry;
    } else {
      list.push(newEntry);
    }

    return this.saveCategories(list, userId);
  }

  deleteCategory(key, userId = 'dev_java5263') {
    let list = this.getCategories();
    if (list.length <= 1) {
      throw new Error('ต้องมีหมวดหมู่อย่างน้อย 1 รายการ');
    }
    list = list.filter(c => c.key !== key);
    return this.saveCategories(list, userId);
  }

  // ----------------------------------------------------
  // ⏱️ Pin Decay Lifecycle Engine (หมดอายุอัตโนมัติ)
  // ----------------------------------------------------
  checkPinDecay() {
    const now = Date.now();
    let updated = false;

    this.data.pins.forEach(pin => {
      if (pin.status === 'active') {
        // 1. Check expiration timestamp (Decay)
        if (pin.expiresAt && now > pin.expiresAt) {
          pin.status = 'cleared';
          updated = true;
        }
        // 2. Downvote threshold check (if downvotes >= 3 and downvotes > upvotes * 1.5)
        const upCount = pin.votes?.up?.length || 0;
        const downCount = pin.votes?.down?.length || 0;
        if (downCount >= 3 && downCount > upCount * 1.5) {
          pin.status = 'cleared';
          updated = true;
        }
      }
    });

    if (updated) {
      this.saveData();
    }
  }

  // ----------------------------------------------------
  // 🏆 Midnight Batch Leaderboard Engine (คำนวณและสรุปอันดับทุกเที่ยงคืน 00:00 น.)
  // ----------------------------------------------------
  checkMidnightLeaderboardCalculation() {
    try {
      const now = new Date();
      // เวลาประเทศไทย (UTC+7)
      const thaiTime = new Date(Date.now() + (7 * 3600 * 1000));
      const todayStr = thaiTime.toISOString().slice(0, 10);
      const thaiHour = thaiTime.getUTCHours();

      // ถ้ายังไม่มี Snapshot อันดับรอบแรก ให้สร้างทันที
      if (!this.data.leaderboard_snapshot || !this.data.leaderboard_snapshot.rankings) {
        this.generateMidnightLeaderboardSnapshot();
        return;
      }

      // เมื่อขึ้นวันใหม่ (เที่ยงคืนเป็นต้นไป) และยังไม่ได้สรุปผลของวันนี้
      if (this.data.lastLeaderboardCalcDate !== todayStr && thaiHour >= 0) {
        this.processMidnightCalculation(todayStr);
      }
    } catch (e) {
      console.error('Error in checkMidnightLeaderboardCalculation:', e);
    }
  }

  processMidnightCalculation(todayStr) {
    console.log(`🌙 [MIDNIGHT ENGINE] Starting midnight ranking calculation for: ${todayStr}`);

    // คำนวณและบันทึกผล Snapshot ประจำวันรอบเที่ยงคืน
    this.data.lastLeaderboardCalcDate = todayStr;
    this.data.dayNumber = (this.data.dayNumber || 1) + 1;
    this.data.weekNumber = this.data.dayNumber;

    // คำนวณเวลาเที่ยงคืนถัดไป
    const nextMidnight = new Date();
    nextMidnight.setHours(24, 0, 0, 0);
    this.data.dayEnd = nextMidnight.getTime();
    this.data.weekEnd = nextMidnight.getTime();

    // บันทึก Snapshot อันดับทางการ
    this.generateMidnightLeaderboardSnapshot();

    this.saveData();
    this.logAudit('MIDNIGHT_LEADERBOARD_CALC', 'system', 'leaderboard', `คำนวณและจัดอันดับผู้ใช้รอบเที่ยงคืนเรียบร้อยแล้ว (วันที่ ${todayStr})`);

    if (this.io) {
      this.io.emit('leaderboard_update', this.getWeeklyLeaderboard(10));
    }
  }

  generateMidnightLeaderboardSnapshot() {
    const MIN_EXP_FOR_RANKING = 200; // ❗ ต้องมีแต้ม 200 EXP ขึ้นไปทุกคน (รวม Dev) ถึงจะเริ่มติดอันดับ

    const list = Object.values(this.data.users)
      .filter(u => (((u.weeklyScore || 0) >= MIN_EXP_FOR_RANKING || (u.allTimeScore || 0) >= MIN_EXP_FOR_RANKING)) && !u.email?.includes('audit_test') && !u.id?.startsWith('test_') && !u.id?.startsWith('user_demo_'))
      .map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        picture: u.picture || 'https://ui-avatars.com/api/?name=MSU&background=2563EB&color=fff',
        badge: u.badge,
        isDev: u.isDev,
        trustScore: u.trustScore || 50,
        score: u.weeklyScore || 0,
        todayScore: u.todayEarnedExp || 0,
        allTimeScore: u.allTimeScore || 0,
        pinsCreated: u.pinsCreated || 0,
        rank: calculateRank(u.allTimeScore, u.isDev, this.getRankTiers())
      }))
      .sort((a, b) => b.score - a.score);

    const nextMidnight = new Date();
    nextMidnight.setHours(24, 0, 0, 0);

    this.data.leaderboard_snapshot = {
      calculatedAt: Date.now(),
      nextCalculationAt: nextMidnight.getTime(),
      minExpRequired: MIN_EXP_FOR_RANKING,
      rankings: list
    };

    return this.data.leaderboard_snapshot;
  }

  checkDailyReset() {
    return this.checkMidnightLeaderboardCalculation();
  }

  checkWeeklyReset() {
    return this.checkMidnightLeaderboardCalculation();
  }

  // ----------------------------------------------------
  // 👤 User & Trust Score Operations
  // ----------------------------------------------------
  getUser(userId) {
    return this.data.users[userId] || null;
  }

  getOrCreateUser(userData) {
    if (!userData || !userData.id) return null;
    const now = Date.now();
    const cleanEmail = (userData.email || '').toLowerCase().trim();
    const isDev = userData.isDev || cleanEmail === 'java5263@gmail.com';
    const isMsu = cleanEmail.endsWith('@msu.ac.th');

    if (!this.data.users[userData.id]) {
      const initialTrust = isDev ? 100 : (isMsu ? 60 : 30);
      const userBadge = isDev ? '👑 DEV' : (isMsu ? '🎓 MSU' : '👤 Member');

      this.data.users[userData.id] = {
        id: userData.id,
        email: cleanEmail,
        name: userData.name || cleanEmail.split('@')[0],
        picture: userData.picture || 'https://ui-avatars.com/api/?name=MSU&background=2563EB&color=fff',
        role: isDev ? 'dev' : (isMsu ? 'student' : 'member'),
        badge: userBadge,
        trustScore: initialTrust,
        weeklyScore: 0,
        allTimeScore: 0,
        pinsCreated: 0,
        pinsVerified: 0,
        reportsCount: 0,
        accurateReports: 0,
        isMsuStudent: isMsu,
        isDev: isDev,
        status: 'active',
        createdAt: now,
        lastActiveAt: now
      };
      this.saveData();
      this.logAudit('USER_REGISTER', userData.id, 'users', `ผู้ใช้ลงทะเบียนใหม่ (${cleanEmail})`);
    } else {
      // Update last active, name & high-res Google profile photo
      this.data.users[userData.id].lastActiveAt = now;
      if (userData.name) this.data.users[userData.id].name = userData.name;
      if (userData.picture) {
        let pic = userData.picture;
        if (pic.includes('googleusercontent.com') && /=s\d+(-c)?$/.test(pic)) {
          pic = pic.replace(/=s\d+(-c)?$/, '=s256-c');
        }
        this.data.users[userData.id].picture = pic;
      }
      this.saveData();
    }

    const user = this.data.users[userData.id];
    return {
      ...user,
      rank: calculateRank(user.allTimeScore, user.isDev, this.getRankTiers())
    };
  }

  getUserStats(userId, initialUser = null) {
    if (initialUser) {
      return this.getOrCreateUser(initialUser);
    }
    const user = this.data.users[userId];
    if (!user) return null;
    return {
      ...user,
      rank: calculateRank(user.allTimeScore, user.isDev, this.getRankTiers())
    };
  }

  getUserById(id) {
    if (!id) return null;
    return this.data.users[id] || null;
  }

  getUserByEmail(email) {
    if (!email) return null;
    const cleanEmail = email.toLowerCase().trim();
    return Object.values(this.data.users).find(u => u.email === cleanEmail) || null;
  }

  updateTrustScore(userId, delta, reason = '') {
    const user = this.data.users[userId];
    if (!user || user.isDev) return;

    user.trustScore = Math.max(0, Math.min(100, (user.trustScore || 50) + delta));
    this.saveData();
    this.logAudit('TRUST_SCORE_UPDATE', userId, 'trust', `Trust Score ปรับเปลี่ยน ${delta > 0 ? '+' : ''}${delta} (${reason}) - ปัจจุบัน: ${user.trustScore}`);
  }

  addScore(userId, points, reason = '') {
    const user = this.data.users[userId];
    if (!user) return;

    user.todayEarnedExp = Math.max(0, (user.todayEarnedExp || 0) + points);
    user.weeklyScore = Math.max(0, (user.weeklyScore || 0) + points);
    user.allTimeScore = Math.max(0, (user.allTimeScore || 0) + points);
    this.saveData();
  }

  // ----------------------------------------------------
  // 📍 Pin Operations (Map & Traffic Alerts)
  // ----------------------------------------------------
  getPins(filters = {}) {
    let list = this.data.pins.filter(p => p.status !== 'deleted');

    if (filters.status) {
      list = list.filter(p => p.status === filters.status);
    }
    if (filters.type && filters.type !== 'all') {
      list = list.filter(p => p.type === filters.type);
    }
    if (filters.zone && filters.zone !== 'all') {
      list = list.filter(p => p.campusZone === filters.zone);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(p =>
        (p.title && p.title.toLowerCase().includes(q)) ||
        (p.locationName && p.locationName.toLowerCase().includes(q)) ||
        (p.direction && p.direction.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q))
      );
    }

    // Sort newest first
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  getPinById(id) {
    return this.data.pins.find(p => p.id === id) || null;
  }

  // 🔒 ตรวจสอบโควตาการปักหมุด: 3 หมุด ต่อ 1 ชั่วโมง (ยกเว้น Dev)
  checkUserPinQuota(userId, userEmail, isDev = false) {
    const cleanEmail = (userEmail || '').toLowerCase().trim();
    if (isDev || cleanEmail === 'java5263@gmail.com') {
      return { allowed: true, isDev: true, countLastHour: 0, maxPerHour: 3, remainingLastHour: 999 };
    }

    const now = Date.now();
    const ONE_HOUR_MS = 60 * 60 * 1000; // 1 ชั่วโมง (3,600,000 ms)

    // 1. กรองหมุดทั้งหมดที่สร้างโดยผู้ใช้นี้ (ตาม ID หรือ Email)
    const userPins = (this.data.pins || []).filter(p => {
      if (p.status === 'deleted') return false;
      const isMatchId = userId && (p.reporterId === userId || p.realReporter?.id === userId);
      const isMatchEmail = cleanEmail && (
        (p.realReporter?.email && p.realReporter.email.toLowerCase().trim() === cleanEmail) ||
        (p.reporter?.email && p.reporter.email.toLowerCase().trim() === cleanEmail)
      );
      return isMatchId || isMatchEmail;
    }).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // 2. ตรวจสอบหมุดที่สร้างในรอบ 1 ชั่วโมงที่ผ่านมา (Rolling 1 Hour Window)
    const pinsInLastHour = userPins.filter(p => (now - (p.createdAt || 0)) < ONE_HOUR_MS);

    if (pinsInLastHour.length >= 3) {
      // หาหมุดที่เก่าที่สุดใน 3 หมุดล่าสุด เพื่อคำนวณเวลาที่ต้องรอจนกว่าหมุดนั้นจะพ้น 1 ชั่วโมง
      const oldestOfThree = pinsInLastHour[pinsInLastHour.length - 1];
      const remainingMs = ((oldestOfThree.createdAt || now) + ONE_HOUR_MS) - now;
      const remainingMinutes = Math.max(1, Math.ceil(remainingMs / (60 * 1000)));

      return {
        allowed: false,
        reason: 'PIN_HOURLY_LIMIT_EXCEEDED',
        message: `⏱️ คุณปักหมุดครบโควตาสูงสุด 3 หมุดใน 1 ชั่วโมงแล้ว (กรุณารออีกประมาณ ${remainingMinutes} นาที จึงจะปักหมุดใหม่ได้)`,
        remainingMinutes,
        countLastHour: pinsInLastHour.length,
        maxPerHour: 3,
        remainingLastHour: 0,
        nextAllowedTime: (oldestOfThree.createdAt || now) + ONE_HOUR_MS
      };
    }

    return {
      allowed: true,
      countLastHour: pinsInLastHour.length,
      maxPerHour: 3,
      remainingLastHour: 3 - pinsInLastHour.length
    };
  }

  addPin(pinData) {
    const now = Date.now();
    const id = `pin-${now}-${Math.random().toString(36).substring(2, 7)}`;
    
    // Set decay duration based on type or custom selection
    let lifespanHours = parseFloat(pinData.lifespanHours) || 6;
    if (!pinData.lifespanHours) {
      if (pinData.type === 'accident' || pinData.type === 'traffic') {
        lifespanHours = 3;
      }
    }
    lifespanHours = Math.max(1, Math.min(24, lifespanHours));

    const isAnnouncement = pinData.isAnnouncement === true;
    const isAnon = pinData.isAnonymous === true;
    let reporterObj = pinData.reporter ? { ...pinData.reporter } : {};
    const dbUser = pinData.reporterId ? this.data.users[pinData.reporterId] : null;

    const realReporterObj = {
      id: pinData.reporterId || dbUser?.id || reporterObj.id || 'anonymous',
      name: dbUser?.name || reporterObj.name || pinData.reporterName || 'ผู้ใช้ มมส',
      email: dbUser?.email || reporterObj.email || pinData.reporterEmail || '',
      picture: dbUser?.picture || reporterObj.picture || pinData.reporterPicture || '',
      badge: dbUser?.badge || reporterObj.badge || '🎓 MSU',
      trustScore: dbUser?.trustScore ?? reporterObj.trustScore ?? 50
    };

    if (isAnnouncement && reporterObj) {
      reporterObj = {
        ...reporterObj,
        name: 'MSU Traffic',
        picture: 'https://ui-avatars.com/api/?name=MSU+Traffic&background=1E3A8A&color=fff',
        badge: '📢 MSU Traffic',
        isOfficial: true,
        isAnnouncement: true
      };
    } else if (isAnon) {
      reporterObj.name = 'นิสิตนิรนาม';
      reporterObj.badge = '🎓 นิสิตนิรนาม';
      reporterObj.picture = 'https://ui-avatars.com/api/?name=Anon&background=475569&color=fff';
      reporterObj.realName = realReporterObj.name;
      reporterObj.realEmail = realReporterObj.email;
      reporterObj.realId = realReporterObj.id;
    }

    const newPin = {
      id,
      title: pinData.title || `รายงานด่าน ${pinData.locationName}`,
      locationName: pinData.locationName,
      customLocation: pinData.customLocation || '',
      campusZone: pinData.campusZone || 'มอใหม่ (ขามเรียง)',
      lat: pinData.lat,
      lng: pinData.lng,
      type: pinData.type,
      direction: pinData.direction || '',
      description: pinData.description || '',
      imageUrl: pinData.imageUrl || null,
      severity: pinData.severity || 'medium',
      isAnonymous: isAnon,
      isAnnouncement: isAnnouncement,
      reporterId: pinData.reporterId || 'anonymous',
      reporter: reporterObj,
      realReporter: realReporterObj,
      likes: [],
      views: 1,
      votes: {
        up: [pinData.reporterId],
        down: []
      },
      reports: [],
      status: 'active',
      moveCount: 0,
      createdAt: now,
      expiresAt: now + (lifespanHours * 60 * 60 * 1000)
    };

    this.data.pins.unshift(newPin);

    // Update user stats and score (ปักหมุดรายงานได้ +5 EXP)
    if (pinData.reporterId && this.data.users[pinData.reporterId]) {
      const user = this.data.users[pinData.reporterId];
      user.pinsCreated = (user.pinsCreated || 0) + 1;
      this.addScore(pinData.reporterId, 5, 'สร้างรายงานด่าน');
      this.updateTrustScore(pinData.reporterId, 2, 'ปักหมุดรายงานด่าน');
    }

    this.saveData();
    this.logAudit('PIN_CREATE', pinData.reporterId, id, `ปักหมุดด่านใหม่: ${newPin.locationName}`);
    googleSheetsService.syncNewPin(newPin).catch(e => console.warn('Sheets sync error:', e));
    return newPin;
  }

  updatePinLocation(pinId, lat, lng, locationName, isDev = false) {
    const pin = this.getPinById(pinId);
    if (!pin) return { success: false, error: 'NOT_FOUND', message: 'ไม่พบหมุดนี้' };

    const now = Date.now();
    const elapsedSeconds = Math.floor((now - (pin.createdAt || now)) / 1000);
    const INITIAL_WINDOW_SECONDS = 20;
    const isWithinInitial20s = elapsedSeconds <= INITIAL_WINDOW_SECONDS;

    // 🔒 กฎการย้ายหมุด:
    // 1. ใน 20 วินาทีแรก: ย้ายได้เรื่อยๆ ไม่จำกัดครั้ง
    // 2. หลังจาก 20 วินาทีแรก: ย้ายได้อีก 3 ครั้ง
    // 3. Dev ย้ายได้ตลอดเวลาไม่จำกัด
    if (!isDev) {
      if (isWithinInitial20s) {
        pin.initialMoveCount = (pin.initialMoveCount || 0) + 1;
      } else {
        const currentPostMoves = pin.post20sMoveCount || 0;
        if (currentPostMoves >= 3) {
          return {
            success: false,
            error: 'MOVE_LIMIT_REACHED',
            message: 'คุณได้ใช้โควตาย้ายหมุดครบ 3 ครั้งแล้ว (ล็อกตำแหน่งถาวร)',
            remainingMoves: 0,
            pin
          };
        }
        pin.post20sMoveCount = currentPostMoves + 1;
      }
    }

    pin.lat = lat;
    pin.lng = lng;
    if (locationName) pin.locationName = locationName;
    pin.moveCount = (pin.moveCount || 0) + 1;

    this.saveData();
    this.logAudit('PIN_MOVE', pin.reporterId, pinId, `ย้ายพิกัดหมุดเป็น [${lat}, ${lng}]`);
    googleSheetsService.syncPinUpdate(pin).catch(e => console.warn('Sheets sync error:', e));

    const postMovesUsed = pin.post20sMoveCount || 0;
    return {
      success: true,
      pin,
      isWithinInitial20s,
      secondsRemaining: isWithinInitial20s ? Math.max(0, INITIAL_WINDOW_SECONDS - elapsedSeconds) : 0,
      moveCount: pin.moveCount,
      post20sMovesRemaining: isDev ? 999 : Math.max(0, 3 - postMovesUsed)
    };
  }

  deletePin(pinId, userId = 'dev_admin') {
    const targetId = String(pinId).trim();
    const initialCount = this.data.pins.length;
    
    // 🛡️ บันทึกรายการ ID หมุดที่ถูกลบ (Tombstone) ป้องกันไม่ให้ Google Sheets Auto-Sync ดึงกลับมาคืน
    if (!this.data.deleted_pins) this.data.deleted_pins = [];
    if (!this.data.deleted_pins.includes(targetId)) {
      this.data.deleted_pins.push(targetId);
      if (this.data.deleted_pins.length > 500) {
        this.data.deleted_pins.shift();
      }
    }

    // 1. ลบหมุดออกจากรายการ pins ทั้งหมด
    this.data.pins = this.data.pins.filter(p => String(p.id).trim() !== targetId);
    const deletedCount = initialCount - this.data.pins.length;

    // 2. ล้างข้อความแชตสดประจำหมุดนี้ทั้งหมด
    this.data.pin_chat_messages = (this.data.pin_chat_messages || []).filter(m => String(m.pinId).trim() !== targetId);

    // 3. ล้างประวัติการรีพอร์ตหมุดนี้ทั้งหมด
    this.data.pin_reports = (this.data.pin_reports || []).filter(r => String(r.pinId).trim() !== targetId);

    // 4. ล้างไลก์และแฟล็กของหมุดนี้
    this.data.pin_likes = (this.data.pin_likes || []).filter(l => String(l.pinId).trim() !== targetId);
    if (this.data.flagged_reports) {
      this.data.flagged_reports = this.data.flagged_reports.filter(f => String(f.pinId).trim() !== targetId);
    }

    // 5. บันทึกลงไฟล์ database.json ทันที
    this.saveData();
    this.logAudit('PIN_DELETE', userId, targetId, `ลบหมุดด่าน ${targetId} ถาวรออกจากระบบ`);

    // 6. ซิงค์คำสั่งลบไปยัง Google Sheets ทันที
    googleSheetsService.syncPinDelete(targetId).catch(e => console.warn('Sheets delete sync error:', e));

    // 7. ส่งสัญญาณเรียลไทม์ให้ทุกหน้าจอถอดหมุดออกทันที
    if (this.io) {
      this.io.emit('report_deleted', targetId);
      this.io.emit('stats_update', this.getStatistics());
    }

    return true;
  }

  updatePinStatus(pinId, status, userId = 'dev_admin') {
    const pin = this.getPinById(pinId);
    if (!pin) return { success: false, error: 'NOT_FOUND', message: 'ไม่พบหมุดนี้' };

    const oldStatus = pin.status;
    if (status === 'deleted') {
      if (!this.data.deleted_pins) this.data.deleted_pins = [];
      if (!this.data.deleted_pins.includes(pinId)) {
        this.data.deleted_pins.push(pinId);
      }
      const idx = this.data.pins.findIndex(p => p.id === pinId);
      if (idx !== -1) {
        this.data.pins.splice(idx, 1);
      }
      googleSheetsService.syncPinDelete(pinId).catch(e => console.warn('Sheets delete sync error:', e));
    } else {
      pin.status = status;
      googleSheetsService.syncPinUpdate(pin).catch(e => console.warn('Sheets update sync error:', e));
    }
    this.saveData();
    this.logAudit('PIN_STATUS_CHANGE', userId, pinId, `เปลี่ยนสถานะหมุดจาก ${oldStatus} -> ${status}`);

    if (this.io) {
      if (status === 'deleted' || status === 'hidden') {
        this.io.emit('report_deleted', pinId);
      } else {
        this.io.emit('report_updated', pin);
      }
      this.io.emit('stats_update', this.getStatistics());
    }
    return { success: true, pin, oldStatus, newStatus: status };
  }

  votePin(pinId, userId, voteType) {
    const pin = this.getPinById(pinId);
    if (!pin) return null;

    pin.votes = pin.votes || { up: [], down: [] };
    const upIndex = pin.votes.up.indexOf(userId);
    const downIndex = pin.votes.down.indexOf(userId);

    if (voteType === 'up') {
      if (upIndex !== -1) {
        pin.votes.up.splice(upIndex, 1);
      } else {
        pin.votes.up.push(userId);
        if (downIndex !== -1) pin.votes.down.splice(downIndex, 1);
        this.addScore(userId, 2, 'โหวตยืนยันด่าน');
      }
    } else if (voteType === 'down') {
      if (downIndex !== -1) {
        pin.votes.down.splice(downIndex, 1);
      } else {
        pin.votes.down.push(userId);
        if (upIndex !== -1) pin.votes.up.splice(upIndex, 1);
        this.addScore(userId, 2, 'โหวตแจ้งยกด่าน');
      }
    }

    // Auto-clear check
    if (pin.votes.down.length >= 3 && pin.votes.down.length > pin.votes.up.length * 1.5) {
      pin.status = 'cleared';
    }

    this.saveData();
    googleSheetsService.syncPinUpdate(pin).catch(e => console.warn('Sheets sync error:', e));
    return pin;
  }

  likePin(pinId, userId) {
    const pin = this.getPinById(pinId);
    if (!pin) return null;
    pin.likes = pin.likes || [];
    const idx = pin.likes.indexOf(userId);
    if (idx === -1) {
      pin.likes.push(userId);
      this.addScore(pin.reporterId, 3, 'ได้รับไลก์จากเพื่อน');
    } else {
      pin.likes.splice(idx, 1);
    }
    this.saveData();
    googleSheetsService.syncPinUpdate(pin).catch(e => console.warn('Sheets sync error:', e));
    return { pin, liked: idx === -1, totalLikes: pin.likes.length };
  }

  viewPin(pinId) {
    const pin = this.getPinById(pinId);
    if (pin) {
      pin.views = (pin.views || 0) + 1;
      this.saveData();
      return pin.views;
    }
    return 0;
  }

  // ----------------------------------------------------
  // 🛡️ Weighted Report System (ป้องกันการปั่นและกลั่นแกล้ง)
  // ----------------------------------------------------
  reportPin(pinId, reporter, reason, details = '') {
    const pin = this.getPinById(pinId);
    if (!pin) return { success: false, error: 'ไม่พบหมุดนี้' };

    const reporterTrust = reporter.trustScore || 50;
    // Calculate report weight based on Trust Score (0.2x to 3.0x)
    let weight = 1.0;
    if (reporterTrust >= 80) weight = 3.0;
    else if (reporterTrust >= 50) weight = 1.0;
    else weight = 0.3;

    const reportObj = {
      id: `report-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      pinId,
      reporterId: reporter.id,
      reporterEmail: reporter.email,
      reporterTrust,
      reason,
      details,
      weight,
      status: 'pending',
      createdAt: Date.now()
    };

    this.data.pin_reports.push(reportObj);
    pin.reports = pin.reports || [];
    pin.reports.push(reportObj.id);

    // Sum weighted reports
    const pinReports = this.data.pin_reports.filter(r => r.pinId === pinId);
    const totalWeight = pinReports.reduce((sum, r) => sum + r.weight, 0);

    // If total weight exceeds 5.0 -> Mark for review or hide temporarily
    if (totalWeight >= 5.0 && pin.status === 'active') {
      pin.status = 'under_review';
      this.logAudit('PIN_UNDER_REVIEW', 'system', pinId, `หมุดถูกระงับชั่วคราวเนื่องจากคะแนน Report สะสม = ${totalWeight}`);
    }

    this.saveData();
    this.logAudit('PIN_REPORT', reporter.id, pinId, `รีพอร์ตหมุดด้วยเหตุผล: ${reason} (น้ำหนัก: ${weight})`);
    googleSheetsService.syncPinReport(reportObj).catch(e => console.warn('Sheets sync error:', e));
    return { success: true, pin, totalWeight };
  }

  // ----------------------------------------------------
  // 💬 Local Geofenced Chat Operations
  // ----------------------------------------------------
  getChatRooms() {
    return this.data.chat_rooms || [];
  }

  updateChatRoomStatus(roomId, enabled, adminId = 'dev_admin') {
    if (!this.data.chat_rooms) return { success: false, error: 'ไม่พบรายการห้องแชท' };
    const room = this.data.chat_rooms.find(r => r.id === roomId);
    if (!room) return { success: false, error: 'ไม่พบห้องแชทที่ระบุ' };

    room.enabled = enabled === true;
    this.saveData();
    this.logAudit('CHAT_ROOM_TOGGLE', adminId, roomId, `ปรับสถานะห้อง [${room.name}] เป็น: ${room.enabled ? 'เปิดใช้งาน' : 'ปิดปรับปรุง'}`);

    // 🔄 ซิงค์การเปลี่ยนสถานะห้องแชทขึ้น Google Sheets ทันที (Instant Push)
    googleSheetsService.syncChatRoomsUpdate(this.data.chat_rooms).catch(e => console.warn('Sheets chat room sync error:', e));

    if (this.io) {
      this.io.emit('chat_rooms_updated', this.data.chat_rooms);
      this.io.emit('chat_room_status_changed', {
        roomId: room.id,
        roomName: room.name,
        enabled: room.enabled
      });
    }

    return {
      success: true,
      room,
      message: `ปรับสถานะห้อง ${room.name} เป็น ${room.enabled ? 'เปิดใช้งาน' : 'ปิดปรับปรุง (เร็วๆ นี้)'} เรียบร้อยแล้ว`
    };
  }

  getChatMessages(roomId, limit = 50) {
    const msgs = (this.data.chat_messages || [])
      .filter(m => m.roomId === roomId)
      .slice(-limit);
    return msgs;
  }

  addChatMessage({ roomId, sender, text, lat, lng, isAnonymous = false, isAnnouncement = false }) {
    const cleanEmail = (sender.email || '').toLowerCase().trim();
    const isDev = sender.isDev === true || cleanEmail === 'java5263@gmail.com';
    const isMsu = cleanEmail.endsWith('@msu.ac.th');

    // ตรวจสอบว่าผู้ใช้มีสิทธิ์ RIDER หรือ Global Chat Permission หรือไม่
    const dbUser = this.getUserById(sender.id) || this.getUserByEmail(cleanEmail);
    const isRider = sender.isRider === true || (dbUser && dbUser.isRider === true);
    const canChatGlobal = sender.canChatGlobal === true || (dbUser && dbUser.canChatGlobal === true) || (dbUser && dbUser.role === 'global');
    
    // ตรวจสอบสถานะ Global Chat ทั้งระบบ
    const sysConfig = this.getSystemConfig();
    const isGlobalChatOpen = sysConfig.globalChatEnabled !== false;

    // 🔒 ตรวจสอบว่าห้องเปิดใช้งานอยู่หรือไม่ (ถ้าปิดปรับปรุงอยู่ Dev ส่งได้ แต่ผู้ใช้ทั่วไปจะส่งไม่ได้)
    const targetRoom = (this.data.chat_rooms || []).find(r => r.id === roomId);
    if (targetRoom && targetRoom.enabled === false && !isDev) {
      return {
        success: false,
        error: `🚧 ห้องแชต "${targetRoom.name}" อยู่ระหว่างปิดปรับปรุง เร็วๆนี้`,
        isMaintenance: true
      };
    }

    // 🔒 Geofence Check:
    // หากเปิด Global Chat หรือผู้ใช้มียศ/สิทธิ์ canChatGlobal หรือเป็น Dev / Rider -> แชทได้ทั่วโลก 100%!
    const isBypassed = isDev || canChatGlobal || isGlobalChatOpen || isRider;

    if (!isBypassed) {
      if (!isMsu && !isRider) {
        return { 
          success: false, 
          error: 'เฉพาะนิสิต มมส (@msu.ac.th), ผู้ใช้ที่ได้รับยศอนุญาต หรือเมื่อเปิดโหมด Global Chat เท่านั้นที่สามารถส่งข้อความได้' 
        };
      }
      const geoCheck = isInsideMSUGeofence(lat, lng);
      if (!geoCheck.inZone) {
        return {
          success: false,
          error: `คุณอยู่นอกพื้นที่ มมส (${geoCheck.distanceKm} กม.) แชตจะเปิดให้ส่งได้เฉพาะเมื่ออยู่ในรัศมีรอบมหาวิทยาลัย หรือเปิดโหมดแชททั่วโลก`,
          distanceKm: geoCheck.distanceKm
        };
      }
    }

    const isOfficialAnnouncement = isAnnouncement === true && isDev;
    let senderName = isAnonymous ? 'นิสิตนิรนาม' : (sender.name || dbUser?.name || 'ผู้ใช้งาน');
    
    // กำหนดป้ายยศตามลำดับ: DEV > RIDER > GLOBAL > Custom Badge > MSU > Member
    let senderBadge = isDev ? '👑 DEV' : (dbUser?.badge || (isRider ? '🛵 RIDER' : (canChatGlobal ? '🌐 Global' : (isMsu ? '🎓 MSU' : '👤 Member'))));
    let senderPicture = isAnonymous ? 'https://ui-avatars.com/api/?name=MSU&background=2563EB&color=fff' : (sender.picture || dbUser?.picture);
    let senderEmail = isAnonymous ? '' : sender.email;

    if (isOfficialAnnouncement) {
      senderName = 'MSU Traffic';
      senderBadge = '📢 ประกาศทางการ';
      senderPicture = 'https://ui-avatars.com/api/?name=MSU+Traffic&background=1E3A8A&color=fff';
    }

    const geo = isInsideMSUGeofence(lat, lng);
    const msgId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const isMsgGlobal = !geo.inZone || isGlobalChatOpen || canChatGlobal;

    const newMsg = {
      id: msgId,
      roomId: roomId || 'general',
      senderId: isOfficialAnnouncement ? 'official_msu_traffic' : sender.id,
      senderName,
      senderEmail,
      senderBadge,
      senderPicture,
      realSenderId: sender.id,
      realSenderName: sender.name || dbUser?.name || 'ผู้ใช้งาน',
      realSenderEmail: sender.email || dbUser?.email || '',
      realSenderBadge: dbUser?.badge || senderBadge,
      realSenderPicture: sender.picture || dbUser?.picture || '',
      text: text.trim(),
      isAnonymous: !isOfficialAnnouncement && isAnonymous === true,
      isAnnouncement: isOfficialAnnouncement,
      isGlobal: isMsgGlobal,
      location: {
        lat: lat || null,
        lng: lng || null,
        distKm: geo.distanceKm,
        inZone: geo.inZone,
        isGlobal: isMsgGlobal
      },
      createdAt: Date.now()
    };

    this.data.chat_messages.push(newMsg);
    // Keep max 1000 messages in storage
    if (this.data.chat_messages.length > 1000) {
      this.data.chat_messages = this.data.chat_messages.slice(-750);
    }

    if (targetRoom) {
      targetRoom.msgCount = (targetRoom.msgCount || 0) + 1;
    }

    this.addScore(sender.id, 1, 'มีส่วนร่วมในแชต มมส');
    this.saveData();
    this.logAudit('CHAT_MSG', sender.id, roomId, `ส่งข้อความในห้อง [${roomId}] (${isMsgGlobal ? '🌐 Global' : '📍 Local'})`);
    return { success: true, message: newMsg };
  }

  // ✏️ แก้ไขข้อความในแชต (เฉพาะเจ้าของข้อความเท่านั้น!)
  editChatMessage(messageId, newText, user) {
    if (!this.data.chat_messages) return { success: false, error: 'ไม่พบข้อมูลข้อความ' };
    const msg = this.data.chat_messages.find(m => m.id === messageId);
    if (!msg) return { success: false, error: 'ไม่พบข้อความที่ต้องการแก้ไข' };

    // 🔒 ตรวจสอบความเป็นเจ้าของ: แก้ไขได้เฉพาะข้อความของตัวเองเท่านั้น
    const isOwner = msg.senderId === user.id ||
      (user.email && msg.senderEmail && user.email.toLowerCase() === msg.senderEmail.toLowerCase()) ||
      (user.id && msg.realSenderId === user.id);

    if (!isOwner) {
      return { success: false, error: 'คุณสามารถแก้ไขได้เฉพาะข้อความของตัวเองเท่านั้น' };
    }

    msg.text = newText.trim();
    msg.isEdited = true;
    msg.editedAt = Date.now();

    this.saveData();
    this.logAudit('CHAT_EDIT', user.id, messageId, `แก้ไขข้อความในห้อง [${msg.roomId}]: ${msg.text}`);
    return { success: true, message: msg };
  }

  // 🗑️ ยกเลิก / ลบข้อความในแชต
  deleteChatMessage(messageId, user) {
    if (!this.data.chat_messages) return { success: false, error: 'ไม่พบข้อมูลข้อความ' };
    const idx = this.data.chat_messages.findIndex(m => m.id === messageId);
    if (idx === -1) return { success: false, error: 'ไม่พบข้อความที่ต้องการลบ' };

    const msg = this.data.chat_messages[idx];
    const isDev = user.isDev === true || (user.email && user.email.toLowerCase() === 'java5263@gmail.com');
    const isOwner = msg.senderId === user.id || (user.email && msg.senderEmail === user.email);

    if (!isDev && !isOwner) {
      return { success: false, error: 'คุณไม่มีสิทธิ์ลบข้อความของผู้อื่น' };
    }

    const roomId = msg.roomId;
    this.data.chat_messages.splice(idx, 1);

    const room = this.data.chat_rooms ? this.data.chat_rooms.find(r => r.id === roomId) : null;
    if (room && room.msgCount > 0) room.msgCount -= 1;

    this.saveData();
    this.logAudit('CHAT_DELETE', user.id, messageId, `ยกเลิกข้อความในห้อง [${roomId}]`);
    return { success: true, messageId, roomId };
  }

  // 🧹 ล้างประวัติแชตโดย Dev (รองรับทั้งรายห้องและทุกห้อง)
  clearChatRoom(roomId, devUser) {
    if (!this.data.chat_messages) this.data.chat_messages = [];
    
    let deletedCount = 0;
    if (roomId === 'all') {
      deletedCount = this.data.chat_messages.length;
      this.data.chat_messages = [];
      if (this.data.chat_rooms) {
        this.data.chat_rooms.forEach(r => r.msgCount = 0);
      }
    } else {
      const beforeCount = this.data.chat_messages.length;
      this.data.chat_messages = this.data.chat_messages.filter(m => m.roomId !== roomId);
      deletedCount = beforeCount - this.data.chat_messages.length;
      const room = this.data.chat_rooms ? this.data.chat_rooms.find(r => r.id === roomId) : null;
      if (room) room.msgCount = 0;
    }

    this.saveData();
    this.logAudit('DEV_CHAT_CLEARED', devUser?.id || 'dev', roomId, `Dev สั่งล้างข้อความในห้องแชท [${roomId}] (${deletedCount} ข้อความ)`);
    return { success: true, count: deletedCount, roomId };
  }

  // 🌙 ระบบรีเซ็ตแชตอัตโนมัติประจำวัน (ทุกเที่ยงคืน หากไม่มีการสนทนาเกิน 15 นาที)
  checkMidnightChatReset() {
    try {
      const now = new Date();
      // เวลาไทย (UTC+7)
      const thaiHour = (now.getUTCHours() + 7) % 24;
      const todayStr = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

      // ตรวจสอบช่วงเที่ยงคืน (00:00 - 05:59 น.)
      if (thaiHour >= 0 && thaiHour < 6) {
        if (!this.data.chat_rooms || !this.data.chat_messages) return;

        this.data.chat_rooms.forEach(room => {
          // หากห้องนี้ถูกรีเซ็ตของวันนี้ไปแล้ว ให้ข้าม
          if (room.lastAutoResetDate === todayStr) return;

          const roomMsgs = this.data.chat_messages.filter(m => m.roomId === room.id);
          if (roomMsgs.length === 0) return; // ไม่มีข้อความ ไม่ต้องล้าง

          const lastMsg = roomMsgs[roomMsgs.length - 1];
          const lastMsgTime = lastMsg.createdAt || 0;
          const idleMs = Date.now() - lastMsgTime;
          const isIdle15Mins = idleMs >= 15 * 60 * 1000;

          // 🔒 กฎ: "จะรีทุกเที่ยงคืนนับจากคนไม่มีการคุยกัน 15 นาที ถ้ายังคุยอยู่จะไม่ล้าง"
          if (isIdle15Mins) {
            const removedCount = roomMsgs.length;
            this.data.chat_messages = this.data.chat_messages.filter(m => m.roomId !== room.id);
            room.lastAutoResetDate = todayStr;
            room.lastAutoResetTime = Date.now();
            room.msgCount = 0;
            this.logAudit('AUTO_MIDNIGHT_CHAT_RESET', 'system', room.id, `รีเซ็ตแชทอัตโนมัติรอบเที่ยงคืน (${removedCount} ข้อความ) เนื่องจากไม่มีการสนทนา 15 นาที`);

            if (this.io) {
              this.io.emit('chat_cleared', {
                roomId: room.id,
                isAuto: true,
                reason: 'รีเซ็ตประวัติแชทอัตโนมัติรอบเที่ยงคืน (ห้องไม่มีการสนทนาเกิน 15 นาที)',
                timestamp: Date.now()
              });
            }
          }
        });

        this.saveData();
      }
    } catch (e) {
      console.error('Error in checkMidnightChatReset:', e);
    }
  }

  getChatResetInfo(roomId) {
    const room = (this.data.chat_rooms || []).find(r => r.id === roomId);
    const roomMsgs = (this.data.chat_messages || []).filter(m => m.roomId === roomId);
    const lastMsg = roomMsgs.length > 0 ? roomMsgs[roomMsgs.length - 1] : null;
    const lastMsgTime = lastMsg ? lastMsg.createdAt : null;
    const idleSeconds = lastMsgTime ? Math.floor((Date.now() - lastMsgTime) / 1000) : null;

    // คำนวณเวลาถึงเที่ยงคืนถัดไป (Next Midnight UTC+7)
    const now = new Date();
    const nextMidnight = new Date();
    nextMidnight.setHours(24, 0, 0, 0); // 00:00:00 of tomorrow
    const secToMidnight = Math.max(0, Math.floor((nextMidnight.getTime() - now.getTime()) / 1000));

    return {
      roomId,
      policy: 'รีเซ็ตทุกเที่ยงคืน (เมื่อไม่มีการสนทนาเกิน 15 นาที)',
      lastMsgTime,
      idleSeconds,
      isIdle15Mins: idleSeconds ? idleSeconds >= 900 : true,
      secToMidnight,
      lastAutoResetDate: room?.lastAutoResetDate || null
    };
  }

  // ----------------------------------------------------
  // 📍 Checkpoint Pin Chat Operations (Real-time Pin Chat Room)
  // ----------------------------------------------------
  getPinChatMessages(pinId, limit = 50) {
    if (!this.data.pin_chat_messages) {
      this.data.pin_chat_messages = [];
    }
    const msgs = this.data.pin_chat_messages
      .filter(m => m.pinId === pinId)
      .slice(-limit)
      .map(m => {
        const user = this.data.users[m.senderId];
        const userRank = user ? calculateRank(user.allTimeScore, user.isDev) : calculateRank(0, false);
        return {
          ...m,
          senderRank: userRank
        };
      });
    return msgs;
  }

  addPinChatMessage({ pinId, sender, text, isAnonymous = false, isAnnouncement = false }) {
    if (!this.data.pin_chat_messages) {
      this.data.pin_chat_messages = [];
    }

    const pin = this.getPinById(pinId);
    if (!pin) {
      return { success: false, error: 'ไม่พบหมุดด่านที่ระบุ' };
    }

    const cleanText = (text || '').trim();
    if (!cleanText) {
      return { success: false, error: 'กรุณากรอกข้อความ' };
    }

    // 🛡️ 3-Layer Profanity Filter Check
    const profanityFilter = require('../services/profanityFilter');
    const tox = profanityFilter.analyzeToxicity(cleanText);
    if (tox.isToxic) {
      this.updateTrustScore(sender.id, -5, `ตรวจพบคำหยาบในห้องแชทหมุด: ${tox.reason}`);
      this.logAudit('PIN_CHAT_PROFANITY', sender.id, pinId, `บล็อกคำหยาบในแชท: ${cleanText} (${tox.reason})`);
      return {
        success: false,
        error: `🚫 ไม่สามารถส่งข้อความได้: ${tox.reason}`
      };
    }

    const dbUser = this.getOrCreateUser(sender);
    const userEmail = (sender.email || '').toLowerCase().trim();
    const isDev = sender.isDev === true || userEmail === 'java5263@gmail.com' || (dbUser && dbUser.isDev);
    const isMsu = userEmail.endsWith('@msu.ac.th');

    const isOfficialAnnouncement = isAnnouncement === true && isDev;
    let senderName = isAnonymous ? 'นิสิตนิรนาม' : (sender.name || 'ผู้ใช้งาน มมส');
    let senderBadge = isDev ? '👑 DEV' : (isMsu ? '🎓 MSU' : '👤 Member');
    let senderPicture = isAnonymous ? 'https://ui-avatars.com/api/?name=MSU&background=2563EB&color=fff' : (sender.picture || 'https://ui-avatars.com/api/?name=MSU&background=2563EB&color=fff');
    let senderEmail = isAnonymous ? '' : sender.email;

    if (isOfficialAnnouncement) {
      senderName = 'MSU Traffic';
      senderBadge = '📢 ประกาศทางการ';
      senderPicture = 'https://ui-avatars.com/api/?name=MSU+Traffic&background=1E3A8A&color=fff';
    }

    const msgId = `pinmsg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const userRank = dbUser ? calculateRank(dbUser.allTimeScore, isDev) : calculateRank(0, isDev);

    const newMsg = {
      id: msgId,
      pinId: pinId,
      senderId: isOfficialAnnouncement ? 'official_msu_traffic' : sender.id,
      senderName,
      senderEmail,
      senderBadge,
      senderPicture,
      senderRank: userRank,
      realSenderId: sender.id,
      realSenderName: sender.name || dbUser?.name || 'ผู้ใช้งาน',
      realSenderEmail: sender.email || dbUser?.email || '',
      realSenderBadge: dbUser?.badge || senderBadge,
      realSenderPicture: sender.picture || dbUser?.picture || '',
      text: cleanText,
      isAnonymous: !isOfficialAnnouncement && isAnonymous === true,
      isAnnouncement: isOfficialAnnouncement,
      createdAt: Date.now()
    };

    this.data.pin_chat_messages.push(newMsg);
    // Keep max 2,000 pin chat messages in DB
    if (this.data.pin_chat_messages.length > 2000) {
      this.data.pin_chat_messages = this.data.pin_chat_messages.slice(-1500);
    }

    // Award +3 EXP for helpful community chat message
    this.addScore(sender.id, 3, 'ร่วมแชทอัปเดตข้อมูลด่าน');

    // Update message count on pin
    pin.chatCount = (pin.chatCount || 0) + 1;
    this.saveData();

    return {
      success: true,
      message: newMsg,
      chatCount: pin.chatCount,
      expGained: 3,
      userStats: this.data.users[sender.id]
    };
  }

  // ----------------------------------------------------
  // 🏆 Leaderboard Operations (Daily / All-Time)
  // ----------------------------------------------------
  getWeeklyLeaderboard(limit = 10) {
    if (!this.data.leaderboard_snapshot || !this.data.leaderboard_snapshot.rankings) {
      this.generateMidnightLeaderboardSnapshot();
    }

    const nextMidnight = new Date();
    nextMidnight.setHours(24, 0, 0, 0);

    const snapshotRankings = this.data.leaderboard_snapshot?.rankings || [];

    return {
      season: this.data.season,
      seasonName: this.data.seasonName,
      dayNumber: this.data.dayNumber || 1,
      weekNumber: this.data.dayNumber || 1,
      dayEnd: this.data.dayEnd || nextMidnight.getTime(),
      weekEnd: this.data.weekEnd || nextMidnight.getTime(),
      lastCalculatedAt: this.data.leaderboard_snapshot?.calculatedAt || Date.now(),
      nextCalculationAt: this.data.leaderboard_snapshot?.nextCalculationAt || nextMidnight.getTime(),
      isMidnightBatch: true,
      rankings: snapshotRankings.slice(0, limit)
    };
  }

  getAllTimeLeaderboard(limit = 10) {
    const MIN_EXP_FOR_RANKING = 200; // ❗ ต้องมีแต้ม 200 EXP ขึ้นไปทุกคน (รวม Dev) ถึงจะเริ่มติดอันดับ

    // ❗ เฉพาะผู้ใช้จริงที่มีคะแนนอย่างน้อย 200 EXP เท่านั้น
    const list = Object.values(this.data.users)
      .filter(u => ((u.allTimeScore || 0) >= MIN_EXP_FOR_RANKING) && !u.email?.includes('audit_test') && !u.id?.startsWith('test_') && !u.id?.startsWith('user_demo_'))
      .map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        picture: u.picture,
        badge: u.badge,
        isDev: u.isDev,
        trustScore: u.trustScore || 50,
        score: u.allTimeScore || 0,
        pinsCreated: u.pinsCreated || 0,
        rank: calculateRank(u.allTimeScore, u.isDev, this.getRankTiers())
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return list;
  }

  // ----------------------------------------------------
  // 👑 Dev / Admin Moderation Operations
  // ----------------------------------------------------
  resetLeaderboard(mode = 'weekly', adminId = 'dev_admin') {
    let affectedUsers = 0;
    Object.values(this.data.users).forEach(u => {
      u.weeklyScore = 0;
      if (mode === 'all') {
        u.allTimeScore = 0;
      }
      affectedUsers++;
    });

    if (mode === 'all') {
      this.data.weekNumber = 1;
    }

    this.saveData();
    this.logAudit('ADMIN_RESET_LEADERBOARD', adminId, 'leaderboard', `ล้างอันดับคะแนน (โหมด: ${mode}, ผู้ใช้ที่ได้รับผล: ${affectedUsers} บัญชี)`);

    return {
      success: true,
      mode,
      affectedUsers,
      weeklyLeaderboard: this.getWeeklyLeaderboard(10),
      allTimeLeaderboard: this.getAllTimeLeaderboard(10)
    };
  }

  // ----------------------------------------------------
  // 🧹 SYSTEM RESET OPERATIONS (ล้าง 1. ยศ 2. แต้ม 3. หมุด 4. แชท)
  // ----------------------------------------------------
  resetSystemData({ resetRanks = false, resetPoints = false, resetPins = false, resetChat = false }, adminId = 'dev_admin') {
    const results = {
      resetRanks: false,
      resetPoints: false,
      resetPins: false,
      resetChat: false,
      affectedUsers: 0,
      affectedPins: 0,
      affectedMessages: 0
    };

    // 1. ล้างยศ (Rank & Tier Reset -> รีเซ็ตยศผู้ใช้ทั้งหมดกลับเป็น Rank 1 Novice)
    if (resetRanks) {
      Object.values(this.data.users).forEach(u => {
        if (!u.isDev && u.email !== 'java5263@gmail.com') {
          u.allTimeScore = 0;
        }
        results.affectedUsers++;
      });
      results.resetRanks = true;
    }

    // 2. ล้างแต้ม / คะแนน (Points & Trust Score Reset)
    if (resetPoints) {
      Object.values(this.data.users).forEach(u => {
        u.weeklyScore = 0;
        if (!resetRanks && (u.isDev || u.email === 'java5263@gmail.com')) {
          // Keep dev score
        } else {
          u.allTimeScore = 0;
        }
        u.trustScore = 100;
        u.pinsCreated = 0;
        u.pinsVerified = 0;
        u.reportsCount = 0;
        u.accurateReports = 0;
      });
      this.data.weekNumber = 1;
      results.resetPoints = true;
    }

    // 3. ล้างหมุด (Pins & Checkpoints Reset -> ลบหมุดและแชทประจำหมุดทั้งหมด)
    if (resetPins) {
      results.affectedPins = this.data.pins.length;
      if (!this.data.deleted_pins) this.data.deleted_pins = [];
      this.data.pins.forEach(p => {
        if (p.id && !this.data.deleted_pins.includes(p.id)) {
          this.data.deleted_pins.push(p.id);
        }
      });
      this.data.pins = [];
      this.data.pin_reports = [];
      this.data.pin_likes = [];
      this.data.pin_chat_messages = [];
      if (this.data.flagged_reports) {
        this.data.flagged_reports = [];
      }
      results.resetPins = true;
      googleSheetsService.syncFullDatabase(this.data).catch(e => console.warn('Sheets sync error:', e));
    }

    // 4. ล้างห้องแชท (Chat Messages Reset)
    if (resetChat) {
      results.affectedMessages = (this.data.chat_messages || []).length;
      this.data.chat_messages = [];
      (this.data.chat_rooms || []).forEach(r => { r.msgCount = 0; });
      results.resetChat = true;
    }

    this.saveData();

    // Broadcast Real-time Events via Socket.IO
    if (this.io) {
      this.io.emit('stats_update', this.getStatistics());
      if (resetPins) {
        this.io.emit('pins_cleared_all', { message: 'ผู้ดูแลระบบได้ทำการล้างข้อมูลหมุดทั้งหมด' });
        this.io.emit('reports_updated', []);
      }
      if (resetPoints || resetRanks) {
        this.io.emit('leaderboard_reset', {
          weekly: this.getWeeklyLeaderboard(10),
          allTime: this.getAllTimeLeaderboard(10)
        });
      }
      if (resetChat) {
        this.io.emit('chat_history_cleared', { roomId: 'all' });
      }
    }

    const summaryParts = [];
    if (resetRanks) summaryParts.push('🎖️ ยศ');
    if (resetPoints) summaryParts.push('🏆 แต้ม/คะแนน');
    if (resetPins) summaryParts.push(`📍 หมุด (${results.affectedPins} จุด)`);
    if (resetChat) summaryParts.push(`💬 แชท (${results.affectedMessages} ข้อความ)`);

    this.logAudit('ADMIN_SYSTEM_RESET', adminId, 'system', `ล้างข้อมูลระบบ: [${summaryParts.join(', ')}]`);

    return {
      success: true,
      message: `ดำเนินการล้างข้อมูลเรียบร้อยแล้ว (${summaryParts.join(', ')})`,
      results,
      stats: this.getStatistics()
    };
  }

  banUser(targetUserId, reason = 'ละเมิดข้อกำหนด/สแปมรายงานข้อมูลเท็จ', adminId = 'dev_admin') {
    const user = this.data.users[targetUserId];
    if (!user) {
      return { success: false, error: 'ไม่พบผู้ใช้งานนี้ในระบบ' };
    }
    if (user.isDev || user.email === 'java5263@gmail.com') {
      return { success: false, error: '🚫 ไม่สามารถระงับหรือแบนบัญชี Developer ได้' };
    }

    user.status = 'banned';
    user.bannedAt = Date.now();
    user.banReason = reason;
    user.trustScore = 0;

    // เคลียร์/ยกเลิกหมุดด่านทั้งหมดที่ผู้ใช้คนนี้เคยสร้าง
    let affectedPins = 0;
    this.data.pins.forEach(pin => {
      if (pin.reporterId === targetUserId && pin.status === 'active') {
        pin.status = 'cleared';
        affectedPins++;
      }
    });

    // อัปเดตรายการรายงานที่เกี่ยวกับผู้ใช้นี้
    if (this.data.flagged_reports) {
      this.data.flagged_reports.forEach(f => {
        if (f.reportedUserId === targetUserId && f.status === 'pending') {
          f.status = 'resolved_banned';
          f.resolvedBy = adminId;
          f.resolvedAt = Date.now();
        }
      });
    }

    this.saveData();
    this.logAudit('USER_BANNED', adminId, targetUserId, `แบนผู้ใช้: ${user.name} (${user.email}) - เหตุผล: ${reason}`);

    return {
      success: true,
      message: `แบนผู้ใช้ ${user.name} สำเร็จ (เคลียร์หมุดอัตโนมัติ ${affectedPins} หมุด)`,
      user,
      affectedPins
    };
  }

  unbanUser(targetUserId, adminId = 'dev_admin') {
    const user = this.data.users[targetUserId];
    if (!user) {
      return { success: false, error: 'ไม่พบผู้ใช้งานนี้ในระบบ' };
    }

    user.status = 'active';
    delete user.bannedAt;
    delete user.banReason;
    user.trustScore = 50;

    this.saveData();
    this.logAudit('USER_UNBANNED', adminId, targetUserId, `ปลดแบนผู้ใช้: ${user.name} (${user.email})`);

    return {
      success: true,
      message: `ปลดแบนผู้ใช้ ${user.name} เรียบร้อยแล้ว`,
      user
    };
  }

  getBannedUsers() {
    return Object.values(this.data.users)
      .filter(u => u.status === 'banned')
      .map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        picture: u.picture,
        badge: u.badge,
        bannedAt: u.bannedAt || u.lastActiveAt,
        banReason: u.banReason || 'ละเมิดข้อกำหนดการใช้งาน',
        trustScore: u.trustScore || 0
      }));
  }

  // ----------------------------------------------------
  // 🌐 Global Chat & System Config Operations
  // ----------------------------------------------------
  getSystemConfig() {
    if (!this.data.system_config) {
      this.data.system_config = {
        globalChatEnabled: true,
        allowAllEmails: true,
        donateEnabled: false
      };
      this.saveData();
    }
    if (this.data.system_config.donateEnabled === undefined) {
      this.data.system_config.donateEnabled = false;
      this.saveData();
    }
    return this.data.system_config;
  }

  updateSystemConfig(newConfig = {}, adminId = 'dev_admin') {
    if (!this.data.system_config) {
      this.data.system_config = {};
    }
    this.data.system_config = {
      ...this.data.system_config,
      ...newConfig
    };
    this.saveData();
    this.logAudit('SYSTEM_CONFIG_UPDATE', adminId, 'system_config', `อัปเดตการตั้งค่าระบบ: ${JSON.stringify(newConfig)}`);

    // 🔄 ซิงค์การตั้งค่าขึ้น Google Sheets ทันที (Instant Push)
    googleSheetsService.syncSettingsUpdate(this.data).catch(e => console.warn('Sheets settings sync error:', e));

    if (this.io) {
      this.io.emit('system_config_updated', this.data.system_config);
      this.io.emit('global_chat_toggled', {
        globalChatEnabled: this.data.system_config.globalChatEnabled === true,
        updatedBy: adminId,
        timestamp: Date.now()
      });
    }

    return this.data.system_config;
  }

  // ----------------------------------------------------
  // 👤 User Roles & Global Permission Management
  // ----------------------------------------------------
  getAllUsers() {
    return Object.values(this.data.users).map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      picture: u.picture,
      role: u.role || 'member',
      badge: u.badge || '👤 Member',
      isDev: u.isDev || false,
      isRider: u.isRider || false,
      canChatGlobal: u.canChatGlobal === true,
      trustScore: u.trustScore || 50,
      weeklyScore: u.weeklyScore || 0,
      allTimeScore: u.allTimeScore || 0,
      pinsCreated: u.pinsCreated || 0,
      status: u.status || 'active',
      createdAt: u.createdAt,
      lastActiveAt: u.lastActiveAt
    }));
  }

  updateUserRole(userId, updateData = {}, adminId = 'dev_admin') {
    const user = this.data.users[userId];
    if (!user) {
      return { success: false, error: 'NOT_FOUND', message: 'ไม่พบผู้ใช้งานนี้ในระบบ' };
    }

    const oldName = user.name;
    if (updateData.name !== undefined && updateData.name.trim()) {
      user.name = updateData.name.trim();
      // อัปเดตชื่อในหมุดและข้อความแชทย้อนหลัง
      (this.data.pins || []).forEach(p => {
        if (p.reporterId === userId || p.reporter?.id === userId) {
          if (!p.reporter) p.reporter = {};
          p.reporter.name = user.name;
        }
      });
      (this.data.chat_messages || []).forEach(m => {
        if (m.senderId === userId) {
          m.senderName = user.name;
        }
      });
    }

    if (updateData.role !== undefined) user.role = updateData.role;
    if (updateData.badge !== undefined) user.badge = updateData.badge;
    if (updateData.canChatGlobal !== undefined) user.canChatGlobal = updateData.canChatGlobal === true;
    if (updateData.isRider !== undefined) user.isRider = updateData.isRider === true;
    if (updateData.trustScore !== undefined) {
      user.trustScore = Math.max(0, Math.min(100, parseInt(updateData.trustScore) || user.trustScore));
    }

    if (updateData.role === 'dev') {
      user.isDev = true;
      user.badge = '👑 DEV';
      user.canChatGlobal = true;
    } else if (updateData.role === 'global') {
      user.canChatGlobal = true;
      if (!updateData.badge) user.badge = '🌐 Global';
    } else if (updateData.role === 'rider') {
      user.isRider = true;
      user.canChatGlobal = true;
      if (!updateData.badge) user.badge = '🛵 RIDER';
    } else if (updateData.role === 'student') {
      if (!updateData.badge) user.badge = '🎓 MSU';
    } else if (updateData.role === 'member') {
      if (!updateData.badge) user.badge = '👤 Member';
    }

    this.saveData();
    this.logAudit('USER_ROLE_UPDATED', adminId, userId, `ปรับยศ/ชื่อ/สิทธิ์ผู้ใช้ ${oldName} -> ${user.name} (${user.email}): ยศ=${user.role}, ป้าย=${user.badge}, แชททั่วโลก=${user.canChatGlobal}`);

    if (this.io) {
      this.io.emit('user_role_changed', {
        userId: user.id,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          badge: user.badge,
          isDev: user.isDev,
          isRider: user.isRider,
          canChatGlobal: user.canChatGlobal,
          trustScore: user.trustScore
        }
      });
    }

    return {
      success: true,
      user,
      message: `บันทึกข้อมูล [${user.name}] เป็น "${user.badge || user.role}" สำเร็จแล้ว`
    };
  }

  adminRenameUser(userId, newName, adminId = 'dev_admin') {
    if (!newName || !newName.trim()) {
      return { success: false, error: 'กรุณาระบุชื่อใหม่' };
    }
    return this.updateUserRole(userId, { name: newName.trim() }, adminId);
  }

  // ----------------------------------------------------
  // 🚨 Community Flagged Reports Operations (Moderation Queue)
  // ----------------------------------------------------
  flagReport({ pinId, reason, details, reporterId, reporterName }) {
    if (!this.data.flagged_reports) {
      this.data.flagged_reports = [];
    }

    const pin = this.getPinById(pinId);
    if (!pin) {
      return { success: false, error: 'ไม่พบหมุดด่านที่ต้องการรายงาน' };
    }

    // ป้องกันผู้ใช้คนเดิมสแปมรีพอร์ตหมุดเดิมซ้ำๆ
    const existing = this.data.flagged_reports.find(f => f.pinId === pinId && f.reporterId === reporterId && f.status === 'pending');
    if (existing) {
      return { success: false, error: 'คุณได้ส่งรายงานตรวจสอบหมุดนี้ไปแล้ว เจ้าหน้าที่กำลังดำเนินการ' };
    }

    const reportedUser = this.data.users[pin.reporterId] || null;

    const flagEntry = {
      id: `flag-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      pinId: pin.id,
      pinTitle: pin.title || pin.locationName,
      pinLocation: pin.locationName,
      campusZone: pin.campusZone,
      reportedUserId: pin.reporterId,
      reportedUserName: reportedUser ? reportedUser.name : (pin.reporter?.name || 'นิสิต มมส'),
      reportedUserEmail: reportedUser ? reportedUser.email : (pin.reporter?.email || ''),
      reportedUserBadge: reportedUser ? reportedUser.badge : '👤 Member',
      reporterId: reporterId || 'anonymous',
      reporterName: reporterName || 'ผู้สัญจร มมส',
      reason: reason || 'ข้อมูลตำแหน่งเท็จหรือไม่ถูกต้อง',
      details: details || '',
      status: 'pending', // pending, resolved_banned, resolved_deleted, dismissed
      createdAt: Date.now()
    };

    this.data.flagged_reports.unshift(flagEntry);
    if (this.data.flagged_reports.length > 500) {
      this.data.flagged_reports = this.data.flagged_reports.slice(0, 500);
    }

    // Auto reduce trust score if multiple reports accumulate
    const pinFlags = this.data.flagged_reports.filter(f => f.pinId === pinId && f.status === 'pending');
    if (pinFlags.length >= 3 && pin.reporterId && this.data.users[pin.reporterId]) {
      this.updateTrustScore(pin.reporterId, -5, 'หมุดถูกรายงานความไม่ถูกต้องสะสม 3 ครั้ง');
    }

    this.saveData();
    this.logAudit('PIN_FLAGGED', reporterId, pinId, `รายงานหมุดไม่เหมาะสม: ${reason}`);

    return {
      success: true,
      message: 'ส่งรายงานให้ผู้ดูแลระบบตรวจสอบเรียบร้อยแล้ว ขอบคุณที่ช่วยดูแลชุมชน มมส',
      flag: flagEntry
    };
  }

  getFlaggedReports(statusFilter = 'pending') {
    if (!this.data.flagged_reports) {
      this.data.flagged_reports = [];
    }

    let list = this.data.flagged_reports;
    if (statusFilter && statusFilter !== 'all') {
      list = list.filter(f => f.status === statusFilter);
    }

    return list.slice(0, 100);
  }

  resolveFlaggedReport(flagId, action, adminId = 'dev_admin') {
    if (!this.data.flagged_reports) {
      this.data.flagged_reports = [];
    }

    const flag = this.data.flagged_reports.find(f => f.id === flagId);
    if (!flag) {
      return { success: false, error: 'ไม่พบรายการรีพอร์ตนี้' };
    }

    let actionMsg = '';

    if (action === 'ban_user') {
      // 1. แบนผู้สร้างหมุดทันที
      this.banUser(flag.reportedUserId, `ถูกรีพอร์ต: ${flag.reason}`, adminId);
      flag.status = 'resolved_banned';
      actionMsg = `แบนผู้ใช้ ${flag.reportedUserName} และยกเลิกหมุดเรียบร้อย`;
    } else if (action === 'delete_pin') {
      // 2. ลบหมุดด่านทิ้ง
      this.deletePin(flag.pinId, adminId);
      flag.status = 'resolved_deleted';
      actionMsg = `ลบหมุดด่าน ${flag.pinTitle} เรียบร้อย`;
    } else if (action === 'deduct_trust') {
      // 3. ลด Trust Score 20 แต้ม
      this.updateTrustScore(flag.reportedUserId, -20, `ผู้ดูแลตัดคะแนนจากรีพอร์ต: ${flag.reason}`);
      flag.status = 'resolved_deducted';
      actionMsg = `ตัดคะแนนความน่าเชื่อถือของผู้ใช้ -20 แต้ม`;
    } else if (action === 'dismiss') {
      // 4. ปฏิเสธ/ยกเลิกคำร้อง (ข้อมูลถูกต้อง)
      flag.status = 'dismissed';
      actionMsg = `ยกเลิกคำร้องรายงาน`;
    }

    flag.resolvedBy = adminId;
    flag.resolvedAt = Date.now();

    this.saveData();
    this.logAudit('FLAG_RESOLVED', adminId, flagId, `จัดการรายงาน (${action}): ${actionMsg}`);

    return {
      success: true,
      message: actionMsg,
      flag
    };
  }

  // ----------------------------------------------------
  // 📜 Audit Log & Stats
  // ----------------------------------------------------
  logAudit(action, userId, targetId, details = '', ip = '127.0.0.1') {
    const entry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      action,
      userId,
      targetId,
      details,
      ip,
      createdAt: Date.now()
    };
    this.data.audit_logs = this.data.audit_logs || [];
    this.data.audit_logs.push(entry);
    if (this.data.audit_logs.length > 500) {
      this.data.audit_logs = this.data.audit_logs.slice(-300);
    }
  }

  getAllPinsAdmin() {
    return this.data.pins || [];
  }

  deletePin(pinId, adminId = 'dev_admin') {
    const idx = this.data.pins.findIndex(p => p.id === pinId);
    if (idx === -1) return false;
    const removedPin = this.data.pins.splice(idx, 1)[0];
    this.data.pin_chat_messages = (this.data.pin_chat_messages || []).filter(m => m.pinId !== pinId);
    this.data.pin_reports = (this.data.pin_reports || []).filter(r => r.pinId !== pinId);
    this.saveData();
    this.logAudit('PIN_DELETE', adminId, pinId, `ลบหมุดด่านถาวร: ${removedPin?.locationName || pinId}`);

    if (this.io) {
      this.io.emit('report_deleted', pinId);
      this.io.emit('stats_update', this.getStatistics());
    }
    return true;
  }

  updatePinStatus(pinId, status, adminId = 'dev_admin') {
    const pin = this.getPinById(pinId);
    if (!pin) return { success: false, error: 'NOT_FOUND', message: 'ไม่พบหมุดนี้' };

    const oldStatus = pin.status;
    pin.status = status;
    this.saveData();
    this.logAudit('PIN_STATUS_CHANGE', adminId, pinId, `เปลี่ยนสถานะหมุดจาก ${oldStatus} -> ${status}`);

    if (this.io) {
      if (status === 'deleted' || status === 'hidden') {
        this.io.emit('report_deleted', pinId);
      } else {
        this.io.emit('report_updated', pin);
      }
      this.io.emit('stats_update', this.getStatistics());
    }
    return { success: true, pin, oldStatus, newStatus: status };
  }

  getAuditLogs(limit = 100) {
    return (this.data.audit_logs || []).slice(-limit).reverse();
  }

  // --------------------------------------------------
  // 📊 Visitor Counter
  // --------------------------------------------------
  recordVisit() {
    // Use Asia/Bangkok date string (YYYY-MM-DD)
    const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

    if (!this.data.visitors) {
      this.data.visitors = { total: 0, today: 0, lastDate: todayDate, dailyHistory: {} };
    }

    const v = this.data.visitors;

    // Reset daily counter if date has changed
    if (v.lastDate !== todayDate) {
      // Archive yesterday's count
      v.dailyHistory = v.dailyHistory || {};
      v.dailyHistory[v.lastDate] = v.today;
      v.today = 0;
      v.lastDate = todayDate;
    }

    v.today += 1;
    v.total += 1;

    this.saveData();
  }

  getStatistics() {
    const active = this.data.pins.filter(p => p.status === 'active').length;
    const cleared = this.data.pins.filter(p => p.status === 'cleared').length;
    const today = this.data.pins.filter(p => {
      const d = new Date(p.createdAt);
      const now = new Date();
      return d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
    }).length;

    const pendingFlags = (this.data.flagged_reports || []).filter(f => f.status === 'pending').length;
    const bannedUsers = Object.values(this.data.users).filter(u => u.status === 'banned').length;

    const visitors = this.data.visitors || { total: 0, today: 0 };

    return {
      active,
      today,
      cleared,
      totalUsers: Object.keys(this.data.users).length,
      pendingFlags,
      bannedUsers,
      season: this.data.season,
      weekNumber: this.data.weekNumber,
      todayVisits: visitors.today,
      totalVisits: visitors.total
    };
  }

  // ----------------------------------------------------
  // 🛵 RIDER Role & Chat Permission Management
  // ----------------------------------------------------
  requestRiderRole({ userId, userName, userEmail, userPicture, platform = 'general', phone = '', note = '' }) {
    if (!this.data.rider_requests) {
      this.data.rider_requests = [];
    }

    const cleanEmail = (userEmail || '').toLowerCase().trim();
    
    // ตรวจสอบว่าผู้ใช้มีสิทธิ์ RIDER อยู่แล้วหรือไม่
    const user = this.getUserById(userId) || this.getUserByEmail(cleanEmail);
    if (user && user.isRider) {
      return { success: false, error: 'คุณได้รับสิทธิ์ป้าย 🛵 RIDER อยู่แล้ว' };
    }

    // ตรวจสอบว่ามีคำขอที่รออนุมัติอยู่แล้วหรือไม่
    const existing = this.data.rider_requests.find(r => (r.userId === userId || r.userEmail === cleanEmail) && r.status === 'pending');
    if (existing) {
      return { 
        success: false, 
        error: 'คุณได้ส่งคำขอสิทธิ์ RIDER ไปแล้ว อยู่ระหว่างรอแอดมิน/Dev ตรวจสอบ',
        request: existing
      };
    }

    const newRequest = {
      id: `rider-req-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId,
      userName: userName || cleanEmail.split('@')[0] || 'ผู้ขอสิทธิ์ไรเดอร์',
      userEmail: cleanEmail,
      userPicture: userPicture || 'https://ui-avatars.com/api/?name=MSU&background=2563EB&color=fff',
      platform: platform || 'Grab / Lineman / อื่นๆ',
      phone: phone || '',
      note: note || '',
      status: 'pending', // 'pending', 'approved', 'rejected'
      createdAt: Date.now(),
      reviewedAt: null,
      reviewedBy: null,
      rejectReason: null
    };

    this.data.rider_requests.unshift(newRequest);
    this.saveData();
    this.logAudit('RIDER_ROLE_REQUESTED', userId, newRequest.id, `ผู้ใช้ ${userName} (${cleanEmail}) ยื่นขอสิทธิ์ RIDER (แพลตฟอร์ม: ${platform})`);

    return {
      success: true,
      message: 'ยื่นคำขอสิทธิ์ป้าย 🛵 RIDER เรียบร้อยแล้ว กรุณารอแอดมินหรือผู้พัฒนาระบบตรวจสอบและอนุมัติ',
      request: newRequest
    };
  }

  getRiderRequests(statusFilter = 'all') {
    if (!this.data.rider_requests) {
      this.data.rider_requests = [];
    }

    let list = this.data.rider_requests;
    if (statusFilter && statusFilter !== 'all') {
      list = list.filter(r => r.status === statusFilter);
    }
    return list;
  }

  getUserRiderStatus(userId, email = '') {
    const cleanEmail = (email || '').toLowerCase().trim();
    const user = this.getUserById(userId) || this.getUserByEmail(cleanEmail);
    if (user && user.isRider) {
      return { status: 'approved', isRider: true, user };
    }

    if (!this.data.rider_requests) {
      this.data.rider_requests = [];
    }

    const pending = this.data.rider_requests.find(r => (r.userId === userId || r.userEmail === cleanEmail) && r.status === 'pending');
    if (pending) {
      return { status: 'pending', isRider: false, request: pending };
    }

    const lastReq = this.data.rider_requests.find(r => (r.userId === userId || r.userEmail === cleanEmail));
    if (lastReq) {
      return { status: lastReq.status, isRider: false, request: lastReq };
    }

    return { status: 'none', isRider: false };
  }

  approveRiderRole(requestId, adminId = 'dev_admin') {
    if (!this.data.rider_requests) return { success: false, error: 'ไม่พบรายการคำขอ' };
    const req = this.data.rider_requests.find(r => r.id === requestId);
    if (!req) return { success: false, error: 'ไม่พบคำขอสิทธิ์ RIDER นี้' };

    req.status = 'approved';
    req.reviewedAt = Date.now();
    req.reviewedBy = adminId;

    // อัปเดตข้อมูลผู้ใช้ในระบบ
    let user = this.getUserById(req.userId) || this.getUserByEmail(req.userEmail);
    if (user) {
      user.isRider = true;
      user.role = 'rider';
      user.badge = '🛵 RIDER';
      user.riderPlatform = req.platform;
      user.riderApprovedAt = Date.now();
    } else {
      // สร้างผู้ใช้ในระบบหากยังไม่มี
      user = this.getOrCreateUser({
        id: req.userId,
        name: req.userName,
        email: req.userEmail,
        picture: req.userPicture,
        isRider: true,
        role: 'rider',
        badge: '🛵 RIDER'
      });
      user.isRider = true;
      user.badge = '🛵 RIDER';
      user.riderPlatform = req.platform;
    }

    this.saveData();
    this.logAudit('RIDER_ROLE_APPROVED', adminId, req.userId, `อนุมัติสิทธิ์ RIDER ให้แก่ ${req.userName} (${req.userEmail})`);

    return {
      success: true,
      message: `อนุมัติสิทธิ์ 🛵 RIDER ให้คุณ ${req.userName} เรียบร้อยแล้ว`,
      request: req,
      user
    };
  }

  rejectRiderRole(requestId, reason = 'ข้อมูลไม่ครบถ้วนหรือไม่ตรงตามเงื่อนไข', adminId = 'dev_admin') {
    if (!this.data.rider_requests) return { success: false, error: 'ไม่พบรายการคำขอ' };
    const req = this.data.rider_requests.find(r => r.id === requestId);
    if (!req) return { success: false, error: 'ไม่พบคำขอสิทธิ์ RIDER นี้' };

    req.status = 'rejected';
    req.reviewedAt = Date.now();
    req.reviewedBy = adminId;
    req.rejectReason = reason;

    this.saveData();
    this.logAudit('RIDER_ROLE_REJECTED', adminId, req.userId, `ปฏิเสธคำขอ RIDER ของ ${req.userName} เหตุผล: ${reason}`);

    return {
      success: true,
      message: `ปฏิเสธคำขอสิทธิ์ RIDER ของคุณ ${req.userName} เรียบร้อยแล้ว`,
      request: req
    };
  }

  revokeRiderRole(userId, adminId = 'dev_admin') {
    const user = this.getUserById(userId);
    if (!user) return { success: false, error: 'ไม่พบผู้ใช้งานนี้' };

    user.isRider = false;
    const isDev = user.isDev === true || user.email === 'java5263@gmail.com';
    const isMsu = (user.email || '').endsWith('@msu.ac.th');
    user.role = isDev ? 'dev' : (isMsu ? 'student' : 'member');
    user.badge = isDev ? '👑 DEV' : (isMsu ? '🎓 MSU' : '👤 Member');

    this.saveData();
    this.logAudit('RIDER_ROLE_REVOKED', adminId, userId, `เพิกถอนสิทธิ์ RIDER ของ ${user.name} (${user.email})`);

    return {
      success: true,
      message: `เพิกถอนสิทธิ์ RIDER ของ ${user.name} เรียบร้อยแล้ว`,
      user
    };
  }

  // ----------------------------------------------------
  // 📍 MSU Popular Checkpoint Hotspots / Zones
  // ----------------------------------------------------
  getMSUZones() {
    return [
      // 🏫 มอใหม่ (ขามเรียง)
      { id: 'zone-kham-1', name: '📍 มอใหม่: หน้าป้าย มมส (ทางเข้าหลัก)', lat: 16.2468, lng: 103.2520, campus: 'มอใหม่ (ขามเรียง)' },
      { id: 'zone-kham-2', name: '📍 มอใหม่: สามแยกหน้าป้าย มมส (ฝั่งขาเข้า)', lat: 16.2480, lng: 103.2510, campus: 'มอใหม่ (ขามเรียง)' },
      { id: 'zone-kham-3', name: '📍 มอใหม่: ประตู 1 (ข้างวิทยาลัยการเมือง)', lat: 16.2435, lng: 103.2490, campus: 'มอใหม่ (ขามเรียง)' },
      { id: 'zone-kham-4', name: '📍 มอใหม่: ประตู 2 (วิทยาการสารสนเทศ/ศิลปกรรม)', lat: 16.2410, lng: 103.2530, campus: 'มอใหม่ (ขามเรียง)' },
      { id: 'zone-kham-5', name: '📍 มอใหม่: ประตู 3 (ศึกษาศาสตร์/สาธิต)', lat: 16.2495, lng: 103.2560, campus: 'มอใหม่ (ขามเรียง)' },
      { id: 'zone-kham-6', name: '📍 มอใหม่: สี่แยกไฟแดงขามเรียง (7-Eleven)', lat: 16.2420, lng: 103.2450, campus: 'มอใหม่ (ขามเรียง)' },
      { id: 'zone-kham-7', name: '📍 มอใหม่: ถนนหน้า ม. เส้นท่าขอนยาง', lat: 16.2450, lng: 103.2480, campus: 'ท่าขอนยาง (รอบมอใหม่)' },
      { id: 'zone-kham-bridge-bigc', name: '📍 มอใหม่: บนสะพานหน้า Big C (สะพานข้ามคลองท่าขอนยาง)', lat: 16.2390, lng: 103.2575, campus: 'ท่าขอนยาง (รอบมอใหม่)' },
      { id: 'zone-kham-bigc', name: '📍 มอใหม่: หน้าบิ๊กซี มินิ (Big C Mini ท่าขอนยาง/ขามเรียง)', lat: 16.2445, lng: 103.2475, campus: 'มอใหม่ (ขามเรียง)' },
      { id: 'zone-kham-12', name: '📍 มอใหม่: แยกดอนยม (ไปกันทรวิชัย)', lat: 16.2580, lng: 103.2590, campus: 'มอใหม่ (ขามเรียง)' },

      // 🏛️ มอเก่า (ในเมือง)
      { id: 'zone-town-1', name: '🏛️ มอเก่า: ประตูหน้า มอเก่า (ถ.นครสวรรค์)', lat: 16.1950, lng: 103.2980, campus: 'มอเก่า (ในเมือง)' },
      { id: 'zone-town-2', name: '🏛️ มอเก่า: สี่แยกหน้า มอเก่า (รพ.สุทธาเวช)', lat: 16.1935, lng: 103.2960, campus: 'มอเก่า (ในเมือง)' },
      { id: 'zone-town-3', name: '🏛️ มอเก่า: หน้าเสริมไทยคอมเพล็กซ์', lat: 16.1980, lng: 103.2870, campus: 'มอเก่า (ในเมือง)' },
      { id: 'zone-town-bigc', name: '🏛️ มอเก่า: หน้าบิ๊กซี มหาสารคาม (Big C)', lat: 16.1925, lng: 103.2790, campus: 'มอเก่า (ในเมือง)' },
      { id: 'zone-town-4', name: '🏛️ มอเก่า: สี่แยกหอนาฬิกามหาสารคาม', lat: 16.1865, lng: 103.3005, campus: 'มอเก่า (ในเมือง)' },
      { id: 'zone-town-5', name: '🏛️ มอเก่า: หน้าโรงเรียนผดุงนารี/สารคามพิทยาคม', lat: 16.1890, lng: 103.2940, campus: 'มอเก่า (ในเมือง)' },
      { id: 'zone-town-6', name: '🏛️ มอเก่า: สี่แยกบายพาสแก่งเลิงจาน', lat: 16.1750, lng: 103.2750, campus: 'ถนนเลี่ยงเมือง' }
    ];
  }

  // ----------------------------------------------------
  // 🔗 Standardized API Method Aliases
  // ----------------------------------------------------
  createPin(data) {
    return this.addPin(data);
  }

  movePin(id, lat, lng, by, campus) {
    const pin = this.getPinById(id);
    if (!pin) return null;
    pin.lat = lat;
    pin.lng = lng;
    if (campus) pin.campusZone = campus;
    pin.moveCount = (pin.moveCount || 0) + 1;
    this.saveData();
    return pin;
  }

  resolveFlag(id, action, by) {
    return this.resolveFlaggedReport(id, action, by);
  }

  createUser(userData) {
    return this.getOrCreateUser(userData.id, userData);
  }

  updateUser(id, userData) {
    return this.saveUser(id, userData);
  }

  addExp(userId, points, reason = '') {
    return this.addScore(userId, points, reason);
  }

  resetWeeklyScores() {
    return this.checkWeeklyReset();
  }

  createChatMessage(data) {
    return this.addChatMessage(data);
  }

  createPinChatMessage(pinId, data) {
    return this.addPinChatMessage(pinId, data);
  }

  deletePinChatMessage(pinId, msgId, by) {
    return this.deletePinChatMessage(pinId, msgId, by);
  }

  clearPinChatMessages(pinId, by) {
    return this.clearPinChat(pinId, by);
  }

  // 📢 ระบบข้อความประชาสัมพันธ์ตัววิ่ง (Public Announcement Ticker)
  getAnnouncement() {
    if (!this.data.system_config) this.data.system_config = {};
    if (!this.data.system_config.announcement) {
      this.data.system_config.announcement = {
        enabled: true,
        text: "📢 ยินดีต้อนรับสู่ MSU Traffic • ขับขี่ปลอดภัย สวมหมวกกันน็อก เปิดไฟหน้ารถ • รายงานด่านแบบเรียลไทม์เพื่อความปลอดภัยของชาว มมส",
        updatedAt: Date.now()
      };
    }
    return this.data.system_config.announcement;
  }

  updateAnnouncement(text, enabled = true, updatedBy = 'dev_admin') {
    if (!this.data.system_config) this.data.system_config = {};
    this.data.system_config.announcement = {
      enabled: Boolean(enabled),
      text: typeof text === 'string' && text.trim() ? text.trim() : "📢 ขับขี่ปลอดภัย สวมหมวกกันน็อก เปิดไฟหน้ารถ • รายงานด่านแบบเรียลไทม์ MSU Traffic",
      updatedAt: Date.now(),
      updatedBy
    };
    this.saveData();

    // 🔄 ซิงค์ประกาศขึ้น Google Sheets ทันที (Instant Push)
    googleSheetsService.syncSettingsUpdate(this.data).catch(e => console.warn('Sheets announcement sync error:', e));

    // ยิง Broadcast Socket.IO ทันทีแบบ Real-time ไปยังผู้ใช้ทุกคน
    if (this.io) {
      this.io.emit('announcement_updated', this.data.system_config.announcement);
    }
    return this.data.system_config.announcement;
  }

  // ----------------------------------------------------
  // 📥 Two-Way Google Sheets Remote Apply Engine (ดึงข้อมูลตลอดเวลา)
  // ----------------------------------------------------
  applyRemoteSheetsData(sheetData) {
    if (!sheetData || sheetData.status !== 'OK') return { applied: false };
    let hasChanges = false;
    const changes = [];

    // 1. ห้องแชต (Chat Rooms Status from Sheet)
    if (Array.isArray(sheetData.chatRooms) && sheetData.chatRooms.length > 0) {
      if (!this.data.chat_rooms) this.data.chat_rooms = [];
      sheetData.chatRooms.forEach(sr => {
        if (!sr.id) return;
        const localRoom = this.data.chat_rooms.find(r => r.id === sr.id);
        const isRemoteEnabled = sr.enabled !== false && sr.status !== 'ปิดปรับปรุง';
        if (localRoom) {
          if (localRoom.enabled !== isRemoteEnabled) {
            localRoom.enabled = isRemoteEnabled;
            hasChanges = true;
            changes.push(`Chat room [${localRoom.name}] toggled -> ${isRemoteEnabled ? 'ENABLED' : 'DISABLED'}`);
            if (this.io) {
              this.io.emit('chat_room_status_changed', {
                roomId: localRoom.id,
                roomName: localRoom.name,
                enabled: localRoom.enabled
              });
            }
          }
        }
      });
    }

    // 3. การตั้งค่าระบบ (Settings from Sheet)
    if (sheetData.settings && typeof sheetData.settings === 'object') {
      if (!this.data.system_config) this.data.system_config = {};
      const s = sheetData.settings;

      if (s.globalChatEnabled !== undefined) {
        const isGlobal = s.globalChatEnabled.enabled === true || s.globalChatEnabled.value === 'เปิดใช้งาน';
        if (this.data.system_config.globalChatEnabled !== isGlobal) {
          this.data.system_config.globalChatEnabled = isGlobal;
          hasChanges = true;
          changes.push(`Global chat toggled -> ${isGlobal}`);
          if (this.io) {
            this.io.emit('global_chat_toggled', {
              globalChatEnabled: isGlobal,
              updatedBy: 'google_sheets_sync',
              timestamp: Date.now()
            });
          }
        }
      }

      if (s.allowAllEmails !== undefined) {
        const isAllow = s.allowAllEmails.enabled === true || s.allowAllEmails.value === 'เปิดใช้งาน';
        if (this.data.system_config.allowAllEmails !== isAllow) {
          this.data.system_config.allowAllEmails = isAllow;
          hasChanges = true;
        }
      }

      if (s.donateEnabled !== undefined) {
        const isDonate = s.donateEnabled.enabled === true || s.donateEnabled.value === 'เปิดใช้งาน';
        if (this.data.system_config.donateEnabled !== isDonate) {
          this.data.system_config.donateEnabled = isDonate;
          hasChanges = true;
        }
      }

      if (s.announcementText !== undefined || s.announcementEnabled !== undefined) {
        if (!this.data.system_config.announcement) this.data.system_config.announcement = { enabled: true, text: '' };
        const newText = s.announcementText?.value || this.data.system_config.announcement.text;
        const isAnnEnabled = s.announcementEnabled ? (s.announcementEnabled.enabled === true || s.announcementEnabled.value === 'เปิดใช้งาน') : this.data.system_config.announcement.enabled;
        
        if (this.data.system_config.announcement.text !== newText || this.data.system_config.announcement.enabled !== isAnnEnabled) {
          this.data.system_config.announcement.text = newText;
          this.data.system_config.announcement.enabled = isAnnEnabled;
          this.data.system_config.announcement.updatedAt = Date.now();
          hasChanges = true;
          changes.push(`Announcement updated from Sheets`);
          if (this.io) {
            this.io.emit('announcement_updated', this.data.system_config.announcement);
          }
        }
      }
    }

    // 4. ระดับยศ (Rank Tiers from Sheet)
    if (Array.isArray(sheetData.rankTiers) && sheetData.rankTiers.length > 0) {
      const isCorrupted = (str) => typeof str === 'string' && (str.includes('') || /[\uFFFD]/.test(str));
      const validTiers = sheetData.rankTiers.filter(t => t.level && t.name && !isCorrupted(t.name) && !isCorrupted(t.title));
      if (validTiers.length >= 3) {
        this.data.rank_tiers = validTiers;
        hasChanges = true;
        changes.push(`Rank tiers updated from Sheets (${validTiers.length} tiers)`);
        if (this.io) {
          this.io.emit('rank_tiers_updated', this.data.rank_tiers);
        }
      }
    }

    // 5. หมวดหมู่ด่าน (Categories from Sheet)
    if (Array.isArray(sheetData.categories) && sheetData.categories.length > 0) {
      const isCorrupted = (str) => typeof str === 'string' && (str.includes('') || /[\uFFFD]/.test(str));
      const validCats = sheetData.categories.filter(c => c.key && c.name && !isCorrupted(c.name) && !isCorrupted(c.sub));
      if (validCats.length >= 1) {
        this.data.categories = validCats;
        hasChanges = true;
        changes.push(`Categories updated from Sheets (${validCats.length} categories)`);
        if (this.io) {
          this.io.emit('categories_updated', this.data.categories);
        }
      }
    }

    if (hasChanges) {
      this.saveData();
      console.log(`✅ [SHEETS SYNC] Applied updates from Google Sheets:`, changes.join(', '));
      if (this.io) {
        this.io.emit('system_config_updated', this.data.system_config);
        this.io.emit('chat_rooms_updated', this.data.chat_rooms);
        this.io.emit('stats_update', this.getStatistics());
      }
    }

    return { applied: hasChanges, changes };
  }

  // ----------------------------------------------------
  // 🏷️ Categories & Filter Words CRUD Operations
  // ----------------------------------------------------
  getCategories() {
    if (!this.data.categories || !Array.isArray(this.data.categories) || this.data.categories.length === 0) {
      this.data.categories = [
        { key: 'helmet', name: 'หมวก/ใบขับขี่', icon: '👮‍♂️', sub: 'ใบขับขี่ / อุปกรณ์ส่วนควบ' },
        { key: 'alcohol', name: 'เป่าแอล', icon: '🍺', sub: 'เป่าแอลกอฮอล์ยามค่ำคืน' },
        { key: 'security', name: 'ตรวจค้น', icon: '🚔', sub: 'ตรวจค้นสิ่งผิดกฎหมาย' },
        { key: 'traffic', name: 'รถติด', icon: '🚗', sub: 'ชะลอตัวช่วงเร่งด่วน' },
        { key: 'accident', name: 'อุบัติเหตุ', icon: '⚠️', sub: 'โปรดระมัดระวัง' }
      ];
      this.saveData();
    }
    return this.data.categories;
  }

  addCategory({ key, name, icon, sub, adminOnly }, adminId = 'dev_admin') {
    if (!this.data.categories) this.getCategories();
    
    // สร้าง key ภาษาอังกฤษ/ตัวเลขที่ไม่ซ้ำซ้อน
    const genKey = key && key.trim() 
      ? key.trim() 
      : 'cat_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 5);

    const existingIdx = this.data.categories.findIndex(c => c.key === genKey || c.name === name);
    const newCat = {
      key: existingIdx !== -1 ? this.data.categories[existingIdx].key : genKey,
      name: name.trim(),
      icon: icon || '📍',
      sub: sub ? sub.trim() : name.trim(),
      adminOnly: adminOnly === true || adminOnly === 'true'
    };

    if (existingIdx !== -1) {
      this.data.categories[existingIdx] = newCat;
    } else {
      this.data.categories.push(newCat);
    }

    this.saveData();
    this.logAudit('CATEGORY_ADDED', adminId, newCat.key, `เพิ่ม/แก้ไขหมวดหมู่ด่าน: ${newCat.name} (เฉพาะ Admin: ${newCat.adminOnly ? 'ใช่' : 'ไม่ใช่'})`);

    // Sync to Google Sheets and broadcast to clients
    googleSheetsService.syncSettingsUpdate(this.data).catch(e => console.warn('Sheets sync error:', e));
    if (this.io) {
      this.io.emit('categories_updated', this.data.categories);
    }
    return this.data.categories;
  }

  toggleCategoryAdminOnly(key, adminId = 'dev_admin') {
    if (!this.data.categories) this.getCategories();
    const cat = this.data.categories.find(c => c.key === key);
    if (!cat) throw new Error('ไม่พบหมวดหมู่นี้ในระบบ');

    cat.adminOnly = !cat.adminOnly;
    this.saveData();
    this.logAudit('CATEGORY_ADMIN_ONLY_TOGGLE', adminId, key, `สลับสิทธิ์เฉพาะแอดมินหมวดหมู่ [${cat.name}]: ${cat.adminOnly ? '🔒 เฉพาะแอดมิน' : '🌐 ทุกคนใช้ได้'}`);

    // Sync to Google Sheets and broadcast to clients
    googleSheetsService.syncSettingsUpdate(this.data).catch(e => console.warn('Sheets sync error:', e));
    if (this.io) {
      this.io.emit('categories_updated', this.data.categories);
    }
    return cat;
  }

  deleteCategory(key, adminId = 'dev_admin') {
    if (!this.data.categories) this.getCategories();
    const idx = this.data.categories.findIndex(c => c.key === key);
    if (idx === -1) {
      throw new Error('ไม่พบหมวดหมู่นี้ในระบบ');
    }

    const removed = this.data.categories.splice(idx, 1)[0];
    this.saveData();
    this.logAudit('CATEGORY_DELETED', adminId, key, `ลบหมวดหมู่ด่าน: ${removed?.name || key}`);

    // Sync to Google Sheets and broadcast to clients
    googleSheetsService.syncSettingsUpdate(this.data).catch(e => console.warn('Sheets sync error:', e));
    if (this.io) {
      this.io.emit('categories_updated', this.data.categories);
    }
    return this.data.categories;
  }
}

module.exports = new Database();

