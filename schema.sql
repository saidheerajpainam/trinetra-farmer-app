-- ==============================================================================
-- TRINETRA DRONES & ROBOTICS - AGRICULTURE DRONE BOOKING APP
-- Production SQLite Relational Schema
-- ==============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mobile TEXT UNIQUE,
    google_sub TEXT UNIQUE,
    email TEXT UNIQUE,
    email_verified INTEGER NOT NULL DEFAULT 0,
    display_name TEXT,
    profile_photo TEXT,
    role TEXT NOT NULL DEFAULT 'farmer'
        CHECK (role IN ('farmer', 'pilot', 'admin')),
    auth_provider TEXT NOT NULL DEFAULT 'mobile'
        CHECK (auth_provider IN ('mobile', 'google', 'both')),
    mobile_verified INTEGER NOT NULL DEFAULT 0
        CHECK (mobile_verified IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1)),
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS farmers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    village TEXT NOT NULL,
    mandal TEXT,
    district TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'Andhra Pradesh',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS farms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    farmer_id INTEGER NOT NULL,
    farm_name TEXT,
    crop_type TEXT NOT NULL,
    area_acres REAL NOT NULL CHECK (area_acres > 0),
    village TEXT NOT NULL,
    mandal TEXT,
    district TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (farmer_id) REFERENCES farmers(id)
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS pilots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    is_available INTEGER NOT NULL DEFAULT 1
        CHECK (is_available IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_name TEXT NOT NULL UNIQUE,
    description TEXT,
    price_per_acre REAL NOT NULL CHECK (price_per_acre >= 0),
    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_code TEXT NOT NULL UNIQUE,
    farmer_id INTEGER NOT NULL,
    farm_id INTEGER,
    service_id INTEGER NOT NULL,
    pilot_id INTEGER,
    crop_type TEXT NOT NULL,
    area_acres REAL NOT NULL CHECK (area_acres > 0),
    village TEXT NOT NULL,
    mandal TEXT,
    district TEXT NOT NULL,
    preferred_date TEXT,
    preferred_time TEXT,
    estimated_amount REAL NOT NULL DEFAULT 0
        CHECK (estimated_amount >= 0),
    final_amount REAL
        CHECK (final_amount IS NULL OR final_amount >= 0),
    payment_method TEXT NOT NULL DEFAULT 'pay_after_service'
        CHECK (payment_method = 'pay_after_service'),
    payment_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('pending', 'paid', 'refunded')),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN (
            'pending', 'confirmed', 'pilot_assigned',
            'in_progress', 'completed', 'cancelled'
        )),
    latitude REAL,
    longitude REAL,
    farmer_notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (farmer_id) REFERENCES farmers(id)
        ON DELETE RESTRICT,
    FOREIGN KEY (farm_id) REFERENCES farms(id)
        ON DELETE RESTRICT,
    FOREIGN KEY (service_id) REFERENCES services(id)
        ON DELETE RESTRICT,
    FOREIGN KEY (pilot_id) REFERENCES pilots(id)
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS otp_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mobile TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    is_consumed INTEGER NOT NULL DEFAULT 0,
    delivery_status TEXT NOT NULL DEFAULT 'pending',
    provider_reference TEXT,
    provider_name TEXT,
    ip_address TEXT,
    verified_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0
        CHECK (is_read IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS booking_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    old_status TEXT,
    new_status TEXT NOT NULL,
    changed_by_user_id INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
        ON DELETE RESTRICT,
    FOREIGN KEY (changed_by_user_id) REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_farmers_name
    ON farmers(full_name);

CREATE INDEX IF NOT EXISTS idx_bookings_farmer
    ON bookings(farmer_id);

CREATE INDEX IF NOT EXISTS idx_bookings_status
    ON bookings(status);

CREATE INDEX IF NOT EXISTS idx_bookings_date
    ON bookings(preferred_date);

CREATE INDEX IF NOT EXISTS idx_bookings_pilot
    ON bookings(pilot_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user
    ON notifications(user_id, is_read);

CREATE INDEX IF NOT EXISTS idx_otp_mobile
    ON otp_verifications(mobile, created_at);

INSERT OR IGNORE INTO services (
    service_name, description, price_per_acre
) VALUES (
    'Agriculture Drone Spraying',
    'Agricultural crop spraying using a drone',
    500
);


CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_token TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'farmer',
    expires_at TEXT NOT NULL,
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_otp_consumed ON otp_verifications(mobile, is_consumed);

-- ==============================================================================
-- TRINETRA INTELLIGENT PLATFORM: DRONES, TELEMETRY & AI SUITE TABLES
-- ==============================================================================

-- 1. Drone Fleet Inventory
CREATE TABLE IF NOT EXISTS drones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drone_code TEXT NOT NULL UNIQUE,          -- e.g. 'AP-07', 'AP-08', 'AP-09', 'AP-12'
    model TEXT NOT NULL DEFAULT 'Trinetra Hexa-16L',
    serial_number TEXT UNIQUE,
    payload_capacity_liters REAL NOT NULL DEFAULT 16.0,
    battery_cycles INTEGER NOT NULL DEFAULT 0,
    total_flight_hours REAL NOT NULL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'in_mission', 'maintenance', 'offline')),
    health_status TEXT NOT NULL DEFAULT 'good'
        CHECK (health_status IN ('good', 'needs_inspection', 'critical')),
    last_maintenance_date TEXT,
    firmware_version TEXT NOT NULL DEFAULT 'v2.8.4-agro',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_drones_status ON drones(status);

