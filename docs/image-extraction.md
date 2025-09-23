# Image Extraction & Matching — Quick Guide

Purpose
Extract images from PDFs, clean them, and match them automatically to your library entries.

Installation (Node)
1. npm install sharp image-hash node-fetch jimp
2. On CI install poppler utils (pdfimages or pdftoppm). On Debian/Ubuntu:
   - sudo apt-get update && sudo apt-get install -y poppler-utils
3. Optional (recommended for OCR/deskew): install tesseract & imagemagick.

Basic extraction (lossless preferred)
```bash
node scripts/extract_images.js path/to/input.pdf artifacts
# outputs: artifacts/images/*.png and artifacts/images.json
```

Default outputs
- master PNG (lossless): artifacts/images/<basename>-0001.png
- web JPEG derivative (good for video editors): artifacts/images/<basename>-0001-web.jpg
- thumbnail: artifacts/images/<basename>-0001-thumb.jpg
- metadata: artifacts/images.json

Matching
- Use perceptual hash (pHash) by default.
- Optional: enable local embedding service and set env var:
  LOCAL_EMBEDDING_URL=http://localhost:8000/embed
- Auto-assign threshold default = 0.90 (set via options to matchImageToLibrary)

How to test locally (synthetic)
```bash
node tests/simple-extract-match.test.js
```

Configuration
- Auto-assign threshold and embedding usage live in the matching options or via env variables.
- For video usage: the script produces web-derivative JPEGs sized at 1920px width by default (good for YouTube editors). Keep PNG masters for archival.

Troubleshooting
- If extraction reports "install poppler", ensure `pdfimages` or `pdftoppm` is on PATH.
- If image hashing fails, ensure `image-hash` dependencies are installed (`npm i image-hash jimp`).
- To enable embeddings, run a local embedding service that accepts base64-encoded images and returns a JSON embedding vector.

Contact
- Add infra/network contacts here for CI package installs.