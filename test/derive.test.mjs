import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usd, median, weekStart, weekly, chainSummary, flows, isLiveOpen, isAwaitingDecision, weekOverWeek } from '../src/derive.mjs';
import { niceTicks, esc, spread } from '../src/charts.mjs';

const AS_OF = '2026-11-26T21:00:00.000Z';
const task = (o) => ({
  id: o.id ?? `0x${Math.random().toString(16).slice(2)}`,
  chainId: 4217,
  createdAt: '2026-11-25T10:00:00.000Z',
  expiryTime: '2026-12-01T00:00:00.000Z',
  status: 'open',
  mode: 'bounty',
  reward: '1000000',
  requester: '0xaaa',
  requesterName: 'Poster A',
  winner: null,
  winnerName: null,
  awardCount: 0,
  entries: 0,
  gated: false,
  title: 't',
  ...o,
});

test('usd converts six-decimal base units', () => {
  assert.equal(usd('55630000'), 55.63);
  assert.equal(usd('0'), 0);
  assert.equal(usd(undefined), 0);
});

test('median handles odd, even and empty lists', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), 0);
});

test('weeks start on Monday 00:00 UTC', () => {
  assert.equal(weekStart('2026-11-26T21:00:00Z'), '2026-11-23'); // Thursday
  assert.equal(weekStart('2026-11-29T23:59:59Z'), '2026-11-23'); // Sunday
  assert.equal(weekStart('2026-11-23T00:00:00Z'), '2026-11-23'); // Monday
});

test('open means status open and deadline not passed', () => {
  assert.equal(isLiveOpen(task({ expiryTime: '2026-11-27T00:00:00Z' }), AS_OF), true);
  assert.equal(isLiveOpen(task({ expiryTime: '2026-11-26T20:59:59Z' }), AS_OF), false);
  assert.equal(isAwaitingDecision(task({ expiryTime: '2026-11-26T20:59:59Z' }), AS_OF), true);
  assert.equal(isAwaitingDecision(task({ status: 'completed', expiryTime: '2026-11-01T00:00:00Z' }), AS_OF), false);
});

test('weekly counts tasks, rewards and distinct posters per week', () => {
  const rows = weekly(
    [
      task({ createdAt: '2026-11-17T01:00:00Z', requester: '0x1', reward: '2000000' }),
      task({ createdAt: '2026-11-24T01:00:00Z', requester: '0x1' }),
      task({ createdAt: '2026-11-25T01:00:00Z', requester: '0x2' }),
      task({ createdAt: '2026-11-26T01:00:00Z', requester: '0x2' }),
    ],
    AS_OF,
  );
  assert.deepEqual(rows, [
    { week: '2026-11-16', tasks: 1, rewards: 2, posters: 1 },
    { week: '2026-11-23', tasks: 3, rewards: 3, posters: 2 },
  ]);
});

test('chainSummary: no-winner share, median entries, live open and awaiting decision', () => {
  const s = chainSummary(
    [
      task({ status: 'completed', entries: 10 }),
      task({ status: 'completed', entries: 2 }),
      task({ status: 'expired', entries: 4 }),
      task({ status: 'cancelled', mode: 'claim' }),
      task({ status: 'open', entries: 6, gated: true, reward: '3000000' }),
      task({ status: 'open', expiryTime: '2026-11-20T00:00:00Z', entries: 9, reward: '5000000' }),
    ],
    AS_OF,
  );
  assert.equal(s.tasks, 6);
  assert.equal(s.completed, 2);
  assert.equal(s.died, 2);
  assert.equal(s.diedShare, 0.5);
  assert.equal(s.open, 1);
  assert.equal(s.awaiting, 1);
  assert.equal(s.awaitingValue, 5);
  assert.equal(s.awaitingEntries, 9);
  assert.equal(s.gatedOpenShare, 1);
  assert.equal(s.medianEntries30d, 6); // bounties' entries 10, 2, 4, 6, 9 (the claim is left out)
});

test('flows: ribbons add up to the total, split awards are left out', () => {
  const tasks = [
    task({ status: 'completed', requester: '0xp1', winner: '0xw1', awardCount: 1, reward: '4000000' }),
    task({ status: 'completed', requester: '0xp1', winner: '0xw2', awardCount: 1, reward: '1000000' }),
    task({ status: 'completed', requester: '0xp2', winner: '0xw1', awardCount: 1, reward: '2000000' }),
    task({ status: 'completed', requester: '0xp3', winner: '0xw3', awardCount: 2, reward: '9000000' }),
    task({ status: 'completed', requester: '0xp4', winner: '0xw4', awardCount: 1, reward: '7000000', createdAt: '2026-09-01T00:00:00Z' }),
  ];
  const f = flows(tasks, AS_OF, 30, 1);
  assert.equal(f.total, 7);
  assert.equal(f.tasks, 3);
  assert.equal(f.splitTasksLeftOut, 1);
  const linked = f.links.reduce((a, l) => a + l.amount, 0);
  assert.equal(linked, f.total);
  assert.equal(f.posterNodes[0].addr, '0xp1');
  assert.equal(f.posterNodes.at(-1).key, 'p:other');
  assert.equal(f.posterNodes.reduce((a, n) => a + n.amount, 0), f.total);
  assert.equal(f.winnerNodes.reduce((a, n) => a + n.amount, 0), f.total);
});

test('weekOverWeek leaves out the partial current day', () => {
  const rows = Array.from({ length: 15 }, (_, i) => ({
    bucket: new Date(Date.parse('2026-11-12T00:00:00Z') + i * 864e5).toISOString().slice(0, 10),
    tasks: i < 7 ? 1 : i < 14 ? 2 : 100,
    rewards: 1,
    paid: 1,
    activeAgents: 10,
  }));
  const w = weekOverWeek(rows, '2026-11-26T12:00:00Z');
  assert.equal(w.to, '2026-11-25');
  assert.equal(w.tasks, 1); // 14 vs 7
});

test('chart helpers', () => {
  assert.deepEqual(niceTicks(330), [0, 100, 200, 300, 400]);
  assert.equal(esc('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  const ys = spread([10, 12, 14], 10, 0, 100);
  assert.deepEqual(ys, [10, 20, 30]);
  const capped = spread([90, 95, 99], 10, 0, 100);
  assert.deepEqual(capped, [80, 90, 100]);
});
