import fs from 'fs';
import path from 'path';

console.log('Test script running');

const schemaPath = path.join('schemas', 'storyboard.schema.json');
console.log('Schema path:', schemaPath);
console.log('File exists:', fs.existsSync(schemaPath));

if (fs.existsSync(schemaPath)) {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  console.log('Schema loaded successfully');
  console.log('Schema ID:', schema.$id);
  console.log('Properties:', Object.keys(schema));
}