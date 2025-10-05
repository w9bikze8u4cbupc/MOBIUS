// client/src/components/ProjectStatus.js
import React from 'react';

const ProjectStatus = ({ project }) => {
  if (!project) {
    return null;
  }
  
  // Determine current step based on project data
  const getCurrentStep = () => {
    if (project.metadata && Object.keys(project.metadata).length > 0) {
      if (project.script && Object.keys(project.script).length > 0) {
        if (project.audio && Object.keys(project.audio).length > 0) {
          if (project.render && Object.keys(project.render).length > 0) {
            return 5; // Complete
          }
          return 4; // Audio generated
        }
        return 3; // Script generated
      }
      return 2; // Metadata extracted
    }
    return 1; // Project created
  };
  
  const currentStep = getCurrentStep();
  
  const steps = [
    { id: 1, name: 'Project Created', description: 'Initial project setup' },
    { id: 2, name: 'Rulebook Processed', description: 'Metadata extracted from rulebook' },
    { id: 3, name: 'Script Generated', description: 'Tutorial script created' },
    { id: 4, name: 'Audio Generated', description: 'Voice narration produced' },
    { id: 5, name: 'Video Rendered', description: 'Final tutorial video complete' }
  ];
  
  return (
    <div style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
      <h2>Project Status</h2>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', marginBottom: '2rem' }}>
        {/* Progress line */}
        <div 
          style={{ 
            position: 'absolute', 
            top: '1.5rem', 
            left: '2rem', 
            right: '2rem', 
            height: '4px', 
            backgroundColor: '#e0e0e0',
            zIndex: 1
          }} 
        />
        <div 
          style={{ 
            position: 'absolute', 
            top: '1.5rem', 
            left: '2rem', 
            width: `${Math.max(0, (currentStep - 1) * 25)}%`, 
            height: '4px', 
            backgroundColor: '#1976d2',
            zIndex: 2,
            transition: 'width 0.3s ease'
          }} 
        />
        
        {/* Steps */}
        {steps.map((step, index) => (
          <div 
            key={step.id}
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              zIndex: 3,
              position: 'relative'
            }}
          >
            <div 
              style={{
                width: '2rem',
                height: '2rem',
                borderRadius: '50%',
                backgroundColor: step.id <= currentStep ? '#1976d2' : '#e0e0e0',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                marginBottom: '0.5rem'
              }}
            >
              {step.id}
            </div>
            <div 
              style={{ 
                textAlign: 'center',
                fontWeight: step.id === currentStep ? 'bold' : 'normal',
                color: step.id <= currentStep ? '#333' : '#999'
              }}
            >
              <div>{step.name}</div>
              <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>{step.description}</div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Project Details */}
      <div style={{ marginTop: '2rem' }}>
        <h3>Project Details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <strong>Name:</strong> {project.name}
          </div>
          <div>
            <strong>Language:</strong> {project.language}
          </div>
          <div>
            <strong>Status:</strong> {project.status}
          </div>
          <div>
            <strong>Created:</strong> {new Date(project.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>
      
      {/* Action Buttons */}
      <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
        <button
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#43a047',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Download Assets
        </button>
        <button
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#1976d2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Re-run Pipeline
        </button>
      </div>
    </div>
  );
};

export default ProjectStatus;