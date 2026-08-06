const router = require('express').Router();
const status = require('../src/status');
const db = require('../src/db');
const audioSync = require('../src/audio-sync');

function isActive(value) {
  return value ? '1' : '0';
}

function findConnection(req, res) {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    res.status(400).type('text/plain').send('Invalid connection ID');
    return null;
  }

  const chain = db.get('connections').find({ id });
  if (!chain.value()) {
    res.status(404).type('text/plain').send('Connection not found');
    return null;
  }
  return { id, chain };
}

router.get('/status', (req, res) => {
  res.type('text/plain').send(isActive(status.getStatus()));
});

router.all('/start', (req, res) => {
  res.type('text/plain').send(isActive(status.start()));
});

router.all('/stop', async (req, res) => {
  status.stop();
  await audioSync.stopAll();
  res.type('text/plain').send('0');
});

router.get('/connection/:id/status', (req, res) => {
  const result = findConnection(req, res);
  if (!result) return;
  res.type('text/plain').send(isActive(result.chain.value().active));
});

async function setConnectionActive(req, res, active) {
  const result = findConnection(req, res);
  if (!result) return;
  result.chain.assign({ active }).write();
  if (!active) await audioSync.stopSync(result.id);
  res.type('text/plain').send(isActive(active));
}

router.all('/connection/:id/enable', (req, res) => setConnectionActive(req, res, true));
router.all('/connection/:id/disable', (req, res) => setConnectionActive(req, res, false));

module.exports = router;
