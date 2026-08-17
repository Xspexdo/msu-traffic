/**
 * Test Suite: User Pin Creation Quota (1 pin/hr, max 3 pins/day)
 */

const db = require('../server/database/db');

console.log('🧪 Starting User Pin Creation Quota Verification Tests...\n');

const testUserId = `test_user_${Date.now()}`;
const testUserEmail = `student_${Date.now()}@msu.ac.th`;

// 1. Initial Quota Check (0 pins)
console.log('▶ Test 1: Initial Quota Check (Clean State)');
let quota = db.checkUserPinQuota(testUserId, testUserEmail, false);
console.assert(quota.allowed === true, 'Initial quota should be allowed');
console.assert(quota.countToday === 0, 'Initial countToday should be 0');
console.assert(quota.remainingToday === 3, 'Initial remainingToday should be 3');
console.log('  ✅ Initial quota verified (0/3 pins used)');

// 2. Create 1st Pin
console.log('\n▶ Test 2: Create 1st Pin');
const pin1 = db.addPin({
  locationName: 'หน้า มอใหม่ 1',
  campusZone: 'มอใหม่ (ขามเรียง)',
  lat: 16.2467,
  lng: 103.2520,
  type: 'helmet',
  reporterId: testUserId,
  reporterEmail: testUserEmail
});
console.log('  Created Pin 1:', pin1.id);

// 3. Immediately attempt to create 2nd Pin (Should be blocked by 1-hour cooldown)
console.log('\n▶ Test 3: Attempt to create 2nd Pin immediately (< 1 hour cooldown)');
quota = db.checkUserPinQuota(testUserId, testUserEmail, false);
console.assert(quota.allowed === false, 'Should be blocked by 1-hour cooldown');
console.assert(quota.reason === 'PIN_COOLDOWN_1HOUR', 'Reason must be PIN_COOLDOWN_1HOUR');
console.log(`  ✅ Successfully blocked by 1-hour cooldown: "${quota.message}"`);

// 4. Simulate Pin 1 was created 65 minutes ago
console.log('\n▶ Test 4: Simulate 65 minutes elapsed since Pin 1');
pin1.createdAt = Date.now() - (65 * 60 * 1000); // 65 mins ago

quota = db.checkUserPinQuota(testUserId, testUserEmail, false);
console.assert(quota.allowed === true, 'Should be allowed after 1 hour');
console.assert(quota.remainingToday === 2, 'Remaining today should be 2');
console.log('  ✅ Allowed after 1 hour cooldown elapsed (1/3 used, 2 remaining)');

// 5. Create 2nd Pin
const pin2 = db.addPin({
  locationName: 'หน้า มอใหม่ 2',
  campusZone: 'มอใหม่ (ขามเรียง)',
  lat: 16.2468,
  lng: 103.2521,
  type: 'helmet',
  reporterId: testUserId,
  reporterEmail: testUserEmail
});
pin2.createdAt = Date.now() - (65 * 60 * 1000); // simulate 65 mins ago
console.log('  Created Pin 2:', pin2.id);

// 6. Create 3rd Pin
const pin3 = db.addPin({
  locationName: 'หน้า มอใหม่ 3',
  campusZone: 'มอใหม่ (ขามเรียง)',
  lat: 16.2469,
  lng: 103.2522,
  type: 'helmet',
  reporterId: testUserId,
  reporterEmail: testUserEmail
});
pin3.createdAt = Date.now() - (65 * 60 * 1000); // simulate 65 mins ago
console.log('  Created Pin 3:', pin3.id);

// 7. Check quota after 3 pins today (Should be blocked by Daily Limit)
console.log('\n▶ Test 5: Attempt to create 4th Pin on the same day (Max 3 pins/day limit)');
quota = db.checkUserPinQuota(testUserId, testUserEmail, false);
console.assert(quota.allowed === false, 'Should be blocked by daily limit');
console.assert(quota.reason === 'PIN_DAILY_LIMIT_EXCEEDED', 'Reason must be PIN_DAILY_LIMIT_EXCEEDED');
console.log(`  ✅ Successfully blocked by daily limit: "${quota.message}"`);

// 8. Test Dev bypass (Unlimited)
console.log('\n▶ Test 6: Developer Bypass Verification');
const devQuota = db.checkUserPinQuota('dev_java5263', 'java5263@gmail.com', true);
console.assert(devQuota.allowed === true, 'Dev must be allowed');
console.assert(devQuota.isDev === true, 'Dev flag must be true');
console.log('  ✅ Developer bypass verified (Unlimited pins)');

// Clean up test pins
db.data.pins = db.data.pins.filter(p => p.id !== pin1.id && p.id !== pin2.id && p.id !== pin3.id);
db.saveData();

console.log('\n🎉 ALL PIN CREATION QUOTA TESTS PASSED 100%!');
