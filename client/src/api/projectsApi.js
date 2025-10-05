import { httpClient } from './httpClient';

export const ProjectsApi = {
  createProject(payload) {
    return httpClient.post('/api/projects', payload).then((res) => res.data);
  },

  ingestRulebook({ projectId, file }) {
    const formData = new FormData();
    formData.append('projectId', projectId);
    formData.append('rulebook', file);
    return httpClient.post('/api/ingest', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  ingestRulebookText({ projectId, rulebookText }) {
    return httpClient.post('/api/ingest/text', { projectId, rulebookText });
  },

  fetchProject(projectId) {
    return httpClient.get(`/api/projects/${projectId}`).then((res) => res.data);
  },

  startScriptGeneration(projectId, options) {
    return httpClient.post(`/api/projects/${projectId}/script`, options);
  },

  startAudioGeneration(projectId, options) {
    return httpClient.post(`/api/projects/${projectId}/audio`, options);
  },

  fetchPipelineStatus(projectId) {
    return httpClient.get(`/api/projects/${projectId}/status`).then((res) => res.data);
  },
};