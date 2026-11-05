import * as assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { FileGrouperProvider } from '../../tree/provider';
import { activateExtension, findNode, sleep, workspaceRoot } from './helpers';

// 一時ワークスペースを書き換えるので、統合テストの最後に実行する

describe('3-refresh', () => {
  let provider: FileGrouperProvider;
  let fireCount = 0;
  let subscription: vscode.Disposable;

  before(async () => {
    provider = (await activateExtension()).provider;
    subscription = provider.onDidChangeTreeData(() => fireCount++);
  });

  after(() => {
    subscription.dispose();
  });

  /** 発火の回数が before より増えるまで待ち、増えるまでにかかった時間を返す */
  async function waitForFire(before: number, timeoutMs: number): Promise<number> {
    const start = Date.now();
    while (fireCount === before && Date.now() - start < timeoutMs) {
      await sleep(20);
    }
    assert.ok(fireCount > before, `${timeoutMs}ms 以内に onDidChangeTreeData が発火しなかった`);
    return Date.now() - start;
  }

  /** quietMs のあいだ発火がなくなるまで待つ */
  async function waitForQuiet(quietMs = 1000, timeoutMs = 10000): Promise<void> {
    const start = Date.now();
    let last = fireCount;
    let lastChange = Date.now();
    while (Date.now() - lastChange < quietMs && Date.now() - start < timeoutMs) {
      await sleep(50);
      if (fireCount !== last) {
        last = fireCount;
        lastChange = Date.now();
      }
    }
  }

  async function pyCountInSrc(): Promise<number> {
    const src = await findNode(provider, ['sample', 'src']);
    const group = (await provider.getChildren(src)).find((n) => n.kind === 'group' && n.key === '.py');
    return group?.kind === 'group' ? group.files.length : 0;
  }

  it('AC-7: src/new.py を作ると3秒以内に反映され、消すと元に戻る', async () => {
    const newFile = join(workspaceRoot().fsPath, 'src', 'new.py');
    assert.equal(await pyCountInSrc(), 2);
    await waitForQuiet();

    let before = fireCount;
    writeFileSync(newFile, '');
    try {
      await waitForFire(before, 3000);
      assert.equal(await pyCountInSrc(), 3);
    } finally {
      before = fireCount;
      rmSync(newFile, { force: true });
    }
    await waitForFire(before, 3000);
    assert.equal(await pyCountInSrc(), 2);
  });

  it('100 個のファイルを続けて作っても、描き直しは3回以内に収まる', async () => {
    const dir = workspaceRoot().fsPath;
    const names = Array.from({ length: 100 }, (_, i) => join(dir, `burst-${i}.txt`));
    await waitForQuiet();

    const before = fireCount;
    try {
      for (const name of names) {
        writeFileSync(name, '');
      }
      await waitForFire(before, 3000);
      await waitForQuiet();
      const redraws = fireCount - before;
      assert.ok(redraws <= 3, `${redraws} 回描き直した`);
    } finally {
      for (const name of names) {
        rmSync(name, { force: true });
      }
      await waitForQuiet();
    }
  });

  it('files.exclude に "**/*.md": true を加えると .md のグループが消える', async () => {
    const config = vscode.workspace.getConfiguration('files', workspaceRoot());
    const original = config.inspect<Record<string, unknown>>('exclude')?.workspaceValue;
    const mdGroupsIn = async (labels: string[]): Promise<number> => {
      const children = await provider.getChildren(await findNode(provider, labels));
      return children.filter((n) => n.kind === 'group' && n.key === '.md').length;
    };
    assert.equal(await mdGroupsIn(['sample']), 1);
    assert.equal(await mdGroupsIn(['sample', 'docs']), 1);
    await waitForQuiet();

    const before = fireCount;
    try {
      await config.update('exclude', { ...original, '**/*.md': true }, vscode.ConfigurationTarget.Workspace);
      await waitForFire(before, 3000);
      assert.equal(await mdGroupsIn(['sample']), 0);
      assert.equal(await mdGroupsIn(['sample', 'docs']), 0);
    } finally {
      await config.update('exclude', original, vscode.ConfigurationTarget.Workspace);
    }
    assert.equal(await mdGroupsIn(['sample']), 1);
  });

  it('groupByType.refresh を実行すると onDidChangeTreeData が発火する', async () => {
    const before = fireCount;
    await vscode.commands.executeCommand('groupByType.refresh');
    assert.equal(fireCount, before + 1);
  });
});
