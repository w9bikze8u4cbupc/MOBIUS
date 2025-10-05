// client/src/utils/fileUtils.js

/**
 * Validate if a file is a PDF
 * @param {File} file - The file to validate
 * @returns {boolean} - True if the file is a PDF
 */
export const isPdfFile = (file) => {
  return file && file.type === 'application/pdf';
};

/**
 * Validate file size
 * @param {File} file - The file to validate
 * @param {number} maxSizeMB - Maximum size in MB
 * @returns {boolean} - True if the file is within the size limit
 */
export const isFileSizeValid = (file, maxSizeMB = 50) => {
  if (!file) return false;
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return file.size <= maxSizeBytes;
};

/**
 * Extract text from PDF using pdf.js
 * @param {File} file - The PDF file
 * @returns {Promise<string>} - Extracted text
 */
export const extractTextFromPDF = async (file) => {
  // This would typically use pdf.js, but we'll defer to the backend for now
  // The current implementation is in the App.js file
  throw new Error('PDF text extraction should be handled by the backend');
};

/**
 * Create FormData for file upload
 * @param {File} file - The file to upload
 * @param {Object} additionalFields - Additional form fields
 * @returns {FormData} - FormData object
 */
export const createFileFormData = (file, additionalFields = {}) => {
  const formData = new FormData();
  formData.append('rulebook', file);
  
  // Append additional fields
  Object.keys(additionalFields).forEach(key => {
    formData.append(key, additionalFields[key]);
  });
  
  return formData;
};

export default {
  isPdfFile,
  isFileSizeValid,
  extractTextFromPDF,
  createFileFormData
};