# Canonical Script Skeleton for MOBIUS Tutorial Videos

**Version**: 1.0  
**Date**: 2026-02-23  
**Status**: Authoritative

## Overview

This document defines the canonical section structure for all MOBIUS board game tutorial scripts. Sections map 1:1 to video chapters unless the game is very small.

## Section Order (Canonical)

### 1. Cold Open / Hook (0–10s)
What the viewer will be able to do after watching (one sentence).

**Purpose**: Immediate value proposition  
**Duration**: 0–10 seconds  
**Format**: Single declarative sentence

**Example**:
> "After this video, you'll know how to play Sushi Go and score your first game."

---

### 2. Game Identity
Game name + player count + typical duration (one line each).

**Purpose**: Basic metadata for decision-making  
**Format**: Three lines, no elaboration

**Example**:
```
Game: Sushi Go
Players: 2–5
Duration: 15 minutes
```

---

### 3. Objective
Win condition in plain language (no scoring math yet).

**Purpose**: Goal clarity before mechanics  
**Format**: One sentence, outcome-focused

**Example**:
> "Score the most points by collecting sets of sushi cards."

---

### 4. What You Need (Components)
Only components that matter for playing, not exhaustive inventory.

**Purpose**: Functional component awareness  
**Format**: Bullet list, player-facing names only

**Example**:
- Sushi cards (108 total)
- Scoring tokens
- Rulebook reference card

**Exclusions**: Box, insert, promotional items, unused variants

---

### 5. Setup
Step-by-step, deterministic ordering.

**Purpose**: Reproducible starting state  
**Format**: Numbered steps, imperative voice

**Example**:
1. Shuffle all sushi cards
2. Deal 7 cards to each player
3. Place remaining cards face-down as draw pile
4. Youngest player goes first

---

### 6. Round / Turn Structure (Macro Loop)
The repeating cycle: round phases + when the game ends.

**Purpose**: High-level game flow  
**Format**: Phase list + termination condition

**Example**:
```
Each round:
1. Play Phase (all players simultaneously)
2. Scoring Phase
3. Pass remaining cards left

Game ends after 3 rounds.
```

---

### 7. Core Actions (Primary Decision Loop)
The "what do I do on my turn" list.

**Purpose**: Player agency clarity  
**Format**: Numbered action options

**Example**:
```
On your turn:
1. Choose one card from your hand
2. Place it face-down in front of you
3. Pass remaining cards to the left
4. Reveal all cards simultaneously
```

---

### 8. Core Mechanic Resolution
How to resolve the main system (placing, drafting, rolling, combat, etc.).

**Purpose**: Mechanical execution  
**Format**: Step-by-step resolution

**Example**:
> "After all players reveal, resolve special abilities in turn order, then score completed sets."

---

### 9. Secondary Mechanics (Only if they meaningfully change choices)
Resource conversion, bonuses, timing windows, etc.

**Purpose**: Decision-relevant subsystems  
**Inclusion Criteria**: Affects player choices during core loop

**Example**:
- Wasabi multiplies next nigiri value by 3
- Chopsticks allow taking 2 cards instead of 1

**Exclusions**: Flavor text, tie-breakers (covered in Scoring), edge cases (covered separately)

---

### 10. Scoring / Endgame
How points/conditions are counted and any tie-breakers.

**Purpose**: Victory determination  
**Format**: Scoring rules + tie-breaker sequence

**Example**:
```
Scoring:
- Maki rolls: Most = 6 points, second = 3 points
- Tempura: 2 cards = 5 points
- Sashimi: 3 cards = 10 points
- Nigiri: Face value (1–3 points)
- Wasabi: Multiplies next nigiri by 3
- Pudding: Most at game end = 6 points, least = -6 points

Tie-breaker: Most pudding cards wins
```

---

### 11. Edge Cases / Common Mistakes
The top 3–5 "people get this wrong" items.

**Purpose**: Preemptive error correction  
**Format**: Numbered list, corrective statements

**Example**:
1. Wasabi only affects the NEXT nigiri played, not all nigiri
2. Chopsticks must be played BEFORE revealing cards
3. Pudding only scores at game end, not each round
4. You cannot play the same card type twice in one turn (unless using Chopsticks)

---

### 12. One Representative Example Turn
A single narrated mini-walkthrough that touches the core loop.

**Purpose**: Concrete demonstration  
**Format**: Narrative walkthrough, 30–60 seconds

**Example**:
> "Alice has 7 cards. She chooses Tempura and places it face-down. Bob chooses Sashimi. Carol chooses Wasabi. All players reveal simultaneously. Alice now has 1 Tempura (needs 2 for points). She passes her remaining 6 cards to Bob. Bob passes his 6 cards to Carol. Carol passes hers to Alice. The round continues."

---

### 13. Recap
Objective + turn loop + scoring (three short bullets).

**Purpose**: Retention reinforcement  
**Format**: Three bullets, no new information

**Example**:
- Objective: Score the most points with sushi sets
- Turn loop: Pick 1 card, reveal, pass remaining cards
- Scoring: Complete sets for points; most pudding wins ties

