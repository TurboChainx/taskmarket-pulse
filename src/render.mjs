import { ENDPOINTS, SERIES, HEAT_RANGES } from './api.mjs';
import { C, esc, fmt, dayLabel, lineChart, dualLineChart, barList, splitBar, heatmap, flowChart } from './charts.mjs';
import { usd } from './derive.mjs';

export const VIEWS = [
  { key: 'flow', n: '01', label: 'Money flow' },
  { key: 'pulse', n: '02', label: 'Over time' },
  { key: 'chains', n: '03', label: 'Tempo vs Base' },
  { key: 'modes', n: '04', label: 'Modes and status' },
  { key: 'heat', n: '05', label: 'When it is busy' },
  { key: 'insights', n: '06', label: 'What it means' },
  { key: 'open', n: '07', label: 'Open now' },
  { key: 'feed', n: '08', label: 'Live feed' },
];

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const RANGE_LABEL = { '7d': '7 days', '30d': '30 days', '90d': '90 days', all: 'All time' };
const STATUS_COLOR = {
  completed: C.salmon,
  open: C.cream,
  claimed: C.paper,
  pending_approval: C.muted,
  worker_selected: C.muted,
  expired: C.line,
  cancelled: C.maroon,
};
const FEED_VERB = {
  task_created: 'posted',
  task_submitted: 'entry on',
  task_claimed: 'claimed',
  task_pitched: 'pitched on',
  bid_placed: 'bid on',
  task_rated: 'rated',
};

export const asOfText = (iso) => {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
};

const taskUrl = (id) => `https://taskmarket.dev/tasks/${encodeURIComponent(id)}`;
const nameOrAddr = (name, addr) => (name ? esc(name) : `<span class="mono">${esc(fmt.short(addr))}</span>`);

function share(key, siteUrl, text) {
  const url = `${siteUrl}v/${key}/`;
  const t = encodeURIComponent(text);
  const u = encodeURIComponent(url);
  return `<div class="share" aria-label="Share this view">
<a class="btn" href="${esc(url)}" data-copy="${esc(url)}">Copy link</a>
<a class="btn" href="https://x.com/intent/post?text=${t}&amp;url=${u}" rel="noopener" target="_blank">Post on X</a>
<a class="btn" href="https://www.linkedin.com/sharing/share-offsite/?url=${u}" rel="noopener" target="_blank">LinkedIn</a>
<a class="btn ghost" href="${esc(siteUrl)}og/${key}.png" target="_blank">Card</a></div>`;
}

function head(key, n, title, siteUrl, shareText, sub = '') {
  return `<header class="vh"><div><p class="kick mono">${n} · ${esc(VIEWS.find((v) => v.key === key).label)}</p><h2>${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${share(key, siteUrl, shareText)}</header>`;
}

function kpis(d) {
  const t = d.totals;
  const tempo = d.chains.find((c) => c.key === 'tempo');
  const base = d.chains.find((c) => c.key === 'base');
  const tile = (label, value, src, extra = '') =>
    `<div class="kpi"><p class="kl">${label}</p><p class="kv mono">${value}</p>${extra ? `<p class="kx">${extra}</p>` : ''}<p class="ks mono">${src}</p></div>`;
  return `<div class="kpis">
${tile('Open tasks', fmt.int(t.openTasks), '/market/stats openTasks')}
${tile('Active agents, last 7 days', fmt.int(t.activeAgents7d), '/market/stats activeAgents7d')}
${tile('Tasks ever posted', fmt.int(t.tasksEver), '/tasks/stats count')}
${tile('Rewards ever put up', fmt.usd(t.rewardsEver), '/tasks/stats totalRewards')}
${tile('Workers ever paid', fmt.int(t.paidWorkers), '/market/stats paidWorkers', `Tempo ${fmt.int(tempo.stats.paidWorkers)} · Base ${fmt.int(base.stats.paidWorkers)}`)}
${tile('Registered workers', fmt.int(t.registeredWorkers), '/market/stats registeredWorkers')}
</div>`;
}

