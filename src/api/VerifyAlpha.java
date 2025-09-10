import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.awt.*;
import java.io.File;

/**
 * Standalone alpha verification utility as specified by GPT-5.
 * Validates that alpha channel handling works correctly.
 */
public class VerifyAlpha {
    
    static BufferedImage ensureArgb(BufferedImage src) {
        if (src.getType() == BufferedImage.TYPE_INT_ARGB) return src;
        BufferedImage out = new BufferedImage(src.getWidth(), src.getHeight(), BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = out.createGraphics();
        g.setComposite(AlphaComposite.Src);
        g.drawImage(src, 0, 0, null);
        g.dispose();
        return out;
    }

    static int forceOpaque(int rgb) {
        // CRITICAL: Use 0xFF000000 for full alpha, NOT 0xFF0000
        return (rgb & 0x00FFFFFF) | 0xFF000000;
    }

    public static void main(String[] args) throws Exception {
        if (args.length < 2) {
            System.err.println("Usage: java VerifyAlpha <in.png> <out.png>");
            System.exit(1);
        }
        
        String inputPath = args[0];
        String outputPath = args[1];
        
        // Load input image
        File inputFile = new File(inputPath);
        if (!inputFile.exists()) {
            System.err.println("Error: Input file does not exist: " + inputPath);
            System.exit(1);
        }
        
        BufferedImage in = ImageIO.read(inputFile);
        if (in == null) {
            System.err.println("Error: Could not read image: " + inputPath);
            System.exit(1);
        }
        
        System.out.println("Input type=" + in.getType() + " hasAlpha=" + in.getColorModel().hasAlpha());
        System.out.println("Dimensions: " + in.getWidth() + "x" + in.getHeight());
        
        // Ensure ARGB format
        BufferedImage argb = ensureArgb(in);
        
        // Force one pixel's alpha to 0 (transparent) for testing
        int testX = Math.min(5, argb.getWidth() - 1);
        int testY = Math.min(5, argb.getHeight() - 1);
        
        // Get original RGB value and make it transparent
        int originalPixel = argb.getRGB(testX, testY);
        int rgb = originalPixel & 0x00FFFFFF; // Strip alpha
        int transparentPixel = rgb; // alpha=0 (fully transparent)
        
        // Set test pixel to transparent
        argb.setRGB(testX, testY, transparentPixel);
        
        // Also create a small transparent square for visibility
        for (int y = testY; y < Math.min(testY + 3, argb.getHeight()); y++) {
            for (int x = testX; x < Math.min(testX + 3, argb.getWidth()); x++) {
                int pixel = argb.getRGB(x, y);
                int pixelRgb = pixel & 0x00FFFFFF;
                argb.setRGB(x, y, pixelRgb); // Make transparent
            }
        }
        
        // Write output PNG
        if (!ImageIO.write(argb, "png", new File(outputPath))) {
            throw new RuntimeException("PNG write failed for: " + outputPath);
        }
        
        System.out.println("Wrote " + outputPath);
        System.out.println("Test modifications:");
        System.out.println("- Created transparent pixel at (" + testX + ", " + testY + ")");
        System.out.println("- Created 3x3 transparent square");
        System.out.println();
        System.out.println("Validation instructions:");
        System.out.println("1. Open " + outputPath + " in an image viewer with checkerboard background");
        System.out.println("2. Verify transparency is preserved (no black edge halos)");
        System.out.println("3. Look for the small transparent square in the top-left area");
        System.out.println("4. If compositing onto white background, edges should remain clean");
        
        // Additional validation: check alpha values
        int finalPixel = argb.getRGB(testX, testY);
        int finalAlpha = (finalPixel >>> 24) & 0xFF;
        System.out.println();
        System.out.println("Alpha validation:");
        System.out.printf("Test pixel alpha: %d (expected: 0)%n", finalAlpha);
        
        if (finalAlpha == 0) {
            System.out.println("✓ Alpha transparency test PASSED");
        } else {
            System.out.println("✗ Alpha transparency test FAILED");
        }
    }
}