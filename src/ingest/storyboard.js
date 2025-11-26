// Deprecated compatibility shim: storyboard utilities relocated to src/storyboard.
// This module re-exports the canonical storyboard builder from ingestion output
// to avoid breaking legacy imports. It is not part of the contract-driven
// ingestion pipeline.

module.exports = require('../storyboard/storyboard_from_ingestion');
