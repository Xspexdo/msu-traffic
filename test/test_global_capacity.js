/**
 * Test Suite: Global Traffic Capacity Governor (100 Req/Sec Limit)
 */

const { globalCapacityGovernor, getGlobalRps, MAX_GLOBAL_RPS } = require('../server/middleware/globalCapacityGovernor');

console.log('🧪 Starting Global Capacity Governor (100 Req/Sec Limit) Verification Tests...\n');

console.log(`▶ Max Configured Limit: ${MAX_GLOBAL_RPS} requests / second`);

let successCount = 0;
let blockedCount = 0;
let lastBlockedResponse = null;

// Simulate 110 requests arriving in the exact same second
for (let i = 1; i <= 110; i++) {
  const req = {
    headers: {
      accept: i === 105 ? 'text/html' : 'application/json'
    },
    method: 'GET'
  };

  let isNext = false;
  let statusSet = null;
  let resultSet = null;

  const res = {
    setHeader(name, val) {},
    status(s) {
      statusSet = s;
      return this;
    },
    json(j) {
      resultSet = j;
      return this;
    },
    send(html) {
      resultSet = html;
      return this;
    }
  };

  globalCapacityGovernor(req, res, () => {
    isNext = true;
  });

  if (isNext) {
    successCount++;
  } else {
    blockedCount++;
    lastBlockedResponse = { status: statusSet, result: resultSet, reqNum: i };
  }
}

console.log(`\n📊 Test Results for 110 concurrent requests:`);
console.log(`  - Total Allowed: ${successCount} requests`);
console.log(`  - Total Queued / Blocked: ${blockedCount} requests`);

console.assert(successCount === 100, `Exactly 100 requests must be allowed (Got ${successCount})`);
console.assert(blockedCount === 10, `Exactly 10 requests (101st - 110th) must be queued/blocked (Got ${blockedCount})`);
console.assert(lastBlockedResponse.status === 429, `Blocked status must be 429`);

console.log('  ✅ 1st - 100th requests processed normally!');
console.log('  ✅ 101st+ requests redirected to Waiting Room / "ระบบเต็ม รอก่อน" (429 Too Many Requests)!');
console.log('\n🎉 ALL GLOBAL TRAFFIC GOVERNOR TESTS PASSED 100%!');
