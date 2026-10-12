import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, cp, rm, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { build } from 'esbuild';

if (process.platform !== 'darwin') throw new Error('macOS is required to build the menu bar application.');
const root = resolve('desktop-build');
const staging = join(root, 'staging');
const app = join(root, 'Release Calendar.app');
await rm(staging, { recursive: true, force: true });
const contents = join(staging, 'Contents'), resources = join(contents, 'Resources');
await mkdir(join(contents, 'MacOS'), { recursive: true });
await mkdir(join(resources, 'server'), { recursive: true });
// Preserve the package manager's stable symlink rather than its versioned target.
const nodePath = execFileSync('/usr/bin/which', ['node'], { encoding: 'utf8' }).trim();
await writeFile(join(resources, 'node-path.txt'), `${nodePath}\n`);
await build({ entryPoints: ['src/desktop.ts'], outfile: join(resources, 'server/desktop.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node22', legalComments: 'eof' });
await cp('web-dist', join(resources, 'web-dist'), { recursive: true });
await cp('docs/macos.md', join(resources, 'macos.md'));
await cp('examples/config.json', join(resources, 'config.example.json'));
execFileSync('/usr/bin/xcrun', ['swiftc', '-O', '-parse-as-library', '-swift-version', '6',
  '-framework', 'AppKit', '-framework', 'WebKit', 'desktop/Models.swift', 'desktop/Backend.swift', 'desktop/App.swift', 'desktop/SettingsWindow.swift', 'desktop/Menu.swift', 'desktop/Tokens.swift', 'desktop/PopoverView.swift', 'desktop/Main.swift',
  '-o', join(contents, 'MacOS/ReleaseCalendar')], { stdio: 'inherit' });
await writeFile(join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>ReleaseCalendar</string>
<key>CFBundleIdentifier</key><string>io.github.UjiinEatingTangerines.release-calendar</string>
<key>CFBundleName</key><string>Release Calendar</string>
<key>CFBundleDisplayName</key><string>Release Calendar</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.2.0</string>
<key>CFBundleVersion</key><string>2</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>`);
execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', staging], { stdio: 'inherit' });
await rm(app, { recursive: true, force: true });
await rename(staging, app);
console.log(`Built ${app}\nOpen with: pnpm desktop\nUses the locally installed Node.js at ${nodePath}`);
