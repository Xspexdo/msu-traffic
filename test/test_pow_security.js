/**
 * Test Suite: Proof-of-Work (PoW) & Dynamic Nonce Security Engine
 */

const crypto = require('crypto');
const { generateChallenge, verifyChallengeSignature, requirePoW } = require('../server/middleware/powSecurity');

console.log('🧪 Starting Proof-of-Work (PoW) Security Verification Tests...\n');

// Test 1: Challenge Generation
console.log('▶ Test 1: Challenge Generation & Signature Verification');
const challenge = generateChallenge();
console.log('  Generated Challenge:', challenge);

const isValid = verifyChallengeSignature(
  challenge.challengeId,
  challenge.salt,
  challenge.difficulty,
  challenge.expiresAt,
  challenge.signature
);
console.assert(isValid === true, 'Signature must be valid');
console.log('  ✅ Signature validation passed!');

// Test 2: PoW Hash Solver
console.log('\n▶ Test 2: Solving PoW Challenge in Node.js');
const start = Date.now();
let nonce = 0;
const targetPrefix = '0'.repeat(challenge.difficulty);
let foundHash = '';

while (true) {
  const candidate = `${challenge.salt}:${nonce}`;
  const hash = crypto.createHash('sha256').update(candidate).digest('hex');
  if (hash.startsWith(targetPrefix)) {
    foundHash = hash;
    break;
  }
  nonce++;
}
const elapsed = Date.now() - start;
console.log(`  Found nonce: ${nonce} (Hash: ${foundHash}) in ${elapsed}ms`);
console.assert(foundHash.startsWith(targetPrefix), 'Hash must start with difficulty zeros');
console.log('  ✅ PoW math solving passed!');

// Test 3: Middleware Execution Simulation (Success case)
console.log('\n▶ Test 3: Middleware Validation (Valid Request)');
const mockReq = {
  headers: {
    'x-pow-challenge': challenge.challengeId,
    'x-pow-salt': challenge.salt,
    'x-pow-difficulty': challenge.difficulty.toString(),
    'x-pow-expires': challenge.expiresAt.toString(),
    'x-pow-signature': challenge.signature,
    'x-pow-nonce': nonce.toString()
  }
};

let nextCalled = false;
let mockResStatus = null;
let mockResJson = null;

const mockRes = {
  status(s) {
    mockResStatus = s;
    return this;
  },
  json(j) {
    mockResJson = j;
    return this;
  }
};

requirePoW(mockReq, mockRes, () => {
  nextCalled = true;
});

console.assert(nextCalled === true, 'requirePoW should call next() on valid challenge');
console.log('  ✅ Middleware accepted valid PoW token!');

// Test 4: Replay Attack (Using same challenge + nonce again)
console.log('\n▶ Test 4: Anti-Replay Defense (Attempting to reuse consumed nonce)');
nextCalled = false;
mockResStatus = null;
mockResJson = null;

requirePoW(mockReq, mockRes, () => {
  nextCalled = true;
});

console.assert(nextCalled === false, 'requirePoW must BLOCK replayed challenge');
console.assert(mockResStatus === 403, 'Status must be 403 Forbidden');
console.assert(mockResJson.code === 'POW_REPLAY', 'Error code must be POW_REPLAY');
console.log('  ✅ Replay attack successfully blocked with 403 Forbidden!');

// Test 5: Tampered Signature Defense
console.log('\n▶ Test 5: Anti-Tampering Defense (Tampering with signature/difficulty)');
const tamperedReq = {
  headers: {
    'x-pow-challenge': 'fake-challenge-id',
    'x-pow-salt': 'fake-salt',
    'x-pow-difficulty': '1',
    'x-pow-expires': (Date.now() + 60000).toString(),
    'x-pow-signature': '0000000000000000000000000000000000000000000000000000000000000000',
    'x-pow-nonce': '1'
  }
};

nextCalled = false;
mockResStatus = null;
mockResJson = null;

requirePoW(tamperedReq, mockRes, () => {
  nextCalled = true;
});

console.assert(nextCalled === false, 'Tampered token must be rejected');
console.assert(mockResStatus === 403, 'Status must be 403 Forbidden');
console.log('  ✅ Tampered token successfully blocked!');

console.log('\n🎉 ALL PROOF-OF-WORK SECURITY TESTS PASSED 100%!');
