import * as vscode from 'vscode';

export const OPEN_FILE_COMMAND = 'groupByType.openFile';

/**
 * ファイルを開くコマンド（BL-6）。contributes.commands には登録しない。
 * ファイルがなければ警告を出し、ツリー全体を描き直す。
 */
export function registerOpenFile(refresh: () => void): vscode.Disposable {
  return vscode.commands.registerCommand(OPEN_FILE_COMMAND, async (uri: vscode.Uri) => {
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      const name = uri.path.slice(uri.path.lastIndexOf('/') + 1);
      // 通知は閉じられるまで終わらないので待たない
      void vscode.window.showWarningMessage(vscode.l10n.t('File not found: {0}', name));
      refresh();
      return;
    }
    await vscode.commands.executeCommand('vscode.open', uri);
  });
}
