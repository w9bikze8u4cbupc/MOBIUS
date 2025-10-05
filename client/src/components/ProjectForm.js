// client/src/components/ProjectForm.js
import React, { useState } from 'react';
import { projectApi } from '../api/client';
import { useApi } from '../hooks/useApi';
import { validateGameName, validateLanguage, validateVoice } from '../utils/validation';
import { notify } from '../utils/notifications';

const VOICE_OPTIONS = [
  { name: "English - Haseeb", id: "dllHSct4GokGc1AH9JwT", language: "english" },
  { name: "English - Stephanie", id: "oAoF4NpW2Aqxplg9HdYB", language: "english" },
  { name: "French - Patrick", id: "XTyroWkQl32ZSd3rRVZ1", language: "french" },
  { name: "French - Louis", id: "j9RedbMRSNQ74PyikQwD", language: "french" },
  { name: "French - Anna", id: "gCux0vt1cPsEXPNSbchu", language: "french" }
];

const ProjectForm = ({ onProjectCreated }) => {
  const [gameName, setGameName] = useState('');
  const [language, setLanguage] = useState('english');
  const [voiceId, setVoiceId] = useState('');
  const [detailBoost, setDetailBoost] = useState(25);
  const [bggUrl, setBggUrl] = useState('');
  
  const { execute: createProject, loading, error } = useApi(projectApi.createOrUpdate);
  
  // Get available voices for selected language
  const getLanguageVoices = (lang) => VOICE_OPTIONS.filter(v => v.language === lang);
  
  // Set default voice when language changes
  React.useEffect(() => {
    const voices = getLanguageVoices(language);
    if (voices.length > 0 && !voiceId) {
      setVoiceId(voices[0].id);
    }
  }, [language, voiceId]);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate form
    const nameError = validateGameName(gameName);
    const languageError = validateLanguage(language);
    const voiceError = validateVoice(voiceId);
    
    if (nameError || languageError || voiceError) {
      notify.error(nameError || languageError || voiceError);
      return;
    }
    
    try {
      const projectData = {
        name: gameName,
        language,
        voiceId,
        detailBoost,
        metadata: {
          bggUrl: bggUrl || undefined
        }
      };
      
      const result = await createProject(projectData);
      notify.success('Project created successfully!');
      
      if (onProjectCreated) {
        onProjectCreated(result.project);
      }
    } catch (err) {
      notify.error('Failed to create project: ' + (err.response?.data?.error || err.message));
    }
  };
  
  return (
    <div style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
      <h2>Create New Tutorial Project</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label>
            <strong>Game Name:</strong>
            <input
              type="text"
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              placeholder="Enter the game name"
              style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
            />
          </label>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div>
            <label>
              <strong>Language:</strong>
              <select 
                value={language} 
                onChange={(e) => setLanguage(e.target.value)}
                style={{ padding: '0.5rem', marginLeft: '0.5rem' }}
              >
                <option value="english">English</option>
                <option value="french">French</option>
              </select>
            </label>
          </div>
          
          <div>
            <label>
              <strong>Voice:</strong>
              <select 
                value={voiceId} 
                onChange={(e) => setVoiceId(e.target.value)}
                disabled={getLanguageVoices(language).length === 0}
                style={{ padding: '0.5rem', marginLeft: '0.5rem' }}
              >
                {getLanguageVoices(language).map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
                {getLanguageVoices(language).length === 0 && (
                  <option value="">No voices available</option>
                )}
              </select>
            </label>
          </div>
          
          <div>
            <label>
              <strong>Detail Boost:</strong>
              <select 
                value={detailBoost} 
                onChange={(e) => setDetailBoost(Number(e.target.value))}
                style={{ padding: '0.5rem', marginLeft: '0.5rem' }}
              >
                <option value={5}>5%</option>
                <option value={10}>10%</option>
                <option value={25}>25%</option>
                <option value={50}>50%</option>
              </select>
            </label>
          </div>
        </div>
        
        <div style={{ marginBottom: '1rem' }}>
          <label>
            <strong>BGG URL (Optional):</strong>
            <input
              type="url"
              value={bggUrl}
              onChange={(e) => setBggUrl(e.target.value)}
              placeholder="https://boardgamegeek.com/boardgame/..."
              style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
            />
          </label>
        </div>
        
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            backgroundColor: loading ? '#b0bec5' : '#1976d2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Creating...' : 'Create Project'}
        </button>
        
        {error && (
          <div style={{ color: 'red', marginTop: '1rem' }}>
            Error: {error.response?.data?.error || error.message}
          </div>
        )}
      </form>
    </div>
  );
};

export default ProjectForm;