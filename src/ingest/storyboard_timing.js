// Deprecated compatibility shim: storyboard timing utilities live in src/storyboard.
// This shim preserves existing imports while we transition away from the legacy
// ingestion-adjacent namespace.

module.exports = require('../storyboard/storyboard_timing');
