const moment = require('moment');
const SunCalc = require('suncalc');
const db = require('./db');
const hue = require('./hue');
const plex = require('./plex');
const logger = require('./logger');
const status = require('./status');
const hambisync = require('./hambisync');
const audioSync = require('./audio-sync');

async function processWebhook(payload) {
  logger.info('Webhook notification received');

  if (!status.getStatus()) {
    logger.info('HelloHue is inactive, aborting webhook processing');
    return false;
  }

  const event = getEvent(payload && payload.event);
  if (!event) {
    logger.info('%s is not a supported event, aborting webhook processing', payload && payload.event);
    return false;
  }

  if (!payload.Player || !payload.Player.title) {
    logger.info('Webhook payload is missing Plex Player information');
    return false;
  }

  logger.info('Webhook from player: %s (uuid: %s)', payload.Player.title, payload.Player.uuid || 'unknown');

  const connections = db.get('connections').value() || [];
  const matchingConnections = connections.filter(connection => {
    if (!connection.active) return false;
    if (connection.player_uuid && payload.Player.uuid) {
      return connection.player_uuid === payload.Player.uuid;
    }
    return connection.player === payload.Player.title;
  });

  if (matchingConnections.length === 0) {
    logger.info('No active connection matched Plex player %s', payload.Player.title);
    return false;
  }

  let processed = false;
  for (const connection of matchingConnections) {
    if (!isUserAuthorized(payload, connection)) continue;
    if (!isItDark(connection)) continue;
    if (!await compareDuration(payload, connection)) continue;

    await triggerActions(event, connection[event], connection, payload);
    processed = true;
  }

  return processed;
}

async function triggerActions(event, action, connection, payload) {
  logger.info(
    'Triggering %s action in connection %s for %s event',
    action,
    connection.name,
    event
  );

  if (connection.entertainment_sync && connection.entertainment_group) {
    if (event === 'play' || event === 'resume') {
      const started = await audioSync.startSync(connection, payload);
      if (!started) {
        logger.warn('Entertainment sync did not start; falling back to the configured light action');
        await triggerLights(action, connection);
      }
    } else {
      await audioSync.stopSync(connection.id);
      await triggerLights(action, connection);
    }
  } else {
    await audioSync.stopSync(connection.id);
    await triggerLights(action, connection);
  }

  if (connection.hambisync) {
    triggerHambisync(event, connection);
  }
}

async function triggerLights(action, connection) {
  const lightAttributes = getLightAttributes(action, connection);
  if (!lightAttributes) return false;

  const lights = Array.isArray(connection.lights) ? connection.lights : [];
  const groups = Array.isArray(connection.groups) ? connection.groups : [];

  const lightUpdates = lights.map(async lightId => {
    try {
      const light = await hue.client.lights.getById(lightId);
      applyAttributes(light, lightAttributes);
      await hue.client.lights.save(light);
    } catch (error) {
      logger.error('Failed to update Hue light %s: %s', lightId, error.stack || error.message);
    }
  });

  const groupUpdates = groups.map(async groupId => {
    try {
      const group = await hue.client.groups.getById(groupId);
      applyAttributes(group, lightAttributes);
      await hue.client.groups.save(group);
    } catch (error) {
      logger.error('Failed to update Hue group %s: %s', groupId, error.stack || error.message);
    }
  });

  await Promise.all([...lightUpdates, ...groupUpdates]);
  return true;
}

function getLightAttributes(action, connection) {
  const transition = Number.isFinite(Number(connection.dim_transition))
    ? Number(connection.dim_transition)
    : 1;

  switch (action) {
    case 'turn_on':
      return { on: true, transitionTime: transition, brightness: 254 };
    case 'turn_off':
      return { on: false, transitionTime: transition };
    case 'dim':
      // Preserve ExtremeFiretop's established dim-transition behavior.
      return {
        on: true,
        transitionTime: transition / 10,
        brightness: Number(connection.dim_brightness) || 127
      };
    default:
      return null;
  }
}

function applyAttributes(target, attributes) {
  target.on = attributes.on;
  if (attributes.transitionTime !== undefined) {
    target.transitionTime = attributes.transitionTime;
  }
  if (attributes.brightness !== undefined) {
    target.brightness = attributes.brightness;
  }
}

function isUserAuthorized(payload, connection) {
  const users = Array.isArray(connection.users) ? connection.users : [];
  if (users.length === 0) return true;

  const accountTitle = payload.Account && payload.Account.title;
  if (!accountTitle || !users.includes(accountTitle)) {
    logger.info(
      'Plex user %s is not authorized for connection %s',
      accountTitle || 'unknown',
      connection.name
    );
    return false;
  }
  return true;
}

function isItDark(connection) {
  if (!connection.night_mode) return true;

  const location = db.get('location').value() || {};
  if (location.latitude === '' || location.longitude === '') return true;

  const now = moment();
  const times = SunCalc.getTimes(now.toDate(), Number(location.latitude), Number(location.longitude));
  if (now.isAfter(moment(times.sunrise)) && now.isBefore(moment(times.sunset))) {
    logger.info('Daylight hours for connection %s; ignoring webhook', connection.name);
    return false;
  }
  return true;
}

async function compareDuration(payload, connection) {
  const minimum = Number(connection.min_duration) || 0;
  if (minimum === 0) return true;
  if (!payload.Metadata || !payload.Metadata.key) return true;

  try {
    const result = await plex.client.query(payload.Metadata.key);
    const metadata = result.MediaContainer && result.MediaContainer.Metadata;
    const duration = metadata && metadata[0] && Number(metadata[0].duration);
    if (!Number.isFinite(duration)) return true;

    // Exact matches remain valid, preserving the behavior fixed in 1.0.1.
    if (duration < minimum) {
      logger.info('Media duration is below the minimum for connection %s', connection.name);
      return false;
    }
    return true;
  } catch (error) {
    logger.error('Unable to compare Plex media duration: %s', error.stack || error.message);
    // Preserve normal light behavior if Plex metadata is temporarily unavailable.
    return true;
  }
}

function triggerHambisync(event, connection) {
  logger.info('HAmbiSync enabled in connection %s, handling %s event', connection.name, event);
  // Preserve the original integration semantics: play starts it and stop ends it.
  if (event === 'play') hambisync.start();
  if (event === 'stop') hambisync.stop();
}

function getEvent(plexEvent) {
  switch (plexEvent) {
    case 'media.play': return 'play';
    case 'media.pause': return 'pause';
    case 'media.resume': return 'resume';
    case 'media.stop': return 'stop';
    default: return null;
  }
}

module.exports = processWebhook;
module.exports._internal = {
  getEvent,
  getLightAttributes,
  isUserAuthorized
};
