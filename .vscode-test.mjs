import { defineConfig } from '@vscode/test-cli';

// クラウド環境は root で動くため、Electron のサンドボックスを切る必要がある。
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

export default defineConfig({
  files: 'out/test/integration/**/*.test.js',
  version: 'stable',
  workspaceFolder: '.test-workspace/sample',
  launchArgs: isRoot ? ['--no-sandbox'] : [],
  mocha: {
    ui: 'bdd',
    timeout: 20000,
  },
});
