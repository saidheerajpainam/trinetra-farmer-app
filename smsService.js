// ==============================================================================
// TRINETRA DRONES & ROBOTICS - SMS GATEWAY INTEGRATION SERVICE
// Multi-Provider Engine: MSG91, Twilio, Fast2SMS & Development Mock
// ==============================================================================

const https = require('node:https');
const http = require('node:http');

/**
 * Validates and normalizes Indian mobile numbers
 * Accepts: "9876543210", "+919876543210", "09876543210", "+91 98765 43210"
 * Returns: { valid: boolean, raw10: string, e164: string, withCountryCode: string, error?: string }
 */
function normalizeIndianMobile(input) {
  if (!input) {
    return { valid: false, error: 'Mobile number is required.' };
  }

  // Strip all non-digit characters
  let digits = String(input).replace(/\D/g, '');

  // Handle leading 0 (e.g. 09876543210)
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // Handle leading 91 (e.g. 919876543210)
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }

  // Verify exactly 10 digits
  if (digits.length !== 10) {
    return { valid: false, error: 'Mobile number must be a 10-digit Indian number.' };
  }

  // Indian numbers must begin with 6, 7, 8, or 9
  if (!/^[6-9]\d{9}$/.test(digits)) {
    return { valid: false, error: 'Invalid Indian mobile number. Must start with 6, 7, 8, or 9.' };
  }

  return {
    valid: true,
    raw10: digits,
    e164: '+91' + digits,
    withCountryCode: '91' + digits
  };
}

/**
 * Helper to perform HTTP/HTTPS POST requests without external dependencies
 */
function makeHttpRequest(urlStr, options = {}, postData = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlStr);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const reqOptions = {
      method: options.method || 'POST',
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      headers: options.headers || {}
    };

    if (options.auth) {
      reqOptions.auth = options.auth;
    }

    const req = client.request(reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ statusCode: res.statusCode, data: json, raw: body });
        } catch {
          resolve({ statusCode: res.statusCode, data: null, raw: body });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(options.timeout || 10000, () => {
      req.destroy();
      reject(new Error('SMS Gateway connection timed out after 10s'));
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

/**
 * MSG91 SMS Provider Implementation
 * Docs: https://docs.msg91.com/p/tf9GText/5/otp
 */
async function sendViaMSG91({ mobile10, withCountryCode, otp, config }) {
  const authKey = config.MSG91_AUTH_KEY;
  const templateId = config.MSG91_TEMPLATE_ID;
  const senderId = config.MSG91_SENDER_ID || 'TRINTR';

  if (!authKey || !templateId) {
    throw new Error('MSG91 configuration incomplete: MSG91_AUTH_KEY and MSG91_TEMPLATE_ID are required.');
  }

  const endpoint = 'https://control.msg91.com/api/v5/otp?template_id=' + encodeURIComponent(templateId) +
                   '&mobile=' + encodeURIComponent(withCountryCode) +
                   '&authkey=' + encodeURIComponent(authKey) +
                   '&otp=' + encodeURIComponent(otp);
  
  const payload = JSON.stringify({
    template_id: templateId,
    mobile: withCountryCode,
    otp: otp,
    sender: senderId
  });

  const response = await makeHttpRequest(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'authkey': authKey
    }
  }, payload);

  if (response.statusCode >= 200 && response.statusCode < 300) {
    const data = response.data || {};
    if (data.type === 'success' || data.type === 'default') {
      return {
        success: true,
        delivery_status: 'accepted',
        provider: 'msg91',
        provider_reference: data.message || ('msg91_' + Date.now())
      };
    }
    throw new Error(data.message || ('MSG91 returned status: ' + response.statusCode));
  }

  throw new Error('MSG91 API error (' + response.statusCode + '): ' + response.raw);
}

/**
 * Twilio SMS Provider Implementation
 */
async function sendViaTwilio({ e164, otp, config }) {
  const accountSid = config.TWILIO_ACCOUNT_SID;
  const authToken = config.TWILIO_AUTH_TOKEN;
  const fromNumber = config.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Twilio configuration incomplete: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER are required.');
  }

  const endpoint = 'https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json';
  const postBody = new URLSearchParams({
    To: e164,
    From: fromNumber,
    Body: 'Your Trinetra Drones & Robotics verification code is: ' + otp + '. Valid for 5 minutes. Do not share this code.'
  }).toString();

  const response = await makeHttpRequest(endpoint, {
    method: 'POST',
    auth: accountSid + ':' + authToken,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postBody)
    }
  }, postBody);

  if (response.statusCode >= 200 && response.statusCode < 300) {
    const data = response.data || {};
    return {
      success: true,
      delivery_status: data.status || 'sent',
      provider: 'twilio',
      provider_reference: data.sid || ('twilio_' + Date.now())
    };
  }

  const errDetail = response.data ? (response.data.message || response.data.error_message) : response.raw;
  throw new Error('Twilio API error (' + response.statusCode + '): ' + errDetail);
}

