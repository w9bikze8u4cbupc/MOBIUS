const PERF_BASELINE_SCHEMA_VERSION = 1;

function assertPerfBaselineShape(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('perf baseline must be an object');
  if (obj.schema !== PERF_BASELINE_SCHEMA_VERSION) throw new Error(`Unsupported perf baseline schema: ${obj.schema}`);
  if (!Array.isArray(obj.entries)) throw new Error('perf baseline "entries" must be an array');
  obj.entries.forEach((e, i) => {
    const required = ['game', 'platform', 'min_fps'];
    required.forEach(k => {
      if (e[k] == null || (typeof e[k] === 'number' && Number.isNaN(e[k]))) {
        throw new Error(`perf baseline entries[${i}].${k} is required`);
      }
    });
  });
}

assertPerfBaselineShape.SCHEMA_VERSION = PERF_BASELINE_SCHEMA_VERSION;
module.exports = assertPerfBaselineShape;