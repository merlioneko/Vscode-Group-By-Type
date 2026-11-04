// テスト用ワークスペース .test-workspace/sample/ を作り直す（SPEC「受け入れ条件」）。
// M0 では空のフォルダを作るだけ。中身は M2 で作る。
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sample = join(repoRoot, '.test-workspace', 'sample');

rmSync(sample, { recursive: true, force: true });
mkdirSync(sample, { recursive: true });

console.log(`prepared ${sample}`);
