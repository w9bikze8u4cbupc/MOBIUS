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

describe('summarization reliability', () => {
  let server;
  let baseUrl;

  beforeAll((done) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      done();
    });
  });

  afterAll(() => server?.close());

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
