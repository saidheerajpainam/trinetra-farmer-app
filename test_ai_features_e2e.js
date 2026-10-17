// ==============================================================================
// TRINETRA DRONES & ROBOTICS - COMPREHENSIVE AI & TELEMETRY TEST SUITE (12 FEATURES)
// Tests Telemetry Math, Anomaly Detection, AI Endpoints, Safety Barriers & Disclaimers
// ==============================================================================

const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const BASE_URL = 'http://localhost:8088';
const DB_PATH = path.join(__dirname, 'trinetra.db');

async function runAllTests() {
  console.log('========================================================================');
  console.log('🧪 TRINETRA 12-FEATURE INTELLIGENT PLATFORM E2E VERIFICATION SUITE');
  console.log('========================================================================');

  let passed = 0;
  let failed = 0;

  async function test(title, fn) {
    try {
      process.stdout.write(`Testing: ${title.padEnd(58)} ... `);
      await fn();
      console.log('PASSED ✅');
      passed++;
    } catch (err) {
      console.log('FAILED ❌');
      console.error('   Error:', err.message);
      failed++;
    }
  }

  // 1. Health & Database Table Count (All 16 tables)
  await test('1. GET /api/health verifies all 16 tables present', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'online');
    const expected = [
      'users', 'farmers', 'farms', 'pilots', 'services', 'bookings',
      'otp_verifications', 'notifications', 'booking_status_history', 'sessions',
      'drones', 'drone_telemetry', 'crop_health_analyses', 'drone_maintenance_logs',
      'ai_operational_reports', 'ai_recommendations'
    ];
    for (const t of expected) {
      assert(t in data.tableCounts, `Table ${t} missing from tableCounts`);
    }
  });

  // 2. Feature 1: AI Admin Assistant
  await test('2. POST /api/ai/admin-assistant answers grounded facts (EN & TE)', async () => {
    // English query
    const resEn = await fetch(`${BASE_URL}/api/ai/admin-assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'How many bookings and revenue today?', language: 'en' })
    });
    assert.strictEqual(resEn.status, 200);
    const dataEn = await resEn.json();
    assert.strictEqual(dataEn.success, true);
    assert(dataEn.answer && dataEn.answer.length > 20);
    assert(dataEn.groundedFacts, 'Grounded facts must be present');

    // Telugu query
    const resTe = await fetch(`${BASE_URL}/api/ai/admin-assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'డ్రోన్ల లభ్యత ఎలా ఉంది?', language: 'te' })
    });
    assert.strictEqual(resTe.status, 200);
    const dataTe = await resTe.json();
    assert.strictEqual(dataTe.success, true);
    assert(dataTe.answer && dataTe.answer.includes('డ్రోన్'));
  });

  // 3. Feature 2: AI Acreage Analytics & Telemetry Calculation Math
  await test('3. GET /api/telemetry/analytics/:id computes verified vs estimated', async () => {
    const res = await fetch(`${BASE_URL}/api/telemetry/analytics/1`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    const analytics = data.analytics;
    assert(analytics.measurements, 'Measurements object must be present');
    assert.strictEqual(analytics.measurements.targetAcres, 5.0);
    assert(analytics.measurements.verifiedSprayedAcres >= 0);
    assert(analytics.measurements.remainingAcres >= 0);
    assert(analytics.measurements.coveragePercentage >= 0 && analytics.measurements.coveragePercentage <= 100);
    assert(analytics.aiEstimates, 'AI Estimates must be separated from measurements');
    assert(analytics.aiEstimates.notice_en.includes('verified from GPS telemetry'));
  });

  // 4. Feature 3: AI Flight Monitoring Anomaly Detection
  await test('4. POST /api/ai/flight-monitoring flags low battery & speed drift', async () => {
    // Critical battery test
    const lowBattRes = await fetch(`${BASE_URL}/api/ai/flight-monitoring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        droneCode: 'AP-07',
        battery_percent: 18.0,
        battery_voltage: 21.2,
        ground_speed_kmh: 18.0,
        spray_active: true,
        satellites: 14,
        hdop: 0.8
      })
    });
    assert.strictEqual(lowBattRes.status, 200);
    const lowBattData = await lowBattRes.json();
    assert.strictEqual(lowBattData.flightSafetyPassed, false);
    assert(lowBattData.anomalies.some(a => a.type === 'LOW_BATTERY_WARNING'));

    // Speed drift test (>25 km/h)
    const speedRes = await fetch(`${BASE_URL}/api/ai/flight-monitoring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        droneCode: 'AP-07',
        battery_percent: 85.0,
        battery_voltage: 23.0,
        ground_speed_kmh: 28.5,
        spray_active: true,
        satellites: 14,
        hdop: 0.8
      })
    });
    const speedData = await speedRes.json();
    assert(speedData.anomalies.some(a => a.type === 'SPRAY_DRIFT_SPEED_WARNING'));
  });

  // 5. Feature 4: AI Crop Health Analysis & Mandatory Disclaimer
  await test('5. POST /api/ai/crop-health enforces mandatory medical/agri disclaimer', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/crop-health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmerId: 1,
        cropType: 'paddy',
        imageUrl: 'assets/samples/crop_paddy_blast.jpg'
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert(data.detectedCondition_en.includes('Blast'));
    assert(data.disclaimer, 'Disclaimer object must be present');
    assert(data.disclaimer.en.includes('Preliminary AI guidance only'));
    assert(data.disclaimer.te.includes('ప్రాథమిక AI పరిశీలన మాత్రమే'));
    assert.strictEqual(data.isPreliminary, true);
  });

  // 6. Feature 5: AI Booking Assistant (Conversational Telugu & English)
  await test('6. POST /api/ai/booking-assistant calculates pricing & checks status', async () => {
    // Price inquiry
    const priceRes = await fetch(`${BASE_URL}/api/ai/booking-assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'ధరలు ఎంత?', language: 'te' })
    });
    assert.strictEqual(priceRes.status, 200);
    const priceData = await priceRes.json();
    assert(priceData.response_te.includes('450'));

    // Booking draft calculation
    const draftRes = await fetch(`${BASE_URL}/api/ai/booking-assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'I want to spray 10 acres of cotton', language: 'en' })
    });
    assert.strictEqual(draftRes.status, 200);
    const draftData = await draftRes.json();
    assert.strictEqual(draftData.parsedAcres, 10);
    assert.strictEqual(draftData.totalEstimate, 4500);

    // Status check
    const statusRes = await fetch(`${BASE_URL}/api/ai/booking-assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'What is status of TRN-2026-881?', language: 'en' })
    });
    assert.strictEqual(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.strictEqual(statusData.intent, 'CHECK_STATUS');
  });

  // 7. Feature 6: AI Scheduling Recommendation & Human Review Tag
  await test('7. POST /api/ai/schedule-recommend requires human review', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/schedule-recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fieldLocation: 'Kankipadu', targetDate: '2026-10-15', acreage: 5.0 })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.humanReviewRequired, true);
    assert(data.recommendedSlot.window.includes('AM'));
    assert(data.recommendationId > 0);
  });

  // 8. Feature 7: AI Reports Generation (Daily & Monthly)
  await test('8. POST /api/ai/reports/generate creates report with verified acres', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/reports/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportType: 'daily', reportDate: '2026-10-13' })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.report.total_verified_acres, 148.5);
    assert(data.report.ai_summary_en.length > 20);
  });

  // 9. Feature 8: AI Maintenance Prediction (LiPo battery & motor hours)
  await test('9. POST /api/ai/maintenance-predict identifies drone inspection flags', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/maintenance-predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert(data.drones && data.drones.length >= 4);
    const ap09 = data.drones.find(d => d.droneCode === 'AP-09');
    assert(ap09, 'AP-09 must exist in fleet');
    assert.strictEqual(ap09.healthStatus, 'needs_inspection');
    assert(ap09.issues.some(i => i.component.includes('Battery')));
  });

  // 10. Feature 9: AI Notifications Center
  await test('10. GET /api/ai/notifications returns notification stream', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/notifications`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert(Array.isArray(data.notifications));
  });

  // 11. Feature 10: AI Business Insights
  await test('11. GET /api/ai/business-insights clusters regional village demand', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/business-insights`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert(data.insights.demandHotspots.length >= 3);
    assert(data.insights.demandHotspots.some(h => h.village === 'Kankipadu'));
  });

  // 12. Feature 11: Voice Assistant Intent Parsing (Telugu & English)
  await test('12. POST /api/ai/voice-intent parses spoken Telugu and English', async () => {
    const resTe = await fetch(`${BASE_URL}/api/ai/voice-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: 'నా బుకింగ్ ఎలా ఉంది', language: 'te' })
    });
    assert.strictEqual(resTe.status, 200);
    const dataTe = await resTe.json();
    assert.strictEqual(dataTe.intent, 'CHECK_STATUS');
    assert(dataTe.spokenReply_te.includes('TRN-2026-881'));

    const resEn = await fetch(`${BASE_URL}/api/ai/voice-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: 'What is the price per acre', language: 'en' })
    });
    assert.strictEqual(resEn.status, 200);
    const dataEn = await resEn.json();
    assert.strictEqual(dataEn.intent, 'PRICING_INFO');
  });

  // 13. Feature 12: Smart Admin Dashboard Summary
  await test('13. GET /api/ai/dashboard-summary delivers unified KPI telemetry card', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/dashboard-summary`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert(data.operationalHealthScore > 90);
    assert.strictEqual(data.verifiedAcreageProgress.verifiedAcres, 148.5);
    assert(data.activeDrones.length >= 4);
  });

  // 14. Safety Barrier Verification: Strictly No Autonomous Flight Commands
  await test('14. Safety Barrier: Zero autonomous flight command APIs exposed', async () => {
    // Attempting to send flight controls or actuator triggers should return 404 or reject
    const testEndpoints = [
      '/api/drone/takeoff',
      '/api/drone/spray-valve/override',
      '/api/drone/fly-to'
    ];
    for (const ep of testEndpoints) {
      const res = await fetch(`${BASE_URL}${ep}`, { method: 'POST' });
      // Should be 404 or handled as static/not allowed
      assert(res.status === 404 || res.status === 405, `Autonomous flight endpoint ${ep} must NOT exist`);
    }
  });

  console.log('========================================================================');
  console.log(`🏁 TEST RESULTS: ${passed} Passed, ${failed} Failed out of ${passed + failed} Tests`);
  console.log('========================================================================');
  if (failed > 0) process.exit(1);
}

runAllTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
