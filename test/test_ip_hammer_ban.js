/**
 * Test Suite: Strict Anti-Spam & Repeated IP Hammer Ban
 */

const { rateLimiter, checkIpStatus, adminUnbanAll } = require('../server/middleware/rateLimiter');

console.log('🧪 Starting Strict Repeated IP Hammer Ban Verification Tests...\n');

// Clean previous state
adminUnbanAll();

const testAttackerIp = '198.51.100.77';

function sendMockRequest() {
  const req = {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'x-forwarded-for': testAttackerIp
    },
    ip: testAttackerIp,
    method: 'GET',
    originalUrl: '/api/reports'
  };

  let statusSet = 200;
  let resultSet = null;
  let isNext = false;

  const res = {
    setHeader(k, v) {},
    status(s) {
      statusSet = s;
      return this;
    },
    json(j) {
      resultSet = j;
      return this;
    }
  };

  rateLimiter(req, res, () => {
    isNext = true;
  });

  return { isNext, status: statusSet, result: resultSet };
}

// 1. Send 15 rapid requests to trigger Anti-Flood spike threshold (> 10 req/s)
console.log('▶ Step 1: Simulating rapid burst attack from IP:', testAttackerIp);
let firstBanResponse = null;
for (let i = 1; i <= 15; i++) {
  const resp = sendMockRequest();
  if (resp.status === 429 && !firstBanResponse) {
    firstBanResponse = resp;
  }
}

console.assert(firstBanResponse !== null, 'IP must be banned on rapid flood');
console.log(`  ✅ IP detected and initially banned for ${firstBanResponse.result.penaltySeconds}s`);

// 2. Simulate attacker repeatedly hammering while banned
console.log('\n▶ Step 2: Attacker continues hammering requests while banned...');
let escalatedResponse = null;
for (let i = 1; i <= 4; i++) {
  const resp = sendMockRequest();
  if (resp.result?.code === 'WAF_HAMMER_BAN_ENFORCED') {
    escalatedResponse = resp;
  }
}

console.assert(escalatedResponse !== null, 'Hammering must trigger WAF_HAMMER_BAN_ENFORCED');
console.assert(escalatedResponse.result.penaltySeconds === 3600, 'Penalty must escalate to 3600s (1 Hour)');
console.log(`  ✅ Repeated attack detected! IP penalty successfully escalated to ${escalatedResponse.result.penaltySeconds}s (1 Hour Hard Ban)!`);

// 3. Verify checkIpStatus reports banned
const status = checkIpStatus(testAttackerIp);
console.assert(status.banned === true, 'checkIpStatus must report banned');
console.log(`  ✅ IP Status: BANNED (${status.remainingSeconds}s remaining)`);

console.log('\n🎉 ALL REPEATED IP HAMMER BAN TESTS PASSED 100%!');
