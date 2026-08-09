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

  test('assembles an HTTP/2 curl request and returns the output path', async () => {
    const result = await generateNarration('Hello from MOBIUS', 'voice/id', outputPath);

    expect(result).toBe(outputPath);
    expect(execFile).toHaveBeenCalledTimes(1);
    expect(execFile).toHaveBeenCalledWith(
      'curl',
      expect.arrayContaining([
        '--http2',
        '-s',
        '--fail',
        '-X',
        'POST',
        'https://api.elevenlabs.io/v1/text-to-speech/voice%2Fid',
        'xi-api-key: test-elevenlabs-key',
        'Content-Type: application/json',
        JSON.stringify({ text: 'Hello from MOBIUS', model_id: 'eleven_multilingual_v2' }),
        '--output',
        outputPath,
      ]),
      expect.objectContaining({ windowsHide: true }),
      expect.any(Function),
    );
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
