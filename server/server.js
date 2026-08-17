const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');

const { rateLimiter, getClientIp, checkIpStatus } = require('./middleware/rateLimiter');
const { globalCapacityGovernor } = require('./middleware/globalCapacityGovernor');
const db = require('./database/db');
const googleSheetsService = require('./services/googleSheetsService');

const app = express();
const server = http.createServer(app);

// 🛡️ 1. HTTP TIMEOUT CONFIGURATION
server.keepAliveTimeout = 60000;   // 60s keep-alive
server.headersTimeout = 65000;     // 65s headers timeout (must be > keepAliveTimeout)

// 🛡️ 2. SOCKET.IO REAL-TIME ANTI-DDOS ARMOR
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 10000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6 // 1 MB max packet size
});

// Socket connection tracker per IP (Prevent socket starvation while allowing campus NAT)
const activeSocketIps = new Map();
const MAX_CONCURRENT_SOCKETS_PER_IP = 100;

io.use((socket, next) => {
  const req = socket.request;
  const ip = getClientIp(req);

  // Check if IP is currently banned by WAF
  const ipStatus = checkIpStatus(ip);
  if (ipStatus.banned) {
    return next(new Error(`WAF_BLOCKED: Connection rejected (Banned for ${ipStatus.remainingSeconds}s)`));
  }

  // Check Concurrent Socket Limit
  const currentCount = activeSocketIps.get(ip) || 0;
  if (currentCount >= MAX_CONCURRENT_SOCKETS_PER_IP) {
    return next(new Error(`SOCKET_FLOOD_LIMIT: Max concurrent connections (${MAX_CONCURRENT_SOCKETS_PER_IP}) reached for this IP`));
  }

  activeSocketIps.set(ip, currentCount + 1);
  socket.clientIp = ip;
  next();
});

db.setSocketIO(io);

const PORT = process.env.PORT || 3000;

// Keep event loop alive even in headless/background terminal
process.stdin.resume();

// Global Error Handlers to prevent crash
process.on('uncaughtException', (err) => {
  console.error('⚠️ [UNCAUGHT EXCEPTION]:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ [UNHANDLED REJECTION]:', reason);
});

// 🛡️ 3. ENTERPRISE SECURITY HEADERS
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
  next();
});

// 🛡️ 3.1 Apply Global Traffic Capacity Governor (Max 100 people/sec & Waiting Room)
app.use(globalCapacityGovernor);

// Middlewares
app.use(cors());
// 🛡️ 4. TIGHTENED BODY LIMITS (Prevents JSON Parsing Memory Exhaustion DoS)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 🛡️ 4.1 Catch Malformed JSON Syntax Errors safely
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && (err.status === 400 || err.statusCode === 400) && 'body' in err) {
    return res.status(400).json({ success: false, error: 'INVALID_JSON_BODY', message: 'รูปแบบ JSON ไม่ถูกต้อง' });
  }
  next(err);
});

// 🛡️ 5. Apply Enterprise WAF & Multi-Tier Rate Limiter Middleware to all /api routes
app.use('/api', rateLimiter);

// API Routes
const reportsRouter = require('./routes/reports')(io);
const zonesRouter = require('./routes/zones');
const authRouter = require('./routes/auth');
const securityRouter = require('./routes/security');
const rankRouter = require('./routes/rank');
const chatRouter = require('./routes/chat')(io);
const sheetsRouter = require('./routes/sheets');

app.use('/api/reports', reportsRouter);
app.use('/api/zones', zonesRouter);
app.use('/api/auth', authRouter);
app.use('/api/security', securityRouter);
app.use('/api/rank', rankRouter);
app.use('/api/chat', chatRouter);
app.use('/api/sheets', sheetsRouter);

// Serve static frontend files (Prevent aggressive browser caching)
app.use(express.static(path.join(__dirname, '../public'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// Fallback for SPA
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Socket.io Realtime Events
io.on('connection', (socket) => {
  const ip = socket.clientIp || '127.0.0.1';

  // Send current stats immediately upon connecting
  socket.emit('stats_update', db.getStatistics());

  socket.on('disconnect', () => {
    // Decrement active connection counter for IP
    const current = activeSocketIps.get(ip) || 1;
    if (current <= 1) {
      activeSocketIps.delete(ip);
    } else {
      activeSocketIps.set(ip, current - 1);
    }
  });
});

// 🛡️ Global Express Error Handler
app.use((err, req, res, next) => {
  console.error('⚠️ [EXPRESS HANDLED ERROR]:', err.message);
  if (!res.headersSent) {
    res.status(err.status || 500).json({
      success: false,
      error: err.code || 'SERVER_ERROR',
      message: err.message || 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์'
    });
  }
});

// Start Server
server.on('error', (err) => {
  console.error('⚠️ [SERVER ERROR]:', err);
});

server.listen(PORT, () => {
  console.log(`
=====================================================
🚀 MSU Traffic Server is running on port ${PORT}
🌐 Access URL: http://localhost:${PORT}
🛡️ Enterprise WAF & Anti-DDoS: ACTIVE (Level: MAX_BEST_IN_CLASS)
⏱️ Slowloris Defense & Socket Armor: ENGAGED
📊 Google Sheets Real-time & Auto-Sync: ACTIVE
🔐 Auth Mode: Google Sign-In & Verified Tokens
📍 MSU Campus Map & Real-time Checkpoint Alert
=====================================================
  `);
});
