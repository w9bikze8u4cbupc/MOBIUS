// Mock global objects that might not exist in Node.js environment
global.FormData = class FormData {
  constructor() {
    this.data = new Map();
  }
  append(key, value) {
    this.data.set(key, value);
  }
};

global.Blob = class Blob {
  constructor(content, options = {}) {
    this.content = content;
    this.type = options.type || '';
  }
};

// Mock fetch if not available in test environment
if (!global.fetch) {
  global.fetch = jest.fn();
}

// Clear all mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});
