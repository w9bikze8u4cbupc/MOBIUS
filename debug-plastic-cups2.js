import { extractComponentsFromText } from './src/api/utils.js';

/**
 * Debug why Plastic cups isn't being extracted
 */
function debugPlasticCups() {
  const text = `
  Contents & Setup
  
  Plastic cups (used for the Treasury; quantity not specified in the excerpt)
  
  Object of the Game
  `;

  console.log('Testing with just Plastic cups line:');
  const components = extractComponentsFromText(text);
  console.log('Components found:', components);
}

debugPlasticCups();
