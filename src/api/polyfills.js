// src/api/polyfills.js
try {
  import('canvas').then(({ DOMMatrix }) => {
    if (typeof global.DOMMatrix === 'undefined' && DOMMatrix) {
      global.DOMMatrix = DOMMatrix;
      console.log('[polyfills] DOMMatrix polyfilled from node-canvas');
    }
  }).catch(err => {
    console.warn('[polyfills] Failed to import canvas:', err);
  });
} catch (err) {
  console.warn('[polyfills] Failed to load canvas:', err);
}

// Additional polyfills for URL validation
if (typeof global.URL === 'undefined') {
  global.URL = require('url').URL;
  console.log('[polyfills] URL polyfilled');
}

if (typeof global.URLSearchParams === 'undefined') {
  global.URLSearchParams = require('url').URLSearchParams;
  console.log('[polyfills] URLSearchParams polyfilled');
}