const { spawn } = require('child_process');
const http = require('http');
const logger = require('./logger');

function parseHueResponse(body) {
  if (!body) return null;
  const parsed = JSON.parse(body);
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const errorEntry = entries.find(entry => entry && entry.error);
  if (errorEntry) {
    const error = new Error(errorEntry.error.description || 'Hue bridge API error');
    error.type = errorEntry.error.type;
    throw error;
  }
  return parsed;
}

class Entertainment {
  constructor(bridgeIp, username, clientkey, groupId) {
    this.bridgeIp = bridgeIp;
    this.username = username;
    this.clientkey = clientkey;
    this.groupId = groupId;
    this.dtlsProcess = null;
    this.connected = false;
    this.sequence = 0;
  }

  request(method, path, payload) {
    return new Promise((resolve, reject) => {
      const data = payload === undefined ? null : JSON.stringify(payload);
      const req = http.request({
        hostname: this.bridgeIp,
        port: 80,
        path,
        method,
        timeout: 10000,
        headers: data ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        } : undefined
      }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`Hue bridge returned HTTP ${res.statusCode}`));
          }
          try {
            return resolve(parseHueResponse(body));
          } catch (error) {
            return reject(error);
          }
        });
      });

      req.on('timeout', () => req.destroy(new Error('Hue bridge request timed out')));
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }

  async activateStreaming() {
    await this.request(
      'PUT',
      `/api/${encodeURIComponent(this.username)}/groups/${encodeURIComponent(this.groupId)}`,
      { stream: { active: true } }
    );
    logger.info('Entertainment streaming activated for group %s', this.groupId);
  }

  async deactivateStreaming() {
    try {
      await this.request(
        'PUT',
        `/api/${encodeURIComponent(this.username)}/groups/${encodeURIComponent(this.groupId)}`,
        { stream: { active: false } }
      );
    } catch (error) {
      logger.error('Error deactivating Entertainment stream: %s', error.message);
    }
  }

  async getGroupLights() {
    const group = await this.request(
      'GET',
      `/api/${encodeURIComponent(this.username)}/groups/${encodeURIComponent(this.groupId)}`
    );

    if (!group || Array.isArray(group) || !Array.isArray(group.lights)) {
      throw new Error(`Hue group ${this.groupId} is unavailable or is not a valid Entertainment area`);
    }

    return group.lights
      .map(id => Number.parseInt(id, 10))
      .filter(Number.isInteger);
  }

  async connect() {
    await this.activateStreaming();

    try {
      await new Promise((resolve, reject) => {
        let settled = false;
        let stderr = '';
        const timeout = setTimeout(() => {
          finish(new Error('DTLS connection timeout'));
        }, 10000);

        const finish = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (error) {
            this.connected = false;
            if (this.dtlsProcess && !this.dtlsProcess.killed) {
              try { this.dtlsProcess.kill('SIGTERM'); } catch (killError) { /* ignore */ }
            }
            reject(error);
          } else {
            this.connected = true;
            resolve();
          }
        };

        this.dtlsProcess = spawn('openssl', [
          's_client',
          '-dtls1_2',
          '-psk', this.clientkey,
          '-psk_identity', this.username,
          '-connect', `${this.bridgeIp}:2100`,
          '-brief'
        ], { stdio: ['pipe', 'ignore', 'pipe'] });

        this.dtlsProcess.stdin.on('error', (error) => {
          if (this.connected) {
            logger.error('Entertainment DTLS stream error: %s', error.message);
          }
        });

        this.dtlsProcess.stderr.on('data', (data) => {
          const message = data.toString();
          stderr = (stderr + message).slice(-8000);
          const lower = stderr.toLowerCase();

          if (
            lower.includes('connection established') ||
            (lower.includes('protocol version') && lower.includes('ciphersuite'))
          ) {
            logger.info('DTLS connected to Hue bridge for Entertainment streaming');
            finish();
            return;
          }

          if (
            lower.includes('handshake failure') ||
            lower.includes('no cipher match') ||
            lower.includes('connect:errno=') ||
            lower.includes('connection refused') ||
            lower.includes('error:')
          ) {
            finish(new Error(`DTLS handshake failed: ${stderr.trim()}`));
          }
        });

        this.dtlsProcess.on('error', (error) => {
          finish(new Error(`Failed to start OpenSSL: ${error.message}`));
        });

        this.dtlsProcess.on('close', (code) => {
          this.connected = false;
          if (!settled) {
            finish(new Error(`OpenSSL DTLS process exited with code ${code}: ${stderr.trim()}`));
          } else if (code !== 0 && code !== null) {
            logger.warn('OpenSSL DTLS process exited with code %s', code);
          }
        });
      });
    } catch (error) {
      await this.deactivateStreaming();
      throw error;
    }
  }

  streamColors(lightColors) {
    if (!this.connected || !this.dtlsProcess || this.dtlsProcess.killed || !this.dtlsProcess.stdin.writable) {
      return false;
    }

    const header = Buffer.from('HueStream');
    const version = Buffer.from([0x01, 0x00]);
    this.sequence = (this.sequence + 1) % 256;
    const sequence = Buffer.from([this.sequence]);
    const reserved = Buffer.from([0x00, 0x00]);
    const colorMode = Buffer.from([0x00]);
    const padding = Buffer.from([0x00]);

    const lightBuffers = lightColors.map(({ id, r, g, b }) => {
      const buffer = Buffer.alloc(9);
      buffer.writeUInt8(0x00, 0);
      buffer.writeUInt16BE(id, 1);
      buffer.writeUInt16BE(Math.max(0, Math.min(65535, r)), 3);
      buffer.writeUInt16BE(Math.max(0, Math.min(65535, g)), 5);
      buffer.writeUInt16BE(Math.max(0, Math.min(65535, b)), 7);
      return buffer;
    });

    const frame = Buffer.concat([
      header,
      version,
      sequence,
      reserved,
      colorMode,
      padding,
      ...lightBuffers
    ]);

    try {
      return this.dtlsProcess.stdin.write(frame);
    } catch (error) {
      logger.error('Failed to send Entertainment frame: %s', error.message);
      return false;
    }
  }

  async disconnect() {
    this.connected = false;
    if (this.dtlsProcess) {
      const process = this.dtlsProcess;
      this.dtlsProcess = null;
      try { process.kill('SIGTERM'); } catch (error) { /* ignore */ }
    }
    await this.deactivateStreaming();
    logger.info('Entertainment session disconnected for group %s', this.groupId);
  }
}

module.exports = Entertainment;
