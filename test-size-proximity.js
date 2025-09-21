import { harvestAllImages } from './scripts/harvest-images.js';

async function testSizeProximity() {
  console.log('🔍 Testing Size and Proximity Enhancements...');

  const result = await harvestAllImages({
    title: 'Abyss',
    verbose: false,
  });

  console.log(`📊 Found ${result.images.length} images`);

  // Check if we have meaningful size and proximity data
  let sizeOk = 0;
  let proximityOk = 0;

  result.images.forEach((img, i) => {
    if (img.scores?.sizeScore > 0) sizeOk++;
    if (img.scores?.proximityScore > 0) proximityOk++;

    if (i < 3) {
      console.log(`\n🖼️  Image ${i + 1}: ${img.url}`);
      console.log(
        `   Size: ${img.scores?.sizeScore?.toFixed(4) || 'N/A'} (${img.width || img.w}x${img.height || img.h})`,
      );
      console.log(
        `   Proximity: ${img.scores?.proximityScore?.toFixed(4) || 'N/A'} (distance: ${img.sectionDistance})`,
      );
      console.log(`   Final Score: ${img.finalScore?.toFixed(4) || 'N/A'}`);
      console.log(`   Confidence: ${img.confidence || 'N/A'}`);
    }
  });

  console.log(`\n✅ Size data OK: ${sizeOk}/${result.images.length}`);
  console.log(`✅ Proximity data OK: ${proximityOk}/${result.images.length}`);

  if (sizeOk > 0 && proximityOk > 0) {
    console.log('🎉 Size and proximity enhancements are working correctly!');
  } else {
    console.log('❌ Size and proximity enhancements need more work.');
  }

  // Test with probing enabled
  console.log('\n🔍 Testing with UBG_PROBE_SIZE=1...');
  process.env.UBG_PROBE_SIZE = '1';

  // Re-import to get fresh module with env var set
  const { harvestAllImages: harvestAllImagesWithProbing } = await import(
    './scripts/harvest-images.js'
  );

  try {
    const resultWithProbing = await harvestAllImagesWithProbing({
      title: 'Abyss',
      verbose: false,
    });

    console.log(`📊 Found ${resultWithProbing.images.length} images with probing`);

    // Show first few images with probing
    resultWithProbing.images.slice(0, 3).forEach((img, i) => {
      console.log(`\n🖼️  Image ${i + 1} (with probing): ${img.url}`);
      console.log(
        `   Size: ${img.scores?.sizeScore?.toFixed(4) || 'N/A'} (${img.width || img.w}x${img.height || img.h})`,
      );
      console.log(
        `   Proximity: ${img.scores?.proximityScore?.toFixed(4) || 'N/A'} (distance: ${img.sectionDistance})`,
      );
    });
  } catch (error) {
    console.log(`⚠️  Probing test failed: ${error.message}`);
  }
}

testSizeProximity().catch(console.error);
