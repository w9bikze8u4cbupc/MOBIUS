const fs = require('fs');
const path = require('path');

// Function to recursively get all files with specific extensions
function getAllFiles(dir, extensions, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      getAllFiles(filePath, extensions, fileList);
    } else {
      const ext = path.extname(file).toLowerCase();
      if (extensions.includes(ext)) {
        fileList.push(filePath);
      }
    }
  });
  
  return fileList;
}

// Function to convert line endings from CRLF to LF
function convertLineEndings(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    // Replace CRLF with LF
    const convertedContent = content.replace(/\r\n/g, '\n');
    
    // Only write if there were changes
    if (content !== convertedContent) {
      fs.writeFileSync(filePath, convertedContent, 'utf8');
      console.log(`Converted line endings for: ${filePath}`);
    }
  } catch (error) {
    console.error(`Error converting ${filePath}:`, error.message);
  }
}

// Get all JSX/JS files in the src directory
const srcDir = path.join(__dirname, 'src');
const extensions = ['.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.scss', '.md'];
const files = getAllFiles(srcDir, extensions);

console.log(`Found ${files.length} files to process...`);

// Convert line endings for each file
files.forEach(convertLineEndings);

console.log('Line ending conversion complete!');