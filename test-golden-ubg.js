#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { harvestAllImages } from './scripts/harvest-images.js';
import { loadGameProfile } from './src/utils/game-profiles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GOLDEN_TESTS_DIR = path.join(__dirname, 'golden-tests');
if (!fs.existsSync(GOLDEN_TESTS_DIR)) {
  fs.mkdirSync(GOLDEN_TESTS_DIR, { recursive: true });
}

// Games to test for golden tests
const TEST_GAMES = [
  { name: 'Abyss', expectedComponents: 20 }, // Approximate expected component types
  { name: 'Hanamikoji', expectedComponents: 5 },
  { name: 'Love Letter', expectedComponents: 3 }
];

async function runGoldenTests() {
  console.log('🔍 Running Golden Tests for UBG Pipeline...');
  
  for (const game of TEST_GAMES) {
    console.log(`\n🎮 Testing: ${game.name}`);
    
    try {
      // Load game profile
      const profile = await loadGameProfile(game.name);
      console.log(`📋 Profile loaded with ${profile.allowlist.length} allowlist terms`);
      
      // Harvest images
      const results = await harvestAllImages({
        title: game.name,
        extraUrls: [],
        verbose: false
      });
      
      console.log(`📊 Found ${results.length} images`);
      
      // Validate results
      const validationResult = validateResults(game, results, profile);
      
      // Save golden test data
      const testData = {
        timestamp: new Date().toISOString(),
        game: game.name,
        imageCount: results.length,
        providerDistribution: getProviderDistribution(results),
        topImages: results.slice(0, 3).map(img => ({
          url: img.url,
          provider: img.provider,
          score: img.finalScore,
          width: img.width,
          height: img.height
        })),
        validation: validationResult
      };
      
      const testFile = path.join(GOLDEN_TESTS_DIR, `${game.name.toLowerCase().replace(/\s+/g, '-')}.json`);
      fs.writeFileSync(testFile, JSON.stringify(testData, null, 2));
      console.log(`💾 Golden test data saved to ${testFile}`);
      
      // Check for drift
      if (fs.existsSync(testFile)) {
        const previousData = JSON.parse(fs.readFileSync(testFile, 'utf8'));
        const drift = detectDrift(previousData, testData);
        if (drift.hasDrift) {
          console.log(`⚠️  Drift detected in ${game.name}:`);
          drift.changes.forEach(change => console.log(`   ${change}`));
        } else {
          console.log(`✅ No drift detected in ${game.name}`);
        }
      }
      
    } catch (error) {
      console.error(`❌ Failed to test ${game.name}:`, error.message);
    }
  }
  
  console.log('\n🏁 Golden tests complete!');
}

function getProviderDistribution(images) {
  const distribution = {};
  images.forEach(img => {
    distribution[img.provider] = (distribution[img.provider] || 0) + 1;
  });
  return distribution;
}

function validateResults(game, results, profile) {
  const issues = [];
  
  // Check minimum image count
  if (results.length < 2) {
    issues.push(`Low image count: ${results.length} (expected > 2)`);
  }
  
  // Check provider diversity
  const providers = new Set(results.map(img => img.provider));
  if (providers.size < 1) {
    issues.push(`Low provider diversity: ${providers.size} providers`);
  }
  
  // Check for component terms in alt text
  const componentMentions = results.filter(img => 
    profile.allowlist.some(term => (img.alt || '').toLowerCase().includes(term))
  ).length;
  
  if (componentMentions < results.length * 0.3) {
    issues.push(`Low component relevance: ${componentMentions}/${results.length} images`);
  }
  
  return {
    valid: issues.length === 0,
    issues,
    imageCount: results.length,
    providerCount: providers.size,
    componentMentions
  };
}

function detectDrift(previous, current) {
  const changes = [];
  
  // Compare image counts
  if (previous.imageCount !== current.imageCount) {
    changes.push(`Image count changed: ${previous.imageCount} → ${current.imageCount}`);
  }
  
  // Compare provider distributions
  const prevProviders = previous.providerDistribution || {};
  const currProviders = current.providerDistribution || {};
  
  Object.keys(prevProviders).forEach(provider => {
    if (currProviders[provider] !== prevProviders[provider]) {
      changes.push(`Provider ${provider} count changed: ${prevProviders[provider]} → ${currProviders[provider]}`);
    }
  });
  
  // Check for new providers
  Object.keys(currProviders).forEach(provider => {
    if (!prevProviders[provider]) {
      changes.push(`New provider detected: ${provider} (${currProviders[provider]} images)`);
    }
  });
  
  return {
    hasDrift: changes.length > 0,
    changes
  };
}

runGoldenTests();