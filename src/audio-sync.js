const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const Entertainment = require('./entertainment');
const db = require('./db');
const logger = require('./logger');
const { parsePlexEndpoint } = require('./plex-endpoint');

// Active sync sessions keyed by connection id
const activeSessions = {};

// ─── Position-aware sync lifecycle ────────────────────────────────────────────

async function startSync(connection, payload) {
    const connectionId = connection.id;

    if (activeSessions[connectionId]) {
        logger.info('Audio sync already active for connection %s, restarting', connection.name);
        await stopSync(connectionId);
    }

    if (!connection.entertainment_sync || !connection.entertainment_group) {
        return false;
    }

    const hueConfig = db.get('hue').value();
    const plexConfig = db.get('plex').value();

    if (!hueConfig.clientkey) {
        logger.error('No Hue client key. Reconnect to the Hue bridge to enable Entertainment sync.');
        return false;
    }

    let entertainment;
    try {
        const streamUrl = await getPlexStreamUrl(plexConfig, payload);
        if (!streamUrl) {
            logger.error('Could not determine Plex stream URL for connection %s', connection.name);
            return false;
        }

        entertainment = new Entertainment(
            hueConfig.host,
            hueConfig.username,
            hueConfig.clientkey,
            connection.entertainment_group
        );

        const lightIds = await entertainment.getGroupLights();
        if (lightIds.length === 0) {
            logger.error('No lights in Entertainment area %s', connection.entertainment_group);
            return false;
        }

        await entertainment.connect();

        // Initial playback offset from webhook payload (milliseconds)
        const viewOffset = (payload && payload.Metadata && payload.Metadata.viewOffset) || 0;
        const reactiveness = connection.entertainment_reactiveness || 50;
        const brightnessCeiling = (connection.entertainment_brightness || 75) / 100;
        const palette = connection.entertainment_palette || 'auto';

        // Build session — FFmpeg and entertainment are decoupled so FFmpeg can
        // restart on drift without tearing down the DTLS connection.
        const session = {
            connectionId,
            connectionName: connection.name,
            entertainment,
            lightIds,
            brightnessCeiling,
            palette,
            reactiveness,
            analyzer: new AudioAnalyzer(reactiveness),
            // FFmpeg state (managed by launchFFmpeg / killFFmpeg)
            streamUrl,
            ffmpeg: null,
            pcmBuffer: Buffer.alloc(0),
            // Position tracking
            ffmpegStartOffset: 0,   // ms offset FFmpeg was seeked to
            ffmpegStartTime: 0,     // Date.now() when FFmpeg started producing
            // Plex session matching
            plexConfig,
            playerUuid: (payload && payload.Player && payload.Player.uuid) || null,
            playerTitle: (payload && payload.Player && payload.Player.title) || null,
            // Intervals
            streamInterval: null,
            positionInterval: null
        };

        activeSessions[connectionId] = session;

        // 1. Launch FFmpeg at the Plex-reported offset
        await launchFFmpeg(session, viewOffset, true);

        // 2. Stream colors at 25 fps
        const bytesPerFrame = Math.floor(44100 / 25) * 2; // ~3528 bytes per 40ms
        session.streamInterval = setInterval(() => {
            if (session.pcmBuffer.length >= bytesPerFrame) {
                const frameData = session.pcmBuffer.slice(0, bytesPerFrame);
                session.pcmBuffer = session.pcmBuffer.slice(bytesPerFrame);
                session.analyzer.processFrame(frameData, Math.floor(44100 / 25));
            }
            const analysis = session.analyzer.getLatest();
            if (analysis) {
                const colors = mapToColors(analysis, session.lightIds, session.brightnessCeiling, session.palette);
                session.entertainment.streamColors(colors);
            }
        }, 40);

        // 3. Poll Plex for actual playback position every 5 s
        session.positionInterval = setInterval(() => {
            checkPositionDrift(connectionId);
        }, 5000);

        logger.info('Audio sync started for connection %s with %d lights at offset %dms',
            connection.name, lightIds.length, viewOffset);
        return true;

    } catch (err) {
        logger.error('Failed to start audio sync for connection %s: %s', connection.name, err.message);
        if (activeSessions[connectionId]) {
            await stopSync(connectionId);
        } else if (entertainment) {
            try { await entertainment.disconnect(); } catch (e) { /* ignore */ }
        }
        return false;
    }
}

