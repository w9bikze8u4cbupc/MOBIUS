# test_detection.py
from ultralytics import YOLO
import cv2
import sys

def main():
    if len(sys.argv) < 2:
        print("Usage: python test_detection.py <image_path>")
        return 1

    image_path = sys.argv[1]

    # Load model
    model = YOLO('yolov8n.pt')

    # Load image
    img = cv2.imread(image_path)
    if img is None:
        print(f"Error: Could not read image: {image_path}")
        return 1

    # Run detection
    results = model(img)

    # Show results (this will open a window)
    results_plotted = results[0].plot()
    cv2.imshow("Detection Results", results_plotted)
    cv2.waitKey(0)
    cv2.destroyAllWindows()

    # Print detected objects
    for r in results:
        for i, box in enumerate(r.boxes):
            cls_id = int(box.cls[0])
            cls_name = model.names[cls_id]
            conf = float(box.conf[0])
            print(f"Detected: {cls_name} (Confidence: {conf:.2f})")

    return 0

if __name__ == "__main__":
    sys.exit(main())