-- 2. Real Drone Telemetry Stream Table
CREATE TABLE IF NOT EXISTS drone_telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drone_id INTEGER NOT NULL,
    booking_id INTEGER,
    pilot_id INTEGER,
    timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    altitude_m REAL NOT NULL DEFAULT 2.5,
    ground_speed_kmh REAL NOT NULL DEFAULT 18.0,
    heading_deg REAL NOT NULL DEFAULT 0.0,
    battery_percent REAL NOT NULL CHECK (battery_percent BETWEEN 0 AND 100),
    battery_voltage REAL NOT NULL,             -- e.g. 22.8V for 6S LiPo
    spray_flow_rate_lpm REAL NOT NULL DEFAULT 0.0,
    spray_active INTEGER NOT NULL DEFAULT 0 CHECK (spray_active IN (0, 1)),
    satellites INTEGER NOT NULL DEFAULT 14,
    hdop REAL NOT NULL DEFAULT 0.8,
    cumulative_acres_sprayed REAL NOT NULL DEFAULT 0.0,
    signal_strength_pct INTEGER NOT NULL DEFAULT 98,
    FOREIGN KEY (drone_id) REFERENCES drones(id) ON DELETE CASCADE,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
    FOREIGN KEY (pilot_id) REFERENCES pilots(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_telemetry_drone_time ON drone_telemetry(drone_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_telemetry_booking ON drone_telemetry(booking_id);

-- 3. AI Crop Health Analyses
CREATE TABLE IF NOT EXISTS crop_health_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    farmer_id INTEGER NOT NULL,
    image_url TEXT,
    crop_type TEXT NOT NULL,
    detected_condition TEXT NOT NULL,         -- e.g. 'Rice Blast (Magnaporthe oryzae)'
    confidence_score REAL NOT NULL CHECK (confidence_score BETWEEN 0.0 AND 1.0),
    severity TEXT NOT NULL DEFAULT 'moderate'
        CHECK (severity IN ('low', 'moderate', 'severe', 'healthy')),
    observations_en TEXT NOT NULL,
    observations_te TEXT NOT NULL,
    recommendations_en TEXT NOT NULL,
    recommendations_te TEXT NOT NULL,
    disclaimer_en TEXT NOT NULL DEFAULT 'Preliminary AI guidance only. Consult your local agricultural officer / Krishi Vigyan Kendra before chemical application.',
    disclaimer_te TEXT NOT NULL DEFAULT 'హెచ్చరిక: ఇది ప్రాథమిక AI పరిశీలన మాత్రమే. రసాయన పిచికారీ చేయడానికి ముందు స్థానిక వ్యవసాయ అధికారి లేదా శాస్త్రవేత్తను సంప్రదించండి.',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (farmer_id) REFERENCES farmers(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_crop_health_farmer ON crop_health_analyses(farmer_id);

-- 4. Drone Maintenance Logs & Predictive Indicators
CREATE TABLE IF NOT EXISTS drone_maintenance_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drone_id INTEGER NOT NULL,
    log_type TEXT NOT NULL
        CHECK (log_type IN ('routine_inspection', 'battery_warning', 'motor_bearing', 'spray_nozzle', 'propeller_wear', 'firmware_update')),
    flight_hours_at_log REAL NOT NULL,
    battery_cycles_at_log INTEGER NOT NULL,
    issue_description TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'low'
        CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
    ai_flagged INTEGER NOT NULL DEFAULT 0 CHECK (ai_flagged IN (0, 1)),
    resolved INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),
    action_taken TEXT,
    recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT,
    FOREIGN KEY (drone_id) REFERENCES drones(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_maintenance_drone ON drone_maintenance_logs(drone_id, resolved);

-- 5. AI Operational Daily & Monthly Reports
CREATE TABLE IF NOT EXISTS ai_operational_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_type TEXT NOT NULL CHECK (report_type IN ('daily', 'monthly')),
    report_date TEXT NOT NULL,                -- YYYY-MM-DD
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    total_target_acres REAL NOT NULL DEFAULT 0.0,
    total_verified_acres REAL NOT NULL DEFAULT 0.0,
    total_jobs_completed INTEGER NOT NULL DEFAULT 0,
    total_active_drones INTEGER NOT NULL DEFAULT 0,
    drone_utilization_hours REAL NOT NULL DEFAULT 0.0,
    estimated_operating_cost REAL NOT NULL DEFAULT 0.0,
    total_revenue REAL NOT NULL DEFAULT 0.0,
    ai_summary_en TEXT NOT NULL,
    ai_summary_te TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_reports_type_date ON ai_operational_reports(report_type, report_date);

-- 6. AI Operational Recommendations (with Human-in-the-Loop review)
CREATE TABLE IF NOT EXISTS ai_recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recommendation_type TEXT NOT NULL
        CHECK (recommendation_type IN ('schedule', 'maintenance', 'pilot_dispatch', 'demand_staging')),
    target_type TEXT NOT NULL,                -- 'booking', 'drone', 'pilot', 'hub'
    target_id INTEGER,
    title TEXT NOT NULL,
    details TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.85,
    status TEXT NOT NULL DEFAULT 'pending_review'
        CHECK (status IN ('pending_review', 'approved', 'rejected')),
    reviewed_by_user_id INTEGER,
    review_notes TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_recs_status ON ai_recommendations(status);