async function stopSync(connectionId) {
    const session = activeSessions[connectionId];
    if (!session) return;

    delete activeSessions[connectionId];

    if (session.streamInterval) clearInterval(session.streamInterval);
    if (session.positionInterval) clearInterval(session.positionInterval);

    killFFmpeg(session);

    if (session.entertainment) {
        try { await session.entertainment.disconnect(); } catch (e) { /* ignore */ }
    }

    logger.info('Audio sync stopped for connection %d', connectionId);
}

async function stopAll() {
    const connectionIds = Object.keys(activeSessions);
    await Promise.all(connectionIds.map(id => stopSync(id)));
}

// ─── FFmpeg lifecycle (restartable without touching DTLS) ─────────────────────

function launchFFmpeg(session, offsetMs, waitForAudio = false) {
    killFFmpeg(session);

    session.pcmBuffer = Buffer.alloc(0);
    session.analyzer = new AudioAnalyzer(session.reactiveness);
    session.ffmpegStartOffset = offsetMs;
    session.ffmpegStartTime = Date.now();

    const seekSec = offsetMs / 1000;
    const args = ['-hide_banner', '-loglevel', 'warning', '-nostdin', '-re'];
    if (seekSec > 1) {
        args.push('-ss', seekSec.toFixed(3));
    }
    args.push(
        '-i', session.streamUrl,
        '-vn',
        '-f', 's16le',
        '-acodec', 'pcm_s16le',
        '-ac', '1',
        '-ar', '44100',
        'pipe:1'
    );

    return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
        session.ffmpeg = ffmpeg;
        const maxBytes = 44100 * 2 * 2;
        let settled = false;
        let startupTimer = null;

        const settle = (error) => {
            if (settled) return;
            settled = true;
            if (startupTimer) clearTimeout(startupTimer);
            if (error) reject(error);
            else resolve(true);
        };

        if (waitForAudio) {
            startupTimer = setTimeout(() => {
                settle(new Error('FFmpeg did not produce audio within 10 seconds'));
            }, 10000);
        }

        ffmpeg.once('spawn', () => {
            logger.info('FFmpeg launched at offset %.1fs for %s', seekSec, session.connectionName);
            if (!waitForAudio) settle();
        });

        ffmpeg.stdout.on('data', (chunk) => {
            session.pcmBuffer = Buffer.concat([session.pcmBuffer, chunk]);
            if (session.pcmBuffer.length > maxBytes) {
                session.pcmBuffer = session.pcmBuffer.slice(session.pcmBuffer.length - maxBytes);
            }
            if (waitForAudio) settle();
        });

        ffmpeg.stderr.on('data', (data) => {
            const message = data.toString().trim();
            if (message) logger.warn('FFmpeg: %s', message);
        });

        ffmpeg.on('error', (error) => {
            const wrapped = new Error(`Failed to start FFmpeg: ${error.message}`);
            settle(wrapped);
            if (!waitForAudio && activeSessions[session.connectionId] && activeSessions[session.connectionId].ffmpeg === ffmpeg) {
                stopSync(session.connectionId);
            }
        });

        ffmpeg.on('close', (code) => {
            if (waitForAudio && !settled) {
                settle(new Error(`FFmpeg exited before producing audio (code ${code})`));
            }
            if (activeSessions[session.connectionId] && activeSessions[session.connectionId].ffmpeg === ffmpeg) {
                logger.info('FFmpeg exited with code %d for connection %s', code, session.connectionName);
                stopSync(session.connectionId);
            }
        });
    });
}

function killFFmpeg(session) {
    if (session.ffmpeg) {
        const proc = session.ffmpeg;
        session.ffmpeg = null;          // detach first so close handler is a no-op
        try { proc.kill('SIGTERM'); } catch (e) { /* ignore */ }
    }
}

// ─── Plex position polling & drift correction ─────────────────────────────────

