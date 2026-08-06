# HelloHue 1.1.2 — merged ExtremeFiretop + Peter feature build

HelloHue is a standalone Node.js service that receives Plex webhooks and controls Philips Hue lights. 
This merged build keeps the newer ExtremeFiretop foundation and behavior while adding the major features from Peter's overhaul, including dynamic connections and music-reactive Hue Entertainment streaming.

HelloHue is **not** a Plex plug-in. It runs separately and receives playback events through Plex Webhooks.

## Release history

### 1.1.2 — compatibility fix

- Native installations now support Node.js 22.13.0 or newer within the Node 22 release line and npm 10.9.x.
- Node.js 22.16.0 and npm 10.9.2 remain the recommended lockfile-generation and Docker toolchain.
- The dependency-free core checker now validates that `package.json` and `package-lock.json` agree instead of demanding one exact Node patch version.

### 1.1.1 — reliability fixes

- Plex webhook thumbnails are consumed and discarded without writing files to `/tmp`.
- Unexpected OpenSSL/DTLS termination tears down FFmpeg, colour streaming, position polling, and the Hue Entertainment session.
- The active Plex session's selected audio track is resolved and passed to FFmpeg using `-map`, including drift-correction restarts.
- Node.js 22.16.0 and npm 10.9.2 are used for lockfile generation and Docker builds.

### 1.1.0 — merged ExtremeFiretop + Peter feature build

- Retained the Node 22 foundation, dependency lockfile, newer dependency set, transition-time controls, exact minimum-duration behavior, and optional HAmbiSync support from ExtremeFiretop.
- Added Peter's dynamic connections, player UUID matching, improved frontend, per-connection controls, Hue Entertainment client-key creation, Entertainment Areas, and music-reactive audio analysis and colour mapping.
- Added automatic migration from legacy `rooms` configuration to dynamic `connections`.
- Added Entertainment failure fallback to the configured normal Hue action.

### 1.0.2 — Minimum Changes to Bring to Date

- Bootstrap 5 migration — All `data-toggle` attributes changed to `data-bs-toggle`, alerts now use `.btn-close` instead of `.close`, and form elements updated (for example, `.custom-select` → `.form-select`).
- Native tab handling — Removed jQuery's `$(...).tab()` and now uses the Bootstrap `Tab` API for tab navigation.
- Unique tab IDs — Fixed an issue causing the wrong tab to show on refresh by assigning unique IDs for links and content panes.
- Tooltip improvements — Switched to Bootstrap 5's native `bootstrap.Tooltip` initialization instead of the jQuery approach.
- Script ordering — Ensured jQuery is loaded before Bootstrap scripts for proper Bootstrap Select functionality.
- Minor tweaks and refactoring — Adjusted classes, patterns, and placeholders to align with Bootstrap 5 best practices and reduce console warnings.

### 1.0.1

- Adjustable transition time for brightness changes.
- Fixed minimum media duration by implementing asynchronous handling.
- Simplified console logging.
- General refactor of `automation.js`.

## How HelloHue works

For each Plex playback webhook, HelloHue:

1. Confirms that the event is a supported playback event.
2. Matches an active HelloHue connection to the Plex player, preferring Player UUID and falling back to Player Name.
3. Checks whether the Plex user is authorized for that connection.
4. Applies the configured minimum-duration and optional night-only rules.
5. Runs the configured Hue action, HAmbiSync action, or Hue Entertainment music synchronization.

Supported playback actions include play, pause, resume, and stop. Plex can send unrelated events such as `device.new`; HelloHue logs and safely ignores unsupported events.

## Included features

- Node.js 22 runtime compatibility and lockfile-based npm installation
- Hue light and group actions: do nothing, turn on, turn off, or dim
- Adjustable dim brightness and transition time
- Minimum media duration filtering, including media exactly equal to the threshold
- Night-only rules based on latitude and longitude
- Optional HAmbiSync start/stop integration
- Dynamic connections that can be added and deleted
- Plex Player UUID matching with Player Name fallback
- Per-connection status, enable, and disable API endpoints
- Bootstrap 5 interface implemented without runtime jQuery usage
- Native Hue Entertainment music-reactive lighting using FFmpeg and OpenSSL DTLS
- Entertainment palettes, reactiveness, and brightness ceiling
- Selected Plex audio-stream mapping into FFmpeg when Plex exposes the stream index
- Plex playback-position polling and FFmpeg drift correction
- Complete Entertainment teardown after FFmpeg or DTLS failure
- Automatic fallback to the configured normal Hue action if Entertainment sync cannot start
- Plex webhook thumbnails processed in memory without temporary disk files

