import * as assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import * as vscode from 'vscode';
import type { FileGrouperApi } from '../../extension';
import type { FileGrouperProvider } from '../../tree/provider';
import type { Node } from '../../tree/nodes';

export const EXTENSION_ID = 'local.vscode-file-grouper';

export async function activateExtension(): Promise<FileGrouperApi> {
  const extension = vscode.extensions.getExtension<FileGrouperApi>(EXTENSION_ID);
  assert.ok(extension, `${EXTENSION_ID} が見つからない`);
  return extension.activate();
}

export function workspaceRoot(): vscode.Uri {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, 'ワークスペースフォルダが開かれていない');
  return folder.uri;
}

const STATE_NAMES: Record<vscode.TreeItemCollapsibleState, string> = {
  [vscode.TreeItemCollapsibleState.None]: 'none',
  [vscode.TreeItemCollapsibleState.Collapsed]: 'collapsed',
  [vscode.TreeItemCollapsibleState.Expanded]: 'expanded',
};

function labelOf(item: vscode.TreeItem): string {
  const label = item.label;
  return typeof label === 'string' ? label : (label?.label ?? '');
}

/** ノードを1行の文字列にする：`種類:ラベル 説明 [初期状態]` */
export function describeNode(provider: FileGrouperProvider, node: Node): string {
  const item = provider.getTreeItem(node);
  const description = typeof item.description === 'string' && item.description !== '' ? ` ${item.description}` : '';
  const state = STATE_NAMES[item.collapsibleState ?? vscode.TreeItemCollapsibleState.None];
  return `${node.kind}:${labelOf(item)}${description} [${state}]`;
}

/** ルートから getChildren をすべてたどり、字下げした行の一覧にする */
export async function renderTree(provider: FileGrouperProvider, node?: Node, depth = 0): Promise<string[]> {
  const lines: string[] = [];
  for (const child of await provider.getChildren(node)) {
    lines.push('  '.repeat(depth) + describeNode(provider, child));
    lines.push(...(await renderTree(provider, child, depth + 1)));
  }
  return lines;
}

/** ルートから名前の列でノードをたどる。グループは拡張子キーではなくラベルで指定する */
export async function findNode(provider: FileGrouperProvider, labels: string[]): Promise<Node> {
  let current: Node | undefined;
  for (const label of labels) {
    const children = await provider.getChildren(current);
    const next = children.find((child) => labelOf(provider.getTreeItem(child)) === label);
    assert.ok(next, `${labels.join(' > ')} の ${label} が見つからない`);
    current = next;
  }
  assert.ok(current);
  return current;
}

/** 条件が満たされるまで待つ。満たされなければ最後の値を返す */
export async function waitFor<T>(get: () => T, ok: (value: T) => boolean, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = get();
  while (!ok(value) && Date.now() < deadline) {
    await sleep(50);
    value = get();
  }
  return value;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** ワークスペースのスナップショット：相対パス → 種類・サイズ・更新日時・SHA-1 */
export function snapshot(rootPath: string): Map<string, string> {
  const result = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = relative(rootPath, full).split(sep).join('/');
      const stat = statSync(full);
      if (entry.isDirectory()) {
        result.set(rel, `dir mtime=${stat.mtimeMs}`);
        walk(full);
      } else {
        const sha1 = createHash('sha1').update(readFileSync(full)).digest('hex');
        result.set(rel, `file size=${stat.size} mtime=${stat.mtimeMs} sha1=${sha1}`);
      }
    }
  };
  walk(rootPath);
  return result;
}
