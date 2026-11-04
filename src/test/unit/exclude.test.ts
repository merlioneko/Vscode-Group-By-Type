import * as assert from 'node:assert/strict';
import { createExcludeMatcher } from '../../core/exclude';

/** relPath の最後の部分を名前として判定する */
function check(config: unknown, relPath: string, siblings: string[] = []): boolean {
  const name = relPath.slice(relPath.lastIndexOf('/') + 1);
  return createExcludeMatcher(config)(relPath, name, new Set(siblings));
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
});
