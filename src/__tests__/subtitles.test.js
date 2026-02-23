import { generateSrtContent, writeSrtFile } from '../render/subtitles.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('generateSrtContent produces valid SRT format', () => {
  const segments = [
    { startTime: 0.5, endTime: 1.7, content: 'Hello World' }
  ];
  
  const srt = generateSrtContent(segments);
  
  expect(srt).toMatch(/00:00:00,500 --> 00:00:01,700/);
  expect(srt).toMatch(/Hello World/);
});

test('generateSrtContent handles multiple segments', () => {
  const segments = [
    { startTime: 0.5, endTime: 1.7, content: 'Hello World' },
    { startTime: 2.5, endTime: 3.7, content: 'Second caption' }
  ];
  
  const srt = generateSrtContent(segments);
  
  expect(srt).toMatch(/00:00:00,500 --> 00:00:01,700/);
  expect(srt).toMatch(/Hello World/);
  expect(srt).toMatch(/00:00:02,500 --> 00:00:03,700/);
  expect(srt).toMatch(/Second caption/);
});

test('writeSrtFile writes content to file', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mobius-srt-'));
  const outputPath = path.join(tmp, 'test.srt');
  const content = '1\n00:00:00,500 --> 00:00:01,700\nHello World\n';
  
  const result = await writeSrtFile(outputPath, content);
  
  expect(result).toBe(outputPath);
  
  const txt = await fs.readFile(outputPath, 'utf8');
  expect(txt).toBe(content);
  
  // Cleanup
  await fs.rm(tmp, { recursive: true, force: true });
});