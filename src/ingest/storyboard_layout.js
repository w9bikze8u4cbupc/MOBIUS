// Deprecated compatibility shim: storyboard layout helpers live in src/storyboard.
// This shim keeps legacy callers working while clarifying that these functions
// are storyboard-only utilities, not ingestion pipeline code.

module.exports = require('../storyboard/storyboard_layout');
