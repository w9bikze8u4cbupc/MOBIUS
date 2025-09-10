# Debug Overlays

Debug overlays help visualize the tutorial structure and ensure proper layout across different platforms.

## Cross-Platform Font Handling

For consistent text rendering across operating systems:

### Windows
Use named fonts like `font='Segoe UI'` for better compatibility.

### macOS/Linux
Use fontfile paths when possible, or named fonts if available.

## Text Escaping

When using drawtext filters, ensure proper escaping for backslashes and quotes:

```bash
-vf "drawtext=fontfile=/path/to/font.ttf:text='It\'s a \"test\"':x=10:y=10"
```

## Layout QA with Grid

For layout verification, the drawgrid filter is simpler and more portable:

```bash
-vf "drawgrid=width=iw:height=ih:x=64:y=64:thickness=1:color=#ffffff55"
```

This draws a grid with 64px spacing, which is helpful for verifying alignment with safe margins.

## Implementation in DebugOverlay.ts

The DebugOverlay class handles cross-platform font selection:

```typescript
// On Windows, prefer named fonts
if (process.platform === 'win32') {
  fontOption = "font='Segoe UI'";
} else {
  // On macOS/Linux, use fontfile when possible
  fontOption = "fontfile=/System/Library/Fonts/Arial.ttf"; // macOS example
}
```

## Safe Margins

The theme.json file defines safe margins to ensure content is visible on all displays:

```json
{
  "safeMargins": {
    "x": "10%",
    "y": "10%"
  }
}
```

These margins are used by the debug overlay to draw boundary lines.

## Timecode and Shot ID Display

Debug overlays include timecodes and shot IDs for easier navigation during review:

```typescript
const timecodeFilter = `drawtext=${fontOption}:text='%{pts\\:hms}':x=10:y=10:fontsize=24:fontcolor=white`;
const shotIdFilter = `drawtext=${fontOption}:text='${shotId}':x=10:y=40:fontsize=24:fontcolor=white`;
```

## Usage in Preview Renders

To enable debug overlays in preview renders, use the `--debug` flag:

```bash
npm run render:preview -- --debug
```

This will add overlays showing:
- Timecodes
- Shot IDs
- Safe margins
- Grid layout (optional)