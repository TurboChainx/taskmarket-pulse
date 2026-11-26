// Pure functions: snapshot in, numbers out. Every figure on the page is computed here from the raw API data,
// so tests can recompute it and anyone can reproduce it from data.json.

import { CHAINS } from './api.mjs';

const DAY = 86_400_000;

/** Base units (6 decimals) to dollars. OUSD and USDC are both counted at $1. */
export const usd = (base) => Number(BigInt(String(base ?? '0').split('.')[0] || '0')) / 1e6;

export const sum = (xs) => xs.reduce((a, b) => a + b, 0);

export function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** UTC Monday of the week containing the timestamp, as YYYY-MM-DD. */
export function weekStart(iso) {
  const d = new Date(iso);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back)).toISOString().slice(0, 10);
}

/** Open and still taking work: the API's own openTasks count uses the same rule (deadline not passed). */
export const isLiveOpen = (t, asOf) => t.status === 'open' && Date.parse(t.expiryTime) > Date.parse(asOf);
/** Status still "open" but past the deadline: bounties whose entries wait for the poster's decision. */
export const isAwaitingDecision = (t, asOf) => t.status === 'open' && Date.parse(t.expiryTime) <= Date.parse(asOf);

function countBy(xs, key) {
  const out = {};
  for (const x of xs) out[x[key]] = (out[x[key]] ?? 0) + 1;
  return out;
}

/** Weekly rows from the first task's week to the as-of week: tasks posted, rewards put up, distinct posters. */
export function weekly(tasks, asOf) {
  if (!tasks.length) return [];
  const first = weekStart(tasks.reduce((m, t) => (t.createdAt < m ? t.createdAt : m), tasks[0].createdAt));
  const last = weekStart(asOf);
  const rows = new Map();
  for (let w = first; w <= last; w = new Date(Date.parse(w) + 7 * DAY).toISOString().slice(0, 10)) {
    rows.set(w, { week: w, tasks: 0, rewards: 0, posters: new Set() });
  }
  for (const t of tasks) {
    const r = rows.get(weekStart(t.createdAt));
    if (!r) continue;
    r.tasks += 1;
    r.rewards += usd(t.reward);
    r.posters.add(t.requester);
  }
  return [...rows.values()].map((r) => ({ week: r.week, tasks: r.tasks, rewards: r.rewards, posters: r.posters.size }));
}

/** Share of a total held by the top n keys. */
function topShare(amounts, n) {
  const vals = [...amounts.values()].sort((a, b) => b - a);
  const total = sum(vals);
  return { share: total ? sum(vals.slice(0, n)) / total : 0, holders: vals.length, total };
}

function amountsBy(tasks, key) {
  const m = new Map();
  for (const t of tasks) m.set(t[key], (m.get(t[key]) ?? 0) + usd(t.reward));
  return m;
}

export function chainSummary(tasks, asOf) {
  const now = Date.parse(asOf);
  const completed = tasks.filter((t) => t.status === 'completed');
  const died = tasks.filter((t) => t.status === 'expired' || t.status === 'cancelled');
  const recentBounties = tasks.filter((t) => t.mode === 'bounty' && now - Date.parse(t.createdAt) <= 30 * DAY);
  const last7 = tasks.filter((t) => now - Date.parse(t.createdAt) <= 7 * DAY);
  return {
    tasks: tasks.length,
    rewardsPosted: sum(tasks.map((t) => usd(t.reward))),
    completed: completed.length,
    completedRewards: sum(completed.map((t) => usd(t.reward))),
    died: died.length,
    diedShare: completed.length + died.length ? died.length / (completed.length + died.length) : 0,
    open: tasks.filter((t) => isLiveOpen(t, asOf)).length,
    awaiting: tasks.filter((t) => isAwaitingDecision(t, asOf)).length,
    awaitingValue: sum(tasks.filter((t) => isAwaitingDecision(t, asOf)).map((t) => usd(t.reward))),
    awaitingEntries: sum(tasks.filter((t) => isAwaitingDecision(t, asOf)).map((t) => t.entries)),
    posters: new Set(tasks.map((t) => t.requester)).size,
    status: countBy(tasks, 'status'),
    mode: countBy(tasks, 'mode'),
    last7Tasks: last7.length,
    last7Rewards: sum(last7.map((t) => usd(t.reward))),
    medianEntries30d: median(recentBounties.map((t) => t.entries)),
    bounties30d: recentBounties.length,
    gatedOpenShare: (() => {
      const open = tasks.filter((t) => isLiveOpen(t, asOf));
      const value = sum(open.map((t) => usd(t.reward)));
      return value ? sum(open.filter((t) => t.gated).map((t) => usd(t.reward))) / value : 0;
    })(),
    weeks: weekly(tasks, asOf),
  };
}

