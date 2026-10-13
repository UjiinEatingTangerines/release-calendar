import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { serve } from '@hono/node-server';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { Runtime } from '../dist/runtime.js';
import { OAuthTransport } from '../dist/auth/transport.js';
import { createApp } from '../dist/server.js';
const dir = await mkdtemp(join(tmpdir(), 'release-oauth-qa-'));
let runtime, server, browser, browserServer, page;
const cloud = '11111111-1111-4111-8111-111111111111', calls = [], errors = [];
try {
  const reservation = createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const transport = new OAuthTransport(async input => {
    const request = new Request(input), url = new URL(request.url); calls.push({ method: request.method, path: url.pathname });
    if (request.method === 'POST') return Response.json({ access_token: 'fictional-access', refresh_token: 'fictional-refresh', expires_in: 3600, ...(url.hostname === 'github.com' ? { token_type: 'bearer' } : {}) });
    if (url.pathname.includes('accessible-resources')) return Response.json([{ id: cloud, name: 'Fictional Orbit', url: 'https://fictional-orbit.atlassian.net' }]);
    if (url.pathname.includes('/project/search')) return Response.json({ values: [{ id: '100', key: 'ORBIT', name: 'Orbit Release' }], total: 1, isLast: true });
    if (url.pathname === '/user/installations') return Response.json({ total_count: 1, installations: [{ id: 12, permissions: { contents: 'read', pull_requests: 'read' } }] });
    return Response.json({ total_count: 2, repositories: [{ id: 31, full_name: 'fictional/web' }, { id: 32, full_name: 'fictional/api' }] });
  });
  runtime = await Runtime.create({ demo: true, settingsPath: join(dir, 'connections.json'), dataDir: join(dir, 'data'), oauthTransport: transport, oauthPort: port });
  server = serve({ fetch: createApp(runtime).fetch, hostname: '127.0.0.1', port: 0 });
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
  const address = `http://127.0.0.1:${server.address().port}`;
  browserServer = await chromium.launchServer({ channel: process.env.QA_BROWSER_CHANNEL ?? 'chrome', headless: true });
  browser = await chromium.connect(browserServer.wsEndpoint());
  const context = await browser.newContext({ viewport: { width: 1120, height: 900 } });
  // Replace only provider transport/login pages. Callbacks, CSRF, files and selection routes are real.
  await context.route('https://auth.atlassian.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Fictional consent</h1>' }));
  await context.route('https://github.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Fictional consent</h1>' }));
  await context.route('**/api/refresh?**', route => route.fulfill({ json: { warnings: [] } }));
  page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  page.on('response', async response => { if (response.status() >= 400 && response.url().startsWith(address)) console.error({ path: new URL(response.url()).pathname, status: response.status(), error: await response.text() }); });
  await page.goto(`${address}/settings.html`);
  for (const [provider, label] of [['jira', 'Jira'], ['github', 'GitHub']]) {
    const card = page.locator('.oauth-card').filter({ has: page.getByRole('heading', { name: label, exact: true }) });
    const login = card.getByRole('button', { name: `${label} 로그인 준비하기`, exact: true });
    await login.waitFor();
    await card.getByText('로그인 준비가 필요합니다.', { exact: false }).waitFor();
    assert.equal(await login.isDisabled(), false);
    await login.hover();
    assert.notEqual(await login.evaluate(el => getComputedStyle(el).cursor), 'wait', 'Unconfigured login must not look busy');
    await card.getByText('로그인 준비가 필요합니다.', { exact: false }).waitFor();
    await login.click();
    assert.equal(await card.locator('details').evaluate(el => el.open), true);
    assert.equal(await card.locator('summary').evaluate(el => el === document.activeElement), true);
    await page.locator(`#oauth-${provider}-client`).fill('fictional-client');
    await page.locator(`#oauth-${provider}-secret`).fill('fictional-secret');
    await card.getByRole('button', { name: '앱 등록 정보 저장', exact: true }).click();
    await card.getByRole('button', { name: `${label} 로그인`, exact: true }).waitFor();
    const popupEvent = context.waitForEvent('page');
    await card.getByRole('button', { name: `${label} 로그인`, exact: true }).click();
    const popup = await popupEvent;
    await popup.waitForURL(provider === 'jira' ? 'https://auth.atlassian.com/**' : 'https://github.com/**');
    const state = new URL(popup.url()).searchParams.get('state'); assert.ok(state);
    await popup.goto(`${runtime.oauth.callback(provider)}?state=${state}&code=fictional-code`);
    await popup.getByRole('heading', { name: '로그인을 완료했습니다.' }).waitFor(); await popup.close();
    if (provider === 'jira') await page.locator('#oauth-project option[value="ORBIT"]').waitFor({ state: 'attached' });
    else await page.getByRole('checkbox', { name: 'fictional/web', exact: true }).waitFor();
  }
  await page.getByRole('checkbox', { name: 'fictional/web', exact: true }).check();
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/oauth-desktop.png', fullPage: true });
  assert.deepEqual((await new AxeBuilder({ page }).analyze()).violations, []);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.bringToFront();
  await page.evaluate(() => window.scrollTo(0, 0));
  assert.equal(await page.locator('h1').count(), 1);
  await page.screenshot({ path: 'artifacts/oauth-mobile.png' });
  await page.locator('.oauth-card').nth(1).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/oauth-mobile-github.png' });
  await page.getByRole('button', { name: '선택한 대상으로 연결', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/oauth-mobile-end.png' });
  assert.deepEqual((await new AxeBuilder({ page }).analyze()).violations, []);
  const selected = page.waitForResponse(response => response.url().endsWith('/api/settings/oauth/select') && response.status() === 200);
  await page.getByRole('button', { name: '선택한 대상으로 연결', exact: true }).click();
  await selected;
  assert.equal((await (await fetch(`${address}/api/projects`)).json()).mode, 'live');
  const safe = await (await fetch(`${address}/api/settings/oauth`)).text();
  assert.ok(!safe.includes('fictional-access') && !safe.includes('fictional-secret') && !safe.includes('fictional-refresh'));
  const document = JSON.parse(await readFile(join(dir, 'connections.json'), 'utf8'));
  assert.deepEqual(document.projects[0].github.repositories, ['fictional/web']);
  assert.ok(document.projects[0].jira.oauthGrant && document.projects[0].github.oauthGrant);
  assert.deepEqual(document.credentials, {});
  // Reauthorization must repair the existing grant, not strand the saved project on an old ID.
  const nextPopup = context.waitForEvent('page');
  await page.getByRole('button', { name: 'GitHub 다시 인증', exact: true }).click();
  const reconnect = await nextPopup; await reconnect.waitForURL('https://github.com/**');
  const reconnectState = new URL(reconnect.url()).searchParams.get('state');
  await reconnect.goto(`${runtime.oauth.callback('github')}?state=${reconnectState}&code=fictional-reconnect`);
  await reconnect.getByRole('heading', { name: '로그인을 완료했습니다.' }).waitFor(); await reconnect.close();
  const grants = (await (await fetch(`${address}/api/settings/oauth`)).json()).grants.filter(g => g.provider === 'github');
  assert.equal(grants.length, 1); assert.equal(grants[0].id, document.projects[0].github.oauthGrant);

  assert.ok(calls.filter(c => c.method === 'POST').every(c => ['/oauth/token', '/login/oauth/access_token'].includes(c.path)));
  assert.deepEqual(errors, []);
  const report = { verdict: 'PASS', scenarios: ['one-time app setup', 'Jira and GitHub browser authorization and real loopback callbacks', 'site/project/repository selection', 'OAuth-backed project persisted without manual API tokens; reauthorization preserves its grant ID', 'desktop/mobile zero axe violations, no overflow', 'no secret in status responses; only auth token endpoints use POST'], liveAuthentication: 'not tested; provider responses and consent pages are fictional fixtures' };
  await writeFile('artifacts/oauth-qa.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error({ notices: page ? await page.getByRole('status').allTextContents() : [], errors, calls });
  throw error;
} finally {
  if (browser) await browser.close(); if (browserServer) await browserServer.close();
  runtime?.oauth.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await rm(dir, { recursive: true, force: true });
}
