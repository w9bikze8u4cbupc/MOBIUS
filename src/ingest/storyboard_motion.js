// Deprecated compatibility shim: storyboard motion macros live in src/storyboard.
// This shim preserves backwards compatibility while making it clear these helpers
// belong to storyboard rendering rather than ingestion.

module.exports = require('../storyboard/storyboard_motion');