async function checkPositionDrift(connectionId) {
    const session = activeSessions[connectionId];
    if (!session || !session.ffmpeg) return;

    try {
        const plexOffset = await getPlexSessionOffset(
            session.plexConfig, session.playerUuid, session.playerTitle
        );

        if (plexOffset === null) return;   // session not found or API error

        const elapsed = Date.now() - session.ffmpegStartTime;
        const expectedOffset = session.ffmpegStartOffset + elapsed;
        const drift = Math.abs(plexOffset - expectedOffset);

        if (drift > 3000) {
            logger.info('Position drift detected: plex=%dms expected=%dms drift=%dms — restarting FFmpeg',
                plexOffset, Math.round(expectedOffset), drift);
            await launchFFmpeg(session, plexOffset).catch(error => {
                logger.error('Failed to restart FFmpeg after drift correction: %s', error.message);
            });
        }
    } catch (err) {
        logger.error('Error checking position drift: %s', err.message);
    }
}

function plexRequestJson(plexConfig, path) {
    return new Promise((resolve, reject) => {
        const endpoint = parsePlexEndpoint(plexConfig);
        if (!endpoint.hostname) {
            return reject(new Error('Plex host is not configured'));
        }

        const transport = endpoint.protocol === 'https:' ? https : http;
        const req = transport.request({
            hostname: endpoint.hostname,
            port: endpoint.port,
            path,
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            timeout: 4000
        }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(new Error(`Plex returned HTTP ${res.statusCode}`));
                }
                try {
                    return resolve(JSON.parse(body));
                } catch (error) {
                    return reject(new Error(`Invalid JSON from Plex: ${error.message}`));
                }
            });
        });

        req.on('timeout', () => req.destroy(new Error('Plex request timed out')));
        req.on('error', reject);
        req.end();
    });
}

async function getPlexSessionOffset(plexConfig, playerUuid, playerTitle) {
    try {
        const data = await plexRequestJson(
            plexConfig,
            `/status/sessions?X-Plex-Token=${encodeURIComponent(plexConfig.token)}`
        );
        const sessions = (data.MediaContainer && data.MediaContainer.Metadata) || [];
        const match = sessions.find(session => {
            if (!session.Player) return false;
            if (playerUuid && session.Player.machineIdentifier === playerUuid) return true;
            return Boolean(playerTitle && session.Player.title === playerTitle);
        });
        return match ? (match.viewOffset || 0) : null;
    } catch (error) {
        logger.error('Failed to query Plex sessions: %s', error.message);
        return null;
    }
}

// ─── Plex stream URL resolution ───────────────────────────────────────────────

async function getPlexStreamUrl(plexConfig, payload) {
    if (!payload || !payload.Metadata || !payload.Metadata.key) {
        return null;
    }

    try {
        const separator = payload.Metadata.key.includes('?') ? '&' : '?';
        const data = await plexRequestJson(
            plexConfig,
            `${payload.Metadata.key}${separator}X-Plex-Token=${encodeURIComponent(plexConfig.token)}`
        );
        const metadata = data.MediaContainer && data.MediaContainer.Metadata && data.MediaContainer.Metadata[0];
        const mediaList = metadata && Array.isArray(metadata.Media) ? metadata.Media : [];
        const media = mediaList.find(item => item.selected) || mediaList[0];
        const parts = media && Array.isArray(media.Part) ? media.Part : [];
        const part = parts.find(item => item.selected) || parts[0];
        if (!part || !part.key) return null;

        const endpoint = parsePlexEndpoint(plexConfig);
        const streamUrl = new URL(part.key, `${endpoint.baseUrl}/`);
        streamUrl.searchParams.set('X-Plex-Token', plexConfig.token);
        return streamUrl.toString();
    } catch (error) {
        logger.error('Failed to resolve Plex media stream: %s', error.message);
        return null;
    }
}

// ─── Audio analysis (IIR filters, O(N) per frame) ────────────────────────────

