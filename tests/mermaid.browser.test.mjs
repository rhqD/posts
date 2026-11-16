import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vendor = dirname(require.resolve('mermaid'));
let browser, server, base;

before(async () => {
  // Compile the actual app helper; only module resolution changes for this
  // tiny browser harness. No copy of the rendering implementation is tested.
  const source = await readFile(resolve(root, 'src/lib/mermaid-renderer.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replace('import("mermaid")', 'import("/vendor/mermaid.esm.min.mjs")');
  server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/') {
        res.setHeader('Content-Type', 'text/html');
        res.end('<div id="graph"></div><script type="module">import { renderMermaid } from "/renderer.js"; window.renderDiagram = renderMermaid;</script>');
      } else if (pathname === '/renderer.js') {
        res.setHeader('Content-Type', 'text/javascript'); res.end(compiled);
      } else if (pathname.startsWith('/vendor/')) {
        const path = resolve(vendor, decodeURIComponent(pathname.slice('/vendor/'.length)));
        if (!path.startsWith(vendor + sep)) { res.writeHead(403).end(); return; }
        res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(path));
      } else { res.writeHead(404).end(); }
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function withPage(fn) {
  const page = await browser.newPage();
  try {
    await page.route('**/*', route => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
    await page.goto(base);
    await page.waitForFunction(() => typeof window.renderDiagram === 'function');
    await fn(page);
  } finally { await page.close(); }
}

test('normal Mermaid source still renders an SVG', () => withPage(async page => {
  await page.evaluate(() => window.renderDiagram(document.querySelector('#graph'), 'flowchart LR\nA-->B'));
  assert.equal(await page.locator('#graph svg').count(), 1);
}));

test('article HTML cannot create executable elements before Mermaid parses it', () => withPage(async page => {
  const source = 'flowchart LR\nA-->B</div><img src="data:image/png;base64,broken" onerror="window.securityReviewXss=true">';
  await page.evaluate(code => window.renderDiagram(document.querySelector('#graph'), code), source);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.securityReviewXss === true), false);
  assert.equal(await page.locator('[onerror], [onload], #graph script').count(), 0);
}));

test('architecture diagram cannot pollute Object.prototype', () => withPage(async page => {
  const source = 'architecture-beta\ngroup securityReviewMarker(cloud)[Marker]\nservice a(server)[A] in __proto__\nservice b(server)[B] in securityReviewMarker\na:R -- L:b';
  await page.evaluate(code => window.renderDiagram(document.querySelector('#graph'), code), source);
  assert.equal(await page.evaluate(() => Object.hasOwn(Object.prototype, 'securityReviewMarker')), false);
}));

test('invalid diagrams show escaped source and cancelled renders do not replace content', () => withPage(async page => {
  const source = '<img src=x onerror="window.securityReviewXss=true"> invalid diagram';
  await page.evaluate(code => window.renderDiagram(document.querySelector('#graph'), code), source);
  assert.equal(await page.locator('#graph').textContent(), source);
  await page.evaluate(() => window.renderDiagram(document.querySelector('#graph'), 'flowchart LR\nA-->B', () => false));
  assert.equal(await page.locator('#graph').textContent(), source);
  assert.equal(await page.locator('#graph img').count(), 0);
}));
