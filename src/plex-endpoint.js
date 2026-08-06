function parsePlexEndpoint(config = {}) {
  const rawHost = String(config.host || '').trim();
  if (!rawHost) {
    return {
      hostname: '',
      port: 32400,
      protocol: 'http:',
      baseUrl: ''
    };
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawHost)
    ? rawHost
    : `http://${rawHost}`;

  const url = new URL(withProtocol);
  const protocol = url.protocol === 'https:' ? 'https:' : 'http:';
  const authorityMatch = withProtocol.match(/^[a-z][a-z0-9+.-]*:\/\/(?:\[[^\]]+\]|[^/:?#]+)(?::(\d+))?/i);
  const explicitPort = authorityMatch && authorityMatch[1];
  const port = Number.parseInt(explicitPort || url.port, 10) || 32400;
  const hostname = url.hostname;
  const displayHost = hostname.includes(':') ? `[${hostname.replace(/^\[|\]$/g, '')}]` : hostname;

  return {
    hostname: hostname.replace(/^\[|\]$/g, ''),
    port,
    protocol,
    baseUrl: `${protocol}//${displayHost}:${port}`
  };
}

module.exports = { parsePlexEndpoint };
