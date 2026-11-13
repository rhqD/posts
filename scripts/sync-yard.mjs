// Sync ONLY the model and the lamp configuration from ../yabai_home.
// The viewer UI (public/yard/index.html) is owned by this repo and is never
// overwritten by this script.
//
// Usage: node scripts/sync-yard.mjs [--no-upload]
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const SRC = '../yabai_home';
const OUT = 'public/yard/lights.json';
const BUCKET = process.env.OSS_BUCKET ?? 'oss://renhanquan-site';

const html = await fs.readFile(SRC + '/web/preview.html', 'utf8');

function parseExtraLights() {
  const start = html.indexOf('const extraLights = {');
  if (start < 0) throw new Error('extraLights not found in preview.html');
  const close = html.indexOf('};', start);
  if (close < 0) throw new Error('extraLights end not found');
  let literal = html.slice(start + 'const extraLights = '.length, close + 1);
  literal = literal.replace(/new THREE\.Vector3\(([^)]*)\)/g, (_, args) => {
    const parts = args.split(',').map((s) => s.trim()).filter(Boolean).map(Number);
    return JSON.stringify(parts);
  });
  return new Function('return (' + literal + ')')();
}

function labels() {
  const map = {};
  const re = /data-light-group="([^"]+)"[^>]*>\s*<span>([^<]+)<\/span>/g;
  let m;
  while ((m = re.exec(html))) map[m[1]] = m[2];
  return map;
}

const glbPath = SRC + '/exports/yard-web.glb';
const glb = await fs.readFile(glbPath);
// Content hash in the filename: a replaced model gets a new URL, so both the
// CDN and browsers can keep caching it as immutable forever.
const hash = createHash('sha256').update(glb).digest('hex').slice(0, 8);
const modelName = `yard-web.${hash}.glb`;
const reportName = `yard-web.${hash}.report.json`;

const groups = parseExtraLights();
const labelMap = labels();

const lights = {
  model: { url: `/models/${modelName}`, report: `/models/${reportName}`, hash },
  floodlight: {
    label: '西墙投光灯',
    lens: 'Yard_West_Floodlight_Lens',
    housing: 'Yard_West_Floodlight_Housing',
    intensity: 145,
  },
  groups: Object.entries(groups).map(([key, g]) => ({
    key,
    label: labelMap[key] ?? key,
    ...g,
    offset: g.offset ?? [],
  })),
};

await fs.writeFile(OUT, JSON.stringify(lights, null, 2) + String.fromCharCode(10));
console.log('lights.json:', lights.groups.length, 'lamp groups +', 1, 'floodlight');
for (const g of lights.groups) console.log('  -', g.key, '·', g.label);

if (!process.argv.includes('--no-upload')) {
  const report = JSON.parse(await fs.readFile(SRC + '/exports/yard-web.report.json', 'utf8'));
  const slim = JSON.stringify({ glb: report.glb, seconds: report.seconds }, null, 2);
  await fs.writeFile('/tmp/' + reportName, slim);
  execFileSync('ossutil', ['cp', glbPath, BUCKET + '/models/' + modelName,
    '--cache-control', 'public,max-age=31536000,immutable', '-f', '-q'], { stdio: 'inherit' });
  execFileSync('ossutil', ['cp', '/tmp/' + reportName, BUCKET + '/models/' + reportName,
    '--cache-control', 'public,max-age=31536000,immutable', '-f', '-q'], { stdio: 'inherit' });
  console.log('uploaded model:', modelName, report.glb.megabytes + 'MB,', report.glb.triangles, 'triangles');
}

// Local dev serves the same hashed URL through a symlink, so the hash in
// lights.json also works on localhost. public/models is gitignored.
await fs.mkdir('public/models', { recursive: true });
const localModel = 'public/models/' + modelName;
await fs.rm(localModel, { force: true });
await fs.symlink('../../../yabai_home/exports/yard-web.glb', localModel);
const slimReport = JSON.stringify({ glb: JSON.parse(await fs.readFile(SRC + '/exports/yard-web.report.json', 'utf8')).glb, seconds: JSON.parse(await fs.readFile(SRC + '/exports/yard-web.report.json', 'utf8')).seconds }, null, 2);
await fs.writeFile('public/models/' + reportName, slimReport);
console.log('local dev asset:', localModel);
