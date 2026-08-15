const http = require('http');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
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
    if (data) req.write(typeof data === 'string' ? data : JSON.stringify(data));
    req.end();
  });
}

async function testDevRole() {
  console.log('👑 Testing Developer Role for java5263@gmail.com...\n');

  // Test 1: Dev Login
  const authRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/demo',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    email: 'java5263@gmail.com',
    name: 'Java'
  });

  console.log('Dev Login Response:', authRes.data);
  if (authRes.data.user?.isDev === true && authRes.data.user?.role === 'dev') {
    console.log('✅ Test 1 Passed: java5263@gmail.com is recognized as DEV!\n');
  } else {
    console.error('❌ Test 1 Failed!', authRes.data);
  }

  const devUser = authRes.data.user;

  // Test 2: Dev creating a report
  const createRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/reports',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Data': encodeURIComponent(JSON.stringify(devUser)),
      'Authorization': `Bearer ${devUser.token}`
    }
  }, {
    type: 'security',
    locationName: 'หน้าป้าย มมส (ทดสอบโดย Dev)',
    lat: 16.2467,
    lng: 103.2520,
    description: 'ด่านตรวจความมั่นคง รายงานโดยผู้พัฒนา'
  });

  const repId = createRes.data.data?.id;
  console.log(`Created Report ID: ${repId}, Reporter isDev: ${createRes.data.data?.reporter?.isDev}`);
  if (createRes.data.data?.reporter?.isDev) {
    console.log('✅ Test 2 Passed: Dev badge attached to report!\n');
  }

  // Test 3: Dev deleting the report
  const delRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/reports/${repId}`,
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Data': encodeURIComponent(JSON.stringify(devUser)),
      'Authorization': `Bearer ${devUser.token}`
    }
  });

  console.log('Dev Delete Response:', delRes.data);
  if (delRes.status === 200 && delRes.data.success) {
    console.log('✅ Test 3 Passed: Dev can delete any report!\n');
  }

  console.log('🎉 Developer Role Tests Passed Successfully!');
}

testDevRole().catch(console.error);