class AudioAnalyzer {
    constructor(reactiveness) {
        this.sampleRate = 44100;

        // Low-pass IIR for bass (~250 Hz cutoff)
        this.bassState = 0;
        this.bassAlpha = 2 * Math.PI * 250 / this.sampleRate;

        // High-pass IIR for treble (~4 kHz cutoff)
        this.trebleState = 0;
        this.treblePrev = 0;
        this.trebleAlpha = 1.0 / (1.0 + 2 * Math.PI * 4000 / this.sampleRate);

        // Smoothed band energies (AGC-normalized)
        this.smoothBass = 0;
        this.smoothMid = 0;
        this.smoothTreble = 0;
        this.smoothEnergy = 0;
        // reactiveness 1..100 → smoothing 0.65..0.05 (higher reactiveness = lower smoothing)
        const r = Math.max(1, Math.min(100, reactiveness || 50));
        this.smoothing = 0.65 - (r - 1) * (0.60 / 99);

        // Automatic gain control: per-band peak tracking
        this.peakBass = 0.001;
        this.peakMid = 0.001;
        this.peakTreble = 0.001;
        this.peakEnergy = 0.001;
        this.peakDecay = 0.995; // slow decay (~8s at 25fps to halve)

        this.frameCount = 0;
        this.latestAnalysis = null;
    }

    processFrame(frameData, sampleCount) {
        let bassEnergy = 0;
        let trebleEnergy = 0;
        let totalEnergy = 0;

        for (let i = 0; i < sampleCount; i++) {
            const sample = frameData.readInt16LE(i * 2) / 32768.0;

            // Low-pass for bass
            this.bassState += this.bassAlpha * (sample - this.bassState);
            bassEnergy += this.bassState * this.bassState;

            // High-pass for treble
            this.trebleState = this.trebleAlpha * (this.trebleState + sample - this.treblePrev);
            this.treblePrev = sample;
            trebleEnergy += this.trebleState * this.trebleState;

            totalEnergy += sample * sample;
        }

        // RMS per band
        bassEnergy = Math.sqrt(bassEnergy / sampleCount);
        trebleEnergy = Math.sqrt(trebleEnergy / sampleCount);
        totalEnergy = Math.sqrt(totalEnergy / sampleCount);
        const midEnergy = Math.max(0, totalEnergy - bassEnergy * 0.5 - trebleEnergy * 0.5);

        this.frameCount++;

        // Update AGC peaks (fast attack, slow decay)
        this.peakBass = Math.max(this.peakBass * this.peakDecay, bassEnergy);
        this.peakMid = Math.max(this.peakMid * this.peakDecay, midEnergy);
        this.peakTreble = Math.max(this.peakTreble * this.peakDecay, trebleEnergy);
        this.peakEnergy = Math.max(this.peakEnergy * this.peakDecay, totalEnergy);

        // Normalize each band by its peak (0..1 range)
        const normBass = bassEnergy / this.peakBass;
        const normMid = midEnergy / this.peakMid;
        const normTreble = trebleEnergy / this.peakTreble;
        const normEnergy = totalEnergy / this.peakEnergy;

        // Exponential smoothing on normalized values
        const s = this.smoothing;
        this.smoothBass = this.smoothBass * s + normBass * (1 - s);
        this.smoothMid = this.smoothMid * s + normMid * (1 - s);
        this.smoothTreble = this.smoothTreble * s + normTreble * (1 - s);
        this.smoothEnergy = this.smoothEnergy * s + normEnergy * (1 - s);

        // Skip first few frames while IIR filters settle (prevents skip/start spikes)
        if (this.frameCount < 4) return;

        this.latestAnalysis = {
            bass: this.smoothBass,
            mid: this.smoothMid,
            treble: this.smoothTreble,
            energy: this.smoothEnergy
        };
    }

    getLatest() {
        return this.latestAnalysis;
    }
}

// ─── Colour palettes ─────────────────────────────────────────────────────────

// Single-color base values (R, G, B in 0..1)
const SINGLE_COLORS = {
    red:    { r: 1.0, g: 0.05, b: 0.0 },
    orange: { r: 1.0, g: 0.4,  b: 0.0 },
    yellow: { r: 1.0, g: 0.9,  b: 0.0 },
    green:  { r: 0.0, g: 1.0,  b: 0.1 },
    cyan:   { r: 0.0, g: 0.8,  b: 1.0 },
    blue:   { r: 0.0, g: 0.1,  b: 1.0 },
    purple: { r: 0.5, g: 0.0,  b: 1.0 },
    pink:   { r: 1.0, g: 0.15, b: 0.5 }
};

