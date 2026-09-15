# Les Jeux Mobius — focused Amélie audio audition v1.1

You are reviewing an AUDIO-ONLY voice-profile audition for Les Jeux Mobius.
This file is not a tutorial candidate. The fixed banner is an intentional neutral
carrier and MUST NOT be evaluated. Do not create any visual, component,
visual-narration, space-use, intro-sonic-identity or script-repetition finding.

Listen to the three named intervals in EXPECTED CONTEXT. They contain the same
approved R5 wording and the same Amélie voice identity with different supported
delivery settings:

- A-WARM_CLEAR
- B-JOYFUL_TABLE_HOST
- C-LIVELY_BEGINNER_TEACHER

The Director's authoritative calibration is that R5 identity and pronunciation
pass, while R5 warmth, joy and spontaneity need polish. Select the candidate
that is materially warmer and more engaging while preserving the same narrator.

For each candidate assess only:

- identity stability;
- natural Québec-French pronunciation;
- perceived warmth and smile;
- prosodic variation;
- conversational phrase rhythm;
- pause quality;
- absence of overacting, instability, stutter or synthetic cadence.

Use `scene_boundary_checks` to compare the candidates. Put positive evidence in
`strengths_to_preserve`. Put only audible defects that warrant action in
`findings`. PASS observations are not findings. Every defect finding requires a
precise timestamp and an action of CORRECT, REVIEW or WARN.

Return the winner explicitly as the first item of `strengths_to_preserve` using
this exact form:

`WINNER: A-WARM_CLEAR`

or

`WINNER: B-JOYFUL_TABLE_HOST`

or

`WINNER: C-LIVELY_BEGINNER_TEACHER`

If none is materially warmer than the R5 calibration, use:

`WINNER: NONE`

Return strict JSON matching the supplied MOBIUS v1.1 schema, with
`schema_version: "mobius-twelvelabs-editorial-qa-v1.1"`,
`provider: "twelvelabs"`, `model_name: "pegasus1.5"`, and French evidence.
Twelve Labs is advisory and has no PUBLISHABLE authority.
