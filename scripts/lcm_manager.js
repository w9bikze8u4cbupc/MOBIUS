#!/usr/bin/env node

/**
 * Low-Confidence Match Queue Management for MOBIUS DHash Pipeline
 * Handles export/import of images that need manual review due to low confidence matches
 */

const fs = require('fs');
const path = require('path');
const { DHashProcessor } = require('../src/dhash.js');

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--') || arg.startsWith('-')) {
      const key = arg.replace(/^-+/, '');
      const nextArg = argv[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        args[key] = nextArg;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  
  return args;
}

function printUsage(command) {
  if (command === 'export') {
    console.log(`
Usage: npm run lcm:export [options]

Export low-confidence matches for manual review.

Options:
  -i, --input <file>        Input library JSON file (required)
  -o, --output <file>       Output queue file (default: low-confidence-queue.json)
  --min-distance <num>      Minimum Hamming distance for low confidence (default: 8)
  --max-distance <num>      Maximum Hamming distance for low confidence (default: 15)
  --format <type>           Output format: json|csv|html (default: json)
  --include-images          Copy image files to review directory
  --review-dir <dir>        Directory for review files (default: ./lcm-review)

Examples:
  npm run lcm:export -i library.dhash.json
  npm run lcm:export -i library.dhash.json --min-distance 6 --max-distance 12
  npm run lcm:export -i library.dhash.json --include-images --review-dir ./manual-review
  `);
  } else if (command === 'import') {
    console.log(`
Usage: npm run lcm:import [options]

Import manually reviewed low-confidence matches back into the library.

Options:
  -i, --input <file>        Input library JSON file (required)
  -q, --queue <file>        Reviewed queue file (required)
  -o, --output <file>       Output library file (default: input file)
  --backup                  Create backup before import
  --validate-only           Only validate queue file without importing

Examples:
  npm run lcm:import -i library.dhash.json -q reviewed-queue.json
  npm run lcm:import -i library.dhash.json -q reviewed-queue.json --backup
  npm run lcm:import -q reviewed-queue.json --validate-only
  `);
  } else {
    console.log(`
Low-Confidence Match Queue Management

Available commands:
  npm run lcm:export    Export low-confidence matches for manual review
  npm run lcm:import    Import manually reviewed matches back to library

Use --help with a command for detailed usage information.
  `);
  }
}

/**
 * Find all potential matches within confidence thresholds
 */
function findLowConfidenceMatches(library, minDistance = 8, maxDistance = 15) {
  const processor = new DHashProcessor();
  const matches = [];
  const processed = new Set(); // Avoid duplicate pairs
  
  console.log(`Scanning for low-confidence matches (distance ${minDistance}-${maxDistance})...`);
  
  const imagesWithHashes = library.images.filter(img => img.dhash);
  
  for (let i = 0; i < imagesWithHashes.length; i++) {
    for (let j = i + 1; j < imagesWithHashes.length; j++) {
      const img1 = imagesWithHashes[i];
      const img2 = imagesWithHashes[j];
      
      const pairKey = [img1.filename, img2.filename].sort().join('|');
      if (processed.has(pairKey)) continue;
      processed.add(pairKey);
      
      const distance = processor.compareHashes(img1.dhash, img2.dhash);
      
      if (distance >= minDistance && distance <= maxDistance) {
        matches.push({
          id: `${img1.filename}_${img2.filename}_${distance}`,
          image1: {
            filename: img1.filename,
            path: img1.path,
            dhash: img1.dhash
          },
          image2: {
            filename: img2.filename,
            path: img2.path,
            dhash: img2.dhash
          },
          hammingDistance: distance,
          confidence: 'low',
          needsReview: true,
          reviewStatus: 'pending',
          reviewNotes: '',
          isDuplicate: null, // To be filled by human reviewer
          keepImage: null,   // Which image to keep if duplicate
          createdAt: new Date().toISOString()
        });
      }
    }
    
    if ((i + 1) % 100 === 0) {
      console.log(`Processed ${i + 1}/${imagesWithHashes.length} images...`);
    }
  }
  
  console.log(`Found ${matches.length} low-confidence matches`);
  return matches;
}

/**
 * Export matches to various formats
 */