## Requirements

### Required

- A Philips Hue Bridge and compatible Hue lights
- Plex Media Server
- An active Plex Pass on the Plex Media Server admin/owner account, because Plex Webhooks are a Plex Pass feature
- A machine that can remain running and receive Plex webhooks

### Native Node.js installation

- Node.js `>=22.13.0 <23`
- npm `>=10.9.0 <11`
- FFmpeg available through the `ffmpeg` command for Entertainment sync
- OpenSSL available through the `openssl` command for Entertainment DTLS

The included `.nvmrc` recommends Node.js 22.16.0. The lockfile metadata uses npm 10.9.2, but compatible Node 22 and npm 10.9 versions are accepted.

## Fresh Windows installation

The following examples assume HelloHue is installed at:

```text
C:\Users\YOUR-NAME\.HelloHue
```

### 1. Extract the package

Extract the ZIP into the desired directory, then open Command Prompt in that directory:

```cmd
cd C:\Users\YOUR-NAME\.HelloHue
```

### 2. Confirm Node and npm

```cmd
node --version
npm --version
```

Use Node 22.13.0 or newer within the Node 22 release line and npm 10.9.x.

### 3. Install the locked dependencies

```cmd
npm ci
```

Use `npm ci`, not `npm install`, for a production installation. The ZIP intentionally does not include `node_modules`.

### 4. Run the checks

The dependency-free checks can run before or after installation:

```cmd
npm run check:core
```

After `npm ci`, run the complete static and template checks:

```cmd
npm run check
```

### 5. Create a persistent SESSION_SECRET

HelloHue will run without this variable on a trusted LAN, but it will log a warning and use a known fallback secret. Set a persistent random secret for production use.

One-line Command Prompt command:

```cmd
powershell -NoProfile -Command "$b=New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Fill($b); [Environment]::SetEnvironmentVariable('SESSION_SECRET',[Convert]::ToBase64String($b),'User')"
```

Safely verify that the user environment variable exists without printing the secret:

```cmd
powershell -NoProfile -Command "if ([Environment]::GetEnvironmentVariable('SESSION_SECRET','User')) { 'SESSION_SECRET is set' } else { 'SESSION_SECRET is NOT set' }"
```

The expected result is:

```text
SESSION_SECRET is set
```

Close and reopen Command Prompt after setting the variable. A scheduled task must also be stopped and started again so its new HelloHue process inherits the variable. Do not post or share the generated secret.

### 6. Start HelloHue manually

```cmd
npm start
```

A successful startup displays:

```text
HelloHue running: http://localhost:4568
```

Open:

```text
http://localhost:4568
```

Press `Ctrl+C` to stop the manually started process cleanly.

## Windows Task Scheduler autostart

Test HelloHue manually before enabling automatic startup.

Create a task with settings similar to:

```text
Program/script:
C:\Program Files\nodejs\npm.cmd

Arguments:
start

Start in:
C:\Users\YOUR-NAME\.HelloHue
```

The **Start in** directory is important; otherwise npm may not find `package.json`.

Recommended task settings:

- Run whether the user is logged on or not, if appropriate for the machine
- Trigger at system startup or user logon
- Start only when the network is available
- Restart the task after failure
- Do not start a new instance if the task is already running

When upgrading:

1. Disable the task.
2. End the currently running task.
3. Back up the HelloHue directory or at least the `db` directory.
4. Replace the application files.
5. Run `npm ci`.
6. Run `npm run check:core` and `npm run check`.
7. Test with `npm start`.
8. Stop the manual test with `Ctrl+C`.
9. Re-enable and start the scheduled task.

If Task Scheduler cannot launch `npm.cmd` directly, use:

```text
Program/script:
C:\Windows\System32\cmd.exe

Arguments:
/c "\"C:\Program Files\nodejs\npm.cmd\" start"

Start in:
C:\Users\YOUR-NAME\.HelloHue
```

