import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { ProjectsApi } from './api/projectsApi';
import ProjectForm from './components/ProjectForm';
import RulebookIngestion from './components/RulebookIngestion';
import ProjectStatus from './components/ProjectStatus';
import { useApi } from './hooks/useApi';
import { useInterval } from './hooks/useInterval';
import { notify } from './utils/notifications';
import { normaliseMetadata } from './utils/transforms';

export default function App() {
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [isPolling, setIsPolling] = useState(false);

  const projectQuery = useApi(
    ({ projectId }) => ProjectsApi.fetchProject(projectId),
    { immediate: false }
  );

  const statusQuery = useApi(
    ({ projectId }) => ProjectsApi.fetchPipelineStatus(projectId),
    { immediate: false }
  );

  // Polling logic
  useInterval(
    async () => {
      if (activeProjectId) {
        try {
          const status = await statusQuery.execute({ projectId: activeProjectId });
          // Stop polling when all steps are complete
          if (status?.ingested && status?.scriptReady && status?.audioReady) {
            setIsPolling(false);
            notify.success('Pipeline completed successfully!');
          }
        } catch (error) {
          notify.error(`Failed to fetch status: ${error.message}`);
          setIsPolling(false);
        }
      }
    },
    isPolling ? 10000 : null // Poll every 10 seconds when active
  );

  // Start polling when a project is created
  useEffect(() => {
    if (activeProjectId) {
      setIsPolling(true);
    }
  }, [activeProjectId]);

  const handleCreateProject = async (formValues) => {
    const payload = {
      name: formValues.gameName,
      language: formValues.language,
      voice: formValues.voice,
      detailPercent: Number(formValues.detailPercent ?? 25),
      metadata: normaliseMetadata(formValues.metadata),
    };

    try {
      const project = await ProjectsApi.createProject(payload);
      setActiveProjectId(project.id);
      notify.success(`Project "${project.name}" created.`);
      await projectQuery.execute({ projectId: project.id });
      // Start polling for status updates
      setIsPolling(true);
    } catch (error) {
      notify.error(`Failed to create project: ${error.message}`);
    }
  };

  const handleFileUpload = async (file) => {
    if (!activeProjectId) {
      notify.error('Create a project before ingesting a rulebook.');
      return;
    }
    
    try {
      await ProjectsApi.ingestRulebook({ projectId: activeProjectId, file });
      notify.success('Rulebook ingestion started. Status will update automatically.');
      // Ensure polling is active
      setIsPolling(true);
    } catch (error) {
      notify.error(`Failed to ingest rulebook: ${error.message}`);
    }
  };

  const handleTextSubmit = async (text) => {
    if (!activeProjectId) {
      notify.error('Create a project before ingesting a rulebook.');
      return;
    }
    
    try {
      await ProjectsApi.ingestRulebookText({ projectId: activeProjectId, rulebookText: text });
      notify.success('Text ingestion queued. Status will update automatically.');
      // Ensure polling is active
      setIsPolling(true);
    } catch (error) {
      notify.error(`Failed to ingest text: ${error.message}`);
    }
  };

  const refreshStatus = async () => {
    if (!activeProjectId) return;
    try {
      await statusQuery.execute({ projectId: activeProjectId });
    } catch (error) {
      notify.error(`Failed to refresh status: ${error.message}`);
    }
  };

  // Stop polling when component unmounts
  useEffect(() => {
    return () => {
      setIsPolling(false);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <Toaster position="top-right" toastOptions={{
        duration: 4000,
        style: {
          background: '#363636',
          color: '#fff',
        },
      }} />
      <div className="mx-auto max-w-5xl space-y-10 px-4 sm:px-6 lg:px-8">
        <header className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
            Mobius Tutorial Generator
          </h1>
          <p className="mt-3 text-lg text-gray-500">
            Create professional board game tutorials with AI
          </p>
        </header>

        <main className="space-y-8">
          <div className="rounded-lg bg-white p-6 shadow sm:p-8">
            <ProjectForm
              onSubmit={handleCreateProject}
              isSubmitting={projectQuery.isLoading}
            />
          </div>

          <div className="rounded-lg bg-white p-6 shadow sm:p-8">
            <RulebookIngestion
              onUploadFile={handleFileUpload}
              onSubmitText={handleTextSubmit}
              isProcessing={statusQuery.isLoading || isPolling}
            />
          </div>

          {statusQuery.data && (
            <div className="rounded-lg bg-white p-6 shadow sm:p-8">
              <ProjectStatus status={statusQuery.data} isLive={isPolling} />
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                  onClick={refreshStatus}
                  disabled={isPolling}
                >
                  {isPolling ? 'Auto-refreshing...' : 'Refresh Status'}
                </button>
              </div>
            </div>
          )}
        </main>

        <footer className="mt-12 text-center text-sm text-gray-500">
          <p>© {new Date().getFullYear()} Mobius Tutorial Generator. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
}