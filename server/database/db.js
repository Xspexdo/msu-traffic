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

// 🎖️ Season 1 Rank Tiers
const RANK_TIERS = [
  { level: 1, key: 'novice', name: 'ผู้สัญจรมือใหม่', minExp: 0, maxExp: 99, icon: '🥉', color: '#B45309', badgeClass: 'rank-bronze', title: 'Novice Scout' },
  { level: 2, key: 'scout', name: 'สายสืบ มมส', minExp: 100, maxExp: 299, icon: '🥈', color: '#475569', badgeClass: 'rank-silver', title: 'Campus Scout' },
  { level: 3, key: 'warden', name: 'ผู้พิทักษ์ทางหลวง', minExp: 300, maxExp: 699, icon: '🥇', color: '#D97706', badgeClass: 'rank-gold', title: 'Traffic Warden' },
  { level: 4, key: 'veteran', name: 'ยอดสายตรวจขามเรียง', minExp: 700, maxExp: 1499, icon: '💎', color: '#2563EB', badgeClass: 'rank-diamond', title: 'Khamriang Veteran' },
  { level: 5, key: 'legend', name: 'ตำนานมีด่านบอกด้วย', minExp: 1500, maxExp: Infinity, icon: '👑', color: '#7C3AED', badgeClass: 'rank-legend', title: 'MSU Legend' }
];

