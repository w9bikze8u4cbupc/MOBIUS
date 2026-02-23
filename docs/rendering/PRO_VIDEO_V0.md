# Professional Video v0 Specification

**Version**: 1.0  
**Status**: Production-Ready  
**Date**: 2026-02-23

## Overview

The "Professional Video v0" render profile produces publishable-quality tutorial videos with:
- Consistent branding (optional intro/outro)
- Audio mastering to broadcast standards
- Publishable packaging (chapters, thumbnails, manifests)
- Deterministic, repeatable output

This is the minimum quality bar for videos intended for public distribution.

## What "Professional Grade" Means in MOBIUS

Professional grade does NOT mean:
- Hollywood production values
- Complex motion graphics
- Custom animations per video

Professional grade DOES mean:
- Consistent audio loudness (no viewer volume adjustments needed)
- Proper metadata for platforms (chapters, thumbnails)
- Brand consistency (optional intro/outro)
- Verifiable output (checksums, manifests)
- Deterministic rendering (same inputs → same outputs)

## Render Profile: `pro_v0`

### Configuration

```javascript
{
  profile: 'pro_v0',
  
  // Brand assets (optional)
  brandAssets: {
    introPath: 'assets/brand/pro_v0/intro.mp4',  // Optional
    outroPath: 'assets/brand/pro_v0/outro.mp4'   // Optional
  },
  
  // Audio mastering (recommended defaults)
  loudness: {
    enabled: true,
    targetLufs: -14,      // Web video standard
    truePeakDb: -1.0,     // Prevent clipping
    lra: 11               // Loudness range
  },
  
  // Caption styling (for burn-in)
  captionStyle: {
    safeMargins: true,    // Keep text away from edges
    fontSize: 24,
    fontFamily: 'Arial',
    position: 'bottom'
  },
  
  // Packaging options
  packaging: {
    exportChapters: true,   // Generate chapters.json
    exportManifest: true,   // Generate render_manifest.json
    thumbnailTime: 3.0      // Extract thumbnail at 3 seconds
  }
}
```

### Output Artifacts

When rendering with `profile: 'pro_v0'`, the following artifacts are produced:

1. **Video File** (`output.mp4` or `preview_Xs.mp4`)
   - H.264 video codec
   - AAC audio codec
   - Loudness normalized to target LUFS
   - Optional intro/outro prepended/appended

2. **Thumbnail** (`thumbnail.jpg`)
   - Extracted at configured timestamp (default: 3 seconds after intro)
   - High quality (q:v 2)
   - 1920x1080 resolution (matches video)

3. **Captions** (`captions_en.srt` or `captions_fr.srt`)
   - SRT format sidecar file
   - Generated from authoritative script
   - Localized if FR confirmed

4. **Chapters** (`chapters_en.json` or `chapters_fr.json`)
   - JSON format with timestamps
   - Derived from script segment timing
   - Platform-ready for YouTube, Vimeo, etc.

5. **Manifest** (`render_manifest.json`)
   - Inventory of all outputs
   - SHA-256 checksums for verification
   - Render settings snapshot
   - File sizes and paths

## Audio Mastering

### Loudness Normalization

MOBIUS uses FFmpeg's `loudnorm` filter to achieve consistent loudness:

```
loudnorm=I=-14:LRA=11:TP=-1.0:print_format=summary
```

**Parameters**:
- `I` (Integrated Loudness): Target LUFS (default: -14 for web video)
- `LRA` (Loudness Range): Dynamic range target (default: 11)
- `TP` (True Peak): Maximum peak level in dBTP (default: -1.0)

**Why These Defaults?**:
- `-14 LUFS`: YouTube, Spotify, and most streaming platforms normalize to this level
- `-1.0 dBTP`: Prevents clipping and distortion on consumer devices
- `11 LRA`: Maintains dynamic range while ensuring consistency

### Verification

After rendering, the manifest includes measured loudness metrics (if available):
- Actual integrated loudness achieved
- True peak level measured
- Loudness range measured

## Chapters Export

### Format

```json
{
  "version": "1.0",
  "language": "en",
  "generatedAt": "2026-02-23T10:30:00.000Z",
  "totalChapters": 5,
  "chapters": [
    {
      "title": "Introduction",
      "startTimeSeconds": 0,
      "endTimeSeconds": 15,
      "segmentType": "introduction",
      "segmentIndex": 0
    },
    {
      "title": "Components",
      "startTimeSeconds": 15,
      "endTimeSeconds": 45,
      "segmentType": "component_overview",
      "segmentIndex": 1
    }
  ]
}
```

### Chapter Titles

Titles are derived from segment types:
- `introduction` → "Introduction"
- `component_overview` → "Components"
- `setup` → "Setup"
- `turn_structure` → "Turn Structure"
- `gameplay` → "Gameplay"
- `scoring` → "Scoring"
- `winning` → "Winning"
- `conclusion` → "Conclusion"
- Unknown types → "Chapter N"

### Platform Integration

The chapters JSON can be converted to platform-specific formats:
- **YouTube**: Paste timestamps in description (00:00 Introduction)
- **Vimeo**: Use chapters API
- **Custom players**: Parse JSON for interactive chapter navigation

## Manifest Structure

