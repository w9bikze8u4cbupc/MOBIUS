// utils.js

// Minimal, self-contained component extractor for rulebooks
export function extractComponentsFromText(pdfText, verbose = false, lenient = false) {
  // Multilingual section headers for component detection
  const START_RE =
    /(?:^|\n)\s*(contents\s*&\s*setup|components?|box contents|game components|material|componentes|inhalt|composants|materiali|contenu|contenuto|contenido|what's in the box|ce qu'il y a dans la boîte|was ist im spiel|qué hay en la caja)\b/i;
  const END_RE =
    /(?:^|\n)\s*(object of the game|game overview|setup ends|1\s+plot at court|setup\b(?!.*contents)|rules?|how to play)/i;

  // Base canonical labels that should be available for all games
  const BASE_CANONICAL = new Set([
    'Game board',
    'Exploration cards',
    'Lord cards',
    'Location tiles',
    'Monster tokens',
    'Key tokens',
    'Pearls',
    'Plastic cups',
    'Geisha cards',
    'Item cards',
    'Action markers',
    'Victory markers',
  ]);

  // Default allowed canonical labels (can be overridden per game)
  let ALLOWED_CANONICAL = new Set([
    'Game board',
    'Exploration cards',
    'Lord cards',
    'Location tiles',
    'Monster tokens',
    'Key tokens',
    'Pearls',
    'Plastic cups',
  ]);

  // Ordered synonym list for easy maintenance
  const SYNONYMS = [
    // Game board synonyms
    { re: /\bmain\s+board\b/i, canonical: 'Game board' },
    { re: /\bgameboard\b/i, canonical: 'Game board' },
    // Exploration cards synonyms
    { re: /\bexpansion\s+card(s)?\b/i, canonical: 'Exploration cards' },
    { re: /\ball(y|ies)\b/i, canonical: 'Exploration cards' }, // Allies
    { re: /\bmonster(s)?\b/i, canonical: 'Exploration cards' }, // Monsters
    // Pearl synonyms
    { re: /\bpearl\s+token(s)?\b/i, canonical: 'Pearls' },
    // Plastic cups synonyms
    { re: /\bcup(s)?\s*\(?plastic\)?\b/i, canonical: 'Plastic cups' },
    // Location tiles synonyms
    { re: /\blocation(s)?\b/i, canonical: 'Location tiles' },
    // Monster tokens synonyms (be specific to avoid conflicts)
    { re: /\bmonster\s+token(s)?\b/i, canonical: 'Monster tokens' },
    // Lord cards synonyms
    { re: /\blord(s)?(\s+card(s)?)?\b/i, canonical: 'Lord cards' },
    // Key tokens synonyms
    { re: /\bkey(s)?(\s+token(s)?)?\b/i, canonical: 'Key tokens' },
    // Exploration cards synonyms
    { re: /\bexploration\s+card(s)?\b/i, canonical: 'Exploration cards' },
    // Board synonyms
    { re: /\b(game\s*)?board(s)?\b/i, canonical: 'Game board' },
    // Hanamikoji specific synonyms
    { re: /\bgeisha\s+card(s)?\b/i, canonical: 'Geisha cards' },
    { re: /\bitem\s+card(s)?\b/i, canonical: 'Item cards' },
    { re: /\baction\s+marker(s)?\b/i, canonical: 'Action markers' },
    { re: /\bvictory\s+marker(s)?\b/i, canonical: 'Victory markers' },
  ];

  // OCR normalization patterns
  const OCR_NORMALIZATIONS = [
    { pattern: /l0rd/g, replacement: 'lord' },
    { pattern: /L0rd/g, replacement: 'Lord' },
    { pattern: /expl0ration/g, replacement: 'exploration' },
    { pattern: /Expl0ration/g, replacement: 'Exploration' },
    { pattern: /expi0ration/g, replacement: 'exploration' }, // Additional OCR fix
    { pattern: /t0kens/g, replacement: 'tokens' }, // Additional OCR fix
    { pattern: /m0nster/g, replacement: 'monster' },
    { pattern: /M0nster/g, replacement: 'Monster' },
    { pattern: /b0ard/g, replacement: 'board' },
    { pattern: /B0ard/g, replacement: 'Board' },
    { pattern: /[\u2018\u2019]/g, replacement: '\'' }, // Smart quotes to ASCII
    { pattern: /[\u201c\u201d]/g, replacement: '"' }, // Smart double quotes to ASCII
    { pattern: /[\u2013\u2014]/g, replacement: '-' }, // En/em dashes to hyphen
    { pattern: /\bca\s*rd(s?)\b/g, replacement: 'card$1' }, // ca rd -> card
    { pattern: /\bto\s*ken(s?)\b/g, replacement: 'token$1' }, // to ken -> token
  ];

  function normalizeOCR(text) {
    let normalized = text;

    // In lenient mode, apply additional normalizations
    if (lenient) {
      // Normalize various bullet points and list markers
      normalized = normalized.replace(/[•\u2022\u2023\u25E6\u2043\u2219]/g, '-');

      // Normalize various dash types to standard hyphen
      normalized = normalized.replace(/[\u2013\u2014\u2015]/g, '-');

      // Normalize whitespace
      normalized = normalized.replace(/[\t\r]/g, ' ');
      normalized = normalized.replace(/\s+/g, ' ');

      // Remove extra colons and punctuation that might interfere
      normalized = normalized.replace(/\s*:\s*$/g, '');
    }

    for (const { pattern, replacement } of OCR_NORMALIZATIONS) {
      normalized = normalized.replace(pattern, replacement);
    }

    // De-duplicate repeated words
    normalized = normalized.replace(/\b(\w+)\s+\1\b/g, '$1');

    // Normalize stray colons/dashes around counts
    normalized = normalized.replace(/(\d+)\s*[:\-]\s*/g, '$1 ');

    return normalized;
  }

  function normalizeToCanonical(label) {
    const raw = (label || '').trim();
    for (const { re, canonical } of SYNONYMS) {
      if (re.test(raw)) return canonical;
    }
    return null; // do not pass through unknowns
  }

  function parseQuantityToken(q, note) {
    // First check if the quantity itself is a number or supply keyword
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
    if (/^\d+$/.test(t)) {
      return Number(t);
    }

    // If quantity is null or not a number, check the note for supply keywords
    if (note) {
      const noteText = String(note).toLowerCase();
      if (
        noteText.includes('supply') ||
        noteText.includes('unlimited') ||
        noteText.includes('bank') ||
        noteText.includes('reserve') ||
        noteText.includes('treasury')
      ) {
        return 'supply';
      }
    }

    return null;
  }

  // Also exclude lines that are actually instructions around the bank/treasury
  const CAPTION_OR_REWARD_PATTERNS = [
    { pattern: /\b(front|back)\s+of\b/i, reason: 'caption_reward', reasonCode: 'caption' },
    {
      pattern: /\b(icon|image|illustration|diagram|figure|caption|labeled)\b/i,
      reason: 'image reference',
      reasonCode: 'image_reference',
    },
    { pattern: /\bexample\b/i, reason: 'example', reasonCode: 'example' },
    {
      pattern: /\bon the \d+(st|nd|rd|th)\s+space\b/i,
      reason: 'reward text',
      reasonCode: 'reward_text',
    },
    {
      pattern:
        /\b(win|receive|gain|draw|slide|reveal|place|move|advance|earn|collect|pay|take|flip|discard|shuffle)\b/i,
      reason: 'instruction',
      reasonCode: 'instruction',
    },
  ];

  // Slice to the components section
  const start = START_RE.exec(pdfText);
  let slice = pdfText;
  let usedFallback = false;

  if (start) {
    const rest = pdfText.slice(start.index + start[0].length);
    const end = END_RE.exec(rest);
    slice = end ? rest.slice(0, end.index) : rest;
  } else {
    // Fallback to full text with confidence requirement
    usedFallback = true;
    slice = pdfText;

    // Check confidence requirements
    const lines = slice
      .split(/\r?\n/)
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    // Count distinct allowed labels
    let distinctLabels = 0;
    const foundLabels = new Set();

    // Count "Label — Quantity" formatted lines
    let formattedLines = 0;

    for (const line of lines) {
      const normalizedLine = normalizeOCR(line);

      // Check for "Label — Quantity" format
      if (/^[A-Za-z][A-Za-z\s-]*?\s*[:\-]?\s*\d+/.test(normalizedLine)) {
        formattedLines++;
      }

      // Check for allowed labels
      for (const { re, canonical } of SYNONYMS) {
        if (re.test(normalizedLine) && ALLOWED_CANONICAL.has(canonical)) {
          if (!foundLabels.has(canonical)) {
            foundLabels.add(canonical);
            distinctLabels++;
          }
        }
      }
    }

    // Confidence requirements: at least 2 distinct allowed labels OR at least 2 formatted lines
    if (distinctLabels < 2 && formattedLines < 2) {
      if (verbose) {
        console.log(
          '⚠️ LOW-CONFIDENCE FALLBACK SUPPRESSED: Not enough distinct labels or formatted lines',
        );
      }
      slice = ''; // Return empty if confidence is too low
    }
  }

  const lines = slice
    .split(/\r?\n/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (verbose) {
    if (usedFallback) {
      console.log('📄 FULL TEXT FALLBACK (confidence check passed)');
    } else {
      console.log(`📄 SCOPED LINES (${lines.length} lines):`);
    }
    lines.forEach((line, i) => {
      console.log(`   ${i + 1}. ${line}`);
    });
  }

  const items = new Map(); // name -> { name, count, note }
  const deadLetterLines = []; // For suspicious but excluded lines

  const addItem = (name, count, note) => {
    const canonicalName = normalizeToCanonical(name);
    if (!canonicalName || !ALLOWED_CANONICAL.has(canonicalName)) return;

    const prev = items.get(canonicalName);
    if (!prev) {
      items.set(canonicalName, {
        name: canonicalName,
        count: parseQuantityToken(count, note),
        note: note?.trim() || null,
      });
    } else {
      // Prefer a numeric count if previously null
      if (prev.count == null && count != null) prev.count = parseQuantityToken(count, note);
      // Prefer a more informative note if available
      if (!prev.note && note) prev.note = note?.trim() || null;
    }
  };

  // Helper function to parse breakdowns and calculate sums
  function parseBreakdown(note) {
    if (!note) return { breakdown: [], sum: 0 };

    const breakdown = [];
    let sum = 0;

    // Pattern for "65 Allies & 6 Monsters"
    const subtypePattern = /(\d+)\s+([A-Za-z]+)(?=\s*(?:[,&]|\)|$))/g;
    let subtypeMatch;
    while ((subtypeMatch = subtypePattern.exec(note)) !== null) {
      const quantity = parseInt(subtypeMatch[1], 10);
      const label = subtypeMatch[2];
      breakdown.push({ label, quantity });
      sum += quantity;
    }

    // Pattern for "2×4, 9×3, 9×2" (multipliers)
    const multiplierPattern = /(\d+)\s*[×x]\s*(\d+)(?=\s*(?:[,&]|\)|$))/g;
    let multiplierMatch;
    let multiplierSum = 0;
    while ((multiplierMatch = multiplierPattern.exec(note)) !== null) {
      const count = parseInt(multiplierMatch[1], 10);
      const value = parseInt(multiplierMatch[2], 10);
      breakdown.push({ count, value });
      multiplierSum += count;
    }

    // If we found multipliers, use their sum instead
    if (multiplierSum > 0) {
      sum = multiplierSum;
    }

    return { breakdown, sum };
  }

  if (verbose) {
    console.log('\n🔍 CANDIDATE LINE ANALYSIS:');
  }

  for (const line of lines) {
    // Apply OCR normalization
    const normalizedLine = normalizeOCR(line);

    // Check if line should be excluded
    let excluded = false;
    let exclusionReason = '';
    let exclusionReasonCode = '';

    for (const { pattern, reason, reasonCode } of CAPTION_OR_REWARD_PATTERNS) {
      if (pattern.test(normalizedLine)) {
        excluded = true;
        exclusionReason = reason;
        exclusionReasonCode = reasonCode;
        break;
      }
    }

    if (excluded) {
      if (verbose) {
        console.log(
          `   ❌ DROPPED: "${line}" (reason: ${exclusionReason}) [code: ${exclusionReasonCode}]`,
        );
      }

      // Dead-letter capture for excluded-but-suspicious lines
      const suspiciousPatterns = [
        /\b\d+\s+[A-Za-z]/, // Contains number followed by word
        /\b[A-Za-z]+\s*\(/, // Contains word followed by parenthesis
        /token|card|board|tile/i, // Contains component-related words
      ];

      const isSuspicious = suspiciousPatterns.some((pattern) => pattern.test(line));
      if (isSuspicious) {
        deadLetterLines.push({ line, reason: exclusionReason, reasonCode: exclusionReasonCode });
        if (verbose) {
          console.log(
            `   📝 DEAD LETTER: "${line}" (suspicious but excluded - ${exclusionReason}) [code: ${exclusionReasonCode}]`,
          );
        }
      }

      continue;
    }

    // Pattern A: "71 Exploration cards (65 Allies & 6 Monsters):"
    const mA = normalizedLine.match(
      /^\s*(\d+)\s+([A-Za-z][A-Za-z\s-]*?(?:cards?|tokens?|tiles?|board|boards|pearls?|cups?|keys?|lords?|locations?|monsters?))\s*:?(\s*\(([^)]*)\))?/i,
    );
    if (mA) {
      if (verbose) {
        console.log(
          `   ✅ KEPT: "${line}" (reason: matched pattern with quantity) [code: matched_quantity]`,
        );
      }
      addItem(mA[2], mA[1], mA[4]);
      continue;
    }

    // Pattern B: "Place the ten Key tokens ..." or "Place the game board ..."
    const mB = normalizedLine.match(
      /place\s+the\s+(?:(\d+)\s+)?([A-Za-z][A-Za-z\s-]*?(?:tokens?|tiles?|board|boards|pearls?|cups?|keys?|lords?|locations?|monsters?))\b/i,
    );
    if (mB) {
      if (verbose) {
        console.log(
          `   ❌ DROPPED: "${line}" (reason: setup instruction pattern) [code: setup_instruction]`,
        );
      }
      continue;
    }

    // Pattern C: bare item with colon, e.g., "20 Locations:"
    const mC = normalizedLine.match(/^\s*(\d+)\s+([A-Za-z][A-Za-z\s-]*?)\s*:\s*$/i);
    if (mC) {
      // Check if it's a valid component type
      const canonicalName = normalizeToCanonical(mC[2]);
      if (canonicalName && ALLOWED_CANONICAL.has(canonicalName)) {
        if (verbose) {
          console.log(
            `   ✅ KEPT: "${line}" (reason: matched bare item with colon) [code: bare_item_colon]`,
          );
        }
        addItem(mC[2], mC[1], null);
        continue;
      } else {
        if (verbose) {
          console.log(
            `   ❌ DROPPED: "${line}" (reason: not in allowlist) [code: not_in_allowlist]`,
          );
        }
        continue;
      }
    }

    // Pattern D: Number word patterns like "thirty Lords"
    const mD = normalizedLine.match(
      /^\s*(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\s+([A-Za-z][A-Za-z\s-]*?(?:cards?|tokens?|tiles?|board|boards|pearls?|cups?|keys?|lords?|locations?|monsters?))\s*:?(\s*\(([^)]*)\))?/i,
    );
    if (mD) {
      if (verbose) {
        console.log(
          `   ✅ KEPT: "${line}" (reason: matched number word pattern) [code: number_word]`,
        );
      }
      addItem(mD[2], mD[1], mD[4]);
      continue;
    }

    // Pattern E: Items without quantity but with parentheses "Pearls (supply; quantity not specified...)"
    const mE = normalizedLine.match(
      /^([A-Za-z][A-Za-z\s-]*?(?:Pearls?|Cups?|Plastic\s+Cups?))\s*\(([^)]*)\)\s*$/,
    );
    if (mE) {
      if (verbose) {
        console.log(
          `   ✅ KEPT: "${line}" (reason: matched item with parentheses) [code: item_with_parentheses]`,
        );
      }
      addItem(mE[1], null, mE[2]);
      continue;
    }

    // Pattern F: Simple items with just a number and name "35 Lords"
    const mF = normalizedLine.match(/^\s*(\d+)\s+([A-Za-z][A-Za-z\s-]*?)\s*$/i);
    if (mF) {
      const canonicalName = normalizeToCanonical(mF[2]);
      if (canonicalName && ALLOWED_CANONICAL.has(canonicalName)) {
        if (verbose) {
          console.log(`   ✅ KEPT: "${line}" (reason: matched simple item) [code: simple_item]`);
        }
        addItem(mF[2], mF[1], null);
        continue;
      } else {
        if (verbose) {
          console.log(
            `   ❌ DROPPED: "${line}" (reason: not in allowlist) [code: not_in_allowlist]`,
          );
        }
        continue;
      }
    }

    // Pattern G: Simple items without quantity but with parentheses (case insensitive)
    const mG = normalizedLine.match(
      /^([A-Za-z][A-Za-z\s-]*?(?:pearls?|cups?|plastic\s+cups?))\s*\(([^)]*)\)\s*$/i,
    );
    if (mG) {
      if (verbose) {
        console.log(
          `   ✅ KEPT: "${line}" (reason: matched item with parentheses) [code: item_with_parentheses]`,
        );
      }
      addItem(mG[1], null, mG[2]);
      continue;
    }

    // Pattern H: Simple items without quantity but with parentheses
    const mH = normalizedLine.match(/^([A-Za-z][A-Za-z\s-]*?)\s*\(([^)]*)\)\s*$/);
    if (mH) {
      // Check if it's a valid component type
      const canonicalName = normalizeToCanonical(mH[1]);
      if (canonicalName && ALLOWED_CANONICAL.has(canonicalName)) {
        if (verbose) {
          console.log(
            `   ✅ KEPT: "${line}" (reason: matched item with parentheses) [code: item_with_parentheses]`,
          );
        }
        addItem(mH[1], null, mH[2]);
        continue;
      } else {
        if (verbose) {
          console.log(
            `   ❌ DROPPED: "${line}" (reason: not in allowlist) [code: not_in_allowlist]`,
          );
        }
        continue;
      }
    }

    // Breakdown reconstruction fallback: if a line has only breakdowns with no total
    // e.g., "65 Allies & 6 Monsters"
    const breakdownOnlyPattern = /^(\d+)\s+([A-Za-z]+)(?:\s*&\s*(\d+)\s+([A-Za-z]+))*\s*$/i;
    const breakdownMatch = normalizedLine.match(breakdownOnlyPattern);
    if (breakdownMatch) {
      // This is a breakdown line, but we need context to know what it belongs to
      // We'll capture it in dead letter for now
      deadLetterLines.push({ line, reason: 'breakdown-only', reasonCode: 'breakdown_only' });
      if (verbose) {
        console.log(
          `   📝 DEAD LETTER: "${line}" (reason: breakdown-only line) [code: breakdown_only]`,
        );
      }
    } else if (verbose) {
      console.log(`   ❌ DROPPED: "${line}" (reason: no pattern match) [code: no_pattern_match]`);
    }
  }

  // Convert to array and sort
  const order = [
    'Game board',
    'Exploration cards',
    'Lord cards',
    'Location tiles',
    'Monster tokens',
    'Key tokens',
    'Pearls',
    'Plastic cups',
    'Geisha cards',
    'Item cards',
    'Action markers',
    'Victory markers',
  ];
  let arr = Array.from(items.values());
  arr.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));

  // If lenient mode is enabled and we didn't find enough components, try a second pass
  if (lenient && arr.length < 3 && lines.length > 5) {
    if (verbose) {
      console.log('\n🔄 LENIENT MODE: Trying second pass with relaxed parsing...');
    }

    // Reset items for second pass
    items.clear();

    // Try additional patterns in lenient mode
    for (const line of lines) {
      const normalizedLine = normalizeOCR(line);

      // Lenient pattern: Simple colon-separated items (e.g., "Cards: 50")
      const mL = normalizedLine.match(/^\s*([A-Za-z][A-Za-z\s-]*?)\s*[:]\s*(\d+)\s*$/i);
      if (mL) {
        if (verbose) {
          console.log(
            `   ✅ LENIENT KEPT: "${line}" (reason: simple colon pattern) [code: lenient_colon]`,
          );
        }
        addItem(mL[1], mL[2], null);
        continue;
      }

      // Lenient pattern: Simple dash-separated items (e.g., "Tokens - 20")
      const mLD = normalizedLine.match(/^\s*([A-Za-z][A-Za-z\s-]*?)\s*-\s*(\d+)\s*$/i);
      if (mLD) {
        if (verbose) {
          console.log(
            `   ✅ LENIENT KEPT: "${line}" (reason: simple dash pattern) [code: lenient_dash]`,
          );
        }
        addItem(mLD[1], mLD[2], null);
        continue;
      }

      // Lenient pattern: Bullet points followed by item (e.g., "• 6 Dice")
      const mLB = normalizedLine.match(/^\s*[-•*]\s*(\d+)\s+([A-Za-z][A-Za-z\s-]*?)\s*$/i);
      if (mLB) {
        if (verbose) {
          console.log(
            `   ✅ LENIENT KEPT: "${line}" (reason: bullet point pattern) [code: lenient_bullet]`,
          );
        }
        addItem(mLB[2], mLB[1], null);
        continue;
      }
    }

    // Rebuild array with lenient mode results
    arr = Array.from(items.values());
    arr.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  }

  // Add confidence checking for breakdowns
  if (verbose) {
    for (const item of arr) {
      if (item.note) {
        const { breakdown, sum } = parseBreakdown(item.note);

        // Check Exploration cards breakdown
        if (item.name === 'Exploration cards' && typeof item.count === 'number') {
          if (sum > 0 && sum !== item.count) {
            console.log(
              `   ⚠️  BREAKDOWN MISMATCH: ${item.name} total ${item.count} != sum of subtypes ${sum}`,
            );
          }
        }

        // Check Monster tokens breakdown
        if (item.name === 'Monster tokens' && typeof item.count === 'number') {
          // For multipliers, we already calculated the sum in parseBreakdown
          if (sum > 0 && sum !== item.count) {
            console.log(
              `   ⚠️  BREAKDOWN MISMATCH: ${item.name} total ${item.count} != sum of multipliers ${sum}`,
            );
          }
        }

        // Store breakdown information
        if (breakdown.length > 0) {
          item.breakdown = breakdown;
        }
      }
    }
  }

  if (verbose) {
    console.log(`\n✅ FINAL COMPONENTS (${arr.length} items):`);
    arr.forEach((comp, i) => {
      console.log(
        `   ${i + 1}. ${comp.name}${comp.count !== null ? ` — ${comp.count}` : ''}${comp.note ? ` [${comp.note}]` : ''}`,
      );
      if (comp.breakdown) {
        console.log(`      Breakdown: ${JSON.stringify(comp.breakdown)}`);
      }
    });

    // Output dead letter lines if any
    if (deadLetterLines.length > 0) {
      console.log(`\n📝 DEAD LETTER CAPTURE (${deadLetterLines.length} lines):`);
      deadLetterLines.forEach((item, i) => {
        console.log(
          `   ${i + 1}. "${item.line}" (reason: ${item.reason}) [code: ${item.reasonCode}]`,
        );
      });
    }
  }

  return arr;
}
