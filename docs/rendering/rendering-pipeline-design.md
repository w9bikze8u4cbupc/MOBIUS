# Video Rendering Pipeline Design

## Overview
This document outlines the design for the video rendering pipeline in the Mobius Tutorial Generator. The pipeline will orchestrate FFmpeg to create video outputs from game tutorial assets.

## Goals
- Produce MP4 video outputs with correct duration
- Generate thumbnails for preview purposes
- Create captions (SRT/VTT) and support burn-in and sidecar exports
- Support preview renders (5s, 30s) and full renders
- Run in CI as a smoke/validation step
- Be testable with mocked FFmpeg processes
- Support audio ducking for better audio mixing
- Provide robust progress tracking and checkpointing
- Enable containerized deployment for production use

## High-Level Architecture

### Orchestration Layer (Node.js)
Responsible for:
- Assembling render job metadata (sequence of stills, timings, audio files, subtitles, transition directives, overlay data)
- Validating inputs (paths, durations)
- Building FFmpeg commands
- Spawning FFmpeg with stdout/stderr progress parsing
- Resolving with artifact paths and metadata or rejecting with actionable error

### Renderer Implementation
- Single FFmpeg invocation using concat demuxer or complex filtergraph
- Subtitle generation via existing caption generator
- Audio ducking using volume filter automation
- Thumbnail generation using FFmpeg frame extraction
- Progress tracking and checkpointing for resumability
- Containerized deployment support

## API Design

### Core Function
```javascript
async render(job, options)
```

### Parameters
- `job`: Object containing render job metadata
- `options`: Configuration object with properties:
  - `previewSeconds`: Number of seconds for preview render (5 or 30)
  - `dryRun`: Boolean to simulate without actual rendering
  - `burnCaptions`: Boolean to burn-in captions
  - `exportSrt`: Boolean to export SRT sidecar file
  - `ducking`: Object with audio ducking configuration
    - `mode`: Ducking mode ('sidechain' or 'envelope')
    - `threshold`: Sidechain threshold
    - `ratio`: Sidechain ratio
    - `attackMs`: Sidechain attack time in ms
    - `releaseMs`: Sidechain release time in ms
    - `duckGain`: Envelope duck gain (0.0-1.0)
    - `fadeMs`: Envelope fade time in ms
  - `outputDir`: String path for output directory
  - `timeoutMs`: Number of milliseconds before timeout
  - `jobId`: Unique identifier for checkpointing

### Return Value
Promise that resolves to an object containing:
- `outputPath`: Path to the generated MP4 file
- `thumbnailPath`: Path to the generated thumbnail
- `captionPath`: Path to the generated SRT file
- `metadata`: Object with duration, fps, and other metadata

## Subtitles Support

The rendering pipeline supports both burned-in and sidecar subtitles:

1. **Burned-in Subtitles**: Subtitles are rendered directly onto the video using FFmpeg's `subtitles` filter
2. **Sidecar SRT**: Subtitles are exported as a separate .srt file that can be used with video players

### Subtitle Generation
- Generate SRT from in-memory caption items
- Support for pre-built SRT files
- Proper time formatting for SRT files

## Audio Ducking

Two approaches to audio ducking are supported:

1. **Sidechain Compression**: Uses FFmpeg's `sidechaincompress` filter to automatically reduce background music volume when narration is present
2. **Envelope Ducking**: Manually reduce background music volume during specific time windows using a volume expression

### Sidechain Compression
- Requires both narration and background music tracks
- Automatically adjusts music volume based on narration presence
- Configurable threshold, ratio, attack, and release parameters

### Envelope Ducking
- Reduce music volume during caption time windows
- Configurable duck gain and fade times
- Works with a single audio track when time windows are provided

## Progress Tracking and Monitoring

The rendering pipeline provides detailed progress tracking:

1. **Real-time Progress Updates**: FFmpeg progress is parsed and reported every 250ms
2. **Structured Logging**: Progress events include percent complete, ETA, speed, and frame count
3. **Timeout Handling**: Configurable timeouts with graceful shutdown (SIGTERM then SIGKILL)
4. **Metadata Collection**: Final metadata includes duration, FPS, codecs, and file sizes

## Checkpointing and Resumability

To support long-running renders and recovery from interruptions:

