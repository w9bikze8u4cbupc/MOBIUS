#!/usr/bin/env node

// Generate asset provenance metadata
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

// Function to generate SHA256 hash of a file
function generateSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// Function to generate metadata for an asset
async function generateMetadata(assetPath, sourceUrl, license) {
  try {
    const stats = fs.statSync(assetPath);
    const sha256 = await generateSha256(assetPath);

    const metadata = {
      source_url: sourceUrl || 'unknown',
      license: license || 'unknown',
      sha256: sha256,
      created_at: stats.birthtime.toISOString(),
      modified_at: stats.mtime.toISOString(),
      size_bytes: stats.size,
    };

    return metadata;
  } catch (error) {
    console.error(`Error generating metadata for ${assetPath}:`, error);
    return null;
  }
}

// Function to process a directory and generate metadata for assets
async function processDirectory(dirPath) {
  try {
    const files = fs.readdirSync(dirPath);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        // Recursively process subdirectories
        await processDirectory(filePath);
      } else if (stat.isFile() && !file.endsWith('.meta.json')) {
        // Generate metadata for asset files
        const metaPath = filePath + '.meta.json';

        // Check if metadata already exists
        if (!fs.existsSync(metaPath)) {
          console.log(`Generating metadata for ${filePath}`);
          const metadata = await generateMetadata(filePath, 'unknown', 'unknown');

          if (metadata) {
            fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
            console.log(`  ✅ Created ${metaPath}`);
          }
        } else {
          console.log(`  ℹ️  Metadata already exists for ${filePath}`);
        }
      }
    }
  } catch (error) {
    console.error(`Error processing directory ${dirPath}:`, error);
  }
}

// Main function
async function main() {
  const directories = ['./uploads', './output', './out', './dist'];

  console.log('Generating asset provenance metadata...\n');

  for (const dir of directories) {
    if (fs.existsSync(dir)) {
      console.log(`Processing ${dir}...`);
      await processDirectory(dir);
    } else {
      console.log(`Directory ${dir} does not exist, skipping...`);
    }
  }

  console.log('\n✅ Asset provenance metadata generation complete');
}

// Run the script
main().catch(console.error);
