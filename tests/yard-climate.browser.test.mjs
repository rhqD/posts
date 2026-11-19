import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { chromium } from '@playwright/test';

// Exercise the exported /home with the actual GLB and renderer. Every control
// API is mocked: these regressions must never turn a household appliance on.
const dist = resolve('out');
const key = 'xiaomi-959023669';
let server, browser, base;
before(async () => {
  await readFile(resolve(dist, 'home/index.html'));
  server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = resolve(dist, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
      if (!file.startsWith(dist + sep)) return res.writeHead(403).end();
      res.setHeader('Content-Type', ({ '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.wasm':'application/wasm', '.glb':'model/gltf-binary', '.svg':'image/svg+xml' })[extname(file)] || 'application/octet-stream');
      res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless:true, ...(process.env.CHROME_PATH ? { executablePath:process.env.CHROME_PATH } : {}) });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });

async function fixture(options, run) {
  const context = await browser.newContext({ viewport:options.viewport ?? { width:1440, height:1000 }, reducedMotion:'reduce' });
  const page = await context.newPage();
  const errors = [], writes = [];
  let state = { switch:false, targetTemperature:24, temperature:10.4, humidity:44, mode:2, fanLevel:0, verticalSwing:false, indicator:true, online:true, stateFresh:true, ...options.state };
  let permission = options.permission ?? { read:true, control:true };
  let failNext = false, acknowledge = true, holdNext = false, heldResolve, heldRelease;
  const held = () => new Promise(resolve => { heldResolve = resolve; holdNext = true; });
  const actions = Object.fromEntries(['switch','mode','targetTemperature','fanLevel','verticalSwing','indicator'].map(field => ['set_' + field, { type:['switch','verticalSwing','indicator'].includes(field) ? 'bool' : 'number' }]));
  const rows = () => permission.read || permission.control ? [{ key, name:'米家空调', online:state.online, state:{...state}, actions, permissions:{...permission} }] : [];
  await page.addInitScript(({key}) => {
    window.__yardStreams = [];
    window.__displayText = [];
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
      if (this.canvas.width === 256 && this.canvas.height === 256) window.__displayText.push(String(text));
      return fillText.call(this, text, ...args);
    };
    window.EventSource = class {
      constructor() { window.__yardStreams.push(this); queueMicrotask(() => { if (!this.closed) this.onopen?.(); }); }
      close() { this.closed = true; }
    };
    window.__pushClimate = state => window.__yardStreams.filter(s => !s.closed).forEach(s => s.onmessage?.({ data:JSON.stringify({ states:{[key]:state} }) }));
  }, {key});
  async function push(patch) { state = {...state, ...patch}; await page.evaluate(s => window.__pushClimate(s), state); }
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === base) return route.continue();
    if (url.origin !== 'https://api.renhanquan.com') return route.abort();
    const headers = { 'Access-Control-Allow-Origin':base, 'Access-Control-Allow-Credentials':'true', 'Access-Control-Allow-Headers':'Content-Type, X-CSRF-Protection', 'Access-Control-Allow-Methods':'GET, POST, OPTIONS' };
    const reply = (json, status = 200) => route.fulfill({status, headers, json}).catch(() => {});
    if (req.method() === 'OPTIONS') return route.fulfill({status:204, headers});
    if (url.pathname === '/auth/me') return reply({id:'test-user',name:'设备测试',role:'member',phone:'138****0000',capabilities:{}});
    if (url.pathname === '/devices' && req.method() === 'GET') {
      const snapshot = {devices:rows()};
      if (holdNext) {
        holdNext = false;
        await new Promise(resolve => { heldRelease = resolve; heldResolve?.(); });
      }
      return reply(snapshot);
    }
    if (url.pathname === `/devices/${key}/commands` && req.method() === 'POST') {
      assert.equal(req.headers()['x-csrf-protection'], '1');
      assert.match(req.headers()['content-type'], /application\/json/);
      const body = req.postDataJSON(); writes.push(body);
      if (failNext) { failNext = false; return reply({error:'apply_failed'}, 502); }
      if (acknowledge) state = {...state, [body.action.slice(4)]:body.params.value};
      await reply({ok:true, readings:{...state}});
      if (acknowledge) await push({});
      return;
    }
    return reply({error:'not_found'}, 404);
  });
  try {
    await page.goto(base + '/home/');
    await page.waitForFunction(() => window.yardPreviewState?.loaded, {timeout:45000});
    await page.locator('[aria-label="查看空调"]').waitFor({state:'attached'});
    await page.waitForFunction(() => !document.querySelector('[aria-label="查看空调"]').disabled);
    const open = async () => {
      await page.getByRole('button', {name:'打开202 卧室空调控制面板',exact:true}).click();
      return page.getByRole('dialog', {name:'202 卧室空调'});
    };
    await run({page, writes, push, open, hold:held, release:() => heldRelease?.(), setAcknowledge:value => { acknowledge = value; }, fail:() => { failNext = true; }, setPermission:async value => { permission = value; await page.evaluate(() => window.dispatchEvent(new Event('auth-change'))); }});
    assert.deepEqual(errors, []);
  } catch (error) {
    await page.screenshot({path:'/tmp/posts-home-climate/failure.png'}).catch(() => {});
    throw error;
  } finally { heldRelease?.(); await context.close(); }
}

