const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { Liquid } = require('liquidjs');
const { parsePlexEndpoint } = require('../src/plex-endpoint');
const { migrateData } = require('../src/db-migration');

const root = path.resolve(__dirname, '..');
const ignored = new Set(['node_modules', 'db', '.git']);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (ignored.has(entry.name)) return [];
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

const jsFiles = walk(root).filter(file => file.endsWith('.js'));
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
}

const endpoints = [
  ['192.168.1.20', 'http:', 32400],
  ['plex.local:32401', 'http:', 32401],
  ['https://plex.example.test:443', 'https:', 443]
];
for (const [input, protocol, port] of endpoints) {
  const parsed = parsePlexEndpoint({ host: input });
  if (parsed.protocol !== protocol || parsed.port !== port) {
    throw new Error(`Plex endpoint parser failed for ${input}`);
  }
}


const migrated = migrateData({
  rooms: [{ id: 2, name: 'Legacy Room', dim_transition: 7, hambisync: true }],
  hue: { host: '192.168.1.2', username: 'legacy-user' }
});
if (
  migrated.connections.length !== 1 ||
  migrated.connections[0].dim_transition !== 7 ||
  migrated.connections[0].hambisync !== true ||
  migrated.connections[0].entertainment_palette !== 'auto' ||
  migrated.hue.clientkey !== ''
) {
  throw new Error('Legacy database migration check failed');
}

const packageJson = require('../package.json');
const packageLock = require('../package-lock.json');
if (
  packageJson.version !== packageLock.packages[''].version ||
  JSON.stringify(packageJson.dependencies) !== JSON.stringify(packageLock.packages[''].dependencies)
) {
  throw new Error('package.json and package-lock.json are inconsistent');
}

const engine = new Liquid({
  root: path.join(root, 'views'),
  extname: '.liquid'
});

const connection = {
  id: 1,
  active: true,
  name: 'Living Room',
  player: 'Plex TV',
  player_uuid: '',
  users: [],
  play: 'dim',
  pause: 'turn_on',
  resume: 'dim',
  stop: 'turn_on',
  lights: [1],
  groups: [1],
  dim_brightness: 127,
  dim_transition: 1,
  hambisync: false,
  night_mode: false,
  min_duration: 0,
  entertainment_sync: true,
  entertainment_group: '1',
  entertainment_reactiveness: 50,
  entertainment_brightness: 75,
  entertainment_palette: 'auto'
};

engine.renderFile('index', {
  config: {
    connections: [connection],
    hue: { host: '', username: '', clientkey: '' },
    plex: { host: '', token: '' },
    location: { latitude: '', longitude: '' },
    hambisync: { host: '', port: '' }
  },
  auth: {
    hue: { isAuthenticated: false },
    plex: { isAuthenticated: false }
  },
  hellohue: { status: true },
  lights: [{ id: 1, name: 'Lamp' }],
  groups: [{ id: 1, name: 'Living Room' }],
  entertainmentGroups: [{ id: 1, name: 'TV Area' }],
  messages: {}
}).then(html => {
  if (!html.includes('Transition Time') || !html.includes('Music-Reactive Lighting') || !html.includes('HAmbiSync')) {
    throw new Error('Rendered UI is missing merged features');
  }
  console.log(`Checks passed: ${jsFiles.length} JavaScript files and Liquid UI render.`);
}).catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
