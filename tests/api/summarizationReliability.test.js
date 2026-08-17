const mockRetrieve = jest.fn();
const mockCompletionCreate = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    models: { retrieve: mockRetrieve, list: jest.fn() },
    chat: { completions: { create: mockCompletionCreate } },
  })),
}));
jest.mock('../../src/api/imageRoutes.js', () => ({ registerImageRoutes: jest.fn() }));
jest.mock('../../src/api/pdfUtils.js', () => ({ extractTextFromPDF: jest.fn() }));

import { app } from '../../src/api/index.js';
import { buildRulebookChunks } from '../../src/services/rulebookChunker.js';
import { resetAiConfigForTests, setAiClientForTests } from '../../src/config/aiConfig.js';

const payloadFor = (rulebookText) => ({
  projectId: 'abyss-reliability',
  gameName: 'Abyss',
  language: 'english',
  rulebookText,
  components: [{ id: 'cards', name: 'Cards', quantity: 20 }],
  metadata: { publisher: 'Bombyx' },
});

let server;
let baseUrl;

describe('summarization reliability', () => {

  beforeAll((done) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      done();
    });
  });

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'test-model';
    mockRetrieve.mockReset().mockResolvedValue({ id: 'test-model' });
    mockCompletionCreate.mockReset();
    resetAiConfigForTests();
    setAiClientForTests({
      models: { retrieve: mockRetrieve, list: jest.fn() },
      chat: { completions: { create: mockCompletionCreate } },
    });
  });

  test('an empty summary for section 3 stops before final synthesis', async () => {
    const source = 'A'.repeat(20914);
    expect(buildRulebookChunks(source).chunks).toHaveLength(4);
    mockCompletionCreate.mockImplementation((request) => {
      const system = request.messages[0].content;
      const user = request.messages[1].content;
      if (system.includes('metadata extractor')) {
        return Promise.resolve({ choices: [{ message: { content: '{}' } }] });
      }
      if (user.includes('Section 3 ')) {
        return Promise.resolve({ choices: [{ message: { content: '   ' } }] });
      }
      return Promise.resolve({ choices: [{ message: { content: 'Source-grounded section summary.' } }] });
    });

    const response = await fetch(`${baseUrl}/summarize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify(payloadFor(source)),
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      code: 'SCRIPT_GENERATION_INCOMPLETE',
      classification: 'provider_empty_content',
      stage: 'chunk_3',
      error: 'Script generation stopped: rulebook section 3 produced no usable summary. No script was saved.',
      generationStatus: { sourceChars: 20914, chunkCount: 4, completedChunks: 2, sourceComplete: false },
    });
    expect(mockCompletionCreate.mock.calls.some(([request]) => request.messages[0].content.includes('master boardgame educator'))).toBe(false);
  });

  test('empty optional metadata does not block complete source-grounded generation', async () => {
    const source = 'Rules: choose cards, resolve effects, and score points.';
    mockCompletionCreate
      .mockResolvedValueOnce({ choices: [{ message: { content: '' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Players choose cards and resolve effects.' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Complete tutorial script.' } }] });

    const response = await fetch(`${baseUrl}/summarize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify(payloadFor(source)),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      generated: true,
      summary: 'Complete tutorial script.',
      metadataWarning: 'Optional metadata was unavailable.',
      sourceCompleteness: { complete: true },
      generationStatus: { sourceChars: source.length, chunkCount: 1, completedChunks: 1, sourceComplete: true, finalScriptLength: 25 },
    });
    const finalPrompt = mockCompletionCreate.mock.calls[2][0].messages[1].content;
    expect(finalPrompt).toContain('Confirmed Game Name: Abyss');
    expect(finalPrompt).toContain('Requested Language: english');
    expect(finalPrompt).toContain('Validated Component Inventory:');
    expect(finalPrompt).toContain('Section 1 (source offsets 0-');
    expect(finalPrompt).toContain('Players choose cards and resolve effects.');
  });
});


