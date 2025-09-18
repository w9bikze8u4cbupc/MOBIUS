// CommonJS middleware for Express
const Ajv = require('ajv').default;
const addFormats = require('ajv-formats');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

function validateSchema(schema) {
  const validate = ajv.compile(schema);
  return (req, res, next) => {
    const ok = validate(req.body);
    if (!ok) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Request body failed schema validation',
        details: validate.errors
      });
    }
    return next();
  };
}

module.exports = { validateSchema, ajv };