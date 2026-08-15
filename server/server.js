const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');

const { rateLimiter } = require('./middleware/rateLimiter');
const db = require('./database/db');

const app = express();
const server = http.createServer(app);

// Socket.io for Real-time alerts
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Global Error Handlers to prevent crash
process.on('uncaughtException', (err) => {
  console.error('⚠️ [UNCAUGHT EXCEPTION]:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ [UNHANDLED REJECTION]:', reason);
});

// Enterprise Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 🛡️ Apply Enterprise WAF & Multi-Tier Rate Limiter Middleware to all /api routes
app.use('/api', rateLimiter);

// API Routes
const reportsRouter = require('./routes/reports')(io);
const zonesRouter = require('./routes/zones');
const authRouter = require('./routes/auth');
const securityRouter = require('./routes/security');
const rankRouter = require('./routes/rank');

app.use('/api/reports', reportsRouter);
app.use('/api/zones', zonesRouter);
app.use('/api/auth', authRouter);
app.use('/api/security', securityRouter);
app.use('/api/rank', rankRouter);

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../public')));

// Fallback for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Socket.io Realtime Events
io.on('connection', (socket) => {
  console.log(`⚡ [SOCKET] User connected: ${socket.id}`);

  // Send current stats immediately upon connecting
  socket.emit('stats_update', db.getStatistics());

  socket.on('disconnect', () => {
    // disconnected
  });
});

// Start Server
server.listen(PORT, () => {
  console.log(`
=====================================================
🚀 MSU Traffic Server is running on port ${PORT}
🌐 Access URL: http://localhost:${PORT}
🛡️ Enterprise WAF & Rate Limiter: ACTIVE (Multi-Tier Protection)
🔐 Auth Mode: Google Sign-In & Verified Tokens
📍 MSU Campus Map & Real-time Checkpoint Alert
=====================================================
  `);
});