function flowView(d, siteUrl) {
  const f = d.flow;
  const top = f.posterNodes[0];
  const topName = top ? top.name ?? fmt.short(top.addr) : '';
  const topShare = top && f.total ? top.amount / f.total : 0;
  return `<section id="flow" class="view hero">
<div class="herohead"><p class="kick mono">01 · Money flow · last ${f.days} days · both chains</p>
<h1>Who posts, who wins, and where the money <em>goes</em>.</h1>
<p class="lede">A live picture of Taskmarket from its public API, rebuilt every 30 minutes. ${fmt.int(f.posters)} posters paid ${fmt.int(f.winners)} different winners ${fmt.usd(f.total)} on ${fmt.int(f.tasks)} single-winner tasks posted in the last ${f.days} days.</p>
${share('flow', siteUrl, `${topName} funded ${fmt.pct(topShare)} of the rewards paid on Taskmarket's single-winner tasks in the last ${f.days} days.`)}</div>
${kpis(d)}
<figure class="panel"><p class="swipe mono">Swipe the chart sideways to see the winners →</p><div class="scrollx">${flowChart({ flow: f, title: `Rewards of completed single-winner tasks posted in the last ${f.days} days, from posters to winners` })}</div>
<figcaption><strong>${esc(topName)}</strong> funded <strong class="mono">${fmt.pct(topShare)}</strong> of it on its own (${fmt.usd(top?.amount ?? 0)} across ${fmt.int(top?.count ?? 0)} tasks). Ribbons are sized by reward. ${fmt.int(f.splitTasksLeftOut)} completed tasks with split awards are left out, because the API names only their first winner.</figcaption></figure>
</section>`;
}

function pulseView(d, siteUrl) {
  const charts = [
    { key: 'activeAgents', title: 'Active agents', format: fmt.int, axis: fmt.intAxis, color: C.cream },
    { key: 'tasks', title: 'Tasks posted', format: fmt.int, axis: fmt.intAxis, color: C.salmon },
    { key: 'rewards', title: 'Rewards put up', format: fmt.usd, axis: fmt.usdAxis, color: C.salmon },
    { key: 'paid', title: 'Rewards paid', format: fmt.usd, axis: fmt.usdAxis, color: C.paper },
  ];
  const panels = SERIES.map((s) => {
    const rows = d.series[s.key];
    const per = s.bucket === 'day' ? 'per day' : 'per week';
    return `<div class="tabpanel" data-group="pulse" data-key="${s.key}"${s.key === '30d' ? '' : ' hidden'}><div class="grid2">${charts
      .map((c) => {
        const lastFull = rows.length > 2 ? rows.at(-2) : rows.at(-1);
        return `<figure class="panel"><figcaption class="ct"><span>${c.title} <span class="muted">${per}</span></span><span class="mono big">${c.format(lastFull[c.key])}</span></figcaption>${lineChart({ rows, key: c.key, title: `${c.title} ${per}, ${RANGE_LABEL[s.key]}`, format: c.format, axis: c.axis, color: c.color, id: `p-${s.key}-${c.key}` })}<p class="foot mono">${dayLabel(lastFull.bucket.slice(0, 10))}${s.bucket === 'week' ? ' week' : ''} · dashed = ${s.bucket === 'day' ? 'today' : 'this week'} so far</p></figure>`;
      })
      .join('')}</div></div>`;
  }).join('');
  const w = d.wow;
  return `<section id="pulse" class="view">${head('pulse', '02', 'The market over time', siteUrl, 'Taskmarket over time: active agents, tasks posted, rewards put up and paid.', 'Both chains together: the time-series endpoint has no chain filter.')}
<div class="switch" role="tablist" data-group="pulse">${SERIES.map((s) => `<button role="tab" data-key="${s.key}" aria-selected="${s.key === '30d'}">${RANGE_LABEL[s.key]}</button>`).join('')}</div>
${panels}
<p class="wow">Last 7 full days (${dayLabel(w.from)} to ${dayLabel(w.to)}) against the 7 before: tasks posted <span class="mono">${fmt.signedPct(w.tasks)}</span>, rewards put up <span class="mono">${fmt.signedPct(w.rewards)}</span>, rewards paid <span class="mono">${fmt.signedPct(w.paid)}</span>, daily active agents <span class="mono">${fmt.signedPct(w.activeAgents)}</span>.</p>
</section>`;
}

function mergeWeeks(chains, field) {
  const weeks = [...new Set(chains.flatMap((c) => c.weeks.map((r) => r.week)))].sort();
  return weeks.map((week) => {
    const row = { week };
    for (const c of chains) row[c.key] = c.weeks.find((r) => r.week === week)?.[field] ?? 0;
    return row;
  });
}

function chainsView(d, siteUrl) {
  const [tempo, base] = ['tempo', 'base'].map((k) => d.chains.find((c) => c.key === k));
  const row = (label, a, b, src) => `<tr><th scope="row">${label}<span class="src mono">${src}</span></th><td class="mono">${a}</td><td class="mono">${b}</td></tr>`;
  const series = [
    { key: 'tempo', label: 'Tempo', color: C.salmon },
    { key: 'base', label: 'Base', color: C.cream },
  ];
  const legend = `<p class="legend"><span class="sw" style="background:${C.salmon}"></span>Tempo (OUSD) <span class="sw" style="background:${C.cream}"></span>Base (USDC)</p>`;
  return `<section id="chains" class="view">${head('chains', '03', 'Tempo and Base are two different markets', siteUrl, `Tempo vs Base on Taskmarket: ${fmt.pct(tempo.diedShare)} vs ${fmt.pct(base.diedShare)} of tasks end with no winner.`, 'Per-chain numbers are computed from the public task list for each chain.')}
<div class="grid2 wide">
<div class="panel"><table class="cmp"><thead><tr><th></th><th>Tempo <span class="muted">OUSD</span></th><th>Base <span class="muted">USDC</span></th></tr></thead><tbody>
${row('Tasks listed', fmt.int(tempo.tasks), fmt.int(base.tasks), '/tasks?chainId')}
${row('Distinct posters', fmt.int(tempo.posters), fmt.int(base.posters), 'requester')}
${row('Rewards put up', fmt.usd(tempo.rewardsPosted), fmt.usd(base.rewardsPosted), 'sum of reward')}
${row('Completed tasks', fmt.int(tempo.completed), fmt.int(base.completed), 'status completed')}
${row('Rewards on completed tasks', fmt.usd(tempo.completedRewards), fmt.usd(base.completedRewards), 'sum of reward')}
${row('Closed with no winner', fmt.pct(tempo.diedShare), fmt.pct(base.diedShare), 'expired + cancelled')}
${row('Median entries per bounty, 30 days', fmt.int(tempo.medianEntries30d), fmt.int(base.medianEntries30d), 'submissionCount')}
${row('Tasks posted, last 7 days', fmt.int(tempo.last7Tasks), fmt.int(base.last7Tasks), 'createdAt')}
${row('Past deadline, still undecided', fmt.int(tempo.awaiting), fmt.int(base.awaiting), 'open, expiryTime passed')}
${row('Open value needing TAP', fmt.pct(tempo.gatedOpenShare), fmt.pct(base.gatedOpenShare), 'verifiedBy')}
${row('Workers ever paid', fmt.int(tempo.stats.paidWorkers), fmt.int(base.stats.paidWorkers), '/market/stats')}
${row('Active wallets', fmt.int(tempo.stats.activeWallets), fmt.int(base.stats.activeWallets), '/market/stats')}
</tbody></table></div>
<div class="stack">
<figure class="panel"><figcaption class="ct"><span>Tasks posted per week</span></figcaption>${legend}${dualLineChart({ rows: mergeWeeks(d.chains, 'tasks'), series, title: 'Tasks posted per week, Tempo and Base', format: fmt.int, axis: fmt.intAxis, id: 'c-tasks' })}</figure>
<figure class="panel"><figcaption class="ct"><span>Distinct task posters per week</span></figcaption>${legend}${dualLineChart({ rows: mergeWeeks(d.chains, 'posters'), series, title: 'Distinct task posters per week, Tempo and Base', format: fmt.int, axis: fmt.intAxis, id: 'c-posters' })}<p class="foot mono">Weeks start Monday 00:00 UTC; the last week is still running.</p></figure>
</div></div></section>`;
}

function modesView(d, siteUrl) {
  const bd = d.breakdowns;
  const modes = [...bd.mode].sort((a, b) => b.count - a.count).map((m) => ({ label: m.mode, value: m.count }));
  const statuses = [...bd.status].sort((a, b) => b.count - a.count).map((s) => ({ label: s.status.replace('_', ' '), value: s.count, color: STATUS_COLOR[s.status] ?? C.muted }));
  const perChain = d.chains
    .map((c) => {
      const parts = Object.entries(c.status)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => ({ label: k.replace('_', ' '), value: v, color: STATUS_COLOR[k] ?? C.muted }));
      const modesTxt = Object.entries(c.mode)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${esc(k)} <span class="mono">${fmt.int(v)}</span>`)
        .join(' · ');
      return `<div class="chainrow"><p class="ct"><span>${c.name}</span><span class="mono muted">${fmt.int(c.tasks)} tasks</span></p>${splitBar({ parts, total: c.tasks, id: `st-${c.key}`, title: `${c.name} tasks by status` })}
<p class="keys">${parts.map((p) => `<span><span class="sw" style="background:${p.color}"></span>${esc(p.label)} <span class="mono">${fmt.int(p.value)}</span></span>`).join('')}</p><p class="keys">Modes: ${modesTxt}</p></div>`;
    })
    .join('');
  return `<section id="modes" class="view">${head('modes', '04', 'Bounties are almost everything', siteUrl, 'Taskmarket tasks by mode and status, both chains.', 'Mode and status counts across both chains, then each chain on its own.')}
<div class="grid2">
<figure class="panel"><figcaption class="ct"><span>Tasks by mode</span><span class="mono src">/stats/breakdowns</span></figcaption>${barList({ items: modes, id: 'bd-mode', title: 'Tasks by mode, both chains' })}</figure>
<figure class="panel"><figcaption class="ct"><span>Tasks by status</span><span class="mono src">/stats/breakdowns</span></figcaption>${barList({ items: statuses, id: 'bd-status', title: 'Tasks by status, both chains' })}</figure>
</div>
<div class="panel">${perChain}<p class="foot mono">Per chain: /api/tasks?chainId=4217 and 8453 (listed tasks only)</p></div>
</section>`;
}

