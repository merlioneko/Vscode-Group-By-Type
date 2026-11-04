import * as vscode from 'vscode';
import { buildChildren, joinRelPath } from '../core/buildChildren';
import { createExcludeMatcher, type ExcludeMatcher } from '../core/exclude';
import { errorId, fileId, folderId, groupId } from '../core/ids';
import type { DirectoryReader } from './directoryReader';
import type { ErrorNode, FileNode, FolderNode, GroupNode, Node } from './nodes';

export type Logger = Pick<vscode.LogOutputChannel, 'error'>;

export class FileGrouperProvider implements vscode.TreeDataProvider<Node>, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  /** ルートの uri（文字列）→ 除外判定関数 */
  private readonly matchers = new Map<string, ExcludeMatcher>();

  constructor(
    private readonly reader: DirectoryReader,
    private readonly log: Logger,
  ) {}

  /** 除外判定関数を作り直し、ツリー全体を描き直す */
  refresh(): void {
    this.matchers.clear();
    this.changeEmitter.fire(undefined);
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }

  async getChildren(node?: Node): Promise<Node[]> {
    if (node === undefined) {
      return this.getRoots();
    }
    switch (node.kind) {
      case 'folder':
        return this.getFolderChildren(node);
      case 'group':
        return node.files;
      default:
        return [];
    }
  }

  getTreeItem(node: Node): vscode.TreeItem {
    switch (node.kind) {
      case 'folder': {
        const item = new vscode.TreeItem(
          node.name,
          node.isRoot ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
        );
        item.id = node.id;
        item.resourceUri = node.uri;
        item.iconPath = vscode.ThemeIcon.Folder;
        item.contextValue = node.isRoot ? 'root' : 'folder';
        return item;
      }
      case 'group': {
        const item = new vscode.TreeItem(
          node.key === '' ? vscode.l10n.t('(no extension)') : node.key,
          node.initiallyExpanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
        );
        item.id = node.id;
        item.description = String(node.files.length);
        // resourceUri は設定しない。設定するとフォルダのアイコンが付き、フォルダと見分けられなくなる
        item.iconPath = new vscode.ThemeIcon('files');
        item.contextValue = 'group';
        return item;
      }
      case 'file': {
        const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.None);
        item.id = node.id;
        item.resourceUri = node.uri;
        item.iconPath = vscode.ThemeIcon.File;
        item.contextValue = 'file';
        return item;
      }
      case 'error': {
        const item = new vscode.TreeItem(vscode.l10n.t('Cannot read this folder'), vscode.TreeItemCollapsibleState.None);
        item.id = node.id;
        item.description = node.code;
        item.tooltip = node.message;
        item.iconPath = new vscode.ThemeIcon('warning');
        item.contextValue = 'error';
        return item;
      }
    }
  }

  private getRoots(): FolderNode[] {
    return (vscode.workspace.workspaceFolders ?? []).map((folder) => ({
      kind: 'folder',
      id: folderId(folder.uri.toString()),
      uri: folder.uri,
      name: folder.name,
      relPath: '',
      rootUri: folder.uri,
      isRoot: true,
    }));
  }

  private async getFolderChildren(folder: FolderNode): Promise<Node[]> {
    let entries: [string, vscode.FileType][];
    try {
      entries = await this.reader.read(folder.uri);
    } catch (error) {
      return [this.toErrorNode(folder.uri, error)];
    }

    const children = buildChildren(
      entries.map(([name, type]) => ({ name, isDirectory: (type & vscode.FileType.Directory) !== 0 })),
      folder.relPath,
      this.getMatcher(folder.rootUri),
    );

    const folders: FolderNode[] = children.folders.map((name) => {
      const uri = vscode.Uri.joinPath(folder.uri, name);
      return {
        kind: 'folder',
        id: folderId(uri.toString()),
        uri,
        name,
        relPath: joinRelPath(folder.relPath, name),
        rootUri: folder.rootUri,
        isRoot: false,
      };
    });

    const parentUri = folder.uri.toString();
    const groups: GroupNode[] = children.groups.map((group) => ({
      kind: 'group',
      id: groupId(parentUri, group.key),
      parentUri: folder.uri,
      key: group.key,
      files: group.files.map((name): FileNode => {
        const uri = vscode.Uri.joinPath(folder.uri, name);
        return { kind: 'file', id: fileId(uri.toString()), uri, name };
      }),
      initiallyExpanded: group.initiallyExpanded,
    }));

    return [...folders, ...groups];
  }

  private getMatcher(rootUri: vscode.Uri): ExcludeMatcher {
    const key = rootUri.toString();
    let matcher = this.matchers.get(key);
    if (!matcher) {
      matcher = createExcludeMatcher(vscode.workspace.getConfiguration('files', rootUri).get('exclude'));
      this.matchers.set(key, matcher);
    }
    return matcher;
  }

  private toErrorNode(parentUri: vscode.Uri, error: unknown): ErrorNode {
    const code = error instanceof vscode.FileSystemError ? error.code : 'Unknown';
    const message = error instanceof Error ? error.message : String(error);
    this.log.error(`${parentUri.toString()}: ${code}: ${message}`);
    return { kind: 'error', id: errorId(parentUri.toString()), parentUri, code, message };
  }
}
