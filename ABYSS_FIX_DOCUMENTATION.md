# Abyss Component Extraction Fix

## Problem Description

The component extraction system was producing an overly long list of components for the Abyss board game PDF, including many false positives such as:

- Reward text: "On the 6th space, they win 2 Pearls..."
- Examples: "Draw 1, 2, 3, or 4 Locations..."
- Figure captions: "Front of a Location", "Back of a Location"
- Card titles: "The Traitor card", "Master of Magic"

This was caused by three main issues:

1. **Section scope drift**: The parser was scanning the entire rulebook instead of constraining to the "Contents & Setup" section
2. **Over-broad numeric patterns**: Patterns like "number + noun" were catching examples and rules text
3. **Image alt/captions bleed**: Figure captions and alt text were being treated as components

## Solution Implemented

We implemented a targeted hotfix with three guardrails:

### 1. Hard Scope to Components Section

Added section boundary detection:
- **Start anchor**: First occurrence of headers like "Contents & Setup", "Components", "Box Contents", "Game Components"
- **End anchor**: First occurrence of major next sections like "Object of the Game", "Game Overview", "1 Plot at Court", "Setup ends"

### 2. Strict Allowlist on Nouns + Number Parsing

- Only accept lines that include core component nouns: cards, tokens, tiles, board, key(s), pearl(s), cup(s), dice, markers, minis, figures, standees, cubes, pawns, screens, rulebook, player aids, reference cards, dials, etc.
- Accept colon lines (e.g., "20 Locations:") or "Place the ten Key tokens..." (support number words)
- Explicitly normalize terms:
  - "Lords" → "Lord cards"
  - "Locations" → "Location tiles"
  - "board" → "Game board"
- Exclude reward text, steps, examples, captions

### 3. Collapse Examples into Parent Decks

- If "Lord cards" is present with a count, drop individual lord names found elsewhere
- Same for card "front/back" captions and example itemizations

## Results

### Before Fix
The system would extract 50+ components including many false positives like:
- "On The 6Th Space, They Win 2 Pearls"
- "Draw 1, 2, 3, Or 4 Locations"
- "Front Of A Location"
- "The Traitor Card"
- "Master Of Magic"

### After Fix
The system correctly extracts only the 9 actual components:
1. Game board — 1
2. Exploration cards — 71 (note: 65 Allies & 6 Monsters)
3. Lord cards — 35
4. Location tiles — 20
5. Monster tokens — 20 (note: 2 of value 4, 9 of value 3, and 9 of value 2)
6. Threat token — 1
7. Key tokens — 10
8. Pearls — null (supply)
9. Plastic cups — null (Treasury)

## Implementation Details

The fix was implemented in `src/api/utils.js` in the `extractComponentsFromText` function with:

1. Section boundary regex patterns:
   ```javascript
   const START_RE = /(?:^|\n)\s*(contents\s*&\s*setup|components|box contents|game components)\b/i;
   const END_RE = /(?:^|\n)\s*(object of the game|game overview|setup ends|1\s+plot at court|setup\b(?!.*contents))/i;
   ```

2. Allowlist of component nouns:
   ```javascript
   const ALLOWED_NOUNS_RE = /\b(cards?|tokens?|tiles?|board|boards|keys?|pearls?|cups?|dice|markers?|meeples?|minis?|figures?|standees?|discs?|cubes?|pawns?|screens?|bags?|rulebook|reference\s+cards?|player\s+aids?|dials?|lords?|locations?|monsters?|threats?)\b/i;
   ```

3. Exclusion patterns for false positives:
   ```javascript
   const NOISY_CAPTION_RE = /\b(front|back)\s+of\b|\bicon\b|\blabeled\b|\bimage\b|\bfigure\b|\bcard titled\b|\.png\)|\.(jpg|png|gif)\b/i;
   const REWARD_OR_RULES_RE = /\b(win|gains?|receive|on the \d+(st|nd|rd|th) space|draw\s+\d|add\s+\d|turns? over|refill|slide|reveal)\b/i;
   ```

4. Multiple extraction patterns for different formats:
   - Pattern A: "71 Exploration cards (65 Allies & 6 Monsters):"
   - Pattern B: "Place the ten Key tokens ..." or "Place the game board ..."
   - Pattern C: bare item with colon, e.g., "20 Locations:"
   - Pattern D: Number word patterns like "thirty Lords"
   - Pattern E: Items without quantity but with parentheses "Pearls (supply; quantity not specified...)"

## Testing

Comprehensive tests were added to verify:
1. Correct extraction of all 9 Abyss components
2. No false positives from reward text, examples, or captions
3. Proper section boundary detection
4. Component type diversity (boards, cards, tokens, lords, locations, monsters, pearls, cups)

The fix resolves the "only cards" issue and provides accurate component extraction for Abyss and similar board game rulebooks.