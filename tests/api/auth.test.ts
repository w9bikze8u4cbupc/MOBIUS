import {
  buildGatewayConfig,
  createAuthMiddleware,
  ensureProductionKeys
} from '../../src/api/gatewaySecurity.js';

function createMockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('API auth middleware', () => {
  it('allows requests without API keys in development when unset', async () => {
    const config = buildGatewayConfig({ NODE_ENV: 'development', MOBIUS_API_KEYS: undefined });
    const middleware = createAuthMiddleware(config);
    const next = jest.fn();
    const res = createMockRes();

    middleware({ path: '/api/test', headers: {} } as any, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('enforces API keys in development when configured', async () => {
    const config = buildGatewayConfig({ NODE_ENV: 'development', MOBIUS_API_KEYS: 'dev-key' });
    const middleware = createAuthMiddleware(config);

    const resMissing = createMockRes();
    const nextMissing = jest.fn();
    middleware({ path: '/api/test', headers: {} } as any, resMissing, nextMissing);
    expect(resMissing.status).toHaveBeenCalledWith(401);
    expect(nextMissing).not.toHaveBeenCalled();

    const resValid = createMockRes();
    const nextValid = jest.fn();
    middleware(
      { path: '/api/test', headers: { 'x-mobius-api-key': 'dev-key' } } as any,
      resValid,
      nextValid
    );
    expect(nextValid).toHaveBeenCalled();
  });

  it('rejects requests without valid keys in production', async () => {
    const config = buildGatewayConfig({ NODE_ENV: 'production', MOBIUS_API_KEYS: 'prod-key' });
    const middleware = createAuthMiddleware(config);

    const resMissing = createMockRes();
    middleware({ path: '/api/test', headers: {} } as any, resMissing, jest.fn());
    expect(resMissing.status).toHaveBeenCalledWith(401);

    const resInvalid = createMockRes();
    middleware(
      { path: '/api/test', headers: { 'x-mobius-api-key': 'wrong' } } as any,
      resInvalid,
      jest.fn()
    );
    expect(resInvalid.status).toHaveBeenCalledWith(403);

    const nextValid = jest.fn();
    middleware(
      { path: '/api/test', headers: { 'x-mobius-api-key': 'prod-key' } } as any,
      createMockRes(),
      nextValid
    );
    expect(nextValid).toHaveBeenCalled();
  });

  it('fails fast at startup when production keys are missing', async () => {
    const config = buildGatewayConfig({ NODE_ENV: 'production', MOBIUS_API_KEYS: '' });
    const exitSpy = jest
      .spyOn(process, 'exit')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(((code?: number) => {
        throw new Error(`exit:${code}`);
      }) as any);

    expect(() => ensureProductionKeys(config)).toThrow('exit:1');

    exitSpy.mockRestore();
  });
});