function calculateRank(exp = 0, isDev = false) {
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

  for (let i = 0; i < RANK_TIERS.length; i++) {
    const tier = RANK_TIERS[i];
    if (exp >= tier.minExp && (tier.maxExp === Infinity || exp <= tier.maxExp)) {
      const nextTier = RANK_TIERS[i + 1] || null;
      let pointsToNext = 0;
      let progressPercent = 100;

      if (nextTier) {
        const range = nextTier.minExp - tier.minExp;
        const currentProgress = exp - tier.minExp;
        pointsToNext = nextTier.minExp - exp;
        progressPercent = Math.min(100, Math.max(0, Math.round((currentProgress / range) * 100)));
      }

      return {
        level: tier.level,
        key: tier.key,
        name: tier.name,
        title: tier.title,
        icon: tier.icon,
        color: tier.color,
        badgeClass: tier.badgeClass,
        exp: exp,
        nextRank: nextTier ? nextTier.name : null,
        pointsToNext: pointsToNext,
        progressPercent: progressPercent
      };
    }
  }

  return {
    ...RANK_TIERS[0],
    exp: 0,
    nextRank: RANK_TIERS[1].name,
    pointsToNext: 100,
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

    users: {
      "dev_java5263": {
        id: "dev_java5263",
        email: "java5263@gmail.com",
        name: "Java (Lead Developer)",
        picture: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80",
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
          picture: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60"
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
          picture: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60"
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
        senderPicture: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60",
        text: "🎉 ยินดีต้อนรับสู่ห้อง Local Chat ของนิสิต มมส (Season 1)! ห้องแชตนี้จะเปิดให้เฉพาะบัญชี @msu.ac.th ที่อยู่ในรัศมีรอบ มมส เท่านั้นครับ",
        isAnonymous: false,
        location: { lat: 16.2468, lng: 103.2520, distKm: 0.0, inZone: true },
        createdAt: now
      }
    ],

    message_reports: [],
    warnings: [],
    bans: [],
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
  // 🏆 Daily Rank Reset Engine (รีเซ็ตทุก 1 วัน / 24 ชั่วโมง)
  // ----------------------------------------------------
  checkWeeklyReset() {
    const now = Date.now();
    const cycleEnd = this.data.dayEnd || this.data.weekEnd || 0;
    if (now >= cycleEnd) {
      this.data.dayNumber = (this.data.dayNumber || 1) + 1;
      this.data.weekNumber = (this.data.weekNumber || 1) + 1;
      this.data.dayStart = now;
      this.data.dayEnd = now + (24 * 60 * 60 * 1000); // 1 วัน
      this.data.weekEnd = this.data.dayEnd;

      // Reset users active scores
      Object.values(this.data.users).forEach(user => {
        user.weeklyScore = 0;
      });

      this.saveData();
      console.log(`🏆 [RANK ENGINE] Daily reset completed for Day ${this.data.dayNumber}`);
      if (this.io) {
        this.io.emit('leaderboard_update', this.getWeeklyLeaderboard(10));
      }
    }
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
        picture: userData.picture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
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
      // Update last active
      this.data.users[userData.id].lastActiveAt = now;
      if (userData.name) this.data.users[userData.id].name = userData.name;
      if (userData.picture) this.data.users[userData.id].picture = userData.picture;
      this.saveData();
    }

    const user = this.data.users[userData.id];
    return {
      ...user,
      rank: calculateRank(user.allTimeScore, user.isDev)
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
      rank: calculateRank(user.allTimeScore, user.isDev)
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
    let reporterObj = pinData.reporter;
    if (isAnnouncement && reporterObj) {
      reporterObj = {
        ...reporterObj,
        name: 'MSU Traffic',
        picture: 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=120&auto=format&fit=crop&q=80',
        badge: '📢 MSU Traffic',
        isOfficial: true,
        isAnnouncement: true
      };
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
      isAnonymous: pinData.isAnonymous === true,
      isAnnouncement: isAnnouncement,
      reporterId: pinData.reporterId || 'anonymous',
      reporter: reporterObj,
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

    // Update user stats and score
    if (pinData.reporterId && this.data.users[pinData.reporterId]) {
      const user = this.data.users[pinData.reporterId];
      user.pinsCreated = (user.pinsCreated || 0) + 1;
      this.addScore(pinData.reporterId, 15, 'สร้างรายงานด่านคุณภาพ');
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

    // 🔒 จำกัดการย้ายหมุดสูงสุด 3 ครั้งต่อหมุด สำหรับผู้ใช้ทั่วไป (Dev ย้ายได้ไม่จำกัด)
    const currentMoves = pin.moveCount || 0;
    if (!isDev && currentMoves >= 3) {
      return {
        success: false,
        error: 'MOVE_LIMIT_REACHED',
        message: 'คุณสามารถย้ายตำแหน่งหมุดนี้ได้สูงสุด 3 ครั้งเท่านั้น เพื่อความถูกต้องของข้อมูล',
        remainingMoves: 0,
        pin
      };
    }

    pin.lat = lat;
    pin.lng = lng;
    if (locationName) pin.locationName = locationName;
    if (!isDev) {
      pin.moveCount = currentMoves + 1;
    }

    this.saveData();
    this.logAudit('PIN_MOVE', pin.reporterId, pinId, `ย้ายพิกัดหมุดเป็น [${lat}, ${lng}] (ครั้งที่ ${pin.moveCount || 1}/3)`);
    googleSheetsService.syncPinUpdate(pin).catch(e => console.warn('Sheets sync error:', e));

    return {
      success: true,
      pin,
      moveCount: pin.moveCount || 0,
      remainingMoves: isDev ? 'unlimited' : Math.max(0, 3 - (pin.moveCount || 0))
    };
  }

  deletePin(pinId, userId) {
    const idx = this.data.pins.findIndex(p => p.id === pinId);
    if (idx === -1) return false;
    this.data.pins.splice(idx, 1);
    this.saveData();
    this.logAudit('PIN_DELETE', userId, pinId, `ลบหมุดด่าน ${pinId}`);
    googleSheetsService.syncPinDelete(pinId).catch(e => console.warn('Sheets sync error:', e));
    return true;
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

    // 🔒 ตรวจสอบว่าห้องเปิดใช้งานอยู่หรือไม่ (ถ้าปิดปรับปรุงอยู่ Dev ส่งได้ แต่ผู้ใช้ทั่วไปจะส่งไม่ได้)
    const targetRoom = (this.data.chat_rooms || []).find(r => r.id === roomId);
    if (targetRoom && targetRoom.enabled === false && !isDev) {
      return {
        success: false,
        error: `🚧 ห้องแชต "${targetRoom.name}" อยู่ระหว่างปิดปรับปรุง เร็วๆนี้`,
        isMaintenance: true
      };
    }

    // 🔒 2-Layer Geofence & MSU Domain Verification
    if (!isDev) {
      if (!isMsu) {
        return { success: false, error: 'เฉพาะนิสิตและบุคลากรที่มีอีเมล @msu.ac.th เท่านั้นที่ส่งข้อความได้' };
      }
      const geoCheck = isInsideMSUGeofence(lat, lng);
      if (!geoCheck.inZone) {
        return {
          success: false,
          error: `คุณอยู่นอกพื้นที่ มมส (${geoCheck.distanceKm} กม.) แชตจะเปิดให้ส่งได้เฉพาะเมื่ออยู่ในรัศมี 20 กม. รอบมหาวิทยาลัยเท่านั้น`,
          distanceKm: geoCheck.distanceKm
        };
      }
    }

    const isOfficialAnnouncement = isAnnouncement === true && isDev;
    let senderName = isAnonymous ? 'นิสิตนิรนาม' : sender.name;
    let senderBadge = isDev ? '👑 DEV' : (isMsu ? '🎓 MSU' : '👤 Member');
    let senderPicture = isAnonymous ? 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60' : sender.picture;
    let senderEmail = isAnonymous ? '' : sender.email;

    if (isOfficialAnnouncement) {
      senderName = 'MSU Traffic';
      senderBadge = '📢 ประกาศทางการ';
      senderPicture = 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=100&auto=format&fit=crop&q=80';
    }

    const geo = isInsideMSUGeofence(lat, lng);
    const msgId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newMsg = {
      id: msgId,
      roomId: roomId || 'general',
      senderId: isOfficialAnnouncement ? 'official_msu_traffic' : sender.id,
      senderName,
      senderEmail,
      senderBadge,
      senderPicture,
      text: text.trim(),
      isAnonymous: !isOfficialAnnouncement && isAnonymous === true,
      isAnnouncement: isOfficialAnnouncement,
      location: {
        lat: lat || null,
        lng: lng || null,
        distKm: geo.distanceKm,
        inZone: geo.inZone
      },
      createdAt: Date.now()
    };

    this.data.chat_messages.push(newMsg);
    // Keep max 500 messages in storage
    if (this.data.chat_messages.length > 500) {
      this.data.chat_messages = this.data.chat_messages.slice(-400);
    }

    // Increment room message count
    const room = this.data.chat_rooms.find(r => r.id === roomId);
    if (room) room.msgCount = (room.msgCount || 0) + 1;

    this.addScore(sender.id, 1, 'มีส่วนร่วมในแชต มมส');
    this.saveData();
    return { success: true, message: newMsg };
  }

  // ✏️ แก้ไขข้อความในแชต
  editChatMessage(messageId, newText, user) {
    if (!this.data.chat_messages) return { success: false, error: 'ไม่พบข้อมูลข้อความ' };
    const msg = this.data.chat_messages.find(m => m.id === messageId);
    if (!msg) return { success: false, error: 'ไม่พบข้อความที่ต้องการแก้ไข' };

    const isDev = user.isDev === true || (user.email && user.email.toLowerCase() === 'java5263@gmail.com');
    const isOwner = msg.senderId === user.id || (user.email && msg.senderEmail === user.email);

    if (!isDev && !isOwner) {
      return { success: false, error: 'คุณไม่มีสิทธิ์แก้ไขข้อความของผู้อื่น' };
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
    let senderPicture = isAnonymous ? 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60' : (sender.picture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100');
    let senderEmail = isAnonymous ? '' : sender.email;

    if (isOfficialAnnouncement) {
      senderName = 'MSU Traffic';
      senderBadge = '📢 ประกาศทางการ';
      senderPicture = 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=100&auto=format&fit=crop&q=80';
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
  // 🏆 Leaderboard Operations (Daily / Weekly & All-Time)
  // ----------------------------------------------------
  getWeeklyLeaderboard(limit = 10) {
    // ❗ เฉพาะผู้ใช้ที่มีคะแนนมากกว่า 0 EXP เท่านั้นที่จะขึ้นแสดงบนอันดับ
    const list = Object.values(this.data.users)
      .filter(u => (u.weeklyScore || 0) > 0)
      .map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        picture: u.picture,
        badge: u.badge,
        isDev: u.isDev,
        trustScore: u.trustScore || 50,
        score: u.weeklyScore || 0,
        pinsCreated: u.pinsCreated || 0,
        rank: calculateRank(u.allTimeScore, u.isDev)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return {
      season: this.data.season,
      seasonName: this.data.seasonName,
      weekNumber: this.data.weekNumber || 1,
      dayNumber: this.data.dayNumber || 1,
      weekEnd: this.data.dayEnd || this.data.weekEnd || (Date.now() + (24 * 60 * 60 * 1000)),
      rankings: list
    };
  }

  getAllTimeLeaderboard(limit = 10) {
    // ❗ เฉพาะผู้ใช้ที่มีคะแนนมากกว่า 0 EXP เท่านั้น
    const list = Object.values(this.data.users)
      .filter(u => (u.allTimeScore || 0) > 0)
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
        rank: calculateRank(u.allTimeScore, u.isDev)
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
      this.data.pins = [];
      this.data.pin_reports = [];
      this.data.pin_likes = [];
      this.data.pin_chat_messages = [];
      if (this.data.flagged_reports) {
        this.data.flagged_reports = [];
      }
      results.resetPins = true;
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

    return {
      active,
      today,
      cleared,
      totalUsers: Object.keys(this.data.users).length,
      pendingFlags,
      bannedUsers,
      season: this.data.season,
      weekNumber: this.data.weekNumber
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
}

module.exports = new Database();

