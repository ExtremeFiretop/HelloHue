const express = require('express');
const app = express();
// Destructure the `Liquid` class instead of using it as a default function
const { Liquid } = require('liquidjs');
const bodyParser = require('body-parser');
const session = require('express-session');
const flash = require('express-flash');
const cookieParser = require('cookie-parser');
const logger = require('./src/logger');

// Instantiate the LiquidJS engine
const engine = new Liquid({
  root: __dirname, // or wherever your Liquid templates live
  extname: '.liquid'
});

// Hook the Liquid engine into Express
app.engine('liquid', engine.express());
app.set('views', ['./views']);
app.set('view engine', 'liquid');

// Set up session store
const sessionStore = new session.MemoryStore;

app.use(session({
  cookie: { maxAge: 60000 },
  store: sessionStore,
  saveUninitialized: true,
  resave: 'true',
  secret: 'secret'
}));
app.use(cookieParser('secret'));
app.use(flash());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Routes
app.use(require('./routes'));

// Serve static assets (Bootstrap, jQuery, etc.)
app.use('/js', express.static(__dirname + '/node_modules/bootstrap/dist/js'));
app.use('/js', express.static(__dirname + '/node_modules/jquery/dist'));
app.use('/js', express.static(__dirname + '/node_modules/bootstrap-select/dist/js'));
app.use('/js', express.static(__dirname + '/node_modules/popper.js/dist/umd'));
app.use('/css', express.static(__dirname + '/node_modules/bootstrap/dist/css'));
app.use('/css', express.static(__dirname + '/node_modules/bootstrap-select/dist/css'));

app.listen(4568, function () {
  logger.info('HelloHue running: http://localhost:4568');
});
