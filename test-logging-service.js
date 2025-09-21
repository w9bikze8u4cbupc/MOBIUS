import LoggingService from './src/utils/logging/LoggingService.js';

console.log('Testing LoggingService import...');

try {
  LoggingService.info('Test', 'This is a test message');
  console.log('✅ LoggingService import and usage successful');
} catch (error) {
  console.log('❌ LoggingService test failed:', error.message);
}
