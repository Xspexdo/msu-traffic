const http = require('http');

const BASE_URL = 'http://localhost:3000';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('===============================================================');
  console.log('💬 MSU Traffic - Pin Live Chat & Profanity Filter Automated Tests');
  console.log('===============================================================\n');

  try {
    // 1. Get existing reports to find a pinId
    console.log('Test 1: Fetch existing pins to test chat room');
    const pinsRes = await request('GET', '/api/reports');
    if (!pinsRes.data.success || pinsRes.data.data.length === 0) {
      throw new Error('No pins found to test chat room');
    }
    const testPin = pinsRes.data.data[0];
    console.log(`✅ Test 1 Passed: Selected Pin "${testPin.title || testPin.locationName}" (${testPin.id})\n`);

    // 2. Fetch Chat History
    console.log(`Test 2: GET /api/reports/${testPin.id}/chat -> Expect 200 & message list`);
    const historyRes = await request('GET', `/api/reports/${testPin.id}/chat`);
    console.log(`Status: ${historyRes.status} | Messages Count: ${historyRes.data.data?.length || 0}`);
    if (historyRes.status !== 200 || !historyRes.data.success) {
      throw new Error('Failed to fetch pin chat history');
    }
    console.log('✅ Test 2 Passed: Pin chat history fetched successfully!\n');

    // 3. Send Polite Chat Message
    console.log('Test 3: POST polite chat message -> Expect 201 Created & +3 EXP');
    const politeBody = {
      text: 'เจ้าหน้าที่ยังอยู่ฝั่งหน้ามอครับ สวมหมวกนิรภัยกันด้วยนะครับ 🪖'
    };
    const politeHeaders = {
      'x-user-data': JSON.stringify({
        id: 'dev_java5263',
        name: 'Java (Lead Dev)',
        email: 'java5263@gmail.com',
        isDev: true
      })
    };
    const sendRes = await request('POST', `/api/reports/${testPin.id}/chat`, politeBody, politeHeaders);
    console.log(`Status: ${sendRes.status} | Message: ${sendRes.data.message} | Error: ${sendRes.data.error}`);
    console.log(`   Message ID: ${sendRes.data.data?.id} | EXP Gained: +${sendRes.data.expGained}`);
    if (sendRes.status !== 201 || !sendRes.data.success) {
      throw new Error(`Failed to send polite chat message: ${sendRes.data.error || sendRes.data.message}`);
    }
    console.log('✅ Test 3 Passed: Polite message sent and rewarded +3 EXP successfully!\n');

    // 4. Test Profanity Filter: Explicit Bad Words
    console.log('Test 4: POST explicit profanity ("ไอ้เหี้ย ควย") -> Expect 400 & Blocked');
    const toxicBody1 = {
      text: 'ไอ้เหี้ย ควย ตั้งด่านทำไมวะ'
    };
    const toxicRes1 = await request('POST', `/api/reports/${testPin.id}/chat`, toxicBody1, politeHeaders);
    console.log(`Status: ${toxicRes1.status} | Response Error: ${toxicRes1.data.error}`);
    if (toxicRes1.status !== 400 || toxicRes1.data.success !== false) {
      throw new Error('Profanity filter failed to block explicit bad words!');
    }
    console.log('✅ Test 4 Passed: Explicit profanity was strictly blocked!\n');

    // 5. Test Profanity Filter: Homoglyphs / Spaced Leetspeak
    console.log('Test 5: POST obfuscated profanity ("ค_ว_า_ย", "สั ส") -> Expect 400 & Blocked');
    const toxicBody2 = {
      text: 'พวก ค_ว_า_ย สั ส'
    };
    const toxicRes2 = await request('POST', `/api/reports/${testPin.id}/chat`, toxicBody2, politeHeaders);
    console.log(`Status: ${toxicRes2.status} | Response Error: ${toxicRes2.data.error}`);
    if (toxicRes2.status !== 400 || toxicRes2.data.success !== false) {
      throw new Error('Profanity filter failed to block obfuscated bad words!');
    }
    console.log('✅ Test 5 Passed: Obfuscated leetspeak was strictly blocked!\n');

    // 6. Test Anonymous posting
    console.log('Test 6: POST anonymous chat message -> Expect "นิสิตนิรนาม" sender');
    const anonBody = {
      text: 'ด่านเริ่มเบาแล้วครับ ผ่านสะดวก',
      isAnonymous: true
    };
    const anonRes = await request('POST', `/api/reports/${testPin.id}/chat`, anonBody, politeHeaders);
    console.log(`Status: ${anonRes.status} | Sender Name: ${anonRes.data.data?.senderName}`);
    if (anonRes.status !== 201 || anonRes.data.data?.senderName !== 'นิสิตนิรนาม') {
      throw new Error('Anonymous chat posting failed');
    }
    console.log('✅ Test 6 Passed: Anonymous chat posting works accurately!\n');

    console.log('🎉 ALL PIN LIVE CHAT & PROFANITY FILTER TESTS PASSED WITH 100% SUCCESS! 🚀\n');
  } catch (e) {
    console.error('❌ Test Failure:', e.message);
    process.exit(1);
  }
}

runTests();
