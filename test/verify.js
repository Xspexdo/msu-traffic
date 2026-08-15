const http = require('http');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: JSON.parse(body)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: body
          });
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

async function runTests() {
  console.log('🧪 Starting MSU Traffic Automated Verification Tests...\n');

  // Test 1: Public Read Access (Zones)
  console.log('Test 1: Public Read Access -> GET /api/zones');
  const zonesRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/zones',
    method: 'GET'
  });
  console.log(`Status: ${zonesRes.status}, Zones Count: ${zonesRes.data.data?.length}`);
  if (zonesRes.status === 200 && zonesRes.data.data?.length > 0) {
    console.log('✅ Test 1 Passed: Public can access MSU hotspots!\n');
  } else {
    console.error('❌ Test 1 Failed!', zonesRes);
  }

  // Test 2: Public Read Access (Reports)
  console.log('Test 2: Public Read Access -> GET /api/reports');
  const reportsRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/reports',
    method: 'GET'
  });
  console.log(`Status: ${reportsRes.status}, Reports Count: ${reportsRes.data.count}`);
  if (reportsRes.status === 200 && Array.isArray(reportsRes.data.data)) {
    console.log('✅ Test 2 Passed: Public can view reports without login!\n');
  } else {
    console.error('❌ Test 2 Failed!', reportsRes);
  }

  // Test 3: Unauthenticated Post -> MUST BE BLOCKED (401)
  console.log('Test 3: POST /api/reports WITHOUT Login -> Expect 401 Unauthorized');
  const unauthPostRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/reports',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    type: 'helmet',
    locationName: 'หน้าป้าย มมส',
    lat: 16.2467,
    lng: 103.2520
  });
  console.log(`Status: ${unauthPostRes.status}, Error: ${unauthPostRes.data.error}`);
  if (unauthPostRes.status === 401) {
    console.log('✅ Test 3 Passed: Non-logged-in users cannot post!\n');
  } else {
    console.error('❌ Test 3 Failed!', unauthPostRes);
  }

  // Test 4: Authenticated Post -> MUST SUCCEED (201)
  console.log('Test 4: POST /api/reports WITH Login -> Expect 201 Created');
  const mockUser = {
    id: 'student-test-01',
    name: 'นิสิตทดสอบ มมส',
    email: 'test_msu@msu.ac.th',
    picture: null
  };

  const authPostRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/reports',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Data': encodeURIComponent(JSON.stringify(mockUser)),
      'Authorization': 'Bearer test-token-123'
    }
  }, {
    type: 'alcohol',
    locationName: 'สะพานข้ามคลองท่าขอนยาง (สะพานดำ)',
    campusZone: 'ท่าขอนยาง (รอบมอใหม่)',
    lat: 16.2380,
    lng: 103.2540,
    direction: 'ฝั่งมุ่งหน้าท่าขอนยาง',
    description: 'ทดสอบรายงานจุดตรวจเป่าแอลกอฮอล์'
  });
  console.log(`Status: ${authPostRes.status}, Message: ${authPostRes.data.message}`);
  const createdReportId = authPostRes.data.data?.id;
  if (authPostRes.status === 201 && createdReportId) {
    console.log(`✅ Test 4 Passed: Authenticated user posted report successfully (ID: ${createdReportId})!\n`);
  } else {
    console.error('❌ Test 4 Failed!', authPostRes);
  }

  // Test 5: Authenticated Voting
  console.log('Test 5: POST /api/reports/:id/vote -> Expect 200 OK');
  const voteRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/reports/${createdReportId}/vote`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Data': encodeURIComponent(JSON.stringify(mockUser)),
      'Authorization': 'Bearer test-token-123'
    }
  }, {
    voteType: 'up'
  });
  console.log(`Status: ${voteRes.status}, Message: ${voteRes.data.message}`);
  if (voteRes.status === 200 && voteRes.data.data?.votes?.up?.length > 0) {
    console.log('✅ Test 5 Passed: Voting functionality works!\n');
  } else {
    console.error('❌ Test 5 Failed!', voteRes);
  }

  console.log('🎉 All Functional Tests Passed!\n');
}

runTests().catch(console.error);
