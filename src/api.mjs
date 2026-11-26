// Server-side data layer. Every number on the page comes from these public, read-only endpoints.
// The API refuses browser requests from other origins, so this only ever runs on a server or in CI.

export const API = process.env.TASKMARKET_API ?? 'https://api.taskmarket.dev/api';

export const CHAINS = [
  { id: 4217, key: 'tempo', name: 'Tempo', token: 'OUSD' },
  { id: 8453, key: 'base', name: 'Base', token: 'USDC' },
];

// Range switches for the time series. 90d and all-time are bucketed by week to stay readable.
export const SERIES = [
  { key: '7d', range: '7d', bucket: 'day' },
  { key: '30d', range: '30d', bucket: 'day' },
  { key: '90d', range: '90d', bucket: 'week' },
  { key: 'all', range: 'all', bucket: 'week' },
];
export const HEAT_RANGES = ['7d', '30d', '90d'];

// The endpoints, as the methods note prints them.
export const ENDPOINTS = [
  '/api/market/stats?chainId=4217|8453',
  '/api/tasks/stats',
  '/api/stats/breakdowns',
  '/api/stats/platform-time-series?range=7d|30d|90d|all&bucket=day|week',
  '/api/stats/activity-heatmap?range=7d|30d|90d&dimension=hourOfWeek|mode',
  '/api/stats/activity-feed?limit=40',
  '/api/tasks?chainId=4217|8453&sort=newest&limit=100&cursor=…',
];

const UA = 'taskmarket-pulse (read-only dashboard; https://github.com/TurboChainx/taskmarket-pulse)';

export async function getJSON(path, query = {}, tries = 4) {
  const qs = new URLSearchParams(query).toString();
  const url = `${API}${path}${qs ? `?${qs}` : ''}`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      if (attempt >= tries) throw err;
      await new Promise((r) => setTimeout(r, 750 * 2 ** attempt));
    }
  }
}

// Keep only the task fields the page uses: the full list carries long descriptions.
export function slimTask(t) {
  // First meaningful line, without markdown markers or literal "\n" sequences some posters type.
  const firstLine =
    String(t.description ?? '')
      .replace(/\\n/g, '\n')
      .split('\n')
      .map((s) => s.replace(/^[#>*\-\s]+/, '').replace(/\*\*/g, '').trim())
      .find(Boolean) ?? '';
  return {
    id: t.id,
    ref: t.referenceCode,
    chainId: t.chainId,
    createdAt: t.createdAt,
    expiryTime: t.expiryTime,
    status: t.status,
    mode: t.mode,
    reward: t.reward ?? '0',
    requester: String(t.requester ?? '').toLowerCase(),
    requesterName: t.requesterDisplayName ?? null,
    requesterActorType: t.requesterActorType ?? null,
    winner: t.primaryAward?.workerAddress ? String(t.primaryAward.workerAddress).toLowerCase() : null,
    winnerName: t.primaryAward?.workerAddress ? (t.workerDisplayName ?? null) : null,
    awardCount: t.awardCount ?? 0,
    entries: t.submissionCount ?? 0,
    gated: Boolean((t.verifiedBy ?? []).length || (t.identity ?? []).length),
    title: firstLine.slice(0, 140),
  };
}

async function allTasks(chainId) {
  const out = [];
  let cursor;
  for (let page = 0; page < 500; page++) {
    const q = { chainId, sort: 'newest', limit: 100 };
    if (cursor) q.cursor = cursor;
    const d = await getJSON('/tasks', q);
    out.push(...d.tasks.map(slimTask));
    cursor = d.nextCursor;
    if (!d.hasMore || !cursor) break;
  }
  return out;
}

export async function fetchSnapshot() {
  const asOf = new Date().toISOString();
  const stats = {};
  const tasks = {};
  for (const c of CHAINS) {
    stats[c.id] = await getJSON('/market/stats', { chainId: c.id });
    tasks[c.id] = await allTasks(c.id);
  }
  const taskStats = await getJSON('/tasks/stats');
  const breakdowns = await getJSON('/stats/breakdowns');
  const series = {};
  for (const s of SERIES) series[s.key] = await getJSON('/stats/platform-time-series', { range: s.range, bucket: s.bucket });
  const heatHour = {};
  for (const r of HEAT_RANGES) heatHour[r] = await getJSON('/stats/activity-heatmap', { range: r, dimension: 'hourOfWeek' });
  const heatMode = await getJSON('/stats/activity-heatmap', { range: '30d', dimension: 'mode' });
  const feed = await getJSON('/stats/activity-feed', { limit: 40 });
  return { asOf, api: API, stats, taskStats, breakdowns, series, heatHour, heatMode, feed: feed.items ?? [], tasks };
}
