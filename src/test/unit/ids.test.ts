import * as assert from 'node:assert/strict';
import { errorId, fileId, folderId, groupId } from '../../core/ids';

describe('ids', () => {
  it('SPEC の例のとおりに作る', () => {
    assert.equal(folderId('file:///w/src'), 'd:file:///w/src');
    assert.equal(groupId('file:///w/src', '.py'), 'g:file:///w/src|.py');
    assert.equal(groupId('file:///w/src', ''), 'g:file:///w/src|');
    assert.equal(fileId('file:///w/src/main.py'), 'f:file:///w/src/main.py');
    assert.equal(errorId('file:///w/locked'), 'e:file:///w/locked');
  });

  it('同じ入力からは同じ ID ができる', () => {
    assert.equal(groupId('file:///w/src', '.py'), groupId('file:///w/src', '.py'));
    assert.equal(folderId('file:///w/src'), folderId('file:///w/src'));
  });

  it('件数が変わっても ID は変わらない（件数を入力に取らない）', () => {
    // groupId は親の uri とキーしか受け取らない。件数の違う2つのグループでも同じ ID になる
    const before = { parentUri: 'file:///w/src', key: '.py', count: 2 };
    const after = { ...before, count: 3 };
    assert.equal(groupId(before.parentUri, before.key), groupId(after.parentUri, after.key));
  });

  it('拡張子なしのグループと .x のグループで ID が異なる', () => {
    assert.notEqual(groupId('file:///w/src', ''), groupId('file:///w/src', '.x'));
  });

  it('種類が違えば同じ uri でも ID が異なる', () => {
    const uri = 'file:///w/a';
    const ids = new Set([folderId(uri), fileId(uri), errorId(uri), groupId(uri, '')]);
    assert.equal(ids.size, 4);
  });
});
