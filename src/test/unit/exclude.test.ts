import * as assert from 'node:assert/strict';
import { createExcludeMatcher, type RuleDisabledEvent } from '../../core/exclude';

/**
 * relPath の最後の部分を名前として判定する。
 * siblings は同じディレクトリにあるほかの項目の名前で、判定対象と一緒にまとめて渡す。
 */
function check(config: unknown, relPath: string, siblings: string[] = []): boolean {
  const slash = relPath.lastIndexOf('/');
  const dir = relPath.slice(0, slash + 1);
  const name = relPath.slice(slash + 1);
  const names = new Set([name, ...siblings]);
  const items = [...names].map((n) => ({ relPath: dir + n, name: n }));
  return createExcludeMatcher(config)(items).has(name);
}

describe('createExcludeMatcher (BL-2)', () => {
  describe('照合の例', () => {
    it('**/.git は .git と src/.git の両方に一致する', () => {
      const config = { '**/.git': true };
      assert.equal(check(config, '.git'), true);
      assert.equal(check(config, 'src/.git'), true);
    });

    it('*.js はルート直下の app.js だけに一致する', () => {
      const config = { '*.js': true };
      assert.equal(check(config, 'app.js'), true);
      assert.equal(check(config, 'src/app.js'), false);
    });

    it('**/build/** は build に一致する（フォルダごと隠れる）', () => {
      assert.equal(check({ '**/build/**': true }, 'build'), true);
    });

    it('**/*.JS は src/app.js に一致しない（大文字と小文字を区別する）', () => {
      assert.equal(check({ '**/*.JS': true }, 'src/app.js'), false);
    });
  });

  describe('設定の値', () => {
    it('true のパターンで除外する', () => {
      assert.equal(check({ '**/*.log': true }, 'a/b.log'), true);
    });

    it('false のパターンは無視する', () => {
      assert.equal(check({ '**/*.log': false }, 'a/b.log'), false);
    });

    it('! で始まるキーは無視する', () => {
      assert.equal(check({ '!**/*.log': true }, 'a/b.log'), false);
      // ! のキーがあっても、ほかのパターンによる除外は打ち消されない
      assert.equal(check({ '**/*.log': true, '!**/keep.log': true }, 'a/keep.log'), true);
    });

    it('when 条件：同じディレクトリに相手があれば除外する', () => {
      const config = { '**/*.js': { when: '$(basename).ts' } };
      assert.equal(check(config, 'src/app.js', ['app.ts', 'app.js', 'legacy.js']), true);
    });

    it('when 条件：同じディレクトリに相手がなければ表示する', () => {
      const config = { '**/*.js': { when: '$(basename).ts' } };
      assert.equal(check(config, 'src/legacy.js', ['app.ts', 'app.js', 'legacy.js']), false);
    });

    it('when 条件：パターンに一致しなければ相手があっても表示する', () => {
      const config = { '**/*.js': { when: '$(basename).ts' } };
      assert.equal(check(config, 'src/app.ts', ['app.ts', 'app.js']), false);
    });

    it('設定が object でなければ何も除外しない', () => {
      assert.equal(check(undefined, '.git'), false);
      assert.equal(check(null, '.git'), false);
    });
  });

  describe('照合の制限時間 (BL-2, AC-11)', () => {
    // 制限時間がなければ照合が終わらない組み合わせ（CVE-2026-112366）
    const evilName = 'a'.repeat(40) + 'b';
    const items = [
      { relPath: evilName, name: evilName },
      { relPath: 'b.log', name: 'b.log' },
    ];

    function timed<T>(fn: () => T): { value: T; ms: number } {
      const start = performance.now();
      const value = fn();
      return { value, ms: performance.now() - start };
    }

    it('照合が終わらない規則は打ち切って無効にし、ほかの規則は効き続ける', () => {
      const events: RuleDisabledEvent[] = [];
      const matcher = createExcludeMatcher(
        { '+(*a)': true, '**/*.log': true },
        { onRuleDisabled: (event) => events.push(event) },
      );

      const first = timed(() => matcher(items));
      assert.ok(first.ms < 1000, `${first.ms.toFixed(0)}ms かかった`);
      assert.deepEqual([...first.value], ['b.log']);
      assert.deepEqual(events, [{ pattern: '+(*a)', allDisabled: false }]);

      // 無効にした規則はもう使わないので、2回目は打ち切りを待たない
      const second = timed(() => matcher(items));
      assert.ok(second.ms < 100, `${second.ms.toFixed(0)}ms かかった`);
      assert.deepEqual([...second.value], ['b.log']);
      assert.equal(events.length, 1);
    });

    it('無効にした規則が3つに達すると、すべての規則を無効にして何も除外しない', () => {
      const events: RuleDisabledEvent[] = [];
      const matcher = createExcludeMatcher(
        { '**/*.log': true, '+(*a)': true, '**/+(*a)': true, '(*a)+': true },
        { onRuleDisabled: (event) => events.push(event) },
      );

      const first = timed(() => matcher(items));
      assert.ok(first.ms < 1500, `${first.ms.toFixed(0)}ms かかった`);
      assert.deepEqual([...first.value], []);
      assert.deepEqual(events, [
        { pattern: '+(*a)', allDisabled: false },
        { pattern: '**/+(*a)', allDisabled: false },
        { pattern: '(*a)+', allDisabled: true },
      ]);

      const second = timed(() => matcher(items));
      assert.ok(second.ms < 100, `${second.ms.toFixed(0)}ms かかった`);
      assert.deepEqual([...second.value], []);
      assert.equal(events.length, 3);
    });
  });
});
