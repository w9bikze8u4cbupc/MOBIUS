# Audio Anti-Pumping Chain

The audio anti-pumping chain prevents music "breathing" when voice-over is silent by using sidechain compression with additional processing.

## FFmpeg Reference Implementation

For a dual audio stream setup (main audio and sidechain/music):

```bash
ffmpeg -i main.wav -i music.wav -filter_complex "
[0:a][1:a]sidechaincompress=threshold=0.06:ratio=12:attack=5:release=250:mix=1.0[a_sc];
[a_sc]dynaudnorm=f=150:g=5:p=0.9:m=3:s=10[a_norm];
[a_norm]alimiter=level=-1.0[a_out]
" -map "[a_out]" -c:a aac -b:a 192k out_audio.mp4
```

## Parameters Explanation

### Sidechain Compressor
- `threshold=0.06` - Level at which compression begins (approximately -24 dB)
- `ratio=12` - Compression ratio (12:1)
- `attack=5` - Time to reach full compression (5 ms)
- `release=250` - Time to release compression (250 ms)
- `mix=1.0` - Fully apply the effect

### Dynamic Audio Normalizer
- `f=150` - Frame length in milliseconds (150 ms)
- `g=5` - Gaussian filter window size
- `p=0.9` - Target RMS value (90% of maximum)
- `m=3` - Number of frames to process (3 frames)
- `s=10` - Channel coupling strength

### Audio Limiter
- `level=-1.0` - Limit audio to -1.0 dBFS

## Single Audio Stream Version

If you only have a single voice-over bus, drop the sidechaincompress and use only:

```bash
ffmpeg -i input.wav -filter_complex "
dynaudnorm=f=150:g=5:p=0.9:m=3:s=10,
alimiter=level=-1.0
" -c:a aac -b:a 192k output.mp4
```

## Implementation in FiltergraphBuilder

In the TypeScript code, this is implemented in the `buildAudioAntiPumping` function:

```typescript
export function buildAudioAntiPumping(mainA: string, sidechainA: string): { outA: string, graph: string } {
  const graph = `
[${mainA}][${sidechainA}]sidechaincompress=threshold=0.06:ratio=12:attack=5:release=250:mix=1.0[mduck];
[mduck]dynaudnorm=f=150:g=5:p=0.9:m=3:s=10,alimiter=limit=-1.0[music_bus]
`.trim();
  return { outA: 'music_bus', graph };
}
```

This implementation ensures that music levels are reduced when voice-over is present, and that the overall audio levels remain consistent throughout the tutorial.