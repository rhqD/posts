import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';

// Do not use Playwright request routing here: routing disables the browser's
// HTTP cache and hides precisely the stale-manifest regression being tested.
test('a fresh /home ignores a previously long-cached model manifest', async () => {
  const dist = resolve('out');
  const manifestBytes = await readFile(resolve(dist, 'yard/lights.json'));
  const latest = JSON.parse(manifestBytes.toString());
  const manifestHash = createHash('sha256').update(manifestBytes).digest('hex').slice(0, 8);
  const manifestUrl = `/yard/lights.${manifestHash}.json`;
  assert.deepEqual(await readFile(resolve(dist, '.' + manifestUrl)), manifestBytes);
  // Derive an old scene without the AC from the real exported model, keeping
  // the original binary geometry and node indices. No external test fixture.
  const currentGlb = await readFile(resolve(dist, '.' + latest.model.url));
  const oldJsonLength = currentGlb.readUInt32LE(12);
  const oldScene = JSON.parse(currentGlb.subarray(20, 20 + oldJsonLength).toString());
  const acNodes = new Set(oldScene.nodes.flatMap((node, index) => node.name?.startsWith('2F_AC_Mijia_202') ? [index] : []));
  for (const scene of oldScene.scenes) scene.nodes = scene.nodes?.filter(index => !acNodes.has(index));
  for (const node of oldScene.nodes) if (node.children) node.children = node.children.filter(index => !acNodes.has(index));
  const jsonBytes = Buffer.from(JSON.stringify(oldScene));
  const paddedJson = Buffer.alloc(Math.ceil(jsonBytes.length / 4) * 4, 0x20);
  jsonBytes.copy(paddedJson);
  const rest = currentGlb.subarray(20 + oldJsonLength);
  const header = Buffer.from(currentGlb.subarray(0, 20));
  header.writeUInt32LE(20 + paddedJson.length + rest.length, 8);
  header.writeUInt32LE(paddedJson.length, 12);
  const legacyGlb = Buffer.concat([header, paddedJson, rest]);
  const legacy = { ...latest, model:{...latest.model, url:'/legacy-model.glb', hash:'legacy'} };
  let phase = 'legacy';
  const manifests = [], models = [];
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/prime/') return res.writeHead(200, {'Content-Type':'text/html'}).end('<!doctype html><title>Prime old cache</title>');
      if (url.pathname === manifestUrl) {
        manifests.push({phase, url:url.pathname});
        return res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'public,max-age=31536000,immutable'}).end(manifestBytes);
      }
      if (url.pathname === '/yard/lights.json') {
        manifests.push({phase, url:url.pathname});
        return res.writeHead(200, {'Content-Type':'application/json','Cache-Control':phase === 'legacy' ? 'public,max-age=31536000,immutable' : 'no-cache'}).end(JSON.stringify(phase === 'legacy' ? legacy : latest));
      }
      if (url.pathname === '/legacy-model.glb') {
        models.push(url.pathname);
        return res.writeHead(200, {'Content-Type':'model/gltf-binary'}).end(legacyGlb);
      }
      if (url.pathname.endsWith('.glb')) models.push(url.pathname);
      const file = resolve(dist, '.' + decodeURIComponent(url.pathname) + (url.pathname.endsWith('/') ? 'index.html' : ''));
      if (!file.startsWith(dist + sep)) return res.writeHead(403).end();
      res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.glb':'model/gltf-binary','.svg':'image/svg+xml'})[extname(file)] || 'application/octet-stream');
      res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({headless:true,...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      const originalFetch = window.fetch.bind(window);
      window.__unwantedWrites = [];
      window.fetch = (input, init) => {
        const url = new URL(typeof input === 'string' ? input : input.url ?? String(input), location.href);
        if (url.origin !== 'https://api.renhanquan.com') return originalFetch(input, init);
        const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
        if (method !== 'GET') { window.__unwantedWrites.push(url.pathname); return Promise.resolve(new Response('{}', {status:403})); }
        return Promise.resolve(new Response(JSON.stringify(url.pathname === '/devices' ? {devices:[]} : null), {status:200,headers:{'Content-Type':'application/json'}}));
      };
      window.EventSource = class { close() {} };
    });
    await page.goto(base + '/prime/');
    assert.equal((await page.evaluate(() => fetch('/yard/lights.json').then(r => r.json()))).model.hash, 'legacy');
    assert.equal(manifests.length, 1);
    phase = 'current';
    await page.goto(base + '/home/');
    await page.waitForFunction(() => window.yardPreviewState?.loaded, undefined, {timeout:45000});
    const disabled = await page.locator('[aria-label="打开202 卧室空调控制面板"]').isDisabled();
    console.log(JSON.stringify({manifestRequests:manifests,modelRequests:models,climateDisabled:disabled}));
    assert.equal(disabled, false, 'new UI used a cached manifest and loaded a model without the air conditioner');
    assert.deepEqual(manifests.map(m => m.url), ['/yard/lights.json', manifestUrl], 'new build followed the fixed-name pointer');
    assert(models.includes(latest.model.url), 'latest hashed model was not requested');
    assert.equal(await page.evaluate(() => window.yardPreviewState.climateAvailable), true);
    assert.equal(await page.evaluate(() => window.yardPreviewState.manifestUrl), manifestUrl);
    // A subsequent visit can reuse the immutable manifest instead of forcing
    // a new network request for the same content.
    await page.goto(base + '/prime/?again');
    await page.goto(base + '/home/');
    await page.waitForFunction(() => window.yardPreviewState?.loaded, undefined, {timeout:45000});
    assert.equal(manifests.length, 2, 'unchanged hashed manifest was not reused from browser cache');
    assert.equal(await page.locator('[aria-label="打开202 卧室空调控制面板"]').isDisabled(), false);
    assert.deepEqual(errors, []);
    assert.deepEqual(await page.evaluate(() => window.__unwantedWrites), []);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
