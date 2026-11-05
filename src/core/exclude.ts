import picomatch from 'picomatch';
import { stripLastExt } from './extKey';

/** 除外判定の対象になる、ディレクトリ直下の1項目 */
export interface ExcludeItem {
  /** ルートから見た `/` 区切りの相対パス（例：`src/app.js`） */
  relPath: string;
  /** 項目の名前（relPath の最後の部分） */
  name: string;
}

/**
 * 除外判定関数。1つのディレクトリ直下の項目（除外前のすべて）をまとめて受け取り、
 * 除外する項目の名前を返す。
 */
export type ExcludeMatcher = (items: readonly ExcludeItem[]) => ReadonlySet<string>;

interface Rule {
  matches: (relPath: string) => boolean;
  /** when 条件。`$(basename)` を含むテンプレート。なければ常に除外する */
  when?: string;
}

const BASENAME = '$(basename)';

/**
 * `files.exclude` の値から除外判定関数を作る（BL-2）。
 * - `true`：有効なパターン
 * - `false`：無視する
 * - `{ when: "..." }`：パターンに一致し、when の `$(basename)` を置き換えた名前の項目が
 *   同じディレクトリにあるときだけ除外する
 * - キーが `!` で始まるもの：無視する
 * - それ以外の値：無視する
 */
export function createExcludeMatcher(config: unknown): ExcludeMatcher {
  const rules: Rule[] = [];
  if (typeof config === 'object' && config !== null) {
    for (const [pattern, value] of Object.entries(config as Record<string, unknown>)) {
      if (pattern.startsWith('!')) {
        continue;
      }
      if (value === true) {
        rules.push({ matches: picomatch(pattern, { dot: true }) });
      } else if (isWhen(value)) {
        rules.push({ matches: picomatch(pattern, { dot: true }), when: value.when });
      }
    }
  }

  return (items) => {
    const siblingNames = new Set(items.map((item) => item.name));
    const excluded = new Set<string>();
    for (const rule of rules) {
      for (const item of items) {
        if (excluded.has(item.name) || !rule.matches(item.relPath)) {
          continue;
        }
        if (rule.when === undefined || siblingNames.has(counterpartOf(rule.when, item.name))) {
          excluded.add(item.name);
        }
      }
    }
    return excluded;
  };
}

/** when の `$(basename)` を、名前から最後の拡張子を除いたものに置き換える */
function counterpartOf(when: string, name: string): string {
  return when.split(BASENAME).join(stripLastExt(name));
}

function isWhen(value: unknown): value is { when: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { when?: unknown }).when === 'string'
  );
}
