#!/usr/bin/env node

import axios from 'axios';

async function testApiHarvest() {
  console.log('Testing API harvest endpoint...');
  
  try {
    // Start the server first if it's not already running
    // For this test, we'll assume the server is running on port 5001
    
    const response = await axios.post('http://localhost:5001/api/harvest-images', {
      title: "Abyss"
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Response Status:', response.status);
    console.log('Response Headers:');
    Object.entries(response.headers).forEach(([key, value]) => {
      if (key.startsWith('x-')) {
        console.log(`  ${key}: ${value}`);
      }
    });
    
    console.log('\nResponse Data:');
    console.log('Success:', response.data.success);
    console.log('Images Count:', response.data.images?.length || 0);
    
    if (response.data.images && response.data.images.length > 0) {
      console.log('\nFirst 3 Images:');
      response.data.images.slice(0, 3).forEach((img, index) => {
        console.log(`${index + 1}. ${img.url}`);
        console.log(`   Provider: ${img.provider}`);
        console.log(`   Confidence: ${img.confidence}`);
        console.log(`   Final Score: ${img.finalScore}`);
        console.log(`   Cluster ID: ${img.clusterId}`);
        if (img.scores) {
          console.log(`   Scores:`, img.scores);
        }
        console.log('');
      });
    }
    
    console.log('✅ API harvest test completed successfully');
  } catch (error) {
    if (error.response) {
      console.error('❌ API Error Response:', error.response.status, error.response.statusText);
      console.error('Response Data:', error.response.data);
    } else {
      console.error('❌ API harvest test failed:', error.message);
    }
    process.exit(1);
  }
}

testApiHarvest().catch(console.error);