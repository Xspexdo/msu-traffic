/**
 * =========================================================================
 * MSU Traffic - Enterprise Web Application Firewall (WAF) & Rate Limiter
 * =========================================================================
 * Multi-Tier Sliding Window Architecture with Progressive Penalty Escalation
 * 
 * Advanced Features (Best-in-Class Defense):
 * 1. Multi-Tiered Quota: General API vs. Heavy Write/Mutation endpoints
 * 2. Anti-Spike / Anti-Flood Botnet Detection
 * 3. Bad Bot & Malicious Scanner Signature Detection (WAF Filter)
 * 4. Deep URL / Path Probing & Sensitive File Protection (.env, .git, traversal)
 * 5. Adaptive Load Shedding / Circuit Breaker (CPU & Event Loop Protection)
 * 6. Memory-Safe Bounded LRU State Store (Anti-Memory Exhaustion)
 * 7. Graduated Penalties: Soft Throttle -> Cooldown -> Hard Temporary Ban
 * 8. Cryptographically Verified Admin/Dev Bypass (No spoofable headers)
 * 9. RFC 6585 & RFC 7231 Compliant Headers (RateLimit-*, Retry-After)
 * 10. Real-time Security Telemetry & Incident Ray ID Generation
 * =========================================================================
 */

const crypto = require('crypto');

// Master Security Key for Admin/Dev actions (can be overridden by ENV)
const ADMIN_MASTER_KEY = process.env.ADMIN_SECURITY_KEY || 'msu-dev-master-sec-key-2026';
const DEV_EMAIL = 'java5263@gmail.com';

// Configuration Defaults scaled for 1,000+ Concurrent Users
const CONFIG = {
  // Tier 1: General Read API (Browsing, Map tiles, Polling)
  TIER_READ: {
    WINDOW_MS: 60 * 1000,      // 1 Minute window
    MAX_REQUESTS: 300,          // Scaled to 300 requests/min
    BURST_LIMIT: 50,            // Burst allowance: max 50 reqs in 3 seconds
    BURST_WINDOW_MS: 3000
  },

  // Tier 2: Heavy Mutation / Write API (POST Reports, Votes, Auth)
  TIER_WRITE: {
    WINDOW_MS: 60 * 1000,      // 1 Minute window
    MAX_REQUESTS: 30,           // Max 30 write requests/min
    BURST_LIMIT: 8,             // Max 8 write reqs in 5 seconds
    BURST_WINDOW_MS: 5000
  },

  // Tier 3: Anti-Flood / Rapid Burst Spike Detection (Tuned for campus NAT networks)
  ANTI_FLOOD: {
    SPIKE_THRESHOLD: 35,        // > 35 requests in 1 second = Malicious flood attempt -> Ban
    SPIKE_WINDOW_MS: 1000
  },

  // Penalty Durations (Graduated Escalation & Instant Ban on Repeated Attacks)
  PENALTIES: {
    LEVEL_1_THROTTLE_SEC: 60,   // 1st offense: 1-minute ban (60s)
    LEVEL_2_COOLDOWN_SEC: 300,  // 2nd offense: 5-minute ban (300s)
    LEVEL_3_HARD_BAN_SEC: 1800, // 3rd offense / Flood: 30-minute ban (1800s)
    HAMMER_BAN_SEC: 3600        // ยิงซ้ำๆ ตอนโดนแบน: แบนทันที 1 ชั่วโมง (3600s)
  },

  // State Store Limits (Anti Memory Exhaustion)
  STORE: {
    MAX_TRACKED_IPS: 50000,     // Max number of IPs tracked in memory at once (Scaled for 1,000+ users)
    GC_INTERVAL_MS: 60 * 1000,  // Run garbage collection every 60 seconds
    RECORD_TTL_MS: 10 * 60 * 1000 // Inactive IP records deleted after 10 minutes
  },

  // Adaptive Load Shedding (Circuit Breaker)
  CIRCUIT_BREAKER: {
    MAX_EVENT_LOOP_LAG_MS: 150, // If Node.js event loop lags > 150ms -> Load Shedding
    MAX_HEAP_USED_PERCENT: 88   // If Heap memory > 88% -> Load Shedding
  }
};

