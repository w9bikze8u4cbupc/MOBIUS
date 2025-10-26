import { executeSectionC, executeSectionD } from './validation/batch2/execute-batch2.js';

async function runBatch2Simple() {
  console.log('=== Running Batch 2 Validation (Simple) ===');
  
  try {
    // Execute Section C
    console.log('\n--- Executing Section C ---');
    const sectionCResults = await executeSectionC();
    console.log('Section C completed successfully');
    
    // Get the project ID from Section C results
    const projectId = sectionCResults.C01.result.data?.id || sectionCResults.C01.result.data?.projectId;
    
    if (!projectId) {
      throw new Error('Failed to get project ID from Section C execution');
    }
    
    console.log(`Using project ID for Section D: ${projectId}`);
    
    // Execute Section D
    console.log('\n--- Executing Section D ---');
    const sectionDResults = await executeSectionD(projectId);
    console.log('Section D completed successfully');
    
    console.log('\n=== Batch 2 Validation Completed ===');
    
  } catch (error) {
    console.error('Batch 2 validation failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

runBatch2Simple().catch(console.error);