async function settled(page) {
  await page.waitForFunction(() => !document.querySelector('dialog [role="status"]'));
}

test('capsule and model clicks open the same panel without switching the appliance', async () => {
  await fixture({}, async ({page, open, writes}) => {
    const dialog = await open();
    assert.match(await dialog.getByLabel('空调设定温度').textContent(), /^24℃$/);
    assert.equal(await dialog.getByLabel('空调当前室温', {exact:true}).textContent(), '10.4℃');
    assert.equal(await dialog.getByRole('switch', {name:'空调电源',exact:true}).getAttribute('aria-checked'), 'false');
    await page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 0);
    await page.getByRole('button', {name:'查看空调', exact:true}).click();
    await page.waitForTimeout(300);
    await page.screenshot({path:'/tmp/posts-home-climate/model-focus.png'});
    const canvas = page.locator('#stage canvas');
    const box = await canvas.boundingBox();
    await page.mouse.click(box.x + box.width * .52, box.y + box.height * .42);
    await page.getByRole('dialog', {name:'202 卧室空调'}).waitFor();
    assert.equal(writes.length, 0, 'opening a model/pill must not toggle power');
    await page.screenshot({path:'/tmp/posts-home-climate/desktop.png'});
  });
});

test('confirmed SSE state drives the screen; late snapshots and failed writes cannot fake success', async () => {
  await fixture({}, async ({page, open, writes, push, hold, release, setAcknowledge, fail}) => {
    const dialog = await open();
    const power = dialog.getByRole('switch', {name:'空调电源',exact:true});
    setAcknowledge(false);
    const waiting = hold();
    await power.click();
    await waiting;
    assert.equal(await power.getAttribute('aria-checked'), 'false');
    assert.match(await dialog.locator('p[role="status"]').textContent(), /等待设备确认/);
    await push({switch:true});
    assert.equal(await power.getAttribute('aria-checked'), 'true');
    release();
    await settled(page);
    assert.equal(await power.getAttribute('aria-checked'), 'true', 'late HTTP snapshot overwrote newer SSE');
    assert.deepEqual(writes[0], {action:'set_switch',params:{value:true}});
    assert((await page.evaluate(() => window.__displayText)).includes('24'));
    assert(!(await page.evaluate(() => window.__displayText)).includes('10.4'), 'room temperature leaked onto the setpoint display');
    setAcknowledge(true);
    fail();
    await dialog.getByRole('button', {name:'升高设定温度 0.5℃'}).click();
    await dialog.getByRole('alert').waitFor();
    assert.match(await dialog.getByLabel('空调设定温度').textContent(), /^24℃$/);
    assert.deepEqual(writes.at(-1), {action:'set_targetTemperature',params:{value:24.5}});
    await dialog.getByRole('button', {name:'升高设定温度 0.5℃'}).click();
    await settled(page);
    assert.match(await dialog.getByLabel('空调设定温度').textContent(), /^24.5℃$/);
    await dialog.getByRole('button', {name:'制热',exact:true}).click(); await settled(page);
    assert.equal(await dialog.getByRole('button', {name:'制热',exact:true}).getAttribute('aria-pressed'), 'true');
    await dialog.getByLabel('空调风速').selectOption('8'); await settled(page);
    await dialog.getByRole('switch', {name:'空调上下扫风',exact:true}).click(); await settled(page);
    assert.equal(await dialog.getByRole('switch', {name:'空调上下扫风',exact:true}).isChecked(), true);
    await dialog.getByRole('switch', {name:'空调指示灯',exact:true}).click(); await settled(page);
    assert.equal(await dialog.getByRole('switch', {name:'空调指示灯',exact:true}).isChecked(), false);
    assert.deepEqual(writes.slice(-4).map(w => w.action), ['set_mode','set_fanLevel','set_verticalSwing','set_indicator']);
    await push({targetTemperature:27, temperature:12, indicator:true});
    assert.match(await dialog.getByLabel('空调设定温度').textContent(), /^27℃$/);
    assert.equal(await dialog.getByLabel('空调当前室温', {exact:true}).textContent(), '12℃');
    assert((await page.evaluate(() => window.__displayText)).includes('27'));
    await dialog.getByRole('button', {name:'关闭空调控制面板'}).click();
    await page.getByRole('button', {name:'查看空调',exact:true}).click();
    await page.screenshot({path:'/tmp/posts-home-climate/model-on.png'});
    await push({switch:false});
    await page.screenshot({path:'/tmp/posts-home-climate/model-off.png'});
    const offlinePanel = await open();
    await push({online:false});
    await page.waitForFunction(() => document.querySelector('dialog [aria-label="空调电源"]').disabled);
    assert.equal(await offlinePanel.getByRole('switch', {name:'空调电源',exact:true}).isDisabled(), true);
    await push({online:true,stateFresh:false});
    assert.equal(await offlinePanel.getByRole('switch', {name:'空调电源',exact:true}).isDisabled(), true);
  });
});

