# detect_components.py
import sys
import os
import json
import cv2
from ultralytics import YOLO

def main():
    if len(sys.argv) < 3:
        print("Usage: python detect_components.py <image_path> <output_json_path>")
        sys.exit(1)

    image_path = sys.argv[1]
    output_json_path = sys.argv[2]

    model = YOLO('yolov8n.pt')
    img = cv2.imread(image_path)
    if img is None:
        print(f"Error: Could not read image: {image_path}")
        sys.exit(1)

    results = model(img)
    detections = []
    for r in results:  
        for box in r.boxes:  
            x1, y1, x2, y2 = box.xyxy[0].tolist()  
            conf = float(box.conf[0])  
            cls = int(box.cls[0])  
            w = int(x2 - x1)  
            h = int(y2 - y1)  
            detections.append({  
                "x": int(x1),  
                "y": int(y1),  
                "width": w,  
                "height": h,  
                "confidence": conf,  
                "class_id": cls,  
                "class_name": model.names[cls]  
            })

    with open(output_json_path, "w") as f:
        json.dump(detections, f, indent=2)

    print(f"Saved {len(detections)} detections to {output_json_path}")

if __name__ == "__main__":
    main()