---

### 14. Rulebook Referral Line (Always Present)
"For exhaustive exceptions and card-by-card details, refer to the rulebook section X."

**Purpose**: Scope boundary + authority handoff  
**Format**: Single sentence, always included

**Example**:
> "For exhaustive card interactions and tournament rules, refer to the rulebook sections 4–6."

---

## S4: Combinatorial Compression Pattern

### When to Trigger Compression

For any subsystem/topic block (combat, card timing, network effects, exceptions), compression is **required** if ANY threshold is met:

#### Deterministic Thresholds (ANY = TRUE → Compress)

1. **Branch count ≥ 5**  
   Five or more distinct conditional branches  
   Example: "If A then X, else if B then Y, unless C then Z, but if D and E then W, except when F..."

2. **Exception layers ≥ 3**  
   Rule → exception → exception to exception  
   Example: "Cards activate left-to-right, except timing cards which activate first, unless a priority card is played, which overrides timing cards but not instant cards..."

3. **Interaction variables ≥ 4**  
   Outcome depends on 4+ independent inputs  
   Example: Card type + terrain + timing + status + player state + weather + faction...

4. **Projected runtime > 240 seconds (4 minutes)**  
   If fully explained linearly, the block would exceed 4 minutes

### Compression Pattern (Canonical Wording)

When triggered, use this three-part structure:

#### 1. Principle Statement
State the core rule in general terms.

**Format**: "In general, X happens when Y; modifiers change Z."

**Example**:
> "In general, combat damage is attacker strength minus defender armor; terrain and status effects modify both values."

#### 2. Representative Examples (Max 2)
Show 1–2 concrete cases that illustrate the principle.

**Format**: "Example 1: ... Example 2: ..."

**Example**:
> "Example 1: A 5-strength knight attacks a 2-armor guard on plains. Damage = 5 - 2 = 3. Example 2: The same knight attacks from a forest (+1 strength) against a fortified guard (+2 armor). Damage = (5+1) - (2+2) = 2."

#### 3. Rulebook Referral
Explicit handoff to authoritative source.

**Format**: "For the full matrix of [exceptions/timing windows/interactions], see the rulebook: §[section]."

**Example**:
> "For the full matrix of terrain types, status effects, and special abilities, see the rulebook: §7.3 Combat Resolution."

### Benefits of Compression

- **Pacing compliance**: Prevents 10+ minute subsystem explanations
- **Retention**: Viewers remember principles, not permutations
- **Authority**: Rulebook remains source of truth for edge cases
- **Scalability**: Works for games of any complexity

### Anti-Pattern: Exhaustive Enumeration

**DO NOT**:
- List all 47 card interactions
- Explain every terrain + status combination
- Cover every exception and counter-exception
- Attempt to replace the rulebook on-screen

**INSTEAD**:
- State the principle
- Show 1–2 examples
- Refer to rulebook section

---

## Section Length Guidelines

### Target Durations (Approximate)

- Cold Open: 10 seconds
- Game Identity: 10 seconds
- Objective: 10 seconds
- Components: 20–30 seconds
- Setup: 30–60 seconds
- Round Structure: 30–45 seconds
- Core Actions: 45–90 seconds
- Core Mechanic Resolution: 60–120 seconds
- Secondary Mechanics: 30–90 seconds (or compress)
- Scoring: 60–120 seconds
- Edge Cases: 30–60 seconds
- Example Turn: 30–60 seconds
- Recap: 20 seconds
- Rulebook Referral: 5 seconds

### Total Video Length Targets

- Light games: 4–6 minutes
- Medium games: 6–10 minutes
- Heavy games: 10–15 minutes (with compression)

**If any section exceeds 4 minutes**: Apply S4 compression immediately.

---

## Validation Checklist

Before finalizing any script, verify:

- [ ] All 14 sections present in canonical order
- [ ] Cold Open states viewer outcome (not game description)
- [ ] Objective is win condition, not gameplay description
- [ ] Components list excludes non-functional items
- [ ] Setup steps are deterministic and numbered
- [ ] Round structure includes termination condition
- [ ] Core actions answer "what do I do on my turn"
- [ ] Secondary mechanics only included if decision-relevant
- [ ] Scoring includes tie-breaker
- [ ] Edge cases limited to top 3–5 common mistakes
- [ ] Example turn touches core loop
- [ ] Recap has exactly 3 bullets
- [ ] Rulebook referral line present
- [ ] S4 compression applied to any subsystem meeting thresholds
- [ ] No section exceeds 4 minutes runtime

---

## Related Documentation

- [Elite Video Standard V1](../standards/ELITE_VIDEO_STANDARD_V1.md) - Quality thresholds
- [Script Authority](../script-authority.md) - Version control and gates
- [Elite S4 Script Planner Hooks](../qc/ELITE_S4_SCRIPT_PLANNER_HOOKS.md) - Compression detection

---

**Document Version**: 1.0  
**Last Updated**: 2026-02-23  
**Authority**: Canonical (all scripts must conform)
