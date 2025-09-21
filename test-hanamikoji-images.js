import { harvestImagesFromExtraUrls } from './scripts/harvest-images.js';

/**
 * Test the image harvester with Hanamikoji URLs
 */
async function testHanamikojiImages() {
  console.log('🧪 HANAMIKOJI IMAGE HARVEST TEST');
  console.log('='.repeat(40));

  // Test URLs for Hanamikoji
  const extraUrls = [
    'https://www.ultraboardgames.com/hanamikoji/game-rules.php',
    'https://en.emperors4.com/game/hanamikoji',
  ];

  // Canonical component labels for Hanamikoji
  const labels = ['Game board', 'Geisha cards', 'Item cards', 'Action markers', 'Victory markers'];

  console.log('🔍 Testing image harvest for Hanamikoji...');
  console.log(`🔗 URLs: ${extraUrls.join(', ')}`);
  console.log(`🏷️  Labels: ${labels.join(', ')}`);

  try {
    const results = await harvestImagesFromExtraUrls(extraUrls, {
      base: '',
      labels,
      verbose: true,
    });

    console.log('\n📊 HARVEST RESULTS:');
    console.log(`Found images from ${results.length} URLs`);

    for (const result of results) {
      console.log(`\n🌐 ${result.url}:`);
      console.log(`   Total images: ${result.images.all.length}`);

      for (const [label, images] of Object.entries(result.images.byLabel)) {
        if (images.length > 0) {
          console.log(`   ${label}: ${images.length} images`);
          images.forEach((img, i) => {
            console.log(`     ${i + 1}. ${img.url} (boost: ${img.vicinityBoost})`);
          });
        }
      }
    }

    console.log('\n🎉 HANAMIKOJI IMAGE HARVEST TEST COMPLETE');
    return results;
  } catch (error) {
    console.error('❌ Error during image harvest:', error.message);
    return [];
  }
}

// Run the test
testHanamikojiImages();
