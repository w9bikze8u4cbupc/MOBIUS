import { cacheGet, cacheSet, isFresh } from '../../src/services/cache.js';
import fs from 'fs';
import path from 'path';
import { resolveDataPath } from '../../src/config/paths.js';

describe('cache', () => {
  const testKey = 'test-key';
  const testData = { name: 'Test Data', value: 42 };
  
  afterEach(() => {
    // Clean up test cache files
    const cacheDir = resolveDataPath('cache', 'bgg');
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
  });
  
  it('should store and retrieve data', () => {
    cacheSet(testKey, testData);
    const retrieved = cacheGet(testKey);
    expect(retrieved).toEqual(testData);
  });
  
  it('should return null for non-existent keys', () => {
    const result = cacheGet('non-existent-key');
    expect(result).toBeNull();
  });
  
  it('should handle invalid JSON gracefully', () => {
    // Create an invalid JSON file
    const file = resolveDataPath('cache', 'bgg', 'invalid.json');
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(file, 'invalid json');
    
    const result = cacheGet('invalid');
    expect(result).toBeNull();
  });
  
  it('should correctly identify fresh entries', () => {
    const freshEntry = { __ts: Date.now(), data: testData };
    expect(isFresh(freshEntry, 10000)).toBe(true);
  });
  
  it('should correctly identify stale entries', () => {
    const staleEntry = { __ts: Date.now() - 20000, data: testData };
    expect(isFresh(staleEntry, 10000)).toBe(false);
  });
  
  it('should handle entries without timestamps', () => {
    const entryWithoutTs = { data: testData };
    expect(isFresh(entryWithoutTs, 10000)).toBe(false);
  });
});