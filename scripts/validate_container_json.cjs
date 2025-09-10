const fs = require('fs');
const Ajv = require('ajv');
const schema = JSON.parse(fs.readFileSync('container.schema.json', 'utf8'));
const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });

const file = process.argv[2] || 'dist/sushi-go/mac/container.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const validate = ajv.compile(schema);
const ok = validate(data);
if (!ok) {
  console.error('container.json invalid:\n' + ajv.errorsText(validate.errors, { separator: '\n' }));
  process.exit(1);
}
console.log('container.json valid:', file);