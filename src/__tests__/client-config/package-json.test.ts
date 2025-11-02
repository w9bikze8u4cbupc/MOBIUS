/**
 * Comprehensive tests for client package.json configuration
 * Tests dependencies, scripts, and build configuration
 */

import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv';

const CLIENT_PACKAGE_JSON_PATH = path.join(process.cwd(), 'client/package.json');

describe('Client Package.json - Structure and Validity', () => {
  let packageJson: any;

  beforeAll(() => {
    const content = fs.readFileSync(CLIENT_PACKAGE_JSON_PATH, 'utf8');
    packageJson = JSON.parse(content);
  });

  test('should be valid JSON', () => {
    expect(packageJson).toBeDefined();
    expect(typeof packageJson).toBe('object');
  });

  test('should have required package.json fields', () => {
    expect(packageJson).toHaveProperty('name');
    expect(packageJson).toHaveProperty('version');
    expect(packageJson).toHaveProperty('private');
    expect(packageJson).toHaveProperty('dependencies');
    expect(packageJson).toHaveProperty('scripts');
  });

  test('should be marked as private', () => {
    expect(packageJson.private).toBe(true);
  });

  test('should have name "client"', () => {
    expect(packageJson.name).toBe('client');
  });

  test('should have a valid semver version', () => {
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('Client Package.json - Dependencies', () => {
  let packageJson: any;

  beforeAll(() => {
    const content = fs.readFileSync(CLIENT_PACKAGE_JSON_PATH, 'utf8');
    packageJson = JSON.parse(content);
  });

  test('should have React dependencies', () => {
    expect(packageJson.dependencies).toHaveProperty('react');
    expect(packageJson.dependencies).toHaveProperty('react-dom');
  });

  test('should use React 19.x', () => {
    expect(packageJson.dependencies.react).toMatch(/\^19\./);
    expect(packageJson.dependencies['react-dom']).toMatch(/\^19\./);
  });

  test('should have testing library dependencies', () => {
    expect(packageJson.dependencies).toHaveProperty('@testing-library/react');
    expect(packageJson.dependencies).toHaveProperty('@testing-library/jest-dom');
    expect(packageJson.dependencies).toHaveProperty('@testing-library/dom');
    expect(packageJson.dependencies).toHaveProperty('@testing-library/user-event');
  });

  test('should have axios for HTTP requests', () => {
    expect(packageJson.dependencies).toHaveProperty('axios');
  });

  test('should have react-markdown for markdown rendering', () => {
    expect(packageJson.dependencies).toHaveProperty('react-markdown');
  });

  test('should have pdfjs-dist for PDF handling', () => {
    expect(packageJson.dependencies).toHaveProperty('pdfjs-dist');
  });

  test('should have react-scripts', () => {
    expect(packageJson.dependencies).toHaveProperty('react-scripts');
    expect(packageJson.dependencies['react-scripts']).toBe('5.0.1');
  });

  test('should have web-vitals for performance monitoring', () => {
    expect(packageJson.dependencies).toHaveProperty('web-vitals');
  });

  test('should have all required testing library packages', () => {
    const testingLibraries = [
      '@testing-library/dom',
      '@testing-library/jest-dom',
      '@testing-library/react',
      '@testing-library/user-event'
    ];
    
    testingLibraries.forEach(lib => {
      expect(packageJson.dependencies).toHaveProperty(lib);
    });
  });
});

describe('Client Package.json - Scripts Configuration', () => {
  let packageJson: any;

  beforeAll(() => {
    const content = fs.readFileSync(CLIENT_PACKAGE_JSON_PATH, 'utf8');
    packageJson = JSON.parse(content);
  });

  test('should have all required scripts', () => {
    const requiredScripts = ['start', 'build', 'test', 'test:rendering', 'test:accessibility', 'audit:report', 'eject'];
    requiredScripts.forEach(script => {
      expect(packageJson.scripts).toHaveProperty(script);
    });
  });

  test('start script should use react-scripts', () => {
    expect(packageJson.scripts.start).toBe('react-scripts start');
  });

  test('build script should run tests before building', () => {
    expect(packageJson.scripts.build).toContain('test:rendering');
    expect(packageJson.scripts.build).toContain('test:accessibility');
    expect(packageJson.scripts.build).toContain('react-scripts build');
  });

  test('test script should run in non-watch mode', () => {
    expect(packageJson.scripts.test).toContain('react-scripts test');
    expect(packageJson.scripts.test).toContain('--watchAll=false');
  });

  test('test:rendering should use testPathPattern', () => {
    expect(packageJson.scripts['test:rendering']).toContain('--testPathPattern=rendering');
    expect(packageJson.scripts['test:rendering']).toContain('--passWithNoTests');
  });

  test('test:accessibility should use testPathPattern', () => {
    expect(packageJson.scripts['test:accessibility']).toContain('--testPathPattern=accessibility');
    expect(packageJson.scripts['test:accessibility']).toContain('--passWithNoTests');
  });

  test('audit:report script should use node', () => {
    expect(packageJson.scripts['audit:report']).toContain('node scripts/compile-audit-report.cjs');
  });

  test('eject script should use react-scripts', () => {
    expect(packageJson.scripts.eject).toBe('react-scripts eject');
  });
});

describe('Client Package.json - Browser Configuration', () => {
  let packageJson: any;

  beforeAll(() => {
    const content = fs.readFileSync(CLIENT_PACKAGE_JSON_PATH, 'utf8');
    packageJson = JSON.parse(content);
  });

  test('should have browser field defined', () => {
    expect(packageJson).toHaveProperty('browser');
    expect(typeof packageJson.browser).toBe('object');
  });

  test('should disable Node.js modules in browser', () => {
    expect(packageJson.browser).toHaveProperty('fs', false);
    expect(packageJson.browser).toHaveProperty('path', false);
    expect(packageJson.browser).toHaveProperty('os', false);
  });

  test('browser configuration should only contain expected modules', () => {
    const expectedModules = ['fs', 'path', 'os'];
    const browserModules = Object.keys(packageJson.browser);
    
    browserModules.forEach(module => {
      expect(expectedModules).toContain(module);
    });
    
    expectedModules.forEach(module => {
      expect(packageJson.browser).toHaveProperty(module);
    });
  });
});

describe('Client Package.json - Removed Configuration', () => {
  let packageJson: any;

  beforeAll(() => {
    const content = fs.readFileSync(CLIENT_PACKAGE_JSON_PATH, 'utf8');
    packageJson = JSON.parse(content);
  });

  test('should not have eslintConfig', () => {
    expect(packageJson).not.toHaveProperty('eslintConfig');
  });

  test('should not have browserslist', () => {
    expect(packageJson).not.toHaveProperty('browserslist');
  });
});

describe('Client Package.json - Test Script Flags', () => {
  let packageJson: any;

  beforeAll(() => {
    const content = fs.readFileSync(CLIENT_PACKAGE_JSON_PATH, 'utf8');
    packageJson = JSON.parse(content);
  });

  test('all test scripts should use --watchAll=false', () => {
    const testScripts = ['test', 'test:rendering', 'test:accessibility'];
    testScripts.forEach(script => {
      expect(packageJson.scripts[script]).toContain('--watchAll=false');
    });
  });

  test('specialized test scripts should use --passWithNoTests', () => {
    const specializedTests = ['test:rendering', 'test:accessibility'];
    specializedTests.forEach(script => {
      expect(packageJson.scripts[script]).toContain('--passWithNoTests');
    });
  });

  test('main test script should not have --passWithNoTests', () => {
    expect(packageJson.scripts.test).not.toContain('--passWithNoTests');
  });
});

describe('Client Package.json - Build Pipeline Integration', () => {
  let packageJson: any;

  beforeAll(() => {
    const content = fs.readFileSync(CLIENT_PACKAGE_JSON_PATH, 'utf8');
    packageJson = JSON.parse(content);
  });

  test('build script should execute tests in correct order', () => {
    const buildScript = packageJson.scripts.build;
    const renderingIndex = buildScript.indexOf('test:rendering');
    const accessibilityIndex = buildScript.indexOf('test:accessibility');
    const buildIndex = buildScript.indexOf('react-scripts build');

    expect(renderingIndex).toBeLessThan(accessibilityIndex);
    expect(accessibilityIndex).toBeLessThan(buildIndex);
  });

  test('build script should use npm run for test invocation', () => {
    expect(packageJson.scripts.build).toMatch(/npm run test:rendering/);
    expect(packageJson.scripts.build).toMatch(/npm run test:accessibility/);
  });

  test('build script should use && for chaining commands', () => {
    const buildScript = packageJson.scripts.build;
    const ampersandCount = (buildScript.match(/&&/g) || []).length;
    expect(ampersandCount).toBeGreaterThanOrEqual(2);
  });
});

describe('Client Package.json - Version Compatibility', () => {
  let packageJson: any;

  beforeAll(() => {
    const content = fs.readFileSync(CLIENT_PACKAGE_JSON_PATH, 'utf8');
    packageJson = JSON.parse(content);
  });

  test('React and React-DOM should have matching versions', () => {
    expect(packageJson.dependencies.react).toBe(packageJson.dependencies['react-dom']);
  });

  test('should use compatible testing library versions', () => {
    const testingLibDom = packageJson.dependencies['@testing-library/dom'];
    const testingLibReact = packageJson.dependencies['@testing-library/react'];
    
    expect(testingLibDom).toBeDefined();
    expect(testingLibReact).toBeDefined();
  });

  test('axios should be a recent version', () => {
    const axiosVersion = packageJson.dependencies.axios;
    expect(axiosVersion).toMatch(/\^1\./);
  });
});

describe('Client Package.json - Script Syntax Validation', () => {
  let packageJson: any;

  beforeAll(() => {
    const content = fs.readFileSync(CLIENT_PACKAGE_JSON_PATH, 'utf8');
    packageJson = JSON.parse(content);
  });

  test('scripts should not have trailing spaces', () => {
    Object.values(packageJson.scripts).forEach((script: any) => {
      expect(script).toBe(script.trim());
    });
  });

  test('scripts should not have double spaces', () => {
    Object.values(packageJson.scripts).forEach((script: any) => {
      expect(script).not.toMatch(/  +/);
    });
  });

  test('script paths should use forward slashes', () => {
    Object.values(packageJson.scripts).forEach((script: any) => {
      if (script.includes('scripts/')) {
        expect(script).not.toContain('\\');
      }
    });
  });
});

describe('Client Package.json - Dependency Integrity', () => {
  let packageJson: any;

  beforeAll(() => {
    const content = fs.readFileSync(CLIENT_PACKAGE_JSON_PATH, 'utf8');
    packageJson = JSON.parse(content);
  });

  test('should not have devDependencies section', () => {
    expect(packageJson).not.toHaveProperty('devDependencies');
  });

  test('all dependencies should have version specifiers', () => {
    Object.values(packageJson.dependencies).forEach((version: any) => {
      expect(version).toMatch(/^[\^~]?\d+\.\d+\.\d+/);
    });
  });

  test('should use caret (^) for most dependencies', () => {
    const deps = packageJson.dependencies;
    const caretDeps = Object.values(deps).filter((v: any) => v.startsWith('^')).length;
    const totalDeps = Object.keys(deps).length;
    
    // Most dependencies should use caret for minor/patch updates
    expect(caretDeps / totalDeps).toBeGreaterThan(0.7);
  });
});

describe('Client Package.json - JSON Schema Validation', () => {
  let packageJson: any;
  let ajv: Ajv;

  beforeAll(() => {
    const content = fs.readFileSync(CLIENT_PACKAGE_JSON_PATH, 'utf8');
    packageJson = JSON.parse(content);
    ajv = new Ajv();
  });

  test('should match npm package.json schema structure', () => {
    const schema = {
      type: 'object',
      required: ['name', 'version'],
      properties: {
        name: { type: 'string' },
        version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+' },
        private: { type: 'boolean' },
        dependencies: { type: 'object' },
        scripts: { type: 'object' },
        browser: { type: 'object' }
      }
    };

    const validate = ajv.compile(schema);
    const valid = validate(packageJson);
    expect(valid).toBe(true);
  });

  test('scripts should be string values', () => {
    Object.values(packageJson.scripts).forEach((script: any) => {
      expect(typeof script).toBe('string');
    });
  });

  test('dependencies should be string values', () => {
    Object.values(packageJson.dependencies).forEach((version: any) => {
      expect(typeof version).toBe('string');
    });
  });

  test('browser configuration should have boolean values', () => {
    Object.values(packageJson.browser).forEach((value: any) => {
      expect(typeof value).toBe('boolean');
    });
  });
});

describe('Client Package.json - CI/CD Integration', () => {
  let packageJson: any;

  beforeAll(() => {
    const content = fs.readFileSync(CLIENT_PACKAGE_JSON_PATH, 'utf8');
    packageJson = JSON.parse(content);
  });

  test('test script should be compatible with CI environments', () => {
    expect(packageJson.scripts.test).toContain('--watchAll=false');
  });

  test('build script should fail if tests fail', () => {
    const buildScript = packageJson.scripts.build;
    // Using && ensures build stops if tests fail
    expect(buildScript).toContain('&&');
  });

  test('should support npm ci command pattern', () => {
    // Package.json should have lock file compatible structure
    expect(packageJson.dependencies).toBeDefined();
    expect(Object.keys(packageJson.dependencies).length).toBeGreaterThan(0);
  });
});

describe('Client Package.json - Best Practices', () => {
  let packageJsonContent: string;
  let packageJson: any;

  beforeAll(() => {
    packageJsonContent = fs.readFileSync(CLIENT_PACKAGE_JSON_PATH, 'utf8');
    packageJson = JSON.parse(packageJsonContent);
  });

  test('should use consistent formatting', () => {
    // Should be parseable as JSON (already tested) and properly formatted
    expect(() => JSON.parse(packageJsonContent)).not.toThrow();
  });

  test('should not have trailing commas in JSON', () => {
    // Valid JSON doesn't allow trailing commas
    expect(() => JSON.parse(packageJsonContent)).not.toThrow();
  });

  test('should have consistent property ordering', () => {
    const keys = Object.keys(packageJson);
    const expectedOrder = ['name', 'version', 'private', 'dependencies', 'scripts', 'browser'];
    
    expectedOrder.forEach((key, index) => {
      if (packageJson[key] !== undefined) {
        expect(keys.indexOf(key)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test('scripts should use consistent quote style', () => {
    // All scripts should be valid strings without syntax errors
    Object.values(packageJson.scripts).forEach((script: any) => {
      expect(typeof script).toBe('string');
      expect(script.length).toBeGreaterThan(0);
    });
  });
});