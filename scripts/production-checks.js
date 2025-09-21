#!/usr/bin/env node

// Production readiness verification script
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🚀 Starting Production Polish Verification...\n');

// 1. Log Rotation (PM2)
console.log('1. Checking PM2 Log Rotation...');
try {
  execSync('pm2 list', { stdio: 'pipe' });
  console.log('   ✅ PM2 is installed and running');

  // Check if pm2-logrotate is installed
  const modules = execSync('pm2 list', { encoding: 'utf8' });
  if (modules.includes('pm2-logrotate')) {
    console.log('   ✅ pm2-logrotate is installed');
  } else {
    console.log('   ⚠️  pm2-logrotate not installed (install with: pm2 install pm2-logrotate)');
  }
} catch (error) {
  console.log('   ❌ PM2 not available');
}

// 2. Prometheus Metrics
console.log('\n2. Checking Prometheus Metrics...');
try {
  const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
  if (packageJson.dependencies && packageJson.dependencies['prom-client']) {
    console.log('   ✅ prom-client is installed');
  } else {
    console.log('   ⚠️  prom-client not installed (install with: npm install prom-client)');
  }
} catch (error) {
  console.log('   ❌ Unable to check prom-client installation');
}

// 3. CI Environments
console.log('\n3. Checking CI Environment Configuration...');
const isCI = process.env.CI || process.env.GITHUB_ACTIONS;
console.log(
  `   CI Environment: ${isCI ? '✅ Detected' : 'ℹ️  Not detected (set CI=1 for strict mode)'}`,
);

// 4. PM2 Production Profile
console.log('\n4. Checking PM2 Production Profile...');
try {
  if (fs.existsSync('./ecosystem.config.js')) {
    console.log('   ✅ ecosystem.config.js found');
  } else {
    console.log('   ⚠️  ecosystem.config.js not found (needed for PM2 production profile)');
  }
} catch (error) {
  console.log('   ❌ Unable to check ecosystem.config.js');
}

// 5. Asset Provenance
console.log('\n5. Checking Asset Provenance...');
try {
  const uploadDir = './uploads';
  if (fs.existsSync(uploadDir)) {
    const files = fs.readdirSync(uploadDir);
    const metaFiles = files.filter((f) => f.endsWith('.meta.json'));
    const allFiles = files.filter(
      (f) =>
        !f.endsWith('.meta.json') &&
        (f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.mp4') || f.endsWith('.wav')),
    );

    console.log(`   Found ${allFiles.length} assets and ${metaFiles.length} metadata files`);
    if (allFiles.length > 0) {
      const coverage = Math.round((metaFiles.length / allFiles.length) * 100);
      console.log(`   📊 Metadata coverage: ${coverage}%`);
    }
  } else {
    console.log('   ℹ️  Uploads directory not found');
  }
} catch (error) {
  console.log('   ❌ Unable to check asset provenance');
}

// 6. Schema Validation
console.log('\n6. Checking Schema Validation Scripts...');
try {
  if (fs.existsSync('./scripts/validate-schema-strict.js')) {
    console.log('   ✅ Schema validation script found');
  } else {
    console.log('   ⚠️  Schema validation script not found');
  }
} catch (error) {
  console.log('   ❌ Unable to check schema validation');
}

console.log('\n✅ Production Polish Verification Complete');
console.log('\n📝 Next steps:');
console.log('   Run individual checks with:');
console.log('   - npm run validate:storyboard');
console.log('   - npm run validate:timeline');
console.log('   - node scripts/cleanup.js --paths "src/api/uploads,dist" --ttlDays 7 --dryRun');
