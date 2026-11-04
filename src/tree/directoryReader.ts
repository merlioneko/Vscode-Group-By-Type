import * as vscode from 'vscode';

/** ディレクトリの読み込み。テストで差し替えられるようにインターフェースにする */
export interface DirectoryReader {
  read(uri: vscode.Uri): Thenable<[string, vscode.FileType][]>;
}

/** workspace.fs.readDirectory を使う実装 */
export const workspaceDirectoryReader: DirectoryReader = {
  read: (uri) => vscode.workspace.fs.readDirectory(uri),
};
