import * as assert from 'node:assert/strict';
import { extKey, stripLastExt } from '../../core/extKey';

describe('extKey (BL-1)', () => {
  // SPEC BL-1 の表のすべての行
  const table: [string, string][] = [
    ['main.py', '.py'],
    ['README', ''],
    ['.gitignore', ''],
    ['.eslintrc.json', '.json'],
    ['.env.local', '.local'],
    ['archive.tar.gz', '.gz'],
    ['types.d.ts', '.ts'],
    ['IMG.JPG', '.jpg'],
    ['file.', ''],
    ['...', ''],
  ];
  for (const [name, key] of table) {
    it(`${name} -> '${key}'`, () => {
      assert.equal(extKey(name), key);
    });
  }
});

describe('stripLastExt', () => {
  it('removes only the last extension', () => {
    assert.equal(stripLastExt('app.js'), 'app');
    assert.equal(stripLastExt('archive.tar.gz'), 'archive.tar');
  });
  it('keeps the original case', () => {
    assert.equal(stripLastExt('App.JS'), 'App');
  });
  it('keeps names without an extension as they are', () => {
    assert.equal(stripLastExt('README'), 'README');
    assert.equal(stripLastExt('.gitignore'), '.gitignore');
    assert.equal(stripLastExt('file.'), 'file.');
  });
});
