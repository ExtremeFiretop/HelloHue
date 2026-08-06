const db = require('./db');
const PlexAPI = require('plex-api');
const { parsePlexEndpoint } = require('./plex-endpoint');

let client;
const authentication = {
  status: 'pending',
  isAuthenticated: false
};

function authenticate() {
  const config = db.get('plex').value();
  const endpoint = parsePlexEndpoint(config);

  client = new PlexAPI({
    hostname: endpoint.hostname || '127.0.0.1',
    port: endpoint.port,
    https: endpoint.protocol === 'https:',
    token: config.token || ''
  });

  return client;
}

async function isAuthenticated() {
  const config = db.get('plex').value();
  if (!config.host || !config.token) {
    authentication.status = 'error';
    authentication.isAuthenticated = false;
    return false;
  }

  try {
    await client.query('/');
    authentication.status = 'success';
    authentication.isAuthenticated = true;
    return true;
  } catch (error) {
    authentication.status = 'error';
    authentication.isAuthenticated = false;
    return false;
  }
}

authenticate();
isAuthenticated();

module.exports = {
  get client() { return client; },
  authentication,
  authenticate,
  isAuthenticated
};
