// ==============================================================================
// TRINETRA DRONES & ROBOTICS - GOOGLE IDENTITY SERVICES (GIS) AUTH MODULE
// Official ID Token Verification Engine
// Docs: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
// ==============================================================================

const https = require('node:https');

/**
 * Verifies a Google ID token credential against Google's official tokeninfo endpoint
 * Validates: signature, issuer, audience, and expiration
 *
 * @param {string} idToken - The JWT credential returned by Google Identity Services
 * @param {string} expectedClientId - The configured GOOGLE_CLIENT_ID from environment
 * @returns {Promise<{ valid: boolean, payload?: object, error?: string }>}
 */
async function verifyGoogleIdToken(idToken, expectedClientId = null) {
  if (!idToken || typeof idToken !== 'string') {
    return { valid: false, error: 'Google ID token credential is required.' };
  }

  const trimmedToken = idToken.trim();

  // Handle Mock/Test Tokens for automated unit testing (only in non-production)
  if (process.env.NODE_ENV !== 'production' && (trimmedToken.startsWith('test_google_') || trimmedToken.startsWith('mock_google_'))) {
    try {
      const parts = trimmedToken.split('::');
      const sub = parts[1] || 'google_sub_test_109283019283';
      const email = parts[2] || 'farmer.test@gmail.com';
      const name = parts[3] || 'Paina Venkatesh';
      const pic = parts[4] || 'https://lh3.googleusercontent.com/a/test-avatar';

      return {
        valid: true,
        payload: {
          sub: sub,
          email: email,
          email_verified: true,
          name: name,
          picture: pic,
          auth_time: Math.floor(Date.now() / 1000)
        }
      };
    } catch {
      return { valid: false, error: 'Malformed test Google credential.' };
    }
  }

  // Official verification via Google tokeninfo API
  return new Promise((resolve) => {
    const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(trimmedToken);

    const req = https.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);

          if (res.statusCode !== 200 || data.error) {
            return resolve({
              valid: false,
              error: data.error_description || data.error || ('Google token verification failed with status ' + res.statusCode)
            });
          }

          // 1. Verify Issuer
          const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
          if (!validIssuers.includes(data.iss)) {
            return resolve({ valid: false, error: 'Invalid Google token issuer: ' + data.iss });
          }

          // 2. Verify Audience (if expected client ID is configured)
          if (expectedClientId && data.aud !== expectedClientId) {
            return resolve({
              valid: false,
              error: 'Google Client ID mismatch. Expected: ' + expectedClientId + ', received: ' + data.aud
            });
          }

          // 3. Verify Expiration
          const expMs = parseInt(data.exp, 10) * 1000;
          if (expMs < Date.now()) {
            return resolve({ valid: false, error: 'Google ID token has expired.' });
          }

          // 4. Verify Subject ID
          if (!data.sub) {
            return resolve({ valid: false, error: 'Missing Google Subject ID (sub).' });
          }

          resolve({
            valid: true,
            payload: {
              sub: data.sub,
              email: data.email || null,
              email_verified: data.email_verified === 'true' || data.email_verified === true,
              name: data.name || data.given_name || 'Google Farmer',
              picture: data.picture || null,
              given_name: data.given_name || '',
              family_name: data.family_name || ''
            }
          });
        } catch (err) {
          resolve({ valid: false, error: 'Failed to parse Google verification response: ' + err.message });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ valid: false, error: 'Network error contacting Google OAuth servers: ' + err.message });
    });

    req.setTimeout(8000, () => {
      req.destroy();
      resolve({ valid: false, error: 'Google verification timed out after 8s.' });
    });
  });
}

module.exports = {
  verifyGoogleIdToken
};
