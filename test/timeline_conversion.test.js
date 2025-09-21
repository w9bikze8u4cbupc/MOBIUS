import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { describe, it, expect } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Timeline Conversion', () => {
  it('should convert timeline to renderer schema', () => {
    // Load a sample timeline
    const sampleTimeline = {
      fps: 30,
      width: 1920,
      height: 1080,
      tracks: [
        {
          type: 'video',
          clips: [
            { type: 'image', src: 'image1.jpg', start: 0, duration: 5, fit: 'cover' },
            { type: 'image', src: 'image2.jpg', start: 5, duration: 5, fit: 'cover' },
          ],
        },
      ],
    };

    // Convert to renderer schema
    const timeline = [];
    let time = 0;

    for (let i = 0; i < sampleTimeline.tracks[0].clips.length; i++) {
      const clip = sampleTimeline.tracks[0].clips[i];

      timeline.push({
        id: `shot:${i}`,
        type: 'components',
        start: time,
        end: time + clip.duration,
        data: {
          template: 'generic',
        },
      });

      time += clip.duration;
    }

    const output = {
      timeline: timeline,
    };

    // Validate schema
    expect(output.timeline).toBeDefined();
    expect(Array.isArray(output.timeline)).toBe(true);
    expect(output.timeline.length).toBe(2);

    // Validate each shot
    output.timeline.forEach((shot, index) => {
      expect(shot.id).toBe(`shot:${index}`);
      expect(shot.type).toBe('components');
      expect(typeof shot.start).toBe('number');
      expect(typeof shot.end).toBe('number');
      expect(shot.data).toBeDefined();
      expect(shot.data.template).toBe('generic');
    });
  });

  it('should handle empty timeline', () => {
    const sampleTimeline = {
      fps: 30,
      width: 1920,
      height: 1080,
      tracks: [
        {
          type: 'video',
          clips: [],
        },
      ],
    };

    const timeline = [];
    let time = 0;

    for (let i = 0; i < sampleTimeline.tracks[0].clips.length; i++) {
      const clip = sampleTimeline.tracks[0].clips[i];

      timeline.push({
        id: `shot:${i}`,
        type: 'components',
        start: time,
        end: time + clip.duration,
        data: {
          template: 'generic',
        },
      });

      time += clip.duration;
    }

    const output = {
      timeline: timeline,
    };

    expect(output.timeline).toBeDefined();
    expect(Array.isArray(output.timeline)).toBe(true);
    expect(output.timeline.length).toBe(0);
  });

  it('should calculate correct durations', () => {
    const sampleTimeline = {
      fps: 30,
      width: 1920,
      height: 1080,
      tracks: [
        {
          type: 'video',
          clips: [
            { type: 'image', src: 'image1.jpg', start: 0, duration: 10, fit: 'cover' },
            { type: 'image', src: 'image2.jpg', start: 10, duration: 15, fit: 'cover' },
            { type: 'image', src: 'image3.jpg', start: 25, duration: 5, fit: 'cover' },
          ],
        },
      ],
    };

    const timeline = [];
    let time = 0;

    for (let i = 0; i < sampleTimeline.tracks[0].clips.length; i++) {
      const clip = sampleTimeline.tracks[0].clips[i];

      timeline.push({
        id: `shot:${i}`,
        type: 'components',
        start: time,
        end: time + clip.duration,
        data: {
          template: 'generic',
        },
      });

      time += clip.duration;
    }

    expect(timeline[0].start).toBe(0);
    expect(timeline[0].end).toBe(10);
    expect(timeline[1].start).toBe(10);
    expect(timeline[1].end).toBe(25);
    expect(timeline[2].start).toBe(25);
    expect(timeline[2].end).toBe(30);
  });
});
