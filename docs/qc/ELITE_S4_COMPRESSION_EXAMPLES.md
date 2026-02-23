# Elite S4 Combinatorial Compression: Examples

**Version**: 1.0  
**Date**: 2026-02-23  
**Purpose**: Concrete examples of S4 compression pattern application

## Overview

This document provides real-world examples of when and how to apply S4 combinatorial compression to prevent script bloat while maintaining pedagogical clarity.

---

## Example 1: Combat System (Branch Count ≥ 5)

### Scenario
A game has combat with multiple modifiers: terrain, weather, unit type, status effects, and special abilities.

### Without Compression (Anti-Pattern)
```
Combat resolution works as follows:

If the attacker is on plains, add +0 to strength.
If the attacker is on forest, add +1 to strength.
If the attacker is on mountain, add +2 to strength.
If the attacker is on water, add -1 to strength.

If it's sunny, add +1 to ranged attacks.
If it's raining, add -1 to ranged attacks and +1 to water units.
If it's foggy, ranged attacks cannot target beyond 1 space.

If the attacker is cavalry, add +1 when charging.
If the attacker is infantry, add +1 when defending.
If the attacker is archer, add +2 at range but -1 in melee.

If the defender is fortified, add +2 armor.
If the defender is exhausted, subtract -1 from all stats.
If the defender has shield wall, negate first attack...

[continues for 8+ minutes]
```

**Problems**:
- 20+ conditional branches
- Projected runtime: 10+ minutes
- Viewer retention: catastrophic
- Impossible to remember

### With S4 Compression (Correct Pattern)

**Principle**:
> "In general, combat damage equals attacker strength minus defender armor. Terrain, weather, unit type, and status effects modify these base values."

**Examples**:
> "Example 1: A 5-strength cavalry charges a 2-armor infantry on plains in sunny weather. Base damage = 5 - 2 = 3. No modifiers apply.
>
> Example 2: A 3-strength archer attacks a fortified 2-armor infantry from a forest in rain. Archer gets +1 (forest) but -1 (rain on ranged) = 3 strength. Defender gets +2 (fortified) = 4 armor. Damage = 3 - 4 = 0 (no damage)."

**Referral**:
> "For the complete terrain, weather, and unit ability matrix, see rulebook §8: Combat Modifiers."

**Result**:
- Runtime: 45 seconds
- Viewer understands principle
- Rulebook remains authority for edge cases

---

## Example 2: Card Timing (Exception Layers ≥ 3)

### Scenario
A card game has complex timing rules with multiple override layers.

### Without Compression (Anti-Pattern)
```
Cards resolve in the order they were played, left to right.

However, "Instant" cards resolve before regular cards.

But "Priority" cards resolve before Instant cards.

Except "Counter" cards can interrupt Priority cards if played in response.

Unless the Priority card has "Uncounterable" keyword.

But "Nullify" effects can still cancel Uncounterable cards.

However, "Absolute" cards cannot be Nullified.

Except by other Absolute cards.

But if two Absolute cards conflict, the one played first wins.

Unless one has higher cost, then higher cost wins.

But tied costs go to active player...

[continues for 6+ minutes]
```

**Problems**:
- 5+ exception layers
- Circular logic
- Projected runtime: 8+ minutes
- Viewer confusion: guaranteed

### With S4 Compression (Correct Pattern)

**Principle**:
> "In general, cards resolve in play order from left to right. Special timing keywords (Instant, Priority, Counter) create a resolution stack, with later keywords overriding earlier ones."

**Examples**:
> "Example 1: You play Attack (regular), then Shield (Instant). Shield resolves first, then Attack.
>
> Example 2: Opponent plays Fireball (Priority), you respond with Counter (Counter keyword). Counter resolves first and cancels Fireball."

**Referral**:
> "For the complete timing hierarchy, keyword interactions, and tie-breaker rules, see rulebook §5.2: Card Resolution Stack."

**Result**:
- Runtime: 40 seconds
- Viewer understands stack concept
- Complex interactions deferred to rulebook

---

## Example 3: Network Effects (Interaction Variables ≥ 4)

### Scenario
A game where tile placement depends on: tile type, adjacent tiles, player color, round number, and special tokens.

### Without Compression (Anti-Pattern)
```
When placing a tile:

Check tile type (6 types).
Check each adjacent tile (up to 6 neighbors).
Check if colors match (4 player colors).
Check round number (affects scoring multipliers).
Check if special tokens are present (8 token types).
Check if any player has the "Master Builder" card.
Check if it's a corner placement (different rules).
Check if the tile completes a region (triggers scoring).
Check if the region has a monastery (bonus points).
Check if it's the last tile of the round (end-of-round effects)...

[continues for 12+ minutes covering all permutations]
```

**Problems**:
- 6+ independent variables
- Combinatorial explosion: 6 × 6 × 4 × 3 × 8 × 2 × 2 × 2 × 2 × 2 = 221,184 possible states
- Projected runtime: 15+ minutes
- Impossible to teach linearly

### With S4 Compression (Correct Pattern)

**Principle**:
> "In general, tile placement is valid if it matches at least one adjacent tile's terrain type. Scoring depends on completed regions, with bonuses from special tokens and round multipliers."

