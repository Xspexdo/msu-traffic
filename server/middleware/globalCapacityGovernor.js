/**
 * =========================================================================
 * MSU Traffic - Global Capacity Governor & Virtual Waiting Room
 * =========================================================================
 * Enforces a strict 100 Requests/Second Global Concurrency Limit.
 * If traffic exceeds 100 req/sec (> 100 people/sec):
 * - 1st to 100th requests: Process normally
 * - 101st+ requests: Receive "Traffic Full / Waiting Room" response
 * =========================================================================
 */

const { isVerifiedAdminOrDev } = require('./rateLimiter');

const MAX_GLOBAL_RPS = 100; // สูงสุด 100 คำขอต่อ 1 วินาที
const WINDOW_MS = 1000;     // 1 วินาที sliding window

// Rolling window timestamp array
let requestTimestamps = [];

// Helper to generate Waiting Room HTML for browser page visits
function getWaitingRoomHtml(currentRps, maxRps) {
  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🚦 ระบบมีผู้ใช้งานหนาแน่น - MSU Traffic</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@400;600;700;800&family=Prompt:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #2563EB;
      --bg: #0F172A;
      --card-bg: #1E293B;
      --text: #F8FAFC;
      --text-muted: #94A3B8;
      --accent-amber: #F59E0B;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Prompt', 'Kanit', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.25rem;
    }
    .waiting-card {
      background: var(--card-bg);
      border: 1.5px solid #334155;
      border-radius: 24px;
      max-width: 480px;
      width: 100%;
      padding: 2.2rem;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
      animation: cardFadeIn 0.3s ease-out;
    }
    @keyframes cardFadeIn {
      from { opacity: 0; transform: translateY(15px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .traffic-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.35);
      color: var(--accent-amber);
      font-size: 0.78rem;
      font-weight: 700;
      padding: 0.35rem 0.9rem;
      border-radius: 9999px;
      margin-bottom: 1.25rem;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      background: var(--accent-amber);
      border-radius: 50%;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    .icon-container {
      font-size: 3.5rem;
      margin-bottom: 0.75rem;
      filter: drop-shadow(0 4px 12px rgba(245, 158, 11, 0.3));
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 800;
      margin-bottom: 0.5rem;
      color: #FFFFFF;
    }
    p {
      color: var(--text-muted);
      font-size: 0.9rem;
      line-height: 1.6;
      margin-bottom: 1.5rem;
    }
    .traffic-meter {
      background: #0F172A;
      border: 1px solid #334155;
      border-radius: 14px;
      padding: 1rem 1.2rem;
      margin-bottom: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .meter-label {
      font-size: 0.8rem;
      color: var(--text-muted);
      font-weight: 600;
      text-align: left;
    }
    .meter-val {
      font-size: 1.1rem;
      font-weight: 800;
      color: var(--accent-amber);
    }
    .countdown-box {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-bottom: 1.5rem;
    }
    .countdown-num {
      color: #38BDF8;
      font-weight: 800;
      font-size: 1.15rem;
    }
    .btn-reload {
      display: inline-block;
      width: 100%;
      padding: 0.85rem 1.2rem;
      background: var(--primary);
      color: #FFFFFF;
      font-size: 0.95rem;
      font-weight: 700;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: inherit;
    }
    .btn-reload:hover {
      background: #1D4ED8;
      transform: translateY(-1px);
    }
  </style>
</head>
<body>
  <div class="waiting-card">
    <div class="traffic-badge">
      <span class="pulse-dot"></span>
      <span>TRAFFIC CAPACITY LIMIT (100 REQ/S)</span>
    </div>
    <div class="icon-container">🚦</div>
    <h1>ผู้ใช้งานหนาแน่น (ระบบเต็มชั่วคราว)</h1>
    <p>
      ขณะนี้มีผู้เข้าใช้งานพร้อมกันมากกว่า <strong>100 คนต่อวินาที</strong><br>
      เพื่อรักษาเสถียรภาพของระบบ กรุณารอสักครู่ ระบบจะพาท่านเข้าสู่หน้าเว็บอัตโนมัติ
    </p>

    <div class="traffic-meter">
      <div class="meter-label">
        <div>ปริมาณทราฟฟิกปัจจุบัน</div>
        <div style="font-size: 0.72rem; color: #64748B;">ขีดจำกัดความจุสูงสุด</div>
      </div>
      <div class="meter-val">
        ${currentRps} / ${maxRps} <span style="font-size: 0.75rem; color: var(--text-muted);">req/s</span>
      </div>
    </div>

    <div class="countdown-box">
      กำลังลองใหม่อัตโนมัติในอีก <span class="countdown-num" id="timer">3</span> วินาที...
    </div>

    <button class="btn-reload" onclick="location.reload()">
      🔄 ลองโหลดหน้าใหม่อีกครั้ง
    </button>
  </div>

  <script>
    let timeLeft = 3;
    const timerElem = document.getElementById('timer');
    const interval = setInterval(() => {
      timeLeft--;
      if (timerElem) timerElem.textContent = timeLeft;
      if (timeLeft <= 0) {
        clearInterval(interval);
        location.reload();
      }
    }, 1000);
  </script>
</body>
</html>`;
}

/**
 * Middleware: Global Capacity Governor (100 req/sec limit)
 */
function globalCapacityGovernor(req, res, next) {
  // 1. Bypass for verified Admin/Dev
  if (isVerifiedAdminOrDev(req)) {
    return next();
  }

  const now = Date.now();
  
  // Clean timestamps older than 1 second
  requestTimestamps = requestTimestamps.filter(ts => now - ts < WINDOW_MS);

  const currentRps = requestTimestamps.length + 1;

  // Set informative headers
  res.setHeader('X-Traffic-RPS', currentRps.toString());
  res.setHeader('X-Traffic-Capacity', MAX_GLOBAL_RPS.toString());

  // If traffic exceeds 100 requests in the current 1-second window
  if (currentRps > MAX_GLOBAL_RPS) {
    res.setHeader('Retry-After', '3');

    const isHtmlRequest = req.headers.accept && req.headers.accept.includes('text/html');

    if (isHtmlRequest && req.method === 'GET') {
      return res.status(429).send(getWaitingRoomHtml(currentRps, MAX_GLOBAL_RPS));
    }

    return res.status(429).json({
      success: false,
      error: 'TRAFFIC_CAPACITY_FULL',
      message: '🚦 ขณะนี้มีผู้เข้าใช้งานพร้อมกันเกิน 100 คน/วินาที (ระบบเต็มชั่วคราว) กรุณารอสักครู่...',
      code: 'QUEUE_FULL_WAIT',
      retryAfterSeconds: 3,
      currentRps: currentRps,
      maxCapacity: MAX_GLOBAL_RPS
    });
  }

  // Record this request timestamp
  requestTimestamps.push(now);

  next();
}

/**
 * Helper to get current global RPS telemetry
 */
function getGlobalRps() {
  const now = Date.now();
  requestTimestamps = requestTimestamps.filter(ts => now - ts < WINDOW_MS);
  return {
    currentRps: requestTimestamps.length,
    maxCapacity: MAX_GLOBAL_RPS
  };
}

module.exports = {
  globalCapacityGovernor,
  getGlobalRps,
  MAX_GLOBAL_RPS
};
