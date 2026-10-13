import assert from 'node:assert/strict';
import { serve } from '@hono/node-server';
import { chromium } from 'playwright';
import { Runtime } from '../dist/runtime.js';
import { createApp } from '../dist/server.js';
const runtime = await Runtime.create({ demo: true, demoAt: '2027-03-10' });
const server = serve({ fetch: createApp(runtime).fetch, hostname: '127.0.0.1', port: 0 });
let browser;
try {
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: process.env.QA_BROWSER_CHANNEL ?? 'chrome', headless: true });
  const page = await browser.newPage();
  await page.clock.install();
  let changed = false, providerRefreshes = 0;
  await page.route('**/api/projects', async route => {
    const response = await route.fetch(); const data = await response.json();
    await route.fulfill({ json: { ...data, mode: 'live' } });
  });
  await page.route('**/api/refresh?**', async route => { providerRefreshes++; await route.continue(); });
  await page.route('**/api/calendar?**', async route => {
    const response = await route.fetch(); const data = await response.json();
    if (changed) {
      for (const r of data.releases) r.name = `Updated ${r.name}`;
      for (const e of data.events) e.title = `Updated ${e.title}`;
    }
    await route.fulfill({ json: data });
  });
  await page.goto(`${base}/?month=2027-03`);
  await page.locator('.calendar').waitFor();
  await page.locator('#next').focus();
  changed = true;
  await page.clock.fastForward(15000);
  await page.waitForFunction(() => document.querySelector('#release-filter')?.textContent?.includes('Updated'));
  assert.equal(await page.locator('#next').evaluate(node => node === document.activeElement), true);
  assert.equal(providerRefreshes, 0);
  console.log(JSON.stringify({ verdict: 'PASS', scenarios: ['visible web calendar updates from local snapshots without manual refresh', 'keyboard focus survives polling', 'polling does not call provider refresh endpoint'] }));
} finally { if (browser) await browser.close(); await runtime.shutdown(); await new Promise(resolve => server.close(resolve)); }
