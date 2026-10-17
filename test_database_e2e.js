const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const path = require('path');

const BASE_URL = 'http://localhost:8088';
const DB_PATH = 'C:\\Users\\paina\\.gemini\\antigravity\\scratch\\trinetra-farmer-app\\trinetra.db';
const OTP_SALT = process.env.OTP_SALT || 'trinetra_secure_otp_salt_2026';

async function runTests() {
  console.log('========================================================================');
  console.log('🧪 TRINETRA SQLITE DATABASE & REST API END-TO-END VERIFICATION SUITE');
  console.log('========================================================================');
  console.log('Target Server:', BASE_URL);
  console.log('Target SQLite DB:', DB_PATH);

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      process.stdout.write('Testing: ' + name.padEnd(55) + ' ... ');
      await fn();
      console.log('PASSED ✅');
      passed++;
    } catch (err) {
      console.log('FAILED ❌');
      console.error('   Error:', err.message);
      failed++;
    }
  }

  // 1. Health check & table counts
  await test('1. GET /api/health returns online status and all 10 tables', async () => {
    const res = await fetch(BASE_URL + '/api/health');
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'online');
    assert.strictEqual(data.database, 'SQLite (node:sqlite)');
    const expectedTables = ['users', 'farmers', 'farms', 'pilots', 'services', 'bookings', 'otp_verifications', 'notifications', 'booking_status_history', 'sessions'];
    for (const t of expectedTables) {
      assert(t in data.tableCounts, 'Table ' + t + ' missing in health check');
    }
  });

  // 2. OTP Generation & Hashing (Zero plaintext OTP exposed or saved)
  const testMobile = '9502051939';
  await test('2. POST /api/auth/send-otp stores SHA-256 hash only (No plaintext)', async () => {
    const res = await fetch(BASE_URL + '/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: testMobile })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    if (process.env.NODE_ENV === 'production') assert.strictEqual(data.dev_otp, undefined, 'Plaintext OTP must NOT be exposed in production');
    assert(data.delivery_status, 'Delivery status must be returned');

    // Verify directly in SQLite that plaintext OTP is NOT stored
    const db = new DatabaseSync(DB_PATH);
    const row = db.prepare('SELECT * FROM otp_verifications WHERE mobile = ? ORDER BY id DESC LIMIT 1').get(testMobile);
    db.close();

    assert(row, 'OTP record not found in SQLite table');
    assert.strictEqual(row.mobile, testMobile);
    assert.strictEqual(row.otp_hash.length, 64, 'otp_hash must be a 64-char SHA-256 hex string');
    assert(!('otp' in row), 'Table must not contain plaintext otp column');
  });

  // 3. OTP Verification & User Creation
  let sessionToken = null;
  let testUserId = null;
  const testCode = '654321';
  await test('3. POST /api/auth/verify-otp validates hash & creates user', async () => {
    // Insert deterministic test OTP for verification test
    const db = new DatabaseSync(DB_PATH);
    const testHash = crypto.createHash('sha256').update(testCode + OTP_SALT).digest('hex');
    const exp = new Date(Date.now() + 300 * 1000).toISOString();
    db.prepare('UPDATE otp_verifications SET is_consumed = 1 WHERE mobile = ?').run(testMobile);
    db.prepare(`
      INSERT INTO otp_verifications (mobile, otp_hash, expires_at, attempts, max_attempts, is_consumed, delivery_status)
      VALUES (?, ?, ?, 0, 5, 0, 'mock_delivered')
    `).run(testMobile, testHash, exp);
    db.close();

    const res = await fetch(BASE_URL + '/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: testMobile, otp: testCode })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert(data.token, 'Session token missing');
    sessionToken = data.token;
    assert.strictEqual(data.user.mobile, testMobile);
    testUserId = data.user.id;
  });

  // 4. Farmer Registration & Profile Updates
  let testFarmerId = null;
  await test('4. POST /api/farmers creates farmer & linked farm', async () => {
    const res = await fetch(BASE_URL + '/api/farmers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sessionToken },
      body: JSON.stringify({
        mobile: testMobile,
        full_name: 'Paina Venkatesh',
        village: 'Gannavaram',
        mandal: 'Gannavaram',
        district: 'Krishna',
        state: 'Andhra Pradesh'
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.full_name, 'Paina Venkatesh');
    testFarmerId = data.data.id;

    // Check farmer and farm in SQLite
    const db = new DatabaseSync(DB_PATH);
    const farmerRow = db.prepare('SELECT * FROM farmers WHERE id = ?').get(testFarmerId);
    assert(farmerRow.user_id, 'Foreign key user_id must exist');
    const farmRow = db.prepare('SELECT * FROM farms WHERE farmer_id = ? LIMIT 1').get(testFarmerId);
    assert(farmRow, 'Default farm not created for farmer');
    assert.strictEqual(farmRow.village, 'Gannavaram');
    db.close();
  });

  // 5. Query Services & Pilots
  let serviceId = null;
  let pilotId = null;
  await test('5. GET /api/services and GET /api/pilots return valid catalogs', async () => {
    const resSrv = await fetch(BASE_URL + '/api/services');
    assert.strictEqual(resSrv.status, 200);
    const dataSrv = await resSrv.json();
    assert(dataSrv.data.length >= 4, 'Expected at least 4 active drone spraying services');
    serviceId = dataSrv.data[0].id;

    const resPilot = await fetch(BASE_URL + '/api/pilots');
    assert.strictEqual(resPilot.status, 200);
    const dataPilot = await resPilot.json();
    assert(dataPilot.data.length >= 1, 'Expected at least 1 pilot');
    pilotId = dataPilot.data[0].id;
  });

  // 6. Create Booking & verify Status History & Notification
  let bookingId = null;
  let bookingCode = null;
  await test('6. POST /api/bookings creates booking, status history & notification', async () => {
    const res = await fetch(BASE_URL + '/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmer_id: testFarmerId,
        mobile: testMobile,
        service_id: serviceId,
        crop_type: 'Paddy',
        area_acres: 5.0,
        village: 'Gannavaram',
        district: 'Krishna',
        preferred_date: '2026-10-15',
        farmer_notes: 'Urgent pest control spraying'
      })
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert(data.data.booking_code, 'Booking code missing');
    bookingId = data.data.id;
    bookingCode = data.data.booking_code;

    // Verify in SQLite
    const db = new DatabaseSync(DB_PATH);
    const bRow = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
    assert.strictEqual(bRow.status, 'pending');
    assert.strictEqual(bRow.estimated_amount, 2500);

    const historyRow = db.prepare('SELECT * FROM booking_status_history WHERE booking_id = ?').get(bookingId);
    assert(historyRow, 'Audit history record missing');
    assert.strictEqual(historyRow.new_status, 'pending');

    const notifRow = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(testUserId);
    assert(notifRow, 'User notification not generated');
    db.close();
  });

  // 7. Update Status (Lifecycle Transition)
  await test('7. PATCH /api/bookings/:id/status updates status, audit log & settlement', async () => {
    const res = await fetch(BASE_URL + '/api/bookings/' + bookingId + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'completed',
        pilot_id: pilotId,
        notes: 'Spraying successfully completed by pilot Ramesh Kumar'
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.status, 'completed');
    assert.strictEqual(data.data.payment_status, 'paid');

    const db = new DatabaseSync(DB_PATH);
    const historyRows = db.prepare('SELECT * FROM booking_status_history WHERE booking_id = ? ORDER BY id ASC').all(bookingId);
    assert(historyRows.length >= 2, 'Expected status transitions in history');
    assert.strictEqual(historyRows[historyRows.length - 1].new_status, 'completed');
    db.close();
  });

  // 8. Foreign Key Constraint Enforcement
  await test('8. Foreign Key constraint blocks orphan booking insertion', async () => {
    const db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA foreign_keys = ON;');
    let blocked = false;
    try {
      db.prepare(`
        INSERT INTO bookings (
          booking_code, farmer_id, service_id, crop_type, area_acres,
          village, mandal, district, estimated_amount
        ) VALUES ('ORPHAN-001', 999999, 1, 'Chilli', 2.0, 'Nowhere', 'Nowhere', 'Nowhere', 1000)
      `).run();
    } catch (err) {
      if (err.message.includes('FOREIGN KEY')) {
        blocked = true;
      }
    }
    db.close();
    assert(blocked, 'Foreign key constraint did not block orphan insertion');
  });

  // 9. Database Explorer API
  await test('9. GET /api/db/tables & /api/db/table/:name returns SQL inspection grid', async () => {
    const resTables = await fetch(BASE_URL + '/api/db/tables');
    assert.strictEqual(resTables.status, 200);
    const dataTables = await resTables.json();
    assert(dataTables.tables.includes('bookings'));

    const resGrid = await fetch(BASE_URL + '/api/db/table/bookings');
    assert.strictEqual(resGrid.status, 200);
    const dataGrid = await resGrid.json();
    assert(dataGrid.columns.length > 5);
    assert(dataGrid.rows.length > 0);
  });

  console.log('========================================================================');
  console.log(`🎯 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
