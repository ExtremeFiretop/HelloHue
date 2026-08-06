const router = require('express').Router();
const multer = require('multer');
const processWebhook = require('../src/automation');
const logger = require('../src/logger');

// Plex includes an optional thumbnail in multipart webhooks. HelloHue only needs
// the JSON payload, so consume and discard files instead of writing them to /tmp.
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, callback) => callback(null, false),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 20
  }
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
