import { writeSrt } from '../render/subtitles';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('writeSrt produces a valid srt file', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mobius-srt-'));
  const srt = await writeSrt([{ start: 0.5, end: 1.7, text: 'Hello World' }], tmp);
  const txt = await fs.readFile(srt, 'utf8');
  expect(txt).toMatch(/00:00:00,500 --> 00:00:01,700/);
  expect(txt).toMatch(/Hello World/);
});

test('writeSrt handles multiple captions', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mobius-srt-'));
  const captions = [
    { start: 0.5, end: 1.7, text: 'Hello World' },
    { start: 2.5, end: 3.7, text: 'Second caption' }
  ];
  const srt = await writeSrt(captions, tmp);
  const txt = await fs.readFile(srt, 'utf8');
  expect(txt).toMatch(/00:00:00,500 --> 00:00:01,700/);
  expect(txt).toMatch(/Hello World/);
  expect(txt).toMatch(/00:00:02,500 --> 00:00:03,700/);
  expect(txt).toMatch(/Second caption/);
});

test('writeSrt handles multiline text', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mobius-srt-'));
  const captions = [
    { start: 0.5, end: 1.7, text: 'Hello\nWorld' }
  ];
  const srt = await writeSrt(captions, tmp);
  const txt = await fs.readFile(srt, 'utf8');
  expect(txt).toMatch(/Hello World/);
});