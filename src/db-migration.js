const connectionDefaults = {
  active: false,
  name: 'Connection',
  player: '',
  player_uuid: '',
  users: [],
  play: 'nothing',
  pause: 'nothing',
  resume: 'nothing',
  stop: 'nothing',
  lights: [],
  groups: [],
  dim_brightness: 127,
  dim_transition: 1,
  hambisync: false,
  night_mode: false,
  min_duration: 0,
  entertainment_sync: false,
  entertainment_group: '',
  entertainment_reactiveness: 50,
  entertainment_brightness: 75,
  entertainment_palette: 'auto'
};

function migrateData(input, isNewDatabase = false) {
  const data = { ...(input || {}) };
  const legacyRooms = Array.isArray(data.rooms) ? data.rooms : [];
  const currentConnections = Array.isArray(data.connections) ? data.connections : [];

  if (legacyRooms.length > 0 && currentConnections.length === 0) {
    data.connections = legacyRooms;
  } else {
    data.connections = currentConnections;
  }
  delete data.rooms;

  if (isNewDatabase && data.connections.length === 0) {
    data.connections = [{ id: 1, ...connectionDefaults, name: 'Connection 1' }];
  }

  data.connections = data.connections.map((connection, index) => {
    const id = Number.isInteger(connection.id) ? connection.id : index + 1;
    return {
      ...connectionDefaults,
      ...connection,
      id,
      name: connection.name || `Connection ${id}`,
      users: Array.isArray(connection.users) ? connection.users : [],
      lights: Array.isArray(connection.lights) ? connection.lights : [],
      groups: Array.isArray(connection.groups) ? connection.groups : []
    };
  });

  data.hue = {
    username: '',
    clientkey: '',
    host: '',
    ...(data.hue || {})
  };
  data.location = {
    latitude: '',
    longitude: '',
    ...(data.location || {})
  };
  data.plex = {
    host: '',
    token: '',
    ...(data.plex || {})
  };
  data.hambisync = {
    host: '',
    port: '',
    ...(data.hambisync || {})
  };

  return data;
}

module.exports = { connectionDefaults, migrateData };
