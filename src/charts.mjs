// Server-rendered SVG charts. No client-side charting library: the page ships finished pictures.

export const C = {
  ground: '#12100E',
  maroon: '#3A1420',
  panel: '#221E1A',
  line: '#453E37',
  cream: '#EFE9E2',
  paper: '#FFF6E8',
  muted: '#B0A79D',
  magenta: '#E74079',
  salmon: '#D9A097',
};

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayLabel = (iso) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

export const fmt = {
  int: (n) => Math.round(n).toLocaleString('en-US'),
  usd: (n) => (n >= 1000 ? `$${Math.round(n).toLocaleString('en-US')}` : n >= 100 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`),
  usdAxis: (n) => (n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : `$${n % 1 ? n.toFixed(1) : n}`),
  intAxis: (n) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : `${n}`),
  pct: (x) => `${(x * 100).toFixed(Math.abs(x) < 0.1 ? 1 : 0)}%`,
  signedPct: (x) => (x == null ? 'n/a' : `${x >= 0 ? '+' : '−'}${(Math.abs(x) * 100).toFixed(0)}%`),
  short: (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : ''),
};

export function niceTicks(max, target = 4) {
  if (!(max > 0)) return [0, 1];
  const raw = max / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks = [];
  for (let v = 0; v < max + step * 0.999; v += step) ticks.push(Number(v.toFixed(10)));
  if (ticks.at(-1) < max) ticks.push(ticks.at(-1) + step);
  return ticks;
}

/**
 * One measure over time. The last bucket is the current, unfinished day or week: it is drawn dashed.
 */
export function lineChart({ rows, key, title, format, axis, color = C.salmon, w = 520, h = 210, partialLast = true, id }) {
  const pad = { l: 48, r: 18, t: 14, b: 30 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const vals = rows.map((r) => r[key]);
  const ticks = niceTicks(Math.max(...vals, 0));
  const top = ticks.at(-1) || 1;
  const n = rows.length;
  const x = (i) => pad.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v) => pad.t + ih - (v / top) * ih;
  const pts = rows.map((r, i) => [x(i), y(r[key])]);
  const solid = partialLast && n > 2 ? pts.slice(0, -1) : pts;
  const path = (p) => `M${p.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join('L')}`;
  const area = `${path(solid)}L${solid.at(-1)[0].toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`;
  const labelIdx = [...new Set([0, Math.floor((n - 1) / 2), n - 1])];
  const bucketLabel = (r) => (r.bucket.length > 10 ? r.bucket.slice(0, 10) : r.bucket);
  const last = rows.at(-1);
  const lastFull = partialLast && n > 2 ? rows.at(-2) : last;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="${id}-t" preserveAspectRatio="xMidYMid meet">
<title id="${id}-t">${esc(title)}: ${esc(format(lastFull[key]))} on ${dayLabel(bucketLabel(lastFull))}</title>
${ticks.map((t) => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="${C.line}" stroke-width="1"/><text class="ax" x="${pad.l - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${esc(axis(t))}</text>`).join('')}
${labelIdx.map((i) => `<text class="ax" x="${x(i).toFixed(1)}" y="${h - 8}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${dayLabel(bucketLabel(rows[i]))}</text>`).join('')}
<path d="${area}" fill="${color}" fill-opacity="0.12"/>
<path d="${path(solid)}" fill="none" stroke="${color}" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>
${partialLast && n > 2 ? `<path d="${path(pts.slice(-2))}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="3 4" stroke-linecap="round"/>` : ''}
${pts.map(([a, b], i) => `<circle cx="${a.toFixed(1)}" cy="${b.toFixed(1)}" r="${n > 40 ? 2 : 3}" fill="${color}"${i === n - 1 && partialLast && n > 2 ? ` fill-opacity="0.5"` : ''}><title>${dayLabel(bucketLabel(rows[i]))}${i === n - 1 && partialLast ? ' (so far)' : ''}: ${esc(format(rows[i][key]))}</title></circle>`).join('')}
</svg>`;
}

/** Two series on one time axis (Tempo and Base), with a legend. */
export function dualLineChart({ rows, series, title, format, axis, w = 640, h = 230, id }) {
  const pad = { l: 48, r: 18, t: 14, b: 30 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const max = Math.max(0, ...rows.flatMap((r) => series.map((s) => r[s.key])));
  const ticks = niceTicks(max);
  const top = ticks.at(-1) || 1;
  const n = rows.length;
  const x = (i) => pad.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v) => pad.t + ih - (v / top) * ih;
  const labelIdx = [...new Set([0, Math.floor((n - 1) / 2), n - 1])];
  const lines = series
    .map((s) => {
      const p = rows.map((r, i) => `${x(i).toFixed(1)},${y(r[s.key]).toFixed(1)}`);
      return `<path d="M${p.join('L')}" fill="none" stroke="${s.color}" stroke-width="2.25" stroke-linejoin="round"/>
${rows.map((r, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(r[s.key]).toFixed(1)}" r="3" fill="${s.color}"><title>${esc(s.label)}, week of ${dayLabel(r.week)}: ${esc(format(r[s.key]))}</title></circle>`).join('')}`;
    })
    .join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="${id}-t">
<title id="${id}-t">${esc(title)}</title>
${ticks.map((t) => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="${C.line}"/><text class="ax" x="${pad.l - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${esc(axis(t))}</text>`).join('')}
${labelIdx.map((i) => `<text class="ax" x="${x(i).toFixed(1)}" y="${h - 8}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${dayLabel(rows[i].week)}</text>`).join('')}
${lines}
</svg>`;
}

/** Horizontal bars, one per category, value printed at the bar's end. */
export function barList({ items, format = fmt.int, color = C.salmon, w = 520, id, title }) {
  const rowH = 30;
  const h = items.length * rowH + 8;
  const labelW = 150;
  const max = Math.max(1, ...items.map((i) => i.value));
  const bw = (v) => ((w - labelW - 70) * v) / max;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="${id}-t">
<title id="${id}-t">${esc(title)}</title>
${items
  .map(
    (it, i) => `<g><text class="lab" x="${labelW - 10}" y="${i * rowH + 20}" text-anchor="end">${esc(it.label)}</text>
<rect x="${labelW}" y="${i * rowH + 7}" width="${Math.max(2, bw(it.value)).toFixed(1)}" height="18" rx="4" fill="${it.color ?? color}"><title>${esc(it.label)}: ${esc(format(it.value))}</title></rect>
<text class="val" x="${(labelW + Math.max(2, bw(it.value)) + 8).toFixed(1)}" y="${i * rowH + 20}">${esc(format(it.value))}</text></g>`,
  )
  .join('')}
</svg>`;
}

/** A 100% bar split into parts, with a legend underneath (used per chain for task status). */
export function splitBar({ parts, total, w = 520, id, title }) {
  let x0 = 0;
  const segs = parts
    .filter((p) => p.value > 0)
    .map((p) => {
      const width = (w * p.value) / total;
      const s = `<rect x="${x0.toFixed(1)}" y="0" width="${width.toFixed(1)}" height="22" fill="${p.color}"><title>${esc(p.label)}: ${fmt.int(p.value)} (${fmt.pct(p.value / total)})</title></rect>`;
      x0 += width;
      return s;
    })
    .join('');
  return `<svg class="chart split" viewBox="0 0 ${w} 22" role="img" aria-labelledby="${id}-t" preserveAspectRatio="none"><title id="${id}-t">${esc(title)}</title>${segs}</svg>`;
}

/** Heat map of counts. Rows and columns come straight from the API's rowKeys and colKeys. */
export function heatmap({ rowKeys, colKeys, cells, rowLabel, colLabel, colTick = () => true, cell = 34, gap = 4, lw = 64, id, title, unit = 'events' }) {
  const th = 22;
  const map = new Map(cells.map((c) => [`${c.row}|${c.col}`, c]));
  const max = Math.max(1, ...cells.map((c) => c.count));
  const w = lw + colKeys.length * (cell + gap);
  const h = th + rowKeys.length * (cell + gap) + 4;
  const rects = rowKeys
    .map((r, ri) =>
      colKeys
        .map((c, ci) => {
          const v = map.get(`${r}|${c}`)?.count ?? 0;
          const op = v ? 0.1 + 0.9 * (v / max) ** 0.75 : 0;
          return `<rect x="${lw + ci * (cell + gap)}" y="${th + ri * (cell + gap)}" width="${cell}" height="${cell}" rx="4" fill="${v ? C.salmon : C.panel}" fill-opacity="${v ? op.toFixed(3) : 1}" stroke="${v ? 'none' : C.line}"><title>${esc(rowLabel(r))}, ${esc(colLabel(c))}: ${fmt.int(v)} ${unit}</title></rect>`;
        })
        .join(''),
    )
    .join('');
  const rowsTxt = rowKeys.map((r, ri) => `<text class="lab" x="${lw - 10}" y="${th + ri * (cell + gap) + cell * 0.7}" text-anchor="end">${esc(rowLabel(r))}</text>`).join('');
  const colsTxt = colKeys
    .map((c, ci) => (colTick(c, ci) ? `<text class="ax" x="${lw + ci * (cell + gap) + cell / 2}" y="${th - 8}" text-anchor="middle">${esc(colLabel(c, true))}</text>` : ''))
    .join('');
  return `<svg class="chart heat" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="${id}-t"><title id="${id}-t">${esc(title)}</title>${colsTxt}${rowsTxt}${rects}</svg>`;
}

/**
 * Layout for the money flow: node columns and ribbons, sized by reward. Shared by the page and the share card.
 */
export function flowLayout(flow, { x0, x1, nw, top, innerH, gap }) {
  const P = flow.posterNodes;
  const W = flow.winnerNodes;
  const scale = (innerH - gap * (Math.max(P.length, W.length) - 1)) / (flow.total || 1);
  const place = (nodes) => {
    const used = nodes.reduce((a, n) => a + Math.max(1.5, n.amount * scale), 0) + gap * (nodes.length - 1);
    let y = top + (innerH - used) / 2;
    return nodes.map((n) => {
      const r = { ...n, y, hgt: Math.max(1.5, n.amount * scale) };
      y += r.hgt + gap;
      return r;
    });
  };
  const LP = place(P);
  const RW = place(W);
  const pIdx = new Map(LP.map((n, i) => [n.key, i]));
  const wIdx = new Map(RW.map((n, i) => [n.key, i]));
  const outOff = new Map(LP.map((n) => [n.key, n.y]));
  const inOff = new Map(RW.map((n) => [n.key, n.y]));
  const ribbons = [...flow.links]
    .sort((a, b) => pIdx.get(a.from) - pIdx.get(b.from) || wIdx.get(a.to) - wIdx.get(b.to))
    .map((l) => {
      const t = l.amount * scale;
      const ya = outOff.get(l.from);
      outOff.set(l.from, ya + t);
      return { l, ya, t };
    });
  // Inside each winner node, incoming ribbons follow the posters' order so they do not cross.
  for (const r of [...ribbons].sort((a, b) => wIdx.get(a.l.to) - wIdx.get(b.l.to) || pIdx.get(a.l.from) - pIdx.get(b.l.from))) {
    r.yb = inOff.get(r.l.to);
    inOff.set(r.l.to, r.yb + r.t);
  }
  const xm = (x0 + nw + x1) / 2;
  const a = x0 + nw;
  for (const r of ribbons) {
    const { ya, yb, t } = r;
    r.d = `M${a},${ya.toFixed(1)}C${xm},${ya.toFixed(1)} ${xm},${yb.toFixed(1)} ${x1},${yb.toFixed(1)}L${x1},${(yb + t).toFixed(1)}C${xm},${(yb + t).toFixed(1)} ${xm},${(ya + t).toFixed(1)} ${a},${(ya + t).toFixed(1)}Z`;
  }
  return { LP, RW, ribbons, topPoster: LP[0]?.key };
}

/** Label centres pushed apart to at least minGap, kept inside [lo, hi]. */
export function spread(mids, minGap, lo, hi) {
  const ys = [...mids];
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + minGap);
  if (ys.length && ys.at(-1) > hi) {
    ys[ys.length - 1] = hi;
    for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - minGap);
  }
  if (ys.length && ys[0] < lo) {
    ys[0] = lo;
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + minGap);
  }
  return ys;
}

