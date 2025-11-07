const DEFAULT_WINDOW_DAYS = 7;

export function buildParams(videoId, windowDays = DEFAULT_WINDOW_DAYS) {
  if (!videoId) {
    throw new Error('videoId is required to build metric parameters');
  }

  const safeWindow = Number.isFinite(windowDays) ? Math.max(1, Math.floor(windowDays)) : DEFAULT_WINDOW_DAYS;
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - (safeWindow - 1));

  return {
    videoId,
    windowDays: safeWindow,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10)
  };
}

export function normaliseTimeseries(series = []) {
  return series
    .filter(Boolean)
    .map((entry) => {
      const date = entry.date ?? entry.Day ?? entry.day;
      const metrics = entry.metrics ?? entry;
      const numericMetrics = Object.fromEntries(
        Object.entries(metrics)
          .filter(([key]) => key !== 'date' && key !== 'Day' && key !== 'day')
          .map(([key, value]) => [key, typeof value === 'number' ? value : Number(value) || 0])
      );

      return {
        date: date ? new Date(date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        metrics: numericMetrics
      };
    });
}

export async function fetchMetrics(client, videoId, windowDays = DEFAULT_WINDOW_DAYS) {
  if (!client || typeof client.getVideoMetrics !== 'function') {
    throw new TypeError('client.getVideoMetrics(params) must be available');
  }

  const params = buildParams(videoId, windowDays);
  const raw = await client.getVideoMetrics(params);
  const timeseries = normaliseTimeseries(raw);

  return {
    videoId,
    windowDays: params.windowDays,
    startDate: params.startDate,
    endDate: params.endDate,
    timeseries,
    summary: summariseMetrics(timeseries)
  };
}

export function summariseMetrics(timeseries) {
  if (!Array.isArray(timeseries) || timeseries.length === 0) {
    return { datapoints: 0, totals: {}, averages: {} };
  }

  const totals = {};
  for (const { metrics } of timeseries) {
    for (const [key, value] of Object.entries(metrics)) {
      totals[key] = (totals[key] ?? 0) + value;
    }
  }

  const averages = Object.fromEntries(
    Object.entries(totals).map(([key, value]) => [key, value / timeseries.length])
  );

  return {
    datapoints: timeseries.length,
    totals,
    averages
  };
}
