const router = require('express').Router();
const multer = require('multer');
const processWebhook = require('../src/automation');
const logger = require('../src/logger');

const upload = multer({
  dest: '/tmp/',
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.post('/', upload.single('thumb'), (req, res) => {
  res.sendStatus(200);

  try {
    if (!req.body || !req.body.payload) {
      logger.warn('Plex webhook did not contain a payload');
      return;
    }
    const payload = JSON.parse(req.body.payload);
    processWebhook(payload).catch(error => {
      logger.error('Webhook processing error: %s', error.stack || error.message);
    });
  } catch (error) {
    logger.error('Failed to parse Plex webhook payload: %s', error.message);
  }
});

module.exports = router;
