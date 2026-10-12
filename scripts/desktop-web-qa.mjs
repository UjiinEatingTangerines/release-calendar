import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { demoProject, demoState } from '../dist/demo.js';
import { Store, configHash } from '../dist/storage.js';

const root = await mkdtemp(join(tmpdir(), 'release-calendar-web-link-'));
let child, browser;
try {
  const second = { ...demoProject, id: 'second', name: 'Second fictional project' };
  const config = join(root, 'config.json');
  await writeFile(config, JSON.stringify({ projects: [demoProject, second] }));
  await new Store(join(root, 'data'), second).update(async () => ({ ...demoState(new Date('2027-03-10T03:00:00Z')), configHash: configHash(second) }));
  child = spawn(process.execPath, ['dist/desktop.js'], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, RELEASE_CALENDAR_CONFIG: config, RELEASE_CALENDAR_DATA_DIR: join(root, 'data') } });
  const lines = createInterface({ input: child.stdout });
  let address;
  for await (const line of lines) { address = JSON.parse(line).url; break; }
  lines.close(); assert.ok(address);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const release = 'jira:https://fictional-orbit.atlassian.net:100:1';
  await page.goto(`${address}/?${new URLSearchParams({ project: 'second', release, month: '2027-03' })}`);
  await page.getByRole('heading', { name: 'Web 1.8', exact: true }).waitFor();
  assert.equal(await page.locator('#project').inputValue(), 'second');
  assert.equal(await page.locator('#month').inputValue(), '2027-03');
  assert.equal(await page.locator('.detail-panel .ticket-row').count(), 2);
  await page.screenshot({ path: 'artifacts/menu-web-link.png', fullPage: true });
  await writeFile('artifacts/desktop-web-qa.json', JSON.stringify({ verdict: 'PASS', project: 'second', month: '2027-03', release, ticketCount: 2 }));
  console.log('PASS: menu deep link selects the nondefault project, month, release and tickets.');
} finally {
  if (browser) await browser.close();
  if (child && child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.stdin.end(); await exited; }
  await rm(root, { recursive: true, force: true });
}
