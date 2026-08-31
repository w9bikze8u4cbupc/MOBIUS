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

import { promises as fs } from 'node:fs';
import path from 'node:path';
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

const generatedPackage = (source, spokenText = 'Complete tutorial script.') => JSON.stringify({
  sections: [{
    title: 'Introduction',
    spokenText,
    visualDirections: [{ instruction: 'Show the board.', componentRefs: ['cards'] }],
    sourceIds: ['S1'],
  }],
});

const INVALID_PACKAGE_DIAGNOSTIC_PATH = path.join(process.cwd(), 'data', 'logs', 'last-invalid-script-package.json');

let server;
let baseUrl;

describe('summarization reliability', () => {

  beforeAll((done) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      done();
    });
  });

  beforeEach(async () => {
    await fs.rm(path.join(process.cwd(), 'data', 'abyss-reliability'), { recursive: true, force: true });
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
      .mockResolvedValueOnce({ choices: [{ message: { content: generatedPackage(source) } }] });

    const response = await fetch(`${baseUrl}/summarize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify(payloadFor(source)),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      generated: true,
      summary: '## Introduction\n\nComplete tutorial script.',
      metadataWarning: 'Optional metadata was unavailable.',
      sourceCompleteness: { complete: true },
      generationStatus: { sourceChars: source.length, chunkCount: 1, completedChunks: 1, sourceComplete: true, finalScriptLength: 42 },
    });
    expect(body.scriptPackage.sections[0]).toMatchObject({
      spokenText: 'Complete tutorial script.',
      visualDirections: [expect.any(Object)],
      sources: [expect.objectContaining({ section: 1, startOffset: 0, endOffset: source.length })],
    });
    const finalPrompt = mockCompletionCreate.mock.calls[2][0].messages[1].content;
    expect(finalPrompt).toContain('Confirmed Game Name: Abyss');
    expect(finalPrompt).toContain('Requested Language: english');
    expect(finalPrompt).toContain('Validated Component Inventory:');
    expect(finalPrompt).toContain('Source S1 (section 1, offsets 0-');
    expect(finalPrompt).toContain('Players choose cards and resolve effects.');
  });
});


describe('gpt-5.6-sol completion diagnostics', () => {
  const source = 'Rules: choose cards, resolve effects, and score points.';

  beforeEach(async () => {
    await fs.rm(path.join(process.cwd(), 'data', 'abyss-reliability'), { recursive: true, force: true });
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
      .mockResolvedValueOnce({ choices: [{ message: { content: generatedPackage(source) } }] });

    const response = await fetch(`${baseUrl}/summarize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify(payloadFor(source)),
    });

    expect(response.status).toBe(200);
    const chunkRequest = mockCompletionCreate.mock.calls[1][0];
    const finalRequest = mockCompletionCreate.mock.calls[2][0];
    const finalPrompt = finalRequest.messages[1].content;
    expect({ max_completion_tokens: chunkRequest.max_completion_tokens }).toEqual({
      max_completion_tokens: 2400,
    });
    expect({ max_completion_tokens: finalRequest.max_completion_tokens }).toEqual({
      max_completion_tokens: 6400,
    });
    [chunkRequest, finalRequest].forEach((request) => {
      expect(request).not.toHaveProperty('temperature');
      expect(request).not.toHaveProperty('reasoning_effort');
    });
    expect(finalPrompt).toContain('Validated Source-Grounded Rulebook Chunk Summaries:');
    expect(finalPrompt).toContain('Players choose cards and resolve effects.');
    expect(finalPrompt).not.toContain(source);
    expect(finalPrompt).toContain('Follow this pedagogical order: introduction/presentation');
    expect(finalPrompt).toContain('Tutorial length policy: short.');
    expect(finalPrompt.length).toBeLessThan(2000);
  });

  test('a length-exhausted empty final synthesis fails closed without saving a script', async () => {
    mockCompletionCreate
      .mockResolvedValueOnce({ choices: [{ message: { content: '{}' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Players choose cards and resolve effects.' } }] })
      .mockResolvedValueOnce({
        id: 'final-length',
        choices: [{ finish_reason: 'length', message: { content: null } }],
        usage: {
          completion_tokens: 6400,
          completion_tokens_details: { reasoning_tokens: 6400 },
        },
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
      stage: 'final_synthesis',
      classification: 'reasoning_budget_exhausted',
    });
    expect(body).not.toHaveProperty('summary');
    expect(body).not.toHaveProperty('generated');
    expect(mockCompletionCreate).toHaveBeenCalledTimes(3);
  });

  test('classifies an empty length-finished chunk as output budget exhaustion without final synthesis', async () => {
    mockCompletionCreate.mockImplementation((request) => {
      if (request.messages[0].content.includes('metadata extractor')) {
        return Promise.resolve({ choices: [{ message: { content: '{}' } }] });
      }
      return Promise.resolve({
        id: 'chunk-length',
        choices: [{ finish_reason: 'length', message: { content: null } }],
        usage: { prompt_tokens: 700, completion_tokens: 2400, total_tokens: 3100 },
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


test('rejects a nonempty invalid final package without saving it and writes a redacted development diagnostic', async () => {
  const source = 'Rules: choose cards, resolve effects, and score points.';
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL = 'test-model';
  mockRetrieve.mockReset().mockResolvedValue({ id: 'test-model' });
  mockCompletionCreate.mockReset();
  resetAiConfigForTests();
  setAiClientForTests({ models: { retrieve: mockRetrieve, list: jest.fn() }, chat: { completions: { create: mockCompletionCreate } } });
  await fs.rm(INVALID_PACKAGE_DIAGNOSTIC_PATH, { force: true });
  const apiKey = 'sk-THIS-MUST-NOT-APPEAR-IN-DIAGNOSTICS';
  const password = 'PASSWORD-MUST-NOT-APPEAR-IN-DIAGNOSTICS';
  const boundaryToken = 'sk-BOUNDARY-TOKEN-MUST-NOT-APPEAR-IN-DIAGNOSTICS';
  const rulebookExcerpt = 'RULEBOOK-MUST-NOT-APPEAR-IN-DIAGNOSTICS';
  const paddingMarker = '__BOUNDARY_TOKEN__';
  const invalidFinalBase = {
    api_key: apiKey,
    password,
    rulebookText: rulebookExcerpt,
    padding: paddingMarker,
    sections: [{ title: 'Setup', spokenText: 'Place the board.', visualDirections: [], sourceIds: ['S99'] }],
  };
  const boundaryPaddingChars = 995 - JSON.stringify(invalidFinalBase).indexOf(paddingMarker);
  const invalidFinal = JSON.stringify({
    ...invalidFinalBase,
    padding: `${'x'.repeat(boundaryPaddingChars)}${boundaryToken}`,
  });
  expect(invalidFinal.indexOf(boundaryToken)).toBe(995);
  mockCompletionCreate
    .mockResolvedValueOnce({ choices: [{ message: { content: '{}' } }] })
    .mockResolvedValueOnce({ choices: [{ message: { content: 'Players choose cards and resolve effects.' } }] })
    .mockResolvedValueOnce({
      id: 'invalid-package-response',
      choices: [{ finish_reason: 'stop', message: { content: invalidFinal } }],
    });

  try {
    const response = await fetch(`${baseUrl}/summarize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify(payloadFor(source)),
    });
    const body = await response.json();
    const diagnostic = JSON.parse(await fs.readFile(INVALID_PACKAGE_DIAGNOSTIC_PATH, 'utf8'));

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      code: 'SCRIPT_GENERATION_INCOMPLETE', stage: 'final_synthesis', classification: 'script_package_invalid',
      validationFields: ['sections[0].sources[0]'],
    });
    expect(body).not.toHaveProperty('summary');
    expect(body).not.toHaveProperty('generated');
    expect(mockCompletionCreate).toHaveBeenCalledTimes(3);
    expect(diagnostic).toMatchObject({
      model: 'test-model', responseId: 'invalid-package-response', finishReason: 'stop',
      topLevelKeys: ['api_key', 'padding', 'password', 'rulebookText', 'sections'], firstSectionKeys: ['sourceIds', 'spokenText', 'title', 'visualDirections'],
      validation: { code: 'SCRIPT_PACKAGE_INVALID', reason: 'unknown_source_id', fields: ['sections[0].sources[0]'] },
    });
    expect(diagnostic.rawResponseChars).toBe(invalidFinal.length);
    expect(diagnostic.rawResponsePreview.length).toBeLessThanOrEqual(1000);
    expect(JSON.stringify(diagnostic)).not.toContain(apiKey);
    expect(JSON.stringify(diagnostic)).not.toContain(password);
    expect(JSON.stringify(diagnostic)).not.toContain(boundaryToken);
    expect(diagnostic.rawResponsePreview).not.toContain(boundaryToken.slice(0, 5));
    expect(JSON.stringify(diagnostic)).not.toContain(rulebookExcerpt);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
});
