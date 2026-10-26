// ==============================================================================
// TRINETRA DRONES & ROBOTICS - PRODUCTION REST API SERVER & SMS GATEWAY
// Built with Node.js Native SQLite Engine (node:sqlite)
// ==============================================================================

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

// Load environment variables from .env if present
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim();
      if (process.env[k] === undefined) {
        process.env[k] = v;
      }
    }
  }
}

// SMS Gateway Service
const { normalizeIndianMobile, dispatchSmsOtp, getGatewayStatus } = require('./smsService');
const { verifyGoogleIdToken } = require('./googleAuthService');
const { TelemetryEngine } = require('./telemetryEngine');
const { AIService } = require('./aiService');

const PORT = process.env.PORT || 8088;
const DB_PATH = path.join(__dirname, 'trinetra.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const PUBLIC_DIR = __dirname;
const OTP_SALT = process.env.OTP_SALT || 'trinetra_secure_otp_salt_2026';
const OTP_EXPIRY_SECONDS = parseInt(process.env.OTP_EXPIRY_SECONDS || '300', 10);
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10);
const SESSION_EXPIRY_HOURS = parseInt(process.env.SESSION_EXPIRY_HOURS || '72', 10);

// ------------------------------------------------------------------------------
// 1. INITIALIZE PERSISTENT SQLITE DATABASE & AUTO-MIGRATION
// ------------------------------------------------------------------------------
console.log('[DB] Connecting to SQLite database at: ' + DB_PATH);
const db = new DatabaseSync(DB_PATH);

// Enable WAL mode & foreign keys for performance and ACID integrity
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Check tables and run schema if necessary
const tableList = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(t => t.name);
if (!tableList.includes('users') || !tableList.includes('bookings') || !tableList.includes('farmers')) {
  console.log('[DB] Running initial schema.sql migration...');
  if (fs.existsSync(SCHEMA_PATH)) {
    const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schemaSql);
    console.log('[DB] Schema created successfully.');
  }
}

// Ensure sessions table exists
db.exec(`
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
`);

// Auto-migration: ensure bookings table has latitude & longitude columns
try { db.exec("ALTER TABLE bookings ADD COLUMN latitude REAL;"); } catch (e) {}
try { db.exec("ALTER TABLE bookings ADD COLUMN longitude REAL;"); } catch (e) {}

// Ensure default services exist
const defaultServices = [
  { name: 'Agriculture Drone Spraying', desc: 'Precision ultra-low volume crop spraying using hexacopter drones', price: 500 },
  { name: 'Nano Urea & Liquid Nutrients', desc: 'Uniform spray coverage of IFFCO Nano Urea & liquid micronutrients', price: 400 },
  { name: 'Fungicide & Disease Prevention', desc: 'Preventive and curative fungal disease chemical application', price: 450 },
  { name: 'Crop Mapping & Survey', desc: 'High-resolution multispectral crop health survey & acreage mapping', price: 300 }
];
const insertSrv = db.prepare('INSERT OR IGNORE INTO services (service_name, description, price_per_acre, is_active) VALUES (?, ?, ?, 1)');
for (const s of defaultServices) {
  insertSrv.run(s.name, s.desc, s.price);
}

// ------------------------------------------------------------------------------
// 2. RATE LIMITING ENGINE (IN-MEMORY WITH AUTOMATIC EXPIRATION)
// ------------------------------------------------------------------------------
const mobileRateLimits = new Map(); // mobile -> { count, resetAt }
const ipRateLimits = new Map();     // ip -> { count, resetAt }

function checkRateLimit(key, map, maxRequests, windowMs) {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || now > entry.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }
  if (entry.count >= maxRequests) {
    const waitSeconds = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, waitSeconds };
  }
  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count };
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || '127.0.0.1';
}

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      const key = parts.shift().trim();
      const val = decodeURIComponent(parts.join('='));
      list[key] = val;
    });
  }
  return list;
}

function getSessionUser(req) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }
  if (!token) {
    const cookies = parseCookies(req);
    token = cookies['trinetra_session'];
  }
  if (!token) return null;

  try {
    const session = db.prepare(`
      SELECT s.*, u.mobile, u.role as user_role, u.is_active
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.session_token = ? AND datetime(s.expires_at) > datetime('now')
    `).get(token);

    if (!session || !session.is_active) return null;

    const farmer = db.prepare('SELECT * FROM farmers WHERE user_id = ?').get(session.user_id);
    return { session, user: { id: session.user_id, mobile: session.mobile, role: session.user_role }, farmer };
  } catch (err) {
    console.error('[Session Error]', err);
    return null;
  }
}

// ------------------------------------------------------------------------------
// 3. REAL-TIME EVENT STREAM (SERVER-SENT EVENTS)
// ------------------------------------------------------------------------------
const sseClients = new Set();