// Multi-color palette endpoints [low-energy color, high-energy color]
// Each light interpolates between these plus a per-light spread offset
const PALETTES = {
    warm:   [{ r: 0.6, g: 0.1, b: 0.0 }, { r: 1.0, g: 0.8, b: 0.0 }],
    cool:   [{ r: 0.0, g: 0.1, b: 0.6 }, { r: 0.3, g: 0.5, b: 1.0 }],
    sunset: [{ r: 0.8, g: 0.1, b: 0.3 }, { r: 1.0, g: 0.5, b: 0.1 }],
    ocean:  [{ r: 0.0, g: 0.3, b: 0.5 }, { r: 0.0, g: 0.8, b: 0.6 }],
    forest: [{ r: 0.1, g: 0.4, b: 0.1 }, { r: 0.2, g: 1.0, b: 0.4 }],
    party:  [{ r: 1.0, g: 0.0, b: 0.5 }, { r: 0.2, g: 0.5, b: 1.0 }]
};

// ─── Frequency → colour mapping ──────────────────────────────────────────────

function mapToColors(analysis, lightIds, brightnessCeiling, palette) {
    const { bass, mid, treble, energy } = analysis;
    const scale = 65535;

    // Brightness from overall energy scaled by user ceiling
    const brightness = Math.max(0.15, Math.min(brightnessCeiling, energy * 1.4 * brightnessCeiling));

    // Auto mode: frequency-mapped (original behavior)
    if (palette === 'auto') {
        return lightIds.map((id, index) => {
            const t = lightIds.length > 1 ? index / (lightIds.length - 1) : 0.5;
            const r = Math.round(scale * Math.min(1.0, bass * (1.1 - t * 0.5) + treble * t * 0.3) * brightness);
            const g = Math.round(scale * Math.min(1.0, mid * 0.8 + bass * 0.1 * (1 - t)) * brightness);
            const bl = Math.round(scale * Math.min(1.0, treble * (0.4 + t * 0.6) + mid * 0.2) * brightness);
            return { id, r, g, b: bl };
        });
    }

    // Single color mode: hue stays fixed, brightness + saturation pulse with audio
    const singleColor = SINGLE_COLORS[palette];
    if (singleColor) {
        return lightIds.map((id, index) => {
            // Use different bands to modulate each light for some variation
            const t = lightIds.length > 1 ? index / (lightIds.length - 1) : 0.5;
            const intensity = (bass * (1 - t) + mid * 0.5 + treble * t) / 1.5;
            const pulse = Math.max(0.1, Math.min(1.0, intensity));

            const r = Math.round(scale * singleColor.r * pulse * brightness);
            const g = Math.round(scale * singleColor.g * pulse * brightness);
            const b = Math.round(scale * singleColor.b * pulse * brightness);
            return { id, r, g, b };
        });
    }

    // Palette mode: blend between two endpoint colors based on energy
    const pal = PALETTES[palette];
    if (pal) {
        const [lo, hi] = pal;
        return lightIds.map((id, index) => {
            // Per-light spread: first lights lean toward lo, last toward hi
            const t = lightIds.length > 1 ? index / (lightIds.length - 1) : 0.5;
            // Mix factor from audio energy + spatial spread
            const mix = Math.max(0, Math.min(1, (bass * 0.4 + mid * 0.3 + treble * 0.3) * 0.6 + t * 0.4));

            const cr = lo.r + (hi.r - lo.r) * mix;
            const cg = lo.g + (hi.g - lo.g) * mix;
            const cb = lo.b + (hi.b - lo.b) * mix;

            const r = Math.round(scale * Math.min(1.0, cr) * brightness);
            const g = Math.round(scale * Math.min(1.0, cg) * brightness);
            const b = Math.round(scale * Math.min(1.0, cb) * brightness);
            return { id, r, g, b };
        });
    }

    // Fallback to auto
    return mapToColors(analysis, lightIds, brightnessCeiling, 'auto');
}

module.exports = { startSync, stopSync, stopAll };
