#!/usr/bin/env node

import {
  loadGameProfile,
  normalizeComponentName,
  isSupplyOnly,
  validateComponentCounts,
} from './src/utils/game-profiles.js';

async function testGameProfiles() {
  console.log('🔍 Testing game profile functionality...');

  try {
    // Test loading a game profile
    const profile = await loadGameProfile('Love Letter');
    console.log('📋 Love Letter Profile:');
    console.log('   Allowlist:', profile.allowlist);
    console.log('   Synonyms:', Object.keys(profile.synonyms).length, 'entries');
    console.log('   Expected Counts:', Object.keys(profile.expectedCounts).length, 'entries');
    console.log('   Exclude Supply:', profile.excludeSupply);

    // Test component normalization
    console.log('\n🔄 Component Normalization Tests:');
    const testComponents = ['game cards', 'reference cards', 'tokens of affection', 'score marker'];

    testComponents.forEach((component) => {
      const normalized = normalizeComponentName(component, profile);
      const supplyOnly = isSupplyOnly(component, profile);
      console.log(`   "${component}" → "${normalized}" ${supplyOnly ? '(supply only)' : ''}`);
    });

    // Test validation
    console.log('\n✅ Component Validation Tests:');
    const sampleComponents = [
      { name: 'game cards', quantity: 16 },
      { name: 'reference cards', quantity: 4 },
      { name: 'tokens of affection', quantity: 1 },
    ];

    const validation = validateComponentCounts(sampleComponents, profile);
    console.log('   Validation Result:', validation.valid ? 'PASS' : 'FAIL');
    if (validation.issues.length > 0) {
      console.log('   Issues:');
      validation.issues.forEach((issue) => {
        console.log(
          `     - ${issue.type}: ${issue.component} (expected: ${issue.expected}, actual: ${issue.actual})`,
        );
      });
    }

    // Test a game without a specific profile
    console.log('\n📋 Testing game without specific profile (Abyss):');
    const abyssProfile = await loadGameProfile('Abyss');
    console.log('   Allowlist:', abyssProfile.allowlist.length, 'entries');
    console.log('   Synonyms:', Object.keys(abyssProfile.synonyms).length, 'entries');
  } catch (error) {
    console.error('❌ Game profile test failed:', error);
    process.exit(1);
  }
}

testGameProfiles();
