# HelloHue 1.1.0 — merged ExtremeFiretop + Peter feature build

HelloHue listens for Plex webhooks and controls Philips Hue lights. This build keeps the newer ExtremeFiretop foundation and existing behavior while porting the major features from Peter's overhaul.

## Included features

- Node.js 22 runtime and a committed npm lockfile
- Existing Hue light/group actions: do nothing, turn on, turn off, or dim
- Adjustable dim brightness and transition time
- Minimum media duration filtering, including media exactly equal to the threshold
- Night-only rules based on latitude/longitude
- Existing HAmbiSync configuration and per-connection start/stop option
- Dynamic connections that can be added and deleted
- Plex player UUID matching, with player-name fallback
- Per-connection status, enable, and disable API endpoints
- Modern Bootstrap 5 interface without jQuery
- Native Hue Entertainment music-reactive lighting using FFmpeg and OpenSSL DTLS
- Entertainment palettes, reactiveness, and brightness ceiling
- Plex playback-position polling and FFmpeg drift correction
- Automatic fallback to the configured normal light action if Entertainment sync cannot start

## Upgrade behavior

Existing `db/db.json` files using the old `rooms` array are migrated automatically to dynamic `connections`. Existing transition times, HAmbiSync options, light/group selections, duration rules, and night-mode settings are retained.

Back up the `db` directory before upgrading. To use Entertainment sync after upgrading, reconnect the Hue Bridge once so HelloHue can obtain the Hue `clientkey`. Press the physical bridge button first.

## Docker installation

The Docker image installs Node.js 22, FFmpeg, and OpenSSL.

```bash
docker compose up -d --build
```

Open `http://SERVER-IP:4568`.

Set a strong session secret before exposing the interface outside a trusted LAN:

```bash
SESSION_SECRET="replace-with-a-long-random-value" docker compose up -d --build
```

The persisted configuration is stored in `./db/db.json` through the Compose volume.

## Native Node.js installation

Requirements:

- Node.js 22 or newer
- FFmpeg available as `ffmpeg`
- OpenSSL available as `openssl`

```bash
npm ci
npm start
```

For development:

```bash
npm run dev
```

Run the included static and template checks with:

```bash
npm run check
```

## Configuration

1. **Hue Bridge:** press the bridge button and connect. Reconnecting creates both the regular username and Entertainment client key.
2. **Plex Server:** enter a hostname, IP, or full URL plus the Plex token. Port `32400` is assumed when omitted.
3. **Location:** optional; required only for night-only rules.
4. **HAmbiSync:** optional compatibility integration.
5. **Connections:** choose the Plex player, users, lights/groups, actions, transitions, and optional Entertainment Area.
6. Add the HelloHue webhook URL in Plex: `http://HELLOHUE-IP:4568/`.

### Entertainment notes

Entertainment sync decodes the Plex media source independently with FFmpeg; it does not capture audio from the playback device. Direct local playback is the most reliable case. Transcoded, remote, multi-part, or unusual stream-selection scenarios may require additional work.

Only one controller should use a Hue Entertainment Area at a time. Create the Entertainment Area in the Hue app before selecting it in HelloHue.

## HTTP API

Global status:

- `GET /api/status`
- `GET` or `POST /api/start`
- `GET` or `POST /api/stop`

Per connection:

- `GET /api/connection/:id/status`
- `GET` or `POST /api/connection/:id/enable`
- `GET` or `POST /api/connection/:id/disable`

Responses use plain text: `1` for active/enabled and `0` for inactive/disabled.

## Security

HelloHue is designed primarily for a trusted home network. The compatibility API permits state changes through GET requests and does not include user authentication. Use a reverse proxy with authentication when access is required beyond the LAN.