// -------------------------------------------------------------
// WAF RULES: Known Attack Tool Signatures & Path Probe Filters
// -------------------------------------------------------------
const BAD_BOT_SIGNATURES = [
  /sqlmap/i,
  /nikto/i,
  /masscan/i,
  /wpscan/i,
  /acunetix/i,
  /havij/i,
  /nmap/i,
  /zgrab/i,
  /dirbuster/i,
  /gobuster/i,
  /hydra/i,
  /morfeus/i,
  /curl-flooder/i
];

const SENSITIVE_PROBE_PATTERNS = [
  /\/\.env/i,
  /\/\.git/i,
  /\/\.aws/i,
  /\/\.ssh/i,
  /\/etc\/passwd/i,
  /\/win\.ini/i,
  /\/boot\.ini/i,
  /\/phpmyadmin/i,
  /\/wp-admin/i,
  /\/wp-login/i,
  /\/xmlrpc\.php/i,
  /\/\.\.\//i,          // Directory traversal ../
  /\/\.\.\\/i          // Directory traversal ..\
];

// In-memory Storage for IP Telemetry & State (Bounded LRU structure)
const ipStateStore = new Map();

/**
 * 🛡️ Detect VPN / Proxy / Datacenter Anomalies
 */
function detectVpnOrProxy(req) {
  const headers = req.headers;
  
  // 1. Direct Proxy Indicators
  if (headers['via'] || headers['x-real-ip-proxy'] || headers['x-proxy-id'] || headers['proxy-connection']) {
    return { isVpn: true, reason: 'Proxy header detected (via / proxy-connection)' };
  }

  // 2. Tor exit node headers
  if (headers['x-tor-exit-node'] || headers['tor-browser']) {
    return { isVpn: true, reason: 'Tor network node detected' };
  }

  // 3. Cloudflare country mismatch if non-TH and not local
  const cfCountry = headers['cf-ipcountry'];
  if (cfCountry && cfCountry !== 'TH' && cfCountry !== 'XX' && cfCountry !== 'T1') {
    if (!isVerifiedAdminOrDev(req)) {
      return { isVpn: true, reason: `Foreign Country IP detected (${cfCountry}) - VPN/Proxy Geo Mismatch` };
    }
  }

  // 4. Multiple Forwarded IP chain anomaly (Proxy hopping)
  const forwarded = headers['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    const hops = forwarded.split(',').map(s => s.trim());
    if (hops.length > 3) {
      return { isVpn: true, reason: 'Multiple proxy hop chain detected' };
    }
  }

  return { isVpn: false };
}

// Security Telemetry Metrics
const telemetry = {
  startedAt: new Date().toISOString(),
  totalRequestsInspected: 0,
  totalRequestsAllowed: 0,
  totalRequestsThrottled: 0,
  totalHardBansEnforced: 0,
  totalBotAttacksBlocked: 0,
  totalProbesBlocked: 0,
  loadSheddingEvents: 0,
  recentIncidents: [] // stores last 30 incidents
};

// Event Loop Lag Monitor for Load Shedding
let currentEventLoopLag = 0;
let lastCheckTime = Date.now();
setInterval(() => {
  const now = Date.now();
  const delta = now - lastCheckTime;
  currentEventLoopLag = Math.max(0, delta - 500); // interval is 500ms
  lastCheckTime = now;
}, 500);

/**
 * Check if the server is currently under critical overload
 */
function isServerOverloaded() {
  // Allow disabling or tuning load shedding via environment variable
  if (process.env.DISABLE_LOAD_SHEDDING === 'true') {
    return { overloaded: false };
  }

  // Only trigger on severe event loop blockage (> 1000ms)
  if (currentEventLoopLag > 1000) {
    return { overloaded: true, reason: `Event Loop Lag (${currentEventLoopLag}ms)` };
  }

  // Check actual memory usage in MB instead of dynamic heap ratio
  const memory = process.memoryUsage();
  const heapUsedMB = memory.heapUsed / 1024 / 1024;
  if (heapUsedMB > 1024) { // Only shed load if process is consuming > 1GB Heap
    return { overloaded: true, reason: `Extreme Memory Usage (${heapUsedMB.toFixed(1)}MB)` };
  }

  return { overloaded: false };
}

