const registerProbeRoutes = (app, options = {}) => {
  if (!app || typeof app.get !== 'function') {
    throw new TypeError('registerProbeRoutes requires an express app instance');
  }

  const getServiceState = options.getServiceState || (() => ({ healthy: true, ready: true }));
  const getMetricsRegister = options.getMetricsRegister || (() => null);

  app.get('/livez', (_req, res) => {
    res.status(200).type('text/plain').send('ok');
  });

  app.get('/healthz', (_req, res) => {
    const state = getServiceState();
    const statusCode = state.healthy ? 200 : 503;
    res
      .status(statusCode)
      .json({ status: state.healthy ? 'ok' : 'unhealthy' });
  });

  app.get('/readyz', (_req, res) => {
    const state = getServiceState();
    const statusCode = state.ready ? 200 : 503;
    res
      .status(statusCode)
      .json({ status: state.ready ? 'ready' : 'not_ready' });
  });

  app.get('/metrics', async (_req, res) => {
    const register = getMetricsRegister();
    if (!register) {
      return res
        .status(200)
        .type('text/plain')
        .set('Cache-Control', 'no-store')
        .send('');
    }

    res.set('Content-Type', register.contentType);
    res.set('Cache-Control', 'no-store');
    res.send(await register.metrics());
  });
};

module.exports = registerProbeRoutes;
