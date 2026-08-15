const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '../../data');
const DB_FILE = path.join(DB_DIR, 'database.json');

// Ensure data folder exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// 🎖️ MSU Traffic Rank Tiers
const RANK_TIERS = [
  { level: 1, key: 'novice', name: 'ผู้สัญจรมือใหม่', minExp: 0, maxExp: 49, icon: '🥉', color: '#B45309', badgeClass: 'rank-bronze', title: 'Novice Scout' },
  { level: 2, key: 'scout', name: 'สายสืบ มมส', minExp: 50, maxExp: 149, icon: '🥈', color: '#475569', badgeClass: 'rank-silver', title: 'Campus Scout' },
  { level: 3, key: 'warden', name: 'ผู้พิทักษ์ทางหลวง', minExp: 150, maxExp: 349, icon: '🥇', color: '#D97706', badgeClass: 'rank-gold', title: 'Traffic Warden' },
  { level: 4, key: 'veteran', name: 'ยอดสายตรวจขามเรียง', minExp: 350, maxExp: 749, icon: '💎', color: '#2563EB', badgeClass: 'rank-diamond', title: 'Khamriang Veteran' },
  { level: 5, key: 'legend', name: 'ตำนานมีด่านบอกด้วย', minExp: 750, maxExp: Infinity, icon: '👑', color: '#7C3AED', badgeClass: 'rank-legend', title: 'MSU Legend' }
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
    pointsToNext: 50,
    progressPercent: 0
  };
}

// MSU Hotspots & Zones
const MSU_ZONES = [
  // โซน มอใหม่ (ขามเรียง)
  {
    id: 'khamriang-main-gate',
    name: 'หน้าป้าย มมส (มอใหม่ ขามเรียง)',
    campus: 'มอใหม่ (ขามเรียง)',
    lat: 16.2467,
    lng: 103.2520,
    type: 'hotspot',
    description: 'ถนนทางหลวง 2202 หน้าป้ายมหาวิทยาลัยมหาสารคาม'
  },
  {
    id: 'khamriang-gate-1',
    name: 'ประตู 1 มมส ใหม่ (ทางเข้าหลัก)',
    campus: 'มอใหม่ (ขามเรียง)',
    lat: 16.2429,
    lng: 103.2505,
    type: 'hotspot',
    description: 'ประตูทางเข้าหลักข้างคณะการบัญชีและการจัดการ'
  },
  {
    id: 'khamriang-forestry-roundabout',
    name: 'วงเวียนป่าไม้ / ตลาดน้อย มมส',
    campus: 'มอใหม่ (ขามเรียง)',
    lat: 16.2450,
    lng: 103.2555,
    type: 'hotspot',
    description: 'วงเวียนใน ม. ใกล้ตลาดน้อยและคณะสิ่งแวดล้อม'
  },
  {
    id: 'takhonyang-intersection',
    name: 'สามแยกไฟแดงท่าขอนยาง',
    campus: 'ท่าขอนยาง (รอบมอใหม่)',
    lat: 16.2365,
    lng: 103.2562,
    type: 'hotspot',
    description: 'สามแยกไฟแดงหลักก่อนข้ามสะพานเข้ามอใหม่'
  },
  {
    id: 'takhonyang-bridge',
    name: 'สะพานข้ามคลองท่าขอนยาง (สะพานดำ)',
    campus: 'ท่าขอนยาง (รอบมอใหม่)',
    lat: 16.2380,
    lng: 103.2540,
    type: 'hotspot',
    description: 'สะพานเชื่อมระหว่างท่าขอนยางกับทางเข้ามอใหม่'
  },
  {
    id: 'khamriang-back-gate',
    name: 'ถนนหลังมอ / โค้งเซเว่นคลองถม',
    campus: 'มอใหม่ (ขามเรียง)',
    lat: 16.2485,
    lng: 103.2450,
    type: 'hotspot',
    description: 'โซนหอพักหลังมอ และทางออกไปบ้านดอนยม'
  },
  {
    id: 'khamriang-four-corners',
    name: 'สี่แยกบ้านขามเรียง',
    campus: 'มอใหม่ (ขามเรียง)',
    lat: 16.2520,
    lng: 103.2590,
    type: 'hotspot',
    description: 'สี่แยกทางไปคณะสถาปัตยกรรมและโรงเรียนสาธิต มมส'
  },
  {
    id: 'khamriang-taksila-bypass',
    name: 'ถนนเลี่ยงเมือง มมส - แยกตักสิลา',
    campus: 'ถนนเลี่ยงเมือง',
    lat: 16.2290,
    lng: 103.2680,
    type: 'hotspot',
    description: 'ถนนบายพาสเลี่ยงเมืองมหาสารคาม มุ่งหน้าไปร้อยเอ็ด/โกสุมพิสัย'
  },

  // โซน มอเก่า (ในเมือง)
  {
    id: 'downtown-main-gate',
    name: 'หน้าป้าย มมส (มอเก่า ในเมือง)',
    campus: 'มอเก่า (ในเมือง)',
    lat: 16.1868,
    lng: 103.2982,
    type: 'hotspot',
    description: 'หน้ามหาวิทยาลัยมหาสารคาม เขตพื้นที่ในเมือง ใกล้ มรภ.มค.'
  },
  {
    id: 'downtown-clock-tower',
    name: 'สี่แยกหอนาฬิกา / ศาลากลางเก่า',
    campus: 'มอเก่า (ในเมือง)',
    lat: 16.1835,
    lng: 103.3005,
    type: 'hotspot',
    description: 'ใจกลางเมืองมหาสารคาม ใกล้ตลาดสดเทศบาล'
  },
  {
    id: 'downtown-sermthai-plaza',
    name: 'สี่แยกเสริมไทยพลาซ่า มอเก่า',
    campus: 'มอเก่า (ในเมือง)',
    lat: 16.1890,
    lng: 103.3020,
    type: 'hotspot',
    description: 'สี่แยกไฟแดงหน้าห้างเสริมไทยพลาซ่าสาขาในเมือง'
  },
  {
    id: 'downtown-technical-college',
    name: 'หน้าวิทยาลัยเทคนิค / โรงเรียนผดุงนารี',
    campus: 'มอเก่า (ในเมือง)',
    lat: 16.1920,
    lng: 103.2950,
    type: 'hotspot',
    description: 'ถนนนครสวรรค์ ใกล้วิทยาลัยอาชีวะและเทคนิค'
  }
];

