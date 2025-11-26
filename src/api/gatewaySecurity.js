export function parseEnvList(value) {
  return (value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function buildGatewayConfig(env = process.env) {
  const environment = env.NODE_ENV || 'development';
  const configuredCorsOrigins = parseEnvList(env.MOBIUS_CORS_ORIGINS);
  const allowedOrigins = configuredCorsOrigins.length
    ? configuredCorsOrigins
    : ['http://localhost:3000'];
  const allowWildcard = allowedOrigins.includes('*');
  const apiKeys = parseEnvList(env.MOBIUS_API_KEYS);
  const requireApiKey = environment === 'production' || apiKeys.length > 0;

  return { environment, allowedOrigins, allowWildcard, apiKeys, requireApiKey };
}

export function ensureProductionKeys(config, exitFn = process.exit) {
  if (config.environment === 'production' && config.apiKeys.length === 0) {
    console.error('MOBIUS_API_KEYS must be set in production.');
    exitFn(1);
  }
}

export function createCorsMiddleware(config) {
  return (req, res, next) => {
    const origin = req.headers.origin;
    const allowMissingOrigin =
      !origin && (config.environment === 'development' || config.allowWildcard);
    const isAllowedOrigin =
      allowMissingOrigin || config.allowWildcard || config.allowedOrigins.includes(origin || '');

    if (!isAllowedOrigin) {
      return res.status(403).json({ error: 'CORS origin not allowed' });
    }

    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (config.allowWildcard) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        req.headers['access-control-request-headers'] || 'Content-Type'
      );
      return res.sendStatus(204);
    }

    return next();
  };
}

export function createAuthMiddleware(config) {
  let loggedDevAuthNotice = false;

  return (req, res, next) => {
    if (req.path === '/health') {
      return next();
    }

    if (!config.requireApiKey) {
      if (!loggedDevAuthNotice && config.environment === 'development') {
        console.log(
          'Development mode: MOBIUS_API_KEYS not set; allowing unauthenticated requests.'
        );
        loggedDevAuthNotice = true;
      }
      return next();
    }

    const headerKey = req.headers['x-mobius-api-key'];
    const authHeader = req.headers['authorization'];
    const bearerMatch =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null;
    const providedKey = (Array.isArray(headerKey) ? headerKey[0] : headerKey) || bearerMatch;

    if (!providedKey) {
      return res.status(401).json({ error: 'Missing API key' });
    }

    if (!config.apiKeys.includes(providedKey)) {
      return res.status(403).json({ error: 'Invalid API key' });
    }

    return next();
  };
}
