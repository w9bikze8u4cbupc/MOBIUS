/**
 * Debug treasury pattern matching
 */
function debugTreasury() {
  const CAPTION_OR_REWARD_PATTERNS = [
    /\b(front|back)\s+of\b/i,
    /\b(icon|image|illustration|diagram|figure|caption|labeled)\b/i,
    /\bexample\b/i,
    /\bon the \d+(st|nd|rd|th)\s+space\b/i,
    /\b(win|receive|gain|draw|slide|reveal|place|move|advance|earn|collect|pay|take|flip|discard|shuffle)\b/i,
    // Treat these as non-inventory context when not part of a clear "Label -- quantity" line
    /\b(treasury|bank|reserve|supply pile)\b/i,
  ];

  const line = 'Plastic cups (used for the Treasury; quantity not specified in the excerpt)';
  console.log('Testing line:', line);

  const isExcluded = CAPTION_OR_REWARD_PATTERNS.some((pattern) => pattern.test(line));
  console.log('Is excluded:', isExcluded);

  if (isExcluded) {
    // Find which pattern is matching
    CAPTION_OR_REWARD_PATTERNS.forEach((pattern, index) => {
      if (pattern.test(line)) {
        console.log(`Pattern ${index} matched: ${pattern}`);
      }
    });
  }
}

debugTreasury();