## Native Linux installation

Example:

```bash
git clone https://github.com/ExtremeFiretop/HelloHue.git
cd HelloHue
npm ci
npm run check:core
npm run check
npm start
```

When installing from a release ZIP, extract it instead of cloning and run the same npm commands from the extracted directory.

Create a session secret for the current shell with:

```bash
export SESSION_SECRET="$(openssl rand -base64 32)"
```

For a persistent service, store the value in a protected environment file as shown in the systemd example below.

## Linux systemd autostart

This example assumes HelloHue is installed in `/opt/hellohue` and runs as a dedicated `hellohue` user.

Create a protected environment file:

```bash
sudo sh -c 'printf "SESSION_SECRET=%s\n" "$(openssl rand -base64 32)" > /etc/hellohue.env'
sudo chmod 600 /etc/hellohue.env
```

Create `/etc/systemd/system/hellohue.service`:

```ini
[Unit]
Description=HelloHue Plex to Philips Hue service
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=hellohue
WorkingDirectory=/opt/hellohue
EnvironmentFile=/etc/hellohue.env
Environment=PORT=4568
ExecStart=/usr/bin/node /opt/hellohue/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Adjust the user, installation path, and Node path for your system. Then run:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hellohue.service
sudo systemctl status hellohue.service
```

View logs with:

```bash
journalctl -u hellohue.service -f
```

## Docker installation

The Docker image uses Node.js 22.16.0 with npm 10.9.2 and installs FFmpeg and OpenSSL.

Create a `.env` file beside `docker-compose.yml`:

```dotenv
TZ=America/Toronto
SESSION_SECRET=replace-with-a-long-random-value
```

Generate a secret on Linux or macOS with:

```bash
openssl rand -base64 32
```

On Windows, use the PowerShell one-liner in the Windows installation section and place a separate generated value into the Compose `.env` file.

Build and start:

```bash
docker compose up -d --build
```

Open:

```text
http://SERVER-IP:4568
```

Configuration is persisted through the Compose volume:

```text
./db:/app/db
```

Useful commands:

```bash
docker compose logs -f hellohue
docker compose restart hellohue
docker compose down
```

Do not rely on the default Compose fallback secret for a service exposed outside a trusted LAN.

## Configure the Plex webhook

Plex must send webhooks to HelloHue.

If Plex Media Server and HelloHue are on the same machine:

```text
http://127.0.0.1:4568/
```

If they are on different machines:

```text
http://HELLOHUE-IP:4568/
```

Important details:

- Keep the trailing `/`; the root route is the webhook receiver.
- Do not use `127.0.0.1` or `localhost` when Plex and HelloHue run on different machines.
- Ensure Windows Firewall, Linux firewall rules, Docker port publishing, and VLAN rules allow Plex Media Server to reach TCP port 4568 on the HelloHue host.
- Configure the webhook under the Plex account settings used by the Plex Media Server admin/owner.
- Plex may send non-playback events. Messages such as `device.new is not a supported event` are expected and harmless.

Plex webhook documentation:

https://support.plex.tv/articles/115002267687-webhooks/

## Configure HelloHue

Open the HelloHue interface in a browser, for example:

```text
http://127.0.0.1:4568/
```

### 1. Hue Bridge

1. Enter the Hue Bridge IP address.
2. Press the physical link button on the bridge.
3. Click the HelloHue connect button before the bridge's link window expires.

HelloHue creates both a normal Hue username and the `clientkey` required for Entertainment streaming. If an upgraded installation does not show Entertainment Areas, reconnect the bridge once after pressing its physical button.

### 2. Plex Server

Enter:

- Hostname, IP address, or complete HTTP/HTTPS URL
- Optional custom port
- Plex authentication token

Examples:

```text
192.168.1.20
plex.local:32400
http://plex.local:32400
https://plex.example.com:443
```

Port `32400` is assumed when omitted. A reverse-proxy path prefix such as `https://example.com/plex` is not currently supported.

Plex token instructions:

https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/

Treat the Plex token as a secret.

### 3. Location

Latitude and longitude are optional. They are required only for connections using **Trigger only at night**.

