const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../database/db');

const DEV_EMAIL = 'java5263@gmail.com';

// Helper to decode Google JWT token (Base64)
function decodeJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      Buffer.from(base64, 'base64')
        .toString('binary')
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

// Generate Gravatar / Avatar URL from Email
function getAvatarForEmail(email, name) {
  if (email.toLowerCase().trim() === DEV_EMAIL) {
    return 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80';
  }
  const cleanEmail = email.toLowerCase().trim();
  const hash = crypto.createHash('md5').update(cleanEmail).digest('hex');
  return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=120`;
}

// 1. POST /api/auth/google - ตรวจสอบการ Login ด้วย Google ID Token จาก Google Identity Services
router.post('/google', (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ success: false, error: 'ไม่พบ Credential token จาก Google' });
    }

    const payload = decodeJwt(credential);
    if (!payload || !payload.email) {
      return res.status(400).json({ success: false, error: 'ไม่สามารถอ่านข้อมูลจาก Google Token ได้' });
    }

    const email = payload.email.toLowerCase().trim();
    const isDev = (email === DEV_EMAIL);
    const isMsu = email.endsWith('@msu.ac.th');

    const userId = isDev ? 'dev_java5263' : `google_${payload.sub || Date.now()}`;
    const initialUser = {
      id: userId,
      name: isDev ? 'Java (Dev)' : (payload.name || email.split('@')[0]),
      email: email,
      picture: payload.picture || getAvatarForEmail(email, payload.name),
      role: isDev ? 'dev' : (isMsu ? 'student' : 'member'),
      isDev: isDev,
      isMsuStudent: isMsu,
      badge: isDev ? '👑 Dev' : (isMsu ? '🎓 MSU' : '👤 Member'),
      verified: true,
      token: credential
    };

    const stats = db.getUserStats(userId, initialUser);
    const user = {
      ...initialUser,
      stats,
      rank: stats.rank
    };

    res.json({
      success: true,
      message: isDev ? '👑 ยินดีต้อนรับ Developer เข้าสู่ระบบ!' : `เข้าสู่ระบบสำเร็จในชื่อ ${user.name}`,
      user: user
    });
  } catch (err) {
    console.error('Google Auth Error:', err);
    res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการเชื่อมต่อ Google' });
  }
});

const handleEmailLogin = (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'กรุณากรอกอีเมลที่ถูกต้อง เช่น yourname@gmail.com หรือ @msu.ac.th' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const isDev = (cleanEmail === DEV_EMAIL);
    const isMsu = cleanEmail.endsWith('@msu.ac.th');
    const displayName = name ? name.trim() : (isDev ? 'Java (Lead Dev)' : cleanEmail.split('@')[0]);

    const sessionToken = `msu-auth-${isDev ? 'dev' : 'user'}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    const userId = isDev ? 'dev_java5263' : `user_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;

    const initialUser = {
      id: userId,
      name: displayName,
      email: cleanEmail,
      picture: getAvatarForEmail(cleanEmail, displayName),
      role: isDev ? 'dev' : (isMsu ? 'student' : 'member'),
      isDev: isDev,
      isMsuStudent: isMsu,
      badge: isDev ? '👑 Dev' : (isMsu ? '🎓 MSU' : '👤 Member'),
      verified: true,
      token: sessionToken
    };

    const stats = db.getUserStats(userId, initialUser);
    const user = {
      ...initialUser,
      stats,
      rank: stats.rank
    };

    res.json({
      success: true,
      token: sessionToken,
      message: isDev ? '👑 เข้าสู่ระบบในฐานะ Developer สำเร็จแล้ว (สิทธิ์เต็ม)' : `ยินดีต้อนรับ ${displayName}`,
      user: user
    });
  } catch (err) {
    console.error('Email Login Error:', err);
    res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' });
  }
};

router.post('/email-login', handleEmailLogin);
router.post('/email', handleEmailLogin);

// 3. POST /api/auth/demo - เข้าสู่ระบบด่วน
router.post('/demo', (req, res) => {
  try {
    const { email, name } = req.body;
    const userEmail = (email || '').toLowerCase().trim();
    const isDev = (userEmail === DEV_EMAIL);

    const randomId = Math.random().toString(36).substring(2, 7);
    const cleanEmail = isDev ? DEV_EMAIL : (userEmail || `student_${randomId}@msu.ac.th`);
    const displayName = isDev ? 'Java (Lead Dev)' : (name || `นิสิต มมส (${randomId})`);
    const userId = isDev ? 'dev_java5263' : `demo_${randomId}`;

    const initialUser = {
      id: userId,
      name: displayName,
      email: cleanEmail,
      picture: getAvatarForEmail(cleanEmail, displayName),
      role: isDev ? 'dev' : 'student',
      isDev: isDev,
      isMsuStudent: true,
      badge: isDev ? '👑 Developer / ผู้พัฒนาระบบ' : '🎓 นิสิต มมส (ทดสอบ)',
      verified: true,
      token: `token-${isDev ? 'dev' : 'demo'}-${Date.now()}-${randomId}`
    };

    const stats = db.getUserStats(userId, initialUser);
    const user = {
      ...initialUser,
      stats,
      rank: stats.rank
    };

    res.json({
      success: true,
      message: isDev ? '⚡ เข้าสู่ระบบในฐานะ Developer สำเร็จแล้ว (สิทธิ์เต็ม)' : 'เข้าสู่ระบบสำเร็จ',
      user: user
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. GET /api/auth/me - เช็คข้อมูล session ปัจจุบัน พร้อม Rank ล่าสุด
router.get('/me', (req, res) => {
  const userHeader = req.headers['x-user-data'];
  if (userHeader) {
    try {
      const user = JSON.parse(decodeURIComponent(userHeader));
      if (user && user.id) {
        const stats = db.getUserStats(user.id, user);
        return res.json({ 
          success: true, 
          user: {
            ...user,
            stats,
            rank: stats.rank
          } 
        });
      }
    } catch (e) {}
  }
  res.json({ success: true, user: null });
});

module.exports = router;
