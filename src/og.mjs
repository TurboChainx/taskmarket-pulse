// Share cards (1200 x 630 PNG), one per view, drawn from the same derived numbers as the page.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { C, esc, fmt, flowLayout } from './charts.mjs';
import { asOfText } from './render.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FONTS = ['InterTight-500.ttf', 'InterTight-600.ttf', 'InterTight-700.ttf', 'InstrumentSerif-Regular.ttf', 'InstrumentSerif-Italic.ttf', 'DepartureMono-Regular.otf'].map((f) =>
  path.join(ROOT, 'assets', 'fonts', f),
);
const MARK = `data:image/png;base64,${fs.readFileSync(path.join(ROOT, 'public', 'brand', 'mark-128.png')).toString('base64')}`;

const W = 1200;
const H = 630;

function frame(d, { kicker, lines, accent, body }) {
  // lines: headline lines; the word in `accent` (if present in a line) is set in magenta italic.
  const headline = lines
    .map((ln, i) => {
      const y = 196 + i * 78;
      if (accent && ln.includes(accent)) {
        const [a, b] = ln.split(accent);
        return `<text x="64" y="${y}" font-family="Instrument Serif" font-size="80" fill="${C.cream}">${esc(a)}<tspan font-style="italic" fill="${C.magenta}">${esc(accent)}</tspan>${esc(b)}</text>`;
      }
      return `<text x="64" y="${y}" font-family="Instrument Serif" font-size="80" fill="${C.cream}">${esc(ln)}</text>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(0 0) scale(900 560)"><stop offset="0" stop-color="${C.maroon}"/><stop offset="1" stop-color="${C.ground}" stop-opacity="0"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="${C.ground}"/><rect width="${W}" height="${H}" fill="url(#glow)"/>
<text x="64" y="84" font-family="Departure Mono" font-size="20" fill="${C.muted}" letter-spacing="1">${esc(kicker)}</text>
${headline}
${body}
<image x="64" y="${H - 64 - 72}" width="72" height="72" href="${MARK}" xlink:href="${MARK}"/>
<text x="156" y="${H - 88}" font-family="Departure Mono" font-size="24" fill="${C.cream}">taskmarket.dev</text>
<text x="156" y="${H - 62}" font-family="Inter Tight" font-weight="500" font-size="17" fill="${C.muted}">Unofficial dashboard, made for a Taskmarket bounty</text>
<text x="${W - 64}" y="${H - 62}" text-anchor="end" font-family="Departure Mono" font-size="17" fill="${C.muted}">data as of ${esc(asOfText(d.asOf))}</text>
</svg>`;
}

function stat(x, y, value, label, size = 64) {
  return `<text x="${x}" y="${y}" font-family="Departure Mono" font-size="${size}" fill="${C.paper}">${esc(value)}</text>
<text x="${x}" y="${y + 34}" font-family="Inter Tight" font-weight="500" font-size="21" fill="${C.muted}">${esc(label)}</text>`;
}

function spark(rows, key, x, y, w, h, color) {
  const vals = rows.map((r) => r[key]);
  const max = Math.max(1, ...vals);
  const pts = vals.map((v, i) => `${(x + (i * w) / Math.max(1, vals.length - 1)).toFixed(1)},${(y + h - (v / max) * h).toFixed(1)}`);
  return `<path d="M${pts.join('L')}L${x + w},${y + h}L${x},${y + h}Z" fill="${color}" fill-opacity="0.14"/><path d="M${pts.join('L')}" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`;
}

const cards = {
  flow(d) {
    const f = d.flow;
    const top = f.posterNodes[0];
    const share = top && f.total ? top.amount / f.total : 0;
    // The page's own flow layout, drawn small: posters on the left, winners on the right.
    const { LP, RW, ribbons: rs, topPoster } = flowLayout(f, { x0: 720, x1: 1110, nw: 10, top: 120, innerH: 340, gap: 7 });
    const ribbons =
      rs.map(({ l, d: p }) => `<path d="${p}" fill="${l.from === topPoster ? C.magenta : C.salmon}" fill-opacity="${l.from === topPoster ? 0.5 : 0.3}"/>`).join('') +
      LP.map((n) => `<rect x="720" y="${n.y.toFixed(1)}" width="10" height="${n.hgt.toFixed(1)}" rx="2" fill="${n.key === topPoster ? C.magenta : C.cream}"/>`).join('') +
      RW.map((n) => `<rect x="1110" y="${n.y.toFixed(1)}" width="10" height="${n.hgt.toFixed(1)}" rx="2" fill="${C.cream}"/>`).join('') +
      `<text x="730" y="106" text-anchor="end" font-family="Departure Mono" font-size="15" fill="${C.muted}">POSTERS</text><text x="1110" y="106" font-family="Departure Mono" font-size="15" fill="${C.muted}">WINNERS</text>`;
    return frame(d, {
      kicker: `TASKMARKET PULSE · MONEY FLOW · LAST ${f.days} DAYS`,
      lines: ['Where the money', 'goes'],
      accent: 'goes',
      body: `${stat(64, 410, fmt.pct(share), `of recent paid rewards came from one poster`)}${stat(500, 410, fmt.usd(f.total), `paid to ${fmt.int(f.winners)} winners`, 44)}${ribbons}`,
    });
  },
  pulse(d) {
    const rows = d.series['30d'];
    return frame(d, {
      kicker: 'TASKMARKET PULSE · OVER TIME · 30 DAYS',
      lines: ['The market over time'],
      body: `${stat(64, 330, fmt.signedPct(d.wow.tasks), 'tasks posted, last 7 days vs the 7 before', 56)}${stat(64, 450, fmt.int(d.totals.activeAgents7d), 'active agents in the last 7 days', 56)}${spark(rows.slice(0, -1), 'tasks', 640, 250, 500, 220, C.salmon)}`,
    });
  },
  chains(d) {
    const [t, b] = ['tempo', 'base'].map((k) => d.chains.find((c) => c.key === k));
    const row = (y, label, a, bb) =>
      `<text x="64" y="${y}" font-family="Inter Tight" font-weight="500" font-size="24" fill="${C.muted}">${esc(label)}</text><text x="760" y="${y}" text-anchor="end" font-family="Departure Mono" font-size="34" fill="${C.salmon}">${esc(a)}</text><text x="1000" y="${y}" text-anchor="end" font-family="Departure Mono" font-size="34" fill="${C.cream}">${esc(bb)}</text>`;
    return frame(d, {
      kicker: 'TASKMARKET PULSE · TEMPO VS BASE',
      lines: ['Two chains, two markets'],
      body: `<text x="760" y="270" text-anchor="end" font-family="Inter Tight" font-weight="600" font-size="22" fill="${C.salmon}">Tempo</text><text x="1000" y="270" text-anchor="end" font-family="Inter Tight" font-weight="600" font-size="22" fill="${C.cream}">Base</text>
${row(320, 'Distinct posters', fmt.int(t.posters), fmt.int(b.posters))}${row(372, 'Closed with no winner', fmt.pct(t.diedShare), fmt.pct(b.diedShare))}${row(424, 'Median entries per bounty, 30 days', fmt.int(t.medianEntries30d), fmt.int(b.medianEntries30d))}`,
    });
  },
  modes(d) {
    const total = d.breakdowns.mode.reduce((a, m) => a + m.count, 0);
    const bounty = d.breakdowns.mode.find((m) => m.mode === 'bounty')?.count ?? 0;
    return frame(d, {
      kicker: 'TASKMARKET PULSE · MODES AND STATUS',
      lines: ['Bounties are almost', 'everything'],
      body: `${stat(64, 420, fmt.pct(bounty / (total || 1)), `of ${fmt.int(total)} tasks are bounties`)}`,
    });
  },
  heat(d) {
    const h = d.heatHour['30d'];
    const map = new Map(h.cells.map((c) => [`${c.row}|${c.col}`, c.count]));
    const max = Math.max(1, ...h.cells.map((c) => c.count));
    const cell = 17;
    const gap = 3;
    const ox = 640;
    const oy = 230;
    const rects = h.rowKeys
      .map((r, ri) =>
        h.colKeys
          .map((c, ci) => {
            const v = map.get(`${r}|${c}`) ?? 0;
            return `<rect x="${ox + ci * (cell + gap)}" y="${oy + ri * (cell + gap)}" width="${cell}" height="${cell}" rx="3" fill="${v ? C.salmon : C.panel}" fill-opacity="${v ? (0.12 + 0.88 * Math.sqrt(v / max)).toFixed(3) : 1}"/>`;
          })
          .join(''),
      )
      .join('');
    const busiest = [...h.cells].sort((a, b) => b.count - a.count)[0];
    const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][Number(busiest.row)];
    return frame(d, {
      kicker: 'TASKMARKET PULSE · ACTIVITY BY HOUR · 30 DAYS',
      lines: ['When the market', 'is busy'],
      body: `${stat(64, 420, `${day.slice(0, 3)} ${String(busiest.col).padStart(2, '0')}:00`, `busiest hour (UTC): ${fmt.int(busiest.count)} events`, 52)}${rects}`,
    });
  },
  insights(d) {
    const [t, b] = ['tempo', 'base'].map((k) => d.chains.find((c) => c.key === k));
    return frame(d, {
      kicker: 'TASKMARKET PULSE · WHAT THE NUMBERS SAY',
      lines: ['What the numbers say'],
      body: `${stat(64, 340, fmt.pct(d.concentration.posting.share), 'of rewards put up by the top 10 posters', 56)}${stat(640, 340, fmt.pct(d.tempoShare7d), 'of last week’s tasks were on Tempo', 56)}${stat(64, 460, `${fmt.int(b.medianEntries30d)} vs ${fmt.int(t.medianEntries30d)}`, 'median entries per bounty, Base vs Tempo', 56)}${stat(640, 460, fmt.pct(b.diedShare), 'of closed Base tasks had no winner', 56)}`,
    });
  },
  open(d) {
    const value = d.open.reduce((a, t) => a + Number(BigInt(t.reward)) / 1e6, 0);
    return frame(d, {
      kicker: 'TASKMARKET PULSE · OPEN RIGHT NOW',
      lines: ['Open right now'],
      body: `${stat(64, 340, fmt.int(d.open.length), 'open tasks listed', 64)}${stat(500, 340, fmt.usd(value), 'in held rewards', 64)}`,
    });
  },
  feed(d) {
    const ts = d.feed.map((e) => Date.parse(e.timestamp));
    const mins = ts.length > 1 ? Math.max(1, Math.round((Math.max(...ts) - Math.min(...ts)) / 60000)) : 0;
    return frame(d, {
      kicker: 'TASKMARKET PULSE · LATEST ACTIVITY',
      lines: ['Latest activity'],
      body: `${stat(64, 340, fmt.int(d.feed.length), `events in the last ${fmt.int(mins)} minutes before the data time`, 64)}`,
    });
  },
};

export function cardSvg(d, key) {
  return (cards[key] ?? cards.flow)(d);
}

export function cardPng(d, key) {
  const r = new Resvg(cardSvg(d, key), {
    fitTo: { mode: 'width', value: W },
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Inter Tight' },
  });
  return r.render().asPng();
}
