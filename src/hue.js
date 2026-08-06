const http = require('http');
const huejay = require('huejay');
const db = require('./db');

let client;
const authentication = {
  status: 'pending',
  isAuthenticated: false
};

function normalizeHost(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`);
    return url.hostname.replace(/^\[|\]$/g, '');
  } catch (error) {
    return raw;
  }
}

function authenticate() {
  const config = db.get('hue').value();
  client = new huejay.Client({
    host: normalizeHost(config.host),
    port: 80,
    username: config.username,
    timeout: 15000
  });
  return client;
}

authenticate();

async function isAuthenticated() {
  const config = db.get('hue').value();
  if (!config.host || !config.username) {
    authentication.status = 'error';
    authentication.isAuthenticated = false;
    return false;
  }

  try {
    await client.bridge.isAuthenticated();
    authentication.status = 'success';
    authentication.isAuthenticated = true;
    return true;
  } catch (error) {
    authentication.status = 'error';
    authentication.isAuthenticated = false;
    return false;
  }
}

isAuthenticated();

function createUser(ip) {
  const temporaryClient = new huejay.Client({
    host: normalizeHost(ip),
    port: 80,
    timeout: 15000
  });
  const user = new temporaryClient.users.User();
  user.deviceType = 'hellohue';
  return temporaryClient.users.create(user);
}

function createUserWithClientKey(ip) {
  return new Promise((resolve, reject) => {
    const host = normalizeHost(ip);
    const payload = JSON.stringify({
      devicetype: 'hellohue',
      generateclientkey: true
    });

    const req = http.request({
      hostname: host,
      port: 80,
      path: '/api',
      method: 'POST',
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Hue bridge returned HTTP ${res.statusCode}`));
        }

        try {
          const result = JSON.parse(body);
          const entry = Array.isArray(result) ? result[0] : null;
          if (entry && entry.success && entry.success.username) {
            return resolve({
              username: entry.success.username,
              clientkey: entry.success.clientkey || ''
            });
          }
          if (entry && entry.error) {
            const error = new Error(entry.error.description || 'Hue bridge rejected user creation');
            error.type = entry.error.type;
            return reject(error);
          }
          return reject(new Error('Unexpected response from Hue bridge'));
        } catch (error) {
          return reject(new Error(`Invalid response from Hue bridge: ${error.message}`));
        }
      });
    });

    req.on('timeout', () => req.destroy(new Error('Hue bridge request timed out')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = {
  get client() { return client; },
  authentication,
  authenticate,
  isAuthenticated,
  createUser,
  createUserWithClientKey,
  normalizeHost
};
