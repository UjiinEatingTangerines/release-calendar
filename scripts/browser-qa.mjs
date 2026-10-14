import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

await mkdir('artifacts', { recursive:true });
const server = spawn(process.execPath, ['dist/cli.js','serve','--demo','--demo-at','2027-03-10','--port','0'], { stdio:['ignore','pipe','pipe'] });
let browserServer, browser;
const results = [];
const errors = [];
const cleanup = async () => {
  if (browser) await browser.close();
  if (browserServer) await browserServer.close();
  if (server.exitCode === null) { const stopped = once(server,'exit'); server.kill('SIGTERM'); await stopped; }
};
process.once('SIGINT', () => { void cleanup().finally(() => process.exit(130)); });
try {
  const address = await new Promise((resolve,reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startup timeout')),15000);
    server.once('error',reject);
    server.stdout.on('data', (chunk) => { const match = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timeout); resolve(match[0]); } });
    server.stderr.on('data', (chunk) => errors.push(chunk.toString()));
  });
  browserServer = await chromium.launchServer({ channel:process.env.QA_BROWSER_CHANNEL ?? 'chrome',headless:true });
  await writeFile('artifacts/browser-pid.txt',String(browserServer.process().pid));
  browser = await chromium.connect(browserServer.wsEndpoint());
  const context = await browser.newContext({ viewport:{ width:1440,height:1100 },colorScheme:'light' });
  const page = await context.newPage(); page.on('pageerror',(error) => errors.push(error.message));
  await page.goto(`${address}/?month=2027-03`);
  await page.locator('.calendar').waitFor();
  assert.equal(await page.locator('.day').count(),35);
  await page.getByRole('button',{ name:'이전 달',exact:true }).click();
  await page.waitForFunction(() => document.querySelector('.calendar-region')?.getAttribute('aria-label') === '2027-02 월간 달력');
  assert.equal(await page.locator('.day').count(),28);
  await page.getByRole('button',{ name:'다음 달',exact:true }).click();
  await page.waitForFunction(() => document.querySelector('.calendar-region')?.getAttribute('aria-label') === '2027-03 월간 달력');
  results.push('Month navigation: March 35 cells -> February 28 cells -> March');
  await page.locator('#day-2027-03-10').focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator(':focus').getAttribute('id'),'day-2027-03-11');
  await page.locator('#day-2027-03-11').press('Home');
  assert.equal(await page.locator(':focus').getAttribute('id'),'day-2027-03-08');
  results.push('Keyboard arrows and Home retain focus and select the correct date');
  await page.locator('.event.development').first().click();
  await page.getByRole('heading',{ name:'Web 1.8',exact:true }).waitFor();
  assert.equal(await page.locator('.detail-panel .ticket-row').count(),2);
  assert.ok(await page.locator('.detail-panel').getByText('개별 일정 없음 1',{ exact:true }).isVisible());
  assert.equal(await page.locator('.pull').count(),1);
  assert.equal(await page.locator('.detail-panel a').first().getAttribute('href'),'https://example.com/releases/web-1-8');
  results.push('Release detail: two tickets, explicit unscheduled group, linked PR and source URL');
  await page.locator('#release-filter').selectOption({ label:'Web 1.8' });
  assert.equal(await page.locator('.event').filter({ hasText:'API 2.4' }).count(),0);
  await page.locator('#ticket-toggle').check();
  assert.ok(await page.locator('.event.ticket').count() > 0);
  const more = page.locator('.more').first();
  if (await more.count()) {
    const previousCount = await page.locator('.event').count(); await more.click();
    assert.ok(await page.locator('.event').count() > previousCount);
  }
  results.push('Release filtering and opt-in ticket date events');
  await page.locator('#release-filter').selectOption('');
  await page.screenshot({ path:'artifacts/desktop-light.png',fullPage:true });
  const desktopAxe = await new AxeBuilder({ page }).withRules(['label-content-name-mismatch']).analyze(); assert.deepEqual(desktopAxe.violations,[]);
  const desktopAll = await new AxeBuilder({ page }).analyze(); assert.deepEqual(desktopAll.violations,[]);
  await page.emulateMedia({ colorScheme:'dark' });
  await page.screenshot({ path:'artifacts/desktop-dark-preference.png',fullPage:true });
  await page.setViewportSize({ width:390,height:844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
  await page.locator('#day-2027-03-10').click();
  assert.ok(await page.getByRole('heading',{ name:'2027-03-10 · 선택일 일정' }).isVisible());
  await page.locator('.agenda-event').first().click();
  await page.screenshot({ path:'artifacts/mobile-dark-preference.png',fullPage:true });
  await page.emulateMedia({ colorScheme:'light' });
  await page.screenshot({ path:'artifacts/mobile-light.png',fullPage:true });
  const mobileAxe = await new AxeBuilder({ page }).withRules(['label-content-name-mismatch']).analyze(); assert.deepEqual(mobileAxe.violations,[]);
  const mobileAll = await new AxeBuilder({ page }).analyze(); assert.deepEqual(mobileAll.violations,[]);
  results.push('390px mobile: no overflow, compact monthly overview, selected-day agenda, detail and both OS themes');
  await page.getByRole('button',{ name:'SDK 0.7 · 일정 미정 ↗',exact:true }).click();
  await page.getByRole('heading',{ name:'SDK 0.7 · 일정 미정',exact:true }).waitFor();
  results.push('Undated release remains selectable');
  await page.locator('#month').fill('1999-12'); await page.locator('#month').dispatchEvent('change');
  await page.getByText('이 달에 표시할 일정이 없습니다.',{ exact:true }).waitFor();
  await page.getByRole('button',{ name:'오늘',exact:true }).click();
  await page.waitForFunction(() => document.querySelector('#month')?.value === '2027-03');
  await page.getByRole('button',{ name:'새로고침',exact:true }).click();
  await page.getByRole('button',{ name:'새로고침',exact:true }).waitFor();
  results.push('Unbounded past navigation, empty month, Today and refresh');
  let warnings = [];
  await page.route('**/api/calendar?**', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), warnings } });
  });
  for (const [codes, labels] of [
    [['jira:CODEX_RPC_FAILED'], ['Jira 조회 실패']],
    [['github:HTTP_503'], ['GitHub 조회 실패']],
    [['jira:HTTP_401', 'github:HTTP_503', 'jira:TIMEOUT'], ['Jira 조회 실패', 'GitHub 조회 실패']],
    [['STALE_OR_MISSING_DATA'], []],
    [[], []],
  ]) {
    warnings = codes;
    await page.reload();
    await page.locator('.calendar').waitFor();
    assert.deepEqual(await page.locator('.provider-failure').allTextContents(), labels);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (labels.length === 2) {
      await page.screenshot({ path: 'artifacts/provider-failures-mobile.png', fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1100 });
      await page.screenshot({ path: 'artifacts/provider-failures-desktop.png', fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
    }
  }
  results.push('Provider failure badges: Jira only, GitHub only, both deduplicated, stale only, recovery clears badges');
  await page.unroute('**/api/calendar?**');
  await page.route('**/api/calendar?**', (route) => route.fulfill({ status:503,body:'Unavailable' }));
  await page.getByRole('button',{ name:'다음 달',exact:true }).click();
  await page.locator('.error').waitFor();
  assert.equal(await page.locator('#month').inputValue(),'2027-03');
  assert.equal(await page.locator('.day').count(),35);
  results.push('Failed navigation preserves last good calendar with matching month and visible failure');
  assert.deepEqual(errors,[]);
  const report = { verdict:'PASS',scenarios:results,axe:{ desktop:desktopAxe.violations.length,mobile:mobileAxe.violations.length },errors };
  await writeFile('artifacts/browser-qa.json',JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
} finally { await cleanup(); }
