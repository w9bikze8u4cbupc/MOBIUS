package com.mobius.img;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.File;

/**
 * Java ARGB Alpha Transparency Utilities
 * Ensures proper alpha channel handling to prevent black halos and preserve transparency.
 * Based on memory specification: use 0xFF000000 for full opacity, not 0xFF0000.
 */
public final class AlphaOps {
    private AlphaOps() {}

    /**
     * Ensure image is in ARGB format with alpha channel.
     * Equivalent to ensuring proper alpha handling in all operations.
     */
    public static BufferedImage ensureArgb(BufferedImage src) {
        if (src == null) {
            throw new IllegalArgumentException("Source image cannot be null");
        }
        
        if (src.getType() == BufferedImage.TYPE_INT_ARGB) {
            return src;
        }
        
        BufferedImage out = new BufferedImage(src.getWidth(), src.getHeight(), BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = out.createGraphics();
        g.setComposite(AlphaComposite.Src); // Preserve alpha exactly
        g.drawImage(src, 0, 0, null);
        g.dispose();
        return out;
    }

    /**
     * Create a new transparent ARGB image.
     * All pixels start as fully transparent (alpha=0).
     */
    public static BufferedImage newTransparent(int w, int h) {
        BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = out.createGraphics();
        g.setComposite(AlphaComposite.Clear);
        g.fillRect(0, 0, w, h); // Fully transparent
        g.dispose();
        return out;
    }

    /**
     * Promote RGB pixel to ARGB with full opacity.
     * CRITICAL: Use 0xFF000000 for alpha, NOT 0xFF0000 (which targets red channel).
     * This fixes the core alpha mask issue mentioned in the memory.
     */
    public static int forceOpaque(int rgb) {
        // Correct alpha mask: 0xFF000000 = full opacity alpha channel
        // Remove any existing alpha and set to full opacity
        return (rgb & 0x00FFFFFF) | 0xFF000000;
    }

    /**
     * Create ARGB pixel with specific alpha value.
     * @param rgb RGB color value
     * @param alpha Alpha value (0-255, where 255 = fully opaque)
     */
    public static int withAlpha(int rgb, int alpha) {
        // Ensure alpha is in valid range
        alpha = Math.max(0, Math.min(255, alpha));
        return (rgb & 0x00FFFFFF) | (alpha << 24);
    }

    /**
     * Extract alpha channel value from ARGB pixel.
     * @param argb ARGB pixel value
     * @return Alpha value (0-255)
     */
    public static int getAlpha(int argb) {
        return (argb >>> 24) & 0xFF;
    }

    /**
     * Check if pixel has any transparency.
     * @param argb ARGB pixel value
     * @return true if pixel is not fully opaque
     */
    public static boolean hasTransparency(int argb) {
        return getAlpha(argb) < 255;
    }

    /**
     * Composite transparent image onto solid background.
     * Only use when you WANT to remove transparency by flattening onto background.
     */
    public static BufferedImage flattenOnto(BufferedImage src, Color bg) {
        if (src == null) {
            throw new IllegalArgumentException("Source image cannot be null");
        }
        if (bg == null) {
            bg = Color.WHITE; // Default background
        }

        // Create RGB destination (no alpha)
        BufferedImage dst = new BufferedImage(src.getWidth(), src.getHeight(), BufferedImage.TYPE_INT_RGB);
        Graphics2D g = dst.createGraphics();
        
        // Fill with background color first
        g.setComposite(AlphaComposite.Src);
        g.setColor(bg);
        g.fillRect(0, 0, dst.getWidth(), dst.getHeight());
        
        // Composite source image on top
        g.setComposite(AlphaComposite.SrcOver); // Standard alpha blending
        g.drawImage(src, 0, 0, null);
        g.dispose();
        return dst;
    }

    /**
     * Write PNG preserving alpha channel.
     * ImageIO will preserve alpha for TYPE_INT_ARGB images.
     */
    public static void writePng(BufferedImage img, File outFile) throws Exception {
        if (img == null) {
            throw new IllegalArgumentException("Image cannot be null");
        }
        if (outFile == null) {
            throw new IllegalArgumentException("Output file cannot be null");
        }

        // Ensure image is in ARGB format to preserve alpha
        BufferedImage argbImg = ensureArgb(img);
        
        if (!ImageIO.write(argbImg, "png", outFile)) {
            throw new RuntimeException("ImageIO.write returned false for PNG: " + outFile);
        }
    }

    /**
     * Load image preserving alpha channel if present.
     */
    public static BufferedImage loadWithAlpha(File imageFile) throws Exception {
        if (imageFile == null || !imageFile.exists()) {
            throw new IllegalArgumentException("Image file does not exist: " + imageFile);
        }

        BufferedImage loaded = ImageIO.read(imageFile);
        if (loaded == null) {
            throw new RuntimeException("Failed to load image: " + imageFile);
        }

        // Ensure alpha channel is preserved
        return ensureArgb(loaded);
    }

    /**
     * Create a copy of the image with all pixels set to full opacity.
     * Useful when you want to remove transparency but keep the image data.
     */
    public static BufferedImage makeOpaque(BufferedImage src) {
        if (src == null) {
            throw new IllegalArgumentException("Source image cannot be null");
        }

        BufferedImage result = ensureArgb(src);
        int width = result.getWidth();
        int height = result.getHeight();

        // Process all pixels to ensure full opacity
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int pixel = result.getRGB(x, y);
                result.setRGB(x, y, forceOpaque(pixel));
            }
        }

        return result;
    }

    /**
     * Validate alpha handling by creating a test image with transparency.
     * This can be used to verify that alpha operations work correctly.
     */
    public static void validateAlphaHandling(String testImagePath) throws Exception {
        System.out.println("Validating alpha handling...");
        
        // Create test image with gradient transparency
        BufferedImage test = newTransparent(100, 100);
        Graphics2D g = test.createGraphics();
        
        // Fill with gradient from opaque to transparent
        for (int x = 0; x < 100; x++) {
            int alpha = (int)(255 * (x / 100.0)); // 0 to 255
            Color color = new Color(255, 100, 100, alpha); // Red with varying alpha
            g.setColor(color);
            g.drawLine(x, 0, x, 100);
        }
        g.dispose();
        
        // Save test image
        File testFile = new File(testImagePath);
        writePng(test, testFile);
        
        // Reload and verify
        BufferedImage reloaded = loadWithAlpha(testFile);
        
        // Check some pixels for correct alpha values
        int leftPixel = reloaded.getRGB(10, 50);   // Should be mostly transparent
        int rightPixel = reloaded.getRGB(90, 50);  // Should be mostly opaque
        
        int leftAlpha = getAlpha(leftPixel);
        int rightAlpha = getAlpha(rightPixel);
        
        System.out.printf("Left pixel alpha: %d (expected: ~25)%n", leftAlpha);
        System.out.printf("Right pixel alpha: %d (expected: ~229)%n", rightAlpha);
        
        if (leftAlpha < 50 && rightAlpha > 200) {
            System.out.println("✓ Alpha handling validation PASSED");
        } else {
            System.out.println("✗ Alpha handling validation FAILED");
        }
    }
}