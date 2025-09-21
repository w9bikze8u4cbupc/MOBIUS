#!/usr/bin/env node

/**
 * Golden test for UBG adapter to ensure stability and detect drift
 */

import { fetchUbgAuto } from './src/sources/ultraBoardGames.js';
import { loadGameProfile } from './src/utils/game-profiles.js';

async function runGoldenTests() {
  console.log('🏆 UBG GOLDEN TESTS');
  console.log('='.repeat(30));

  // Test games with known UBG pages
  const testGames = [
    {
      name: 'Love Letter',
      expected: {
        components: 3,
        hasImages: true,
        hasRulesUrl: true,
      },
    },
    {
      name: 'Abyss',
      expected: {
        components: 12,
        hasImages: true,
        hasRulesUrl: true,
      },
    },
    {
      name: 'Hanamikoji',
      expected: {
        components: 5,
        hasImages: true,
        hasRulesUrl: true,
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

      // Check if test passes (more lenient criteria)
      const testPassed =
        rulesUrlFound && // Rules URL must be found
        componentCount >= Math.max(1, game.expected.components * 0.5) && // At least half expected components
        imageCount > 0; // Must have images

      if (testPassed) {
        console.log('   ✅ PASS');
        passed++;
      } else {
        console.log('   ❌ FAIL');
      }

      // Test game profile loading
      const profile = await loadGameProfile(game.name);
      console.log(`   🎯 Profile: ${profile.allowlist.length} allowlist terms`);
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(30));
  console.log(`📊 RESULTS: ${passed}/${total} tests passed`);

  if (passed === total) {
    console.log('🎉 ALL GOLDEN TESTS PASSED!');
  } else {
    console.log('⚠️  Some tests failed - potential drift detected');
  }

  return passed === total;
}

// Run the tests and exit with appropriate code
runGoldenTests()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
