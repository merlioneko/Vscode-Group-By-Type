import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { FileGrouperProvider } from '../../tree/provider';
import { activateExtension, findNode, renderTree, sleep, snapshot, waitFor, workspaceRoot } from './helpers';

// SPEC「期待するツリー」。テストは英語表示で動くので、拡張子なしは (no extension) になる
const EXPECTED_TREE = [
  'folder:sample [expanded]',
  '  folder:.github [collapsed]',
  '    folder:workflows [collapsed]',
  '      group:.yml 1 [expanded]',
  '        file:ci.yml [none]',
  '  folder:.vscode [collapsed]',
  '    group:.json 1 [expanded]',
  '      file:settings.json [none]',
  '  folder:docs [collapsed]',
  '    group:.md 1 [collapsed]',
  '      file:guide.md [none]',
  '    group:.png 1 [collapsed]',
  '      file:logo.png [none]',
  '  folder:empty [collapsed]',
  '  folder:src [collapsed]',
  '    group:.gz 1 [collapsed]',
  '      file:archive.tar.gz [none]',
  '    group:.js 1 [collapsed]',
  '      file:legacy.js [none]',
  '    group:.json 2 [collapsed]',
  '      file:DATA.JSON [none]',
  '      file:settings.json [none]',
  '    group:.py 2 [collapsed]',
  '      file:main.py [none]',
  '      file:utils.py [none]',
  '    group:.ts 4 [collapsed]',
  '      file:app.ts [none]',
  '      file:file2.ts [none]',
  '      file:file10.ts [none]',
  '      file:types.d.ts [none]',
  '  group:.json 2 [collapsed]',
  '    file:config.json [none]',
  '    file:data.json [none]',
  '  group:.md 2 [collapsed]',
  '    file:CHANGELOG.md [none]',
  '    file:README.md [none]',
  '  group:(no extension) 2 [collapsed]',
  '    file:.gitignore [none]',
  '    file:LICENSE [none]',
];

function activeTab(): vscode.Tab | undefined {
  return vscode.window.tabGroups.activeTabGroup.activeTab;
}

function allTabLabels(): string[] {
  return vscode.window.tabGroups.all.flatMap((group) => group.tabs.map((tab) => tab.label));
}

async function clickFile(provider: FileGrouperProvider, labels: string[]): Promise<void> {
  const item = provider.getTreeItem(await findNode(provider, labels));
  assert.ok(item.command, `${labels.join(' > ')} に command がない`);
  await vscode.commands.executeCommand(item.command.command, ...(item.command.arguments ?? []));
}

describe('1-display', () => {
  let provider: FileGrouperProvider;
  let initialSnapshot: Map<string, string>;

  before(async () => {
    initialSnapshot = snapshot(workspaceRoot().fsPath);
    provider = (await activateExtension()).provider;
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  it('AC-1: File Grouper ビューを開ける', async () => {
    await vscode.commands.executeCommand('fileGrouper.view.focus');
  });

  it('AC-2〜AC-4: ツリーが「期待するツリー」と一致する', async () => {
    assert.deepEqual(await renderTree(provider), EXPECTED_TREE);
  });

  it('グループには resourceUri を設定せず codicon files を付ける。フォルダとファイルには resourceUri を設定する', async () => {
    const root = await findNode(provider, ['sample']);
    const rootItem = provider.getTreeItem(root);
    assert.equal(rootItem.contextValue, 'root');
    assert.ok(rootItem.resourceUri);
    assert.equal(rootItem.iconPath, vscode.ThemeIcon.Folder);

    const folderItem = provider.getTreeItem(await findNode(provider, ['sample', 'docs']));
    assert.equal(folderItem.contextValue, 'folder');
    assert.ok(folderItem.resourceUri);
    assert.equal(folderItem.iconPath, vscode.ThemeIcon.Folder);

    const groupItem = provider.getTreeItem(await findNode(provider, ['sample', '.md']));
    assert.equal(groupItem.contextValue, 'group');
    assert.equal(groupItem.resourceUri, undefined);
    assert.ok(groupItem.iconPath instanceof vscode.ThemeIcon);
    assert.equal(groupItem.iconPath.id, 'files');

    const fileItem = provider.getTreeItem(await findNode(provider, ['sample', '.md', 'README.md']));
    assert.equal(fileItem.contextValue, 'file');
    assert.equal(fileItem.resourceUri?.toString(), vscode.Uri.joinPath(workspaceRoot(), 'README.md').toString());
    assert.equal(fileItem.iconPath, vscode.ThemeIcon.File);
  });

  it('ID はツリー全体で重複しない', async () => {
    const ids: string[] = [];
    const walk = async (node?: Parameters<FileGrouperProvider['getChildren']>[0]): Promise<void> => {
      for (const child of await provider.getChildren(node)) {
        ids.push(child.id);
        await walk(child);
      }
    };
    await walk();
    assert.equal(new Set(ids).size, ids.length);
  });

  it('AC-5: README.md をクリックするとテキストエディターで開く', async () => {
    const expected = vscode.Uri.joinPath(workspaceRoot(), 'README.md').toString();
    await clickFile(provider, ['sample', '.md', 'README.md']);
    const tab = await waitFor(activeTab, (t) => t?.input instanceof vscode.TabInputText && t.input.uri.toString() === expected);
    assert.ok(tab?.input instanceof vscode.TabInputText, `アクティブなタブが TabInputText ではない：${tab?.label}`);
    assert.equal(tab.input.uri.toString(), expected);
  });

  it('AC-5: logo.png をクリックすると、テキストエディター以外で開く', async () => {
    await clickFile(provider, ['sample', 'docs', '.png', 'logo.png']);
    const tab = await waitFor(activeTab, (t) => t?.label === 'logo.png');
    assert.equal(tab?.label, 'logo.png');
    assert.equal(tab.input instanceof vscode.TabInputText, false);
  });

  it('BL-6: 存在しないファイルを開こうとしても例外にならず、エディターも開かず、描き直す', async () => {
    const tabsBefore = allTabLabels();
    const activeBefore = activeTab()?.label;
    let fired = false;
    const subscription = provider.onDidChangeTreeData(() => (fired = true));
    try {
      await vscode.commands.executeCommand('fileGrouper.openFile', vscode.Uri.joinPath(workspaceRoot(), 'missing.txt'));
      await sleep(500);
    } finally {
      subscription.dispose();
    }
    assert.deepEqual(allTabLabels(), tabsBefore);
    assert.equal(activeTab()?.label, activeBefore);
    assert.equal(fired, true, 'onDidChangeTreeData が発火していない');
  });

  it('AC-6: 表示と「開く」の操作の前後で、ワークスペースが変わらない', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    assert.deepEqual(snapshot(workspaceRoot().fsPath), initialSnapshot);
  });
});