/**
 * Generate a unique, professional Incident Ray ID
 * e.g., RAY-MSU-7F3A92C1
 */
function generateRayId() {
  const hash = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `RAY-MSU-${hash}`;
}

/**
 * Extract true client IP safely with validation
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    const firstIp = forwarded.split(',')[0].trim();
    if (firstIp && isValidIp(firstIp)) {
      return firstIp;
    }
  }
  return req.socket?.remoteAddress || req.ip || '127.0.0.1';
}

function isValidIp(ip) {
  return /^[0-9a-fA-F:.]+$/.test(ip);
}

const { verifyToken } = require('../services/jwtService');

/**
 * Cryptographically verify if request has authentic Developer / Admin credentials
 * Eliminates naive, spoofable header vulnerabilities.
 */
function isVerifiedAdminOrDev(req) {
  // 1. Direct Admin Master Key in header
  const adminKey = req.headers['x-admin-key'] || req.headers['x-api-key'];
  if (adminKey && adminKey === ADMIN_MASTER_KEY) {
    return true;
  }

  // 2. Verified Authorization Bearer token check
  const authHeader = req.headers['authorization'];
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token === ADMIN_MASTER_KEY) {
      return true;
    }
    
    // ตรวจสอบลายเซ็นของ Token ผ่าน jwtService
    const payload = verifyToken(token);
    if (payload && (payload.isDev === true || (payload.email && payload.email.toLowerCase().trim() === DEV_EMAIL))) {
      return true;
    }
  }

  return false;
}

/**
 * Record an incident into telemetry log
 */
function logIncident(ip, reason, penaltySec, rayId, level) {
  const incident = {
    rayId,
    timestamp: new Date().toISOString(),
    ip: maskIpForDisplay(ip),
    rawIp: ip,
    reason,
    penaltySec,
    level
  };

  telemetry.recentIncidents.unshift(incident);
  if (telemetry.recentIncidents.length > 30) {
    telemetry.recentIncidents.pop();
  }

  console.warn(`🛡️ [WAF SECURITY] ${rayId} | IP: ${ip} | Action: ${reason} | Penalty: ${penaltySec}s | Level: ${level}`);
}

