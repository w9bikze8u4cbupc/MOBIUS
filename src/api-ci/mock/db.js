module.exports = {
  async connect() {
    // no-op mock connection
    return Promise.resolve(true);
  },
  async close() {
    return Promise.resolve(true);
  },
  async query() {
    return Promise.resolve([]);
  }
};