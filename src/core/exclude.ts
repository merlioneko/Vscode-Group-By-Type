import * as vm from 'node:vm';
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

/** 規則を無効にしたことの知らせ */
export interface RuleDisabledEvent {
  /** 無効にした規則のパターン（files.exclude のキー） */
  pattern: string;
  /** 無効にした規則が上限に達し、すべての規則を無効にしたか */
  allDisabled: boolean;
}

export interface ExcludeMatcherOptions {
  /** 照合が制限時間を超えて規則を無効にしたときに呼ぶ */
  onRuleDisabled?: (event: RuleDisabledEvent) => void;
}

/** 1回の照合（1つの規則 × 1つのディレクトリの全項目）の制限時間（BL-2「照合の制限時間」） */
export const MATCH_TIMEOUT_MS = 200;

/** 無効にした規則がこの数に達したら、すべての規則を無効にする（BL-2「照合の制限時間」） */
export const MAX_DISABLED_RULES = 3;

interface Rule {
  pattern: string;
  matches: (relPath: string) => boolean;
  /** when 条件。`$(basename)` を含むテンプレート。なければ常に除外する */
  when?: string;
  disabled: boolean;
}

/** vm の中で照合するときに受け渡す値 */
interface MatchContext {
  matches?: (relPath: string) => boolean;
  relPaths?: readonly string[];
  result?: boolean[];
}

const BASENAME = '$(basename)';

/** 1つの規則で全項目を照合するスクリプト。timeout を付けて実行し、終わらなければ打ち切る */
const MATCH_ALL = new vm.Script('result = relPaths.map((relPath) => matches(relPath));');

/**
 * `files.exclude` の値から除外判定関数を作る（BL-2）。
 * - `true`：有効なパターン
 * - `false`：無視する
 * - `{ when: "..." }`：パターンに一致し、when の `$(basename)` を置き換えた名前の項目が
 *   同じディレクトリにあるときだけ除外する
 * - キーが `!` で始まるもの：無視する
 * - それ以外の値：無視する
 *
 * 照合は規則ごとにまとめて行い、MATCH_TIMEOUT_MS を超えたら打ち切ってその規則を無効にする。
 * 無効にした規則が MAX_DISABLED_RULES に達したら、すべての規則を無効にする。
 */
export function createExcludeMatcher(config: unknown, options: ExcludeMatcherOptions = {}): ExcludeMatcher {
  const rules: Rule[] = [];
  if (typeof config === 'object' && config !== null) {
    for (const [pattern, value] of Object.entries(config as Record<string, unknown>)) {
      if (pattern.startsWith('!')) {
        continue;
      }
      if (value === true) {
        rules.push({ pattern, matches: picomatch(pattern, { dot: true }), disabled: false });
      } else if (isWhen(value)) {
        rules.push({ pattern, matches: picomatch(pattern, { dot: true }), when: value.when, disabled: false });
      }
    }
  }

  const context: MatchContext = vm.createContext({});
  let disabledCount = 0;

  /** 規則で全項目を照合する。制限時間を超えたら undefined */
  const matchAll = (rule: Rule, relPaths: readonly string[]): boolean[] | undefined => {
    context.matches = rule.matches;
    context.relPaths = relPaths;
    context.result = undefined;
    try {
      MATCH_ALL.runInContext(context, { timeout: MATCH_TIMEOUT_MS });
      return context.result;
    } catch (error) {
      if (isTimeout(error)) {
        return undefined;
      }
      throw error;
    } finally {
      context.matches = undefined;
      context.relPaths = undefined;
      context.result = undefined;
    }
  };

  const disable = (rule: Rule): boolean => {
    rule.disabled = true;
    disabledCount++;
    const allDisabled = disabledCount >= MAX_DISABLED_RULES;
    if (allDisabled) {
      for (const r of rules) {
        r.disabled = true;
      }
    }
    options.onRuleDisabled?.({ pattern: rule.pattern, allDisabled });
    return allDisabled;
  };

  return (items) => {
    const excluded = new Set<string>();
    if (items.length === 0) {
      return excluded;
    }
    const relPaths = items.map((item) => item.relPath);
    const siblingNames = new Set(items.map((item) => item.name));

    for (const rule of rules) {
      if (rule.disabled) {
        continue;
      }
      const results = matchAll(rule, relPaths);
      if (results === undefined) {
        if (disable(rule)) {
          return new Set();
        }
        continue;
      }
      items.forEach((item, index) => {
        if (!results[index] || excluded.has(item.name)) {
          return;
        }
        if (rule.when === undefined || siblingNames.has(counterpartOf(rule.when, item.name))) {
          excluded.add(item.name);
        }
      });
    }
    return excluded;
  };
}

/** when の `$(basename)` を、名前から最後の拡張子を除いたものに置き換える */
function counterpartOf(when: string, name: string): string {
  return when.split(BASENAME).join(stripLastExt(name));
}

function isTimeout(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'ERR_SCRIPT_EXECUTION_TIMEOUT'
  );
}

function isWhen(value: unknown): value is { when: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { when?: unknown }).when === 'string'
  );
}
