// client/src/utils/validation.js
export const REQUIRED_FIELDS = ['gameName', 'language', 'voice'];

export function validateProjectForm(values) {
  const errors = {};

  REQUIRED_FIELDS.forEach((field) => {
    if (!values[field]) errors[field] = 'Required';
  });

  // Validate game name
  if (values.gameName) {
    if (values.gameName.trim().length < 2) {
      errors.gameName = 'Game name must be at least 2 characters';
    } else if (values.gameName.trim().length > 100) {
      errors.gameName = 'Game name must be less than 100 characters';
    }
  }

  // Validate detail percentage
  if (values.detailPercent !== undefined && values.detailPercent !== null) {
    const percent = Number(values.detailPercent);
    if (isNaN(percent) || percent < 0 || percent > 100) {
      errors.detailPercent = 'Detail percentage must be between 0 and 100';
    }
  }

  // Validate metadata fields
  if (values.metadata) {
    // Validate player count format (e.g., "2-4", "2–4", "2 to 4")
    if (values.metadata.playerCount && !/^\d+[\-–]?\d*(\s*(player|players)?)?$/i.test(values.metadata.playerCount)) {
      errors['metadata.playerCount'] = 'Invalid format (e.g., 2-4 players)';
    }
    
    // Validate game length format (e.g., "30-60 min", "45 minutes")
    if (values.metadata.gameLength && !/^(\d+-?\d*\s*(min|minutes?|hrs?|hours?))*$/i.test(values.metadata.gameLength)) {
      errors['metadata.gameLength'] = 'Invalid format (e.g., 30-60 min)';
    }
    
    // Validate minimum age (e.g., "8+", "10 years", "12 and up")
    if (values.metadata.minimumAge && !/^(\d+\+?|\d+\s*(years?|and up))$/i.test(values.metadata.minimumAge)) {
      errors['metadata.minimumAge'] = 'Invalid format (e.g., 8+, 10 years)';
    }
  }

  return errors;
}

/**
 * Validate required fields
 * @param {Object} fields - Object containing field values
 * @param {Array} requiredFields - Array of required field names
 * @returns {Object} - Validation result { isValid, errors }
 */
export const validateRequiredFields = (fields, requiredFields) => {
  const errors = {};
  
  requiredFields.forEach(field => {
    if (!fields[field] || fields[field].toString().trim() === '') {
      errors[field] = `${field} is required`;
    }
  });
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

/**
 * Validate game name
 * @param {string} name - Game name
 * @returns {string|null} - Error message or null if valid
 */
export const validateGameName = (name) => {
  if (!name || name.trim() === '') {
    return 'Game name is required';
  }
  
  if (name.trim().length < 2) {
    return 'Game name must be at least 2 characters';
  }
  
  if (name.trim().length > 100) {
    return 'Game name must be less than 100 characters';
  }
  
  return null;
};

/**
 * Validate language selection
 * @param {string} language - Selected language
 * @returns {string|null} - Error message or null if valid
 */
export const validateLanguage = (language) => {
  const validLanguages = ['english', 'french', 'fr-CA', 'en-US'];
  
  if (!language || !validLanguages.includes(language)) {
    return 'Please select a valid language';
  }
  
  return null;
};

/**
 * Validate voice selection
 * @param {string} voiceId - Selected voice ID
 * @returns {string|null} - Error message or null if valid
 */
export const validateVoice = (voiceId) => {
  if (!voiceId || voiceId.trim() === '') {
    return 'Please select a voice';
  }
  
  return null;
};

/**
 * Validate detail percentage
 * @param {number} percentage - Detail percentage
 * @returns {string|null} - Error message or null if valid
 */
export const validateDetailPercentage = (percentage) => {
  if (percentage === undefined || percentage === null) {
    return 'Detail percentage is required';
  }
  
  if (percentage < 0 || percentage > 100) {
    return 'Detail percentage must be between 0 and 100';
  }
  
  return null;
};

/**
 * Validate BGG URL
 * @param {string} url - BGG URL
 * @returns {string|null} - Error message or null if valid
 */
export const validateBggUrl = (url) => {
  if (!url || url.trim() === '') {
    return null; // BGG URL is optional
  }
  
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname !== 'boardgamegeek.com') {
      return 'Please enter a valid BoardGameGeek URL';
    }
  } catch (e) {
    return 'Please enter a valid URL';
  }
  
  return null;
};

export default {
  validateRequiredFields,
  validateGameName,
  validateLanguage,
  validateVoice,
  validateDetailPercentage,
  validateBggUrl
};