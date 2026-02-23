# Elite S4 Script Planner Enforcement Hooks

**Version**: 1.0  
**Date**: 2026-02-23  
**Rule**: S4 Combinatorial Compression

## Overview

This document defines the metadata schema that script planners must emit to enable S4 (Combinatorial Compression) verification. Until full semantic analyzers are built, script authors/planners populate these fields manually or programmatically.

## Metadata Schema

### Subsystem Complexity Metadata

Script planners should emit complexity metadata for each subsystem in the tutorial:

```json
{
  "subsystems": [
    {
      "id": "combat_resolution",
      "name": "Combat Resolution",
      "complexity": {
        "branch_count": 5,
        "exception_layers": 2,
        "interaction_variables": 4,
        "projected_runtime_seconds": 180
      },
      "rulebook_section_ref": "page 12, Combat Resolution",
      "has_referral_block": true
    }
  ]
}
```

### Field Definitions

**branch_count** (integer)
- Number of distinct decision paths in the subsystem
- Example: 5 weapon types = 5 branches
- Trigger threshold: ≥ 5

**exception_layers** (integer)
- Depth of nested conditional logic
- Example: "If A, then B, unless C, except when D" = 3 layers
- Trigger threshold: ≥ 3

**interaction_variables** (integer)
- Number of independent factors affecting outcome
- Example: weapon type, armor type, terrain, initiative = 4 variables
- Trigger threshold: ≥ 4

**projected_runtime_seconds** (integer)
- Estimated time to explain subsystem exhaustively
- Includes all permutations and edge cases
- Trigger threshold: ≥ 240 (4 minutes)

**rulebook_section_ref** (string, optional)
- Reference to rulebook section covering this subsystem
- Example: "page 12, Combat Resolution"
- Required when S4 triggers

**has_referral_block** (boolean)
- Whether script includes proper referral block for this subsystem
- Must be true when S4 triggers

## S4 Trigger Logic

S4 triggers if **ANY** threshold is exceeded:

```javascript
function s4Triggers(complexity) {
  return (
    complexity.branch_count >= 5 ||
    complexity.exception_layers >= 3 ||
    complexity.interaction_variables >= 4 ||
    complexity.projected_runtime_seconds >= 240
  );
}
```

## Required Referral Block Structure

When S4 triggers, the script must include a referral block with:

1. **Rulebook section reference** (string)
   - Clear page/section identifier
   - Example: "See rulebook page 12, Combat Resolution"

2. **Core principle summary** (string, 1-2 sentences)
   - Explains the abstraction/pattern
   - Example: "The core principle is: higher weapon value minus armor value, modified by terrain"

3. **Representative examples** (1-2 concrete cases)
   - NOT exhaustive enumeration
   - Shows pattern application
   - Example: "A sword (value 5) vs leather armor (value 2) in forest (+1) = 4 damage"

## Approved Wording Template

```
For [subsystem], the rulebook covers [X] edge cases on page [Y]. 
The core principle is: [principle]. 
Here's a representative example: [example].
```

## Anti-Patterns (DO NOT)

❌ "Combat is complicated, check the rulebook"
- Missing core principle
- Missing examples
- No specific reference

❌ "There are 60 possible combinations: sword vs leather, sword vs chain, sword vs plate..."
- Exhaustive enumeration violates S2 pacing
- Triggers S4 but doesn't satisfy requirement

❌ "See page 12 for combat rules"
- Missing core principle
- Missing representative examples

## Verification Process

### Phase 1: Metadata-Based (Current)

Elite verifier checks:
1. Load subsystem complexity metadata from script manifest
2. For each subsystem, check if S4 triggers
3. If triggered, verify `has_referral_block === true`
4. If missing, mark S4 as failed (SOFT_WARN, escalates to HARD_FAIL in Elite mode)

### Phase 2: Semantic Analysis (Future)

Full semantic analyzer will:
1. Parse script text to extract subsystems
2. Compute complexity metrics automatically
3. Validate referral block structure and content
4. Verify examples are representative, not exhaustive

## Script Planner Integration

### Manual Workflow

1. Script author identifies complex subsystems
2. Estimates complexity metrics
3. Adds metadata to script manifest
4. Writes referral block in script
5. Sets `has_referral_block: true`

### Automated Workflow (Future)

1. Planner analyzes rulebook structure
2. Identifies high-complexity subsystems
3. Generates complexity metadata
4. Suggests referral block wording
5. Validates against S4 requirements

## Example: Combat System

### Complexity Analysis

```json
{
  "id": "combat",
  "name": "Combat Resolution",
  "complexity": {
    "branch_count": 5,           // 5 weapon types
    "exception_layers": 2,        // armor modifies, terrain modifies
    "interaction_variables": 4,   // weapon, armor, terrain, initiative
    "projected_runtime_seconds": 360  // 6 minutes if exhaustive
  },
  "rulebook_section_ref": "page 12, Combat Resolution Table",
  "has_referral_block": true
}
```

### Script Referral Block

```
For combat resolution, the rulebook covers all 60 weapon-armor-terrain 
combinations on page 12. The core principle is: your weapon value minus 
their armor value, modified by terrain. Here's an example: a sword (5) 
vs leather armor (2) in forest terrain (+1) deals 4 damage.
```

### Verification

- S4 triggers: `branch_count (5) >= 5` ✓
- Referral block present: `has_referral_block === true` ✓
- Structure valid: has reference, principle, example ✓
- S4 passes ✓

## Missing Metadata Handling

If subsystem complexity metadata is missing:
- Elite verifier treats as "not evaluated"
- Does NOT fail S4 (avoids false positives)
- Logs warning: "S4 not evaluated: missing complexity metadata"
- Future phase will require metadata for Elite certification

## Related Documentation

- [Elite Video Standard v1.1](../standards/ELITE_VIDEO_STANDARD_V1.md)
- [Elite Contract v1.1](../../config/elite/MOBIUS_ELITE_VIDEO_STANDARD_v1.json)
- [Elite Release Enforcement](./ELITE_RELEASE_ENFORCEMENT.md)

---

**Document Version**: 1.0  
**Last Updated**: 2026-02-23  
**Contract Version**: MOBIUS_ELITE_VIDEO_STANDARD_v1 v1.1.0
