// Turns one snapshot into every file of the site. Used by build.mjs (static hosting) and server.mjs (live).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { derive } from './derive.mjs';
import { renderPage, VIEWS } from './render.mjs';
import { cardPng } from './og.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
export const typeOf = (p) => TYPES[path.extname(p)] ?? 'application/octet-stream';

export function normalizeSite(siteUrl) {
  const u = new URL(siteUrl);
  if (!u.pathname.endsWith('/')) u.pathname += '/';
  return { siteUrl: u.toString(), base: u.pathname };
}

/** Static assets shipped with the repo (fonts, brand mark, favicon). */
export function staticFiles() {
  const out = new Map();
  const walk = (dir, rel = '') => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, r);
      else out.set(r, fs.readFileSync(p));
    }
  };
  walk(path.join(ROOT, 'public'));
  return out;
}

/** Map of site-relative path -> Buffer|string for everything generated from the snapshot. */
export function siteFiles(snap, { siteUrl, repoUrl }) {
  const { siteUrl: site, base } = normalizeSite(siteUrl);
  const d = derive(snap);
  d.api = snap.api;
  const files = new Map();
  for (const v of VIEWS) {
    const html = renderPage(d, { siteUrl: site, base, view: v.key, repoUrl });
    files.set(v.key === 'flow' ? 'index.html' : `v/${v.key}/index.html`, html);
    files.set(`og/${v.key}.png`, cardPng(d, v.key));
  }
  files.set('data.json', JSON.stringify(snap));
  files.set('status.json', JSON.stringify({ asOf: snap.asOf, builtAt: new Date().toISOString(), tasks: d.totals.listedTasks }));
  return { files, derived: d };
}