### 4. HAmbiSync

HAmbiSync is optional. Enter its host and port, then enable **Start and stop HAmbiSync with media** on each connection that should control it.

### 5. Connections

A connection links:

- One Plex player
- Zero, one, or multiple authorized Plex users
- One or multiple Hue lights and groups
- Playback actions
- Optional HAmbiSync and Entertainment behavior

Important settings:

#### Friendly Name

A descriptive HelloHue name such as `Living room TV`.

#### Plex Player Name

The display name sent by Plex. Older installations used only this value. Player names can be viewed under Plex authorized devices or observed in HelloHue logs after a playback event.

#### Player UUID

Recommended when available. HelloHue logs each webhook player in this form:

```text
Webhook from player: PLAYER-NAME (uuid: PLAYER-UUID)
```

When both the configured Player UUID and webhook UUID exist, UUID matching takes priority. Player Name is used as a fallback when UUID information is unavailable.

#### Plex Users

Enter multiple users as comma-separated values:

```text
Joel, Family User, Guest
```

User matching is case sensitive. Leaving the field empty permits any Plex user for that player.

#### Lights and Light Groups

Choose the individual Hue lights and/or Hue groups controlled by the connection.

#### Playback Actions

Configure an action for each event:

- Play
- Pause
- Resume
- Stop

Available actions:

- Nothing
- Turn On
- Turn Off
- Dim

#### Minimum Media Duration

Events for media shorter than this threshold are ignored. Media exactly equal to the configured threshold is accepted.

#### Dim Brightness and Transition Time

Dim Brightness controls the target Hue brightness. Transition Time controls the fade duration for normal Hue actions.

#### Trigger only at night

Requires saved latitude and longitude. The connection acts only during the calculated local night period.

#### Activate this connection

This must be enabled before the connection responds to Plex events.

## Hue Entertainment music synchronization

Before enabling music-reactive lighting:

1. Create an Entertainment Area in the official Hue app.
2. Reconnect the Hue Bridge in HelloHue if the bridge client key was created by an older release.
3. Select the Entertainment Area in the connection.
4. Enable **music-reactive lighting**.
5. Choose a palette, reactiveness, and brightness ceiling.

HelloHue resolves the Plex media source, launches FFmpeg, analyzes the audio, and streams colours through Hue Entertainment DTLS.

Important limitations:

- HelloHue decodes the Plex media source independently; it does not capture sound from the playback device.
- Direct local playback is the most reliable case.
- The selected Plex audio track is mapped when Plex exposes a usable stream index.
- Transcoded, remote, or multi-part playback still depends on the metadata and source access Plex provides.
- Only one controller should use a specific Hue Entertainment Area at a time.
- If Entertainment cannot start, HelloHue falls back to the normal configured Hue action.
- If OpenSSL/DTLS fails after connection, HelloHue stops the entire Entertainment session, including FFmpeg and its timers.

## HTTP API

HelloHue returns plain text `1` for active/enabled and `0` for inactive/disabled.

### Global controls

```text
GET  /api/status
GET or POST /api/start
GET or POST /api/stop
```

### Per-connection controls

Replace `:id` with the connection ID displayed in the interface.

```text
GET  /api/connection/:id/status
GET or POST /api/connection/:id/enable
GET or POST /api/connection/:id/disable
```

Disabling a connection also stops its active Entertainment session.

## Home Assistant example

The current Home Assistant command-line integration uses the `command_line:` YAML structure. Add an entry similar to this in `configuration.yaml` and replace the IP address:

```yaml
command_line:
  - switch:
      name: HelloHue
      unique_id: hellohue_global
      command_on: 'curl --silent --request POST http://192.168.1.50:4568/api/start'
      command_off: 'curl --silent --request POST http://192.168.1.50:4568/api/stop'
      command_state: 'curl --silent http://192.168.1.50:4568/api/status'
      value_template: '{{ value == "1" }}'
      scan_interval: 30
```

Restart Home Assistant after changing YAML. Per-connection switches can use the corresponding `/api/connection/ID/...` endpoints.

Home Assistant command-line integration documentation:

https://www.home-assistant.io/integrations/command_line/

## Homebridge example

The original project documented the community `homebridge-http` accessory. A compatible global-switch example is:

