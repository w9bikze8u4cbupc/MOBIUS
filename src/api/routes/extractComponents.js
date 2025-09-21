// src/api/extractComponents.js
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const express = require('express');
const multer = require('multer');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/extract-components', upload.single('pdf'), async (req, res) => {
  try {
    const pdfPath = req.file.path;

    // 1. Convert PDF to images
    await execPromise(`python3 pdf_to_images.py ${pdfPath}`);

    // 2. Run detection on each image (assuming images are saved in pdf_images/)
    const imageFiles = fs.readdirSync('pdf_images').filter((f) => f.endsWith('.png'));
    for (const imageFile of imageFiles) {
      await execPromise(`python3 detect_components.py pdf_images/${imageFile}`);
    }

    // 3. Crop detected regions (assuming detection JSON is saved per image)
    for (const imageFile of imageFiles) {
      const jsonFile = imageFile.replace('.png', '.json');
      await execPromise(`node crop_detections.mjs pdf_images/${imageFile} detections/${jsonFile}`);
    }

    // 4. Collect cropped images (assuming output/ folder)
    const croppedImages = fs.readdirSync('output').map((f) => path.join('output', f));

    // 5. Return results
    res.json({ croppedImages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) reject(stderr);
      else resolve(stdout);
    });
  });
}

module.exports = router;
