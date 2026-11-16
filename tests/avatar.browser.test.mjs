import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

// Exercise the actual static export with mocked control APIs. No account,
// upload or SMS request in this suite reaches the production service.
const dist = resolve('out');
let server, browser, base, largeImage, bands;
before(async () => {
  await readFile(resolve(dist, 'manage/users/index.html')).catch(() => {
    throw new Error('Build first: NEXT_PUBLIC_YARD_API=https://api.renhanquan.com pnpm build');
  });
  largeImage = await sharp(randomBytes(2400 * 1800 * 3), { raw: { width: 2400, height: 1800, channels: 3 } }).png().toBuffer();
  assert(largeImage.length > 5 * 1024 * 1024);
  const pixels = Buffer.alloc(900 * 300 * 3);
  for (let y = 0; y < 300; y++) for (let x = 0; x < 900; x++) pixels[(y * 900 + x) * 3 + Math.floor(x / 300)] = 255;
  bands = await sharp(pixels, { raw: { width: 900, height: 300, channels: 3 } }).png().toBuffer();
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = resolve(dist, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
      if (!file.startsWith(dist + sep)) { res.writeHead(403).end(); return; }
      res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
      res.end(await readFile(file));
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

async function withPage(options, fn) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [], writes = [];
  let failSave = false;
  let session = { id: 'test-user', name: '裁剪测试', phone: '138****0000', role: 'member', avatar: '', capabilities: { users: true } };
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === base) return route.continue();
    const headers = { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Protection', 'Access-Control-Allow-Methods': 'GET, PATCH, POST' };
    const reply = (json, status = 200) => route.fulfill({ status, headers, json });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname === '/auth/me') return reply(session);
    if (url.pathname === '/admin/users' && req.method() === 'GET') return reply({ users: [] });
    if (url.pathname === '/auth/profile' || (url.pathname === '/admin/users' && req.method() === 'POST')) {
      assert.equal(req.headers()['x-csrf-protection'], '1');
      const body = req.postDataJSON();
      writes.push(body);
      if (failSave) return reply({ error: 'change_failed' }, 500);
      session = { ...session, ...body };
      return reply(session);
    }
    return route.abort();
  });
  try {
    await page.goto(base + '/manage/users/');
    await page.getByRole('button', { name: '裁剪测试，账号菜单' }).waitFor();
    await fn({ page, writes, failSave: value => { failSave = value; } });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}

async function openAccount(page) {
  await page.getByRole('button', { name: '裁剪测试，账号菜单' }).click();
  return page.getByRole('dialog', { name: '账号', exact: true });
}
async function choose(scope, buffer = bands) {
  await scope.getByLabel('选择头像图片').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer });
}
async function centerPixel(dialog) {
  return dialog.locator('canvas').evaluate(canvas => Array.from(canvas.getContext('2d').getImageData(300, 300, 1, 1).data));
}
async function assertUpload(avatar) {
  assert.match(avatar, /^data:image\/jpeg;base64,/);
  assert(avatar.length <= 180000);
  const metadata = await sharp(Buffer.from(avatar.split(',')[1], 'base64')).metadata();
  assert.equal(metadata.width, metadata.height);
  assert(metadata.width <= 512 && metadata.width > 0);
}

async function screenshot(page, name) {
  if (process.env.AVATAR_SCREENSHOT_DIR) await page.screenshot({ path: resolve(process.env.AVATAR_SCREENSHOT_DIR, name + '.png') });
}