// Initial realistic seed reports
function getSeedReports() {
  const now = Date.now();
  return [
    {
      id: 'msu-rep-001',
      title: 'ด่านตรวจหมวกกันน็อกและใบขับขี่',
      locationName: 'หน้าป้าย มมส (มอใหม่ ขามเรียง)',
      customLocation: '',
      campusZone: 'มอใหม่ (ขามเรียง)',
      lat: 16.2467,
      lng: 103.2520,
      type: 'helmet',
      direction: 'ฝั่งขาเข้ามอใหม่ (มุ่งหน้าคณะวิทยาศาสตร์)',
      description: 'เจ้าหน้าที่ตำรวจ สภ.เขวาใหญ่ ตั้งด่านตรวจหมวกกันน็อกและใบขับขี่ สวมหมวกกันน็อกและพกใบขับขี่ด้วยครับ',
      severity: 'high',
      status: 'active',
      reporter: {
        id: 'user-google-101',
        name: 'นิสิต มมส (สารคาม)',
        email: 'msu_student@msu.ac.th',
        picture: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=60',
        rank: calculateRank(420)
      },
      createdAt: now - (25 * 60 * 1000),
      updatedAt: now - (25 * 60 * 1000),
      expiresAt: now + (2.5 * 60 * 60 * 1000),
      votes: {
        up: ['user-002', 'user-003', 'user-004', 'user-005', 'user-006'],
        down: []
      }
    },
    {
      id: 'msu-rep-002',
      title: 'ด่านตรวจความมั่นคง / รถแต่งท่อดัง',
      locationName: 'สามแยกไฟแดงท่าขอนยาง',
      customLocation: '',
      campusZone: 'ท่าขอนยาง (รอบมอใหม่)',
      lat: 16.2365,
      lng: 103.2562,
      type: 'security',
      direction: 'ฝั่งมุ่งหน้าข้ามสะพานเข้ามอใหม่',
      description: 'มีเจ้าหน้าที่เรียกตรวจป้ายทะเบียน และอุปกรณ์ส่วนควบรถมอเตอร์ไซค์',
      severity: 'medium',
      status: 'active',
      reporter: {
        id: 'user-google-102',
        name: 'เด็กท่าขอนยาง',
        email: 'takhonyang_rider@gmail.com',
        picture: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=60',
        rank: calculateRank(230)
      },
      createdAt: now - (50 * 60 * 1000),
      updatedAt: now - (50 * 60 * 1000),
      expiresAt: now + (2 * 60 * 60 * 1000),
      votes: {
        up: ['user-001', 'user-007', 'user-008'],
        down: []
      }
    },
    {
      id: 'msu-rep-003',
      title: 'รถติดสะสมช่วงเลิกเรียน',
      locationName: 'ถนนหลังมอ / โค้งเซเว่นคลองถม',
      customLocation: '',
      campusZone: 'มอใหม่ (ขามเรียง)',
      lat: 16.2485,
      lng: 103.2450,
      type: 'traffic',
      direction: 'ทั้งสองฝั่งทาง',
      description: 'มีรถส่งของจอดขวางและการจราจรหนาแน่น เคลื่อนตัวช้ามาก',
      severity: 'low',
      status: 'active',
      reporter: {
        id: 'user-google-103',
        name: 'Napat Dev',
        email: 'napat.msu@gmail.com',
        picture: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=60',
        rank: calculateRank(95)
      },
      createdAt: now - (15 * 60 * 1000),
      updatedAt: now - (15 * 60 * 1000),
      expiresAt: now + (1.5 * 60 * 60 * 1000),
      votes: {
        up: ['user-009'],
        down: []
      }
    },
    {
      id: 'msu-rep-004',
      title: 'ด่านตรวจวินัยจราจรและตรวจวัดแอลกอฮอล์',
      locationName: 'หน้าป้าย มมส (มอเก่า ในเมือง)',
      customLocation: '',
      campusZone: 'มอเก่า (ในเมือง)',
      lat: 16.1868,
      lng: 103.2982,
      type: 'alcohol',
      direction: 'ฝั่งขาเข้าตัวเมืองมหาสารคาม',
      description: 'ตรวจวัดแอลกอฮอล์และใบขับขี่ช่วงค่ำ เจ้าหน้าที่ประมาณ 6 นาย',
      severity: 'high',
      status: 'active',
      reporter: {
        id: 'user-google-104',
        name: 'Maha Sarakham Live',
        email: 'msulive@gmail.com',
        picture: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=60',
        rank: calculateRank(620)
      },
      createdAt: now - (80 * 60 * 1000),
      updatedAt: now - (80 * 60 * 1000),
      expiresAt: now + (1 * 60 * 60 * 1000),
      votes: {
        up: ['user-010', 'user-011', 'user-012'],
        down: ['user-013']
      }
    }
  ];
}

