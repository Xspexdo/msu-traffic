const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../database/db');
const { requirePoW } = require('../middleware/powSecurity');
const { optionalAuth } = require('../middleware/authMiddleware');
const { signToken } = require('../services/jwtService');

const DEV_EMAIL = (process.env.DEV_EMAIL || 'java5263@gmail.com').toLowerCase().trim();

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
    return 'https://ui-avatars.com/api/?name=MSU&background=2563EB&color=fff';
  }
  const cleanEmail = email.toLowerCase().trim();
  const hash = crypto.createHash('md5').update(cleanEmail).digest('hex');
  return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=120`;
}

// Helper to get 100% High-Resolution Google Profile Picture
function getHighResGooglePicture(url) {
  if (!url) return url;
  if (url.includes('googleusercontent.com')) {
    if (/=s\d+(-c)?$/.test(url)) {
      return url.replace(/=s\d+(-c)?$/, '=s256-c');
    }
    return url.includes('?') ? `${url}&sz=256` : `${url}=s256-c`;
  }
  return url;
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
    const rawPicture = payload.picture || getAvatarForEmail(email, payload.name);
    const highResPicture = getHighResGooglePicture(rawPicture);

    const displayName = isDev ? 'Java (Dev)' : (payload.name || email.split('@')[0]);

    // สร้าง Server-Signed Secure Token
    const secureToken = signToken({
      id: userId,
      name: displayName,
      email: email,
      role: isDev ? 'dev' : (isMsu ? 'student' : 'member'),
      isDev: isDev,
      picture: highResPicture
    });

    const initialUser = {
      id: userId,
      name: displayName,
      email: email,
      picture: highResPicture,
      role: isDev ? 'dev' : (isMsu ? 'student' : 'member'),
      isDev: isDev,
      isMsuStudent: isMsu,
      badge: isDev ? '👑 Dev' : (isMsu ? '🎓 MSU' : '👤 Member'),
      verified: true,
      token: secureToken
    };

    const stats = db.getUserStats(userId, initialUser);
    const user = {
      ...initialUser,
      stats,
      rank: stats.rank
    };

    res.json({
      success: true,
      token: secureToken,
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

    const userId = isDev ? 'dev_java5263' : `user_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;

    const existingUser = db.getUserByEmail(cleanEmail);
    const rawPicture = existingUser?.picture || getAvatarForEmail(cleanEmail, displayName);
    const picture = getHighResGooglePicture(rawPicture);

    // สร้าง Server-Signed Secure Token
    const secureToken = signToken({
      id: userId,
      name: displayName,
      email: cleanEmail,
      role: isDev ? 'dev' : (isMsu ? 'student' : 'member'),
      isDev: isDev,
      picture: picture
    });

    const initialUser = {
      id: userId,
      name: displayName,
      email: cleanEmail,
      picture: picture,
      role: isDev ? 'dev' : (isMsu ? 'student' : 'member'),
      isDev: isDev,
      isMsuStudent: isMsu,
      badge: isDev ? '👑 Dev' : (isMsu ? '🎓 MSU' : '👤 Member'),
      verified: true,
      token: secureToken
    };

    const stats = db.getUserStats(userId, initialUser);
    const user = {
      ...initialUser,
      stats,
      rank: stats.rank
    };

    res.json({
      success: true,
      token: secureToken,
      message: isDev ? '👑 เข้าสู่ระบบในฐานะ Developer สำเร็จแล้ว (สิทธิ์เต็ม)' : `ยินดีต้อนรับ ${displayName}`,
      user: user
    });
  } catch (err) {
    console.error('Email Login Error:', err);
    res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' });
  }
};

router.post('/email-login', requirePoW, handleEmailLogin);
router.post('/email', requirePoW, handleEmailLogin);

// 3. POST /api/auth/demo - เข้าสู่ระบบด่วน
router.post('/demo', requirePoW, (req, res) => {
  try {
    const { email, name } = req.body;
    const userEmail = (email || '').toLowerCase().trim();
    const isDev = (userEmail === DEV_EMAIL);

    const randomId = Math.random().toString(36).substring(2, 7);
    const cleanEmail = isDev ? DEV_EMAIL : (userEmail || `student_${randomId}@msu.ac.th`);
    const displayName = isDev ? 'Java (Lead Dev)' : (name || `นิสิต มมส (${randomId})`);
    const userId = isDev ? 'dev_java5263' : `demo_${randomId}`;
    const picture = getAvatarForEmail(cleanEmail, displayName);

    const secureToken = signToken({
      id: userId,
      name: displayName,
      email: cleanEmail,
      role: isDev ? 'dev' : 'student',
      isDev: isDev,
      picture: picture
    });

    const initialUser = {
      id: userId,
      name: displayName,
      email: cleanEmail,
      picture: picture,
      role: isDev ? 'dev' : 'student',
      isDev: isDev,
      isMsuStudent: true,
      badge: isDev ? '👑 Developer / ผู้พัฒนาระบบ' : '🎓 นิสิต มมส (ทดสอบ)',
      verified: true,
      token: secureToken
    };

    const stats = db.getUserStats(userId, initialUser);
    const user = {
      ...initialUser,
      stats,
      rank: stats.rank
    };

    res.json({
      success: true,
      token: secureToken,
      message: isDev ? '⚡ เข้าสู่ระบบในฐานะ Developer สำเร็จแล้ว (สิทธิ์เต็ม)' : 'เข้าสู่ระบบสำเร็จ',
      user: user
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. GET /api/auth/me - เช็คข้อมูล session ปัจจุบัน พร้อม Rank ล่าสุด ผ่าน Verified Token
router.get('/me', optionalAuth, (req, res) => {
  if (req.user && req.user.id) {
    const stats = db.getUserStats(req.user.id, req.user);
    return res.json({ 
      success: true, 
      user: {
        ...req.user,
        stats,
        rank: stats.rank
      } 
    });
  }
  res.json({ success: true, user: null });
});

module.exports = router;

