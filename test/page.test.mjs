// Renders the whole site from a small synthetic snapshot and checks the rules the bounty sets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siteFiles } from '../src/site.mjs';
import { VIEWS } from '../src/render.mjs';

const AS_OF = '2026-11-26T21:00:00.000Z';
const day = (i) => new Date(Date.parse('2026-10-27T00:00:00Z') + i * 864e5).toISOString().slice(0, 10);
const series = (n) =>
  Array.from({ length: n }, (_, i) => ({ bucket: day(i), tasksCreated: i, rewardVolume: String(i * 1e6), completedTasks: 1, newAgents: 1, activeAgents: 10 + i, paidVolume: String(i * 5e5), settlements: 1, ratings: 0 }));
const t = (o) => ({ id: '0x1', ref: 'TSK-1', chainId: 4217, createdAt: '2026-11-20T00:00:00Z', expiryTime: '2026-12-20T00:00:00Z', status: 'open', mode: 'bounty', reward: '5000000', requester: '0xa', requesterName: 'PosterA', requesterActorType: 'agent', winner: null, winnerName: null, awardCount: 0, entries: 3, gated: false, title: '<script>alert(1)</script> title', ...o });
const heat = { rowKeys: ['0', '1'], colKeys: ['0', '1'], cells: [{ row: '0', col: '0', count: 3, volume: '0' }], maxCount: 3 };
const snap = {
  asOf: AS_OF,
  api: 'https://api.taskmarket.dev/api',
  stats: { 4217: { registeredWorkers: 10, activeWorkers7d: 5, activeAgents7d: 4, openTasks: 2, paidWorkers: 3, activeWallets: 7 }, 8453: { registeredWorkers: 10, activeWorkers7d: 5, activeAgents7d: 4, openTasks: 2, paidWorkers: 6, activeWallets: 9 } },
  taskStats: { count: 4, totalRewards: '20000000' },
  breakdowns: { status: [{ status: 'open', count: 2 }, { status: 'completed', count: 2 }], mode: [{ mode: 'bounty', count: 4 }], actorType: [] },
  series: { '7d': series(8), '30d': series(31), '90d': series(13), all: series(20) },
  heatHour: { '7d': heat, '30d': heat, '90d': heat },
  heatMode: { rowKeys: ['bounty'], colKeys: ['2026-11-26'], cells: [{ row: 'bounty', col: '2026-11-26', count: 1, volume: '0' }], maxCount: 1 },
  feed: [{ type: 'task_created', timestamp: '2026-11-26T20:59:00Z', taskId: '0x1', taskTitle: 'A <b>task</b>', chainId: 4217, actor: '0xabcdef0123456789', actorType: 'agent', amount: null, rating: null }],
  tasks: {
    4217: [t({}), t({ id: '0x2', status: 'completed', winner: '0xw', winnerName: 'WinnerW', awardCount: 1 })],
    8453: [t({ id: '0x3', chainId: 8453, requester: '0xb' }), t({ id: '0x4', chainId: 8453, status: 'expired' })],
  },
};

const { files } = siteFiles(snap, { siteUrl: 'https://example.github.io/taskmarket-pulse/', repoUrl: 'https://github.com/x/taskmarket-pulse' });
const index = files.get('index.html');

test('every view has a page and a share card', () => {
  for (const v of VIEWS) {
    assert.ok(files.has(v.key === 'flow' ? 'index.html' : `v/${v.key}/index.html`), v.key);
    const png = files.get(`og/${v.key}.png`);
    assert.ok(png && png.length > 1000 && png.subarray(1, 4).toString() === 'PNG', `og ${v.key}`);
  }
});

test('the page states data time, methods, and that it is unofficial', () => {
  assert.match(index, /Data as of <b>26 Nov 2026, 21:00 UTC<\/b>/);
  assert.match(index, /Made for a paid Taskmarket bounty\. Not an official Taskmarket product\./);
  assert.match(index, /\/api\/stats\/activity-heatmap/);
  assert.match(index, /data\.json/);
});

test('no wallet code, trackers or third-party scripts', () => {
  assert.doesNotMatch(index, /<script[^>]+src=/i);
  assert.doesNotMatch(index, /ethereum|walletconnect|metamask|gtag|google-analytics|plausible|segment\.io/i);
  assert.doesNotMatch(index, /document\.cookie|localStorage/);
});

test('task text from the API is escaped', () => {
  assert.doesNotMatch(index, /<script>alert\(1\)<\/script>/);
  assert.match(index, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(index, /A <b>task<\/b>/);
});

test('share tags point at absolute card URLs per view', () => {
  assert.match(index, /<meta property="og:image" content="https:\/\/example\.github\.io\/taskmarket-pulse\/og\/flow\.png">/);
  assert.match(files.get('v/heat/index.html'), /og\/heat\.png/);
  assert.match(index, /twitter:card" content="summary_large_image"/);
});

test('headline numbers come straight from the snapshot', () => {
  assert.match(index, /Open tasks<\/p><p class="kv mono">2</);
  assert.match(index, /Workers ever paid<\/p><p class="kv mono">9</);
  assert.match(index, /Rewards ever put up<\/p><p class="kv mono">\$20\.00</);
});
