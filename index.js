const path = require('path');
const express = require('express');
const { Liquid } = require('liquidjs');
const session = require('express-session');
const flash = require('express-flash');
const cookieParser = require('cookie-parser');
const logger = require('./src/logger');
const audioSync = require('./src/audio-sync');

const app = express();
const port = Number.parseInt(process.env.PORT, 10) || 4568;
const sessionSecret = process.env.SESSION_SECRET || 'hellohue-change-this-secret';

if (!process.env.SESSION_SECRET) {
  logger.warn('SESSION_SECRET is not set. Set one before exposing HelloHue beyond a trusted LAN.');
}

const engine = new Liquid({
  root: path.join(__dirname, 'views'),
  extname: '.liquid'
});

app.engine('liquid', engine.express());
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'liquid');

app.use(session({
  cookie: {
    httpOnly: true,
    maxAge: 60 * 60 * 1000,
    sameSite: 'lax'
  },
  saveUninitialized: false,
  resave: false,
  secret: sessionSecret
}));
app.use(cookieParser(sessionSecret));
app.use(flash());
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

app.use('/js', express.static(path.join(__dirname, 'node_modules/bootstrap/dist/js')));
app.use('/css', express.static(path.join(__dirname, 'node_modules/bootstrap/dist/css')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(require('./routes'));

app.use((err, req, res, next) => {
  logger.error('Unhandled request error: %s', err.stack || err.message);
  if (res.headersSent) return next(err);
  return res.status(500).send('Internal Server Error');
});

const server = app.listen(port, () => {
  logger.info('HelloHue running: http://localhost:%d', port);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('%s received, shutting down HelloHue', signal);

  try {
    await audioSync.stopAll();
  } catch (error) {
    logger.error('Error stopping Entertainment sessions: %s', error.message);
  }

  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = { app, server };