/**
 * Fast2SMS Provider Implementation (Indian OTP Gateway)
 */
async function sendViaFast2SMS({ mobile10, otp, config }) {
  const apiKey = config.FAST2SMS_API_KEY;
  if (!apiKey) {
    throw new Error('Fast2SMS configuration incomplete: FAST2SMS_API_KEY is required.');
  }

  const endpoint = 'https://www.fast2sms.com/dev/bulkV2';
  const payload = JSON.stringify({
    route: 'otp',
    variables_values: otp,
    numbers: mobile10
  });

  const response = await makeHttpRequest(endpoint, {
    method: 'POST',
    headers: {
      'authorization': apiKey,
      'Content-Type': 'application/json'
    }
  }, payload);

  if (response.statusCode >= 200 && response.statusCode < 300) {
    const data = response.data || {};
    if (data.return === true) {
      return {
        success: true,
        delivery_status: 'sent',
        provider: 'fast2sms',
        provider_reference: data.request_id || ('f2s_' + Date.now())
      };
    }
    throw new Error(data.message || 'Fast2SMS dispatch rejected');
  }

  throw new Error('Fast2SMS API error (' + response.statusCode + '): ' + response.raw);
}

/**
 * Mock Provider for local development & automated unit tests
 * Does NOT send external packets. Strictly logs to terminal.
 */
function sendViaMock({ mobile10, e164, otp }) {
  console.log('\n======================================================');
  console.log('📡 [MOCK SMS GATEWAY] Dispatching to Farmer Handset');
  console.log('📱 Recipient: ' + e164 + ' (Indian Handset)');
  console.log('💬 Message  : "Your Trinetra verification code is: ' + otp + '. Valid for 5 minutes."');
  console.log('🛡️ Security : SHA-256 hash saved in SQLite. Zero plaintext in DB.');
  console.log('======================================================\n');

  return {
    success: true,
    delivery_status: 'mock_delivered',
    provider: 'mock',
    provider_reference: 'mock_ref_' + Date.now() + '_' + mobile10.slice(-4),
    note: 'Simulated delivery in development mode. No SMS fees incurred.'
  };
}

/**
 * Main Dispatcher: Sends OTP using active provider
 */
async function dispatchSmsOtp({ mobile, otp, env = process.env }) {
  const normalized = normalizeIndianMobile(mobile);
  if (!normalized.valid) {
    return {
      success: false,
      delivery_status: 'failed',
      error: normalized.error
    };
  }

  const provider = (env.SMS_PROVIDER || 'mock').toLowerCase().trim();
  const isProd = env.NODE_ENV === 'production';

  try {
    if (provider === 'msg91') {
      return await sendViaMSG91({
        mobile10: normalized.raw10,
        withCountryCode: normalized.withCountryCode,
        otp,
        config: env
      });
    }

    if (provider === 'twilio') {
      return await sendViaTwilio({
        e164: normalized.e164,
        otp,
        config: env
      });
    }

    if (provider === 'fast2sms') {
      return await sendViaFast2SMS({
        mobile10: normalized.raw10,
        otp,
        config: env
      });
    }

    if (provider === 'mock') {
      if (isProd) {
        return {
          success: false,
          delivery_status: 'failed',
          error: 'Mock SMS provider is disabled in production environment. Configure MSG91 or Twilio credentials.'
        };
      }
      return sendViaMock({
        mobile10: normalized.raw10,
        e164: normalized.e164,
        otp
      });
    }

    return {
      success: false,
      delivery_status: 'failed',
      error: "Unsupported SMS provider: '" + provider + "'. Valid providers: msg91, twilio, fast2sms, mock."
    };
  } catch (err) {
    console.error("[SMS Service Error] Provider '" + provider + "' failed:", err.message);
    return {
      success: false,
      delivery_status: 'failed',
      provider,
      error: err.message
    };
  }
}

/**
 * Returns gateway health & configuration status
 */
function getGatewayStatus(env = process.env) {
  const provider = (env.SMS_PROVIDER || 'mock').toLowerCase().trim();
  const isProd = env.NODE_ENV === 'production';
  let isConfigured = false;

  if (provider === 'msg91') {
    isConfigured = Boolean(env.MSG91_AUTH_KEY && env.MSG91_TEMPLATE_ID);
  } else if (provider === 'twilio') {
    isConfigured = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER);
  } else if (provider === 'fast2sms') {
    isConfigured = Boolean(env.FAST2SMS_API_KEY);
  } else if (provider === 'mock') {
    isConfigured = !isProd;
  }

  return {
    provider,
    is_production: isProd,
    is_configured: isConfigured,
    supports_indian_mobile: true,
    dlt_ready: provider === 'msg91'
  };
}

module.exports = {
  normalizeIndianMobile,
  dispatchSmsOtp,
  getGatewayStatus
};