test('mobile read-only state follows MQTT updates and is cleared when access changes', async () => {
  await fixture({viewport:{width:390,height:844}, permission:{read:true,control:false}, state:{switch:true}}, async ({page, open, push, writes, setPermission}) => {
    await page.getByRole('button', {name:'日照与设备'}).click();
    const dialog = await open();
    assert.equal(await dialog.getByRole('switch', {name:'空调电源',exact:true}).isDisabled(), true);
    assert.match(await dialog.textContent(), /当前仅可查看/);
    await push({targetTemperature:25.5});
    await page.waitForFunction(() => document.querySelector('output[aria-label="空调设定温度"]').textContent === '25.5℃');
    assert((await page.evaluate(() => window.__displayText)).includes('25.5'));
    const box = await dialog.boundingBox();
    assert(box.x >= 0 && box.width <= 390 && box.y >= 0 && box.y + box.height <= 845);
    await page.screenshot({path:'/tmp/posts-home-climate/mobile.png'});
    await dialog.getByRole('button', {name:'关闭空调控制面板'}).click();
    await page.getByRole('button', {name:'日照与设备'}).click();
    await page.getByRole('button', {name:'查看空调',exact:true}).click();
    await page.waitForTimeout(450);
    const canvas = await page.locator('#stage canvas').boundingBox();
    await page.mouse.click(canvas.x + canvas.width * .52, canvas.y + canvas.height * .46);
    await dialog.waitFor();
    await setPermission({read:false,control:false});
    await page.waitForFunction(() => document.querySelector('output[aria-label="空调设定温度"]').textContent === '—℃');
    assert.equal(await page.getByLabel('已绑定真实设备').count(), 0);
    assert.equal(writes.length, 0);
  });
});
