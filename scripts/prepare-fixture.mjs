// テスト用ワークスペース .test-workspace/sample/ を作り直す（SPEC「受け入れ条件」の「テスト用ワークスペース」）。
// .git という名前のフォルダや空のフォルダは git で管理できないため、リポジトリには置かずにここで作る。
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sample = join(repoRoot, '.test-workspace', 'sample');

// 有効な 1×1 の PNG
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** 相対パス → 中身。中身を指定していないファイルは空 */
const files = {
  '.git/HEAD': '',
  '.github/workflows/ci.yml': '',
  '.vscode/settings.json': JSON.stringify({ 'files.exclude': { '**/*.js': { when: '$(basename).ts' } } }, null, 2) + '\n',
  'docs/guide.md': '',
  'docs/logo.png': Buffer.from(PNG_1X1, 'base64'),
  'src/app.ts': '',
  'src/app.js': '',
  'src/legacy.js': '',
  'src/file2.ts': '',
  'src/file10.ts': '',
  'src/types.d.ts': '',
  'src/main.py': '',
  'src/utils.py': '',
  'src/settings.json': '',
  'src/DATA.JSON': '',
  'src/archive.tar.gz': '',
  '.gitignore': '',
  'LICENSE': '',
  'CHANGELOG.md': '',
  'README.md': '',
  'config.json': '',
  'data.json': '',
};
const emptyFolders = ['empty'];

rmSync(sample, { recursive: true, force: true });
mkdirSync(sample, { recursive: true });
for (const [relPath, content] of Object.entries(files)) {
  const full = join(sample, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}
for (const relPath of emptyFolders) {
  mkdirSync(join(sample, relPath), { recursive: true });
}

console.log(`prepared ${sample}`);
