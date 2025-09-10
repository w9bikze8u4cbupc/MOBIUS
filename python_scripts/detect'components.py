# detect_components.py
import sys
import json
from ultralytics import YOLO
import cv2

def detect_components(image_path, output_json_path):
    try:
        # Load YOLOv8 model (you'll need to train this or use a pre-trained one)
        model = YOLO('yolov8n.pt')  # or your custom trained model
        
        # Run detection
        results = model(image_path)
        
        detections = []
        for result in results:
            boxes = result.boxes
            if boxes is not None:
                for box in boxes:
                    x, y, w, h = box.xywh[0].tolist()
                    conf = box.conf[0].item()
                    cls = int(box.cls[0].item())
                    
                    detections.append({
                        'x': int(x - w/2),
                        'y': int(y - h/2), 
                        'width': int(w),
                        'height': int(h),
                        'confidence': conf,
                        'class_name': model.names[cls]
                    })
        
        # Save detections to JSON
        with open(output_json_path, 'w') as f:
            json.dump(detections, f)
            
        print(f"Detected {len(detections)} components")
        
    except Exception as e:
        print(f"Detection failed: {e}")
        # Save empty detections
        with open(output_json_path, 'w') as f:
            json.dump([], f)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python detect_components.py <image_path> <output_json_path>")
        sys.exit(1)
    
    image_path = sys.argv[1]
    output_json_path = sys.argv[2]
    detect_components(image_path, output_json_path)