# Mobius Tutorial Generator Icons

This document describes the icon assets for the Mobius Tutorial Generator application.

## Current Icons

### Web Favicon
- Location: `client/public/favicon.ico`
- Format: ICO (16x16)
- Description: Green Japanese dragon icon

### Desktop Shortcut Icon
- Location: `client/public/favicon.ico`
- Format: ICO
- Description: Green Japanese dragon icon
- Used by: `create-desktop-shortcut.ps1`

## Icon Assets

### Dragon Icon SVG
- Location: `icons/dragon-icon.svg`
- Description: High-resolution green Japanese dragon SVG that can be used to generate higher quality ICO files

## Creating High-Quality Icons

The current ICO file is a basic implementation. For a higher quality icon, you can:

1. Use the SVG file at `icons/dragon-icon.svg` as source
2. Convert it to ICO format with multiple resolutions using online tools or software:
   - [ConvertICO](https://convertico.com/)
   - [Online-Convert](https://image.online-convert.com/convert-to-ico)
   - [GIMP](https://www.gimp.org/) with ICO plugin
   - [ImageMagick](https://imagemagick.org/) command line tool

### Using ImageMagick (Command Line)
If you have ImageMagick installed, you can generate a high-quality ICO file:

```bash
magick convert -background none icons/dragon-icon.svg -define icon:auto-resize=16,32,48,64,128,256 client/public/favicon.ico
```

### Using Online Converters
1. Go to https://convertico.com/ or similar service
2. Upload the `icons/dragon-icon.svg` file
3. Select multiple sizes (16x16, 32x32, 48x48, 64x64, 128x128, 256x256)
4. Download the generated ICO file
5. Replace `client/public/favicon.ico` with the new file

## Updating Icons

To update the icons:

1. Modify the SVG file at `icons/dragon-icon.svg` if you want to change the design
2. Generate a new ICO file using one of the methods above
3. Replace `client/public/favicon.ico` with the new file
4. Run `create-desktop-shortcut.ps1` to update desktop shortcuts with the new icon

## Icon Design

The current icon features:
- A green color scheme representing the "green dragon" request
- A simplified dragon silhouette
- A dark green background with a brighter green dragon
- Simple design that works well at small sizes

The dragon design is intentionally simplified to work well at small icon sizes while still being recognizable as a Japanese dragon.