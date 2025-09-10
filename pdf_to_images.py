import sys
import os
import fitz # PyMuPDF

def convert_pdf_to_images(pdf_path, output_dir):
# Create output directory if it doesn't exist
if not os.path.exists(output_dir):
os.makedirs(output_dir)

# Open the PDF  
doc = fitz.open(pdf_path)  

# For each page  
for page_num in range(len(doc)):  
    # Get the page  
    page = doc.load_page(page_num)  

    # Render page to an image  
    pix = page.get_pixmap(matrix=fitz.Matrix(300/72, 300/72))  

    # Save the image  
    output_file = os.path.join(output_dir, f"page_{page_num+1}.png")  
    pix.save(output_file)  

    print(f"Saved {output_file}")  

print(f"Converted {len(doc)} pages to images in {output_dir}")  

if name == "main":
if len(sys.argv) < 3:
print("Usage: python pdf_to_images.py <pdf_path> <output_dir>")
sys.exit(1)

pdf_path = sys.argv[1]  
output_dir = sys.argv[2]  

convert_pdf_to_images(pdf_path, output_dir)