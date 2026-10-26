const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, 'trinetra.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = OFF;');
db.exec('PRAGMA journal_mode = WAL;');

console.log('[Seed] Ensuring schema columns...');

function ensureColumn(table, column, definition) {
  try {
    const cols = db.prepare(`PRAGMA table_info("${table}")`).all().map(c => c.name);
    if (!cols.includes(column)) {
      db.exec(`ALTER TABLE "${table}" ADD COLUMN ${column} ${definition};`);
      console.log(`[Schema] Added column ${column} to ${table}`);
    }
  } catch (e) {
    console.warn(`[Schema] Note for ${table}.${column}:`, e.message);
  }
}

// Ensure farmers table columns
ensureColumn('farmers', 'total_bookings', 'INTEGER DEFAULT 0');

// Ensure pilots table columns
ensureColumn('pilots', 'pilot_code', 'TEXT');
ensureColumn('pilots', 'mobile', 'TEXT');
ensureColumn('pilots', 'assigned_services', 'INTEGER DEFAULT 0');
ensureColumn('pilots', 'completed_jobs', 'INTEGER DEFAULT 0');
ensureColumn('pilots', 'total_earnings', 'REAL DEFAULT 0');
ensureColumn('pilots', 'status', "TEXT DEFAULT 'Active'");