function heatView(d, siteUrl) {
  const hourPanels = HEAT_RANGES.map((r) => {
    const h = d.heatHour[r];
    return `<div class="tabpanel" data-group="heat" data-key="${r}"${r === '30d' ? '' : ' hidden'}><div class="scrollx">${heatmap({
      rowKeys: h.rowKeys,
      colKeys: h.colKeys,
      cells: h.cells,
      rowLabel: (k) => DOW[Number(k)] ?? k,
      colLabel: (k, short) => (short ? String(k).padStart(2, '0') : `${String(k).padStart(2, '0')}:00 UTC`),
      colTick: (k) => Number(k) % 3 === 0,
      id: `hh-${r}`,
      title: `Market activity by weekday and hour (UTC), ${RANGE_LABEL[r]}`,
    })}</div></div>`;
  }).join('');
  const m = d.heatMode;
  const modeMap = heatmap({
    rowKeys: m.rowKeys,
    colKeys: m.colKeys,
    cells: m.cells,
    rowLabel: (k) => k,
    colLabel: (k, short) => (short ? dayLabel(k) : dayLabel(k)),
    colTick: (k, i) => i % 7 === 0,
    cell: 26,
    gap: 4,
    lw: 110,
    id: 'hm-mode',
    title: 'Market activity by task mode and day, last 30 days',
  });
  return `<section id="heat" class="view">${head('heat', '05', 'When the market is busy', siteUrl, 'When Taskmarket is busy: activity by weekday and hour.', 'Activity counts from the heatmap endpoint, both chains. Hours are UTC.')}
<div class="switch" role="tablist" data-group="heat">${HEAT_RANGES.map((r) => `<button role="tab" data-key="${r}" aria-selected="${r === '30d'}">${RANGE_LABEL[r]}</button>`).join('')}</div>
<figure class="panel"><figcaption class="ct"><span>By weekday and hour</span><span class="mono src">/stats/activity-heatmap dimension=hourOfWeek</span></figcaption>${hourPanels}</figure>
<figure class="panel"><figcaption class="ct"><span>By task mode and day, last 30 days</span><span class="mono src">dimension=mode</span></figcaption><div class="scrollx">${modeMap}</div></figure>
</section>`;
}

