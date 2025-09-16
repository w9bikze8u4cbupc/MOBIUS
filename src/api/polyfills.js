// src/api/polyfills.js
import { DOMMatrix } from 'canvas';

if (typeof global.DOMMatrix === 'undefined' && DOMMatrix) {
  global.DOMMatrix = DOMMatrix;
  console.log('[polyfills] DOMMatrix polyfilled from node-canvas');
}