**Examples**:
> "Example 1: You place a forest tile adjacent to another forest tile. Valid placement. If this completes a forest region, score 1 point per tile in the region.
>
> Example 2: You place a city tile with a monastery token adjacent to two city tiles. Valid placement. Completed city scores 2 points per tile, plus 3 bonus points for the monastery."

**Referral**:
> "For the complete tile adjacency rules, token effects, and round-specific scoring modifiers, see rulebook §6: Tile Placement and §9: Scoring Matrix."

**Result**:
- Runtime: 50 seconds
- Viewer understands core placement + scoring
- Complex interactions deferred to rulebook

---

## Example 4: Resource Conversion (Projected Runtime > 240s)

### Scenario
A game with 8 resource types, each convertible to others at different rates, with building bonuses.

### Without Compression (Anti-Pattern)
```
Resource conversion rates:

Wood converts to Stone at 2:1.
Wood converts to Gold at 4:1.
Wood converts to Food at 1:1.
Stone converts to Gold at 3:1.
Stone converts to Iron at 2:1.
Gold converts to any resource at 1:2.
Food converts to Population at 3:1.
Iron converts to Weapons at 1:1.

But if you have a Sawmill, Wood to Stone becomes 1:1.
If you have a Mine, Stone to Iron becomes 1:1.
If you have a Market, all Gold conversions improve by 1.
If you have a Farm, Food to Population becomes 2:1.

And if you have multiple buildings, they stack...
And if it's a specific round, rates change...
And if you have certain cards...

[continues for 10+ minutes]
```

**Problems**:
- 8 resources × 7 conversions × 12 buildings = 672 combinations
- Projected runtime: 12+ minutes
- Viewer overload: certain

### With S4 Compression (Correct Pattern)

**Principle**:
> "In general, resources convert at a 2:1 or 3:1 rate to more valuable resources. Buildings improve conversion rates for specific resource pairs."

**Examples**:
> "Example 1: Without buildings, 4 Wood converts to 1 Gold (4:1 rate).
>
> Example 2: With a Sawmill, 2 Wood converts to 2 Stone (1:1 rate instead of 2:1)."

**Referral**:
> "For the complete resource conversion table and all building effects, see rulebook §10: Economy and the Resource Conversion Chart on page 24."

**Result**:
- Runtime: 35 seconds
- Viewer understands conversion concept
- Specific rates available in rulebook reference

---

## Detection Heuristics for Script Planners

### Red Flags (Trigger S4 Compression)

1. **"If/Then" Density**  
   More than 5 conditional statements in a single subsystem explanation

2. **"Except/Unless" Chains**  
   More than 2 exception layers deep

3. **Combinatorial Language**  
   Phrases like "depending on", "varies by", "each combination", "all possible"

4. **Table References**  
   If you're tempted to show a 4×4+ matrix on screen

5. **Enumeration Fatigue**  
   If you find yourself saying "and also" more than 3 times in a row

6. **Runtime Projection**  
   If reading the script aloud for one subsystem takes > 3 minutes

### Green Flags (Compression Not Needed)

1. **Linear Flow**  
   "Do A, then B, then C" with no conditionals

2. **Binary Choices**  
   "Either X or Y" with clear outcomes

3. **Universal Rules**  
   "Always" or "Never" statements with no exceptions

4. **Simple Examples**  
   One example fully demonstrates the mechanic

---

## Compression Quality Checklist

After applying S4 compression, verify:

- [ ] Principle statement is one sentence, general terms
- [ ] Examples are concrete and representative (not edge cases)
- [ ] Maximum 2 examples shown
- [ ] Rulebook section reference is specific (not "see rulebook")
- [ ] Runtime reduced to < 60 seconds for the subsystem
- [ ] Viewer can understand the core concept
- [ ] Viewer knows where to find exhaustive details
- [ ] No apology or disclaimer ("this is complicated but...")

---

## Anti-Patterns to Avoid

### 1. Fake Compression
**Bad**: "There are many special cases. See the rulebook."  
**Why**: No principle or examples provided; viewer learns nothing

**Good**: "In general, X happens. Example: Y. For all cases, see rulebook §Z."

### 2. Example Overload
**Bad**: "Example 1... Example 2... Example 3... Example 4... Example 5..."  
**Why**: Defeats the purpose of compression

**Good**: Maximum 2 examples, chosen to illustrate principle

### 3. Vague Referral
**Bad**: "For more details, check the rulebook."  
**Why**: No specific section; viewer won't find it

**Good**: "For the complete matrix, see rulebook §7.3: Combat Modifiers."

### 4. Apologetic Tone
**Bad**: "This is really complicated, so I can't cover everything..."  
**Why**: Undermines confidence; sounds like failure

**Good**: "In general, X happens when Y. For exhaustive cases, see rulebook §Z."

---

## Related Documentation

- [Canonical Script Skeleton](../script-structure/CANONICAL_SCRIPT_SKELETON.md) - Section structure
- [Elite Video Standard V1](../standards/ELITE_VIDEO_STANDARD_V1.md) - Quality thresholds
- [Elite S4 Script Planner Hooks](./ELITE_S4_SCRIPT_PLANNER_HOOKS.md) - Automated detection

---

**Document Version**: 1.0  
**Last Updated**: 2026-02-23  
**Authority**: Canonical (all scripts should follow these patterns)
