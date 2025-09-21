#!/usr/bin/env node

// Schema tightening script with discriminators
import fs from 'fs';
import path from 'path';

// Function to tighten a schema with discriminators and strict properties
function tightenSchema(schemaPath, outputPath = null) {
  try {
    // Load schema
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

    // Apply tightening rules
    const tightenedSchema = applyTighteningRules(schema);

    // Determine output path
    const output = outputPath || schemaPath;

    // Write tightened schema
    fs.writeFileSync(output, JSON.stringify(tightenedSchema, null, 2));

    console.log(`✅ Schema tightened: ${output}`);
    return true;
  } catch (error) {
    console.error(`Error tightening schema: ${error.message}`);
    return false;
  }
}

// Function to apply tightening rules to a schema
function applyTighteningRules(schema) {
  // Create a deep copy of the schema
  const tightened = JSON.parse(JSON.stringify(schema));

  // Add discriminator for segment types if this is a timeline schema
  if (tightened.title && tightened.title.includes('Timeline')) {
    console.log('Applying discriminators for timeline segments...');

    // Add discriminator to segment definitions if they exist
    if (tightened.definitions && tightened.definitions.segment) {
      // This is a simplified example - in practice, you'd need to identify
      // the specific segment types and their discriminators
      tightened.definitions.segment.discriminator = { propertyName: 'type' };
    }
  }

  // Forbid additional properties in strict mode
  tightened.additionalProperties = false;

  // Recursively apply to all nested objects
  tightenObjectProperties(tightened);

  return tightened;
}

// Recursive function to tighten object properties
function tightenObjectProperties(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return;
  }

  // If this is an object type, forbid additional properties
  if (obj.type === 'object' && obj.additionalProperties === undefined) {
    obj.additionalProperties = false;
  }

  // Recursively process all properties
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      tightenObjectProperties(obj[key]);
    }
  }
}

// Main function
function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: node tighten-schemas.js <schema.json> [output.json]');
    console.log(
      'Example: node tighten-schemas.js schemas/timeline.schema.json schemas/timeline-strict.schema.json',
    );
    process.exit(1);
  }

  const schemaPath = args[0];
  const outputPath = args[1] || null;

  if (!fs.existsSync(schemaPath)) {
    console.error(`Schema file not found: ${schemaPath}`);
    process.exit(1);
  }

  console.log(`Tightening schema: ${schemaPath}`);

  const success = tightenSchema(schemaPath, outputPath);

  if (success) {
    console.log('✅ Schema tightening complete');
    process.exit(0);
  } else {
    console.error('❌ Schema tightening failed');
    process.exit(1);
  }
}

main();