function insightsView(d, siteUrl) {
  const [tempo, base] = ['tempo', 'base'].map((k) => d.chains.find((c) => c.key === k));
  const f = d.flow;
  const top = f.posterNodes[0];
  const card = (num, text, how) => `<article class="panel ins"><p class="num mono">${num}</p><p>${text}</p><p class="how">${how}</p></article>`;
  const cards = [
    card(fmt.pct(d.concentration.posting.share), `of all listed rewards were put up by the top 10 posters, out of ${fmt.int(d.concentration.posting.holders)} posters.`, 'Sum of reward per requester across both task lists, top 10 over total.'),
    card(fmt.pct(d.concentration.winning.share), `of rewards on completed single-winner tasks went to the top 10 winners, out of ${fmt.int(d.concentration.winning.holders)}. Winning is spread wider than posting.`, 'Sum of reward per primary winner, completed tasks with one award.'),
    card(`${fmt.pct(base.diedShare)} vs ${fmt.pct(tempo.diedShare)}`, 'of closed tasks ended with no winner on Base, against Tempo. On Base, many tasks are left to expire or are cancelled.', 'Expired + cancelled over expired + cancelled + completed, per chain.'),
    card(`${fmt.int(base.medianEntries30d)} vs ${fmt.int(tempo.medianEntries30d)}`, 'entries for the median bounty posted in the last 30 days, Base against Tempo. A Base bounty is a crowd; a Tempo bounty is a small room.', 'Median submissionCount of bounties created in the last 30 days.'),
    card(fmt.pct(d.tempoShare7d), 'of the tasks posted in the last 7 days were on Tempo. The market has moved chains.', 'Tasks with createdAt in the last 7 days, Tempo over both.'),
    card(fmt.pct(top && f.total ? top.amount / f.total : 0), `of the money paid on recent single-winner tasks came from one poster, ${esc(top?.name ?? fmt.short(top?.addr))}.`, `Completed single-winner tasks posted in the last ${f.days} days.`),
    card(fmt.pct(tempo.gatedOpenShare), 'of the reward value open on Tempo right now is only for TAP-verified agents.', 'Open tasks whose verifiedBy or identity list is not empty, by reward.'),
    card(
      fmt.int(tempo.awaiting + base.awaiting),
      `tasks are past their deadline and still undecided: ${fmt.int(tempo.awaitingEntries + base.awaitingEntries)} entries are waiting on the poster, with ${fmt.usd(tempo.awaitingValue + base.awaitingValue)} still held.`,
      'Status open with an expiryTime before the data time.',
    ),
  ];
  return `<section id="insights" class="view">${head('insights', '06', 'What the numbers say', siteUrl, 'Eight things the Taskmarket numbers show that are not obvious.', 'Each figure says how it was computed, so it can be checked against data.json.')}
<div class="grid4">${cards.join('')}</div></section>`;
}

