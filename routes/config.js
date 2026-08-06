const router = require('express').Router();
const hue = require('../src/hue');
const plex = require('../src/plex');
const db = require('../src/db');
const logger = require('../src/logger');
const audioSync = require('../src/audio-sync');
const { connectionDefaults } = require('../src/db');

const ACTIONS = new Set(['nothing', 'turn_on', 'turn_off', 'dim']);
const PALETTES = new Set([
  'auto', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink',
  'warm', 'cool', 'sunset', 'ocean', 'forest', 'party'
]);

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseIdList(value) {
  if (value === undefined || value === null || value === '') return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .map(item => Number.parseInt(item, 10))
    .filter(Number.isInteger);
}

function parseUsers(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map(user => user.trim())
    .filter(Boolean);
}

function actionOrDefault(value) {
  return ACTIONS.has(value) ? value : 'nothing';
}

router.post('/connection/add', (req, res) => {
  const connections = db.get('connections').value() || [];
  const maxId = connections.reduce((max, connection) => Math.max(max, Number(connection.id) || 0), 0);
  const id = maxId + 1;

  db.get('connections').push({
    id,
    ...connectionDefaults,
    name: `Connection ${id}`
  }).write();

  req.flash('success', 'Connection added!');
  res.redirect(`/#form-connection${id}`);
});

router.post('/connection/:id/delete', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const connection = db.get('connections').find({ id }).value();
  if (!connection) {
    req.flash('error', 'Connection not found.');
    return res.redirect('/');
  }

  await audioSync.stopSync(id);
  db.get('connections').remove({ id }).write();
  req.flash('success', 'Connection deleted!');
  return res.redirect('/');
});

router.post('/connection/:id', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const chain = db.get('connections').find({ id });
  const previous = chain.value();
  if (!previous) {
    req.flash('error', 'Connection not found.');
    return res.redirect('/');
  }

  const connection = {
    name: String(req.body.name || `Connection ${id}`).trim() || `Connection ${id}`,
    player: String(req.body.player || '').trim(),
    player_uuid: String(req.body.player_uuid || '').trim(),
    users: parseUsers(req.body.users),
    play: actionOrDefault(req.body.play),
    pause: actionOrDefault(req.body.pause),
    resume: actionOrDefault(req.body.resume),
    stop: actionOrDefault(req.body.stop),
    lights: parseIdList(req.body.lights),
    groups: parseIdList(req.body.groups),
    dim_brightness: clampInteger(req.body.dim_brightness, 127, 1, 254),
    dim_transition: clampInteger(req.body.dim_transition, 1, 0, 10),
    hambisync: Boolean(req.body.hambisync),
    night_mode: Boolean(req.body.night_mode),
    active: Boolean(req.body.active),
    min_duration: clampInteger(req.body.min_duration, 0, 0, 24 * 60 * 60 * 1000),
    entertainment_sync: Boolean(req.body.entertainment_sync),
    entertainment_group: String(req.body.entertainment_group || '').trim(),
    entertainment_reactiveness: clampInteger(req.body.entertainment_reactiveness, 50, 1, 100),
    entertainment_brightness: clampInteger(req.body.entertainment_brightness, 75, 1, 100),
    entertainment_palette: PALETTES.has(req.body.entertainment_palette)
      ? req.body.entertainment_palette
      : 'auto'
  };

  const entertainmentChanged =
    previous.entertainment_sync !== connection.entertainment_sync ||
    String(previous.entertainment_group || '') !== connection.entertainment_group ||
    previous.active !== connection.active;

  if (entertainmentChanged || !connection.active || !connection.entertainment_sync) {
    await audioSync.stopSync(id);
  }

  chain.assign(connection).write();
  req.flash('success', 'Connection saved!');
  return res.redirect(`/#form-connection${id}`);
});

router.post('/location', (req, res) => {
  let coordinates = { latitude: '', longitude: '' };
  if (req.body.latitude !== '' && req.body.longitude !== '') {
    const latitude = Number.parseFloat(req.body.latitude);
    const longitude = Number.parseFloat(req.body.longitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      coordinates = { latitude, longitude };
    }
  }

  db.set('location', coordinates).write();
  req.flash('success', 'Location saved!');
  res.redirect('/#form-location');
});

router.post('/plex', async (req, res) => {
  const plexConfig = {
    host: String(req.body.host || '').trim(),
    token: String(req.body.token || '').trim()
  };

  db.set('plex', plexConfig).write();
  plex.authenticate();
  const authenticated = await plex.isAuthenticated();
  req.flash(authenticated ? 'success' : 'error', authenticated ? 'Plex saved and connected!' : 'Plex saved, but the server could not be reached.');
  res.redirect('/#form-plex');
});

router.post('/hambisync', (req, res) => {
  db.set('hambisync', {
    host: String(req.body.host || '').trim(),
    port: String(req.body.port || '').trim()
  }).write();
  req.flash('success', 'HAmbiSync saved!');
  res.redirect('/#form-hambisync');
});

router.post('/connect', async (req, res) => {
  const host = String(req.body.host || '').trim();
  const previousConfig = db.get('hue').value();

  try {
    const result = await hue.createUserWithClientKey(host);
    db.set('hue', {
      username: result.username,
      clientkey: result.clientkey,
      host: hue.normalizeHost(host)
    }).write();
    hue.authenticate();
    const authenticated = await hue.isAuthenticated();
    if (!authenticated) throw new Error('Hue credentials were created but authentication failed');

    req.flash('success', 'Hue bridge connected with Entertainment API support!');
  } catch (error) {
    db.set('hue', previousConfig).write();
    hue.authenticate();
    await hue.isAuthenticated();

    if (error.type === 101) {
      logger.error('Hue link button was not pressed');
      req.flash('error', 'Link button not pressed. Press it and try again.');
    } else {
      logger.error('Hue bridge connection failed: %s', error.stack || error.message);
      req.flash('error', 'Could not connect to the Hue bridge. Existing credentials were preserved.');
    }
  }

  res.redirect('/#form-hue');
});

module.exports = router;
