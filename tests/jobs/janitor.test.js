import { runJanitor } from '../../src/jobs/janitor.js';
import fs from 'fs';
import path from 'path';

describe('janitor', () => {
  const testDir = path.join(process.cwd(), 'data', 'test-janitor');
  
  beforeEach(() => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });
  
  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });
  
  it('should not fail when directories do not exist', () => {
    // This should not throw an error
    expect(() => runJanitor()).not.toThrow();
  });
});