// Initial Leaderboard Seed Data
function getSeedUserStats() {
  return {
    'dev_java5263': {
      id: 'dev_java5263',
      name: 'Java (Lead Developer)',
      email: 'java5263@gmail.com',
      picture: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
      isDev: true,
      exp: 1580,
      reportsCount: 42,
      upvotesReceived: 128,
      helpfulVotesGiven: 85,
      accuracyRate: 98,
      lastActive: Date.now()
    },
    'user-google-104': {
      id: 'user-google-104',
      name: 'Maha Sarakham Live',
      email: 'msulive@gmail.com',
      picture: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=60',
      isDev: false,
      exp: 840,
      reportsCount: 28,
      upvotesReceived: 76,
      helpfulVotesGiven: 45,
      accuracyRate: 96,
      lastActive: Date.now() - 3600000
    },
    'user-google-101': {
      id: 'user-google-101',
      name: 'นิสิต มมส (สารคาม)',
      email: 'msu_student@msu.ac.th',
      picture: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=60',
      isDev: false,
      exp: 420,
      reportsCount: 15,
      upvotesReceived: 38,
      helpfulVotesGiven: 22,
      accuracyRate: 94,
      lastActive: Date.now() - 7200000
    },
    'user-google-102': {
      id: 'user-google-102',
      name: 'เด็กท่าขอนยาง',
      email: 'takhonyang_rider@gmail.com',
      picture: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=60',
      isDev: false,
      exp: 230,
      reportsCount: 8,
      upvotesReceived: 21,
      helpfulVotesGiven: 14,
      accuracyRate: 91,
      lastActive: Date.now() - 14400000
    },
    'user-google-103': {
      id: 'user-google-103',
      name: 'Napat Dev',
      email: 'napat.msu@gmail.com',
      picture: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=60',
      isDev: false,
      exp: 95,
      reportsCount: 4,
      upvotesReceived: 10,
      helpfulVotesGiven: 8,
      accuracyRate: 90,
      lastActive: Date.now() - 28800000
    }
  };
}

