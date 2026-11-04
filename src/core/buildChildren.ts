import type { ExcludeMatcher } from './exclude';
import { extKey } from './extKey';

export interface DirEntry {
  name: string;
  isDirectory: boolean;
}

export interface GroupSpec {
  /** 拡張子キー。拡張子なしは '' */
  key: string;
  /** BL-3 の順に並べたファイル名 */
  files: string[];
  /** BL-4 */
  initiallyExpanded: boolean;
}

export interface Children {
  /** BL-3 の順に並べたフォルダ名 */
  folders: string[];
  /** BL-3 の順に並べたグループ */
  groups: GroupSpec[];
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** フォルダ同士、ファイル同士の比較（BL-3）。Collator で同じならコード単位で比べる */
export function compareNames(a: string, b: string): number {
  return collator.compare(a, b) || compareCodeUnits(a, b);
}

/** グループ同士の比較（BL-3）。キーをコード単位で昇順、拡張子なしは最後 */
export function compareGroupKeys(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (a === '') {
    return 1;
  }
  if (b === '') {
    return -1;
  }
  return compareCodeUnits(a, b);
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 親の relPath と名前から relPath を作る。ルート直下なら名前そのもの */
export function joinRelPath(parentRelPath: string, name: string): string {
  return parentRelPath === '' ? name : `${parentRelPath}/${name}`;
}

/**
 * ディレクトリ直下の項目を除外し、フォルダとグループに分けて並べ替える（BL-2〜BL-4）。
 * @param entries ディレクトリ直下の項目
 * @param parentRelPath そのディレクトリの relPath（ルートは ''）
 * @param isExcluded 除外判定関数
 */
export function buildChildren(
  entries: readonly DirEntry[],
  parentRelPath: string,
  isExcluded: ExcludeMatcher,
): Children {
  const siblingNames = new Set(entries.map((e) => e.name));
  const folders: string[] = [];
  const filesByKey = new Map<string, string[]>();

  for (const entry of entries) {
    if (isExcluded(joinRelPath(parentRelPath, entry.name), entry.name, siblingNames)) {
      continue;
    }
    if (entry.isDirectory) {
      folders.push(entry.name);
      continue;
    }
    const key = extKey(entry.name);
    const files = filesByKey.get(key);
    if (files) {
      files.push(entry.name);
    } else {
      filesByKey.set(key, [entry.name]);
    }
  }

  folders.sort(compareNames);
  const keys = [...filesByKey.keys()].sort(compareGroupKeys);
  const initiallyExpanded = keys.length === 1;
  const groups = keys.map((key) => ({
    key,
    files: (filesByKey.get(key) ?? []).sort(compareNames),
    initiallyExpanded,
  }));

  return { folders, groups };
}
