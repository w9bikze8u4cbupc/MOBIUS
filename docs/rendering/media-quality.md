# Media Quality in the Video Rendering Pipeline

This document describes the media quality features implemented in the Mobius Tutorial Generator's video rendering pipeline.

## Loudness Normalization

The pipeline supports loudness normalization to EBU R128 standards, ensuring consistent audio levels across all generated videos.

### Configuration

Loudness normalization can be enabled through the `loudness` option:

```javascript
const options = {
  loudness: {
    enabled: true,
    targetI: -16,    // Target integrated loudness (LUFS)
    lra: 11,         // Loudness range target
    tp: -1.5         // True peak target (dBTP)
  }
};
```

### Implementation

The pipeline uses FFmpeg's `loudnorm` filter to normalize audio. The implementation supports both single-pass and dual-pass normalization:

- **Single-pass**: Faster processing with slightly less accuracy
- **Dual-pass**: Higher accuracy but requires two FFmpeg invocations

By default, the pipeline uses single-pass normalization for efficiency.

## Safety Filters

Safety filters protect against audio artifacts and ensure consistent output quality.

### High-pass Filter

Removes low-frequency rumble that can cause distortion:

```javascript
const options = {
  safetyFilters: {
    highpassHz: 80  // Remove frequencies below 80Hz
  }
};
```

### Low-pass Filter

Removes high-frequency noise that can cause listener fatigue:

```javascript
const options = {
  safetyFilters: {
    lowpassHz: 16000  // Remove frequencies above 16kHz
  }
};
```

### Limiter

Prevents clipping by limiting peak levels:

```javascript
const options = {
  safetyFilters: {
    limiter: true  // Apply a limiter with -1.0 dBFS ceiling
  }
};
```

## Capability Limits

The pipeline enforces configurable limits to ensure deterministic renders and prevent resource exhaustion.

### Configuration

```javascript
const options = {
  caps: {
    maxWidth: 1920,        // Maximum output width in pixels
    maxHeight: 1080,       // Maximum output height in pixels
    maxFps: 30,            // Maximum frame rate
    maxBitrateKbps: 6000   // Maximum bitrate in kilobits per second
  }
};
```

### Validation

Before rendering begins, the pipeline validates all inputs against the configured limits. If any input exceeds the limits, the render will fail with a descriptive error message unless explicitly overridden.

## Quality Assurance

The pipeline includes several QA checks to ensure output quality:

### Loudness Verification

CI tests verify that output loudness meets target specifications (±1 LU tolerance).

### Clipping Detection

Automated checks detect clipping in the output audio.

### Resolution/FPS Validation

Inputs are validated against configured limits to ensure deterministic outputs.

## Usage Examples

### Basic Loudness Normalization

```javascript
import { render } from './src/render/index.js';

const job = {
  images: ['slide1.jpg', 'slide2.jpg'],
  narration: 'narration.mp3',
  outputDir: './output'
};

const options = {
  loudness: {
    enabled: true,
    targetI: -23,  // EBU R128 standard
    lra: 7,
    tp: -2.0
  }
};

await render(job, options);
```

### Full Safety Configuration

```javascript
const options = {
  loudness: {
    enabled: true,
    targetI: -16,
    lra: 11,
    tp: -1.5
  },
  safetyFilters: {
    highpassHz: 80,
    lowpassHz: 16000,
    limiter: true
  },
  caps: {
    maxWidth: 1920,
    maxHeight: 1080,
    maxFps: 30,
    maxBitrateKbps: 6000
  }
};
```

## CI Integration

The media quality features are tested in CI with automated verification:

1. Loudness is verified using FFmpeg's ebur128 filter
2. Clipping detection is performed on all outputs
3. Resolution and FPS limits are validated
4. Test artifacts are archived for manual review when needed

## Performance Considerations

- Loudness normalization adds processing time but ensures consistent output quality
- Safety filters have minimal performance impact
- Capability limits prevent resource exhaustion and ensure predictable render times