```json
{
  "version": "1.0",
  "profile": "pro_v0",
  "generatedAt": "2026-02-23T10:30:00.000Z",
  "settings": {
    "language": "en",
    "burnCaptions": false,
    "exportSrt": true,
    "loudness": {
      "enabled": true,
      "targetLufs": -14,
      "truePeakDb": -1.0,
      "lra": 11
    }
  },
  "metadata": {
    "duration": 180,
    "fps": 30,
    "resolution": "1920x1080"
  },
  "artifacts": {
    "video": {
      "filename": "output.mp4",
      "path": "/path/to/output.mp4",
      "size": 15728640,
      "checksum": "a1b2c3d4...",
      "exists": true
    },
    "thumbnail": {
      "filename": "thumbnail.jpg",
      "path": "/path/to/thumbnail.jpg",
      "size": 102400,
      "checksum": "e5f6g7h8...",
      "exists": true
    },
    "captions": {
      "filename": "captions_en.srt",
      "path": "/path/to/captions_en.srt",
      "size": 2048,
      "checksum": "i9j0k1l2...",
      "exists": true
    },
    "chapters": {
      "filename": "chapters_en.json",
      "path": "/path/to/chapters_en.json",
      "size": 1024,
      "checksum": "m3n4o5p6...",
      "exists": true
    }
  }
}
```

## Brand Assets

### Intro/Outro Clips

**Specifications**:
- Format: MP4 (H.264 + AAC)
- Resolution: 1920x1080 (must match main video)
- Duration: 3-5 seconds recommended
- Audio: Optional (music bed or tone)

**Placement**:
- Intro: Prepended before first content frame
- Outro: Appended after last content frame

**Fallback Behavior**:
- If paths not provided → render without intro/outro
- If files don't exist → render without intro/outro
- No error thrown → graceful degradation

### Legal Requirements

All brand assets must be:
- Owned by you or properly licensed
- Free of third-party copyrights
- Appropriate for public distribution

MOBIUS does not include default brand assets to avoid licensing complications.

## Usage Examples

### Basic Professional Render

```javascript
import { render } from './src/render/index.js';

const result = await render(job, {
  profile: 'pro_v0',
  loudness: {
    enabled: true,
    targetLufs: -14,
    truePeakDb: -1.0
  },
  exportSrt: true,
  language: 'en',
  script: authoritativeScript
});

console.log('Video:', result.outputPath);
console.log('Chapters:', result.chaptersPath);
console.log('Manifest:', result.manifestPath);
```

### With Brand Assets

```javascript
const result = await render(job, {
  profile: 'pro_v0',
  brandAssets: {
    introPath: 'assets/brand/pro_v0/intro.mp4',
    outroPath: 'assets/brand/pro_v0/outro.mp4'
  },
  loudness: { enabled: true },
  exportSrt: true,
  language: 'en',
  script: authoritativeScript
});
```

### French Localized Render

```javascript
// Ensure FR localization is confirmed first
if (!isLocalizationConfirmed(script, 'fr')) {
  throw new Error('FR localization must be confirmed before rendering');
}

const result = await render(job, {
  profile: 'pro_v0',
  loudness: { enabled: true },
  exportSrt: true,
  language: 'fr',  // Use French captions and chapters
  script: authoritativeScript
});
```

## Review Checklist

Before publishing a video rendered with `pro_v0`:

### Technical Quality
- [ ] Video plays without errors
- [ ] Audio loudness is consistent (no sudden volume changes)
- [ ] No clipping or distortion in audio
- [ ] Captions are synchronized with narration
- [ ] Thumbnail is clear and representative

### Packaging
- [ ] All artifacts present (video, thumbnail, captions, chapters, manifest)
- [ ] Checksums verify successfully
- [ ] Chapters align with video content
- [ ] Manifest includes all expected metadata

### Content Quality
- [ ] Intro/outro (if used) are appropriate
- [ ] Captions are accurate and readable
- [ ] Chapter titles are descriptive
- [ ] No placeholder or test content

### Governance
- [ ] Script is confirmed as authoritative
- [ ] FR localization confirmed (if rendering in French)
- [ ] All ingestion gates satisfied
- [ ] Provenance documented

## Troubleshooting

### Audio Normalization Not Applied

**Symptom**: Loudness varies significantly between segments

**Solution**: Ensure `loudness.enabled: true` in options

### Chapters Not Generated

**Symptom**: No `chapters_*.json` file in output

**Solution**: Ensure script has timing information (`startTime`, `endTime` on segments)

### Intro/Outro Not Included

**Symptom**: Video starts/ends abruptly without brand clips

**Solution**: 
1. Verify `brandAssets.introPath` and `outroPath` are correct
2. Check files exist and are readable
3. Ensure files are valid MP4 format

### FR Captions Fail

**Symptom**: Error about FR localization not confirmed

**Solution**: Confirm FR localization via `CONFIRM_LOCALIZATION_FR` gate before rendering

## Performance Considerations

### Render Time

Professional renders take longer due to:
- Loudness normalization (requires analysis pass)
- Intro/outro muxing
- Chapter/manifest generation

**Typical overhead**: +10-20% compared to standard profile

### Disk Space

Professional renders produce more artifacts:
- Standard: ~1 file (video)
- Pro v0: ~5 files (video, thumbnail, captions, chapters, manifest)

**Typical overhead**: +5-10 MB for metadata files

## Future Enhancements

Potential additions to future professional profiles:

- **Pro v1**: Motion graphics templates
- **Pro v2**: Multi-track audio (narration + music + SFX)
- **Pro v3**: Adaptive bitrate outputs (HLS/DASH)
- **Pro v4**: Accessibility enhancements (audio descriptions, extended captions)

---

**Status**: Production-ready for first publishable tutorial videos.
