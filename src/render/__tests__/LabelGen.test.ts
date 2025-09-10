import { LabelGen } from '../LabelGen';

describe('LabelGen', () => {
  let labelGen: LabelGen;

  beforeEach(() => {
    labelGen = new LabelGen();
  });

  test('should generate unique labels with default prefix', () => {
    expect(labelGen.next()).toBe('tmp0');
    expect(labelGen.next()).toBe('tmp1');
    expect(labelGen.next()).toBe('tmp2');
  });

  test('should generate unique labels with custom prefix', () => {
    expect(labelGen.next('v')).toBe('v0');
    expect(labelGen.next('v')).toBe('v1');
    expect(labelGen.next('a')).toBe('a0');
    expect(labelGen.next('v')).toBe('v2');
  });

  test('should peek at current count without incrementing', () => {
    expect(labelGen.peek()).toBe(0);
    labelGen.next();
    expect(labelGen.peek()).toBe(1);
    labelGen.next();
    expect(labelGen.peek()).toBe(2);
  });

  test('should peek at current count for specific prefix', () => {
    expect(labelGen.peek('v')).toBe(0);
    labelGen.next('v');
    expect(labelGen.peek('v')).toBe(1);
    labelGen.next('a');
    expect(labelGen.peek('v')).toBe(1);
    expect(labelGen.peek('a')).toBe(1);
  });

  test('should reset all counters', () => {
    labelGen.next('v');
    labelGen.next('a');
    expect(labelGen.peek('v')).toBe(1);
    expect(labelGen.peek('a')).toBe(1);
    
    labelGen.reset();
    expect(labelGen.peek('v')).toBe(0);
    expect(labelGen.peek('a')).toBe(0);
  });

  test('should reset specific counter', () => {
    labelGen.next('v');
    labelGen.next('a');
    expect(labelGen.peek('v')).toBe(1);
    expect(labelGen.peek('a')).toBe(1);
    
    labelGen.resetPrefix('v');
    expect(labelGen.peek('v')).toBe(0);
    expect(labelGen.peek('a')).toBe(1);
  });
});