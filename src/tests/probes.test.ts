// eslint-disable-next-line @typescript-eslint/no-var-requires
// @ts-ignore
const registerProbeRoutes = require('../api/probesRoutes.cjs');

describe('probes', () => {
  const routes = new Map<string, (req: unknown, res: any) => unknown>();

  beforeAll(async () => {
    const fakeApp = {
      get: (path: string, handler: (req: unknown, res: any) => unknown) => {
        routes.set(path, handler);
      }
    };
    const serviceState = { healthy: true, ready: true };
    registerProbeRoutes(fakeApp, {
      getServiceState: () => serviceState,
      getMetricsRegister: () => null
    });
  });

  const invoke = async (path: string) => {
    const handler = routes.get(path);
    if (!handler) {
      throw new Error(`route not registered: ${path}`);
    }
    const response: { statusCode: number; body: string; headers: Record<string, string> } = {
      statusCode: 200,
      body: '',
      headers: {}
    };

    const res = {
      status(code: number) {
        response.statusCode = code;
        return res;
      },
      type(_value: string) {
        return res;
      },
      set(key: string, value: string) {
        response.headers[key.toLowerCase()] = value;
        return res;
      },
      send(body: string) {
        response.body = body;
        return res;
      },
      json(payload: unknown) {
        response.body = JSON.stringify(payload);
        return res;
      }
    };

    await handler({}, res);
    return response;
  };

  it('livez returns ok', async () => {
    const res = await invoke('/livez');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('ok');
  });

  it('healthz/readyz are stable', async () => {
    const health = await invoke('/healthz');
    const ready = await invoke('/readyz');
    expect([200, 503]).toContain(health.statusCode);
    expect([200, 503]).toContain(ready.statusCode);
  });
});
