// Minimal database stub for testing
const db = {
  get: (query, params, callback) => {
    // Mock database response
    callback(null, null);
  },
  run: (query, params, callback) => {
    callback(null);
  },
  close: () => {}
};

export default db;