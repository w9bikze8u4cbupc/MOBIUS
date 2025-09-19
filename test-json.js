import express from 'express';
const app = express();
const port = 3001;

// Body parsing with limits
app.use(express.json({ 
  limit: '10mb',
  // Custom verify function to handle pdfjs-dist interference
  verify: (req, res, buf, encoding) => {
    // Store the raw buffer for manual parsing if needed
    req.rawBody = buf;
  }
}));

// Custom JSON parsing middleware to handle pdfjs-dist interference (fallback)
function customJsonParser(req, res, next) {
  // Only handle JSON requests when express.json failed
  if (req.headers['content-type'] !== 'application/json') {
    return next();
  }
  
  // If body is already parsed and valid, continue
  if (req.body && typeof req.body === 'object') {
    return next();
  }
  
  // Only try custom parsing if we have rawBody from express.json verify function
  if (!req.rawBody) {
    return next();
  }
  
  const data = req.rawBody.toString();
  
  if (!data) {
    return next();
  }
  
  try {
    req.body = JSON.parse(data);
    next();
  } catch (error) {
    console.warn('Custom JSON parsing failed:', error.message);
    console.warn('Raw data:', data);
    // Try to fix common pdfjs-dist interference issues
    try {
      // Remove any characters that might have been added by pdfjs-dist
      const cleanedData = data.replace(/[\x00-\x1F\x7F]/g, '');
      req.body = JSON.parse(cleanedData);
      next();
    } catch (cleanError) {
      console.warn('Cleaned JSON parsing also failed:', cleanError.message);
      return res.status(400).json({ error: 'Invalid JSON in request body' });
    }
  }
}

// Apply the custom JSON parser after the express.json middleware as fallback
app.use(customJsonParser);

app.post('/test', (req, res) => {
  console.log('req.body:', req.body);
  console.log('req.rawBody:', req.rawBody);
  res.json({ success: true, body: req.body });
});

app.listen(port, () => {
  console.log(`Test server running at http://localhost:${port}`);
});