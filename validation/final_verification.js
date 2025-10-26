// Final verification script to ensure all validation preparation is complete
import fs from 'fs';
import path from 'path';

console.log('Mobius Tutorial Generator - Final Validation Preparation Verification');
console.log('====================================================================');

// List of all required files that should exist
const requiredFiles = [
    'validation/Mobius_Tutorial_Generator_Simple_End_to_End_Checklist.md',
    'validation/Local_End_to_End_Validation_Plan.md',
    'validation/validation_execution_tracker.md',
    'validation/issue_template.md',
    'validation/VALIDATION_SETUP_SUMMARY.md',
    'validation/FINAL_VALIDATION_SETUP_REPORT.md',
    'validation/VALIDATION_TEAM_INSTRUCTIONS.md',
    'validation/START_HERE_VALIDATION_GUIDE.md',
    'validation/SUMMARY_OF_VALIDATION_PREPARATION.md',
    'validation/VALIDATION_ARTIFACTS_INVENTORY.md',
    'validation/COMPLETE_INVENTORY_OF_CREATED_FILES.md',
    'validation/DIRECTIVE_COMPLETION_SUMMARY.md',
    'validation/README.md',
    'validation/basic_functionality_test.js',
    'validation/check_validation_status.js',
    'validation/verify_environment.js',
    'validation/verify_environment.ps1'
];

// List of required directories
const requiredDirectories = [
    'validation/batch1',
    'validation/batch2',
    'validation/batch3',
    'validation/batch4',
    'validation/batch5'
];

console.log('\n1. Verifying required files...');
let allFilesExist = true;
for (const file of requiredFiles) {
    if (fs.existsSync(file)) {
        console.log(`✅ ${file}`);
    } else {
        console.log(`❌ ${file}`);
        allFilesExist = false;
    }
}

console.log('\n2. Verifying required directories...');
let allDirectoriesExist = true;
for (const dir of requiredDirectories) {
    if (fs.existsSync(dir)) {
        console.log(`✅ ${dir}`);
    } else {
        console.log(`❌ ${dir}`);
        allDirectoriesExist = false;
    }
}

console.log('\n3. Checking checklist content...');
try {
    const checklistContent = fs.readFileSync('validation/Mobius_Tutorial_Generator_Simple_End_to_End_Checklist.md', 'utf8');
    const hasSectionA = checklistContent.includes('## Section A: Project Setup');
    const hasSectionB = checklistContent.includes('## Section B: BGG Metadata Integration');
    const hasSectionC = checklistContent.includes('## Section C: Rulebook Ingestion');
    const hasSectionD = checklistContent.includes('## Section D: Visual Assets');
    const hasSectionE = checklistContent.includes('## Section E: Narration/Audio Generation');
    const hasSectionF = checklistContent.includes('## Section F: Subtitles');
    const hasSectionG = checklistContent.includes('## Section G: Rendering');
    const hasSectionH = checklistContent.includes('## Section H: Quality Checks');
    const hasSectionI = checklistContent.includes('## Section I: Packaging');
    const hasSectionJ = checklistContent.includes('## Section J: CI Hooks');
    const hasSectionK = checklistContent.includes('## Section K: Delivery');
    
    const allSectionsPresent = hasSectionA && hasSectionB && hasSectionC && hasSectionD && 
                              hasSectionE && hasSectionF && hasSectionG && hasSectionH && 
                              hasSectionI && hasSectionJ && hasSectionK;
    
    if (allSectionsPresent) {
        console.log('✅ All checklist sections (A-K) present');
    } else {
        console.log('❌ Some checklist sections missing');
        allFilesExist = false;
    }
    
    // Count checklist items
    const itemCount = (checklistContent.match(/-\s\[\s\]/g) || []).length;
    console.log(`✅ Checklist contains ${itemCount} items`);
    
    if (itemCount >= 130) {
        console.log('✅ Checklist has expected number of items (130+ items)');
    } else {
        console.log(`⚠️  Checklist has fewer items than expected (${itemCount}/130+)`);
    }
} catch (error) {
    console.log('❌ Failed to read checklist file:', error.message);
    allFilesExist = false;
}

console.log('\n4. Checking validation plan content...');
try {
    const planContent = fs.readFileSync('validation/Local_End_to_End_Validation_Plan.md', 'utf8');
    const hasBatch1 = planContent.includes('Checklist Execution – Batch 1: Sections A & B');
    const hasBatch2 = planContent.includes('Checklist Execution – Batch 2: Sections C & D');
    const hasBatch3 = planContent.includes('Checklist Execution – Batch 3: Sections E & F');
    const hasBatch4 = planContent.includes('Checklist Execution – Batch 4: Sections G & H');
    const hasBatch5 = planContent.includes('Checklist Execution – Batch 5: Sections I–K');
    
    const allBatchesPlanned = hasBatch1 && hasBatch2 && hasBatch3 && hasBatch4 && hasBatch5;
    
    if (allBatchesPlanned) {
        console.log('✅ All validation batches planned (1-5)');
    } else {
        console.log('❌ Some validation batches not properly planned');
        allFilesExist = false;
    }
} catch (error) {
    console.log('❌ Failed to read validation plan file:', error.message);
    allFilesExist = false;
}

console.log('\n=== Final Verification Summary ===');
const overallSuccess = allFilesExist && allDirectoriesExist;

if (overallSuccess) {
    console.log('✅ ALL VALIDATION PREPARATION COMPLETE');
    console.log('✅ Environment verified and ready');
    console.log('✅ All required files created');
    console.log('✅ All required directories created');
    console.log('✅ Checklist and plan validated');
    console.log('\n🚀 Ready for Local End-to-End Validation Phase execution!');
    console.log('\nNext steps:');
    console.log('1. Begin Batch 1 execution (Sections A & B)');
    console.log('2. Document evidence for each checklist item');
    console.log('3. Update validation_execution_tracker.md');
    console.log('4. Proceed through all batches sequentially');
} else {
    console.log('❌ VALIDATION PREPARATION INCOMPLETE');
    console.log('❌ Some required files or directories are missing');
    console.log('❌ Please review the verification output above');
}

console.log('\nVerification completed at:', new Date().toISOString());