class Database {
  constructor() {
    this.data = {
      reports: [],
      userStats: {},
      bans: []
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        this.data = JSON.parse(raw);
        if (!this.data.userStats || Object.keys(this.data.userStats).length === 0) {
          this.data.userStats = getSeedUserStats();
          this.save();
        }
      } else {
        this.data.reports = getSeedReports();
        this.data.userStats = getSeedUserStats();
        this.save();
      }
    } catch (err) {
      console.error('Error loading DB, initializing seed data:', err);
      this.data.reports = getSeedReports();
      this.data.userStats = getSeedUserStats();
      this.save();
    }
  }

  save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('Error writing to DB file:', err);
    }
  }

  // ==========================================
  // 🎖️ USER RANK & REPUTATION ENGINE
  // ==========================================

  getUserStats(userId, fallbackInfo = {}) {
    if (!userId) return null;
    let user = this.data.userStats[userId];

    if (!user) {
      const isDev = fallbackInfo.isDev || fallbackInfo.email === 'java5263@gmail.com';
      user = {
        id: userId,
        name: fallbackInfo.name || 'นิสิต มมส',
        email: fallbackInfo.email || '',
        picture: fallbackInfo.picture || null,
        isDev: isDev,
        exp: isDev ? 1580 : 0,
        reportsCount: 0,
        upvotesReceived: 0,
        helpfulVotesGiven: 0,
        accuracyRate: 100,
        lastActive: Date.now()
      };
      this.data.userStats[userId] = user;
      this.save();
    }

    // Attach computed rank object
    const rank = calculateRank(user.exp, user.isDev);
    return {
      ...user,
      rank
    };
  }

  awardUserExp(userId, userInfo = {}, expAmount = 0, reason = '') {
    if (!userId) return null;
    let user = this.data.userStats[userId];

    const isDev = userInfo.isDev || userInfo.email === 'java5263@gmail.com';

    if (!user) {
      user = {
        id: userId,
        name: userInfo.name || 'นิสิต มมส',
        email: userInfo.email || '',
        picture: userInfo.picture || null,
        isDev: isDev,
        exp: isDev ? 1580 : 0,
        reportsCount: 0,
        upvotesReceived: 0,
        helpfulVotesGiven: 0,
        accuracyRate: 100,
        lastActive: Date.now()
      };
      this.data.userStats[userId] = user;
    }

    const oldRank = calculateRank(user.exp, user.isDev);
    user.exp = Math.max(0, user.exp + expAmount);
    user.lastActive = Date.now();

    if (userInfo.name && userInfo.name !== user.name) user.name = userInfo.name;
    if (userInfo.picture && userInfo.picture !== user.picture) user.picture = userInfo.picture;

    const newRank = calculateRank(user.exp, user.isDev);
    const leveledUp = newRank.level > oldRank.level;

    this.save();

    return {
      user: {
        ...user,
        rank: newRank
      },
      expGained: expAmount,
      reason,
      leveledUp,
      oldRank,
      newRank
    };
  }

  getLeaderboard(limit = 10) {
    const list = Object.values(this.data.userStats || {}).map(user => {
      const rank = calculateRank(user.exp, user.isDev);
      return {
        ...user,
        rank
      };
    });

    // Sort by EXP descending
    list.sort((a, b) => b.exp - a.exp);

    // Assign placement rank numbers (1, 2, 3...)
    return list.slice(0, limit).map((u, index) => ({
      ...u,
      placement: index + 1
    }));
  }

  getRankTiers() {
    return RANK_TIERS;
  }

  // ==========================================
  // 📋 REPORTS MANAGEMENT
  // ==========================================

  // Get reports with filters
  getReports({ zone = 'all', type = 'all', status = 'all', search = '' } = {}) {
    this.checkExpirations();
    let list = [...this.data.reports];

    // Ensure all reports have updated rank badges for their reporters
    list = list.map(r => {
      if (r.reporter && r.reporter.id) {
        const stats = this.getUserStats(r.reporter.id, r.reporter);
        if (stats && stats.rank) {
          r.reporter.rank = stats.rank;
        }
      }
      return r;
    });

    if (zone && zone !== 'all') {
      list = list.filter(r => r.campusZone.includes(zone) || r.locationName.includes(zone));
    }

    if (type && type !== 'all') {
      list = list.filter(r => r.type === type);
    }

    if (status && status !== 'all') {
      list = list.filter(r => r.status === status);
    }

    if (search && search.trim() !== '') {
      const q = search.toLowerCase();
      list = list.filter(r =>
        (r.title && r.title.toLowerCase().includes(q)) ||
        (r.locationName && r.locationName.toLowerCase().includes(q)) ||
        (r.customLocation && r.customLocation.toLowerCase().includes(q)) ||
        (r.description && r.description.toLowerCase().includes(q)) ||
        (r.campusZone && r.campusZone.toLowerCase().includes(q))
      );
    }

    // Sort by latest created
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  getReportById(id) {
    const report = this.data.reports.find(r => r.id === id);
    if (report && report.reporter && report.reporter.id) {
      const stats = this.getUserStats(report.reporter.id, report.reporter);
      if (stats && stats.rank) {
        report.reporter.rank = stats.rank;
      }
    }
    return report;
  }

  addReport(reportData) {
    const now = Date.now();
    const reporterId = reportData.reporter?.id || 'anonymous';
    
    // 🌟 Award +15 EXP for posting useful report
    let reporterRank = calculateRank(0, !!reportData.reporter?.isDev);
    if (reporterId && reporterId !== 'anonymous') {
      const result = this.awardUserExp(reporterId, reportData.reporter, 15, 'โพสต์รายงานด่านใหม่');
      if (result && result.user) {
        this.data.userStats[reporterId].reportsCount = (this.data.userStats[reporterId].reportsCount || 0) + 1;
        reporterRank = result.user.rank;
      }
    }

    const newReport = {
      id: `msu-rep-${now}-${Math.random().toString(36).substr(2, 4)}`,
      title: reportData.title || this.getDefaultTitle(reportData.type),
      locationName: reportData.locationName || 'พิกัดที่ระบุเองรอบ มมส',
      customLocation: reportData.customLocation || '',
      campusZone: reportData.campusZone || 'มอใหม่ (ขามเรียง)',
      lat: parseFloat(reportData.lat) || 16.2467,
      lng: parseFloat(reportData.lng) || 103.2520,
      type: reportData.type || 'helmet',
      direction: reportData.direction || 'ไม่ระบุฝั่งถนน',
      description: reportData.description || '',
      imageUrl: reportData.imageUrl || null,
      severity: reportData.severity || 'medium',
      status: 'active',
      reporter: {
        id: reporterId,
        name: reportData.reporter?.name || 'นิสิต มมส',
        email: reportData.reporter?.email || 'user@msu.ac.th',
        picture: reportData.reporter?.picture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60',
        isDev: !!reportData.reporter?.isDev,
        role: reportData.reporter?.role || 'student',
        rank: reporterRank
      },
      createdAt: now,
      updatedAt: now,
      expiresAt: now + (3 * 60 * 60 * 1000), // Default active 3 hours
      votes: {
        up: [reporterId],
        down: []
      }
    };

    this.data.reports.unshift(newReport);
    this.save();
    return newReport;
  }

  voteReport(reportId, userId, voteType, voterInfo = {}) {
    const report = this.data.reports.find(r => r.id === reportId);
    if (!report) return null;

    if (!report.votes) {
      report.votes = { up: [], down: [] };
    }

    const previouslyUpvoted = report.votes.up.includes(userId);
    const previouslyDownvoted = report.votes.down.includes(userId);

    // Remove user previous votes
    report.votes.up = report.votes.up.filter(u => u !== userId);
    report.votes.down = report.votes.down.filter(u => u !== userId);

    let rankReward = null;

    if (voteType === 'up') {
      report.votes.up.push(userId);
      
      // If author is different from voter, award points!
      if (report.reporter?.id && report.reporter.id !== userId && !previouslyUpvoted) {
        // 🌟 Author gets +10 EXP for a helpful confirmed report!
        const authorReward = this.awardUserExp(report.reporter.id, report.reporter, 10, 'มีเพื่อนนิสิตเห็นด้วยกับรายงานของคุณ');
        if (this.data.userStats[report.reporter.id]) {
          this.data.userStats[report.reporter.id].upvotesReceived = (this.data.userStats[report.reporter.id].upvotesReceived || 0) + 1;
        }

        // 🌟 Voter gets +2 EXP for community contribution!
        const voterReward = this.awardUserExp(userId, voterInfo, 2, 'ร่วมยืนยันข้อมูลด่านจราจร');
        if (this.data.userStats[userId]) {
          this.data.userStats[userId].helpfulVotesGiven = (this.data.userStats[userId].helpfulVotesGiven || 0) + 1;
        }

        rankReward = {
          authorReward,
          voterReward
        };
      }

      // If was cleared, revive if confirmed by multiple
      if (report.votes.up.length > report.votes.down.length) {
        report.status = 'active';
      }
    } else if (voteType === 'down') {
      report.votes.down.push(userId);
      // If downvotes exceed upvotes by 3 or downvotes >= 3, mark as cleared/ยกด่าน
      if (report.votes.down.length >= 3 && report.votes.down.length > report.votes.up.length) {
        report.status = 'cleared';
      }
    }

    // Refresh reporter rank on the report
    if (report.reporter?.id) {
      const stats = this.getUserStats(report.reporter.id, report.reporter);
      if (stats && stats.rank) {
        report.reporter.rank = stats.rank;
      }
    }

    report.updatedAt = Date.now();
    this.save();
    return {
      report,
      rankReward
    };
  }

  clearReport(reportId, userId) {
    const report = this.data.reports.find(r => r.id === reportId);
    if (!report) return null;

    report.status = 'cleared';
    report.updatedAt = Date.now();
    this.save();
    return report;
  }

  updateReportLocation(reportId, lat, lng, locationName) {
    const report = this.data.reports.find(r => r.id === reportId);
    if (!report) return null;

    report.lat = parseFloat(lat);
    report.lng = parseFloat(lng);
    if (locationName) report.locationName = locationName;
    report.updatedAt = Date.now();
    this.save();
    return report;
  }

  deleteReport(reportId) {
    const idx = this.data.reports.findIndex(r => r.id === reportId);
    if (idx !== -1) {
      this.data.reports.splice(idx, 1);
      this.save();
      return true;
    }
    return false;
  }

  checkExpirations() {
    const now = Date.now();
    let updated = false;
    for (const report of this.data.reports) {
      if (report.status === 'active' && report.expiresAt && now > report.expiresAt) {
        report.status = 'expired';
        updated = true;
      }
    }
    if (updated) {
      this.save();
    }
  }

  getDefaultTitle(type) {
    switch (type) {
      case 'helmet': return 'ด่านตรวจหมวกกันน็อก & ใบขับขี่';
      case 'alcohol': return 'ด่านตรวจวัดแอลกอฮอล์ (เป่าแอล)';
      case 'security': return 'ด่านความมั่นคง / ตรวจค้นสิ่งผิดกฎหมาย';
      case 'emission': return 'ด่านตรวจควันดำ / มลพิษ';
      case 'speed': return 'จุดตรวจจับความเร็ว';
      case 'traffic': return 'สภาพการจราจรติดขัดหนาแน่น';
      case 'accident': return 'เกิดอุบัติเหตุ / กีดขวางช่องทาง';
      default: return 'รายงานจุดตรวจ/สภาพจราจร';
    }
  }

  getMSUZones() {
    return MSU_ZONES;
  }

  getStatistics() {
    this.checkExpirations();
    const active = this.data.reports.filter(r => r.status === 'active');
    const cleared = this.data.reports.filter(r => r.status === 'cleared');
    const today = this.data.reports.filter(r => {
      const d = new Date(r.createdAt);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    });

    const byType = {};
    active.forEach(r => {
      byType[r.type] = (byType[r.type] || 0) + 1;
    });

    return {
      activeCheckpoints: active.length,
      todayReports: today.length,
      clearedToday: cleared.length,
      byType,
      lastUpdated: Date.now()
    };
  }
}

module.exports = new Database();
