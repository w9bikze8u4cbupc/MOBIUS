const mockRetrieve = jest.fn();
const mockList = jest.fn();
const mockCompletionCreate = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    models: { retrieve: mockRetrieve, list: mockList },
    chat: { completions: { create: mockCompletionCreate } },
  })),
}));

import {
  getAiStatus,
  listAccessibleModelIds,
  resetAiConfigForTests,
  setAiClientForTests,
} from '../../src/config/aiConfig.js';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL = 'test-model';
  delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  mockRetrieve.mockReset();
  mockList.mockReset();
  mockCompletionCreate.mockReset();
  resetAiConfigForTests();
  setAiClientForTests({
    models: { retrieve: mockRetrieve, list: mockList },
    chat: { completions: { create: mockCompletionCreate } },
  });
});

afterAll(() => {
  process.env = originalEnv;
});

test('missing OPENAI_MODEL disables AI without exposing the API key', async () => {
  delete process.env.OPENAI_MODEL;

  const status = await getAiStatus();

  expect(status).toMatchObject({ configured: false, ready: false, model: null, provider: 'openai' });
  expect(status.message).toMatch(/set OPENAI_MODEL/i);
  expect(JSON.stringify(status)).not.toContain('test-key');
  expect(mockRetrieve).not.toHaveBeenCalled();
  expect(mockCompletionCreate).not.toHaveBeenCalled();
});

test('an inaccessible configured model returns one concise cached failure without a completion', async () => {
  mockRetrieve.mockRejectedValueOnce(new Error('model_not_found'));

  const first = await getAiStatus({ checkAccess: true });
  const second = await getAiStatus({ checkAccess: true });

  expect(first).toMatchObject({ configured: true, model: 'test-model', ready: false });
  expect(first.message).toMatch(/OPENAI_MODEL "test-model" is not accessible/i);
  expect(second).toEqual(first);
  expect(mockRetrieve).toHaveBeenCalledTimes(1);
  expect(mockCompletionCreate).not.toHaveBeenCalled();
});

test('an accessible configured model is ready after only a model metadata check', async () => {
  mockRetrieve.mockResolvedValueOnce({ id: 'test-model' });

  const status = await getAiStatus({ checkAccess: true });

  expect(status).toMatchObject({ configured: true, provider: 'openai', model: 'test-model', ready: true });
  expect(status.message).toMatch(/ready/i);
  expect(mockRetrieve).toHaveBeenCalledWith('test-model');
  expect(mockCompletionCreate).not.toHaveBeenCalled();
});

test('configured but unchecked status remains disabled without a provider request', async () => {
  const status = await getAiStatus();

  expect(status).toMatchObject({ configured: true, model: 'test-model', ready: false });
  expect(status.message).toMatch(/Refresh AI status/i);
  expect(mockRetrieve).not.toHaveBeenCalled();
  expect(mockCompletionCreate).not.toHaveBeenCalled();
});

test('model discovery lists accessible IDs with credentials but without OPENAI_MODEL', async () => {
  delete process.env.OPENAI_MODEL;
  mockList.mockResolvedValueOnce({ data: [{ id: 'accessible-a' }, { id: 'accessible-b' }] });

  await expect(listAccessibleModelIds()).resolves.toEqual(['accessible-a', 'accessible-b']);
  expect(mockList).toHaveBeenCalledTimes(1);
  expect(mockRetrieve).not.toHaveBeenCalled();
  expect(mockCompletionCreate).not.toHaveBeenCalled();
});
