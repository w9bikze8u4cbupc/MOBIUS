import { parseSizeFromUrl, parseSizeFromSrcset } from './src/utils/sizeExtract.js';

// Test URLs with different patterns
const testUrls = [
  'https://example.com/image-300x225.jpg',
  'https://example.com/image.jpg?w=300&h=225',
  'https://example.com/image.jpg?width=300&height=225',
  'https://example.com/image.jpg?resize=300,225',
  'https://example.com/image.jpg?resize=300%2C225',
  'https://example.com/image.png',
  'https://example.com/image-150x150.gif'
];

console.log('Testing parseSizeFromUrl:');
testUrls.forEach(url => {
  const result = parseSizeFromUrl(url);
  console.log(`  ${url} ->`, result);
});

// Test srcset parsing
const testSrcsets = [
  'image-300w.jpg 300w, image-600w.jpg 600w',
  'image1.jpg 150w, image2.jpg 300w, image3.jpg 600w',
  'image.jpg',
  ''
];

console.log('\nTesting parseSizeFromSrcset:');
testSrcsets.forEach(srcset => {
  const result = parseSizeFromSrcset(srcset);
  console.log(`  "${srcset}" ->`, result);
});