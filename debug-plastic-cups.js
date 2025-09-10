/**
 * Debug why Plastic cups isn't being extracted
 */
function debugPlasticCups() {
  const line = "Plastic cups (used for the Treasury; quantity not specified in the excerpt)";
  console.log('Testing line:', line);
  
  // Test Pattern E
  const mE = line.match(/^([A-Za-z][A-Za-z\s-]*?(?:Pearls?|Cups?|Plastic\s+Cups?))\s*\(([^)]*)\)\s*$/);
  console.log('Pattern E match:', mE);
  
  // Test Pattern G
  const mG = line.match(/^([A-Za-z][A-Za-z\s-]*?(?:pearls?|cups?|plastic\s+cups?))\s*\(([^)]*)\)\s*$/i);
  console.log('Pattern G match:', mG);
  
  // Test Pattern H
  const mH = line.match(/^([A-Za-z][A-Za-z\s-]*?)\s*\(([^)]*)\)\s*$/);
  console.log('Pattern H match:', mH);
  
  if (mH) {
    console.log('Pattern H groups:');
    console.log('  0:', mH[0]);
    console.log('  1:', mH[1]);
    console.log('  2:', mH[2]);
  }
}

debugPlasticCups();