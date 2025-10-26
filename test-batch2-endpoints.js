import { createProject, ingestPDF, getProject, apiCall } from './validation/tools/api-validation-harness.js';
import fs from 'fs';

async function testBatch2Endpoints() {
  console.log('=== Testing Batch 2 Endpoints ===');
  
  try {
    // Test C-01: PDF Upload (Create Project)
    console.log('\n--- C-01: PDF Upload ---');
    const projectResult = await createProject({ 
      name: 'batch2-test-project',
      metadata: { source: 'batch2-validation' }
    });
    console.log('Project creation result:', JSON.stringify(projectResult, null, 2));
    
    if (projectResult.status !== 200) {
      throw new Error(`Failed to create project: ${JSON.stringify(projectResult)}`);
    }
    
    const projectId = projectResult.data.id || projectResult.data.projectId;
    console.log(`Created project with ID: ${projectId}`);
    
    // Test C-02: Ingestion Result
    console.log('\n--- C-02: Ingestion Result ---');
    const ingestResult = await ingestPDF('uploads/batch2/cyclades.pdf', 'batch2-test-project', 'en-US');
    console.log('Ingestion result:', JSON.stringify(ingestResult, null, 2));
    
    // Test getting project details
    console.log('\n--- Getting Project Details ---');
    const projectDetails = await getProject(projectId);
    console.log('Project details:', JSON.stringify(projectDetails, null, 2));
    
    console.log('\n=== All Tests Completed ===');
    
  } catch (error) {
    console.error('Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testBatch2Endpoints().catch(console.error);