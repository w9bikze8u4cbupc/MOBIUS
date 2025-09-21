/**
 * Debug quantity parsing
 */
function debugQuantityParsing() {
  function parseQuantityToken(q) {
    const t = String(q || '').toLowerCase();
    if (
      t === 'supply' ||
      t === 'unlimited' ||
      t === 'bank' ||
      t === 'reserve' ||
      t === 'treasury'
    ) {
      return 'supply';
    }
    return /^\d+$/.test(t) ? Number(t) : null;
  }

  // Test with null (for items without explicit quantity)
  console.log('null:', parseQuantityToken(null));

  // Test with note text that contains "supply"
  const noteText = 'supply; quantity not specified in the excerpt';
  console.log(`"${noteText}":`, parseQuantityToken(noteText));

  // Test with "used for the Treasury" text
  const treasuryText = 'used for the Treasury; quantity not specified in the excerpt';
  console.log(`"${treasuryText}":`, parseQuantityToken(treasuryText));
}

debugQuantityParsing();
