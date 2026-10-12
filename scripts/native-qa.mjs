import { mkdtemp, mkdir, cp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { demoProject, demoState } from '../dist/demo.js';
import { Store } from '../dist/storage.js';

const root = await mkdtemp(join(tmpdir(), 'release-calendar-native-'));
let child;
try {
  const app = join(root, 'Native QA.app'), contents = join(app, 'Contents');
  await mkdir(join(contents, 'MacOS'), { recursive: true });
  await cp('desktop-build/Release Calendar.app/Contents/Resources', join(contents, 'Resources'), { recursive: true });
  await writeFile(join(contents, 'Info.plist'), (await readFile('desktop-build/Release Calendar.app/Contents/Info.plist', 'utf8')).replace('io.github.UjiinEatingTangerines.release-calendar', 'io.github.UjiinEatingTangerines.release-calendar.qa'));
  execFileSync('xcrun', ['swiftc', '-O', '-parse-as-library', '-swift-version', '6', '-framework', 'AppKit', '-framework', 'WebKit',
    'desktop/Models.swift', 'desktop/Backend.swift', 'desktop/App.swift', 'desktop/SettingsWindow.swift', 'desktop/Menu.swift', 'desktop/Tokens.swift', 'desktop/PopoverView.swift', 'scripts/native-qa.swift',
    '-o', join(contents, 'MacOS/ReleaseCalendar')], { stdio: 'inherit' });
  const config = join(root, 'config.json'), dataDir = join(root, 'data');
  await writeFile(config, JSON.stringify({ projects: [demoProject, { ...demoProject, id: 'empty', name: 'Empty fictional project' }] }), { mode: 0o600 });
  await new Store(dataDir, demoProject).update(async () => demoState(new Date()));
  await mkdir('artifacts', { recursive: true });
  child = spawn(join(contents, 'MacOS/ReleaseCalendar'), [], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env,
    QA_SETTINGS_IMAGE: resolve('artifacts/native-settings.png'), RELEASE_CALENDAR_CONFIG: config, RELEASE_CALENDAR_DATA_DIR: dataDir, JIRA_EMAIL: '', JIRA_TOKEN: '', GITHUB_TOKEN: '' } });
  let output = '', errors = '';
  child.stdout.on('data', (data) => { output += data; }); child.stderr.on('data', (data) => { errors += data; });
  const timeout = setTimeout(() => child.kill('SIGTERM'), 40000);
  const [code] = await once(child, 'exit'); clearTimeout(timeout);
  assert.equal(code, 0, errors);
  const result = JSON.parse(output);
  for (const url of [result.oldURL, result.lastURL]) await assert.rejects(fetch(url));
  result.scenarios.push('owned-servers-closed-after-restart-and-quit');
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/native-qa.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (child && child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
  await rm(root, { recursive: true, force: true });
}
