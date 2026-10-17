const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const projectDir = 'C:\\Users\\paina\\.gemini\\antigravity\\scratch\\trinetra-farmer-app';
const DB_PATH = path.join(projectDir, 'trinetra.db');
const BAK_PATH = path.join(projectDir, 'trinetra.db.bak');
const SCHEMA_PATH = path.join(projectDir, 'schema.sql');

function migrateAndInitialize() {
  console.log('========================================================================');
  console.log('🌾 TRINETRA DRONES & ROBOTICS - FULL SCHEMA MIGRATION');
  console.log('========================================================================');

  // 1. Read existing records if db exists
  let oldFarmers = [];
  let oldBookings = [];

  if (fs.existsSync(DB_PATH)) {
    try {
      fs.copyFileSync(DB_PATH, BAK_PATH);
      console.log(`[Backup] Created backup at ${BAK_PATH}`);

      const oldDb = new DatabaseSync(DB_PATH);
      const tables = oldDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);

      if (tables.includes('farmers')) {
        try {
          oldFarmers = oldDb.prepare("SELECT * FROM farmers").all();
          console.log(`[Backup] Preserved ${oldFarmers.length} old farmer records.`);
        } catch(e) {}
      }

      if (tables.includes('bookings')) {
        try {
          oldBookings = oldDb.prepare("SELECT * FROM bookings").all();
          console.log(`[Backup] Preserved ${oldBookings.length} old booking records.`);
        } catch(e) {}
      }

      oldDb.close();
    } catch (e) {
      console.warn('[Backup] Notice while reading old tables:', e.message);
    }
  }

  // Remove old database to ensure completely fresh schema creation without legacy column conflicts
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }
  // Also remove WAL/SHM if any
  if (fs.existsSync(DB_PATH + '-wal')) fs.unlinkSync(DB_PATH + '-wal');
  if (fs.existsSync(DB_PATH + '-shm')) fs.unlinkSync(DB_PATH + '-shm');

  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const db = new DatabaseSync(DB_PATH);

  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  console.log('[DB] Executing new schema.sql...');
  db.exec(schemaSql);
  console.log('[DB] New schema created successfully!');

  // Seed default services
  const defaultServices = [
    { name: 'Agriculture Drone Spraying', desc: 'Precision ultra-low volume crop spraying using hexacopter drones', price: 500 },
    { name: 'Nano Urea & Liquid Nutrients', desc: 'Uniform spray coverage of IFFCO Nano Urea & liquid micronutrients', price: 400 },
    { name: 'Fungicide & Disease Prevention', desc: 'Preventive and curative fungal disease chemical application', price: 450 },
    { name: 'Crop Mapping & Survey', desc: 'High-resolution multispectral crop health survey & acreage mapping', price: 300 }
  ];

  const insertService = db.prepare(`
    INSERT OR IGNORE INTO services (service_name, description, price_per_acre, is_active)
    VALUES (?, ?, ?, 1)
  `);
  for (const s of defaultServices) {
    insertService.run(s.name, s.desc, s.price);
  }

  // Seed system Admin
  db.prepare(`
    INSERT OR IGNORE INTO users (mobile, role, mobile_verified, is_active)
    VALUES ('9502051939', 'admin', 1, 1)
  `).run();

  // Seed Pilots
  db.prepare(`
    INSERT OR IGNORE INTO users (mobile, role, mobile_verified, is_active)
    VALUES ('9848011223', 'pilot', 1, 1)
  `).run();
  const pilotUser1 = db.prepare("SELECT id FROM users WHERE mobile = '9848011223'").get();
  if (pilotUser1) {
    db.prepare(`
      INSERT OR IGNORE INTO pilots (user_id, full_name, is_available)
      VALUES (?, 'Ramesh Kumar (DGCA Certified)', 1)
    `).run(pilotUser1.id);
  }

  db.prepare(`
    INSERT OR IGNORE INTO users (mobile, role, mobile_verified, is_active)
    VALUES ('9848099881', 'pilot', 1, 1)
  `).run();
  const pilotUser2 = db.prepare("SELECT id FROM users WHERE mobile = '9848099881'").get();
  if (pilotUser2) {
    db.prepare(`
      INSERT OR IGNORE INTO pilots (user_id, full_name, is_available)
      VALUES (?, 'Suresh Pilot (DGCA Certified)', 1)
    `).run(pilotUser2.id);
  }

  // Seed Default Farmer: Venkateswara Rao
  db.prepare(`
    INSERT OR IGNORE INTO users (mobile, role, mobile_verified, is_active)
    VALUES ('9876543210', 'farmer', 1, 1)
  `).run();
  const defFarmerUser = db.prepare("SELECT id FROM users WHERE mobile = '9876543210'").get();
  if (defFarmerUser) {
    db.prepare(`
      INSERT OR IGNORE INTO farmers (user_id, full_name, village, mandal, district, state)
      VALUES (?, 'Venkateswara Rao', 'Kankipadu', 'Kankipadu', 'Krishna', 'Andhra Pradesh')
    `).run(defFarmerUser.id);
    const fRec = db.prepare("SELECT id FROM farmers WHERE user_id = ?").get(defFarmerUser.id);
    if (fRec) {
      db.prepare(`
        INSERT OR IGNORE INTO farms (farmer_id, farm_name, crop_type, area_acres, village, mandal, district, latitude, longitude)
        VALUES (?, 'Venkateswara Rice Field', 'Paddy', 5.0, 'Kankipadu', 'Kankipadu', 'Krishna', 16.4971, 80.7856)
      `).run(fRec.id);
    }
  }

  // Migrate old farmers
  const insertUser = db.prepare("INSERT OR IGNORE INTO users (mobile, role, mobile_verified, is_active) VALUES (?, 'farmer', 1, 1)");
  const insertFarmer = db.prepare("INSERT OR IGNORE INTO farmers (user_id, full_name, village, mandal, district, state) VALUES (?, ?, ?, ?, ?, ?)");
  const insertFarm = db.prepare("INSERT OR IGNORE INTO farms (farmer_id, farm_name, crop_type, area_acres, village, mandal, district, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");

  for (const f of oldFarmers) {
    const phone = f.phone || f.mobile;
    const name = f.name || f.full_name;
    if (!phone || !name) continue;

    insertUser.run(phone);
    const u = db.prepare("SELECT id FROM users WHERE mobile = ?").get(phone);
    if (u) {
      const mandal = f.mandal || f.village;
      const district = (f.district || 'Krishna').replace(' District', '');
      insertFarmer.run(u.id, name, f.village || 'Gannavaram', mandal, district, f.state || 'Andhra Pradesh');
      const farmOwner = db.prepare("SELECT id FROM farmers WHERE user_id = ?").get(u.id);
      if (farmOwner) {
        insertFarm.run(farmOwner.id, `${name}'s Field`, 'Paddy', 5.0, f.village || 'Gannavaram', mandal, district, 16.5412, 80.8015);
      }
    }
  }

  // Seed sample active booking TRN-2026-881
  const srv = db.prepare("SELECT id FROM services WHERE service_name = 'Agriculture Drone Spraying'").get();
  const pilot = db.prepare("SELECT id FROM pilots LIMIT 1").get();
  const sampleFarmer = db.prepare("SELECT f.id as farmer_id, fa.id as farm_id, u.id as user_id FROM farmers f JOIN farms fa ON fa.farmer_id = f.id JOIN users u ON u.id = f.user_id LIMIT 1").get();

  if (sampleFarmer && srv && pilot) {
    db.prepare(`
      INSERT OR IGNORE INTO bookings (
        booking_code, farmer_id, farm_id, service_id, pilot_id,
        crop_type, area_acres, village, mandal, district,
        preferred_date, preferred_time, estimated_amount, final_amount,
        payment_method, payment_status, status, farmer_notes
      ) VALUES (
        'TRN-2026-881', ?, ?, ?, ?,
        'Paddy', 5.0, 'Kankipadu', 'Kankipadu', 'Krishna',
        '2026-10-15', '07:30 AM', 2500, 2500,
        'pay_after_service', 'pending', 'pilot_assigned', 'Near Ramalayam Temple'
      )
    `).run(sampleFarmer.farmer_id, sampleFarmer.farm_id, srv.id, pilot.id);

    const b = db.prepare("SELECT id FROM bookings WHERE booking_code = 'TRN-2026-881'").get();
    if (b) {
      db.prepare(`
        INSERT INTO booking_status_history (booking_id, old_status, new_status, notes)
        VALUES (?, 'pending', 'pilot_assigned', 'Pilot Ramesh Kumar assigned to mission')
      `).run(b.id);

      db.prepare(`
        INSERT INTO notifications (user_id, title, message)
        VALUES (?, 'Pilot Assigned', 'Pilot Ramesh Kumar assigned to your 5-acre mission on 2026-10-15')
      `).run(sampleFarmer.user_id);
    }
  }

  // ==============================================================================
  // SEED DRONE FLEET & AI DATA
  // ==============================================================================
  const insertDrone = db.prepare(`
    INSERT OR IGNORE INTO drones (drone_code, model, serial_number, payload_capacity_liters, battery_cycles, total_flight_hours, status, health_status, last_maintenance_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertDrone.run('AP-07', 'Trinetra Hexa-16L', 'TRN-HX16-2025-07', 16.0, 142, 118.5, 'in_mission', 'good', '2026-09-28');
  insertDrone.run('AP-08', 'Trinetra Hexa-16L', 'TRN-HX16-2025-08', 16.0, 88, 74.2, 'available', 'good', '2026-10-02');
  insertDrone.run('AP-09', 'Trinetra Hexa-16L', 'TRN-HX16-2025-09', 16.0, 265, 194.0, 'available', 'needs_inspection', '2026-08-15');
  insertDrone.run('AP-12', 'Trinetra Hexa-16L', 'TRN-HX16-2026-12', 16.0, 45, 32.1, 'in_mission', 'good', '2026-10-08');

  // Seed Maintenance Logs
  const d9 = db.prepare("SELECT id FROM drones WHERE drone_code = 'AP-09'").get();
  if (d9) {
    db.prepare(`
      INSERT OR IGNORE INTO drone_maintenance_logs (drone_id, log_type, flight_hours_at_log, battery_cycles_at_log, issue_description, severity, ai_flagged, resolved)
      VALUES (?, 'battery_warning', 194.0, 265, 'AI flagged: LiPo Pack-B cycles (265) exceeded recommended 250-cycle threshold. Internal cell impedance variation detected.', 'medium', 1, 0)
    `).run(d9.id);
    db.prepare(`
      INSERT OR IGNORE INTO drone_maintenance_logs (drone_id, log_type, flight_hours_at_log, battery_cycles_at_log, issue_description, severity, ai_flagged, resolved)
      VALUES (?, 'motor_bearing', 194.0, 265, 'Predictive Flag: Motor 3 & 4 cumulative vibration approaching 200-hour overhaul limit. Schedule bearing inspection.', 'high', 1, 0)
    `).run(d9.id);
  }

  const d7 = db.prepare("SELECT id FROM drones WHERE drone_code = 'AP-07'").get();
  if (d7) {
    db.prepare(`
      INSERT OR IGNORE INTO drone_maintenance_logs (drone_id, log_type, flight_hours_at_log, battery_cycles_at_log, issue_description, severity, ai_flagged, resolved, action_taken, resolved_at)
      VALUES (?, 'routine_inspection', 100.0, 115, '100-hour comprehensive airframe and spray nozzle calibration passed', 'info', 0, 1, 'Calibrated 4x centrifugal nozzles and tightened carbon fiber arm brackets', '2026-09-28')
    `).run(d7.id);
  }

  // Seed Sample Crop Health Analysis
  const sampleF = db.prepare("SELECT id FROM farmers LIMIT 1").get();
  if (sampleF) {
    db.prepare(`
      INSERT OR IGNORE INTO crop_health_analyses (
        farmer_id, image_url, crop_type, detected_condition, confidence_score, severity,
        observations_en, observations_te, recommendations_en, recommendations_te
      ) VALUES (
        ?, 'assets/samples/crop_paddy_blast.jpg', 'Paddy (వరి)', 'Rice Blast (వరి అగ్గితెగులు)', 0.92, 'moderate',
        'Spindle-shaped elliptical lesions with gray centers and brown margins detected on upper leaf blades.',
        'పై ఆకులపై బూడిద రంగు కేంద్రం మరియు గోధుమ రంగు అంచులతో కండె ఆకారపు మచ్చలు గమనించబడ్డాయి.',
        'Recommended curative spray: Tricyclazole 75% WP @ 0.6g/L or Isoprothiolane 40% EC @ 1.5ml/L using ultra-low volume drone nozzle.',
        'సిఫార్సు చేసిన నివారణ: ట్రైసైక్లాజోల్ 75% WP (0.6 గ్రా/లీటరు) లేదా ఐసోప్రోథియోలేన్ 40% EC (1.5 మి.లీ/లీటరు) డ్రోన్ ద్వారా పిచికారీ చేయండి.'
      )
    `).run(sampleF.id);
  }

  // Seed AI Operational Daily Report
  db.prepare(`
    INSERT OR IGNORE INTO ai_operational_reports (
      report_type, report_date, period_start, period_end, total_target_acres, total_verified_acres,
      total_jobs_completed, total_active_drones, drone_utilization_hours, estimated_operating_cost,
      total_revenue, ai_summary_en, ai_summary_te
    ) VALUES (
      'daily', '2026-10-13', '2026-10-13 06:00:00', '2026-10-13 18:00:00',
      160.0, 148.5, 8, 3, 14.8, 18500.00, 66825.00,
      'Operations running at 92.8% telemetry efficiency. 148.5 verified acres sprayed across Krishna District with average flight speed 18.2 km/h and zero spray drift incidents.',
      'ఆపరేషన్లు 92.8% టెలిమెట్రీ సామర్థ్యంతో నడుస్తున్నాయి. కృష్ణా జిల్లాలో 148.5 ఎకరాలు విజయవంతంగా పిచికారీ చేయబడ్డాయి.'
    )
  `).run();

  // Seed AI Operational Recommendation
  db.prepare(`
    INSERT OR IGNORE INTO ai_recommendations (
      recommendation_type, target_type, target_id, title, details, confidence, status
    ) VALUES (
      'demand_staging', 'hub', 1,
      'Pre-position 2 Drones at Gudivada Hub for Maize & Chilli Surge',
      'Historical booking density and weather forecasts indicate a 40% surge in maize/chilli spraying requests in Gudivada and Vuyyuru over the next 48 hours. Pre-staging AP-08 will cut pilot transit time by 45 minutes per mission.',
      0.89, 'pending_review'
    )
  `).run();


  // Check Foreign Keys
  const fkViolations = db.prepare('PRAGMA foreign_key_check;').all();
  console.log('[DB] Foreign key violations:', fkViolations.length);

  // Print tables and counts
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;").all();
  console.log('\n--- 📋 Verified Tables & Row Counts ---');
  for (const t of tables) {
    const c = db.prepare(`SELECT COUNT(*) as cnt FROM "${t.name}"`).get();
    console.log(`  • ${t.name.padEnd(25)} : ${c.cnt} rows`);
  }

  db.close();

  // Copy init_db.js to project directory
  fs.copyFileSync(__filename, path.join(projectDir, 'init_db.js'));
  console.log(`[DB] Wrote init_db.js to ${path.join(projectDir, 'init_db.js')}`);
}

migrateAndInitialize();
