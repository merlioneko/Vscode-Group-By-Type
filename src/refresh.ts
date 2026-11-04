import * as vscode from 'vscode';

export interface Refreshable {
  refresh(): void;
}

/** 最後のファイルイベントから描き直すまでの待ち時間（BL-5） */
export const DEBOUNCE_MS = 300;

/**
 * 表示の更新のきっかけを監視し、target.refresh() を呼ぶ（BL-5）。
 * - ファイル・フォルダの作成と削除：最後のイベントから DEBOUNCE_MS 後に1回
 */
export function watchForRefresh(target: Refreshable): vscode.Disposable {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      target.refresh();
    }, DEBOUNCE_MS);
  };

  // 内容の変更は無視する（ignoreChangeEvents）
  const watcher = vscode.workspace.createFileSystemWatcher('**/*', false, true, false);

  return vscode.Disposable.from(
    watcher,
    watcher.onDidCreate(schedule),
    watcher.onDidDelete(schedule),
    {
      dispose: () => {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
      },
    },
  );
}
