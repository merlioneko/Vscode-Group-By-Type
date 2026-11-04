import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { FileGrouperProvider } from '../../tree/provider';
import { activateExtension } from './helpers';

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

  it('fileGrouper.refresh を実行すると onDidChangeTreeData が発火する', async () => {
    const before = fireCount;
    await vscode.commands.executeCommand('fileGrouper.refresh');
    assert.equal(fireCount, before + 1);
  });
});
