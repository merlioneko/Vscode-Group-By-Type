import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { DirectoryReader } from '../../tree/directoryReader';
import type { FolderNode, Node } from '../../tree/nodes';
import { FileGrouperProvider } from '../../tree/provider';
import { describeNode, workspaceRoot } from './helpers';

const { Directory, File, SymbolicLink } = vscode.FileType;

/** uri.path の末尾（ルートからの相対パス）→ 中身。関数なら呼び出して投げる */
type FakeTree = Record<string, [string, vscode.FileType][] | (() => never)>;

function fakeReader(root: vscode.Uri, tree: FakeTree): DirectoryReader {
  return {
    read: async (uri) => {
      const rel = uri.path.slice(root.path.length).replace(/^\//, '');
      const entry = tree[rel];
      if (entry === undefined) {
        throw vscode.FileSystemError.FileNotFound(uri);
      }
      return typeof entry === 'function' ? entry() : entry;
    },
  };
}

function fakeLog() {
  const messages: string[] = [];
  const warnings: string[] = [];
  return {
    messages,
    warnings,
    error: (message: string | Error) => void messages.push(String(message)),
    warn: (message: string) => void warnings.push(message),
  };
}

async function rootOf(provider: FileGrouperProvider): Promise<FolderNode> {
  const [root] = await provider.getChildren();
  assert.ok(root && root.kind === 'folder');
  return root;
}

function child(nodes: Node[], kind: Node['kind'], name: string): Node {
  const found = nodes.find((n) => n.kind === kind && ('name' in n ? n.name === name : 'key' in n && n.key === name));
  assert.ok(found, `${kind}:${name} が見つからない`);
  return found;
}

describe('2-provider', () => {
  describe('AC-9: 読めないフォルダ', () => {
    it('エラー行を1つだけ出し、ほかの表示はそのまま続く', async () => {
      const rootUri = workspaceRoot();
      const log = fakeLog();
      const provider = new FileGrouperProvider(
        fakeReader(rootUri, {
          '': [['locked', Directory], ['ok', Directory], ['a.txt', File]],
          locked: () => {
            throw vscode.FileSystemError.NoPermissions(vscode.Uri.joinPath(rootUri, 'locked'));
          },
          ok: [['b.md', File]],
        }),
        log,
      );
      const root = await rootOf(provider);
      const rootChildren = await provider.getChildren(root);
      assert.deepEqual(rootChildren.map((n) => describeNode(provider, n)), [
        'folder:locked [collapsed]',
        'folder:ok [collapsed]',
        'group:.txt 1 [expanded]',
      ]);

      const lockedChildren = await provider.getChildren(child(rootChildren, 'folder', 'locked'));
      assert.equal(lockedChildren.length, 1);
      const [errorNode] = lockedChildren;
      assert.equal(describeNode(provider, errorNode), 'error:Cannot read this folder NoPermissions [none]');
      const item = provider.getTreeItem(errorNode);
      assert.equal(item.contextValue, 'error');
      assert.ok(item.iconPath instanceof vscode.ThemeIcon && item.iconPath.id === 'warning');
      assert.ok(typeof item.tooltip === 'string' && item.tooltip.length > 0, 'ツールチップにエラーメッセージがない');
      assert.equal(item.command, undefined);
      assert.equal(log.messages.length, 1);
      assert.ok(log.messages[0].includes(vscode.Uri.joinPath(rootUri, 'locked').toString()), log.messages[0]);

      const okChildren = await provider.getChildren(child(rootChildren, 'folder', 'ok'));
      assert.deepEqual(okChildren.map((n) => describeNode(provider, n)), ['group:.md 1 [expanded]']);
    });

    it('FileSystemError 以外の例外はコード Unknown にする', async () => {
      const rootUri = workspaceRoot();
      const provider = new FileGrouperProvider(
        fakeReader(rootUri, {
          '': () => {
            throw new Error('boom');
          },
        }),
        fakeLog(),
      );
      const children = await provider.getChildren(await rootOf(provider));
      assert.equal(children.length, 1);
      assert.equal(describeNode(provider, children[0]), 'error:Cannot read this folder Unknown [none]');
      assert.equal(provider.getTreeItem(children[0]).tooltip, 'boom');
    });
  });

  describe('BL-7: 種類の判定', () => {
    it('Directory のビットが立っていればフォルダ、それ以外はファイル', async () => {
      const provider = new FileGrouperProvider(
        fakeReader(workspaceRoot(), {
          '': [
            ['linkToDir', Directory | SymbolicLink],
            ['brokenLink', SymbolicLink],
            ['plain.txt', File],
          ],
        }),
        fakeLog(),
      );
      const children = await provider.getChildren(await rootOf(provider));
      assert.deepEqual(children.map((n) => describeNode(provider, n)), [
        'folder:linkToDir [collapsed]',
        'group:.txt 1 [collapsed]',
        'group:(no extension) 1 [collapsed]',
      ]);
    });
  });

  describe('AC-10: 10,000 件の項目', () => {
    it('getChildren が1秒以内に終わる', async () => {
      // 名前は種類ごとに変える（同じ名前の .ts があると、テスト用ワークスペースの when 条件で .js が除外される）
      const kinds = [['ts', '.ts'], ['js', '.js'], ['json', '.json'], ['md', '.md'], ['none', '']];
      const entries: [string, vscode.FileType][] = [];
      for (const [prefix, key] of kinds) {
        for (let i = 0; i < 2000; i++) {
          entries.push([`${prefix}${i}${key}`, File]);
        }
      }
      const provider = new FileGrouperProvider(fakeReader(workspaceRoot(), { '': entries }), fakeLog());
      const root = await rootOf(provider);

      const start = performance.now();
      const children = await provider.getChildren(root);
      const elapsed = performance.now() - start;

      assert.equal(children.length, 5);
      assert.equal(
        children.reduce((sum, n) => sum + (n.kind === 'group' ? n.files.length : 0), 0),
        10000,
      );
      assert.ok(elapsed < 1000, `${elapsed.toFixed(0)}ms かかった`);
    });
  });

  describe('AC-11: 照合が終わらない files.exclude の規則', () => {
    it('getChildren が1秒以内に終わり、その規則だけが無視され、警告が1件記録される', async () => {
      const rootUri = workspaceRoot();
      const config = vscode.workspace.getConfiguration('files', rootUri);
      const original = config.inspect<Record<string, unknown>>('exclude')?.workspaceValue;
      const evilName = 'a'.repeat(40) + 'b';
      await config.update('exclude', { ...original, '+(*a)': true }, vscode.ConfigurationTarget.Workspace);
      try {
        const log = fakeLog();
        const provider = new FileGrouperProvider(
          fakeReader(rootUri, { '': [['.git', Directory], ['src', Directory], [evilName, File]] }),
          log,
        );
        const root = await rootOf(provider);

        const start = performance.now();
        const children = await provider.getChildren(root);
        const elapsed = performance.now() - start;

        assert.ok(elapsed < 1000, `${elapsed.toFixed(0)}ms かかった`);
        // .git は既定の files.exclude で隠れたまま。細工した名前のファイルは表示される
        assert.deepEqual(children.map((n) => describeNode(provider, n)), [
          'folder:src [collapsed]',
          'group:(no extension) 1 [expanded]',
        ]);
        assert.equal(log.warnings.length, 1);
        assert.ok(log.warnings[0].includes('"+(*a)"'), log.warnings[0]);
        assert.ok(log.warnings[0].includes(rootUri.toString()), log.warnings[0]);
      } finally {
        await config.update('exclude', original, vscode.ConfigurationTarget.Workspace);
      }
    });
  });
});
