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


## 1.1.1 follow-up hardening

- Discards Plex webhook thumbnails without creating temporary files.
- Regenerates the lockfile with Node.js 22.16.0 and npm 10.9.2, matching the pinned Docker base.
- Treats any post-handshake OpenSSL/DTLS error or exit as fatal and tears down the entire sync session.
- Resolves the selected audio stream from the active Plex session and passes its stream mapping to every FFmpeg launch and drift restart.


## 1.1.2 compatibility correction

- Relaxes the native runtime engine requirement from one exact Node patch line to Node.js `>=22.13.0 <23`.
- Keeps npm constrained to the compatible 10.9 release line.
- Updates `check:core` to compare package and lockfile engine metadata instead of hardcoding Node 22.16.x.
- Retains Node.js 22.16.0 and npm 10.9.2 as the recommended lockfile-generation and Docker toolchain.
