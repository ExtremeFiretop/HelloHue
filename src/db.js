const fs = require('fs');
const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const { connectionDefaults, migrateData } = require('./db-migration');

const dir = path.resolve('./db');
const dbPath = path.join(dir, 'db.json');
const isNewDatabase = !fs.existsSync(dbPath);

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const adapter = new FileSync(dbPath);
const db = low(adapter);
const migrated = migrateData(db.getState(), isNewDatabase);
db.setState(migrated).write();

module.exports = db;
module.exports.connectionDefaults = connectionDefaults;
