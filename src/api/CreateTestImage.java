import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.File;

public class CreateTestImage {
    public static void main(String[] args) throws Exception {
        // Create a test image with transparency gradient
        BufferedImage test = new BufferedImage(100, 100, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = test.createGraphics();
        
        // Clear to transparent
        g.setComposite(AlphaComposite.Clear);
        g.fillRect(0, 0, 100, 100);
        
        // Create gradient with varying transparency
        for (int x = 0; x < 100; x++) {
            int alpha = (int)(255 * (x / 100.0)); // 0 to 255
            Color color = new Color(255, 100, 100, alpha); // Red with varying alpha
            g.setComposite(AlphaComposite.Src);
            g.setColor(color);
            g.drawLine(x, 0, x, 100);
        }
        g.dispose();
        
        // Save test image
        if (!ImageIO.write(test, "png", new File("test_alpha.png"))) {
            throw new RuntimeException("Failed to write test image");
        }
        
        System.out.println("Created test_alpha.png with transparency gradient");
        System.out.println("Left side: transparent, Right side: opaque red");
    }
}