function openView(d, siteUrl) {
  const list = d.open.slice(0, 48);
  const value = d.open.reduce((a, t) => a + usd(t.reward), 0);
  const max = Math.max(1, ...list.map((t) => usd(t.reward)));
  const tiles = list
    .map((t) => {
      const r = usd(t.reward);
      const size = r >= max * 0.5 ? 'l' : r >= 5 ? 'm' : 's';
      const chain = t.chainId === 4217 ? 'Tempo' : 'Base';
      const dots = Math.min(40, t.entries);
      return `<a class="tile ${size}${t.chainId === 4217 ? ' tempo' : ' base'}" href="${taskUrl(t.id)}" target="_blank" rel="noopener" title="${esc(t.title)}">
<span class="tr mono">${fmt.usd(r)}</span><span class="tt">${esc(t.title)}</span>
<span class="tm"><span class="mono">${esc(chain)} · ${esc(t.mode)}${t.gated ? ' · TAP' : ''}</span><span class="mono">${fmt.int(t.entries)} entries</span></span>
<span class="dots" aria-hidden="true">${'<i></i>'.repeat(dots)}</span></a>`;
    })
    .join('');
  return `<section id="open" class="view">${head('open', '07', 'Open right now', siteUrl, `${fmt.int(d.open.length)} open tasks on Taskmarket worth ${fmt.usd(value)}.`, `${fmt.int(d.open.length)} listed tasks still taking work, worth ${fmt.usd(value)}. The ${list.length} largest; each dot is an entry.`)}
<div class="tiles">${tiles}</div></section>`;
}

function feedView(d, siteUrl) {
  const items = d.feed
    .map((e) => {
      const chain = e.chainId === 4217 ? 'Tempo' : e.chainId === 8453 ? 'Base' : String(e.chainId ?? '');
      return `<li><time class="mono" datetime="${esc(e.timestamp)}">${esc(e.timestamp.slice(11, 16))} UTC</time><span class="chip mono">${esc(chain)}</span><span class="fa"><span class="mono">${esc(fmt.short(e.actor))}</span> ${esc(FEED_VERB[e.type] ?? e.type)} <a href="${taskUrl(e.taskId)}" target="_blank" rel="noopener">${esc(e.taskTitle)}</a>${e.amount ? ` <span class="mono">${fmt.usd(usd(e.amount))}</span>` : ''}${e.rating != null ? ` <span class="mono">rating ${esc(e.rating)}</span>` : ''}</span></li>`;
    })
    .join('');
  return `<section id="feed" class="view">${head('feed', '08', 'Latest activity', siteUrl, 'The latest activity on Taskmarket.', `The ${d.feed.length} most recent events at the data time, both chains.`)}
<ol class="feed panel">${items}</ol></section>`;
}

function methods(d, siteUrl, repoUrl) {
  return `<footer class="foot-main"><div class="grid2 wide">
<div><h2 class="small">Methods</h2>
<p>Data comes from Taskmarket's public API (${esc(d.api ?? 'https://api.taskmarket.dev/api')}). It is fetched on the server, never in your browser. A scheduled job rebuilds the page every 30 minutes, and the hosting caches each page for a few minutes. Data as of <span class="mono">${asOfText(d.asOf)}</span>.</p>
<ul class="mono endpoints">${ENDPOINTS.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
<p>The stats endpoints (breakdowns, time series, heatmap, feed) take no chain parameter, so they cover both chains. Per-chain figures come from the public task list for each chain. That list leaves out private and unlisted tasks: it holds ${fmt.int(d.totals.listedTasks)} tasks against the platform total of ${fmt.int(d.totals.tasksEver)}.</p>
<p>Amounts are base units divided by 10<sup>6</sup>; OUSD and USDC are both counted at $1. Weeks start Monday 00:00 UTC. Heatmap hours are UTC. Names are the display names the API returns; a wallet without one is shown as a shortened address.</p>
<p>Every number on this page can be recomputed from <a href="${esc(siteUrl)}data.json">data.json</a>, the exact snapshot it was built from.</p></div>
<div><h2 class="small">About</h2>
<p><strong>Made for a paid Taskmarket bounty. Not an official Taskmarket product.</strong></p>
<p>Read-only: no wallet connection, no cookies, no analytics or tracking. Open source under the MIT licence: <a href="${esc(repoUrl)}">${esc(repoUrl.replace('https://', ''))}</a>. Fonts: Instrument Serif, Inter Tight and Departure Mono, under the SIL Open Font License.</p>
<p class="signoff"><img src="${esc(siteUrl)}brand/mark-128.png" alt="Taskmarket mark" width="64" height="64"><span class="mono">taskmarket.dev</span></p></div></div></footer>`;
}

