/**
 * Debug why Pearls isn't being extracted
 */
function debugPearls() {
  const line = 'Pearls (supply; quantity not specified in the excerpt)';
  console.log('Testing line:', line);

  // Test Pattern E
  const mE = line.match(
    /^([A-Za-z][A-Za-z\s-]*?(?:Pearls?|Cups?|Plastic\s+cups?))\s*\(([^)]*)\)\s*$/i,
  );
  console.log('Pattern E match:', mE);

  if (mE) {
    console.log('Match groups:');
    console.log('  0:', mE[0]);
    console.log('  1:', mE[1]);
    console.log('  2:', mE[2]);
  }
}

debugPearls();
