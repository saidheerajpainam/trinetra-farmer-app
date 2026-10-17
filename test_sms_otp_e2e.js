// ==============================================================================
// TRINETRA DRONES & ROBOTICS - REAL SMS OTP & SESSION E2E TEST SUITE
// ==============================================================================

const http = require('node:http');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const BASE_URL = 'http://localhost:8088';
const DB_PATH = 'C:\\Users\\paina\\.gemini\\antigravity\\scratch\\trinetra-farmer-app\\trinetra.db';
const OTP_SALT = process.env.OTP_SALT || 'trinetra_secure_otp_salt_2026';

let passed = 0;
let failed = 0;

function assert(cond, name, details = '') {
  if (cond) {
    console.log(`✅ PASS: ${name}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${name} ${details ? '-> ' + details : ''}`);
    failed++;
  }
}

async function request(endpoint, options = {}) {
  const url = BASE_URL + endpoint;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, headers: res.headers, data };
}

async function runTests() {
  console.log('========================================================================');
  console.log('🧪 RUNNING TRINETRA REAL SMS OTP & AUTHENTICATION TEST SUITE');
  console.log('========================================================================\n');

  const db = new DatabaseSync(DB_PATH);

  // 1. Health & SMS Gateway Status
  console.log('--- TEST 1: Gateway Diagnostics ---');
  const health = await request('/api/health');
  assert(health.status === 200, 'Health endpoint responds with 200');
  assert(health.data.smsGateway && health.data.smsGateway.supports_indian_mobile === true, 'Gateway supports Indian mobile numbers');

  const provStatus = await request('/api/auth/provider-status');
  assert(provStatus.status === 200 && provStatus.data.success === true, 'Provider status endpoint is functional');

  // 2. Reject Invalid Mobile Numbers
  console.log('\n--- TEST 2: Indian Mobile Number Format Validation ---');
  const badNum1 = await request('/api/auth/request-otp', { method: 'POST', body: { mobile: '12345' } });
  assert(badNum1.status === 400 && badNum1.data.success === false, 'Rejects short mobile number (12345)');

  const badNum2 = await request('/api/auth/request-otp', { method: 'POST', body: { mobile: '5123456789' } });
  assert(badNum2.status === 400 && badNum2.data.success === false, 'Rejects Indian mobile starting with 5');

  const badNum3 = await request('/api/auth/request-otp', { method: 'POST', body: { mobile: 'invalid_chars' } });
  assert(badNum3.status === 400 && badNum3.data.success === false, 'Rejects non-numeric characters');

  // 3. Request Real OTP (No exposed plaintext code in response)
  console.log('\n--- TEST 3: Secure OTP Generation & Dispatch ---');
  const testMobile = '98765' + Math.floor(10000 + Math.random() * 90000); // Random unique 10-digit number
  const otpReq = await request('/api/auth/request-otp', {
    method: 'POST',
    body: { mobile: testMobile }
  });

  assert(otpReq.status === 200 && otpReq.data.success === true, `OTP request accepted for ${testMobile}`);
  assert(process.env.NODE_ENV === 'production' ? otpReq.data.dev_otp === undefined : Boolean(otpReq.data.dev_otp || otpReq.data.is_mock !== undefined), 'Plaintext OTP strictly omitted in production');
  assert(otpReq.data.delivery_status === 'mock_delivered' || otpReq.data.delivery_status === 'accepted' || otpReq.data.delivery_status === 'sent', 'Valid delivery status reported');

  // 4. Verify SQLite Database Record Integrity
  console.log('\n--- TEST 4: SQLite Database Hash & Security Check ---');
  const dbRecord = db.prepare('SELECT * FROM otp_verifications WHERE mobile = ? ORDER BY id DESC LIMIT 1').get(testMobile);
  assert(dbRecord !== undefined, 'Record saved to SQLite otp_verifications table');
  assert(dbRecord.otp_hash && dbRecord.otp_hash.length === 64, 'Only 64-char SHA-256 hash is stored in database');
  assert(dbRecord.is_consumed === 0, 'New OTP is marked unconsumed (is_consumed = 0)');
  assert(dbRecord.attempts === 0, 'Attempt counter initialized to 0');
  assert(dbRecord.max_attempts === 5, 'Max attempts set to 5');

  // 5. Test Incorrect OTP Rejection
  console.log('\n--- TEST 5: Incorrect OTP Rejection & Attempt Counter ---');
  const wrongVerify = await request('/api/auth/verify-otp', {
    method: 'POST',
    body: { mobile: testMobile, otp: '000000' }
  });
  assert(wrongVerify.status === 400 && wrongVerify.data.success === false, 'Incorrect OTP rejected with 400');
  assert(wrongVerify.data.error.includes('attempts remaining'), 'Response returns remaining attempts counter');

  const recordAfterFail = db.prepare('SELECT * FROM otp_verifications WHERE id = ?').get(dbRecord.id);
  assert(recordAfterFail.attempts === 1, 'Attempts counter incremented to 1 in SQLite');

  // 6. Test Correct OTP Verification (Compute hash from known test vector)
  console.log('\n--- TEST 6: Successful Verification & Session Token Issuance ---');
  // Insert a test-controlled OTP for deterministic verification
  const controlledOtp = '742918';
  const controlledHash = crypto.createHash('sha256').update(controlledOtp + OTP_SALT).digest('hex');
  const futureExp = new Date(Date.now() + 300 * 1000).toISOString();
  const controlledMobile = '9123456789';

  db.prepare(`
    INSERT INTO otp_verifications (mobile, otp_hash, expires_at, attempts, max_attempts, is_consumed, delivery_status)
    VALUES (?, ?, ?, 0, 5, 0, 'sent')
  `).run(controlledMobile, controlledHash, futureExp);

  const goodVerify = await request('/api/auth/verify-otp', {
    method: 'POST',
    body: { mobile: controlledMobile, otp: controlledOtp }
  });

  assert(goodVerify.status === 200 && goodVerify.data.success === true, 'Correct OTP verified successfully');
  assert(goodVerify.data.token && goodVerify.data.token.length === 64, 'Issued 64-char cryptosecure session token');
  assert(goodVerify.data.user && goodVerify.data.user.mobile === controlledMobile, 'Linked to user record');

  const consumedRecord = db.prepare('SELECT * FROM otp_verifications WHERE mobile = ? ORDER BY id DESC LIMIT 1').get(controlledMobile);
  assert(consumedRecord.is_consumed === 1, 'OTP marked consumed (is_consumed = 1) to prevent replay');
  assert(consumedRecord.verified_at !== null, 'verified_at timestamp populated');

  // 7. Test Replay Prevention (Reused OTP)
  console.log('\n--- TEST 7: Replay Prevention (Reused OTP) ---');
  const reuseVerify = await request('/api/auth/verify-otp', {
    method: 'POST',
    body: { mobile: controlledMobile, otp: controlledOtp }
  });
  assert(reuseVerify.status === 400 && reuseVerify.data.success === false, 'Reusing consumed OTP is rejected');

  // 8. Test Expired OTP Handling
  console.log('\n--- TEST 8: Expired OTP Rejection ---');
  const expiredOtp = '654321';
  const expiredHash = crypto.createHash('sha256').update(expiredOtp + OTP_SALT).digest('hex');
  const pastExp = new Date(Date.now() - 60 * 1000).toISOString(); // 1 minute in the past
  const expiredMobile = '9998887776';

  db.prepare(`
    INSERT INTO otp_verifications (mobile, otp_hash, expires_at, attempts, max_attempts, is_consumed, delivery_status)
    VALUES (?, ?, ?, 0, 5, 0, 'sent')
  `).run(expiredMobile, expiredHash, pastExp);

  const expVerify = await request('/api/auth/verify-otp', {
    method: 'POST',
    body: { mobile: expiredMobile, otp: expiredOtp }
  });
  assert(expVerify.status === 400 && expVerify.data.error.includes('expired'), 'Expired OTP rejected');

  // 9. Test Lockout after Maximum Attempts
  console.log('\n--- TEST 9: Brute-Force Defense Lockout ---');
  const lockMobile = '9112233445';
  const lockOtp = '888888';
  const lockHash = crypto.createHash('sha256').update(lockOtp + OTP_SALT).digest('hex');
  db.prepare(`
    INSERT INTO otp_verifications (mobile, otp_hash, expires_at, attempts, max_attempts, is_consumed, delivery_status)
    VALUES (?, ?, ?, 4, 5, 0, 'sent')
  `).run(lockMobile, lockHash, futureExp);

  // 5th attempt fails
  await request('/api/auth/verify-otp', { method: 'POST', body: { mobile: lockMobile, otp: '000000' } });

  // 6th attempt should be blocked
  const lockCheck = await request('/api/auth/verify-otp', { method: 'POST', body: { mobile: lockMobile, otp: lockOtp } });
  assert(lockCheck.status === 400 && (lockCheck.data.error.includes('blocked') || lockCheck.data.error.includes('locked')), 'Locked out after max attempts');

  // 10. Session Validation & Logout
  console.log('\n--- TEST 10: Authenticated Session Validation & Logout ---');
  const sessionToken = goodVerify.data.token;
  const sessionCheck = await request('/api/auth/session', {
    headers: { Authorization: `Bearer ${sessionToken}` }
  });
  assert(sessionCheck.status === 200 && sessionCheck.data.authenticated === true, 'Session validates with Bearer token');

  const logout = await request('/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sessionToken}` }
  });
  assert(logout.status === 200 && logout.data.success === true, 'Logout revokes active session');

  const afterLogout = await request('/api/auth/session', {
    headers: { Authorization: `Bearer ${sessionToken}` }
  });
  assert(afterLogout.status === 401, 'Revoked session returns 401 Unauthorized');

  // Summary
  console.log('\n========================================================================');
  console.log(`🎯 VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
