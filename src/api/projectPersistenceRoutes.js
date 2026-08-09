import { setProjectState } from './renderJobConfig.js';

function parsePersistedProjectField(value, fallback, fieldName, projectId) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed ?? fallback;
  } catch (error) {
    console.error(`Unable to hydrate project ${projectId}: invalid ${fieldName}`, error);
    return fallback;
  }
}

export function buildRenderProjectState(row) {
  const parsedMetadata = parsePersistedProjectField(row.metadata, {}, 'metadata', row.id);
  const metadata =
    parsedMetadata && typeof parsedMetadata === 'object' && !Array.isArray(parsedMetadata)
      ? parsedMetadata
      : {};
  const components = parsePersistedProjectField(row.components, [], 'components', row.id);
  const images = parsePersistedProjectField(row.images, [], 'images', row.id);
  const renderMetadata =
    metadata.renderState && typeof metadata.renderState === 'object'
      ? metadata.renderState
      : {};

  return {
    projectId: String(row.id),
    name: row.name || '',
    metadata,
    components: Array.isArray(components) ? components : [],
    images: Array.isArray(images) ? images : [],
    script: row.script || '',
    audio: row.audio || '',
    ingestionManifest: metadata.ingestionManifest || renderMetadata.ingestionManifest,
    storyboardManifest: metadata.storyboardManifest || renderMetadata.storyboardManifest,
    resolution: metadata.resolution || renderMetadata.resolution,
    created_at: row.created_at,
  };
}

export function hydrateRenderProjectState(db) {
  db.all('SELECT * FROM projects', [], (error, rows = []) => {
    if (error) {
      console.error('Unable to hydrate persisted project state', error);
      return;
    }

    rows.forEach((row) => {
      try {
        setProjectState(row.id, buildRenderProjectState(row));
      } catch (hydrationError) {
        console.error(`Unable to hydrate project ${row?.id ?? 'unknown'}`, hydrationError);
      }
    });
  });
}

export function registerProjectPersistenceRoutes(app, { db }) {
  hydrateRenderProjectState(db);

  app.post('/save-project', (req, res) => {
    const { name, metadata, components, images, script, audio, scenes } = req.body;

    db.run(
      `INSERT INTO projects (name, metadata, components, images, script, audio, scenes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        JSON.stringify(metadata),
        JSON.stringify(components),
        JSON.stringify(images),
        script,
        audio,
        scenes === undefined ? undefined : JSON.stringify(scenes),
      ],
      function (error) {
        if (error) {
          console.error(error);
          return res.status(500).json({ error: 'Failed to save project. Please try again later.' });
        }

        const projectId = this.lastID;
        db.get(
          'SELECT * FROM projects WHERE id = ?',
          [projectId],
          (loadError, row) => {
            if (loadError || !row) {
              console.error('Failed to hydrate saved project state', loadError);
            } else {
              setProjectState(row.id, buildRenderProjectState(row));
            }
            return res.json({ status: 'success', projectId });
          },
        );
      },
    );
  });

  app.get('/load-project/:id', (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    }

    db.get(
      'SELECT * FROM projects WHERE id = ?',
      [req.params.id],
      (error, row) => {
        if (error) {
          console.error(error);
          return res.status(500).json({ error: 'Failed to load project' });
        }
        if (!row) {
          return res.status(404).json({ error: 'Project not found' });
        }

        try {
          const project = {
            id: row.id,
            name: row.name,
            metadata: JSON.parse(row.metadata),
            components: JSON.parse(row.components),
            images: JSON.parse(row.images),
            script: row.script,
            audio: row.audio,
            created_at: row.created_at,
          };
          if (row.scenes !== undefined) {
            project.scenes = JSON.parse(row.scenes);
          }
          return res.json(project);
        } catch (parseError) {
          console.error('Failed to parse project data:', parseError);
          return res.status(500).json({ error: 'Failed to parse project data' });
        }
      },
    );
  });
}
