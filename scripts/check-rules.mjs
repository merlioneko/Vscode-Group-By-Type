// SPEC「依存のルール」と BL-8 を検査する。違反があれば箇所を表示して終了コード 1 で終わる。
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(repoRoot, 'src');

// workspace.fs を書いてよいファイル（src からの相対パス、/ 区切り）
const FS_ALLOWED_FILES = new Set(['tree/directoryReader.ts', 'openFile.ts']);
// workspace.fs の直後に続いてよいもの
const FS_ALLOWED_MEMBERS = new Set(['readDirectory', 'stat']);
// src/test/ 以外に現れてはいけない文字列
const FORBIDDEN = [
  'applyEdit',
  'WorkspaceEdit',
  '.update(',
  "'fs'",
  '"fs"',
  "'node:fs'",
  '"node:fs"',
  'fs/promises',
];
// src/core/ に現れてはいけない文字列
const FORBIDDEN_IN_CORE = ["'vscode'", '"vscode"'];

function listTsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

const violations = [];

for (const file of listTsFiles(srcDir)) {
  const rel = relative(srcDir, file).split(sep).join('/');
  if (rel.startsWith('test/')) {
    continue;
  }
  const isCore = rel.startsWith('core/');
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);

  lines.forEach((line, index) => {
    const where = `src/${rel}:${index + 1}`;

    for (const match of line.matchAll(/workspace\s*\.\s*fs\b(\s*\.\s*(\w+))?/g)) {
      if (!FS_ALLOWED_FILES.has(rel)) {
        violations.push(`${where}: workspace.fs は ${[...FS_ALLOWED_FILES].join(' と ')} でしか使えない`);
      } else if (!FS_ALLOWED_MEMBERS.has(match[2] ?? '')) {
        violations.push(`${where}: workspace.fs の後には .readDirectory か .stat しか続けられない（${match[0]}）`);
      }
    }

    for (const word of FORBIDDEN) {
      if (line.includes(word)) {
        violations.push(`${where}: ${word} は使えない`);
      }
    }

    if (isCore) {
      for (const word of FORBIDDEN_IN_CORE) {
        if (line.includes(word)) {
          violations.push(`${where}: src/core/ は vscode を import できない`);
        }
      }
    }
  });
}

if (violations.length > 0) {
  console.error(`check:rules: ${violations.length} 件の違反`);
  for (const v of violations) {
    console.error(`  ${v}`);
  }
  process.exit(1);
}
console.log('check:rules: 違反なし');
