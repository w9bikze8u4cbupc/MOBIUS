export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
  details?: unknown;
  endpoint: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:5001';

type RequestOptions = RequestInit & { parse?: 'json' | 'text' };

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const url = `${API_BASE_URL}${endpoint}`;
  const { parse = 'json', ...rest } = options;
  try {
    const response = await fetch(url, {
      headers: {
        'content-type': 'application/json',
        ...(options.headers ?? {}),
      },
      ...rest,
    });
    let payload: any = undefined;
    if (parse === 'json') {
      const text = await response.text();
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch (error) {
          payload = { raw: text };
        }
      }
    } else {
      payload = await response.text();
    }
    if (!response.ok) {
      return {
        ok: false,
        endpoint,
        status: response.status,
        error: payload?.error ?? 'Request failed',
        details: payload ?? payload?.details,
      };
    }
    return { ok: true, endpoint, data: payload };
  } catch (error) {
    return { ok: false, endpoint, error: (error as Error).message };
  }
}

export async function loadProject(projectId: string): Promise<ApiResult<any>> {
  return request(`/project/load?projectId=${encodeURIComponent(projectId)}`);
}

export async function loadProjectPost(projectId: string): Promise<ApiResult<any>> {
  return request(`/project/load`, {
    method: 'POST',
    body: JSON.stringify({ projectId }),
  });
}

export async function saveProject(projectId: string, manifest: any): Promise<ApiResult<any>> {
  return request(`/project/save`, {
    method: 'POST',
    body: JSON.stringify({ projectId, manifest }),
  });
}

export async function ingestBgg(projectId: string, bggUrl: string): Promise<ApiResult<any>> {
  return request(`/ingest/bgg`, {
    method: 'POST',
    body: JSON.stringify({ projectId, bggUrl }),
  });
}

export async function ingestPdf(
  projectId: string,
  file: File,
  heuristics: boolean,
): Promise<ApiResult<any>> {
  const endpoint = `/ingest/pdf?heuristics=${heuristics ? 'true' : 'false'}`;
  const url = `${API_BASE_URL}${endpoint}`;
  const form = new FormData();
  form.set('projectId', projectId);
  form.set('file', file);
  try {
    const response = await fetch(url, {
      method: 'POST',
      body: form,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : undefined;
    if (!response.ok) {
      return {
        ok: false,
        endpoint,
        status: response.status,
        error: payload?.error ?? 'Upload failed',
        details: payload,
      };
    }
    return { ok: true, endpoint, data: payload };
  } catch (error) {
    return { ok: false, endpoint, error: (error as Error).message };
  }
}

export async function generateScript(projectId: string, lang: string): Promise<ApiResult<any>> {
  return request(`/script/generate`, {
    method: 'POST',
    body: JSON.stringify({ project: { id: projectId }, lang }),
  });
}

export async function generateTts(projectId: string, segments: any[]): Promise<ApiResult<any>> {
  return request(`/tts/generate`, {
    method: 'POST',
    body: JSON.stringify({ projectId, segments }),
  });
}

export async function composePreview(projectId: string): Promise<ApiResult<any>> {
  return request(`/render/compose`, {
    method: 'POST',
    body: JSON.stringify({ project: { id: projectId }, options: { mode: 'preview' } }),
  });
}

export async function exportProject(projectId: string): Promise<ApiResult<any>> {
  return request(`/project/export`, {
    method: 'POST',
    body: JSON.stringify({ projectId }),
  });
}

export async function exportStatus(exportId: string): Promise<ApiResult<any>> {
  return request(`/project/export/status?exportId=${encodeURIComponent(exportId)}`);
}

export interface ApiClient {
  loadProject: typeof loadProject;
  loadProjectPost: typeof loadProjectPost;
  saveProject: typeof saveProject;
  ingestBgg: typeof ingestBgg;
  ingestPdf: typeof ingestPdf;
  generateScript: typeof generateScript;
  generateTts: typeof generateTts;
  composePreview: typeof composePreview;
  exportProject: typeof exportProject;
  exportStatus: typeof exportStatus;
}

const api: ApiClient = {
  loadProject,
  loadProjectPost,
  saveProject,
  ingestBgg,
  ingestPdf,
  generateScript,
  generateTts,
  composePreview,
  exportProject,
  exportStatus,
};

export default api;
