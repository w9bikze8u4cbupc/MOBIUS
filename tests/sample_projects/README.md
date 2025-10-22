# Sample Projects Staging

These sample manifests seed the end-to-end validation harness once the audio QC hook is active. Each project captures the
source assets, the intended audio QC preset, and the artifact expectations for the Section C/D evidence bundle.

## Directory Layout

- `hanamikoji/manifest.json` – Broadcast mix baseline for Phase R2 validation.
- `sushi-go/manifest.json` – Streaming preset smoke profile with intentional loudness drift for corrective action testing.

The CI migration gate verifies that every manifest contains a populated `audioQc` block, at least one staged asset, and a
stable identifier that downstream jobs can reference.
