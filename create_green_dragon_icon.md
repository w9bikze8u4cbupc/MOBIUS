# Creating a Green Japanese Dragon Icon

## Overview
This document provides instructions for creating a green Japanese dragon icon for the Mobius Tutorial Generator desktop shortcut.

## Recommended Approach

### Option 1: Online Icon Generators
1. Visit an AI icon generator like:
   - Icons8 AI Icon Generator
   - VectorNova AI Icon Generator
   - Look for "Japanese dragon icon" or "oriental dragon icon"
2. Specify "green" as the color
3. Download in .ico format or convert from .png to .ico

### Option 2: Convert Existing Image
1. Find a suitable green Japanese dragon image (ensure it's copyright-free or properly licensed)
2. Use an online converter to change it to .ico format:
   - ConvertICO.com
   - Online-Convert.com
   - CloudConvert.com

### Option 3: Create from Scratch
Using graphic design software:
1. Design a simple green Japanese dragon silhouette
2. Keep the design clean and recognizable at small sizes (16x16, 32x32, 48x48, 256x256 pixels)
3. Export/save as .ico format with multiple resolutions

## Icon Specifications
- **Format**: .ico (Windows Icon format)
- **Colors**: Green palette (emerald, forest, or jade green)
- **Style**: Japanese/Asian dragon (serpentine, with claws and whiskers)
- **Sizes**: Include multiple sizes in one .ico file:
  - 16x16 (for small taskbar icons)
  - 32x32 (for standard icons)
  - 48x48 (for larger displays)
  - 256x256 (for high-resolution displays)

## Free Resources
- **OpenClipart**: Search for "dragon" and filter by license
- **Flaticon**: Free with attribution, search "japanese dragon"
- **Icons8**: Free tier available, search "dragon"
- **Game-icons.net**: Free game-related icons

## Implementation Steps
1. Create or obtain the green Japanese dragon image
2. Convert to .ico format with multiple resolutions
3. Save as `mobius-icon.ico` in the project's `assets` directory
4. Run the update script:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/update-desktop-shortcut-icon.ps1
   ```

## Testing
After creating and applying the icon:
1. Check that it appears correctly on the desktop shortcut
2. Verify it shows properly in different contexts (taskbar, file explorer, etc.)
3. Ensure it's visually distinct and recognizable as a dragon

## Copyright Considerations
- Use only copyright-free or properly licensed images
- Consider creating an original design rather than copying existing artwork
- When in doubt, use simple geometric representations

## Example Description for AI Generators
When using AI image generators, try this prompt:
"Simple, flat, green Japanese dragon icon, minimal details, suitable for desktop shortcut, emerald green color, clean silhouette, oriental style, without text"

This should help generate a suitable icon that can be converted to .ico format.