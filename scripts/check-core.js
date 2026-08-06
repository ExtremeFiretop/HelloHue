const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolvePlexMediaSource } = require('../src/plex-media');
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

for (const file of walk(root).filter(file => file.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
}

const endpoint = parsePlexEndpoint({ host: 'https://plex.example.test:443' });
if (endpoint.protocol !== 'https:' || endpoint.port !== 443) {
  throw new Error('Pinned Plex endpoint parser check failed');
}

const migrated = migrateData({
  rooms: [{ id: 2, name: 'Legacy Room', dim_transition: 7, hambisync: true }],
  hue: { host: '192.168.1.2', username: 'legacy-user' }
});
if (migrated.connections[0].dim_transition !== 7 || migrated.connections[0].hambisync !== true) {
  throw new Error('Legacy migration check failed');
}

const selectedAudio = resolvePlexMediaSource({
  Media: [{
    Part: [{
      id: 10,
      key: '/library/parts/10/file.mkv',
      Stream: [
        { streamType: 1, index: 0, codec: 'h264' },
        { streamType: 2, index: 1, codec: 'aac', language: 'English' },
        { streamType: 2, index: 2, codec: 'ac3', language: 'French', selected: true }
      ]
    }]
  }]
}, null, null);
if (!selectedAudio || selectedAudio.audioMap !== '0:2' || selectedAudio.audioStream.language !== 'French') {
  throw new Error('Selected audio stream mapping check failed');
}

const relativeAudio = resolvePlexMediaSource({
  Media: [{
    Part: [{
      key: '/library/parts/11/file.mkv',
      Stream: [
        { streamType: 2, codec: 'aac' },
        { streamType: 2, codec: 'ac3', selected: true }
      ]
    }]
  }]
}, null, null);
if (!relativeAudio || relativeAudio.audioMap !== '0:a:1') {
  throw new Error('Relative selected audio stream mapping check failed');
}

const webhookSource = fs.readFileSync(path.join(root, 'routes', 'webhook.js'), 'utf8');
if (!webhookSource.includes('memoryStorage()') || webhookSource.includes("dest: '/tmp/'")) {
  throw new Error('Webhook thumbnail no-disk check failed');
}

const entertainmentSource = fs.readFileSync(path.join(root, 'src', 'entertainment.js'), 'utf8');
const audioSyncSource = fs.readFileSync(path.join(root, 'src', 'audio-sync.js'), 'utf8');
if (!entertainmentSource.includes("this.emit('fatal', fatalError)") ||
    !audioSyncSource.includes("entertainment.once('fatal', onEntertainmentFatal)") ||
    !audioSyncSource.includes("args.push('-map', session.audioMap)")) {
  throw new Error('Entertainment lifecycle or FFmpeg mapping wiring check failed');
}

const packageJson = require('../package.json');
const packageLock = require('../package-lock.json');
if (packageJson.version !== packageLock.packages[''].version ||
    JSON.stringify(packageJson.dependencies) !== JSON.stringify(packageLock.packages[''].dependencies) ||
    packageJson.packageManager !== 'npm@10.9.2' ||
    packageJson.engines.node !== '22.16.x') {
  throw new Error('Package and lockfile/toolchain consistency check failed');
}

console.log('Core checks passed: syntax, migration, no-disk thumbnails, DTLS teardown wiring, and selected audio mapping.');