const CSS = (base) => `
@font-face{font-family:'Inter Tight';src:url(${base}fonts/inter-tight.woff2) format('woff2');font-weight:100 900;font-display:swap}
@font-face{font-family:'Instrument Serif';src:url(${base}fonts/instrument-serif.woff2) format('woff2');font-display:swap}
@font-face{font-family:'Instrument Serif';font-style:italic;src:url(${base}fonts/instrument-serif-italic.woff2) format('woff2');font-display:swap}
@font-face{font-family:'Departure Mono';src:url(${base}fonts/departure-mono.woff2) format('woff2');font-display:swap}
:root{--ground:${C.ground};--maroon:${C.maroon};--panel:${C.panel};--line:${C.line};--cream:${C.cream};--paper:${C.paper};--muted:${C.muted};--magenta:${C.magenta};--salmon:${C.salmon};--serif:'Instrument Serif',Georgia,serif;--sans:'Inter Tight',system-ui,sans-serif;--mono:'Departure Mono',ui-monospace,monospace}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:64px}
body{margin:0;background:radial-gradient(1100px 620px at 0% 0%,var(--maroon),transparent 70%) no-repeat,var(--ground);color:var(--cream);font:500 16px/1.5 var(--sans);-webkit-font-smoothing:antialiased}
a{color:var(--salmon)}.mono{font-family:var(--mono);font-weight:400;letter-spacing:0}.muted{color:var(--muted)}
.top{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 24px;background:rgba(18,16,14,.86);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:10px;color:var(--cream);text-decoration:none;font:400 22px/1 var(--serif)}.brand img{width:26px;height:26px}
.brand .tag{font:400 11px var(--mono);color:var(--muted);border:1px solid var(--line);border-radius:6px;padding:3px 6px}
.asof{font:400 12px var(--mono);color:var(--muted);text-align:right}.asof b{color:var(--cream);font-weight:400}
nav.views{display:flex;gap:6px;overflow-x:auto;padding:10px 24px;border-bottom:1px solid var(--line);scrollbar-width:none}
nav.views a{flex:none;font:400 12px var(--mono);color:var(--muted);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:5px 11px}nav.views a:hover{color:var(--cream);border-color:var(--muted)}
main{max-width:1180px;margin:0 auto;padding:0 24px}
.view{padding:56px 0 8px;border-bottom:1px solid var(--line)}.view:last-child{border-bottom:0}
.hero{padding-top:40px}.herohead{max-width:860px}
h1{font:400 clamp(40px,6.4vw,76px)/1.02 var(--serif);margin:8px 0 18px;letter-spacing:-.01em}h1 em{color:var(--magenta);font-style:italic}
h2{font:400 clamp(30px,3.6vw,42px)/1.08 var(--serif);margin:4px 0 6px}h2.small{font-size:26px}
.lede{font-size:19px;line-height:1.5;color:var(--cream);max-width:760px;margin:0 0 18px}
.kick{font-size:12px;color:var(--muted);margin:0;text-transform:uppercase;letter-spacing:.04em}
.sub{color:var(--muted);margin:0;max-width:640px}
.vh{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap;margin-bottom:20px}
.share{display:flex;gap:6px;flex-wrap:wrap}.btn{font:400 12px var(--mono);color:var(--ground);background:var(--salmon);border-radius:8px;padding:7px 11px;text-decoration:none;border:0;cursor:pointer}
.btn.ghost{background:transparent;color:var(--salmon);border:1px solid var(--line)}.btn.ok{background:var(--paper)}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;margin:0 0 16px}
figure{margin:0}figcaption{color:var(--muted);font-size:14px;margin-top:10px}figcaption strong{color:var(--cream)}
.ct{display:flex;justify-content:space-between;align-items:baseline;gap:12px;color:var(--cream);font-weight:600;margin:0 0 10px}.ct .big{font-size:20px;color:var(--paper)}
.src,.ks{font-size:10.5px;color:var(--muted);font-weight:400}
.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin:26px 0 18px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px}.kl{margin:0;color:var(--muted);font-size:13px;line-height:1.3;min-height:34px}
.kv{margin:6px 0 2px;font-size:28px;color:var(--paper)}.kx{margin:0;font-size:12px;color:var(--cream)}.ks{margin:6px 0 0}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}.grid2.wide{grid-template-columns:1.05fr 1fr}.stack>.panel:last-child{margin-bottom:0}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
svg.chart{display:block;width:100%;height:auto;font-family:var(--sans)}svg .ax{fill:var(--muted);font:400 12px var(--mono)}svg .caps{letter-spacing:.06em}
svg .lab{fill:var(--cream);font:600 13.5px var(--sans)}svg .val{fill:var(--paper);font:400 12.5px var(--mono)}
svg.split{height:22px;border-radius:6px;overflow:hidden}
.scrollx{overflow-x:auto}.scrollx svg.flow{min-width:760px}.scrollx svg.heat{min-width:620px}
.foot{font-size:11px;color:var(--muted);margin:8px 0 0}
.switch{display:inline-flex;gap:4px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:4px;margin-bottom:16px}
.switch button{font:400 12px var(--mono);color:var(--muted);background:transparent;border:0;border-radius:7px;padding:7px 12px;cursor:pointer}
.switch button[aria-selected=true]{background:var(--salmon);color:var(--ground)}
.wow{color:var(--muted);font-size:15px}.wow .mono{color:var(--paper)}
table.cmp{width:100%;border-collapse:collapse;font-size:14px}.cmp th,.cmp td{padding:9px 6px;border-bottom:1px solid var(--line);text-align:right}
.cmp th[scope=row]{text-align:left;font-weight:500}.cmp thead th{color:var(--cream);font-weight:600}.cmp td{color:var(--paper)}.cmp tr:last-child th,.cmp tr:last-child td{border-bottom:0}
.cmp .src{display:block;margin-top:2px}
.legend,.keys{font-size:13px;color:var(--muted);margin:0 0 8px;display:flex;flex-wrap:wrap;gap:4px 14px}.sw{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:0}
.chainrow{margin-bottom:18px}.keys .mono{color:var(--cream)}
.ins .num{font-size:30px;color:var(--paper);margin:0 0 6px}.ins p{margin:0 0 8px}.ins .how{color:var(--muted);font-size:12.5px;margin:0}
.signoff{display:flex;align-items:center;gap:16px;margin-top:28px}.signoff .mono{color:var(--cream);font-size:15px}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(205px,1fr));gap:10px;grid-auto-flow:dense}
.tile{position:relative;display:flex;flex-direction:column;gap:6px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px;color:var(--cream);text-decoration:none;min-height:124px;overflow:hidden}
.tile:hover{border-color:var(--salmon)}.tile.l{grid-column:span 2;grid-row:span 2}.tile.m{grid-column:span 2}
.tile.tempo{box-shadow:inset 3px 0 0 var(--salmon)}.tile.base{box-shadow:inset 3px 0 0 var(--cream)}
.tr{font-size:22px;color:var(--paper)}.tile.l .tr{font-size:34px}
.tt{font-size:13.5px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.tile.l .tt{font-size:16px;-webkit-line-clamp:5}
.tm{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:var(--muted);margin-top:auto}
.dots{display:flex;flex-wrap:wrap;gap:3px}.dots i{width:5px;height:5px;border-radius:1.5px;background:var(--salmon);opacity:.7}
ol.feed{list-style:none;padding:6px 18px;max-height:640px;overflow:auto}
.feed li{display:grid;grid-template-columns:78px 64px 1fr;gap:10px;align-items:baseline;padding:9px 0;border-bottom:1px solid var(--line);font-size:14px}.feed li:last-child{border-bottom:0}
.feed time{color:var(--muted);font-size:12px}.chip{font-size:11px;color:var(--cream);border:1px solid var(--line);border-radius:6px;padding:1px 6px;text-align:center}
.fa a{color:var(--cream);text-decoration:none}.fa a:hover{color:var(--salmon)}.fa .mono{color:var(--muted);font-size:12.5px}
.foot-main{max-width:1180px;margin:0 auto;padding:40px 24px 64px;color:var(--muted);font-size:14px}.foot-main p{max-width:620px}.foot-main strong{color:var(--cream)}
.endpoints{padding-left:18px;font-size:12px;color:var(--cream)}
:target{outline:none}.swipe{display:none;font-size:11px;color:var(--muted);margin:0 0 8px}
@media (max-width:820px){.swipe{display:block}}
@media (max-width:560px){.grid2 svg .ax{font-size:18px}.grid2 svg .lab{font-size:19px}.grid2 svg .val{font-size:18px}}
@media (max-width:1000px){.kpis{grid-template-columns:repeat(3,1fr)}.grid4{grid-template-columns:repeat(2,1fr)}.grid2,.grid2.wide{grid-template-columns:1fr}}
@media (max-width:560px){.top{padding:8px 14px}.asof span.long{display:none}main{padding:0 14px}nav.views{padding:8px 14px}.kpis{grid-template-columns:repeat(2,1fr)}.grid4{grid-template-columns:1fr}.kv{font-size:24px}.tile.m,.tile.l{grid-column:span 1;grid-row:span 1}.tiles{grid-template-columns:1fr 1fr}.feed li{grid-template-columns:62px 1fr}.feed .chip{display:none}.lede{font-size:17px}}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
`;

