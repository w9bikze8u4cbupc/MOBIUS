# alpha_ops.py - Python transparency utilities for OpenCV
import cv2
import numpy as np
from typing import Optional, Tuple

class AlphaOps:
    """Utilities for proper alpha channel handling in image processing"""
    
    @staticmethod
    def ensure_alpha(img: np.ndarray) -> np.ndarray:
        """
        Ensure image has alpha channel (BGRA format for OpenCV).
        Equivalent to Java's ensureArgb() function.
        """
        if img is None:
            raise ValueError("Input image is None")
        
        if len(img.shape) == 3 and img.shape[2] == 4:
            # Already has alpha channel
            return img
        elif len(img.shape) == 3 and img.shape[2] == 3:
            # BGR -> BGRA, add full opacity alpha
            alpha_channel = np.full((img.shape[0], img.shape[1], 1), 255, dtype=img.dtype)
            return np.concatenate([img, alpha_channel], axis=2)
        elif len(img.shape) == 2:
            # Grayscale -> BGRA
            bgr = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
            alpha_channel = np.full((img.shape[0], img.shape[1], 1), 255, dtype=img.dtype)
            return np.concatenate([bgr, alpha_channel], axis=2)
        else:
            raise ValueError(f"Unsupported image shape: {img.shape}")
    
    @staticmethod
    def new_transparent(width: int, height: int, dtype=np.uint8) -> np.ndarray:
        """
        Create a new transparent BGRA image.
        Equivalent to Java's newTransparent() function.
        """
        # Create BGRA image with all pixels transparent (alpha=0)
        return np.zeros((height, width, 4), dtype=dtype)
    
    @staticmethod
    def force_opaque_pixel(bgr_pixel: Tuple[int, int, int]) -> Tuple[int, int, int, int]:
        """
        Convert BGR pixel to BGRA with full opacity.
        Equivalent to Java's forceOpaque() function.
        Returns (B, G, R, A) tuple with A=255
        """
        b, g, r = bgr_pixel
        return (b, g, r, 255)  # Full alpha
    
    @staticmethod
    def force_opaque_image(img: np.ndarray) -> np.ndarray:
        """
        Ensure all pixels in image are fully opaque.
        Works with both BGR and BGRA images.
        """
        if len(img.shape) == 3 and img.shape[2] == 3:
            # BGR -> BGRA with full opacity
            return AlphaOps.ensure_alpha(img)
        elif len(img.shape) == 3 and img.shape[2] == 4:
            # Set all alpha values to 255 (full opacity)
            result = img.copy()
            result[:, :, 3] = 255
            return result
        else:
            raise ValueError(f"Unsupported image format: {img.shape}")
    
    @staticmethod
    def flatten_onto_background(img: np.ndarray, bg_color: Tuple[int, int, int] = (255, 255, 255)) -> np.ndarray:
        """
        Composite transparent image onto solid background.
        Equivalent to Java's flattenOnto() function.
        Only use when you WANT to remove transparency.
        """
        img_alpha = AlphaOps.ensure_alpha(img)
        height, width = img_alpha.shape[:2]
        
        # Create background
        bg_bgr = np.full((height, width, 3), bg_color, dtype=img_alpha.dtype)
        
        # Extract alpha channel and normalize to 0-1
        alpha = img_alpha[:, :, 3].astype(np.float32) / 255.0
        alpha_3ch = np.stack([alpha, alpha, alpha], axis=2)
        
        # Alpha blending: result = foreground * alpha + background * (1 - alpha)
        foreground = img_alpha[:, :, :3].astype(np.float32)
        background = bg_bgr.astype(np.float32)
        
        result = foreground * alpha_3ch + background * (1 - alpha_3ch)
        return result.astype(img_alpha.dtype)
    
    @staticmethod
    def write_png_with_alpha(img: np.ndarray, filename: str) -> bool:
        """
        Write PNG preserving alpha channel.
        Equivalent to Java's writePng() function.
        """
        try:
            # Ensure image has alpha channel
            img_alpha = AlphaOps.ensure_alpha(img)
            
            # OpenCV expects BGRA for PNG with alpha
            success = cv2.imwrite(filename, img_alpha)
            if not success:
                raise RuntimeError(f"cv2.imwrite returned False for {filename}")
            return True
        except Exception as e:
            print(f"Error writing PNG with alpha: {e}")
            return False
    
    @staticmethod
    def load_with_alpha(filename: str) -> Optional[np.ndarray]:
        """
        Load image preserving alpha channel if present.
        """
        try:
            # Load with alpha channel if available
            img = cv2.imread(filename, cv2.IMREAD_UNCHANGED)
            if img is None:
                return None
            
            # Ensure consistent BGRA format
            return AlphaOps.ensure_alpha(img)
        except Exception as e:
            print(f"Error loading image with alpha: {e}")
            return None

# Example usage for component detection with proper alpha handling
def detect_components_alpha_safe(image_path: str, output_path: str):
    """
    Example of component detection that preserves alpha transparency.
    This replaces the existing detect_components.py with alpha-safe operations.
    """
    # Load image with alpha preservation
    img = AlphaOps.load_with_alpha(image_path)
    if img is None:
        print(f"Error: Could not read image: {image_path}")
        return False
    
    # For YOLO, we need BGR format (remove alpha temporarily)
    img_bgr = img[:, :, :3] if img.shape[2] == 4 else img
    
    # Run YOLO detection on BGR image
    # ... detection code here ...
    
    # When saving results, preserve original alpha if doing overlays
    result_with_alpha = AlphaOps.ensure_alpha(img_bgr)
    
    # Save with alpha preservation
    return AlphaOps.write_png_with_alpha(result_with_alpha, output_path)

if __name__ == "__main__":
    # Quick validation test
    import sys
    
    if len(sys.argv) < 3:
        print("Usage: python alpha_ops.py <input.png> <output.png>")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    
    # Load image
    img = AlphaOps.load_with_alpha(input_file)
    if img is None:
        print(f"Error: Could not load {input_file}")
        sys.exit(1)
    
    print(f"Input: {img.shape}, dtype: {img.dtype}")
    print(f"Has alpha: {img.shape[2] == 4}")
    
    # Ensure alpha and make one pixel transparent for testing
    img_alpha = AlphaOps.ensure_alpha(img)
    
    # Make a small area transparent for testing
    h, w = img_alpha.shape[:2]
    test_x, test_y = min(5, w-1), min(5, h-1)
    img_alpha[test_y:test_y+3, test_x:test_x+3, 3] = 0  # Transparent pixels
    
    # Save with alpha preservation
    success = AlphaOps.write_png_with_alpha(img_alpha, output_file)
    if success:
        print(f"Successfully wrote {output_file} with alpha preservation")
    else:
        print(f"Failed to write {output_file}")
        sys.exit(1)