const mockRetrieve = jest.fn();
const mockCompletionCreate = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    models: { retrieve: mockRetrieve, list: jest.fn() },
    chat: { completions: { create: mockCompletionCreate } },
  })),
}));

jest.mock('../../src/api/imageRoutes.js', () => ({
  registerImageRoutes: jest.fn(),
}));
jest.mock('../../src/api/pdfUtils.js', () => ({
  extractTextFromPDF: jest.fn(),
}));

import { app } from '../../src/api/index.js';
import { resetAiConfigForTests, setAiClientForTests } from '../../src/config/aiConfig.js';

const originalEnv = { ...process.env };

describe('AI preflight routes', () => {
  let server;
  let baseUrl;

  beforeAll((done) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      done();
    });
  });

  afterAll(() => {
    server?.close();
    process.env = originalEnv;
  });

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'inaccessible-model';
    delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    mockRetrieve.mockReset();
    mockCompletionCreate.mockReset();
    resetAiConfigForTests();
    setAiClientForTests({
      models: { retrieve: mockRetrieve, list: jest.fn() },
      chat: { completions: { create: mockCompletionCreate } },
    });
  });

  test('status is local by default and checks model metadata only when explicitly requested', async () => {
    const localResponse = await fetch(`${baseUrl}/api/ai/status`, { headers: { origin: 'http://localhost:3000' } });
    const localStatus = await localResponse.json();
    expect(localStatus).toMatchObject({ configured: true, ready: false, model: 'inaccessible-model' });
    expect(mockRetrieve).not.toHaveBeenCalled();

    mockRetrieve.mockRejectedValueOnce(new Error('model_not_found'));
    const checkedResponse = await fetch(`${baseUrl}/api/ai/status?check=1`, { headers: { origin: 'http://localhost:3000' } });
    const checkedStatus = await checkedResponse.json();
    expect(checkedStatus).toMatchObject({ configured: true, ready: false, model: 'inaccessible-model' });
    expect(checkedStatus.message).toMatch(/not accessible/i);
    expect(mockCompletionCreate).not.toHaveBeenCalled();
  });

  test('an unavailable model stops summarize before metadata, chunk, or completion work', async () => {
    mockRetrieve.mockRejectedValueOnce(new Error('model_not_found'));

    const response = await fetch(`${baseUrl}/summarize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ rulebookText: 'A sufficiently long rulebook section '.repeat(10), gameName: 'Abyss' }),
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toMatch(/OPENAI_MODEL "inaccessible-model" is not accessible/i);
    expect(mockRetrieve).toHaveBeenCalledTimes(1);
    expect(mockCompletionCreate).not.toHaveBeenCalled();
  });
});
