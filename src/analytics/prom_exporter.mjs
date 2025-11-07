import fs from 'node:fs/promises';
import path from 'node:path';

const PROM_HEADER = '# HELP mobius_analytics_metric Mobius analytics snapshot\n# TYPE mobius_analytics_metric gauge\n';

export async function collectSnapshotMetrics(dir) {
  const entries = [];
  const resolvedDir = dir || process.cwd();
  let files = [];
  try {
    files = await fs.readdir(resolvedDir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return entries;
    }

    throw error;
  }

  for (const dirent of files) {
    if (dirent.isDirectory()) {
      const nested = await collectSnapshotMetrics(path.join(resolvedDir, dirent.name));
      entries.push(...nested);
      continue;
    }

    if (!dirent.name.endsWith('.json')) {
      continue;
    }

    const filePath = path.join(resolvedDir, dirent.name);
    try {
      const contents = await fs.readFile(filePath, 'utf8');
      const payload = JSON.parse(contents);
      const metrics = extractMetrics(path.parse(dirent.name).name, payload);
      entries.push(...metrics);
    } catch (error) {
      if (process.env.DEBUG === '1') {
        console.error('[prom-exporter] failed to parse', filePath, error);
      }
    }
  }

  return entries;
}

export async function buildPrometheusBody(dir) {
  const metrics = await collectSnapshotMetrics(dir);
  if (metrics.length === 0) {
    return `${PROM_HEADER}`;
  }

  const lines = metrics.map((metric) => formatPrometheusLine(metric));
  return `${PROM_HEADER}${lines.join('\n')}\n`;
}

export async function exportPrometheusFromDir(dir, outputFile) {
  const body = await buildPrometheusBody(dir);
  const file = outputFile || path.join(process.cwd(), 'metrics.prom');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, 'utf8');
  return { file, body };
}

export async function pushToGateway(pushgatewayUrl, body, { job = 'mobius_analytics', labels = {} } = {}) {
  if (!pushgatewayUrl) {
    throw new Error('pushgatewayUrl is required');
  }

  if (!body) {
    throw new Error('Prometheus body is required to push');
  }

  const target = buildPushgatewayUrl(pushgatewayUrl, job, labels);
  const response = await fetch(target, {
    method: 'PUT',
    headers: {
      'content-type': 'text/plain; version=0.0.4'
    },
    body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Pushgateway responded with ${response.status}: ${text}`);
  }

  return response.status;
}

function buildPushgatewayUrl(baseUrl, job, labels) {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const encodedLabels = Object.entries(labels)
    .flatMap(([key, value]) => ['label', encodeURIComponent(key), encodeURIComponent(String(value))]);
  const labelPath = encodedLabels.length > 0 ? `/${encodedLabels.join('/')}` : '';
  return `${base}/metrics/job/${encodeURIComponent(job)}${labelPath}`;
}

function extractMetrics(basename, payload) {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload.metrics)) {
    return payload.metrics.map((metric, index) => normaliseMetric(metric, basename, index));
  }

  if (Array.isArray(payload)) {
    return payload.map((metric, index) => normaliseMetric(metric, basename, index));
  }

  if (typeof payload === 'object') {
    return Object.entries(payload).map(([key, value]) => normaliseMetric({ name: key, value }, basename));
  }

  return [];
}

function normaliseMetric(metric, basename, index = 0) {
  if (metric == null) {
    return {
      name: sanitiseMetricName(`${basename}_${index}`),
      labels: {},
      value: 0
    };
  }

  const name = metric.metric || metric.name || `${basename}_${index}`;
  const labels = metric.labels || {};
  const value = typeof metric.value === 'number' ? metric.value : Number(metric.value) || 0;
  return {
    name: sanitiseMetricName(name),
    labels,
    value
  };
}

function sanitiseMetricName(name) {
  return String(name)
    .trim()
    .replace(/[^a-zA-Z0-9:_]/g, '_');
}

function formatPrometheusLine({ name, labels, value }) {
  const formattedLabels = formatLabels(labels);
  return `${name}${formattedLabels} ${Number.isFinite(value) ? value : 0}`;
}

function formatLabels(labels) {
  const keys = Object.keys(labels || {}).sort();
  if (keys.length === 0) {
    return '';
  }

  const parts = keys.map((key) => `${key}="${String(labels[key]).replace(/"/g, '\\"')}"`);
  return `{${parts.join(',')}}`;
}

// ---- CLI (safe & minimal) ---------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const command = args[0] || 'export';
  const options = Object.fromEntries(
    args.slice(1).map((arg) => {
      const [k, v = 'true'] = arg.replace(/^--/, '').split('=');
      return [k, v];
    })
  );

  switch (command) {
    case 'export': {
      const dir = options.path || 'data/analytics/snapshots';
      const out = options.out || 'reports/analytics.prom';
      await exportPrometheusFromDir(dir, out);
      console.log(`[prom-exporter] wrote ${out}`);
      break;
    }
    case 'push': {
      const dir = options.path || 'data/analytics/snapshots';
      const pushgateway = options.pushgateway || process.env.PUSHGATEWAY_URL;
      if (!pushgateway) {
        console.error('[prom-exporter] missing --pushgateway or PUSHGATEWAY_URL');
        process.exit(2);
      }
      const body = await buildPrometheusBody(dir);
      await pushToGateway(pushgateway, body, { job: 'mobius_analytics' });
      console.log('[prom-exporter] pushed metrics to pushgateway');
      break;
    }
    default:
      console.error(`[prom-exporter] unknown command: ${command}`);
      process.exit(1);
  }
}
