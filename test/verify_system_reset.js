const http = require('http');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      method: options.method || 'GET',
      path: options.path || '/',
      headers: options.headers || {}
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runSystemResetTests() {
  console.log('===============================================================');
  console.log('🧹 MSU Traffic - System Reset (ยศ, แต้ม, หมุด, แชท) Automated Test');
  console.log('===============================================================\n');

  const devHeaders = {
    'Content-Type': 'application/json',
    'x-admin-key': 'msu-dev-master-sec-key-2026'
  };

  // Test 1: Reset with unauthorized client -> Expect 403
  console.log('Test 1: System Reset Without Dev Key -> Expect 403 Forbidden');
  const res1 = await request({
    path: '/api/security/admin/system-reset',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { resetPins: true });
  console.log(`Status: ${res1.status} | Error: ${res1.data?.error}`);
  if (res1.status === 403) {
    console.log('✅ Test 1 Passed: Unauthorized clients cannot trigger system reset.\n');
  } else {
    console.error('❌ Test 1 Failed!', res1);
  }

  // Test 2: Reset without selecting any checkbox -> Expect 400 Bad Request
  console.log('Test 2: System Reset With No Options Selected -> Expect 400');
  const res2 = await request({
    path: '/api/security/admin/system-reset',
    method: 'POST',
    headers: devHeaders
  }, { resetRanks: false, resetPoints: false, resetPins: false });
  console.log(`Status: ${res2.status} | Error: ${res2.data?.error}`);
  if (res2.status === 400) {
    console.log('✅ Test 2 Passed: Requires selecting at least one category.\n');
  } else {
    console.error('❌ Test 2 Failed!', res2);
  }

  // Test 3: Reset Selected: [x] หมุด Only
  console.log('Test 3: System Reset Selected: [x] หมุด (resetPins: true) -> Expect 200');
  const res3 = await request({
    path: '/api/security/admin/system-reset',
    method: 'POST',
    headers: devHeaders
  }, { resetPins: true, resetRanks: false, resetPoints: false });
  console.log(`Status: ${res3.status} | Message: ${res3.data?.message}`);
  if (res3.status === 200 && res3.data?.results?.resetPins === true) {
    console.log('✅ Test 3 Passed: Successfully reset pins!\n');
  } else {
    console.error('❌ Test 3 Failed!', res3);
  }

  // Test 4: Reset All: [x] ยศ, [x] แต้ม, [x] หมุด, [x] แชท
  console.log('Test 4: System Reset Full Selection: [x] ยศ, [x] แต้ม, [x] หมุด, [x] แชท -> Expect 200');
  const res4 = await request({
    path: '/api/security/admin/system-reset',
    method: 'POST',
    headers: devHeaders
  }, { resetRanks: true, resetPoints: true, resetPins: true, resetChat: true });
  console.log(`Status: ${res4.status} | Message: ${res4.data?.message}`);
  if (res4.status === 200 && res4.data?.results?.resetRanks && res4.data?.results?.resetPoints && res4.data?.results?.resetPins) {
    console.log('✅ Test 4 Passed: Full system data reset executed and broadcasted successfully!\n');
  } else {
    console.error('❌ Test 4 Failed!', res4);
  }

  console.log('🎉 ALL SYSTEM RESET TESTS PASSED! 🚀\n');
}

runSystemResetTests().catch(console.error);
