// client/src/api/client.js
import axios from 'axios';

// Backend URL from environment or default
const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5001';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth tokens if needed
apiClient.interceptors.request.use(
  (config) => {
    // Add auth headers if needed
    // const token = localStorage.getItem('authToken');
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`;
    // }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle common error cases
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle common error responses
    if (error.response?.status === 401) {
      // Handle unauthorized access
      console.warn('Unauthorized access - redirecting to login');
      // Redirect to login or handle token refresh
    }
    
    if (error.response?.status === 500) {
      console.error('Server error:', error.response.data);
    }
    
    return Promise.reject(error);
  }
);

// API Client Functions

/**
 * Project API
 */
export const projectApi = {
  // List all projects
  list: () => apiClient.get('/api/projects'),
  
  // Get project by ID
  getById: (projectId) => apiClient.get(`/api/projects/${projectId}`),
  
  // Create or update project
  createOrUpdate: (projectData) => apiClient.post('/api/projects', projectData),
};

/**
 * BGG Ingestion API
 */
export const bggApi = {
  // Ingest metadata from BoardGameGeek
  ingest: (projectId, bggUrl) => apiClient.post('/api/bgg/ingest', { projectId, bggUrl }),
};

/**
 * Rulebook API
 */
export const rulebookApi = {
  // Upload PDF rulebook
  upload: (formData) => {
    return apiClient.post('/api/rulebook/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  
  // Parse rulebook
  parse: (projectId, pdfPath) => apiClient.post('/api/rulebook/parse', { projectId, pdfPath }),
};

/**
 * Script API
 */
export const scriptApi = {
  // Generate tutorial script
  generate: (projectId, options = {}) => {
    const { language = 'fr-CA', detailBoost = 25 } = options;
    return apiClient.post('/api/script/generate', { 
      projectId, 
      language, 
      detailBoost 
    });
  },
};

/**
 * Assets API
 */
export const assetsApi = {
  // Process assets
  process: (projectId) => apiClient.post('/api/assets/process', { projectId }),
};

/**
 * Audio API
 */
export const audioApi = {
  // Generate audio
  generate: (projectId, voiceId) => apiClient.post('/api/audio/generate', { projectId, voiceId }),
};

/**
 * Captions API
 */
export const captionsApi = {
  // Generate captions
  generate: (projectId, language = 'fr-CA') => apiClient.post('/api/captions/generate', { projectId, language }),
};

/**
 * Render API
 */
export const renderApi = {
  // Generate preview
  preview: (projectId, durationSeconds = 10) => apiClient.post('/api/render/preview', { projectId, durationSeconds }),
  
  // Generate full render
  full: (projectId) => apiClient.post('/api/render/full', { projectId }),
};

// Export the base client for custom requests if needed
export default apiClient;