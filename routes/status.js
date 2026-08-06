const router = require('express').Router();
const status = require('../src/status');
const audioSync = require('../src/audio-sync');

router.get('/start', (req, res) => {
  status.start();
  res.redirect('/');
});

router.get('/stop', async (req, res) => {
  status.stop();
  await audioSync.stopAll();
  res.redirect('/');
});

module.exports = router;