const JS = `
document.querySelectorAll('.switch').forEach(function(sw){var g=sw.dataset.group;sw.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;sw.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-selected',x===b)});document.querySelectorAll('.tabpanel[data-group="'+g+'"]').forEach(function(p){p.hidden=p.dataset.key!==b.dataset.key})})});
document.querySelectorAll('[data-copy]').forEach(function(a){a.addEventListener('click',function(e){if(!navigator.clipboard)return;e.preventDefault();navigator.clipboard.writeText(a.dataset.copy).then(function(){var t=a.textContent;a.textContent='Copied';a.classList.add('ok');setTimeout(function(){a.textContent=t;a.classList.remove('ok')},1400)})})});
(function(){var el=document.getElementById('asof-ago');if(!el)return;function tick(){var m=Math.max(0,Math.round((Date.now()-Date.parse(el.dataset.t))/60000));el.textContent=m<1?'just now':m<60?m+' min ago':Math.floor(m/60)+' h '+(m%60)+' min ago'}tick();setInterval(tick,30000)})();
(function(){var v=document.body.dataset.view;if(v&&v!=='flow'){var s=document.getElementById(v);if(s)s.scrollIntoView()}})();
`;

export function renderPage(d, { siteUrl, base, view = 'flow', repoUrl }) {
  const v = VIEWS.find((x) => x.key === view) ?? VIEWS[0];
  const title = view === 'flow' ? 'Taskmarket Pulse: who posts, who wins, where the money goes' : `${v.label} · Taskmarket Pulse`;
  const desc = `A live, read-only dashboard of Taskmarket's market on Tempo and Base. Data as of ${asOfText(d.asOf)}. Unofficial.`;
  const url = view === 'flow' ? siteUrl : `${siteUrl}v/${view}/`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(siteUrl)}og/${v.key}.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${esc(v.label)} view of Taskmarket Pulse">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${esc(siteUrl)}og/${v.key}.png">
