import { uid, toSrt, formatTime, pad } from '../scriptUtils';

describe('scriptUtils', () => {
  test('uid generates unique identifiers', () => {
    const id1 = uid();
    const id2 = uid();
    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).not.toBe(id2);
  });

  test('formatTime correctly formats milliseconds', () => {
    // Test basic formatting
    expect(formatTime(0)).toBe('00:00:00,000');
    expect(formatTime(1000)).toBe('00:00:01,000');
    expect(formatTime(60000)).toBe('00:01:00,000');
    expect(formatTime(3600000)).toBe('01:00:00,000');
    
    // Test with milliseconds
    expect(formatTime(1234)).toBe('00:00:01,234');
  });

  test('pad correctly pads numbers', () => {
    expect(pad(0)).toBe('00');
    expect(pad(5)).toBe('05');
    expect(pad(12)).toBe('12');
    expect(pad(123)).toBe('123');
  });

  test('toSrt generates valid SRT content', () => {
    const chapters = [
      {
        id: 'ch1',
        title: 'Introduction',
        steps: [
          { id: 's1', text: 'Welcome to the tutorial' },
          { id: 's2', text: 'This is the first step' }
        ]
      },
      {
        id: 'ch2',
        title: 'Main Content',
        steps: [
          { id: 's3', text: 'This is the second step' }
        ]
      }
    ];

    const srt = toSrt(chapters);
    const lines = srt.split('\n');
    
    // Check that we have the right number of lines
    // Should be: 1, time, text, blank, 2, time, text, blank, 3, time, text, blank, 4, time, text, blank
    expect(lines.length).toBe(16);
    
    // Check first entry
    expect(lines[0]).toBe('1');
    expect(lines[1]).toMatch(/\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/);
    expect(lines[2]).toBe('Introduction');
    expect(lines[3]).toBe('');
    
    // Check that content is present
    expect(srt).toContain('Welcome to the tutorial');
    expect(srt).toContain('This is the first step');
    expect(srt).toContain('This is the second step');
  });
});