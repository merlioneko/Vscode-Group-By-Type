// この拡張機能を読み込んだ VS Code を Playwright の _electron で起動し、画面を撮影する（PLAN M2）。
//
// 使い方：xvfb-run -a npm run screenshot -- [オプション]
//   --out <path>      保存先（既定：.vscode-test/screenshots/screenshot.png）
//   --open <relPath>  File Grouper のツリーをたどって、このファイルをクリックして開く（例：docs/logo.png）
//   --expand-all      File Grouper のツリーをすべて展開する
//   --no-folder       フォルダを開かずに起動する
//
// Playwright は devDependencies に入れていない。リポジトリの node_modules か、
// グローバル（NODE_PATH）にあるものを使う。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(repoRoot, 'package.json'));

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    for (const dir of (process.env.NODE_PATH ?? '').split(':').filter(Boolean)) {
      try {
        return createRequire(join(dir, 'noop.js'))('playwright');
      } catch {
        // 次を試す
      }
    }
  }
  console.error('playwright が見つからない。npm i -D playwright などで入れてから実行する');
  process.exit(1);
}

function parseArgs(argv) {
  const options = { out: join(repoRoot, '.vscode-test', 'screenshots', 'screenshot.png'), open: undefined, expandAll: false, noFolder: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out') options.out = resolve(argv[++i]);
    else if (arg === '--open') options.open = argv[++i];
    else if (arg === '--expand-all') options.expandAll = true;
    else if (arg === '--no-folder') options.noFolder = true;
    else {
      console.error(`不明な引数：${arg}`);
      process.exit(1);
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const { _electron: electron } = loadPlaywright();
const { downloadAndUnzipVSCode } = require('@vscode/test-electron');
const { extKey } = require('./out/core/extKey.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ソケットのパスが長すぎると VS Code が起動しないので、短い一時フォルダを使う
const userDataDir = mkdtempSync(join(tmpdir(), 'fg-'));
mkdirSync(join(userDataDir, 'User'), { recursive: true });
writeFileSync(
  join(userDataDir, 'User', 'settings.json'),
  JSON.stringify({
    'workbench.startupEditor': 'none',
    'workbench.tips.enabled': false,
    'workbench.secondarySideBar.defaultVisibility': 'hidden',
    'chat.disableAIFeatures': true,
    'security.workspace.trust.enabled': false,
    'extensions.ignoreRecommendations': true,
    'update.mode': 'none',
    'telemetry.telemetryLevel': 'off',
    'window.titleBarStyle': 'custom',
    'git.openRepositoryInParentFolders': 'never',
  }),
);

const executablePath = await downloadAndUnzipVSCode('stable');
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const args = [
  `--extensionDevelopmentPath=${repoRoot}`,
  `--user-data-dir=${userDataDir}`,
  `--extensions-dir=${join(userDataDir, 'extensions')}`,
  '--skip-welcome',
  '--skip-release-notes',
  ...(isRoot ? ['--no-sandbox'] : []),
  ...(options.noFolder ? [] : [join(repoRoot, '.test-workspace', 'sample')]),
];

const app = await electron.launch({ executablePath, args });
try {
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setBounds({ x: 0, y: 0, width: 1280, height: 1200 });
  });
  await page.waitForSelector('.monaco-workbench', { timeout: 60000 });
  await sleep(3000);

  if (options.noFolder) {
    // フォルダを開いていないウィンドウでは、サイドバーが閉じている
    await page.keyboard.press('Control+Shift+E');
  }
  const pane = page.locator('.pane').filter({ has: page.locator('.pane-header', { hasText: 'File Grouper' }) });
  await pane.waitFor({ timeout: 30000 });
  if (options.noFolder && (await pane.locator('.pane-header').getAttribute('aria-expanded')) !== 'true') {
    await pane.locator('.pane-header').click();
  }

  if (!options.noFolder) {
    // 標準エクスプローラーのフォルダのセクション（ワークスペース名）を畳み、File Grouper の表示領域を広げる
    const explorerHeader = page.locator('.pane-header', { hasText: /^sample/i }).first();
    if ((await explorerHeader.getAttribute('aria-expanded')) === 'true') {
      await explorerHeader.click();
    }
    // File Grouper 以外のセクションも畳む
    for (const header of await page.locator('.pane-header[aria-expanded="true"]').all()) {
      const text = (await header.innerText()).trim();
      if (!/File Grouper/i.test(text)) {
        await header.click();
      }
    }
    const header = pane.locator('.pane-header');
    if ((await header.getAttribute('aria-expanded')) !== 'true') {
      await header.click();
    }
    await pane.locator('.monaco-list-row').first().waitFor({ timeout: 30000 });
  }

  const rows = pane.locator('.monaco-list-row');
  const rowAt = (level, label) =>
    pane.locator(`.monaco-list-row[aria-level="${level}"]`).filter({
      has: page.locator('.label-name', { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }),
    });

  if (options.expandAll) {
    for (let i = 0; i < 200; i++) {
      const collapsed = pane.locator('.monaco-list-row[aria-expanded="false"]');
      if ((await collapsed.count()) === 0) break;
      await collapsed.first().click();
      await sleep(150);
    }
  }

  if (options.open) {
    // 例：docs/logo.png → ルート(1) > docs(2) > .png(3) > logo.png(4)
    const segments = options.open.split('/');
    const fileName = segments.pop();
    let level = 2;
    for (const folder of segments) {
      const row = rowAt(level, folder).first();
      if ((await row.getAttribute('aria-expanded')) === 'false') await row.click();
      await sleep(300);
      level++;
    }
    const key = extKey(fileName);
    const group = rowAt(level, key === '' ? '(no extension)' : key).first();
    if ((await group.getAttribute('aria-expanded')) === 'false') await group.click();
    await sleep(300);
    await rowAt(level + 1, fileName).first().click();
    await sleep(2000);
  }

  // 通知（root で実行している警告など）を消す
  await page.keyboard.press('F1');
  await page.keyboard.type('Clear All Notifications');
  await sleep(500);
  await page.keyboard.press('Enter');
  await sleep(1000);
  mkdirSync(dirname(options.out), { recursive: true });
  await page.screenshot({ path: options.out });
  console.log(`saved ${options.out}（行数：${await rows.count()}）`);
} finally {
  await app.close();
  rmSync(userDataDir, { recursive: true, force: true });
}