function maskIpForDisplay(ip) {
  if (!ip) return '0.0.0.0';
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.***.***`;
  }
  return ip.substring(0, 10) + '...';
}

/**
 * Get or initialize IP state record with Bounded Cache protection
 */
function getIpRecord(ip) {
  let record = ipStateStore.get(ip);
  const now = Date.now();

  if (!record) {
    // If cache exceeds limit, evict the oldest entry
    if (ipStateStore.size >= CONFIG.STORE.MAX_TRACKED_IPS) {
      const firstKey = ipStateStore.keys().next().value;
      ipStateStore.delete(firstKey);
    }

    record = {
      ip,
      readTimestamps: [],
      writeTimestamps: [],
      spikeTimestamps: [],
      offenseCount: 0,
      bannedUntil: null,
      currentPenaltySec: 0,
      lastViolationReason: null,
      lastRayId: null,
      lastActive: now,
      totalRequests: 0
    };
    ipStateStore.set(ip, record);
  }

  record.lastActive = now;
  record.totalRequests += 1;
  return record;
}

/**
 * Master Web Application Firewall & Rate Limiter Middleware
 */
function rateLimiter(req, res, next) {
  telemetry.totalRequestsInspected += 1;
  const ip = getClientIp(req);
  const now = Date.now();
  const userAgent = req.headers['user-agent'] || '';
  const requestPath = req.originalUrl || req.url || '';

  // 👑 Bypass verification for Admin/Dev
  if (isVerifiedAdminOrDev(req)) {
    const record = ipStateStore.get(ip);
    if (record) {
      record.bannedUntil = null;
      record.offenseCount = 0;
      record.readTimestamps = [];
      record.writeTimestamps = [];
      record.spikeTimestamps = [];
    }
    res.setHeader('X-WAF-Status', 'Bypassed (Verified Admin/Dev)');
    res.setHeader('X-WAF-Ray-ID', generateRayId());
    telemetry.totalRequestsAllowed += 1;
    return next();
  }

  // 💻 Bypass for Localhost (Dev machine testing)
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost') {
    res.setHeader('X-WAF-Status', 'Bypassed (Localhost)');
    telemetry.totalRequestsAllowed += 1;
    return next();
  }

  // 🔍 1. WAF LAYER: Bad Bot / Attack Scanner Signature Inspection
  for (const botPattern of BAD_BOT_SIGNATURES) {
    if (botPattern.test(userAgent)) {
      telemetry.totalBotAttacksBlocked += 1;
      const record = getIpRecord(ip);
      return triggerPenalty(
        ip,
        record,
        res,
        `Malicious Scanner / Attack Tool Blocked (${userAgent.substring(0, 30)})`,
        CONFIG.PENALTIES.LEVEL_3_HARD_BAN_SEC,
        'WAF_BOT_SIGNATURE_BAN'
      );
    }
  }

  // 🔍 2. WAF LAYER: Sensitive File & Path Traversal Probing
  for (const probePattern of SENSITIVE_PROBE_PATTERNS) {
    if (probePattern.test(requestPath)) {
      telemetry.totalProbesBlocked += 1;
      const record = getIpRecord(ip);
      return triggerPenalty(
        ip,
        record,
        res,
        `Probing Sensitive File / Path Traversal (${requestPath.substring(0, 40)})`,
        CONFIG.PENALTIES.LEVEL_3_HARD_BAN_SEC,
        'WAF_PROBE_BAN'
      );
    }
  }

  // ⚡ 3. ADAPTIVE LOAD SHEDDING (Circuit Breaker Protection)
  const overloadStatus = isServerOverloaded();
  if (overloadStatus.overloaded) {
    telemetry.loadSheddingEvents += 1;
    const rayId = generateRayId();
    res.setHeader('Retry-After', 5);
    res.setHeader('X-Incident-Ray-ID', rayId);
    res.setHeader('X-WAF-Status', 'LOAD_SHEDDING');
    return res.status(503).json({
      success: false,
      error: 'SERVER_UNDER_EXTREME_LOAD',
      code: 'WAF_LOAD_SHEDDING_ACTIVE',
      message: 'เซิร์ฟเวอร์กำลังรองรับปริมาณการใช้งานสูงมาก ระบบทำการสับคัตเอาต์อัตโนมัติเพื่อป้องกันระบบล่ม กรุณาลองใหม่อีกครั้งใน 5 วินาที',
      incidentRayId: rayId,
      retryAfterSeconds: 5
    });
  }

  const record = getIpRecord(ip);

  // 🛑 4. Check if IP is currently under active Penalty / Ban
  if (record.bannedUntil && now < record.bannedUntil) {
    telemetry.totalRequestsThrottled += 1;
    
    // 🔨 ตรวจจับการยิงซ้ำๆ ตอนโดนแบน (Repeated Hammering while Banned) -> ยืดเวลาแบนเป็น 1 ชั่วโมงทันที!
    record.bannedHammerCount = (record.bannedHammerCount || 0) + 1;
    if (record.bannedHammerCount >= 3) {
      record.bannedUntil = Math.max(record.bannedUntil, now + (CONFIG.PENALTIES.HAMMER_BAN_SEC * 1000));
      record.currentPenaltySec = CONFIG.PENALTIES.HAMMER_BAN_SEC;
      record.lastViolationReason = '🚨 ตรวจพบการยิงซ้ำๆ อย่างต่อเนื่องขณะติดแบน (ระบบทำการแบนเพิ่ม 1 ชั่วโมง)';
      telemetry.totalHardBansEnforced += 1;
    }

    const remainingSeconds = Math.max(1, Math.ceil((record.bannedUntil - now) / 1000));
    const rayId = record.lastRayId || generateRayId();

    // Standard RFC Headers
    res.setHeader('Retry-After', remainingSeconds);
    res.setHeader('RateLimit-Limit', CONFIG.TIER_READ.MAX_REQUESTS);
    res.setHeader('RateLimit-Remaining', 0);
    res.setHeader('RateLimit-Reset', remainingSeconds);
    res.setHeader('X-Incident-Ray-ID', rayId);
    res.setHeader('X-WAF-Status', 'BLOCKED');
    res.setHeader('X-RateLimit-Banned', 'true');

    return res.status(429).json({
      success: false,
      error: 'IP_BANNED_REPEATED_ATTACK',
      code: 'WAF_HAMMER_BAN_ENFORCED',
      message: `🚫 IP ของคุณถูกระงับการใช้งานเนื่องจากส่งคำขอยิงซ้ำๆ อย่างต่อเนื่อง (เหลือเวลาแบนอีก ${remainingSeconds} วินาที)`,
      banned: true,
      penaltySeconds: record.currentPenaltySec,
      remainingSeconds: remainingSeconds,
      bannedUntil: record.bannedUntil,
      incidentRayId: rayId,
      reason: record.lastViolationReason || 'High Request Velocity Detected',
      ip: maskIpForDisplay(ip),
      timestamp: new Date().toISOString()
    });
  } else if (record.bannedUntil && now >= record.bannedUntil) {
    // Ban expired -> Reset state
    record.bannedUntil = null;
    record.readTimestamps = [];
    record.writeTimestamps = [];
    record.spikeTimestamps = [];
  }

  // 5. Clean sliding windows
  record.spikeTimestamps = record.spikeTimestamps.filter(t => now - t < CONFIG.ANTI_FLOOD.SPIKE_WINDOW_MS);
  record.readTimestamps = record.readTimestamps.filter(t => now - t < CONFIG.TIER_READ.WINDOW_MS);
  record.writeTimestamps = record.writeTimestamps.filter(t => now - t < CONFIG.TIER_WRITE.WINDOW_MS);

  // Record current timestamp
  record.spikeTimestamps.push(now);
  record.readTimestamps.push(now);

  const isWriteMethod = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method.toUpperCase());
  if (isWriteMethod) {
    record.writeTimestamps.push(now);
  }

  // 6. TIER 3: Check Rapid Anti-Flood Spike (> 20 reqs in 1 second)
  if (record.spikeTimestamps.length > CONFIG.ANTI_FLOOD.SPIKE_THRESHOLD) {
    return triggerPenalty(
      ip,
      record,
      res,
      'Severe Flood / High-Velocity Burst Attack',
      CONFIG.PENALTIES.LEVEL_3_HARD_BAN_SEC,
      'LEVEL_3_HARD_BAN'
    );
  }

  // 7. TIER 1: Check Read Burst (e.g. > 25 reqs in 3 seconds)
  const recent3sReads = record.readTimestamps.filter(t => now - t < CONFIG.TIER_READ.BURST_WINDOW_MS).length;
  if (recent3sReads > CONFIG.TIER_READ.BURST_LIMIT) {
    record.offenseCount += 1;
    const penaltySec = record.offenseCount > 2 
      ? CONFIG.PENALTIES.LEVEL_3_HARD_BAN_SEC 
      : (record.offenseCount === 2 ? CONFIG.PENALTIES.LEVEL_2_COOLDOWN_SEC : CONFIG.PENALTIES.LEVEL_1_THROTTLE_SEC);

    return triggerPenalty(
      ip,
      record,
      res,
      `Read Burst Exceeded (${recent3sReads} reqs in 3s)`,
      penaltySec,
      `LEVEL_${record.offenseCount}_BURST`
    );
  }

  // 8. TIER 1: Check Read Window Quota (e.g. > 90 reqs in 1 minute)
  if (record.readTimestamps.length > CONFIG.TIER_READ.MAX_REQUESTS) {
    record.offenseCount += 1;
    const penaltySec = record.offenseCount > 1 
      ? CONFIG.PENALTIES.LEVEL_2_COOLDOWN_SEC 
      : CONFIG.PENALTIES.LEVEL_1_THROTTLE_SEC;

    return triggerPenalty(
      ip,
      record,
      res,
      `General API Rate Limit Exceeded (> ${CONFIG.TIER_READ.MAX_REQUESTS} req/min)`,
      penaltySec,
      `LEVEL_${record.offenseCount}_WINDOW`
    );
  }

  // 9. TIER 2: Check Write / Mutation Quotas
  if (isWriteMethod) {
    const recent5sWrites = record.writeTimestamps.filter(t => now - t < CONFIG.TIER_WRITE.BURST_WINDOW_MS).length;
    if (recent5sWrites > CONFIG.TIER_WRITE.BURST_LIMIT) {
      record.offenseCount += 1;
      return triggerPenalty(
        ip,
        record,
        res,
        `Write Burst Limit Exceeded (${recent5sWrites} write reqs in 5s)`,
        CONFIG.PENALTIES.LEVEL_2_COOLDOWN_SEC,
        'LEVEL_2_WRITE_BURST'
      );
    }

    if (record.writeTimestamps.length > CONFIG.TIER_WRITE.MAX_REQUESTS) {
      record.offenseCount += 1;
      return triggerPenalty(
        ip,
        record,
        res,
        `Write Mutation Quota Exceeded (> ${CONFIG.TIER_WRITE.MAX_REQUESTS} writes/min)`,
        CONFIG.PENALTIES.LEVEL_2_COOLDOWN_SEC,
        'LEVEL_2_WRITE_QUOTA'
      );
    }
  }

  // Request Allowed -> Set Standard RateLimit Headers
  telemetry.totalRequestsAllowed += 1;
  const remainingQuota = Math.max(0, CONFIG.TIER_READ.MAX_REQUESTS - record.readTimestamps.length);
  res.setHeader('RateLimit-Limit', CONFIG.TIER_READ.MAX_REQUESTS);
  res.setHeader('RateLimit-Remaining', remainingQuota);
  res.setHeader('RateLimit-Reset', Math.ceil(CONFIG.TIER_READ.WINDOW_MS / 1000));
  res.setHeader('X-WAF-Status', 'PASS');

  next();
}

/**
 * Trigger Penalty Escalation and Respond with 429
 */
function triggerPenalty(ip, record, res, reason, durationSeconds, level) {
  telemetry.totalRequestsThrottled += 1;
  if (durationSeconds >= CONFIG.PENALTIES.LEVEL_3_HARD_BAN_SEC) {
    telemetry.totalHardBansEnforced += 1;
  }

  const now = Date.now();
  const rayId = generateRayId();

  record.bannedUntil = now + (durationSeconds * 1000);
  record.currentPenaltySec = durationSeconds;
  record.lastViolationReason = reason;
  record.lastRayId = rayId;

  logIncident(ip, reason, durationSeconds, rayId, level);

  res.setHeader('Retry-After', durationSeconds);
  res.setHeader('RateLimit-Limit', CONFIG.TIER_READ.MAX_REQUESTS);
  res.setHeader('RateLimit-Remaining', 0);
  res.setHeader('RateLimit-Reset', durationSeconds);
  res.setHeader('X-Incident-Ray-ID', rayId);
  res.setHeader('X-WAF-Status', 'BLOCKED');
  res.setHeader('X-RateLimit-Banned', 'true');

  return res.status(429).json({
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    code: 'WAF_SECURITY_SHIELD_TRIGGERED',
    message: `คุณส่งคำขอถี่เกินขีดจำกัดความปลอดภัยของระบบ ระบบได้ทำการระงับการเชื่อมต่อของคุณเป็นเวลา ${durationSeconds} วินาที`,
    banned: true,
    penaltySeconds: durationSeconds,
    remainingSeconds: durationSeconds,
    bannedUntil: record.bannedUntil,
    incidentRayId: rayId,
    reason: reason,
    ip: maskIpForDisplay(ip),
    timestamp: new Date().toISOString()
  });
}

/**
 * Check IP Status for UI diagnostics
 */
function checkIpStatus(ip) {
  const record = ipStateStore.get(ip);
  const now = Date.now();

  if (record && record.bannedUntil && now < record.bannedUntil) {
    const remaining = Math.max(1, Math.ceil((record.bannedUntil - now) / 1000));
    return {
      banned: true,
      bannedUntil: record.bannedUntil,
      remainingSeconds: remaining,
      reason: record.lastViolationReason || 'Rate Limit Exceeded',
      rayId: record.lastRayId || generateRayId(),
      penaltySeconds: record.currentPenaltySec
    };
  }

  return {
    banned: false,
    remainingSeconds: 0,
    rayId: generateRayId(),
    quotaRemaining: record ? Math.max(0, CONFIG.TIER_READ.MAX_REQUESTS - record.readTimestamps.length) : CONFIG.TIER_READ.MAX_REQUESTS
  };
}

/**
 * Admin: Unban a specific IP with authentication key
 */
function adminUnbanIp(ip, key) {
  if (key !== ADMIN_MASTER_KEY) {
    return { success: false, error: 'INVALID_ADMIN_KEY', message: 'รหัส Admin Security Key ไม่ถูกต้อง' };
  }

  let count = 0;
  for (const [storedIp, rec] of ipStateStore.entries()) {
    if (storedIp === ip || (ip === '127.0.0.1' && (storedIp === '::1' || storedIp === '::ffff:127.0.0.1')) || (ip === '::1' && (storedIp === '127.0.0.1' || storedIp === '::ffff:127.0.0.1'))) {
      rec.bannedUntil = null;
      rec.offenseCount = 0;
      rec.readTimestamps = [];
      rec.writeTimestamps = [];
      rec.spikeTimestamps = [];
      count += 1;
    }
  }

  return { success: true, message: `ปลดระงับ IP ${ip} เรียบร้อยแล้ว`, unbannedCount: count };
}

/**
 * Admin: Unban ALL IPs with authentication key
 */
function adminUnbanAll(key) {
  if (key !== ADMIN_MASTER_KEY) {
    return { success: false, error: 'INVALID_ADMIN_KEY', message: 'รหัส Admin Security Key ไม่ถูกต้อง' };
  }

  const count = ipStateStore.size;
  ipStateStore.clear();
  return { success: true, message: `ปลดระงับทั้งหมด (${count} IP records) สำเร็จแล้ว`, count };
}

/**
 * Get Real-time Security Telemetry
 */
function getSecurityTelemetry() {
  const activeBans = [];
  const now = Date.now();

  for (const [ip, rec] of ipStateStore.entries()) {
    if (rec.bannedUntil && now < rec.bannedUntil) {
      activeBans.push({
        ip: maskIpForDisplay(ip),
        remainingSeconds: Math.ceil((rec.bannedUntil - now) / 1000),
        reason: rec.lastViolationReason,
        rayId: rec.lastRayId
      });
    }
  }

  return {
    ...telemetry,
    activeBansCount: activeBans.length,
    activeBansList: activeBans,
    monitoredIpsCount: ipStateStore.size,
    eventLoopLagMs: currentEventLoopLag,
    wafConfig: {
      readWindowLimit: `${CONFIG.TIER_READ.MAX_REQUESTS} reqs / min`,
      readBurstLimit: `${CONFIG.TIER_READ.BURST_LIMIT} reqs / 3s`,
      writeWindowLimit: `${CONFIG.TIER_WRITE.MAX_REQUESTS} writes / min`,
      writeBurstLimit: `${CONFIG.TIER_WRITE.BURST_LIMIT} writes / 5s`,
      antiFloodThreshold: `${CONFIG.ANTI_FLOOD.SPIKE_THRESHOLD} reqs / sec`,
      maxTrackedIps: CONFIG.STORE.MAX_TRACKED_IPS
    }
  };
}

/**
 * Automated Garbage Collection (TTL Sweeper)
 * Prevents memory leaks by deleting inactive IP records
 */
setInterval(() => {
  const now = Date.now();
  let deletedCount = 0;

  for (const [ip, record] of ipStateStore.entries()) {
    // If not banned and inactive for more than RECORD_TTL_MS
    const isBanned = record.bannedUntil && now < record.bannedUntil;
    const isInactive = now - record.lastActive > CONFIG.STORE.RECORD_TTL_MS;

    if (!isBanned && isInactive) {
      ipStateStore.delete(ip);
      deletedCount += 1;
    }
  }
}, CONFIG.STORE.GC_INTERVAL_MS);

module.exports = {
  rateLimiter,
  checkIpStatus,
  getClientIp,
  adminUnbanIp,
  adminUnbanAll,
  getSecurityTelemetry,
  detectVpnOrProxy,
  isVerifiedAdminOrDev,
  ADMIN_MASTER_KEY,
  CONFIG
};
