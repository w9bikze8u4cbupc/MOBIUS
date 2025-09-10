/**
 * Debug why Pearls isn't being extracted - more detailed
 */
function debugPearls() {
  const line = "Pearls (supply; quantity not specified in the excerpt)";
  console.log('Testing line:', line);
  
  // Test all patterns
  console.log('\nTesting Pattern E (case sensitive):');
  const mE = line.match(/^([A-Za-z][A-Za-z\s-]*?(?:Pearls?|Cups?|Plastic\s+Cups?))\s*\(([^)]*)\)\s*$/i);
  console.log('Match result:', mE);
  
  console.log('\nTesting Pattern G (case insensitive):');
  const mG = line.match(/^([A-Za-z][A-Za-z\s-]*?(?:pearls?|cups?|plastic\s+cups?))\s*\(([^)]*)\)\s*$/i);
  console.log('Match result:', mG);
  
  if (mG) {
    console.log('Match groups:');
    console.log('  0:', mG[0]);
    console.log('  1:', mG[1]);
    console.log('  2:', mG[2]);
  }
  
  console.log('\nTesting simplified pattern:');
  const simple = line.match(/^([A-Za-z][A-Za-z\s-]*?)\s*\(([^)]*)\)\s*$/);
  console.log('Simple match:', simple);
  
  if (simple) {
    console.log('Simple match groups:');
    console.log('  0:', simple[0]);
    console.log('  1:', simple[1]);
    console.log('  2:', simple[2]);
  }
}

debugPearls();