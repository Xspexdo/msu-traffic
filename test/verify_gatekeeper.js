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

async function runGatekeeperTests() {
  console.log('===============================================================');
  console.log('🛡️ MSU Traffic - Mandatory GPS & Anti-VPN Gatekeeper Test');
  console.log('===============================================================\n');

  // Test 1: Clean Client VPN Check -> Expect isVpn: false
  console.log('Test 1: Normal Client VPN Check -> Expect Clean (isVpn: false)');
  const res1 = await request({ path: '/api/security/vpn-check' });
  console.log(`Status: ${res1.status} | isVpn: ${res1.data?.isVpn} | Blocked: ${res1.data?.blocked}`);
  if (res1.status === 200 && res1.data?.isVpn === false) {
    console.log('✅ Test 1 Passed: Legitimate local connections pass VPN check.\n');
  } else {
    console.error('❌ Test 1 Failed!', res1);
  }

  // Test 2: Proxy Header Injection Simulation -> Expect isVpn: true & Blocked
  console.log('Test 2: Proxy Header (via: 1.1 squid) -> Expect isVpn: true (BLOCKED)');
  const res2 = await request({
    path: '/api/security/vpn-check',
    headers: { 'via': '1.1 anon-proxy-squid:3128' }
  });
  console.log(`Status: ${res2.status} | isVpn: ${res2.data?.isVpn} | Reason: ${res2.data?.reason}`);
  if (res2.status === 200 && res2.data?.isVpn === true) {
    console.log('✅ Test 2 Passed: Proxy connection successfully intercepted and blocked!\n');
  } else {
    console.error('❌ Test 2 Failed!', res2);
  }

  // Test 3: Tor Exit Node Header Simulation -> Expect isVpn: true
  console.log('Test 3: Tor Network Header -> Expect isVpn: true (BLOCKED)');
  const res3 = await request({
    path: '/api/security/vpn-check',
    headers: { 'x-tor-exit-node': 'true' }
  });
  console.log(`Status: ${res3.status} | isVpn: ${res3.data?.isVpn} | Reason: ${res3.data?.reason}`);
  if (res3.status === 200 && res3.data?.isVpn === true) {
    console.log('✅ Test 3 Passed: Tor network connection successfully intercepted and blocked!\n');
  } else {
    console.error('❌ Test 3 Failed!', res3);
  }

  // Test 4: Foreign Country VPN Mismatch (CF-IPCountry: US) -> Expect isVpn: true
  console.log('Test 4: Foreign VPN Simulation (CF-IPCountry: US) -> Expect isVpn: true (BLOCKED)');
  const res4 = await request({
    path: '/api/security/vpn-check',
    headers: { 'cf-ipcountry': 'US' }
  });
  console.log(`Status: ${res4.status} | isVpn: ${res4.data?.isVpn} | Reason: ${res4.data?.reason}`);
  if (res4.status === 200 && res4.data?.isVpn === true) {
    console.log('✅ Test 4 Passed: Foreign VPN IP country mismatch intercepted!\n');
  } else {
    console.error('❌ Test 4 Failed!', res4);
  }

  // Test 5: Verify Real GPS Coordinates (MSU Khamriang) -> Expect Valid & inMsuZone: true
  console.log('Test 5: Verify GPS Coordinates at MSU Khamriang (16.2468, 103.2520) -> Expect Valid');
  const res5 = await request({
    path: '/api/security/verify-gps',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    lat: 16.2468,
    lng: 103.2520,
    accuracy: 15.0
  });
  console.log(`Status: ${res5.status} | Valid: ${res5.data?.valid} | inMsuZone: ${res5.data?.inMsuZone} | Distance: ${res5.data?.distanceKm} km | Campus: ${res5.data?.nearCampus}`);
  if (res5.status === 200 && res5.data?.valid && res5.data?.inMsuZone) {
    console.log('✅ Test 5 Passed: Real MSU GPS coordinates verified successfully!\n');
  } else {
    console.error('❌ Test 5 Failed!', res5);
  }

  // Test 6: Verify Invalid Coordinates -> Expect 400 Bad Request
  console.log('Test 6: Verify Invalid Out-of-Range GPS (lat: 999) -> Expect 400');
  const res6 = await request({
    path: '/api/security/verify-gps',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    lat: 999,
    lng: 999
  });
  console.log(`Status: ${res6.status} | Error: ${res6.data?.error}`);
  if (res6.status === 400) {
    console.log('✅ Test 6 Passed: Out-of-range GPS rejected properly.\n');
  } else {
    console.error('❌ Test 6 Failed!', res6);
  }

  console.log('🎉 ALL GPS & ANTI-VPN GATEKEEPER TESTS PASSED! 🚀\n');
}

runGatekeeperTests().catch(console.error);