1. **Job State Persistence**: Render job state is saved to JSON files
2. **Stage Tracking**: Pipeline tracks completion of slideshow mux, audio mix, burn-in, and thumbnail stages
3. **Artifact Verification**: Completed artifacts are verified by size/hash before skipping
4. **Resume Capability**: Interrupted renders can resume from the last completed stage

## Containerized Deployment

The rendering pipeline can be deployed in containers for production use:

1. **Docker Image**: Pre-built image with Node.js, FFmpeg, and required fonts
2. **Resource Constraints**: Support for memory and CPU limits
3. **Volume Mounts**: Input/output directories mounted as volumes
4. **Environment Configuration**: Configurable via environment variables

## Sample FFmpeg Commands

### Create slideshow from images with audio
Using concat demuxer:
```
ffmpeg -f concat -safe 0 -i images.txt -i audio.mp3 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest out.mp4
```

### Burn subtitles into video
```
ffmpeg -i in.mp4 -vf "subtitles=path/to/captions.srt:force_style='Fontsize=24'" -c:a copy out_burn.mp4
```

### Generate thumbnail at 3s
```
ffmpeg -ss 00:00:03 -i out.mp4 -frames:v 1 -q:v 2 thumbnail.jpg
```

### Audio ducking with sidechain compression
```
ffmpeg -i bgm.mp3 -i narration.wav -filter_complex "[0:a]anull[bgm];[1:a]anull[vo];[bgm][vo]sidechaincompress=threshold=0.05:ratio=8:attack=5:release=50[ducked]" -map "[ducked]" out.mp3
```

### Audio ducking with envelope
```
ffmpeg -i bgm.mp3 -filter_complex "[0:a]volume='if(gt(between(t,0,1)+between(t,2.5,3),0),0.3,1.0)'[ducked]" -map "[ducked]" out.mp3
```

## Implementation Phases

### Phase A — Prototype (2–4 days)
1. Design doc + sample FFmpeg commands
2. Implement Node orchestration module
3. Implement script CLI wrapper
4. Implement preview job flows
5. Add unit tests with mocked spawn

### Phase B — Features & QA (3–5 days)
1. Subtitles export integration and burn-in option
2. Thumbnail generation and metadata JSON
3. Audio ducking implementation
4. Add functional smoke job to CI

### Phase C — Hardening & Scale (3–7 days)
1. Robust progress parsing & checkpointing
2. Containerized runner setup
3. End-to-end tests
4. Monitoring hooks

## Testing Strategy

### Unit Tests
- Orchestration builds correct FFmpeg args
- Spawn mocked and expected sequence asserted
- Subtitle generation produces valid SRT files
- Audio ducking expressions are correctly formed
- Progress parsing handles FFmpeg output correctly
- Checkpointing saves/loads job state correctly

### Integration Tests (CI Smoke)
- Run 5s render using tiny set of images + short TTS audio
- Assert MP4 exists and duration within ±200ms
- Verify subtitles are burned-in or exported as sidecar
- Verify audio ducking is applied when configured
- Verify progress events are emitted
- Verify checkpointing works correctly

### End-to-End Tests
- Full pipeline test with real assets (PDF → images → render)
- Weekly scheduled runs in CI
- On-demand runs via PR labels
- Artifact collection on failure

### Manual QA
- Run 30s preview locally
- Verify A/V sync <200ms
- Verify subtitles present and burn-in toggle works
- Verify audio ducking works correctly
- Verify progress tracking works
- Verify resume capability works

## Risks & Mitigations

### CI Runner Limits/Timeouts
Mitigation: Keep smoke renders short and offload long renders to specialized runners

### FFmpeg Differences Across OS/Versions
Mitigation: Pin to stable FFmpeg version in container or document minimum version

### Performance
Mitigation: Avoid synchronous blocking; stream processing, set timeouts, and cleanup temp files

### Resource Exhaustion
Mitigation: Implement resource caps and validate inputs pre-run

### Data Loss on Interruption
Mitigation: Implement checkpointing and artifact verification

## Security Considerations

### Input Validation
- Sanitize/escape all shell paths and text
- Validate input counts and durations pre-run
- Enforce configurable max resolution/fps limits

### Resource Management
- Cleanup temporary directories on success/failure
- Implement timeouts to prevent infinite runs
- Use resource limits in containerized deployments

### Artifact Integrity
- Optional checksums (SHA256) for output artifacts
- Verify artifact integrity before marking stages complete