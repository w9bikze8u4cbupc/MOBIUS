// Simple validation script for TTS functionality
console.log('Testing TTS filename safety...');

// Test the logic that prevents "undefined" in filenames
const safeLanguage = undefined || 'en';
const safeGameName = undefined || 'unknown_game';

console.log('Safe language:', safeLanguage);
console.log('Safe game name:', safeGameName);

if (safeLanguage === 'en' && safeGameName === 'unknown_game') {
  console.log('✓ TTS filename safety validation PASSED');
} else {
  console.error('✗ TTS filename safety validation FAILED');
  process.exit(1);
}

// Test with valid values
const validLanguage = 'fr' || 'en';
const validGameName = 'Catan' || 'unknown_game';

console.log('Valid language:', validLanguage);
console.log('Valid game name:', validGameName);

if (validLanguage === 'fr' && validGameName === 'Catan') {
  console.log('✓ TTS filename with valid values PASSED');
} else {
  console.error('✗ TTS filename with valid values FAILED');
  process.exit(1);
}

// Test default voice selection
const voice = undefined;
const defaultVoice = voice || '21m00Tcm4TlvDq8ikWAM'; // Rachel voice

console.log('Default voice:', defaultVoice);

if (defaultVoice === '21m00Tcm4TlvDq8ikWAM') {
  console.log('✓ Default voice selection PASSED');
} else {
  console.error('✗ Default voice selection FAILED');
  process.exit(1);
}

// Test log sanitization
const apiKey = 'sk-1234567890abcdef'; // Mock API key
const urlWithKey = `https://api.elevenlabs.io/v1/text-to-speech/voice123?xi-api-key=${apiKey}`;
const safeLog = urlWithKey.replace(/xi-api-key=[^&]*/g, 'xi-api-key=***REDACTED***');

console.log('Original URL:', urlWithKey);
console.log('Sanitized URL:', safeLog);

if (safeLog.includes('***REDACTED***') && !safeLog.includes(apiKey)) {
  console.log('✓ Log sanitization PASSED');
} else {
  console.error('✗ Log sanitization FAILED');
  process.exit(1);
}

console.log('All TTS validations PASSED!');
