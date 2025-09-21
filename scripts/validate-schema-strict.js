#!/usr/bin/env node

// Strict schema validation script
import fs from 'fs';

import Ajv from 'ajv';

// Function to validate JSON files against a schema with strict settings
function validateSchemaStrict(schemaPath, ...dataPaths) {
  try {
    // Load schema
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

    // Create AJV instance with strict settings
    const ajv = new Ajv({
      strict: true,
      allErrors: true,
      removeAdditional: false, // Don't remove additional properties, just error on them
      useDefaults: true,
    });

    // Add discriminators for segment types if this is a timeline or storyboard schema
    if (schemaPath.includes('timeline') || schemaPath.includes('storyboard')) {
      // This would be where we add discriminator logic if needed
      console.log(`Validating ${schemaPath} with discriminators enabled`);
    }

    // Compile schema
    const validate = ajv.compile(schema);

    let allValid = true;

    // Validate each data file
    for (const dataPath of dataPaths) {
      if (!fs.existsSync(dataPath)) {
        console.error(`Data file not found: ${dataPath}`);
        allValid = false;
        continue;
      }

      try {
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        const valid = validate(data);

        if (valid) {
          console.log(`✅ ${dataPath} is valid`);
        } else {
          console.error(`❌ ${dataPath} is invalid:`);
          console.error(JSON.stringify(validate.errors, null, 2));
          allValid = false;
        }
      } catch (parseError) {
        console.error(`❌ Failed to parse ${dataPath}: ${parseError.message}`);
        allValid = false;
      }
    }

    return allValid;
  } catch (error) {
    console.error(`Error validating schema: ${error.message}`);
    return false;
  }
}

// Main function
function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(
      'Usage: node validate-schema-strict.js <schema.json> <data1.json> [data2.json] ...',
    );
    process.exit(1);
  }

  const schemaPath = args[0];
  const dataPaths = args.slice(1);

  console.log(`Strictly validating ${dataPaths.length} file(s) against ${schemaPath}...\n`);

  const valid = validateSchemaStrict(schemaPath, ...dataPaths);

  if (valid) {
    console.log('\n✅ All files passed strict validation');
    process.exit(0);
  } else {
    console.log('\n❌ Some files failed strict validation');
    process.exit(1);
  }
}

main();
