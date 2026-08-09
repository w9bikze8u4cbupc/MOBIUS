import { createRemotionScriptGenerator } from '../../src/services/scriptGenerator.js';

const mockLlmResponse = {
  scenes: [
    {
      sectionTitle: 'Set Up',
      narrationText: 'Place the *market cards* beside the board. #Ready',
      imageKeyword: 'board game market cards',
      themeBorderColor: '#E91E63',
      durationInFrames: 120,
    },
    {
      sectionTitle: 'Take a Turn',
      narrationText: 'Choose one card, then resolve its effect before the next player acts.',
      imageKeyword: 'player choosing game card',
      themeBorderColor: '#1E88E5',
      durationInFrames: 180,
    },
  ],
};

describe('generateRemotionScript', () => {
  const create = jest.fn();
  const generator = createRemotionScriptGenerator({
    chat: { completions: { create } },
  });

  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(mockLlmResponse) } }],
    });
  });

  test('returns validated Remotion scene objects from a mock LLM response', async () => {
    const scenes = await generator(
      'Each player chooses a market card and resolves its effect.',
      'Mock Market',
      'en',
    );

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      response_format: { type: 'json_object' },
      temperature: 0,
    }));
    expect(Array.isArray(scenes)).toBe(true);
    expect(scenes).toHaveLength(2);
    expect(scenes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sectionTitle: expect.any(String),
        narrationText: expect.any(String),
        imageKeyword: expect.any(String),
        themeBorderColor: expect.stringMatching(/^#[0-9A-F]{6}$/i),
        durationInFrames: expect.any(Number),
      }),
    ]));
  });

  test('returns clean narration text with no Markdown markers', async () => {
    const scenes = await generator('Rules text', 'Mock Market', 'en');

    scenes.forEach((scene) => {
      expect(scene.narrationText).not.toMatch(/[\*#`]/);
    });
    expect(scenes[0].narrationText).toBe('Place the market cards beside the board. Ready');
  });

  test('calculates a positive integer duration from cleaned narration text', async () => {
    const scenes = await generator('Rules text', 'Mock Market', 'fr-CA');

    scenes.forEach((scene) => {
      expect(Number.isInteger(scene.durationInFrames)).toBe(true);
      expect(scene.durationInFrames).toBeGreaterThan(0);
    });
    // 8 cleaned words × 60 / 150 seconds × 30 fps = 96 frames.
    expect(scenes[0].durationInFrames).toBe(96);
  });

  test('requests and accepts exactly seven scenes when required', async () => {
    const sevenScenes = Array.from({ length: 7 }, (_, index) => ({
      ...mockLlmResponse.scenes[index % mockLlmResponse.scenes.length],
      sectionTitle: `Scene ${index + 1}`,
    }));
    create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ scenes: sevenScenes }) } }],
    });

    const scenes = await generator('Rules text', 'Mock Market', 'fr-CA', { exactSceneCount: 7 });

    expect(scenes).toHaveLength(7);
    expect(create.mock.calls[0][0].messages[1].content).toContain('Return exactly 7 scenes.');
  });

  test.each([6, 8])('rejects a response with %i scenes when exactly seven are required', async (sceneCount) => {
    const mismatchedScenes = Array.from({ length: sceneCount }, (_, index) => ({
      ...mockLlmResponse.scenes[index % mockLlmResponse.scenes.length],
      sectionTitle: `Scene ${index + 1}`,
    }));
    create.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ scenes: mismatchedScenes }) } }],
    });

    await expect(generator('Rules text', 'Mock Market', 'fr-CA', { exactSceneCount: 7 }))
      .rejects
      .toMatchObject({
        code: 'REMOTION_SCRIPT_INVALID_RESPONSE',
        message: expect.stringContaining(`exactly 7 scenes; received ${sceneCount}`),
      });
  });
});
