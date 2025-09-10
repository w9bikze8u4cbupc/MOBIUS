const fs = require('fs');
const path = require('path');

// Create baseline frames for all OSes
const game = process.env.GAME || 'space-invaders';
const osList = ['windows', 'macos', 'linux'];

// Create a simple placeholder image (1x1 PNG)
const placeholderPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');

osList.forEach(os => {
  const baselineDir = path.join('tests', 'golden', game, os);
  
  // Create the directory if it doesn't exist
  if (!fs.existsSync(baselineDir)) {
    fs.mkdirSync(baselineDir, { recursive: true });
  }
  
  // Create baseline frames
  ['5s', '10s', '20s'].forEach(time => {
    const baselinePath = path.join(baselineDir, `baseline_${time}.png`);
    if (!fs.existsSync(baselinePath)) {
      fs.writeFileSync(baselinePath, placeholderPng);
      console.log(`Created baseline frame: ${baselinePath}`);
    }
  });
});

console.log(`Baseline frames created for ${game} on all OSes`);