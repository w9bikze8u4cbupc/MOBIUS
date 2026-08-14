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
      body: JSON.stringify({
        projectId: 'abyss-test',
        rulebookText: 'A sufficiently long rulebook section '.repeat(10),
        gameName: 'Abyss',
        language: 'english',
        components: [{ id: 'cards', name: 'Cards' }],
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toMatch(/OPENAI_MODEL "inaccessible-model" is not accessible/i);
    expect(mockRetrieve).toHaveBeenCalledTimes(1);
    expect(mockCompletionCreate).not.toHaveBeenCalled();
  });

  test('summary metadata and chunk requests omit temperature for gpt-5.6-sol', async () => {
    process.env.OPENAI_MODEL = 'gpt-5.6-sol';
    mockRetrieve.mockResolvedValueOnce({ id: 'gpt-5.6-sol' });
    mockCompletionCreate
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ theme: 'undersea politics' }) } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'First chunk summary.' } }] })
      .mockRejectedValueOnce({
        code: 'unsupported_value',
        param: 'top_p',
        message: 'Unsupported value: top_p',
      });

    const response = await fetch(`${baseUrl}/summarize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({
        rulebookText: `INTRODUCTION\n${'Abyss rules. '.repeat(12)}\nRULES\n${'Choose a card. '.repeat(12)}`,
        projectId: 'abyss-test',
        gameName: 'Abyss',
        language: 'english',
        components: [{ id: 'cards', name: 'Cards' }],
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toEqual({
      error: 'AI generation option "top_p" is not supported by configured model "gpt-5.6-sol".',
      code: 'AI_GENERATION_OPTION_UNSUPPORTED',
    });
    expect(mockCompletionCreate.mock.calls[0][0]).not.toHaveProperty('temperature');
    expect(mockCompletionCreate.mock.calls[1][0]).not.toHaveProperty('temperature');
  });

  test('an unsupported generation option stops the summary before later chunks', async () => {
    process.env.OPENAI_MODEL = 'test-model';
    mockRetrieve.mockResolvedValueOnce({ id: 'test-model' });
    mockCompletionCreate
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ theme: 'undersea politics' }) } }] })
      .mockRejectedValueOnce({
        code: 'unsupported_value',
        param: 'temperature',
        message: 'Unsupported value: temperature',
      });

    const response = await fetch(`${baseUrl}/summarize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({
        rulebookText: `INTRODUCTION\n${'Abyss rules. '.repeat(12)}\nRULES\n${'Choose a card. '.repeat(12)}`,
        projectId: 'abyss-test',
        gameName: 'Abyss',
        language: 'english',
        components: [{ id: 'cards', name: 'Cards' }],
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toEqual({
      error: 'AI generation option "temperature" is not supported by configured model "test-model".',
      code: 'AI_GENERATION_OPTION_UNSUPPORTED',
    });
    expect(JSON.stringify(body)).not.toContain('Unsupported value: temperature');
    expect(mockCompletionCreate).toHaveBeenCalledTimes(2);
  });
});


describe('script context validation', () => {
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
  });

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'test-model';
    mockRetrieve.mockReset();
    mockCompletionCreate.mockReset();
    resetAiConfigForTests();
    setAiClientForTests({
      models: { retrieve: mockRetrieve, list: jest.fn() },
      chat: { completions: { create: mockCompletionCreate } },
    });
  });

  test.each([
    [{ projectId: 'abyss', gameName: 'Abyss', language: 'english', components: [{ id: 'cards', name: 'Cards' }] }, /no persisted rulebook text/i],
    [{ projectId: 'abyss', gameName: 'Abyss', language: 'english', rulebookText: 'Approved rules', components: [] }, /no validated component inventory/i],
    [{ projectId: 'abyss', gameName: 'Abyss', language: 'english', rulebookText: 'Approved rules', components: [{ id: 'components', name: 'Components' }] }, /no validated component inventory/i],
    [{ projectId: 'abyss', gameName: 'Abyss', language: 'english', rulebookText: 'Approved rules', components: [{ id: 'sentence', name: 'This is a whole page of rulebook text with no component boundary.' }] }, /no validated component inventory/i],
    [{ projectId: 'abyss', gameName: 'Abyss', rulebookText: 'Approved rules', components: [{ id: 'cards', name: 'Cards' }] }, /no selected language/i],
    [{ projectId: 'abyss', gameName: 'Abyss', language: '   ', rulebookText: 'Approved rules', components: [{ id: 'cards', name: 'Cards' }] }, /no selected language/i],
    [{ projectId: 'abyss', gameName: 'Abyss', language: 'german', rulebookText: 'Approved rules', components: [{ id: 'cards', name: 'Cards' }] }, /unsupported language/i],
  ])('rejects incomplete script context before AI preflight', async (payload, message) => {
    const response = await fetch(`${baseUrl}/summarize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify(payload),
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toEqual({ error: expect.stringMatching(message), code: 'SCRIPT_CONTEXT_INCOMPLETE' });
    expect(mockRetrieve).not.toHaveBeenCalled();
    expect(mockCompletionCreate).not.toHaveBeenCalled();
  });
});