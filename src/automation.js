const moment = require('moment');
const SunCalc = require('suncalc');
const db = require('./db');
const hambisync = require('./hambisync');
const hue = require('./hue');
const plex = require('./plex');
const logger = require('./logger');
const status = require('./status');

function processWebhook(payload) {
    logger.info('Webhook notification received');

    if (!isHelloHueActive()) {
        logger.info('HelloHue is inactive, ignoring webhook');
        return false;
    }

    let event = getEvent(payload.event);
    if (!event) {
        logger.info('%s is not a supported event, ignoring webhook', event);
        return false;
    }

    let matchingRooms = db.get('rooms').value()
        .filter(room => room.active === true && room.player === payload.Player.title);

    matchingRooms.forEach(room => {
        checkConditions(payload, room).then((result) => { if (result) return triggerActions(event, room); });
    });
}

async function checkConditions(payload, room) {
    const authCheck = isUserAuthorized(payload, room);
    const sunCheck = isItDark(room);
    const durationCheck = await compareDuration(payload, room);

    if (!authCheck) {
        logger.info('User %s not in room \'%s\', ignoring webhook', payload.Account.title, room['name']);
        return false;
    }

    if (!sunCheck) {
        logger.info('Sun shining in room \'%s\', ignoring webhook', room['name']);
        return false;
    }

    if (!durationCheck) {
        logger.info('Media duration below minimum for room \'%s\', ignoring webhook', room['name']);
        return false;
    }

    return authCheck && sunCheck && durationCheck;
}

function isHelloHueActive() { return status.getStatus(); };

function isUserAuthorized(payload, room) { return (room.users.length === 0 || room.users.includes(payload.Account.title)); };

function isItDark(room) {
    if (!room["night_mode"]) { return true; }

    const location = db.get('location').value();
    if (!location.latitude || !location.longitude) { return true; }

    const now = moment();
    const times = SunCalc.getTimes(now, location.latitude, location.longitude);
    return (now < times.sunrise || now > times.sunset);
};

async function compareDuration(payload, room) {
    if (room.min_duration === 0) { return true; }

    const duration = await plex.client.query(payload.Metadata.key).then((result) => result.MediaContainer.Metadata[0].duration);
    return (duration >= room.min_duration);
};

function triggerActions(event, room) {
    let action = room[event];
    logger.info('Triggering %s actions in room %s for %s event', action, room['name'], event);
    triggerLights(action, room);

    if (room['hambisync']) triggerHambisync(event, room);
}

async function triggerLights(action, room) {
    try {
        let roomLights = room['lights'];
        let roomGroups = room['groups'];
        let lightAttribute = {};

        switch (action) {
            case "turn_on":
                lightAttribute = {
                    on: true,
                    transitionTime: room['dim_transition'],
                    brightness: 254
                }
                break;
            case "turn_off":
                lightAttribute = {
                    on: false,
                    transitionTime: room['dim_transition']
                }
                break;
            case "dim":
                lightAttribute = {
                    on: true,
                    transitionTime: room['dim_transition'] / 10,
                    brightness: room['dim_brightness']
                }
                break;
            default:
                return false;
        }

        roomLights.forEach(lightId => {
            hue.client.lights.getById(lightId)
                .then(light => {
                    light.on = lightAttribute.on;
                    if (lightAttribute.transitionTime) { light.transitionTime = lightAttribute.transitionTime; }
                    if (lightAttribute.brightness) { light.brightness = lightAttribute.brightness; }
                    return hue.client.lights.save(light);
                })
                .catch(error => { logger.error('Something went wrong updating lights: %j', error.stack); });
        });

        roomGroups.forEach(groupId => {
            hue.client.groups.getById(groupId)
                .then(group => {
                    group.on = lightAttribute.on;
                    if (lightAttribute.transitionTime) {
                      group.transitionTime = lightAttribute.transitionTime;
                    }
                    if (lightAttribute.brightness) {
                      group.brightness = lightAttribute.brightness;
                    }
                    return hue.client.groups.save(group);
                  })
                .then(() => {
                  logger.info(`Group ${groupId} updated with transitionTime=${lightAttribute.transitionTime}`);
                })
                .catch(error => { logger.error('Something went wrong updating groups: %j', error.stack); });
        });

    } catch (error) { logger.error(error.type); return false; }
};

function triggerHambisync(event, room) {
    logger.info('Ambisync enabled in room %s, triggering event', room['name']);

    switch (event) {
        case 'play':
            hambisync.start();
            break;
        case 'stop':
            hambisync.stop();
            break;
        default:
            return false;
    }

    return true;
}

function getEvent(plexEvent) {
    if (plexEvent.slice(0, 5) !== 'media') return null;
    return plexEvent.slice(6);
}

module.exports = processWebhook;
