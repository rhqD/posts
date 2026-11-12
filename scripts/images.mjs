// Build-time image pipeline: download every image referenced by the content
// snapshot, normalise it (<=1600px wide, WebP), upload it to OSS and rewrite the
// block URLs to /images/<hash>.webp.
//
// Notion's S3 URLs are pre-signed and expire after ~1h, so a statically
// generated site can never reference them directly.
//
// Usage:
//   node scripts/images.mjs                 # process content/posts/*.json
//   node scripts/images.mjs --probe <url>   # single image smoke test
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const DIR = process.env.CONTENT_DIR ?? 'content/posts';
const TMP = '.images-tmp';
const BUCKET = process.env.OSS_BUCKET ?? 'oss://renhanquan-site';
const PREFIX = 'images/';
const LIMIT = 4;
const TIMEOUT_MS = 25000;
const MAX_WIDTH = 1600;
const QUALITY = 80;
const RASTER = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/avif', 'image/tiff'];
// Notion's built-in page covers are served from its own CDN and are tiny
// gradients; re-hosting them adds nothing.
const SKIP_COVER_HOSTS = ['app.notion.com'];
const INDEX = path.join(path.dirname(DIR), 'posts.index.json');

const hash = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);

async function fetchImage(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!type.startsWith('image/')) throw new Error('not an image: ' + type);
  return { buf: Buffer.from(await res.arrayBuffer()), type };
}

async function normalise(img) {
  if (!RASTER.includes(img.type)) {
    return { data: img.buf, ext: img.type.split('/')[1] ?? 'bin' };
  }
  const data = await sharp(img.buf)
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 4 })
    .toBuffer();
  return { data, ext: 'webp' };
}

function upload() {
  execFileSync('ossutil', [
    'cp', '-r', TMP + '/', BUCKET + '/' + PREFIX,
    '--cache-control', 'public,max-age=31536000,immutable', '-u', '-f', '-q',
  ], { stdio: 'inherit' });
}

function walk(blocks, fn) {
  for (const b of blocks ?? []) {
    fn(b);
    if (b.children?.length) walk(b.children, fn);
  }
}

const CACHE = '.images-cache';
const cacheFile = (url) => path.join(CACHE, hash(Buffer.from(url)) + '.json');

async function processOne(url) {
  try {
    return JSON.parse(await fs.readFile(cacheFile(url), 'utf8'));
  } catch {}
  const src = await fetchImage(url);
  const { data, ext } = await normalise(src);
  const key = hash(data) + '.' + ext;
  await fs.writeFile(path.join(TMP, key), data);
  const out = { key, bytesIn: src.buf.length, bytesOut: data.length };
  await fs.writeFile(cacheFile(url), JSON.stringify(out));
  return out;
}

async function main() {
  const probeIdx = process.argv.indexOf('--probe');
  await fs.mkdir(TMP, { recursive: true });
  await fs.mkdir(CACHE, { recursive: true });

  if (probeIdx > -1) {
    const url = process.argv[probeIdx + 1];
    if (!url) throw new Error('--probe needs a URL');
    const r = await processOne(url);
    upload();
    console.log('in ' + Math.round(r.bytesIn / 1024) + 'KB -> out ' + Math.round(r.bytesOut / 1024) + 'KB');
    console.log('https://www.renhanquan.com/' + PREFIX + r.key);
    return;
  }

  const files = (await fs.readdir(DIR)).filter((f) => f.endsWith('.json'));
  const jobs = [];
  const parsed = [];

  for (const file of files) {
    const full = path.join(DIR, file);
    const doc = JSON.parse(await fs.readFile(full, 'utf8'));
    parsed.push([full, doc]);
    walk(doc.blocks, (b) => {
      if (b.type !== 'image') return;
      const url = b.image?.file?.url ?? b.image?.external?.url;
      if (typeof url === 'string' && url.startsWith('http')) jobs.push({ url });
    });

    const cover = doc.post?.cover_url;
    if (typeof cover === 'string' && cover.startsWith('http')
        && !SKIP_COVER_HOSTS.some((h) => cover.includes(h))) {
      jobs.push({ url: cover });
    }
  }

  console.log(jobs.length + ' remote images found');

  const results = new Map();
  let cursor = 0;
  let failed = 0;

  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      try {
        if (!results.has(job.url)) results.set(job.url, await processOne(job.url));
      } catch (err) {
        failed++;
        console.warn('fail ' + job.url.slice(0, 60) + ': ' + err.message);
        results.set(job.url, null);
      }
    }
  }
  await Promise.all(Array.from({ length: LIMIT }, worker));

  let rewritten = 0;
  const coverBySlug = new Map();

  for (const [full, doc] of parsed) {
    walk(doc.blocks, (b) => {
      if (b.type !== 'image') return;
      const url = b.image?.file?.url ?? b.image?.external?.url;
      const r = results.get(url);
      if (!r) return;
      b.image = { caption: b.image?.caption ?? [], type: 'external', external: { url: '/' + PREFIX + r.key } };
      rewritten++;
    });

    const cover = doc.post?.cover_url;
    const rc = typeof cover === 'string' ? results.get(cover) : null;
    if (rc) {
      doc.post.cover_url = '/' + PREFIX + rc.key;
      rewritten++;
    }
    if (doc.post?.slug) coverBySlug.set(doc.post.slug, doc.post.cover_url ?? null);

    await fs.writeFile(full, JSON.stringify(doc, null, 2) + String.fromCharCode(10));
  }

  // Keep the list index in sync so PostCard/OG images use the rewritten covers.
  try {
    const index = JSON.parse(await fs.readFile(INDEX, 'utf8'));
    for (const post of index) {
      if (coverBySlug.has(post.slug)) post.cover_url = coverBySlug.get(post.slug);
    }
    await fs.writeFile(INDEX, JSON.stringify(index, null, 2) + String.fromCharCode(10));
  } catch {}

  upload();
  const total = [...results.values()].filter(Boolean);
  const inBytes = total.reduce((a, r) => a + r.bytesIn, 0);
  const outBytes = total.reduce((a, r) => a + r.bytesOut, 0);
  console.log('rewrote ' + rewritten + ' blocks / ' + total.length + ' unique images (' +
    (inBytes / 1024 / 1024).toFixed(1) + 'MB -> ' + (outBytes / 1024 / 1024).toFixed(1) + 'MB), ' + failed + ' failed');
}

main().catch((err) => { console.error(err); process.exit(1); });