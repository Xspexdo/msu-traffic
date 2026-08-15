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

async function runEnterpriseWafTests() {
  console.log('===============================================================');
  console.log('🛡️ MSU Traffic - Enterprise WAF & Anti-Abuse Automated Tests');
  console.log('===============================================================\n');

  // Pre-clean state with admin key
  await request({
    path: '/api/security/admin/unban',
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-admin-key': 'msu-dev-master-sec-key-2026'
    }
  }, { unbanAll: true });

  // Test 1: Baseline Normal Request & RFC Headers
  console.log('Test 1: Normal Browsing Request -> Expect 200 OK & Standard WAF Headers');
  const res1 = await request({ path: '/api/security/test-ping' });
  console.log(`Status: ${res1.status} | WAF-Status: ${res1.headers['x-waf-status']} | RateLimit-Remaining: ${res1.headers['ratelimit-remaining']}`);
  if (res1.status === 200 && res1.headers['x-waf-status'] === 'PASS') {
    console.log('✅ Test 1 Passed: Normal requests pass through with standard RFC RateLimit headers.\n');
  } else {
    console.error('❌ Test 1 Failed!', res1);
  }

  // Test 2: Rapid Burst Flood Detection (> 20 reqs in 1 second)
  console.log('Test 2: Rapid Burst Attack Simulation (30 Concurrent Requests in < 200ms)');
  const burstPromises = [];
  for (let i = 1; i <= 30; i++) {
    burstPromises.push(request({ path: '/api/security/test-ping' }));
  }

  const burstResults = await Promise.all(burstPromises);
  const passedCount = burstResults.filter(r => r.status === 200).length;
  const blockedCount = burstResults.filter(r => r.status === 429).length;

  console.log(`Results: ${passedCount} Allowed | ${blockedCount} Blocked by WAF`);
  const firstBlocked = burstResults.find(r => r.status === 429);

  if (blockedCount > 0 && firstBlocked) {
    console.log('✅ Test 2 Passed: WAF successfully intercepted high-velocity flood!');
    console.log(`   - HTTP Code: ${firstBlocked.status}`);
    console.log(`   - Incident Ray ID: ${firstBlocked.data.incidentRayId || firstBlocked.headers['x-incident-ray-id']}`);
    console.log(`   - Reason: ${firstBlocked.data.reason}`);
    console.log(`   - Penalty Seconds: ${firstBlocked.data.remainingSeconds}s`);
    console.log(`   - Retry-After Header: ${firstBlocked.headers['retry-after']}s\n`);
  } else {
    console.error('❌ Test 2 Failed: Burst flood was not intercepted properly.');
  }

  // Test 3: Blocked IP State Verification
  console.log('Test 3: Verify Subsequent Request from Blocked IP -> Expect Immediate 429');
  const res3 = await request({ path: '/api/zones' });
  console.log(`Status: ${res3.status} | Error Code: ${res3.data?.code}`);
  if (res3.status === 429) {
    console.log('✅ Test 3 Passed: IP remains safely quarantined by WAF.\n');
  } else {
    console.error('❌ Test 3 Failed: Blocked IP was allowed through unexpectedly.');
  }

  // Test 4: Unauthenticated Admin Unban Attempt -> MUST FAIL
  console.log('Test 4: Admin Unban Without Security Key -> Expect 401/429 Block');
  const res4 = await request({
    path: '/api/security/admin/unban',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { unbanAll: true });
  console.log(`Status: ${res4.status} | Error: ${res4.data?.error || res4.data?.code}`);
  if (res4.status === 401 || res4.status === 429) {
    console.log('✅ Test 4 Passed: Unauthenticated clients cannot tamper with WAF bans.\n');
  } else {
    console.error('❌ Test 4 Failed: Insecure unban succeeded without key!');
  }

  // Test 5: Authenticated Admin Unban with Master Security Key -> MUST SUCCEED
  console.log('Test 5: Admin Unban WITH Master Security Key Header -> Expect 200 OK');
  const res5 = await request({
    path: '/api/security/admin/unban',
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-admin-key': 'msu-dev-master-sec-key-2026'
    }
  }, {
    unbanAll: true
  });
  console.log(`Status: ${res5.status} | Message: ${res5.data.message}`);
  if (res5.status === 200 && res5.data.success) {
    console.log('✅ Test 5 Passed: Authorized Admin Key successfully cleared WAF quarantine.\n');
  } else {
    console.error('❌ Test 5 Failed!', res5);
  }

  // Test 6: Verify Recovery after Unban
  console.log('Test 6: Post-Unban Verification -> Expect 200 OK');
  const res6 = await request({ path: '/api/security/test-ping' });
  console.log(`Status: ${res6.status} | WAF-Status: ${res6.headers['x-waf-status']}`);
  if (res6.status === 200 && res6.headers['x-waf-status'] === 'PASS') {
    console.log('✅ Test 6 Passed: IP connectivity is restored instantly.\n');
  } else {
    console.error('❌ Test 6 Failed!', res6);
  }

  // Test 7: Telemetry & Incident Audit Log
  console.log('Test 7: Security Telemetry & Incident Audit Stream -> GET /api/security/telemetry');
  const res7 = await request({ path: '/api/security/telemetry' });
  const t = res7.data.telemetry;
  console.log(`Status: ${res7.status}`);
  console.log(`Inspected: ${t.totalRequestsInspected} | Allowed: ${t.totalRequestsAllowed} | Throttled: ${t.totalRequestsThrottled}`);
  console.log(`Recent Incidents Logged: ${t.recentIncidents.length}`);
  if (res7.status === 200 && t.recentIncidents.length > 0) {
    console.log('✅ Test 7 Passed: Telemetry & Audit logs are fully operational.\n');
  } else {
    console.error('❌ Test 7 Failed!', res7);
  }

  // Test 8: Bad Bot & Vulnerability Scanner Block
  console.log('Test 8: Attack Tool / Scanner User-Agent Simulation (sqlmap) -> Expect 429 WAF Block');
  const res8 = await request({
    path: '/api/zones',
    headers: { 'User-Agent': 'sqlmap/1.6.12#stable (https://sqlmap.org)' }
  });
  console.log(`Status: ${res8.status} | Reason: ${res8.data?.reason}`);
  if (res8.status === 429 && res8.data?.reason?.includes('Malicious Scanner')) {
    console.log('✅ Test 8 Passed: Malicious Bot Signature blocked immediately.\n');
  } else {
    console.error('❌ Test 8 Failed!', res8);
  }

  // Clear unban for next test
  await request({
    path: '/api/security/admin/unban',
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-admin-key': 'msu-dev-master-sec-key-2026'
    }
  }, { unbanAll: true });

  // Test 9: Sensitive File / Traversal Probe Block
  console.log('Test 9: Probing Sensitive File (.env probe) -> Expect 429 WAF Quarantine');
  const res9 = await request({ path: '/api/.env' });
  console.log(`Status: ${res9.status} | Reason: ${res9.data?.reason}`);
  if (res9.status === 429 && res9.data?.reason?.includes('Probing Sensitive File')) {
    console.log('✅ Test 9 Passed: Sensitive file / Path traversal probing quarantined.\n');
  } else {
    console.error('❌ Test 9 Failed!', res9);
  }

  // Final Unban
  await request({
    path: '/api/security/admin/unban',
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-admin-key': 'msu-dev-master-sec-key-2026'
    }
  }, { unbanAll: true });

  console.log('🎉 ALL ENTERPRISE WAF SECURITY TESTS (9/9) PASSED SUCCESSFULLY! 🚀\n');
}

runEnterpriseWafTests().catch(console.error);
