// Database placeholder module
export default {
  get: () => ({ get: () => null }),
  prepare: () => ({ get: () => null, all: () => [], run: () => null })
};