/**
 * Authentication Middleware
 * บังคับ Login เฉพาะการเขียนข้อมูล (POST/VOTE)
 * แต่การอ่าน (GET) เปิดให้ทุกคนเข้าดูได้อิสระ
 */

function parseUserFromReq(req) {
  const authHeader = req.headers['authorization'];
  const userHeader = req.headers['x-user-data'];
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
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        user = {
          id: payload.sub || payload.id || `user-${Date.now()}`,
          name: payload.name || 'ผู้ใช้ Google',
          email: payload.email || 'user@msu.ac.th',
          picture: payload.picture || null
        };
      }
    } catch (e) {}
  }

  return user;
}

function requireAuth(req, res, next) {
  const user = parseUserFromReq(req);

  if (!user || !user.id) {
    return res.status(401).json({
      success: false,
      error: 'AUTH_REQUIRED',
      message: 'กรุณาเข้าสู่ระบบด้วย Google หรือ @msu.ac.th ก่อนทำรายการ'
    });
  }

  req.user = user;
  next();
}

function optionalAuth(req, res, next) {
  const user = parseUserFromReq(req);
  if (user && user.id) {
    req.user = user;
  }
  next();
}

module.exports = {
  requireAuth,
  optionalAuth
};
