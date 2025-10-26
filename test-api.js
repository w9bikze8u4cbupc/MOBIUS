import fetch from 'node-fetch';

async function testAPI() {
  try {
    console.log('Testing API endpoints...');
    
    // Test creating a project
    console.log('\n--- Creating Project ---');
    const createResponse = await fetch('http://localhost:5001/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'test-project',
        metadata: { source: 'batch2-validation' }
      })
    });
    
    const createData = await createResponse.json();
    console.log('Create project response:', JSON.stringify(createData, null, 2));
    
    if (!createData.success) {
      throw new Error('Failed to create project');
    }
    
    const projectId = createData.projectId;
    console.log(`Created project with ID: ${projectId}`);
    
    // Test getting the project
    console.log('\n--- Getting Project ---');
    const getResponse = await fetch(`http://localhost:5001/api/projects/${projectId}`);
    const getData = await getResponse.json();
    console.log('Get project response:', JSON.stringify(getData, null, 2));
    
    // Test getting all projects
    console.log('\n--- Getting All Projects ---');
    const getAllResponse = await fetch('http://localhost:5001/api/projects');
    const getAllData = await getAllResponse.json();
    console.log('Get all projects response:', JSON.stringify(getAllData, null, 2));
    
    console.log('\n=== All Tests Completed ===');
    
  } catch (error) {
    console.error('Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testAPI().catch(console.error);