```json
{
  "accessory": "Http",
  "name": "HelloHue",
  "switchHandling": "yes",
  "http_method": "GET",
  "on_url": "http://192.168.1.50:4568/api/start",
  "off_url": "http://192.168.1.50:4568/api/stop",
  "status_url": "http://192.168.1.50:4568/api/status",
  "service": "Switch",
  "brightnessHandling": "no",
  "sendimmediately": "",
  "username": "",
  "password": ""
}
```

The referenced plugin has historically sought new maintainers, so review its compatibility and security before adopting it in a new Homebridge installation:

https://github.com/rudders/homebridge-http

## Upgrade from an older HelloHue release

Existing `db/db.json` files using the old `rooms` array are migrated automatically to dynamic `connections`. Existing transition times, HAmbiSync options, light/group selections, duration rules, and night-mode settings are retained.

Recommended native-upgrade procedure:

1. Stop and disable the service or scheduled task that starts HelloHue.
2. Stop the active Node process.
3. Back up the complete installation directory, or at minimum copy the `db` directory.
4. Extract the new release into a separate test directory when possible.
5. Copy only the persistent `db` directory and any locally maintained environment configuration.
6. Do not copy the old `node_modules` directory.
7. Run `npm ci` from the new release directory.
8. Run `npm run check:core` and `npm run check`.
9. Start manually with `npm start` and verify the interface and webhook behavior.
10. Stop the manual process and re-enable the production service or scheduled task.

Do not overwrite the new release's:

```text
package.json
package-lock.json
src
routes
views
public
Dockerfile
```

## Rollback

Keep the old installation and its unmodified database until testing is complete.

To roll back:

1. Stop and disable the new service or task.
2. Stop the new Node process.
3. Move the failed release directory aside.
4. Restore the previous application directory and its original `db` directory.
5. Re-enable and start the previous service or task.

Do not use a database already migrated by a newer release as the only rollback copy.

## Troubleshooting

### `Cannot find module 'express'`

Dependencies have not been installed. Run:

```cmd
npm ci
```

Do not install Express separately.

### `npm ERR! EBADENGINE`

Confirm:

```cmd
node --version
npm --version
```

HelloHue 1.1.4 supports Node.js `>=22.13.0 <23` and npm `>=10.9.0 <11`.

### `SESSION_SECRET is not set`

HelloHue started, but it is using the fallback development secret. Use the Windows one-liner, Linux environment file, or Docker `.env` instructions above, then restart the HelloHue process.

### Node deprecation warnings

Warnings mentioning `punycode`, `util._extend`, or `util.isArray` currently originate from inherited legacy dependencies. They do not by themselves mean that HelloHue failed to start.

### npm audit warnings

Do not run `npm audit fix --force` against a production installation without reviewing the dependency changes. Forced major-version upgrades can break older Hue, Plex, or HTTP dependencies. Dependency modernization should be tested as a separate change.

### Unsupported Plex event

A message such as:

```text
device.new is not a supported event, aborting webhook processing
```

is expected. Plex sends events unrelated to media playback, and HelloHue intentionally ignores them.

### Entertainment does not start

Check that:

- FFmpeg and OpenSSL are installed and available in `PATH`
- The Hue Bridge has been reconnected to create a client key
- An Entertainment Area exists and is selected
- No other application is currently controlling the same Entertainment Area
- The Plex media source is reachable from the HelloHue machine

## Security

HelloHue is designed primarily for a trusted home network.

- The web interface does not provide user authentication.
- The compatibility API permits state changes through GET requests as well as POST requests.
- Keep the Plex token, Hue credentials, client key, and `SESSION_SECRET` private.
- Set a persistent `SESSION_SECRET` for production use.
- Do not expose port 4568 directly to the public internet.
- For access beyond the LAN, use a VPN or a reverse proxy with TLS and authentication.
- Restrict firewall access to trusted devices where possible.

## Project lineage and credits

This build combines work from:

- ExtremeFiretop's maintained HelloHue foundation
- Peter's HelloHue overhaul and Entertainment work
- The earlier HelloHue and HelloHue.bundle projects

See `CREDITS.md` and `MERGE-NOTES.md` for additional attribution and merge details.