/**
 * Money flow: posters on the left, winners on the right, ribbons sized by reward.
 * The biggest poster's ribbons carry the one magenta highlight.
 */
export function flowChart({ flow, w = 980, id = 'flow', title }) {
  const x0 = 300;
  const x1 = w - 300;
  const nw = 14;
  const top = 34;
  const innerH = 430;
  const h = top + innerH + 16;
  const { LP, RW, ribbons, topPoster } = flowLayout(flow, { x0, x1, nw, top, innerH, gap: 10 });
  const nameOf = (n, side) => (n.addr ? n.name ?? fmt.short(n.addr) : side === 'p' ? `Other posters (${n.count})` : `Other winners (${n.count})`);
  const fromName = new Map(LP.map((n) => [n.key, nameOf(n, 'p')]));
  const toName = new Map(RW.map((n) => [n.key, nameOf(n, 'w')]));
  const paths = ribbons
    .map(({ l, d }) => {
      const hi = l.from === topPoster;
      return `<path d="${d}" fill="${hi ? C.magenta : C.salmon}" fill-opacity="${hi ? 0.42 : 0.26}"><title>${esc(fromName.get(l.from))} → ${esc(toName.get(l.to))}: ${fmt.usd(l.amount)}</title></path>`;
    })
    .join('');
  const column = (nodes, side) => {
    const ys = spread(nodes.map((n) => n.y + n.hgt / 2), 38, top + 12, top + innerH - 8);
    return nodes
      .map((n, i) => {
        const mid = n.y + n.hgt / 2;
        const ly = ys[i];
        const name = nameOf(n, side);
        const unit = n.addr ? (side === 'p' ? 'tasks' : 'wins') : 'wallets';
        const sub = `${fmt.usd(n.amount)} · ${fmt.int(n.count)} ${unit}`;
        const edge = side === 'p' ? x0 : x1 + nw;
        const tx = side === 'p' ? x0 - 30 : x1 + nw + 30;
        const anchor = side === 'p' ? 'end' : 'start';
        const lead = side === 'p' ? `M${edge - 2},${mid.toFixed(1)}L${edge - 12},${mid.toFixed(1)}L${tx + 6},${ly.toFixed(1)}` : `M${edge + 2},${mid.toFixed(1)}L${edge + 12},${mid.toFixed(1)}L${tx - 6},${ly.toFixed(1)}`;
        const hi = n.key === topPoster;
        return `<g><rect x="${side === 'p' ? x0 : x1}" y="${n.y.toFixed(1)}" width="${nw}" height="${n.hgt.toFixed(1)}" rx="3" fill="${hi ? C.magenta : C.cream}"><title>${esc(name)}${n.addr ? ` (${esc(n.addr)})` : ''}: ${fmt.usd(n.amount)}</title></rect>
<path d="${lead}" fill="none" stroke="${C.line}" stroke-width="1"/>
<text class="lab" x="${tx}" y="${(ly - 2).toFixed(1)}" text-anchor="${anchor}">${esc(name)}</text>
<text class="ax" x="${tx}" y="${(ly + 14).toFixed(1)}" text-anchor="${anchor}">${esc(sub)}</text></g>`;
      })
      .join('');
  };
  return `<svg class="chart flow" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="${id}-t"><title id="${id}-t">${esc(title)}</title>
<text class="ax caps" x="${x0 + nw}" y="16" text-anchor="end">POSTERS</text><text class="ax caps" x="${x1}" y="16">WINNERS</text>
${paths}${column(LP, 'p')}${column(RW, 'w')}</svg>`;
}
