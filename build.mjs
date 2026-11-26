// Static build: fetch the API once on the server (or CI), write a complete site to dist/.
//   SITE_URL=https://you.github.io/taskmarket-pulse/ node build.mjs
// SNAPSHOT=path/to/data.json builds offline from a saved snapshot.
import fs from 'node:fs';
import path from 'node:path';
import { fetchSnapshot } from './src/api.mjs';
import { siteFiles, staticFiles } from './src/site.mjs';

const SITE_URL = process.env.SITE_URL ?? 'http://localhost:8080/';
const REPO_URL = process.env.REPO_URL ?? 'https://github.com/TurboChainx/taskmarket-pulse';
const OUT = path.resolve(process.env.OUT_DIR ?? 'dist');

const t0 = Date.now();
const snap = process.env.SNAPSHOT ? JSON.parse(fs.readFileSync(process.env.SNAPSHOT, 'utf8')) : await fetchSnapshot();
const { files, derived } = siteFiles(snap, { siteUrl: SITE_URL, repoUrl: REPO_URL });

fs.rmSync(OUT, { recursive: true, force: true });
const write = (rel, body) => {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
};
for (const [rel, body] of staticFiles()) write(rel, body);
for (const [rel, body] of files) write(rel, body);
write('.nojekyll', '');

console.log(
  `built ${files.size} files in ${((Date.now() - t0) / 1000).toFixed(1)}s · data as of ${snap.asOf} · ${derived.totals.listedTasks} listed tasks · index ${(Buffer.byteLength(files.get('index.html')) / 1024).toFixed(0)} KB`,
);