async function exportMatches(matches, outputPath, format = 'json', options = {}) {
  const { includeImages, reviewDir } = options;
  
  if (includeImages && reviewDir) {
    await fs.promises.mkdir(reviewDir, { recursive: true });
    console.log(`Created review directory: ${reviewDir}`);
  }
  
  // Copy images if requested
  if (includeImages && reviewDir) {
    const imagesDir = path.join(reviewDir, 'images');
    await fs.promises.mkdir(imagesDir, { recursive: true });
    
    for (const match of matches) {
      for (const img of [match.image1, match.image2]) {
        const sourcePath = path.resolve(img.path);
        const destPath = path.join(imagesDir, img.filename);
        
        if (fs.existsSync(sourcePath) && !fs.existsSync(destPath)) {
          await fs.promises.copyFile(sourcePath, destPath);
        }
      }
    }
    console.log(`Copied ${matches.length * 2} images to review directory`);
  }
  
  // Export in requested format
  if (format === 'json') {
    const queueData = {
      exportedAt: new Date().toISOString(),
      totalMatches: matches.length,
      reviewInstructions: {
        isDuplicate: 'Set to true if images are duplicates, false if different',
        keepImage: 'If duplicate, specify filename of image to keep',
        reviewStatus: 'Set to "approved", "rejected", or "skip"',
        reviewNotes: 'Optional notes about the decision'
      },
      matches: matches
    };
    
    await fs.promises.writeFile(outputPath, JSON.stringify(queueData, null, 2));
    
  } else if (format === 'csv') {
    const csv = [
      'ID,Image1,Image2,HammingDistance,IsDuplicate,KeepImage,ReviewStatus,ReviewNotes'
    ];
    
    matches.forEach(match => {
      csv.push([
        match.id,
        match.image1.filename,
        match.image2.filename,
        match.hammingDistance,
        match.isDuplicate || '',
        match.keepImage || '',
        match.reviewStatus,
        match.reviewNotes.replace(/"/g, '""')
      ].map(field => `"${field}"`).join(','));
    });
    
    await fs.promises.writeFile(outputPath, csv.join('\n'));
    
  } else if (format === 'html') {
    const html = generateReviewHTML(matches, options);
    await fs.promises.writeFile(outputPath, html);
  }
  
  console.log(`✓ Exported ${matches.length} matches to ${outputPath} (${format})`);
}

/**
 * Generate HTML review interface
 */
function generateReviewHTML(matches, options = {}) {
  const { includeImages, reviewDir } = options;
  const imagesPath = includeImages ? './images/' : '';
  
  return `<!DOCTYPE html>
<html>
<head>
    <title>Low-Confidence Match Review</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .match { border: 1px solid #ddd; margin: 20px 0; padding: 15px; }
        .match-header { font-weight: bold; margin-bottom: 10px; }
        .images { display: flex; gap: 20px; align-items: center; }
        .image-container { text-align: center; }
        .image-container img { max-width: 200px; max-height: 200px; border: 1px solid #ccc; }
        .controls { margin-top: 15px; }
        .controls label { display: block; margin: 5px 0; }
        .distance-high { color: #ff6600; }
        .distance-medium { color: #ffcc00; }
        .distance-low { color: #00cc00; }
        .export-btn { background: #007cba; color: white; padding: 10px 20px; border: none; cursor: pointer; margin: 10px 0; }
    </style>
</head>
<body>
    <h1>Low-Confidence Match Review</h1>
    <p>Review ${matches.length} potential duplicate pairs. Mark each pair as duplicate or different.</p>
    
    <button class="export-btn" onclick="exportResults()">Export Review Results</button>
    
    <div id="matches">
`;

  matches.forEach((match, index) => {
    const distanceClass = match.hammingDistance > 12 ? 'distance-high' : 
                         match.hammingDistance > 10 ? 'distance-medium' : 'distance-low';
    
    html += `
        <div class="match" data-id="${match.id}">
            <div class="match-header">
                Match ${index + 1}: Hamming Distance <span class="${distanceClass}">${match.hammingDistance}</span>
            </div>
            
            <div class="images">
                <div class="image-container">
                    <img src="${imagesPath}${match.image1.filename}" alt="${match.image1.filename}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBmb3VuZDwvdGV4dD48L3N2Zz4='" />
                    <div><strong>${match.image1.filename}</strong></div>
                    <div>Hash: ${match.image1.dhash}</div>
                </div>
                
                <div style="font-size: 24px; color: #666;">vs</div>
                
                <div class="image-container">
                    <img src="${imagesPath}${match.image2.filename}" alt="${match.image2.filename}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBmb3VuZDwvdGV4dD48L3N2Zz4='" />
                    <div><strong>${match.image2.filename}</strong></div>
                    <div>Hash: ${match.image2.dhash}</div>
                </div>
            </div>
            
            <div class="controls">
                <label>
                    <input type="radio" name="duplicate_${index}" value="false" checked> These are different images
                </label>
                <label>
                    <input type="radio" name="duplicate_${index}" value="true"> These are duplicates
                </label>
                
                <div id="keep_options_${index}" style="display: none; margin-left: 20px;">
                    Keep which image?
                    <label><input type="radio" name="keep_${index}" value="${match.image1.filename}"> ${match.image1.filename}</label>
                    <label><input type="radio" name="keep_${index}" value="${match.image2.filename}"> ${match.image2.filename}</label>
                </div>
                
                <label>
                    Review Status:
                    <select name="status_${index}">
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="skip">Skip</option>
                    </select>
                </label>
                
                <label>
                    Notes: <input type="text" name="notes_${index}" style="width: 300px;" placeholder="Optional review notes" />
                </label>
            </div>
        </div>
    `;
  });

  html += `
    </div>
    
    <button class="export-btn" onclick="exportResults()">Export Review Results</button>
    
    <script>
        // Show/hide keep options based on duplicate selection
        document.addEventListener('change', function(e) {
            if (e.target.name && e.target.name.startsWith('duplicate_')) {
                const index = e.target.name.split('_')[1];
                const keepOptions = document.getElementById('keep_options_' + index);
                keepOptions.style.display = e.target.value === 'true' ? 'block' : 'none';
            }
        });
        
        function exportResults() {
            const results = {
                reviewedAt: new Date().toISOString(),
                matches: []
            };
            
            document.querySelectorAll('.match').forEach((match, index) => {
                const isDuplicate = document.querySelector('input[name="duplicate_' + index + '"]:checked').value === 'true';
                const keepImage = isDuplicate ? (document.querySelector('input[name="keep_' + index + '"]:checked')?.value || '') : '';
                const reviewStatus = document.querySelector('select[name="status_' + index + '"]').value;
                const reviewNotes = document.querySelector('input[name="notes_' + index + '"]').value;
                
                results.matches.push({
                    id: match.dataset.id,
                    isDuplicate: isDuplicate,
                    keepImage: keepImage,
                    reviewStatus: reviewStatus,
                    reviewNotes: reviewNotes
                });
            });
            
            const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'reviewed-queue.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    </script>
</body>
</html>`;

  return html;
}

async function exportLowConfidenceQueue(inputPath, options = {}) {
  const {
    outputPath = 'low-confidence-queue.json',
    minDistance = 8,
    maxDistance = 15,
    format = 'json',
    includeImages = false,
    reviewDir = './lcm-review'
  } = options;
  
  console.log(`Loading library: ${inputPath}`);
  const library = JSON.parse(await fs.promises.readFile(inputPath, 'utf8'));
  
  const matches = findLowConfidenceMatches(library, minDistance, maxDistance);
  
  if (matches.length === 0) {
    console.log('No low-confidence matches found.');
    return;
  }
  
  await exportMatches(matches, outputPath, format, { includeImages, reviewDir });
  
  console.log(`\n=== Export Summary ===`);
  console.log(`Total matches exported: ${matches.length}`);
  console.log(`Distance range: ${minDistance} - ${maxDistance}`);
  console.log(`Output file: ${outputPath}`);
  console.log(`Format: ${format}`);
  if (includeImages) {
    console.log(`Images copied to: ${reviewDir}/images/`);
  }
}

async function importReviewedQueue(inputPath, queuePath, options = {}) {
  const { outputPath = inputPath, backup = false, validateOnly = false } = options;
  
  console.log(`Loading reviewed queue: ${queuePath}`);
  const reviewData = JSON.parse(await fs.promises.readFile(queuePath, 'utf8'));
  
  if (!reviewData.matches || !Array.isArray(reviewData.matches)) {
    throw new Error('Invalid queue file format');
  }
  
  console.log(`Validating ${reviewData.matches.length} reviewed matches...`);
  
  const validatedMatches = [];
  const errors = [];
  
  reviewData.matches.forEach((match, index) => {
    if (!match.id) {
      errors.push(`Match ${index}: Missing ID`);
      return;
    }
    
    if (match.isDuplicate === null || match.isDuplicate === undefined) {
      errors.push(`Match ${index}: Missing isDuplicate decision`);
      return;
    }
    
    if (match.isDuplicate && !match.keepImage) {
      errors.push(`Match ${index}: Marked as duplicate but no keepImage specified`);
      return;
    }
    
    if (!['pending', 'approved', 'rejected', 'skip'].includes(match.reviewStatus)) {
      errors.push(`Match ${index}: Invalid reviewStatus`);
      return;
    }
    
    validatedMatches.push(match);
  });
  
  console.log(`✓ Validated ${validatedMatches.length} matches`);
  
  if (errors.length > 0) {
    console.error(`\nValidation errors:`);
    errors.forEach(error => console.error(`  - ${error}`));
    throw new Error(`Queue validation failed with ${errors.length} errors`);
  }
  
  if (validateOnly) {
    console.log('Validation complete - queue file is valid');
    return;
  }
  
  // Load library and apply changes
  console.log(`Loading library: ${inputPath}`);
  const library = JSON.parse(await fs.promises.readFile(inputPath, 'utf8'));
  
  if (backup) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${inputPath}.lcm-backup.${timestamp}`;
    await fs.promises.copyFile(inputPath, backupPath);
    console.log(`✓ Created backup: ${backupPath}`);
  }
  
  // Process approved duplicates
  const approvedDuplicates = validatedMatches.filter(m => 
    m.isDuplicate && m.reviewStatus === 'approved'
  );
  
  let removedCount = 0;
  const removalLog = [];
  
  approvedDuplicates.forEach(match => {
    const [img1Name, img2Name] = match.id.split('_');
    const imageToRemove = img1Name === match.keepImage ? img2Name : img1Name;
    
    const imageIndex = library.images.findIndex(img => img.filename === imageToRemove);
    if (imageIndex !== -1) {
      const removedImage = library.images.splice(imageIndex, 1)[0];
      removedCount++;
      removalLog.push({
        removed: imageToRemove,
        kept: match.keepImage,
        reviewNotes: match.reviewNotes
      });
    }
  });
  
  // Add import metadata
  library.lcm_import = {
    importedAt: new Date().toISOString(),
    queueFile: queuePath,
    reviewedMatches: validatedMatches.length,
    approvedDuplicates: approvedDuplicates.length,
    imagesRemoved: removedCount,
    removalLog: removalLog
  };
  
  console.log(`Writing updated library to: ${outputPath}`);
  await fs.promises.writeFile(outputPath, JSON.stringify(library, null, 2));
  
  console.log(`\n=== Import Summary ===`);
  console.log(`Reviewed matches: ${validatedMatches.length}`);
  console.log(`Approved duplicates: ${approvedDuplicates.length}`);
  console.log(`Images removed: ${removedCount}`);
  console.log(`Library updated: ${outputPath}`);
  
  if (removalLog.length > 0) {
    console.log(`\nRemoved images:`);
    removalLog.forEach(log => {
      console.log(`  - Removed: ${log.removed} (kept: ${log.kept})`);
      if (log.reviewNotes) {
        console.log(`    Notes: ${log.reviewNotes}`);
      }
    });
  }
}

async function main() {
  const args = parseArgs();
  
  // Determine command from script name
  const scriptName = path.basename(process.argv[1], '.js');
  const command = scriptName.includes('export') ? 'export' : 
                  scriptName.includes('import') ? 'import' : null;
  
  if (args.help || args.h) {
    printUsage(command);
    process.exit(0);
  }
  
  const inputPath = args.input || args.i;
  
  try {
    if (command === 'export') {
      if (!inputPath) {
        console.error('Error: Input file is required for export\n');
        printUsage('export');
        process.exit(1);
      }
      
      await exportLowConfidenceQueue(inputPath, {
        outputPath: args.output || args.o,
        minDistance: parseInt(args['min-distance'] || '8'),
        maxDistance: parseInt(args['max-distance'] || '15'),
        format: args.format || 'json',
        includeImages: args['include-images'],
        reviewDir: args['review-dir'] || './lcm-review'
      });
      
    } else if (command === 'import') {
      const queuePath = args.queue || args.q;
      
      if (!queuePath) {
        console.error('Error: Queue file is required for import\n');
        printUsage('import');
        process.exit(1);
      }
      
      await importReviewedQueue(inputPath, queuePath, {
        outputPath: args.output || args.o,
        backup: args.backup,
        validateOnly: args['validate-only']
      });
      
    } else {
      console.error('Error: Unable to determine command\n');
      printUsage();
      process.exit(1);
    }
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { 
  main, 
  exportLowConfidenceQueue, 
  importReviewedQueue, 
  findLowConfidenceMatches 
};