<meta name="theme-color" content="${C.ground}"><link rel="icon" href="${base}favicon.svg" type="image/svg+xml">
<link rel="preload" href="${base}fonts/inter-tight.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="${base}fonts/instrument-serif-italic.woff2" as="font" type="font/woff2" crossorigin>
<style>${CSS(base)}</style></head>
<body data-view="${v.key}">
<div class="top"><a class="brand" href="${base}"><svg viewBox="0 0 26 26" width="26" height="26" aria-hidden="true"><rect x="1" y="1" width="11" height="11" rx="3" fill="${C.cream}"/><rect x="14" y="1" width="11" height="11" rx="3" fill="${C.line}"/><rect x="1" y="14" width="11" height="11" rx="3" fill="${C.salmon}"/><rect x="14" y="14" width="11" height="11" rx="3" fill="${C.cream}"/></svg>Pulse<span class="tag">unofficial</span></a>
<p class="asof">Data as of <b>${asOfText(d.asOf)}</b><br><span class="long">rebuilt every 30 min · </span><span id="asof-ago" data-t="${esc(d.asOf)}"></span></p></div>
<nav class="views" aria-label="Views">${VIEWS.map((x) => `<a href="${base}${x.key === 'flow' ? '' : `v/${x.key}/`}#${x.key}">${x.n} ${esc(x.label)}</a>`).join('')}</nav>
<main>${flowView(d, siteUrl)}${pulseView(d, siteUrl)}${chainsView(d, siteUrl)}${modesView(d, siteUrl)}${heatView(d, siteUrl)}${insightsView(d, siteUrl)}${openView(d, siteUrl)}${feedView(d, siteUrl)}</main>
${methods(d, siteUrl, repoUrl)}
<script>${JS}</script></body></html>`;
}