/** Completed single-winner tasks posted in the window, aggregated poster -> winner. */
export function flows(allTasks, asOf, days = 30, topN = 7) {
  const now = Date.parse(asOf);
  const inWindow = allTasks.filter((t) => now - Date.parse(t.createdAt) <= days * DAY);
  const paid = inWindow.filter((t) => t.status === 'completed' && t.winner && t.awardCount === 1);
  const split = inWindow.filter((t) => t.status === 'completed' && t.awardCount > 1).length;
  const names = new Map();
  for (const t of paid) {
    names.set(`p:${t.requester}`, t.requesterName);
    names.set(`w:${t.winner}`, t.winnerName);
  }
  const byPoster = amountsBy(paid, 'requester');
  const byWinner = amountsBy(paid, 'winner');
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([k]) => k);
  const topPosters = new Set(top(byPoster));
  const topWinners = new Set(top(byWinner));
  const links = new Map();
  for (const t of paid) {
    const from = topPosters.has(t.requester) ? `p:${t.requester}` : 'p:other';
    const to = topWinners.has(t.winner) ? `w:${t.winner}` : 'w:other';
    const k = `${from}|${to}`;
    links.set(k, (links.get(k) ?? 0) + usd(t.reward));
  }
  const node = (key, amount, count) => {
    const addr = key.slice(2);
    return { key, addr: addr === 'other' ? null : addr, name: addr === 'other' ? null : names.get(key) ?? null, amount, count };
  };
  const posterNodes = [...topPosters].map((a) => node(`p:${a}`, byPoster.get(a), paid.filter((t) => t.requester === a).length));
  const winnerNodes = [...topWinners].map((a) => node(`w:${a}`, byWinner.get(a), paid.filter((t) => t.winner === a).length));
  const otherP = paid.filter((t) => !topPosters.has(t.requester));
  const otherW = paid.filter((t) => !topWinners.has(t.winner));
  if (otherP.length) posterNodes.push(node('p:other', sum(otherP.map((t) => usd(t.reward))), new Set(otherP.map((t) => t.requester)).size));
  if (otherW.length) winnerNodes.push(node('w:other', sum(otherW.map((t) => usd(t.reward))), new Set(otherW.map((t) => t.winner)).size));
  return {
    days,
    total: sum(paid.map((t) => usd(t.reward))),
    tasks: paid.length,
    splitTasksLeftOut: split,
    posters: byPoster.size,
    winners: byWinner.size,
    posterNodes,
    winnerNodes,
    links: [...links.entries()].map(([k, amount]) => {
      const [from, to] = k.split('|');
      return { from, to, amount };
    }),
  };
}

/** Time-series rows for the four required over-time views. The API returns platform-wide numbers (both chains). */
export function seriesRows(rows) {
  return rows.map((r) => ({
    bucket: r.bucket,
    activeAgents: r.activeAgents ?? 0,
    tasks: r.tasksCreated ?? 0,
    rewards: usd(r.rewardVolume),
    paid: usd(r.paidVolume),
  }));
}

/** Last 7 complete days against the 7 before them, from the 30-day daily series (today's partial day left out). */
export function weekOverWeek(daily30, asOf) {
  const today = asOf.slice(0, 10);
  const full = daily30.filter((r) => r.bucket < today);
  const a = full.slice(-7);
  const b = full.slice(-14, -7);
  const pct = (x, y) => (y ? (x - y) / y : null);
  return {
    from: a[0]?.bucket,
    to: a.at(-1)?.bucket,
    tasks: pct(sum(a.map((r) => r.tasks)), sum(b.map((r) => r.tasks))),
    rewards: pct(sum(a.map((r) => r.rewards)), sum(b.map((r) => r.rewards))),
    paid: pct(sum(a.map((r) => r.paid)), sum(b.map((r) => r.paid))),
    activeAgents: pct(sum(a.map((r) => r.activeAgents)) / 7, sum(b.map((r) => r.activeAgents)) / 7),
  };
}

export function derive(snap) {
  const chains = CHAINS.map((c) => ({ ...c, stats: snap.stats[c.id], ...chainSummary(snap.tasks[c.id], snap.asOf) }));
  const all = CHAINS.flatMap((c) => snap.tasks[c.id]);
  const completed = all.filter((t) => t.status === 'completed' && t.winner && t.awardCount === 1);
  const posting = topShare(amountsBy(all, 'requester'), 10);
  const winning = topShare(amountsBy(completed, 'winner'), 10);
  const series = Object.fromEntries(Object.entries(snap.series).map(([k, rows]) => [k, seriesRows(rows)]));
  const open = all
    .filter((t) => isLiveOpen(t, snap.asOf))
    .sort((a, b) => usd(b.reward) - usd(a.reward) || b.entries - a.entries);
  const last7 = sum(chains.map((c) => c.last7Tasks));
  return {
    asOf: snap.asOf,
    chains,
    totals: {
      tasksEver: snap.taskStats.count,
      rewardsEver: usd(snap.taskStats.totalRewards),
      listedTasks: all.length,
      registeredWorkers: snap.stats[CHAINS[0].id].registeredWorkers,
      activeAgents7d: snap.stats[CHAINS[0].id].activeAgents7d,
      activeWorkers7d: snap.stats[CHAINS[0].id].activeWorkers7d,
      openTasks: snap.stats[CHAINS[0].id].openTasks,
      paidWorkers: sum(CHAINS.map((c) => snap.stats[c.id].paidWorkers)),
    },
    breakdowns: snap.breakdowns,
    series,
    wow: weekOverWeek(series['30d'], snap.asOf),
    heatHour: snap.heatHour,
    heatMode: snap.heatMode,
    feed: snap.feed,
    flow: flows(all, snap.asOf, 30),
    concentration: { posting, winning },
    tempoShare7d: last7 ? chains.find((c) => c.key === 'tempo').last7Tasks / last7 : 0,
    open,
  };
}