// Ensure drones table exists
db.exec(`
CREATE TABLE IF NOT EXISTS drones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drone_code TEXT NOT NULL UNIQUE,
    model TEXT NOT NULL,
    battery_level INTEGER NOT NULL DEFAULT 100,
    status TEXT NOT NULL DEFAULT 'Active',
    last_service_date TEXT,
    total_flights INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);
ensureColumn('drones', 'battery_level', 'INTEGER DEFAULT 85');
ensureColumn('drones', 'last_service_date', 'TEXT');
ensureColumn('drones', 'total_flights', 'INTEGER DEFAULT 0');

// Ensure bookings columns
ensureColumn('bookings', 'farmer_name', 'TEXT');
ensureColumn('bookings', 'mobile', 'TEXT');
ensureColumn('bookings', 'service_type', 'TEXT');
ensureColumn('bookings', 'farm_area', 'REAL DEFAULT 5.0');
ensureColumn('bookings', 'pilot_name', 'TEXT');
ensureColumn('bookings', 'drone_code', 'TEXT');
ensureColumn('bookings', 'drone_id', 'INTEGER');
ensureColumn('bookings', 'additional_instructions', 'TEXT');
ensureColumn('bookings', 'display_status', "TEXT DEFAULT 'Pending'");
ensureColumn('bookings', 'display_payment_method', "TEXT DEFAULT 'UPI'");
ensureColumn('bookings', 'latitude', 'REAL DEFAULT 16.4850');
ensureColumn('bookings', 'longitude', 'REAL DEFAULT 80.6930');
ensureColumn('drones', 'display_status', "TEXT DEFAULT 'Active'");

// Ensure payments table exists
db.exec(`
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER,
    booking_code TEXT,
    farmer_name TEXT,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

ensureColumn('notifications', 'category', "TEXT DEFAULT 'all'");
console.log('[Seed] Seeding data...');

// 1. Seed Services
const defaultServices = [
  { name: 'Pesticide Spraying', desc: 'Protect your crops from pests and diseases with precision ultra-low volume drone spraying.', price: 500 },
  { name: 'Fertilizer Spraying', desc: 'Improve soil health and crop growth with uniform spray of nano urea and micronutrients.', price: 400 },
  { name: 'Crop Monitoring', desc: 'Check crop health and growth with high-resolution multispectral drone images.', price: 300 },
  { name: 'Land Survey', desc: 'Get accurate field mapping, boundary measurement, and 3D elevation modeling.', price: 250 }
];

const insertSrv = db.prepare('INSERT OR IGNORE INTO services (service_name, description, price_per_acre, is_active) VALUES (?, ?, ?, 1)');
for (const s of defaultServices) {
  insertSrv.run(s.name, s.desc, s.price);
}

// 2. Seed Users & Farmers (Image 2 Farmers Management)
const farmersList = [
  { name: 'Sai Dheeraj', mobile: '+91 98765 43210', rawPhone: '9876543210', village: 'Poranki', district: 'Krishna', bookings: 12 },
  { name: 'Venkatesh', mobile: '+91 99887 66554', rawPhone: '9988766554', village: 'Mangalagiri', district: 'Guntur', bookings: 8 },
  { name: 'Lakshmi', mobile: '+91 91234 56789', rawPhone: '9123456789', village: 'Nuzvid', district: 'Krishna', bookings: 5 },
  { name: 'Ravi Kumar', mobile: '+91 98654 32109', rawPhone: '9865432109', village: 'Vuyyuru', district: 'Krishna', bookings: 7 },
  { name: 'Anil', mobile: '+91 90567 89012', rawPhone: '9056789012', village: 'Gudivada', district: 'Krishna', bookings: 3 }
];

for (const f of farmersList) {
  let user = db.prepare('SELECT id FROM users WHERE mobile = ?').get(f.rawPhone);
  if (!user) {
    db.prepare('INSERT INTO users (mobile, display_name, role, mobile_verified, is_active) VALUES (?, ?, ?, 1, 1)').run(f.rawPhone, f.name, 'farmer');
    user = db.prepare('SELECT id FROM users WHERE mobile = ?').get(f.rawPhone);
  }
  let farmer = db.prepare('SELECT id FROM farmers WHERE user_id = ?').get(user.id);
  if (!farmer) {
    db.prepare('INSERT INTO farmers (user_id, full_name, village, mandal, district, state, total_bookings) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      user.id, f.name, f.village, f.village, f.district, 'Andhra Pradesh', f.bookings
    );
  } else {
    db.prepare('UPDATE farmers SET full_name = ?, village = ?, district = ?, total_bookings = ? WHERE id = ?').run(
      f.name, f.village, f.district, f.bookings, farmer.id
    );
  }
}

// 3. Seed Pilots (Image 2 & 3 Pilots Management)
const pilotsList = [
  { name: 'Ramesh Kumar', code: 'TNP-001', mobile: '+91 78945 12345', rawPhone: '7894512345', assigned: 25, completed: 18, earnings: 12450, status: 'Active' },
  { name: 'Suresh', code: 'TNP-002', mobile: '+91 81234 56789', rawPhone: '8123456789', assigned: 18, completed: 15, earnings: 9800, status: 'Active' },
  { name: 'Raju', code: 'TNP-003', mobile: '+91 90654 32109', rawPhone: '9065432109', assigned: 15, completed: 14, earnings: 8500, status: 'Active' },
  { name: 'Mahesh', code: 'TNP-004', mobile: '+91 83012 34567', rawPhone: '8301234567', assigned: 10, completed: 8, earnings: 5200, status: 'Active' },
  { name: 'Praveen', code: 'TNP-005', mobile: '+91 98876 54321', rawPhone: '9887654321', assigned: 8, completed: 7, earnings: 4100, status: 'Inactive' }
];

for (const p of pilotsList) {
  let user = db.prepare('SELECT id FROM users WHERE mobile = ?').get(p.rawPhone);
  if (!user) {
    db.prepare('INSERT INTO users (mobile, display_name, role, mobile_verified, is_active) VALUES (?, ?, ?, 1, 1)').run(p.rawPhone, p.name, 'pilot');
    user = db.prepare('SELECT id FROM users WHERE mobile = ?').get(p.rawPhone);
  }
  let pilot = db.prepare('SELECT id FROM pilots WHERE user_id = ?').get(user.id);
  if (!pilot) {
    db.prepare('INSERT INTO pilots (user_id, pilot_code, full_name, mobile, assigned_services, completed_jobs, total_earnings, status, is_available) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      user.id, p.code, p.name, p.mobile, p.assigned, p.completed, p.earnings, p.status, p.status === 'Active' ? 1 : 0
    );
  } else {
    db.prepare('UPDATE pilots SET pilot_code = ?, full_name = ?, mobile = ?, assigned_services = ?, completed_jobs = ?, total_earnings = ?, status = ?, is_available = ? WHERE id = ?').run(
      p.code, p.name, p.mobile, p.assigned, p.completed, p.earnings, p.status, p.status === 'Active' ? 1 : 0, pilot.id
    );
  }
}

// 4. Seed Drones (Image 2 Drones Management)
const dronesList = [
  { code: 'TNR-164-001', model: 'T10 Pro', battery: 85, status: 'available', displayStatus: 'Active', lastService: '15 Oct 2025', flights: 42 },
  { code: 'TNR-164-002', model: 'T20 Pro', battery: 60, status: 'in_mission', displayStatus: 'In Service', lastService: '20 Oct 2025', flights: 38 },
  { code: 'TNR-164-003', model: 'DJI Agras T40', battery: 90, status: 'available', displayStatus: 'Active', lastService: '12 Oct 2025', flights: 51 },
  { code: 'TNR-164-004', model: 'T16', battery: 45, status: 'maintenance', displayStatus: 'Maintenance', lastService: '08 Oct 2025', flights: 29 },
  { code: 'TNR-164-005', model: 'T30', battery: 80, status: 'available', displayStatus: 'Active', lastService: '20 Oct 2025', flights: 34 }
];

for (const d of dronesList) {
  const existing = db.prepare('SELECT id FROM drones WHERE drone_code = ?').get(d.code);
  if (!existing) {
    db.prepare('INSERT INTO drones (drone_code, model, battery_level, status, display_status, last_service_date, total_flights) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      d.code, d.model, d.battery, d.status, d.displayStatus, d.lastService, d.flights
    );
  } else {
    db.prepare('UPDATE drones SET model = ?, battery_level = ?, status = ?, display_status = ?, last_service_date = ?, total_flights = ? WHERE id = ?').run(
      d.model, d.battery, d.status, d.displayStatus, d.lastService, d.flights, existing.id
    );
  }
}

// 5. Seed Bookings (Images 1, 2, 3)
const bookingsList = [
  {
    code: 'TNR20261025001',
    farmerName: 'Sai Dheeraj',
    mobile: '+91 98765 43210',
    village: 'Poranki',
    district: 'Krishna',
    crop: 'Paddy',
    service: 'Pesticide Spraying',
    area: 5.0,
    date: '25 Oct 2025',
    time: '09:00 AM - 12:00 PM',
    instructions: 'Please spray for leaf pests.',
    amount: 1500,
    status: 'pilot_assigned',
    displayStatus: 'On the Way',
    pilotName: 'Ramesh Kumar',
    droneCode: 'TNR-164-001',
    paymentMethod: 'UPI',
    paymentStatus: 'paid',
    lat: 16.4862,
    lng: 80.6975
  },
  {
    code: 'TNR20261030002',
    farmerName: 'Venkatesh',
    mobile: '+91 99887 66554',
    village: 'Mangalagiri',
    district: 'Guntur',
    crop: 'Chilli',
    service: 'Fertilizer Spraying',
    area: 8.0,
    date: '25 Oct 2025',
    time: '11:00 AM - 02:00 PM',
    instructions: 'Nano urea spray for vegetative stage.',
    amount: 1200,
    status: 'confirmed',
    displayStatus: 'Scheduled',
    pilotName: 'Suresh',
    droneCode: 'TNR-164-002',
    paymentMethod: 'Cash',
    paymentStatus: 'pending',
    lat: 16.4312,
    lng: 80.5621
  },
  {
    code: 'TNR20261024003',
    farmerName: 'Lakshmi',
    mobile: '+91 91234 56789',
    village: 'Nuzvid',
    district: 'Krishna',
    crop: 'Cotton',
    service: 'Crop Monitoring',
    area: 10.0,
    date: '24 Oct 2025',
    time: '02:00 PM - 05:00 PM',
    instructions: 'Check bollworm infestation extent.',
    amount: 2000,
    status: 'completed',
    displayStatus: 'Completed',
    pilotName: 'Raju',
    droneCode: 'TNR-164-003',
    paymentMethod: 'UPI',
    paymentStatus: 'paid',
    lat: 16.7865,
    lng: 80.8492
  },
  {
    code: 'TNR20261024004',
    farmerName: 'Ravi Kumar',
    mobile: '+91 98654 32109',
    village: 'Vuyyuru',
    district: 'Krishna',
    crop: 'Paddy',
    service: 'Pesticide Spraying',
    area: 5.0,
    date: '24 Oct 2025',
    time: '04:00 PM - 06:00 PM',
    instructions: 'Stem borer preventive spray.',
    amount: 1500,
    status: 'completed',
    displayStatus: 'Completed',
    pilotName: 'Suresh',
    droneCode: 'TNR-164-001',
    paymentMethod: 'Online',
    paymentStatus: 'paid',
    lat: 16.3689,
    lng: 80.8427
  },
  {
    code: 'TNR20261023005',
    farmerName: 'Anil',
    mobile: '+91 90567 89012',
    village: 'Gudivada',
    district: 'Krishna',
    crop: 'Paddy',
    service: 'Land Survey',
    area: 15.0,
    date: '23 Oct 2025',
    time: '10:00 AM - 01:00 PM',
    instructions: 'Subdivision survey.',
    amount: 1800,
    status: 'cancelled',
    displayStatus: 'Cancelled',
    pilotName: '-',
    droneCode: '-',
    paymentMethod: 'Cash',
    paymentStatus: 'refunded',
    lat: 16.4411,
    lng: 80.9926
  }
];

const srvMap = {
  'Pesticide Spraying': 1,
  'Fertilizer Spraying': 2,
  'Crop Monitoring': 3,
  'Land Survey': 4
};

for (const b of bookingsList) {
  const farmerRec = db.prepare('SELECT id FROM farmers WHERE full_name = ?').get(b.farmerName) || { id: 1 };
  const pilotRec = b.pilotName !== '-' ? (db.prepare('SELECT id FROM pilots WHERE full_name LIKE ?').get(`%${b.pilotName}%`) || null) : null;
  const droneRec = b.droneCode !== '-' ? (db.prepare('SELECT id FROM drones WHERE drone_code = ?').get(b.droneCode) || null) : null;
  const serviceId = srvMap[b.service] || 1;

  const existingB = db.prepare('SELECT id FROM bookings WHERE booking_code = ?').get(b.code);
  if (!existingB) {
    db.prepare(`
      INSERT INTO bookings (
        booking_code, farmer_id, service_id, pilot_id, drone_id,
        farmer_name, mobile, village, district, crop_type, farm_area, area_acres,
        service_type, preferred_date, preferred_time, additional_instructions,
        estimated_amount, status, display_status, pilot_name, drone_code, payment_method, display_payment_method, payment_status,
        latitude, longitude
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pay_after_service', ?, ?, ?, ?)
    `).run(
      b.code, farmerRec.id, serviceId, pilotRec ? pilotRec.id : null, droneRec ? droneRec.id : null,
      b.farmerName, b.mobile, b.village, b.district, b.crop, b.area, b.area,
      b.service, b.date, b.time, b.instructions,
      b.amount, b.status, b.displayStatus, b.pilotName, b.droneCode, b.paymentMethod, b.paymentStatus,
      b.lat, b.lng
    );
  } else {
    db.prepare(`
      UPDATE bookings SET
        farmer_name = ?, mobile = ?, village = ?, district = ?, crop_type = ?,
        farm_area = ?, area_acres = ?, service_type = ?, preferred_date = ?,
        preferred_time = ?, additional_instructions = ?, estimated_amount = ?,
        status = ?, display_status = ?, pilot_name = ?, drone_code = ?,
        payment_method = 'pay_after_service', display_payment_method = ?,
        payment_status = ?, latitude = ?, longitude = ?
      WHERE id = ?
    `).run(
      b.farmerName, b.mobile, b.village, b.district, b.crop,
      b.area, b.area, b.service, b.date,
      b.time, b.instructions, b.amount,
      b.status, b.displayStatus, b.pilotName, b.droneCode, b.paymentMethod,
      b.paymentStatus, b.lat, b.lng, existingB.id
    );
  }
}

// 6. Seed Payments
db.exec('DELETE FROM payments;');
const insertPayment = db.prepare(`
INSERT INTO payments (booking_id, booking_code, farmer_name, amount, payment_method, status, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const paymentsList = [
  { bId: 1, code: 'TNR20261025001', name: 'Sai Dheeraj', amount: 1500, method: 'UPI', status: 'Paid', date: '25 Oct 2025' },
  { bId: 2, code: 'TNR20261025002', name: 'Venkatesh', amount: 1200, method: 'Cash', status: 'Pending', date: '25 Oct 2025' },
  { bId: 3, code: 'TNR20261024003', name: 'Lakshmi', amount: 2000, method: 'UPI', status: 'Paid', date: '24 Oct 2025' },
  { bId: 4, code: 'TNR20261024004', name: 'Ravi Kumar', amount: 1500, method: 'Online', status: 'Paid', date: '24 Oct 2025' },
  { bId: 5, code: 'TNR20261023005', name: 'Anil', amount: 1800, method: 'Cash', status: 'Paid', date: '23 Oct 2025' }
];

for (const p of paymentsList) {
  insertPayment.run(p.bId, p.code, p.name, p.amount, p.method, p.status, p.date);
}

// 7. Seed Notifications
db.exec('DELETE FROM notifications;');
const insertNotif = db.prepare('INSERT INTO notifications (user_id, title, message, category, is_read, created_at) VALUES (?, ?, ?, ?, 0, ?)');
const notifs = [
  { userId: 101, title: 'Pilot is On the Way', message: 'Your pilot Ramesh Kumar is on the way to your location.', category: 'service', time: '10:15 AM' },
  { userId: 101, title: 'Booking Confirmed', message: 'Your booking TNR20261025001 has been confirmed.', category: 'bookings', time: '09:30 AM' },
  { userId: 101, title: 'Service Completed', message: 'Pesticide spraying at your farm has been completed successfully.', category: 'service', time: '25 Oct' },
  { userId: 101, title: 'Reminder', message: 'Your drone service is scheduled tomorrow at 09:00 AM.', category: 'service', time: '24 Oct' },
  { userId: 101, title: 'Special Offer', message: 'Get 10% off on your next booking! Valid till 31st Oct.', category: 'updates', time: '20 Oct' }
];

for (const n of notifs) {
  insertNotif.run(n.userId, n.title, n.message, n.category, n.time);
}

console.log('🎉 Successfully synchronized database with exact image data!');
