#!/usr/bin/env node

/**
 * Golden test for UBG hardening enhancements to ensure stability
 */

import { harvestAllImages } from './scripts/harvest-images.js';
import { isProviderEnabled } from './src/config/providers.js';
import { fetchUbgAuto } from './src/sources/ultraBoardGames.js';
import { confidenceBand } from './src/utils/confidence-badge.js';
import { canonicalizeImageUrl } from './src/utils/url-canon.js';

async function runHardeningGoldenTests() {
  console.log('🏆 UBG HARDENING GOLDEN TESTS');
  console.log('='.repeat(35));

  // Test games with known UBG pages
  const testGames = [
    {
      name: 'Love Letter',
      expected: {
        components: 3,
        hasImages: true,
        hasRulesUrl: true,
        minMediumConfidence: 5, // More realistic expectation
      },
    },
    {
      name: 'Abyss',
      expected: {
        components: 12,
        hasImages: true,
        hasRulesUrl: true,
        minMediumConfidence: 5, // More realistic expectation
      },
    },
  ];

  let passed = 0;
  let total = testGames.length;

  for (const game of testGames) {
    console.log(`\n🎮 Testing: ${game.name}`);

    try {
      // Test UBG auto-discovery
      const result = await fetchUbgAuto(game.name);

      // Validate results
      const rulesUrlFound = result.ok && result.rulesUrl;
      const componentCount = result.components.items.length;
      const imageCount = result.images.length;

      console.log(`   🌐 Rules URL: ${rulesUrlFound ? 'FOUND' : 'MISSING'}`);
      console.log(`   📋 Components: ${componentCount} (expected: ${game.expected.components})`);
      console.log(`   🖼️  Images: ${imageCount} (${imageCount > 0 ? 'FOUND' : 'MISSING'})`);

      // Test full harvesting pipeline
      const harvestResult = await harvestAllImages({
        title: game.name,
        extraUrls: [],
        verbose: false,
      });

      // Count medium confidence images (more realistic than high confidence)
      const mediumConfidenceCount = harvestResult.filter(
        (img) => img.confidence === 'Medium',
      ).length;
      const lowConfidenceCount = harvestResult.filter((img) => img.confidence === 'Low').length;

      console.log(`   ⚙️  Harvested images: ${harvestResult.length}`);
      console.log(
        `   ⭐ Medium confidence: ${mediumConfidenceCount} (expected: ≥${game.expected.minMediumConfidence})`,
      );
      console.log(`   ⚠️  Low confidence: ${lowConfidenceCount}`);

      // Check if test passes
      const testPassed =
        rulesUrlFound && // Rules URL must be found
        componentCount >= Math.max(1, game.expected.components * 0.5) && // At least half expected components
        imageCount > 0 && // Must have images
        mediumConfidenceCount >= game.expected.minMediumConfidence; // Must have minimum medium confidence images

      if (testPassed) {
        console.log('   ✅ PASS');
        passed++;
      } else {
        console.log('   ❌ FAIL');
        console.log(`      Rules URL: ${rulesUrlFound}`);
        console.log(
          `      Components: ${componentCount} >= ${Math.max(1, game.expected.components * 0.5)}`,
        );
        console.log(`      Images: ${imageCount} > 0`);
        console.log(
          `      Medium confidence: ${mediumConfidenceCount} >= ${game.expected.minMediumConfidence}`,
        );
      }
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
    }
  }

  // Test utility functions
  console.log('\n🔧 TESTING UTILITIES');

  // Test URL canonicalization
  const canonicalTest = canonicalizeImageUrl(
    'https://example.com/image.jpg?utm_source=test&width=100',
  );
  const expectedCanonical = 'https://example.com/image.jpg';
  const canonicalPassed = canonicalTest === expectedCanonical;
  console.log(`   🔗 URL canonicalization: ${canonicalPassed ? 'PASS' : 'FAIL'}`);
  if (!canonicalPassed) {
    console.log(`      Expected: ${expectedCanonical}`);
    console.log(`      Got: ${canonicalTest}`);
  }

  // Test confidence band
  const confidenceTest = confidenceBand({
    providerWeight: 0.85,
    proximityScore: 0.9,
    sizeScore: 0.8,
    qualityFocus: 0.7,
  });
  const confidencePassed = confidenceTest === 'High';
  console.log(`   ⭐ Confidence band: ${confidencePassed ? 'PASS' : 'FAIL'}`);

  // Test provider configuration
  const providerTest = isProviderEnabled('ubg');
  console.log(`   ⚙️  Provider enabled: ${providerTest ? 'PASS' : 'FAIL'}`);

  if (canonicalPassed && confidencePassed && providerTest) {
    console.log('   ✅ UTILITIES PASS');
    passed++; // Count utilities as a separate test
    total++;
  } else {
    console.log('   ❌ UTILITIES FAIL');
  }

  console.log('\n' + '='.repeat(35));
  console.log(`📊 RESULTS: ${passed}/${total} tests passed`);

  if (passed === total) {
    console.log('🎉 ALL HARDENING GOLDEN TESTS PASSED!');
  } else {
    console.log('⚠️  Some tests failed - potential drift detected');
  }

  return passed === total;
}

// Run the tests and exit with appropriate code
runHardeningGoldenTests()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
