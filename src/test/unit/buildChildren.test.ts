import * as assert from 'node:assert/strict';
import { buildChildren, compareNames, type DirEntry } from '../../core/buildChildren';
import { createExcludeMatcher } from '../../core/exclude';

const noExclude = createExcludeMatcher({});

function dirs(...names: string[]): DirEntry[] {
  return names.map((name) => ({ name, isDirectory: true }));
}
function files(...names: string[]): DirEntry[] {
  return names.map((name) => ({ name, isDirectory: false }));
}
/** 入力の順序に結果が左右されないことを見るため、逆順にして渡す */
function reversed<T>(items: T[]): T[] {
  return [...items].reverse();
}

describe('buildChildren', () => {
  describe('並び順 (BL-3)', () => {
    it('フォルダ：.github, .vscode, docs, empty, src', () => {
      const expected = ['.github', '.vscode', 'docs', 'empty', 'src'];
      const result = buildChildren(reversed(dirs(...expected)), '', noExclude);
      assert.deepEqual(result.folders, expected);
    });

    it('ファイル：app.ts, file2.ts, file10.ts, types.d.ts', () => {
      const expected = ['app.ts', 'file2.ts', 'file10.ts', 'types.d.ts'];
      const result = buildChildren(reversed(files(...expected)), '', noExclude);
      assert.deepEqual(result.groups.map((g) => g.files), [expected]);
    });

    it('ファイル：DATA.JSON, settings.json', () => {
      const expected = ['DATA.JSON', 'settings.json'];
      const result = buildChildren(reversed(files(...expected)), '', noExclude);
      assert.deepEqual(result.groups.map((g) => g.files), [expected]);
    });

    it('ファイル：.gitignore, LICENSE', () => {
      const expected = ['.gitignore', 'LICENSE'];
      const result = buildChildren(reversed(files(...expected)), '', noExclude);
      assert.deepEqual(result.groups.map((g) => g.files), [expected]);
    });

    it('Collator で同じならコード単位で比べる（A.txt が a.txt より先）', () => {
      assert.ok(compareNames('A.txt', 'a.txt') < 0);
      assert.ok(compareNames('a.txt', 'A.txt') > 0);
      const result = buildChildren(files('a.txt', 'A.txt'), '', noExclude);
      assert.deepEqual(result.groups[0].files, ['A.txt', 'a.txt']);
    });

    it('グループはキーのコード単位の昇順で、拡張子なしが最後', () => {
      const result = buildChildren(files('README', 'b.py', 'a.json', 'c.gz', 'Makefile', 'x.ts'), '', noExclude);
      assert.deepEqual(result.groups.map((g) => g.key), ['.gz', '.json', '.py', '.ts', '']);
    });

    it('グループのキーは小文字、ファイル名は元の表記のまま', () => {
      const result = buildChildren(files('IMG.JPG', 'photo.jpg'), '', noExclude);
      assert.deepEqual(result.groups, [{ key: '.jpg', files: ['IMG.JPG', 'photo.jpg'], initiallyExpanded: true }]);
    });

    it('フォルダは名前に . があっても分類しない', () => {
      const result = buildChildren(dirs('.github', 'v1.2'), '', noExclude);
      assert.deepEqual(result.folders, ['.github', 'v1.2']);
      assert.deepEqual(result.groups, []);
    });
  });

  describe('初期展開 (BL-4)', () => {
    it('グループが1つなら展開する', () => {
      const result = buildChildren(files('a.py', 'b.py'), '', noExclude);
      assert.deepEqual(result.groups.map((g) => g.initiallyExpanded), [true]);
    });

    it('グループが2つ以上ならすべて畳む', () => {
      const result = buildChildren(files('a.py', 'b.md', 'README'), '', noExclude);
      assert.deepEqual(result.groups.map((g) => g.initiallyExpanded), [false, false, false]);
    });

    it('サブフォルダがあってもグループが1つなら展開する', () => {
      const result = buildChildren([...dirs('sub'), ...files('a.py')], '', noExclude);
      assert.deepEqual(result.folders, ['sub']);
      assert.deepEqual(result.groups.map((g) => g.initiallyExpanded), [true]);
    });

    it('除外したファイルはグループの数に数えない', () => {
      const exclude = createExcludeMatcher({ '**/*.log': true });
      const result = buildChildren(files('a.py', 'b.log'), '', exclude);
      assert.deepEqual(result.groups, [{ key: '.py', files: ['a.py'], initiallyExpanded: true }]);
    });
  });

  describe('除外 (BL-2)', () => {
    it('relPath で照合する（親の relPath とつなぐ）', () => {
      const exclude = createExcludeMatcher({ '*.js': true });
      assert.deepEqual(buildChildren(files('app.js'), '', exclude).groups, []);
      assert.equal(buildChildren(files('app.js'), 'src', exclude).groups.length, 1);
    });

    it('除外したフォルダは表示しない', () => {
      const exclude = createExcludeMatcher({ '**/build/**': true });
      assert.deepEqual(buildChildren(dirs('build', 'src'), 'a', exclude).folders, ['src']);
    });
  });

  describe('SPEC「期待するツリー」の各フォルダ', () => {
    // VS Code の files.exclude の既定値と、テスト用ワークスペースの .vscode/settings.json を合わせたもの
    const exclude = createExcludeMatcher({
      '**/.git': true,
      '**/.svn': true,
      '**/.hg': true,
      '**/.DS_Store': true,
      '**/Thumbs.db': true,
      '**/*.js': { when: '$(basename).ts' },
    });
    const g = (key: string, fileNames: string[], initiallyExpanded: boolean) => ({ key, files: fileNames, initiallyExpanded });

    it('sample（ルート）', () => {
      const entries = [
        ...dirs('.git', '.github', '.vscode', 'docs', 'empty', 'src'),
        ...files('.gitignore', 'LICENSE', 'CHANGELOG.md', 'README.md', 'config.json', 'data.json'),
      ];
      assert.deepEqual(buildChildren(entries, '', exclude), {
        folders: ['.github', '.vscode', 'docs', 'empty', 'src'],
        groups: [
          g('.json', ['config.json', 'data.json'], false),
          g('.md', ['CHANGELOG.md', 'README.md'], false),
          g('', ['.gitignore', 'LICENSE'], false),
        ],
      });
    });

    it('.github', () => {
      assert.deepEqual(buildChildren(dirs('workflows'), '.github', exclude), { folders: ['workflows'], groups: [] });
    });

    it('.github/workflows', () => {
      assert.deepEqual(buildChildren(files('ci.yml'), '.github/workflows', exclude), {
        folders: [],
        groups: [g('.yml', ['ci.yml'], true)],
      });
    });

    it('.vscode', () => {
      assert.deepEqual(buildChildren(files('settings.json'), '.vscode', exclude), {
        folders: [],
        groups: [g('.json', ['settings.json'], true)],
      });
    });

    it('docs', () => {
      assert.deepEqual(buildChildren(files('guide.md', 'logo.png'), 'docs', exclude), {
        folders: [],
        groups: [g('.md', ['guide.md'], false), g('.png', ['logo.png'], false)],
      });
    });

    it('empty', () => {
      assert.deepEqual(buildChildren([], 'empty', exclude), { folders: [], groups: [] });
    });

    it('src', () => {
      const entries = files(
        'app.ts', 'app.js', 'legacy.js', 'file2.ts', 'file10.ts', 'types.d.ts',
        'main.py', 'utils.py', 'settings.json', 'DATA.JSON', 'archive.tar.gz',
      );
      assert.deepEqual(buildChildren(entries, 'src', exclude), {
        folders: [],
        groups: [
          g('.gz', ['archive.tar.gz'], false),
          g('.js', ['legacy.js'], false),
          g('.json', ['DATA.JSON', 'settings.json'], false),
          g('.py', ['main.py', 'utils.py'], false),
          g('.ts', ['app.ts', 'file2.ts', 'file10.ts', 'types.d.ts'], false),
        ],
      });
    });
  });
});
