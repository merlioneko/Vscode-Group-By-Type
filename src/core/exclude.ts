import picomatch from 'picomatch';
import { stripLastExt } from './extKey';

/**
 * 除外判定関数。
 * @param relPath ルートから見た `/` 区切りの相対パス（例：`src/app.js`）
 * @param name 項目の名前（relPath の最後の部分）
 * @param siblingNames 同じディレクトリにある項目の名前（除外前のすべて）
 */
export type ExcludeMatcher = (relPath: string, name: string, siblingNames: ReadonlySet<string>) => boolean;

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

  return (relPath, name, siblingNames) => {
    for (const rule of rules) {
      if (!rule.matches(relPath)) {
        continue;
      }
      if (rule.when === undefined) {
        return true;
      }
      const counterpart = rule.when.split(BASENAME).join(stripLastExt(name));
      if (siblingNames.has(counterpart)) {
        return true;
      }
    }
    return false;
  };
}

function isWhen(value: unknown): value is { when: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { when?: unknown }).when === 'string'
  );
}
