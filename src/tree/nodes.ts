import type * as vscode from 'vscode';

// ノードの型（SPEC「データスキーマ」）

export type Node = FolderNode | GroupNode | FileNode | ErrorNode;

export interface FolderNode {
  kind: 'folder';
  id: string;
  uri: vscode.Uri;
  /** ルートはワークスペースフォルダ名、それ以外はフォルダ名 */
  name: string;
  /** ルートは '' */
  relPath: string;
  /** files.exclude の取得と判定関数の選択に使う */
  rootUri: vscode.Uri;
  isRoot: boolean;
}

export interface GroupNode {
  kind: 'group';
  id: string;
  parentUri: vscode.Uri;
  /** '.py' など。拡張子なしは '' */
  key: string;
  /** BL-3 の順に並べ替え済み */
  files: FileNode[];
  /** BL-4 */
  initiallyExpanded: boolean;
}

export interface FileNode {
  kind: 'file';
  id: string;
  uri: vscode.Uri;
  name: string;
}

export interface ErrorNode {
  kind: 'error';
  id: string;
  parentUri: vscode.Uri;
  /** FileSystemError.code。それ以外の例外は 'Unknown' */
  code: string;
  message: string;
}
