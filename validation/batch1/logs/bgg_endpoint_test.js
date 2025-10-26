// Test script to check BGG endpoint functionality
import { fetchBggMetadata } from '../../../src/ingest/bgg.js';

async function testBGGEndpoint() {
    console.log('Testing BGG endpoint functionality...');
    
    try {
        // Test with a known game ID (Catan)
        console.log('Fetching BGG metadata for game ID: 13 (Catan)');
        const result = await fetchBggMetadata('13');
        console.log('BGG metadata result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error fetching BGG metadata:', error.message);
        console.error('Stack trace:', error.stack);
    }
}

testBGGEndpoint();