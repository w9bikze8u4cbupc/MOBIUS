jest.mock('node:child_process', () => ({ execFile: jest.fn() }));

const { execFile } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

let generateNarration;

beforeAll(async () => {
  ({ generateNarration } = await import('../../src/services/elevenLabsService.js'));
});

describe('generateNarration', () => {
  const originalApiKey = process.env.ELEVENLABS_API_KEY;
  const outputPath = path.join(os.tmpdir(), 'mobius-narration.mp3');

  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = 'test-elevenlabs-key';
    execFile.mockReset();
    execFile.mockImplementation((_command, _args, _options, callback) => {
      callback(null, '', '');
    });
  });

  afterAll(() => {
    if (originalApiKey === undefined) {
      delete process.env.ELEVENLABS_API_KEY;
    } else {
      process.env.ELEVENLABS_API_KEY = originalApiKey;
    }
  });

  test('assembles a portable curl request and returns the output path', async () => {
    const result = await generateNarration('Hello from MOBIUS', 'voice/id', outputPath);

    expect(result).toBe(outputPath);
    expect(execFile).toHaveBeenCalledTimes(1);
    expect(execFile).toHaveBeenCalledWith(
      'curl',
      expect.arrayContaining([
        '-s',
        '--fail',
        '-X',
        'POST',
        'https://api.elevenlabs.io/v1/text-to-speech/voice%2Fid',
        'xi-api-key: test-elevenlabs-key',
        'Content-Type: application/json',
        JSON.stringify({
          text: 'Hello from MOBIUS',
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.38, similarity_boost: 0.78, style: 0.22, use_speaker_boost: true },
        }),
        '--output',
        outputPath,
      ]),
      expect.objectContaining({ windowsHide: true }),
      expect.any(Function),
    );
    expect(execFile.mock.calls[0][1]).not.toContain('--http2');
  });

  test('passes an explicit supported voice preset through the provider contract', async () => {
    await generateNarration('Warm test', 'voice-id', outputPath, {
      modelId: 'eleven_multilingual_v2',
      voiceSettings: { stability: 0.4, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true },
    });
    const body = execFile.mock.calls[0][1][execFile.mock.calls[0][1].indexOf('-d') + 1];
    expect(JSON.parse(body).voice_settings).toEqual({ stability: 0.4, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true });
  });

  test('throws a descriptive error when curl exits unsuccessfully', async () => {
    execFile.mockImplementation((_command, _args, _options, callback) => {
      const failure = new Error('curl exited with code 22');
      failure.stderr = 'HTTP 401 Unauthorized';
      callback(failure);
    });

    await expect(generateNarration('Hello', 'voice-id', outputPath))
      .rejects
      .toThrow('ElevenLabs narration curl request failed: HTTP 401 Unauthorized');
  });
});