describe('gpt-5.6-sol completion diagnostics', () => {
  const source = 'Rules: choose cards, resolve effects, and score points.';

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'gpt-5.6-sol';
    mockRetrieve.mockReset().mockResolvedValue({ id: 'gpt-5.6-sol' });
    mockCompletionCreate.mockReset();
    resetAiConfigForTests();
    setAiClientForTests({
      models: { retrieve: mockRetrieve, list: jest.fn() },
      chat: { completions: { create: mockCompletionCreate } },
    });
  });

  const expectNoFinalSynthesis = () => {
    expect(mockCompletionCreate.mock.calls.some(([request]) => (
      request.messages[0].content.includes('master boardgame educator')
    ))).toBe(false);
  };

  test('uses the centralized chunk profile for a normal nonempty completion', async () => {
    mockCompletionCreate
      .mockResolvedValueOnce({ choices: [{ message: { content: '{}' } }] })
      .mockResolvedValueOnce({
        id: 'chunk-normal',
        choices: [{ finish_reason: 'stop', message: { content: 'Players choose cards and resolve effects.' } }],
      })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Complete tutorial script.' } }] });

    const response = await fetch(`${baseUrl}/summarize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify(payloadFor(source)),
    });

    expect(response.status).toBe(200);
    expect(mockCompletionCreate.mock.calls[1][0]).toMatchObject({
      max_completion_tokens: 1200,
      reasoning_effort: 'minimal',
    });
    expect(mockCompletionCreate.mock.calls[1][0]).not.toHaveProperty('temperature');
  });

  test('classifies an empty length-finished chunk as output budget exhaustion without final synthesis', async () => {
    mockCompletionCreate.mockImplementation((request) => {
      if (request.messages[0].content.includes('metadata extractor')) {
        return Promise.resolve({ choices: [{ message: { content: '{}' } }] });
      }
      return Promise.resolve({
        id: 'chunk-length',
        choices: [{ finish_reason: 'length', message: { content: null } }],
        usage: { prompt_tokens: 700, completion_tokens: 1200, total_tokens: 1900 },
      });
    });

    const response = await fetch(`${baseUrl}/summarize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify(payloadFor(source)),
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      code: 'SCRIPT_GENERATION_INCOMPLETE',
      stage: 'chunk_1',
      classification: 'output_budget_exhausted',
      nextAction: 'Increase the configured chunk-summary output budget before trying again.',
    });
    expectNoFinalSynthesis();
  });

  test('classifies an empty reasoning-only length-finished chunk without final synthesis', async () => {
    mockCompletionCreate.mockImplementation((request) => {
      if (request.messages[0].content.includes('metadata extractor')) {
        return Promise.resolve({ choices: [{ message: { content: '{}' } }] });
      }
      return Promise.resolve({
        id: 'chunk-reasoning-budget',
        choices: [{ finish_reason: 'length', message: { content: null } }],
        usage: {
          completion_tokens: 1200,
          completion_tokens_details: { reasoning_tokens: 1200 },
        },
      });
    });

    const response = await fetch(`${baseUrl}/summarize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify(payloadFor(source)),
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({ stage: 'chunk_1', classification: 'reasoning_budget_exhausted' });
    expectNoFinalSynthesis();
  });

  test('classifies normal-finished null content and logs only safe completion metadata', async () => {
    const rulebookSecret = 'RULEBOOK-BODY-MUST-NOT-APPEAR-IN-DIAGNOSTICS';
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    mockCompletionCreate.mockImplementation((request) => {
      if (request.messages[0].content.includes('metadata extractor')) {
        return Promise.resolve({ choices: [{ message: { content: '{}' } }] });
      }
      return Promise.resolve({
        id: 'chunk-empty-stop',
        choices: [{ finish_reason: 'stop', message: { content: null, refusal: null } }],
        usage: { prompt_tokens: 700, completion_tokens: 0, total_tokens: 700 },
      });
    });

    const response = await fetch(`${baseUrl}/summarize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify(payloadFor(`${source} ${rulebookSecret}`)),
    });
    const body = await response.json();
    const diagnosticCall = infoSpy.mock.calls.find(([event]) => event === 'summary_completion_diagnostic');
    const diagnostic = JSON.parse(diagnosticCall[1]);
    infoSpy.mockRestore();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({ stage: 'chunk_1', classification: 'provider_empty_content' });
    expect(diagnostic).toMatchObject({
      model: 'gpt-5.6-sol',
      stage: 'chunk_1',
      choiceCount: 1,
      finishReason: 'stop',
      contentType: 'null',
      responseId: 'chunk-empty-stop',
      usage: { promptTokens: 700, completionTokens: 0, totalTokens: 700 },
    });
    expect(JSON.stringify(diagnostic)).not.toContain(rulebookSecret);
    expectNoFinalSynthesis();
  });

  test('classifies a malformed provider payload without final synthesis', async () => {
    mockCompletionCreate.mockImplementation((request) => {
      if (request.messages[0].content.includes('metadata extractor')) {
        return Promise.resolve({ choices: [{ message: { content: '{}' } }] });
      }
      return Promise.resolve({ id: 'chunk-malformed', choices: null, usage: { total_tokens: 10 } });
    });

    const response = await fetch(`${baseUrl}/summarize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify(payloadFor(source)),
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({ stage: 'chunk_1', classification: 'malformed_provider_payload' });
    expectNoFinalSynthesis();
  });
});


afterAll(() => server?.close());