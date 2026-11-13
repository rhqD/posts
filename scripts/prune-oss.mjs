// Delete resources on OSS that the current build no longer references.
//
//   node scripts/prune-oss.mjs           # dry run, prints what would go
//   node scripts/prune-oss.mjs --delete  # actually delete
//
// Only js/css/map/images/models/fonts are considered. HTML, TXT, XML and JSON
// are left alone on purpose: they are cheap, and old documents may still be
// reachable from a stale link. Keep-list is "every file in out/", so a fresh
// `pnpm build` must exist before running this.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const BUCKET = process.env.OSS_BUCKET ?? 'oss://renhanquan-site';
const RESOURCE = /\.(js|css|map|jpe?g|png|webp|gif|svg|ico|glb|gltf|bin|ktx2|woff2?|mp3)$/i;

function walk(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else out.push(relative(base, full));
  }
  return out;
}

function ossObject(url) {
  return url.replace(BUCKET + '/', '');
}

const files = walk('out');
const keep = new Set(files);

// Images, models and the yard assets are uploaded outside the Next build, so
// "not in out/" alone would mark every one of them stale. Anything referenced
// by a built page or by lights.json has to stay.
const referenced = /\/((?:images|models|yard)\/[\w./-]+)/g;
for (const file of files) {
  if (!/\.(html|txt|js|json|xml)$/i.test(file)) continue;
  const text = readFileSync(join('out', file), 'utf8');
  for (const match of text.matchAll(referenced)) keep.add(match[1]);
}

const listing = execFileSync('ossutil', ['ls', BUCKET, '-r'], { encoding: 'utf8' });
const objects = [];
for (const line of listing.split('\n')) {
  const match = line.match(/\s(oss:\/\/[^\s]+)\s*$/);
  if (!match) continue;
  const key = ossObject(match[1]);
  if (key.endsWith('/')) continue;
  const size = Number((line.match(/\s(\d+)\s+Standard\s/) ?? [])[1] ?? 0);
  objects.push({ key, size });
}

const stale = objects.filter(({ key }) => !keep.has(key) && RESOURCE.test(key));
const total = stale.reduce((sum, item) => sum + item.size, 0);
const byExt = {};
for (const { key, size } of stale) {
  const ext = key.split('.').pop();
  byExt[ext] ??= { count: 0, bytes: 0 };
  byExt[ext].count += 1;
  byExt[ext].bytes += size;
}

console.log('objects on OSS:', objects.length, '| kept by out/:', keep.size);
console.log('stale resources:', stale.length, '(' + (total / 1048576).toFixed(1) + ' MB)');
for (const [ext, { count, bytes }] of Object.entries(byExt).sort((a, b) => b[1].bytes - a[1].bytes)) {
  console.log('  ' + ext.padEnd(6), String(count).padStart(4), (bytes / 1048576).toFixed(2) + ' MB');
}
for (const { key } of stale.slice(0, 10)) console.log('    -', key);

if (!process.argv.includes('--delete')) {
  console.log('dry run: pass --delete to remove them');
  process.exit(0);
}

let removed = 0;
for (const { key } of stale) {
  try {
    execFileSync('ossutil', ['rm', BUCKET + '/' + key, '-f', '-q'], { stdio: 'ignore' });
    removed += 1;
  } catch {
    console.error('failed:', key);
  }
}
console.log('deleted', removed, 'objects');
