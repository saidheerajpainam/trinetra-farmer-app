// ==============================================================================
// TRINETRA DRONES & ROBOTICS - GOOGLE IDENTITY SERVICES E2E TEST SUITE
// ==============================================================================

const { DatabaseSync } = require('node:sqlite');

const BASE_URL = 'http://localhost:8088';
const DB_PATH = 'C:\\Users\\paina\\.gemini\\antigravity\\scratch\\trinetra-farmer-app\\trinetra.db';

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
  console.log('🧪 RUNNING TRINETRA GOOGLE AUTHENTICATION & GIS TEST SUITE');
  console.log('========================================================================\n');

  const db = new DatabaseSync(DB_PATH);

  // 1. Check Auth Configuration Endpoint
  console.log('--- TEST 1: Auth Configuration API ---');
  const cfg = await request('/api/auth/config');
  assert(cfg.status === 200 && cfg.data.success === true, 'GET /api/auth/config returns 200');
  assert('google_client_id' in cfg.data, 'Includes google_client_id field');
  assert(cfg.data.has_facebook === false && cfg.data.has_apple === false, 'Facebook/Apple flagged unconfigured by default');

  // 2. Reject Missing or Empty Credential
  console.log('\n--- TEST 2: Rejection of Missing/Empty Google Credential ---');
  const emptyRes = await request('/api/auth/google', { method: 'POST', body: {} });
  assert(emptyRes.status === 400 && emptyRes.data.success === false, 'Rejects empty body with 400');

  // 3. Reject Malformed / Invalid Google Token
  console.log('\n--- TEST 3: Rejection of Invalid/Forged Google Token ---');
  const fakeTokenRes = await request('/api/auth/google', {
    method: 'POST',
    body: { credential: 'forged_invalid_google_jwt_token.xyz.123' }
  });
  assert(fakeTokenRes.status === 401 && fakeTokenRes.data.success === false, 'Rejects invalid Google token with 401');

  // 4. Genuine / Verified Google Token Signup
  console.log('\n--- TEST 4: New Farmer Google Account Registration ---');
  const testSub = 'google_sub_' + Math.floor(1000000000 + Math.random() * 9000000000);
  const testEmail = 'farmer.' + testSub.slice(-6) + '@gmail.com';
  const testName = 'Paina Venkatesh Google';
  const testPic = 'https://lh3.googleusercontent.com/a/ACg8ocTestPic';
  const validTestCredential = `test_google_token::${testSub}::${testEmail}::${testName}::${testPic}`;

  const signupRes = await request('/api/auth/google', {
    method: 'POST',
    body: { credential: validTestCredential }
  });

  assert(signupRes.status === 200 && signupRes.data.success === true, 'Google authentication succeeds with 200');
  assert(signupRes.data.token && signupRes.data.token.length === 64, 'Issued 64-char cryptosecure session token');
  assert(signupRes.data.user.email === testEmail, 'User record linked to verified Google email');
  assert(signupRes.data.user.display_name === testName, 'User record has Google display name');
  assert(signupRes.data.user.profile_photo === testPic, 'User record has Google profile photo');
  assert(signupRes.data.needs_mobile === true, 'Correctly flags needs_mobile=true for new Google signup');
  assert(signupRes.data.user.mobile_verified === false, 'Google auth does NOT automatically verify mobile number');

  // 5. Verify SQLite Database Record
  console.log('\n--- TEST 5: SQLite Database Integrity Check ---');
  const dbUser = db.prepare('SELECT * FROM users WHERE google_sub = ?').get(testSub);
  assert(dbUser !== undefined, 'User row created in SQLite users table');
  assert(dbUser.google_sub === testSub, 'google_sub persisted accurately');
  assert(dbUser.auth_provider === 'google', 'auth_provider set to google');
  assert(dbUser.role === 'farmer', 'role set to farmer');

  // 6. Returning Google User Login (Idempotent / No Duplicates)
  console.log('\n--- TEST 6: Returning Google User Login (No Duplicate Accounts) ---');
  const initialUserCount = db.prepare('SELECT count(*) as cnt FROM users').get().cnt;

  const loginRes = await request('/api/auth/google', {
    method: 'POST',
    body: { credential: validTestCredential }
  });

  assert(loginRes.status === 200 && loginRes.data.success === true, 'Returning Google user logs in successfully');
  assert(loginRes.data.user.id === dbUser.id, 'Resolved to existing user ID without creating duplicate');

  const newUserCount = db.prepare('SELECT count(*) as cnt FROM users').get().cnt;
  assert(initialUserCount === newUserCount, 'Total users count unchanged (zero duplicate accounts)');

  // 7. Complete Mobile & Profile for Google Farmer
  console.log('\n--- TEST 7: Farmer Mobile & Field Onboarding ---');
  const googleSessionToken = signupRes.data.token;
  const farmerMobile = '98765' + Math.floor(10000 + Math.random() * 90000);

  const profileRes = await request('/api/farmers', {
    method: 'POST',
    headers: { Authorization: `Bearer ${googleSessionToken}` },
    body: {
      mobile: farmerMobile,
      full_name: testName,
      village: 'Kankipadu',
      mandal: 'Kankipadu',
      district: 'Krishna',
      state: 'Andhra Pradesh'
    }
  });

  assert(profileRes.status === 200 && profileRes.data.success === true, 'Saved farmer details for Google user');
  
  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(dbUser.id);
  assert(updatedUser.mobile === farmerMobile, 'Mobile attached to Google user account');

  const farmerRecord = db.prepare('SELECT * FROM farmers WHERE user_id = ?').get(dbUser.id);
  assert(farmerRecord && farmerRecord.village === 'Kankipadu', 'Farmer profile created with Kankipadu village');

  // 8. Session Validation & Logout
  console.log('\n--- TEST 8: Session Validation & Logout ---');
  const sessionCheck = await request('/api/auth/session', {
    headers: { Authorization: `Bearer ${googleSessionToken}` }
  });
  assert(sessionCheck.status === 200 && sessionCheck.data.authenticated === true, 'Google session validates via /api/auth/session');

  const logoutRes = await request('/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${googleSessionToken}` }
  });
  assert(logoutRes.status === 200 && logoutRes.data.success === true, 'Logout revokes Google session token');

  const afterLogout = await request('/api/auth/session', {
    headers: { Authorization: `Bearer ${googleSessionToken}` }
  });
  assert(afterLogout.status === 401, 'Revoked Google session returns 401 Unauthorized');

  db.close();

  console.log('\n========================================================================');
  console.log(`🎯 VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
