import * as vscode from 'vscode';
import { registerOpenFile } from './openFile';
import { watchForRefresh } from './refresh';
import { workspaceDirectoryReader } from './tree/directoryReader';
import { FileGrouperProvider } from './tree/provider';

export const VIEW_ID = 'fileGrouper.view';
export const REFRESH_COMMAND = 'fileGrouper.refresh';

/** 統合テスト用に返す */
export interface FileGrouperApi {
  provider: FileGrouperProvider;
}

export function activate(context: vscode.ExtensionContext): FileGrouperApi {
  const log = vscode.window.createOutputChannel('File Grouper', { log: true });
  const provider = new FileGrouperProvider(workspaceDirectoryReader, log);
  const view = vscode.window.createTreeView(VIEW_ID, {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  context.subscriptions.push(
    log,
    provider,
    view,
    registerOpenFile(() => provider.refresh()),
    vscode.commands.registerCommand(REFRESH_COMMAND, () => provider.refresh()),
    watchForRefresh(provider),
  );
  return { provider };
}

export function deactivate(): void {
  // 後始末は context.subscriptions に任せる。
}
