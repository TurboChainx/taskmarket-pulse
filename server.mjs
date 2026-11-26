#!/usr/bin/env node
// Live server: one command, no build step.
//   npx -y github:TurboChainx/taskmarket-pulse        (or: npm start)
// Fetches the API on the server, keeps the result for CACHE_SECONDS (default 300, minimum 60),
// serves the last good copy while it refreshes, and never calls the API from the browser.
import http from 'node:http';
import { fetchSnapshot } from './src/api.mjs';
import { siteFiles, staticFiles, normalizeSite, typeOf } from './src/site.mjs';

const PORT = Number(process.env.PORT ?? 8080);
const TTL = Math.max(60, Number(process.env.CACHE_SECONDS ?? 300)) * 1000;
const { siteUrl, base } = normalizeSite(process.env.SITE_URL ?? `http://localhost:${PORT}/`);
const REPO_URL = process.env.REPO_URL ?? 'https://github.com/TurboChainx/taskmarket-pulse';
const STATIC = staticFiles();

let cache = null;
let pending = null;

function refresh() {
  pending ??= fetchSnapshot()
    .then((snap) => {
      cache = { at: Date.now(), files: siteFiles(snap, { siteUrl, repoUrl: REPO_URL }).files };
      console.log(`refreshed · data as of ${snap.asOf}`);
    })
    .catch((err) => console.error(`refresh failed, keeping the last good copy: ${err.message}`))
    .finally(() => {
      pending = null;
    });
  return pending;
}

async function current() {
  if (!cache) await refresh();
  else if (Date.now() - cache.at > TTL) refresh();
  return cache;
}

http
  .createServer(async (req, res) => {
    try {
      let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (!rel.startsWith(base)) rel = base;
      rel = rel.slice(base.length);
      if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      if (STATIC.has(rel)) {
        res.writeHead(200, { 'content-type': typeOf(rel), 'cache-control': 'public, max-age=86400' });
        return res.end(STATIC.get(rel));
      }
      const c = await current();
      if (!c) {
        res.writeHead(503, { 'content-type': 'text/plain', 'retry-after': '30' });
        return res.end('Data not available yet, try again shortly.');
      }
      const body = c.files.get(rel);
      if (body == null) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        return res.end('Not found');
      }
      res.writeHead(200, { 'content-type': typeOf(rel), 'cache-control': `public, max-age=${Math.round(TTL / 1000)}` });
      res.end(body);
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('Server error');
      console.error(err);
    }
  })
  .listen(PORT, () => console.log(`Taskmarket Pulse on ${siteUrl} (cache ${TTL / 1000}s)`));