test('large originals are cropped locally; failed saves retain the crop for retry', () => withPage({}, async ({ page, writes, failSave }) => {
  const account = await openAccount(page);
  await choose(account, largeImage);
  const dialog = page.getByRole('dialog', { name: '调整头像', exact: true });
  await dialog.waitFor();
  assert.equal(writes.length, 0);
  const preview = await dialog.locator('canvas').evaluate(c => c.toDataURL());
  await screenshot(page, 'avatar-desktop');
  await dialog.getByLabel('缩放', { exact: true }).press('End');
  assert.notEqual(await dialog.locator('canvas').evaluate(c => c.toDataURL()), preview);
  failSave(true);
  await dialog.getByRole('button', { name: '使用此头像' }).click();
  await dialog.getByRole('alert').waitFor();
  assert.equal(await dialog.getByLabel('缩放', { exact: true }).inputValue(), '4');
  assert.equal(writes.length, 1);
  await assertUpload(writes[0].avatar);
  failSave(false);
  await dialog.getByRole('button', { name: '使用此头像' }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(writes.length, 2);
  assert.equal(writes[1].avatar, writes[0].avatar);
  await account.getByRole('button', { name: '移除头像' }).waitFor();
}));

test('dragging changes the exported region; zoom, reset and keyboard movement work', () => withPage({}, async ({ page, writes }) => {
  await choose(await openAccount(page));
  const dialog = page.getByRole('dialog', { name: '调整头像', exact: true });
  await dialog.waitFor();
  assert.deepEqual((await centerPixel(dialog)).slice(0, 3), [0, 255, 0]);
  await dialog.getByLabel('缩放', { exact: true }).press('End');
  await dialog.getByRole('button', { name: '重置' }).click();
  assert.equal(await dialog.getByLabel('缩放', { exact: true }).inputValue(), '1');
  await dialog.locator('canvas').focus();
  await page.keyboard.press('ArrowLeft');
  const box = await dialog.locator('canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - box.width, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  assert.deepEqual((await centerPixel(dialog)).slice(0, 3), [0, 0, 255]);
  await dialog.getByRole('button', { name: '使用此头像' }).click();
  await dialog.waitFor({ state: 'hidden' });
  await assertUpload(writes[0].avatar);
  const { data } = await sharp(Buffer.from(writes[0].avatar.split(',')[1], 'base64')).raw().toBuffer({ resolveWithObject: true });
  assert(data[2] > 240 && data[0] < 10 && data[1] < 10, 'Uploaded crop must contain the selected blue band');
}));

test('mobile nested dialog supports touch, cancellation and reselecting without submitting the user form', () => withPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, async ({ page, writes }) => {
  await page.getByRole('button', { name: '新增内置用户', exact: true }).click();
  const parent = page.getByRole('dialog', { name: '新增内置用户', exact: true });
  await choose(parent);
  const dialog = page.getByRole('dialog', { name: '调整头像', exact: true });
  await dialog.waitFor();
  const bounds = await dialog.boundingBox();
  assert(bounds.x >= 0 && bounds.x + bounds.width <= 390);
  await screenshot(page, 'avatar-mobile');
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert(await parent.isVisible());
  assert.equal(writes.length, 0);
  await choose(parent);
  await dialog.waitFor();
  await dialog.getByLabel('缩放', { exact: true }).focus();
  await page.keyboard.press('Enter');
  assert.equal(writes.length, 0);
  const box = await dialog.locator('canvas').boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: box.y + box.height / 2 }] });
  await touch('touchStart', box.x + box.width - 10);
  await touch('touchMove', box.x + 5);
  await touch('touchEnd');
  assert.deepEqual((await centerPixel(dialog)).slice(0, 3), [0, 0, 255]);
  await dialog.getByRole('button', { name: '使用此头像' }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(writes.length, 0, 'User form still requires its own save');
  const avatar = await parent.locator('img').getAttribute('src');
  await assertUpload(avatar);
  await choose(parent);
  await dialog.waitFor();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await parent.locator('img').getAttribute('src'), avatar);
  await parent.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(writes.length, 0);
}));

test('invalid image bytes show an error and selecting the same file again still opens the cropper', () => withPage({}, async ({ page, writes }) => {
  const account = await openAccount(page);
  await choose(account, Buffer.from('not a PNG'));
  await account.getByRole('alert').waitFor();
  assert.equal(writes.length, 0);
  await choose(account);
  const dialog = page.getByRole('dialog', { name: '调整头像', exact: true });
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert(await account.isVisible(), 'Escape must not dismiss the account menu');
  await choose(account);
  await dialog.waitFor();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(writes.length, 0);
}));