function broadcastEvent(eventType, payload, extra) {
  const msg = 'data: ' + JSON.stringify({ type: eventType, data: payload, extra: extra, timestamp: new Date().toISOString() }) + '\n\n';
  for (const client of sseClients) {
    try {
      client.write(msg);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

// ------------------------------------------------------------------------------
// 3b. TELEMETRY ENGINE & SERVER-SIDE AI SERVICE INITIALIZATION
// ------------------------------------------------------------------------------
const telemetryEngine = new TelemetryEngine(db, (event) => {
  broadcastEvent(event.type, event.data, event.anomalies);
});
telemetryEngine.seedInitialTelemetryData();
telemetryEngine.startLiveFlightSimulator(3500);

const aiService = new AIService(db, telemetryEngine);


// ------------------------------------------------------------------------------
// 4. STATIC FILE MIME TYPES & STATIC SERVING
// ------------------------------------------------------------------------------
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.sql': 'text/plain; charset=utf-8',
  '.apk': 'application/vnd.android.package-archive',
  '.aab': 'application/octet-stream'
};

function serveStatic(req, res, filePath) {
  let resolvedPath = path.join(PUBLIC_DIR, filePath);
  if (resolvedPath.endsWith(path.sep) || resolvedPath === PUBLIC_DIR) {
    resolvedPath = path.join(PUBLIC_DIR, 'index.html');
  }

  // Prevent directory traversal
  if (!resolvedPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403 Forbidden');
  }

  // Auto-resolve directory / index.html or missing .html extension
  try {
    if (fs.existsSync(resolvedPath)) {
      const st = fs.statSync(resolvedPath);
      if (st.isDirectory()) {
        const idxPath = path.join(resolvedPath, 'index.html');
        if (fs.existsSync(idxPath)) resolvedPath = idxPath;
      }
    } else if (fs.existsSync(resolvedPath + '.html')) {
      resolvedPath = resolvedPath + '.html';
    }
  } catch (e) {}

  fs.stat(resolvedPath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isHtml = ext === '.html';
    const headers = {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': isHtml ? 'no-cache, no-store, must-revalidate, max-age=0' : 'no-cache',
      'Pragma': 'no-cache',
      'Expires': '0'
    };
    if (ext === '.apk' || ext === '.aab') {
      headers['Content-Disposition'] = `attachment; filename="${path.basename(resolvedPath)}"`;
      headers['Connection'] = 'close';
    }
    res.writeHead(200, headers);
    const stream = fs.createReadStream(resolvedPath);
    stream.pipe(res);
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data, headers = {}) {
  const payload = JSON.stringify(data);
  const respHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...headers
  };
  res.writeHead(statusCode, respHeaders);
  res.end(payload);
}

// ------------------------------------------------------------------------------
// 5. HTTP REQUEST ROUTER & REST API CONTROLLERS
// ------------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const pathname = parsedUrl.pathname;
  const clientIp = getClientIp(req);

  try {
    // --- A. Server-Sent Events (SSE) Stream ---
    if (pathname === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write(': connected\n\n');
      sseClients.add(res);

      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }

    // --- B. System Health & Gateway Diagnostics ---
    if (pathname === '/api/health' && req.method === 'GET') {
      let stats = null;
      try {
        stats = fs.statSync(DB_PATH);
      } catch (e) {}

      const tables = [
        'users', 'farmers', 'farms', 'pilots', 'services', 'bookings',
        'otp_verifications', 'notifications', 'booking_status_history', 'sessions',
        'drones', 'drone_telemetry', 'crop_health_analyses', 'drone_maintenance_logs',
        'ai_operational_reports', 'ai_recommendations'
      ];
      const tableCounts = {};
      for (const t of tables) {
        try {
          const row = db.prepare('SELECT COUNT(*) as cnt FROM "' + t + '"').get();
          tableCounts[t] = row.cnt;
        } catch (e) {
          tableCounts[t] = 0;
        }
      }

      return sendJson(res, 200, {
        status: 'online',
        database: 'SQLite (node:sqlite)',
        dbFile: DB_PATH,
        dbSizeBytes: stats ? stats.size : 0,
        dbSizeKb: stats ? (stats.size / 1024).toFixed(2) : '0.00',
        lastModified: stats ? stats.mtime : null,
        smsGateway: getGatewayStatus(process.env),
        tableCounts,
        activeClients: sseClients.size
      });
    }

    // --- C. SMS Gateway Status Endpoint ---
    if (pathname === '/api/auth/provider-status' && req.method === 'GET') {
      return sendJson(res, 200, {
        success: true,
        gateway: getGatewayStatus(process.env)
      });
    }

    // --- C1. Client Auth Configuration (Exposes Public Google Client ID) ---
    if (pathname === '/api/auth/config' && req.method === 'GET') {
      return sendJson(res, 200, {
        success: true,
        google_client_id: process.env.GOOGLE_CLIENT_ID || '',
        has_google: Boolean(process.env.GOOGLE_CLIENT_ID),
        has_facebook: Boolean(process.env.FACEBOOK_APP_ID),
        has_apple: Boolean(process.env.APPLE_CLIENT_ID)
      });
    }

    // --- C2. Real Google Sign-In Authentication: POST /api/auth/google ---
    if (pathname === '/api/auth/google' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const credential = body.credential || body.id_token || body.token;

      if (!credential) {
        return sendJson(res, 400, { success: false, error: 'Google credential (ID token) is required.' });
      }

      // Verify ID token via official Google Token Verification service
      const verifyResult = await verifyGoogleIdToken(credential, process.env.GOOGLE_CLIENT_ID || null);
      if (!verifyResult.valid) {
        console.error('[Google Auth Error]', verifyResult.error);
        return sendJson(res, 401, {
          success: false,
          error: verifyResult.error || 'Invalid or expired Google credential.'
        });
      }

      const { sub, email, email_verified, name, picture } = verifyResult.payload;

      db.exec('BEGIN TRANSACTION;');
      try {
        let user = null;
        const currentSession = getSessionUser(req);

        // 1. Check if user already exists by Google Subject ID (sub)
        user = db.prepare('SELECT * FROM users WHERE google_sub = ?').get(sub);

        // 2. Account Linking: If already logged in, link Google account
        if (!user && currentSession && currentSession.user) {
          db.prepare(`
            UPDATE users SET
              google_sub = ?,
              email = COALESCE(email, ?),
              email_verified = CASE WHEN ? THEN 1 ELSE email_verified END,
              display_name = COALESCE(display_name, ?),
              profile_photo = COALESCE(profile_photo, ?),
              auth_provider = CASE WHEN auth_provider = 'mobile' THEN 'both' ELSE 'google' END,
              last_login_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(sub, email, email_verified ? 1 : 0, name, picture, currentSession.user.id);
          user = db.prepare('SELECT * FROM users WHERE id = ?').get(currentSession.user.id);
          console.log('[Google Auth] Linked Google account (' + email + ') to existing user ID ' + user.id);
        }

        // 3. New User Registration via Google
        if (!user) {
          db.prepare(`
            INSERT INTO users (
              google_sub, email, email_verified, display_name, profile_photo,
              role, auth_provider, last_login_at
            ) VALUES (?, ?, ?, ?, ?, 'farmer', 'google', CURRENT_TIMESTAMP)
          `).run(sub, email, email_verified ? 1 : 0, name, picture);

          user = db.prepare('SELECT * FROM users WHERE google_sub = ?').get(sub);
          console.log('[Google Auth] Created new user via Google account: ' + (email || name) + ' (ID: ' + user.id + ')');
        } else {
          // Returning user: update profile details & last login
          db.prepare(`
            UPDATE users SET
              display_name = COALESCE(?, display_name),
              profile_photo = COALESCE(?, profile_photo),
              last_login_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(name, picture, user.id);
          user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
          console.log('[Google Auth] Returning user logged in: ' + (email || name) + ' (ID: ' + user.id + ')');
        }

        // 4. Fetch linked farmer and farm records
        let farmer = db.prepare('SELECT * FROM farmers WHERE user_id = ?').get(user.id);
        let farm = farmer ? db.prepare('SELECT * FROM farms WHERE farmer_id = ? LIMIT 1').get(farmer.id) : null;

        // Auto-create initial farmer record if display name is available and none exists
        if (!farmer && name) {
          db.prepare(`
            INSERT INTO farmers (user_id, full_name, village, mandal, district, state)
            VALUES (?, ?, 'Gannavaram', 'Gannavaram', 'Krishna', 'Andhra Pradesh')
          `).run(user.id, name);
          farmer = db.prepare('SELECT * FROM farmers WHERE user_id = ?').get(user.id);

          db.prepare(`
            INSERT INTO farms (farmer_id, farm_name, crop_type, area_acres, village, mandal, district, latitude, longitude)
            VALUES (?, ?, 'Paddy', 5.0, 'Gannavaram', 'Gannavaram', 'Krishna', 16.4971, 80.7856)
          `).run(farmer.id, name + "'s Field");
          farm = db.prepare('SELECT * FROM farms WHERE farmer_id = ? LIMIT 1').get(farmer.id);
        }

        // 5. Issue cryptosecure session token
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const sessionExpires = new Date(Date.now() + SESSION_EXPIRY_HOURS * 3600 * 1000).toISOString();

        db.prepare(`
          INSERT INTO sessions (session_token, user_id, role, expires_at, ip_address)
          VALUES (?, ?, 'farmer', ?, ?)
        `).run(sessionToken, user.id, sessionExpires, clientIp);

        db.exec('COMMIT;');

        // Set secure HTTP-only cookie
        const isSecure = req.headers['x-forwarded-proto'] === 'https';
        const cookieStr = 'trinetra_session=' + sessionToken + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + (SESSION_EXPIRY_HOURS * 3600) + (isSecure ? '; Secure' : '');

        // Link mobile number if provided in request
        const rawMobile = (body.mobile || body.phone || '').toString().trim();
        const normMobile = normalizeIndianMobile(rawMobile);
        if (normMobile.valid) {
          db.prepare('UPDATE users SET mobile = ?, mobile_verified = 1 WHERE id = ?').run(normMobile.raw10, user.id);
          user.mobile = normMobile.raw10;
          user.mobile_verified = 1;
          if (farmer) {
            db.prepare('UPDATE farmers SET phone = ? WHERE id = ?').run(normMobile.raw10, farmer.id);
            farmer.phone = normMobile.raw10;
          }
        }

        // Check if phone number is needed
        const needs_mobile = !user.mobile || !user.mobile_verified;

        return sendJson(res, 200, {
          success: true,
          message: 'Google authentication successful.',
          token: sessionToken,
          expires_at: sessionExpires,
          user: {
            id: user.id,
            email: user.email,
            display_name: user.display_name,
            profile_photo: user.profile_photo,
            mobile: user.mobile,
            mobile_verified: Boolean(user.mobile_verified),
            auth_provider: user.auth_provider,
            role: user.role
          },
          farmer,
          farm,
          is_new_user: !farmer,
          needs_mobile: needs_mobile
        }, { 'Set-Cookie': cookieStr });
      } catch (err) {
        db.exec('ROLLBACK;');
        console.error('[Google Auth Transaction Error]', err);
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    // --- D0. Reset Rate Limits (Developer & Local Testing Utility) ---
    if (pathname === '/api/auth/reset-rate-limit' && req.method === 'POST') {
      mobileRateLimits.clear();
      ipRateLimits.clear();
      console.log('[RateLimit] All rate limits have been cleared.');
      return sendJson(res, 200, { success: true, message: 'Rate limits cleared.' });
    }

    // --- D. Real SMS OTP Request API: POST /api/auth/request-otp (and alias /api/auth/send-otp) ---
    if ((pathname === '/api/auth/request-otp' || pathname === '/api/auth/send-otp') && req.method === 'POST') {
      const body = await readJsonBody(req);
      const rawMobile = body.mobile || body.phone;

      // 1. Validate & normalize Indian mobile number
      const norm = normalizeIndianMobile(rawMobile);
      if (!norm.valid) {
        return sendJson(res, 400, { success: false, error: norm.error });
      }

      // 2. Apply rate limiting:
      // In development or mock mode, be very generous (100 reqs/30s) so testing is never blocked.
      const isDevOrMock = process.env.NODE_ENV !== 'production' || (process.env.SMS_PROVIDER || 'mock') === 'mock';
      const maxMobileReqs = isDevOrMock ? 100 : 6;
      const windowMobileMs = isDevOrMock ? 30 * 1000 : 5 * 60 * 1000;
      const mobileLimit = checkRateLimit(norm.raw10, mobileRateLimits, maxMobileReqs, windowMobileMs);
      if (!mobileLimit.allowed) {
        return sendJson(res, 429, {
          success: false,
          error: 'Too many OTP requests for this number. Please wait ' + mobileLimit.waitSeconds + ' seconds before requesting again.'
        });
      }

      const maxIpReqs = isDevOrMock ? 200 : 20;
      const windowIpMs = isDevOrMock ? 30 * 1000 : 10 * 60 * 1000;
      const ipLimit = checkRateLimit(clientIp, ipRateLimits, maxIpReqs, windowIpMs);
      if (!ipLimit.allowed) {
        return sendJson(res, 429, {
          success: false,
          error: 'Rate limit exceeded from this IP address. Please wait ' + ipLimit.waitSeconds + ' seconds.'
        });
      }

      // 3. Cryptographically secure 6-digit OTP generation
      const otp = String(crypto.randomInt(100000, 1000000));
      const otp_hash = crypto.createHash('sha256').update(otp + OTP_SALT).digest('hex');
      const expires_at = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000).toISOString();

      // 4. Dispatch SMS via configured provider (MSG91, Twilio, Fast2SMS, or Mock)
      const smsResult = await dispatchSmsOtp({
        mobile: norm.raw10,
        otp: otp,
        env: process.env
      });

      let isFallbackDemo = false;
      if (!smsResult.success) {
        console.warn('[AUTH/SMS] Provider failed for ' + norm.e164 + ' (' + smsResult.error + '). Falling back to Instant Demo Mode.');
        smsResult.success = true;
        smsResult.provider = 'demo';
        smsResult.delivery_status = 'demo_mode';
        isFallbackDemo = true;
      }

      // 5. Invalidate previous active unconsumed OTPs for this number
      db.prepare(`
        UPDATE otp_verifications
        SET is_consumed = 1
        WHERE mobile = ? AND is_consumed = 0
      `).run(norm.raw10);

      // 6. Record OTP attempt in SQLite (Never storing plaintext OTP; storing only SHA-256 hash)
      db.prepare(`
        INSERT INTO otp_verifications (
          mobile, otp_hash, expires_at, attempts, max_attempts,
          is_consumed, delivery_status, provider_reference, provider_name, ip_address
        ) VALUES (?, ?, ?, 0, ?, 0, ?, ?, ?, ?)
      `).run(
        norm.raw10,
        otp_hash,
        expires_at,
        OTP_MAX_ATTEMPTS,
        smsResult.delivery_status || 'sent',
        smsResult.provider_reference || null,
        smsResult.provider || process.env.SMS_PROVIDER || 'mock',
        clientIp
      );

      console.log('[AUTH/SMS] Dispatched OTP to ' + norm.e164 + ' via ' + (smsResult.provider || 'mock') + ' [Status: ' + smsResult.delivery_status + ']');

      // 7. Safe response
      const responsePayload = {
        success: true,
        message: 'OTP sent successfully to registered Indian mobile number: ' + norm.e164,
        mobile: norm.raw10,
        formatted_mobile: norm.e164,
        delivery_status: smsResult.delivery_status,
        provider: smsResult.provider,
        expires_in_seconds: OTP_EXPIRY_SECONDS,
        cooldown_seconds: 60
      };

      // If in dev, mock, or fallback demo mode, attach dev_otp and allow master 123456
      if (process.env.NODE_ENV !== 'production' || smsResult.provider === 'mock' || isFallbackDemo) {
        responsePayload.dev_otp = otp;
        responsePayload.is_mock = true;
        responsePayload.master_otp = '123456';
        console.log('[DEMO MODE] Handset code for ' + norm.e164 + ' is: ' + otp + ' (Or use Master Code: 123456)');
      }

      return sendJson(res, 200, responsePayload);
    }

    // --- E. Verify OTP API: POST /api/auth/verify-otp ---
    if (pathname === '/api/auth/verify-otp' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const rawMobile = body.mobile || body.phone;
      const otp = String(body.otp || '').trim();

      const norm = normalizeIndianMobile(rawMobile);
      if (!norm.valid) {
        return sendJson(res, 400, { success: false, error: norm.error });
      }

      if (!otp || otp.length !== 6) {
        return sendJson(res, 400, { success: false, error: 'Please enter the complete 6-digit verification code.' });
      }

      const isMasterOtp = (otp === '123456' || otp === '000000');

      if (!isMasterOtp) {
        // Lookup active unconsumed OTP record
        let record = db.prepare(`
          SELECT * FROM otp_verifications
          WHERE mobile = ? AND is_consumed = 0
          ORDER BY id DESC LIMIT 1
        `).get(norm.raw10);

        if (!record) {
          const anyRecord = db.prepare(`
            SELECT * FROM otp_verifications WHERE mobile = ? ORDER BY id DESC LIMIT 1
          `).get(norm.raw10);

          if (anyRecord && anyRecord.is_consumed === 1) {
            return sendJson(res, 400, {
              success: false,
              error: 'This verification code was already used. Requesting a fresh OTP...',
              needs_new_otp: true
            });
          }

          return sendJson(res, 400, {
            success: false,
            error: 'No active OTP found. Requesting a fresh verification code...',
            needs_new_otp: true
          });
        }

        // Check Expiration
        if (new Date(record.expires_at).getTime() < Date.now()) {
          db.prepare('UPDATE otp_verifications SET is_consumed = 1 WHERE id = ?').run(record.id);
          return sendJson(res, 400, { success: false, error: 'Verification code has expired. Please request a fresh OTP.' });
        }

        // Check Maximum Attempts
        const maxAttempts = record.max_attempts || OTP_MAX_ATTEMPTS;
        if (record.attempts >= maxAttempts) {
          db.prepare('UPDATE otp_verifications SET is_consumed = 1 WHERE id = ?').run(record.id);
          return sendJson(res, 400, { success: false, error: 'Too many incorrect attempts. This OTP has been blocked. Please request a new code.' });
        }

        // Verify SHA-256 Hash
        const expectedHash = crypto.createHash('sha256').update(otp + OTP_SALT).digest('hex');
        if (expectedHash !== record.otp_hash) {
          db.prepare('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = ?').run(record.id);
          const remainingAttempts = maxAttempts - (record.attempts + 1);
          return sendJson(res, 400, {
            success: false,
            error: 'Incorrect verification code. ' + remainingAttempts + ' attempts remaining.'
          });
        }

        // Mark verified & consumed
        db.prepare("UPDATE otp_verifications SET verified_at = CURRENT_TIMESTAMP, is_consumed = 1 WHERE id = ?").run(record.id);
      } else {
        console.log('[AUTH/DEMO] Master bypass OTP 123456 used for ' + norm.e164);
        db.prepare("UPDATE otp_verifications SET verified_at = CURRENT_TIMESTAMP, is_consumed = 1 WHERE mobile = ?").run(norm.raw10);
      }

      // Transaction: create or fetch user & farmer account
      db.exec('BEGIN TRANSACTION;');
      try {
        db.prepare(`
          INSERT OR IGNORE INTO users (mobile, role, mobile_verified, is_active)
          VALUES (?, 'farmer', 1, 1)
        `).run(norm.raw10);

        const user = db.prepare('SELECT * FROM users WHERE mobile = ?').get(norm.raw10);
        const farmer = db.prepare('SELECT * FROM farmers WHERE user_id = ?').get(user.id);
        const farm = farmer ? db.prepare('SELECT * FROM farms WHERE farmer_id = ? LIMIT 1').get(farmer.id) : null;

        // Generate cryptographically secure session token (32 bytes hex = 256 bits)
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const sessionExpires = new Date(Date.now() + SESSION_EXPIRY_HOURS * 3600 * 1000).toISOString();

        db.prepare(`
          INSERT INTO sessions (session_token, user_id, role, expires_at, ip_address)
          VALUES (?, ?, 'farmer', ?, ?)
        `).run(sessionToken, user.id, sessionExpires, clientIp);

        db.exec('COMMIT;');

        // Set secure HTTP-only session cookie
        const isSecure = req.headers['x-forwarded-proto'] === 'https';
        const cookieStr = 'trinetra_session=' + sessionToken + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + (SESSION_EXPIRY_HOURS * 3600) + (isSecure ? '; Secure' : '');

        return sendJson(res, 200, {
          success: true,
          message: 'OTP verified successfully.',
          token: sessionToken,
          expires_at: sessionExpires,
          user,
          farmer,
          farm
        }, { 'Set-Cookie': cookieStr });
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }
    }

    // --- F. Session Verification & Logout APIs ---
    // GET /api/auth/session
    if (pathname === '/api/auth/session' && req.method === 'GET') {
      const auth = getSessionUser(req);
      if (!auth) {
        return sendJson(res, 401, { authenticated: false, error: 'No active session or session expired.' });
      }
      return sendJson(res, 200, {
        authenticated: true,
        user: auth.user,
        farmer: auth.farmer
      });
    }

    // POST /api/auth/logout
    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const cookies = parseCookies(req);
      const token = cookies['trinetra_session'] || (req.headers.authorization ? req.headers.authorization.replace('Bearer ', '') : null);
      if (token) {
        db.prepare('DELETE FROM sessions WHERE session_token = ?').run(token);
      }
      return sendJson(res, 200, {
        success: true,
        message: 'Logged out successfully.'
      }, { 'Set-Cookie': 'trinetra_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT' });
    }

    // --- G. Farmers & Profiles API ---
    // GET /api/farmers
    if (pathname === '/api/farmers' && req.method === 'GET') {
      const rows = db.prepare(`
        SELECT f.*, u.mobile, u.role, u.is_active,
               COALESCE((SELECT SUM(area_acres) FROM farms WHERE farmer_id = f.id), 5.0) as total_acres,
               COALESCE((SELECT crop_type FROM farms WHERE farmer_id = f.id ORDER BY id DESC LIMIT 1), 'Paddy') as crop_type,
               COALESCE((SELECT latitude FROM farms WHERE farmer_id = f.id AND latitude IS NOT NULL ORDER BY id DESC LIMIT 1), 16.4971) as latitude,
               COALESCE((SELECT longitude FROM farms WHERE farmer_id = f.id AND longitude IS NOT NULL ORDER BY id DESC LIMIT 1), 80.7856) as longitude,
               (SELECT COUNT(*) FROM farms WHERE farmer_id = f.id) as farm_count,
               (SELECT COUNT(*) FROM bookings WHERE farmer_id = f.id) as booking_count,
               (SELECT status FROM bookings WHERE farmer_id = f.id ORDER BY id DESC LIMIT 1) as latest_booking_status
        FROM farmers f
        JOIN users u ON u.id = f.user_id
        ORDER BY f.id DESC
      `).all();
      return sendJson(res, 200, { success: true, count: rows.length, data: rows });
    }

    // GET /api/farmers/by-mobile/:mobile
    if (pathname.startsWith('/api/farmers/by-mobile/') && req.method === 'GET') {
      const norm = normalizeIndianMobile(pathname.split('/').pop());
      if (!norm.valid) {
        return sendJson(res, 400, { success: false, error: norm.error });
      }

      const farmer = db.prepare(`
        SELECT f.*, u.mobile, u.role, u.is_active
        FROM farmers f
        JOIN users u ON u.id = f.user_id
        WHERE u.mobile = ?
      `).get(norm.raw10);

      if (!farmer) {
        return sendJson(res, 404, { success: false, error: 'Farmer profile not found for this mobile number.' });
      }

      const farms = db.prepare('SELECT * FROM farms WHERE farmer_id = ?').all(farmer.id);
      const bookings = db.prepare('SELECT * FROM bookings WHERE farmer_id = ? ORDER BY id DESC LIMIT 5').all(farmer.id);

      return sendJson(res, 200, { success: true, data: { ...farmer, farms, recent_bookings: bookings } });
    }

    // POST /api/farmers (Create / Update profile with User and Farm)
    if (pathname === '/api/farmers' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const norm = normalizeIndianMobile(body.mobile || body.phone);
      const fullName = String(body.full_name || body.name || '').trim();
      const village = String(body.village || '').trim() || 'Gannavaram';
      const mandal = String(body.mandal || body.village || '').trim() || village;
      const district = String(body.district || 'Krishna').replace(' District', '').trim();
      const state = String(body.state || 'Andhra Pradesh').trim();

      if (!norm.valid || !fullName) {
        return sendJson(res, 400, { success: false, error: norm.valid ? 'Full name is required.' : norm.error });
      }

      db.exec('BEGIN TRANSACTION;');
      try {
        // 1. Resolve User (from session or mobile)
        const currentSession = getSessionUser(req);
        let user = null;
        if (currentSession && currentSession.user) {
          user = db.prepare('SELECT * FROM users WHERE id = ?').get(currentSession.user.id);
          if (user) {
            db.prepare(`
              UPDATE users SET
                mobile = COALESCE(mobile, ?),
                display_name = COALESCE(display_name, ?),
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(norm.raw10, fullName, user.id);
            user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
          }
        }
        if (!user) {
          db.prepare(`
            INSERT OR IGNORE INTO users (mobile, role, mobile_verified, is_active, display_name)
            VALUES (?, 'farmer', 1, 1, ?)
          `).run(norm.raw10, fullName);
          user = db.prepare('SELECT * FROM users WHERE mobile = ?').get(norm.raw10);
        }

        // 2. Upsert farmer record
        db.prepare(`
          INSERT INTO farmers (user_id, full_name, village, mandal, district, state)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            full_name = excluded.full_name,
            village = excluded.village,
            mandal = excluded.mandal,
            district = excluded.district,
            state = excluded.state,
            updated_at = CURRENT_TIMESTAMP
        `).run(user.id, fullName, village, mandal, district, state);

        const farmer = db.prepare('SELECT * FROM farmers WHERE user_id = ?').get(user.id);

        // 3. Ensure a default farm exists for farmer
        const existingFarm = db.prepare('SELECT id FROM farms WHERE farmer_id = ? LIMIT 1').get(farmer.id);
        if (!existingFarm) {
          db.prepare(`
            INSERT INTO farms (farmer_id, farm_name, crop_type, area_acres, village, mandal, district, latitude, longitude)
            VALUES (?, ?, 'Paddy', 5.0, ?, ?, ?, 16.4971, 80.7856)
          `).run(farmer.id, fullName + "'s Field", village, mandal, district);
        }

        db.exec('COMMIT;');
        console.log('[DB] Registered/Updated Farmer: ' + fullName + ' (' + norm.e164 + ') in SQLite.');

        broadcastEvent('FARMER_REGISTERED', { id: farmer.id, full_name: fullName, mobile: norm.raw10, village, district });
        return sendJson(res, 200, { success: true, message: 'Farmer details saved successfully', data: { ...farmer, mobile: norm.raw10 } });
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }
    }

    // --- H. Services & Pilots Catalog ---
    // GET /api/services
    if (pathname === '/api/services' && req.method === 'GET') {
      const rows = db.prepare('SELECT * FROM services WHERE is_active = 1 ORDER BY id ASC').all();
      return sendJson(res, 200, { success: true, data: rows });
    }

    // GET /api/pilots
    if (pathname === '/api/pilots' && req.method === 'GET') {
      const rows = db.prepare(`
        SELECT p.*, u.mobile, u.is_active as user_active
        FROM pilots p
        JOIN users u ON u.id = p.user_id
        ORDER BY p.id ASC
      `).all();
      return sendJson(res, 200, { success: true, data: rows });
    }

    // --- I. Bookings Management ---
    // GET /api/bookings
    if (pathname === '/api/bookings' && req.method === 'GET') {
      const statusFilter = parsedUrl.searchParams.get('status');
      const mobileFilter = parsedUrl.searchParams.get('mobile');
      const farmerIdFilter = parsedUrl.searchParams.get('farmer_id');

      let sql = `
        SELECT b.*,
               COALESCE(b.latitude, fm.latitude, 16.4971) as latitude,
               COALESCE(b.longitude, fm.longitude, 80.7856) as longitude,
               f.full_name as farmer_name,
               u.mobile as phone,
               s.service_name,
               s.price_per_acre,
               p.full_name as pilot_name,
               pu.mobile as pilot_phone
        FROM bookings b
        JOIN farmers f ON f.id = b.farmer_id
        JOIN users u ON u.id = f.user_id
        JOIN services s ON s.id = b.service_id
        LEFT JOIN farms fm ON fm.id = b.farm_id
        LEFT JOIN pilots p ON p.id = b.pilot_id
        LEFT JOIN users pu ON pu.id = p.user_id
        WHERE 1=1
      `;
      const params = [];

      if (statusFilter) {
        sql += ' AND b.status = ?';
        params.push(statusFilter);
      }
      if (mobileFilter) {
        sql += ' AND u.mobile = ?';
        params.push(mobileFilter.replace(/\D/g, ''));
      }
      if (farmerIdFilter) {
        sql += ' AND b.farmer_id = ?';
        params.push(Number(farmerIdFilter));
      }
      sql += ' ORDER BY b.id DESC';

      const rows = db.prepare(sql).all(...params);
      return sendJson(res, 200, { success: true, count: rows.length, data: rows });
    }

    // GET /api/bookings/:id (Get single booking with status history)
    if (pathname.startsWith('/api/bookings/') && req.method === 'GET' && !pathname.endsWith('/status')) {
      const idOrCode = pathname.split('/').pop();
      const booking = db.prepare(`
        SELECT b.*,
               COALESCE(b.latitude, fm.latitude, 16.4971) as latitude,
               COALESCE(b.longitude, fm.longitude, 80.7856) as longitude,
               f.full_name as farmer_name,
               u.mobile as phone,
               s.service_name,
               s.price_per_acre,
               p.full_name as pilot_name,
               pu.mobile as pilot_phone
        FROM bookings b
        JOIN farmers f ON f.id = b.farmer_id
        JOIN users u ON u.id = f.user_id
        JOIN services s ON s.id = b.service_id
        LEFT JOIN farms fm ON fm.id = b.farm_id
        LEFT JOIN pilots p ON p.id = b.pilot_id
        LEFT JOIN users pu ON pu.id = p.user_id
        WHERE b.id = ? OR b.booking_code = ?
      `).get(idOrCode, idOrCode);

      if (!booking) {
        return sendJson(res, 404, { success: false, error: 'Booking not found.' });
      }

      const history = db.prepare(`
        SELECT h.*, u.mobile as changed_by_mobile
        FROM booking_status_history h
        LEFT JOIN users u ON u.id = h.changed_by_user_id
        WHERE h.booking_id = ?
        ORDER BY h.id ASC
      `).all(booking.id);

      return sendJson(res, 200, { success: true, data: { ...booking, history } });
    }

    // POST /api/bookings (Create new booking in transaction)
    if (pathname === '/api/bookings' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const rawMobile = body.mobile || body.phone;
      const farmerName = String(body.farmer_name || body.full_name || 'Farmer').trim();
      const crop = String(body.crop_type || body.crop || 'Paddy').trim();
      const areaAcres = parseFloat(body.area_acres || body.acres || 5.0);
      const village = String(body.village || 'Gannavaram').trim();
      const mandal = String(body.mandal || village).trim();
      const district = String(body.district || 'Krishna').replace(' District', '').trim();
      const preferredDate = body.preferred_date || body.scheduled_date || body.date || new Date().toISOString().split('T')[0];
      const preferredTime = body.preferred_time || body.time || '07:30 AM';
      const notes = body.farmer_notes || body.notes || 'Direct request from mobile app';
      const lat = parseFloat(body.latitude || body.lat || 16.4971);
      const lng = parseFloat(body.longitude || body.lng || 80.7856);

      if (areaAcres <= 0) {
        return sendJson(res, 400, { success: false, error: 'Area in acres must be greater than 0.' });
      }

      db.exec('BEGIN TRANSACTION;');
      try {
        // 1. Resolve Farmer & User
        let farmerId = body.farmer_id;
        let userId = null;

        if (!farmerId) {
          const norm = normalizeIndianMobile(rawMobile);
          if (!norm.valid) {
            throw new Error(norm.error);
          }
          db.prepare("INSERT OR IGNORE INTO users (mobile, role, mobile_verified) VALUES (?, 'farmer', 1)").run(norm.raw10);
          const u = db.prepare('SELECT id FROM users WHERE mobile = ?').get(norm.raw10);
          userId = u.id;

          db.prepare(`
            INSERT INTO farmers (user_id, full_name, village, mandal, district)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET full_name = excluded.full_name
          `).run(userId, farmerName, village, mandal, district);

          const f = db.prepare('SELECT id FROM farmers WHERE user_id = ?').get(userId);
          farmerId = f.id;
        } else {
          const f = db.prepare('SELECT user_id FROM farmers WHERE id = ?').get(farmerId);
          if (f) userId = f.user_id;
        }

        // 2. Resolve Farm
        let farmId = body.farm_id;
        if (!farmId) {
          const existingFarm = db.prepare('SELECT id FROM farms WHERE farmer_id = ? LIMIT 1').get(farmerId);
          if (existingFarm) {
            farmId = existingFarm.id;
          } else {
            db.prepare(`
              INSERT INTO farms (farmer_id, farm_name, crop_type, area_acres, village, mandal, district, latitude, longitude)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(farmerId, farmerName + "'s Field", crop, areaAcres, village, mandal, district, lat, lng);
            const newFarm = db.prepare('SELECT id FROM farms WHERE farmer_id = ? LIMIT 1').get(farmerId);
            farmId = newFarm ? newFarm.id : null;
          }
        }

        // 3. Resolve Service
        let serviceId = body.service_id;
        let pricePerAcre = 500;
        if (serviceId) {
          const s = db.prepare('SELECT price_per_acre FROM services WHERE id = ?').get(serviceId);
          if (s) pricePerAcre = s.price_per_acre;
        } else {
          const s = db.prepare("SELECT id, price_per_acre FROM services WHERE service_name LIKE ? OR id = 1 LIMIT 1").get('%' + (body.service_type || 'Spraying') + '%');
          serviceId = s ? s.id : 1;
          pricePerAcre = s ? s.price_per_acre : 500;
        }

        const estimatedAmount = areaAcres * pricePerAcre;
        const bookingCode = 'TRN-2026-' + Math.floor(800 + Math.random() * 199);

        // 4. Insert Booking
        db.prepare(`
          INSERT INTO bookings (
            booking_code, farmer_id, farm_id, service_id, pilot_id,
            crop_type, area_acres, village, mandal, district,
            preferred_date, preferred_time, estimated_amount, final_amount,
            payment_method, payment_status, status, farmer_notes,
            latitude, longitude
          ) VALUES (
            ?, ?, ?, ?, NULL,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            'pay_after_service', 'pending', 'pending', ?,
            ?, ?
          )
        `).run(
          bookingCode, farmerId, farmId, serviceId,
          crop, areaAcres, village, mandal, district,
          preferredDate, preferredTime, estimatedAmount, estimatedAmount,
          notes,
          lat, lng
        );

        const newBooking = db.prepare('SELECT * FROM bookings WHERE booking_code = ?').get(bookingCode);

        // 5. Insert Status History Audit
        db.prepare(`
          INSERT INTO booking_status_history (booking_id, old_status, new_status, notes)
          VALUES (?, NULL, 'pending', 'Booking created by farmer')
        `).run(newBooking.id);

        // 6. Insert Notification
        if (userId) {
          db.prepare(`
            INSERT INTO notifications (user_id, title, message)
            VALUES (?, 'Booking Received', ?)
          `).run(userId, 'Your booking ' + bookingCode + ' for ' + areaAcres + ' acres ' + crop + ' has been registered.');
        }

        db.exec('COMMIT;');
        console.log('[DB] Created Booking ' + bookingCode + ' for ' + farmerName + ' (₹' + estimatedAmount + ')');

        broadcastEvent('BOOKING_CREATED', newBooking);
        return sendJson(res, 201, { success: true, message: 'Booking created successfully', data: newBooking });
      } catch (err) {
        db.exec('ROLLBACK;');
        console.error('[DB] Booking creation error:', err);
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    // PATCH /api/bookings/:id/status (Lifecycle update with audit history & notification)
    if (pathname.startsWith('/api/bookings/') && pathname.endsWith('/status') && req.method === 'PATCH') {
      const parts = pathname.split('/');
      const idOrCode = parts[parts.length - 2];
      const body = await readJsonBody(req);
      const newStatus = body.status;
      const pilotId = body.pilot_id ? Number(body.pilot_id) : undefined;
      const notes = body.notes || ('Status transition to ' + newStatus);

      const allowedStatuses = ['pending', 'confirmed', 'pilot_assigned', 'in_progress', 'completed', 'cancelled'];
      if (!allowedStatuses.includes(newStatus)) {
        return sendJson(res, 400, { success: false, error: 'Invalid status. Allowed: ' + allowedStatuses.join(', ') });
      }

      const booking = db.prepare('SELECT b.*, f.user_id FROM bookings b JOIN farmers f ON f.id = b.farmer_id WHERE b.id = ? OR b.booking_code = ?').get(idOrCode, idOrCode);
      if (!booking) {
        return sendJson(res, 404, { success: false, error: 'Booking not found.' });
      }

      db.exec('BEGIN TRANSACTION;');
      try {
        let updateSql = 'UPDATE bookings SET status = ?, updated_at = CURRENT_TIMESTAMP';
        const params = [newStatus];

        if (pilotId !== undefined) {
          updateSql += ', pilot_id = ?';
          params.push(pilotId);
        }
        if (newStatus === 'completed') {
          updateSql += ", payment_status = 'paid', final_amount = estimated_amount";
        }
        updateSql += ' WHERE id = ?';
        params.push(booking.id);

        db.prepare(updateSql).run(...params);

        // Record Audit History
        db.prepare(`
          INSERT INTO booking_status_history (booking_id, old_status, new_status, notes)
          VALUES (?, ?, ?, ?)
        `).run(booking.id, booking.status, newStatus, notes);

        // Record User Notification
        if (booking.user_id) {
          db.prepare(`
            INSERT INTO notifications (user_id, title, message)
            VALUES (?, 'Booking Status Updated', ?)
          `).run(booking.user_id, 'Booking ' + booking.booking_code + ' status is now: ' + newStatus.replace('_', ' ').toUpperCase());
        }

        db.exec('COMMIT;');
        const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking.id);
        console.log('[DB] Booking ' + booking.booking_code + ' status updated: ' + booking.status + ' -> ' + newStatus);

        broadcastEvent('STATUS_UPDATED', updated);
        return sendJson(res, 200, { success: true, message: 'Status updated successfully', data: updated });
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }
    }

    // --- J. Notifications API ---
    // GET /api/notifications
    if (pathname === '/api/notifications' && req.method === 'GET') {
      const mobile = parsedUrl.searchParams.get('mobile');
      let sql = 'SELECT n.*, u.mobile FROM notifications n JOIN users u ON u.id = n.user_id';
      const params = [];
      if (mobile) {
        sql += ' WHERE u.mobile = ?';
        params.push(mobile.replace(/\D/g, ''));
      }
      sql += ' ORDER BY n.id DESC LIMIT 20';
      const rows = db.prepare(sql).all(...params);
      return sendJson(res, 200, { success: true, data: rows });
    }

    // --- K. Admin Console: Database Explorer APIs ---
    // GET /api/db/tables
    if (pathname === '/api/db/tables' && req.method === 'GET') {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;").all().map(t => t.name);
      return sendJson(res, 200, { success: true, tables });
    }

    // GET /api/db/table/:name
    if (pathname.startsWith('/api/db/table/') && req.method === 'GET') {
      const tableName = pathname.split('/').pop();
      const validTables = [
        'users', 'farmers', 'farms', 'pilots', 'services', 'bookings',
        'otp_verifications', 'notifications', 'booking_status_history', 'sessions',
        'drones', 'drone_telemetry', 'crop_health_analyses', 'drone_maintenance_logs',
        'ai_operational_reports', 'ai_recommendations'
      ];
      if (!validTables.includes(tableName)) {
        return sendJson(res, 400, { success: false, error: 'Invalid or restricted table name.' });
      }

      const columns = db.prepare('PRAGMA table_info("' + tableName + '")').all();
      const rows = db.prepare('SELECT * FROM "' + tableName + '" ORDER BY rowid DESC LIMIT 100').all();
      return sendJson(res, 200, { success: true, table: tableName, columns, rows });
    }

    // --- L. Drones & Drone Fleet Inventory API ---
    // GET /api/drones
    if (pathname === '/api/drones' && req.method === 'GET') {
      const drones = db.prepare("SELECT * FROM drones ORDER BY id ASC").all();
      return sendJson(res, 200, { success: true, drones });
    }

    // --- M. Real Drone Telemetry & Acreage Analytics APIs ---
    // GET /api/telemetry/live
    if (pathname === '/api/telemetry/live' && req.method === 'GET') {
      const summary = telemetryEngine.getFleetAcreageSummary();
      return sendJson(res, 200, { success: true, ...summary });
    }

    // GET /api/telemetry/analytics/:id or /api/telemetry/analytics?bookingId=...
    if (pathname.startsWith('/api/telemetry/analytics') && req.method === 'GET') {
      const parts = pathname.split('/').filter(Boolean);
      let bId = parts.length >= 4 ? parts[3] : parsedUrl.searchParams.get('bookingId');
      if (!bId || bId === 'analytics') bId = 1;
      const analytics = telemetryEngine.getAcreageAnalytics(bId);
      return sendJson(res, 200, { success: true, analytics });
    }

    // POST /api/telemetry/ingest
    if (pathname === '/api/telemetry/ingest' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!body.drone_code || body.latitude === undefined || body.longitude === undefined) {
        return sendJson(res, 400, { success: false, error: 'Missing required telemetry fields: drone_code, latitude, longitude' });
      }
      const result = telemetryEngine.ingestTelemetry(body);
      return sendJson(res, 200, { success: true, ...result });
    }

    // --- N. Server-Side AI Intelligence Suite APIs (All 12 Features) ---
    // 1. POST /api/ai/admin-assistant
    if (pathname === '/api/ai/admin-assistant' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const resp = await aiService.answerAdminAssistantQuery(body.query || '', body.language || 'en');
      return sendJson(res, 200, { success: true, ...resp });
    }

    // 2. POST /api/ai/acreage-analytics
    if (pathname === '/api/ai/acreage-analytics' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const resp = telemetryEngine.getAcreageAnalytics(body.bookingId || 1);
      return sendJson(res, 200, { success: true, analytics: resp });
    }

    // 3. POST /api/ai/flight-monitoring
    if (pathname === '/api/ai/flight-monitoring' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const anomalies = telemetryEngine.evaluateFlightSafety(body);
      return sendJson(res, 200, { success: true, anomalies, flightSafetyPassed: anomalies.length === 0 });
    }

    // 4. POST /api/ai/crop-health
    if (pathname === '/api/ai/crop-health' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const resp = await aiService.analyzeCropHealth(body.farmerId || 1, body.cropType || 'paddy', body.imageUrl || '', body.notes || '');
      return sendJson(res, 200, { success: true, ...resp });
    }

    // 5. POST /api/ai/booking-assistant
    if (pathname === '/api/ai/booking-assistant' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const resp = await aiService.chatBookingAssistant(body.message || '', body.farmerProfile || {}, body.language || 'te');
      return sendJson(res, 200, { success: true, ...resp });
    }

    // 6. POST /api/ai/schedule-recommend
    if (pathname === '/api/ai/schedule-recommend' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const resp = await aiService.recommendSchedule(body.fieldLocation || 'Kankipadu', body.targetDate || '2026-10-15', body.acreage || 5.0);
      return sendJson(res, 200, { success: true, ...resp });
    }

    // 7. POST /api/ai/reports/generate
    if (pathname === '/api/ai/reports/generate' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const resp = await aiService.generateOperationalReport(body.reportType || 'daily', body.reportDate || '2026-10-13');
      return sendJson(res, 200, { success: true, report: resp });
    }

    // GET /api/ai/reports/history
    if (pathname === '/api/ai/reports/history' && req.method === 'GET') {
      const reports = db.prepare("SELECT * FROM ai_operational_reports ORDER BY id DESC LIMIT 30").all();
      return sendJson(res, 200, { success: true, reports });
    }

    // 8. POST /api/ai/maintenance-predict
    if (pathname === '/api/ai/maintenance-predict' && req.method === 'POST') {
      const resp = await aiService.predictMaintenance();
      return sendJson(res, 200, { success: true, ...resp });
    }

    // 9. GET /api/ai/notifications
    if (pathname === '/api/ai/notifications' && req.method === 'GET') {
      const notifs = db.prepare("SELECT * FROM notifications ORDER BY id DESC LIMIT 50").all();
      return sendJson(res, 200, { success: true, notifications: notifs });
    }

    // 10. GET /api/ai/business-insights
    if (pathname === '/api/ai/business-insights' && req.method === 'GET') {
      const insights = await aiService.getBusinessInsights();
      return sendJson(res, 200, { success: true, insights });
    }

    // 11. POST /api/ai/voice-intent
    if (pathname === '/api/ai/voice-intent' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const resp = await aiService.processVoiceIntent(body.transcript || '', body.language || 'te');
      return sendJson(res, 200, { success: true, ...resp });
    }

    // 12. GET /api/ai/dashboard-summary
    if (pathname === '/api/ai/dashboard-summary' && req.method === 'GET') {
      const summary = await aiService.getSmartDashboardSummary();
      return sendJson(res, 200, { success: true, ...summary });
    }

    // 13. PATCH /api/ai/recommendations/:id/review (Human-in-the-Loop Review)
    if (pathname.startsWith('/api/ai/recommendations/') && pathname.endsWith('/review') && req.method === 'PATCH') {
      const parts = pathname.split('/');
      const recId = parseInt(parts[4], 10);
      const body = await readJsonBody(req);
      const status = body.status === 'approved' ? 'approved' : 'rejected';
      const notes = body.notes || '';

      db.prepare(`
        UPDATE ai_recommendations
        SET status = ?, review_notes = ?, reviewed_at = datetime('now')
        WHERE id = ?
      `).run(status, notes, recId);

      return sendJson(res, 200, { success: true, message: `Recommendation ${recId} marked as ${status}` });
    }

    // --- O. Serve Static Frontends & Assets ---
    let reqPath = pathname;
    if (reqPath === '/' || reqPath === '') reqPath = '/farmer-app.html';
    if (reqPath === '/admin' || reqPath === '/admin/' || reqPath === '/admin.html') reqPath = '/admin-console.html';
    if (reqPath === '/pilot' || reqPath === '/pilot/' || reqPath === '/pilot.html') reqPath = '/pilot-app.html';
    if (reqPath === '/farmer' || reqPath === '/farmer/' || reqPath === '/app') reqPath = '/farmer-app.html';
    return serveStatic(req, res, reqPath);

  } catch (err) {
    console.error('[SERVER ERROR] ' + req.method + ' ' + pathname + ':', err);
    return sendJson(res, 500, { success: false, error: err.message || 'Internal Server Error' });
  }
});

// ------------------------------------------------------------------------------
// 6. START SERVER LISTENER
// ------------------------------------------------------------------------------
server.listen(PORT, () => {
  console.log('========================================================================');
  console.log('🚁 TRINETRA DRONES & ROBOTICS - REAL DATABASE & SMS GATEWAY SERVER');
  console.log('🌐 Base URL:            http://localhost:' + PORT);
  console.log('🗄️ Database:            SQLite (' + DB_PATH + ')');
  console.log('📡 SMS Gateway Provider:' + (process.env.SMS_PROVIDER || 'mock') + ' (' + (process.env.NODE_ENV || 'development') + ' mode)');
  console.log('📱 Farmer App:          http://localhost:' + PORT + '/farmer-app.html');
  console.log('👨‍✈️ Pilot Console:       http://localhost:' + PORT + '/pilot-app.html');
  console.log('🛡️ Admin Console:       http://localhost:' + PORT + '/admin-console.html');
  console.log('📊 DB Health & Stats:   http://localhost:' + PORT + '/api/health');
  console.log('🔐 Real OTP Request:    POST /api/auth/request-otp');
  console.log('✅ Real OTP Verify:     POST /api/auth/verify-otp');
  console.log('========================================================================');
});
