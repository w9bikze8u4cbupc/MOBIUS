module.exports = {
  async analyze(text) {
    return {
      summary: 'mock-summary',
      tokens: 0,
    };
  },
  async embed() {
    return [];
  }
};