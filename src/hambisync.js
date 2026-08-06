const request = require('request');
const db = require('./db');
const logger = require('./logger');

function invoke(command) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    logger.warn('HAmbiSync is enabled for a connection but its host/port are not configured');
    return false;
  }

  request({ url: `${baseUrl}/${command}`, timeout: 5000 }, (error, response) => {
    if (error) {
      logger.warn('HAmbiSync %s error: %s', command, error.message);
      return;
    }
    if (!response || response.statusCode < 200 || response.statusCode >= 300) {
      logger.warn('HAmbiSync %s returned HTTP %s', command, response && response.statusCode);
    }
  });

  return true;
}

function start() {
  return invoke('start');
}

function stop() {
  return invoke('stop');
}

function getBaseUrl() {
  const config = db.get('hambisync').value() || {};
  const host = String(config.host || '').trim().replace(/\/$/, '');
  const port = String(config.port || '').trim();
  if (!host || !port) return '';

  const normalizedHost = /^[a-z][a-z0-9+.-]*:\/\//i.test(host) ? host : `http://${host}`;
  return `${normalizedHost}:${port}`;
}

module.exports = { start, stop };
