import * as cp from 'child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('render() orchestration', () => {
  let spawnSpy;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
  });

  function mockSpawnOk() {
    // Minimal fake ChildProcess with stdout/stderr and exit code 0
    const events = {};
    const on = (evt, cb) => {
      (events[evt] ||= []).push(cb);
      return mockProc;
    };
    const emit = (evt, ...args) => (events[evt] || []).forEach(f => f(...args));
    const mockProc = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on,
    };
    setTimeout(() => emit('close', 0), 5);
    spawnSpy.mockReturnValue(mockProc);
    return mockProc;
  }

  function mockSpawnFail() {
    const events = {};
    const on = (evt, cb) => {
      (events[evt] ||= []).push(cb);
      return mockProc;
    };
    const emit = (evt, ...args) => (events[evt] || []).forEach(f => f(...args));
    const mockProc = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on,
    };
    setTimeout(() => emit('close', 1), 5);
    spawnSpy.mockReturnValue(mockProc);
    return mockProc;
  }

  beforeAll(() => {
    // Spy after ESM import; babel-jest enables jest.spyOn for ESM bindings
    spawnSpy = jest.spyOn(cp, 'spawn');
  });

  test('builds ffmpeg args and resolves success', async () => {
    mockSpawnOk();
    const mod = await import('../render/index.js');
    const job = {
      images: [
        path.join(__dirname, 'fixtures/img1.png'),
        path.join(__dirname, 'fixtures/img2.png'),
      ],
      audioFile: path.join(__dirname, 'fixtures/audio.mp3'),
      outputDir: path.join(__dirname, '../../out'),
    };
    const result = await mod.render(job, { previewSeconds: 5, dryRun: false });

    expect(spawnSpy).toHaveBeenCalled();
    const [cmd, args] = spawnSpy.mock.calls[0];
    expect(cmd).toMatch(/ffmpeg/i);
    expect(Array.isArray(args)).toBe(true);
    // Spot-check a few expected flags without being brittle
    expect(args.join(' ')).toContain('-i');
    expect(args.join(' ')).toMatch(/libx264|h264/);
    expect(result).toMatchObject({
      outputPath: expect.stringMatching(/\.mp4$/),
      thumbnailPath: expect.stringMatching(/\.(jpg|png)$/),
    });
  });

  test('rejects on non-zero ffmpeg exit', async () => {
    mockSpawnFail();
    const mod = await import('../render/index.js');
    const job = {
      images: [path.join(__dirname, 'fixtures/img1.png')],
      audioFile: path.join(__dirname, 'fixtures/audio.mp3'),
      outputDir: path.join(__dirname, '../../out'),
    };
    await expect(mod.render(job, { previewSeconds: 5 })).rejects.toThrow(/ffmpeg/i);
  });

  test('validates inputs and throws error when images are missing', async () => {
    const mod = await import('../render/index.js');
    const job = {
      images: [],
      audioFile: path.join(__dirname, 'fixtures/audio.mp3'),
      outputDir: path.join(__dirname, '../../out'),
    };
    await expect(mod.render(job)).rejects.toThrow('No images provided for rendering');
  });

  test('validates inputs and throws error when audio file is missing', async () => {
    const mod = await import('../render/index.js');
    const job = {
      images: [path.join(__dirname, 'fixtures/img1.png')],
      audioFile: '',
      outputDir: path.join(__dirname, '../../out'),
    };
    await expect(mod.render(job)).rejects.toThrow('No audio file provided for rendering');
  });

  test('validates inputs and throws error when output directory is missing', async () => {
    const mod = await import('../render/index.js');
    const job = {
      images: [path.join(__dirname, 'fixtures/img1.png')],
      audioFile: path.join(__dirname, 'fixtures/audio.mp3'),
      outputDir: '',
    };
    await expect(mod.render(job)).rejects.toThrow('No output directory specified');
  });

  test('handles dry run mode correctly', async () => {
    const mod = await import('../render/index.js');
    const job = {
      images: [path.join(__dirname, 'fixtures/img1.png')],
      audioFile: path.join(__dirname, 'fixtures/audio.mp3'),
      outputDir: path.join(__dirname, '../../out'),
    };
    const result = await mod.render(job, { dryRun: true });
    
    expect(result).toEqual({
      outputPath: path.join(__dirname, '../../out/preview.mp4'),
      thumbnailPath: path.join(__dirname, '../../out/thumbnail.jpg'),
      captionPath: undefined,
      metadata: {
        duration: 30,
        fps: 30
      }
    });
  });
});