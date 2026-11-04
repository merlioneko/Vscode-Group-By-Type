import { defineConfig } from '@vscode/test-cli';
import { existsSync, readdirSync } from 'node:fs';
import { sep } from 'node:path';

// クラウド環境は root で動くため、Electron のサンドボックスを切る必要がある。
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

const INTEGRATION_DIR = 'out/test/integration';

/**
 * 統合テストのファイル（out/test/integration/**\/*.test.js）を、ファイル名の順に並べて返す。
 * テストは実行順に依存する（ファイル名の番号順）が、test-cli は glob の結果を並べ替えない。
 */
function integrationTestFiles() {
  if (!existsSync(INTEGRATION_DIR)) {
    return `${INTEGRATION_DIR}/**/*.test.js`;
  }
  return readdirSync(INTEGRATION_DIR, { recursive: true })
    .map((f) => String(f).split(sep).join('/'))
    .filter((f) => f.endsWith('.test.js'))
    .sort()
    .map((f) => `${INTEGRATION_DIR}/${f}`);
}

export default defineConfig({
  files: integrationTestFiles(),
  version: 'stable',
  workspaceFolder: '.test-workspace/sample',
  launchArgs: isRoot ? ['--no-sandbox'] : [],
  mocha: {
    ui: 'bdd',
    timeout: 20000,
  },
});
