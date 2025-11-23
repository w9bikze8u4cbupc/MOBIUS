import * as http from 'http';
import db from '../../src/api/db.js';

async function handleSaveProject(req: http.IncomingMessage, res: http.ServerResponse) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
  }
  const parsed = body ? JSON.parse(body) : {};
  const { name, metadata, components, images, script, audio } = parsed;

  return new Promise<void>((resolve) => {
    db.run(
      `INSERT INTO projects (name, metadata, components, images, script, audio)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name,
        JSON.stringify(metadata),
        JSON.stringify(components),
        JSON.stringify(images),
        script,
        audio
      ],
      function (err: any) {
        res.setHeader('Content-Type', 'application/json');
        if (err) {
          res.statusCode = 500;
          res.end(
            JSON.stringify({ error: 'Failed to save project. Please try again later.' })
          );
          return resolve();
        }
        res.end(JSON.stringify({ status: 'success', projectId: (this as any)?.lastID }));
        resolve();
      }
    );
  });
}

async function makeRequest(path: string, payload: any) {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/save-project') {
      await handleSaveProject(req, res);
    } else {
      res.statusCode = 404;
      res.end();
    }
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    return { status: response.status, body: data };
  } finally {
    server.close();
  }
}

function getAllProjects(): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM projects', [], (err: any, rows: any[]) => {
      if (err) return reject(err);
      resolve(rows as any[]);
    });
  });
}

describe('/save-project', () => {
  beforeEach(() => {
    db.reset();
  });

  it('returns success and a project id', async () => {
    const response = await makeRequest('/save-project', {
      name: 'Test Project',
      metadata: { foo: 'bar' },
      components: [{ id: 1 }],
      images: [],
      script: 'script text',
      audio: 'audio url'
    });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');
    expect(typeof response.body.projectId).toBe('number');
  });

  it('persists projects across requests', async () => {
    const first = await makeRequest('/save-project', { name: 'One' });
    const second = await makeRequest('/save-project', { name: 'Two' });

    const projects = await getAllProjects();

    expect(projects).toHaveLength(2);
    expect(projects[0].id).toBe(first.body.projectId);
    expect(projects[1].id).toBe(second.body.projectId);
    expect(projects[1].id).toBeGreaterThan(projects[0].id);
    expect(projects.map((p) => p.name)).toEqual(['One', 'Two']);
  });
});
