// src/metrics/metrics.js
const counters = new Map();

function inc(name, by = 1) {
  counters.set(name, (counters.get(name) || 0) + by);
}

function get(name) {
  return counters.get(name) || 0;
}

function snapshot() {
  return Array.from(counters.entries()).reduce((acc, [k, v]) => {
    acc[k] = v;
    return acc;
  }, {});
}

export const Metrics = { inc, get, snapshot };