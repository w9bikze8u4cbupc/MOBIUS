# Professional Video v0 Brand Assets

This directory contains placeholder brand assets for the "Professional Video v0" render profile.

## Assets

### Intro Clip (Optional)
- **File**: `intro.mp4` (not included by default)
- **Purpose**: Prepended to the beginning of tutorial videos
- **Specifications**:
  - Duration: 3-5 seconds recommended
  - Resolution: 1920x1080 (1080p)
  - Format: MP4 (H.264 + AAC)
  - Audio: Optional music bed or tone

### Outro Clip (Optional)
- **File**: `outro.mp4` (not included by default)
- **Purpose**: Appended to the end of tutorial videos
- **Specifications**:
  - Duration: 3-5 seconds recommended
  - Resolution: 1920x1080 (1080p)
  - Format: MP4 (H.264 + AAC)
  - Audio: Optional music bed or tone

## Usage

To use custom brand assets:

1. Place your intro/outro clips in this directory
2. Configure the render profile in your render options:

```javascript
{
  profile: 'pro_v0',
  brandAssets: {
    introPath: 'assets/brand/pro_v0/intro.mp4',
    outroPath: 'assets/brand/pro_v0/outro.mp4'
  }
}
```

## Legal

All brand assets must be:
- Owned by you or properly licensed
- Free of third-party copyrights
- Appropriate for public distribution

The MOBIUS project does not include default brand assets to avoid licensing complications.
Operators must provide their own assets or render without intro/outro clips.

## Fallback Behavior

If intro/outro paths are not provided or files don't exist:
- Render proceeds without intro/outro
- No error is thrown
- Graceful degradation ensures videos are still produced
