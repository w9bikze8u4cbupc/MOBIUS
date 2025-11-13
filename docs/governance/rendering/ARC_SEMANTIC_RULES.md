# Authoritative Rendering Contract (ARC) Semantic Rules

This document defines the meaning and enforcement expectations for each field within
`docs/spec/authoritative_rendering_contract.json`. Updates to the ARC must preserve these
semantics so that CI, automation, and manual reviews understand the rendering governance
boundaries.

## Versioning

* `version` communicates backward-incompatible updates to governance expectations.
* Bump the version when any field below changes meaning or required values.

## Video Expectations

* `video.width` / `video.height` describe the pixel dimensions all rendering outputs must
  adhere to. Changing either dimension requires coordinating new golden captures.
* `video.fps` defines the canonical frame rate. If you must accept additional ffprobe
  readings (for example, `30000/1001`), extend `video.acceptableAvgFrameRates` instead of
  relaxing validations in code.
* `video.pixFmt` specifies the required pixel format (e.g., `yuv420p`).
* `video.sar` declares the sample aspect ratio that must be reported by ffprobe.
* `video.acceptableAvgFrameRates` is an explicit allow-list for metadata reported frame
  rates. Keep this list tight so unexpected encoder shifts trigger alerts.

## Audio Expectations

* `audio.sampleRate` is the required sampling rate in Hertz.
* `audio.channels` declares the channel count (e.g., 2 for stereo) that encoded outputs
  must contain.
* `audio.targetLufs` is the integrated loudness (LUFS) target used during mastering.
* `audio.truePeakCeiling` is the dBTP ceiling that mix engineers may not exceed.

## Extraction Rules

* `extraction.method` documents the technique used to derive analysis frames. Today this
  is `ffmpeg` and should only change with corresponding CI upgrades.
* `extraction.frameCountTolerancePct` limits how many frames can be missing or extra when
  sampling from preview renders. Choose a value that balances sensitivity with encoder
  jitter tolerance.
* Optional `extraction.fpsOverride` can request a different ffmpeg extraction rate while
  preserving validation against `video.fps`.

## Validation Thresholds

* `validation.ssim.min` represents the minimum acceptable SSIM when comparing new renders
  against golden baselines. Raising this value should be accompanied by documented
  justifications in PRs and, if necessary, updated goldens.

## Change Management Checklist

Before merging any ARC update:

1. Announce the proposed change in the rendering governance channel.
2. Update all downstream tooling that consumes the modified fields.
3. Provide empirical evidence (metrics, screenshots, SSIM reports) justifying the new
   expectations.
4. Confirm the rendering consistency script logs the updated ARC summary in CI.
