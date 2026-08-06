const router = require('express').Router();
const hue = require('../src/hue');
const plex = require('../src/plex');
const db = require('../src/db');
const logger = require('../src/logger');
const status = require('../src/status');

router.get('/', async (req, res) => {
  let lights = [];
  let groups = [];
  let entertainmentGroups = [];

  try {
    if (!hue.authentication.isAuthenticated) {
      throw new Error('Hue bridge is not authenticated');
    }

    const bridgeLights = await hue.client.lights.getAll();
    lights = bridgeLights.map(light => ({ id: light.id, name: light.name }));

    const bridgeGroups = await hue.client.groups.getAll();
    groups = bridgeGroups.map(group => ({ id: group.id, name: group.name }));
    entertainmentGroups = bridgeGroups
      .filter(group => group.type === 'Entertainment')
      .map(group => ({ id: group.id, name: group.name }));
  } catch (error) {
    if (hue.authentication.isAuthenticated) {
      logger.warn('Unable to load Hue lights/groups for the UI: %s', error.message);
    }
  }

  res.render('index', {
    config: {
      connections: db.get('connections').value(),
      hue: db.get('hue').value(),
      location: db.get('location').value(),
      plex: db.get('plex').value(),
      hambisync: db.get('hambisync').value()
    },
    auth: {
      hue: hue.authentication,
      plex: plex.authentication
    },
    hellohue: {
      status: status.getStatus()
    },
    lights,
    groups,
    entertainmentGroups
  });
});

module.exports = router;
