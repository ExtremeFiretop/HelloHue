# Merge notes

## Retained from ExtremeFiretop

- Node.js 22 base
- `package-lock.json`
- Hue light and group transition timing
- Exact-threshold minimum-duration behavior
- HAmbiSync configuration and per-connection option
- Newer dependency set and LiquidJS 10 initialization
- Existing `db/db.json` values

## Ported from peterpiglet

- Dynamic add/delete connections
- Player UUID matching with name fallback
- Modern Bootstrap interface and custom multi-select controls
- Per-connection API controls
- Hue client-key creation
- Hue Entertainment Areas
- FFmpeg audio analysis, color palettes, reactiveness, brightness ceiling, and position-drift correction

## Additional integration fixes

- Legacy `rooms` are automatically migrated to `connections`
- Entertainment startup validates Hue HTTP responses and the DTLS handshake
- Failed Entertainment startup falls back to the configured normal light action
- Global/connection disable and deletion stop active Entertainment sessions
- Plex host accepts a hostname, IP, or explicit HTTP/HTTPS URL and port
- Malformed webhook payloads no longer throw through the route
- Existing Hue credentials are restored when a reconnect attempt fails
