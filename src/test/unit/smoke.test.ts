import * as assert from 'node:assert/strict';

// M0 の仮のテスト。単体テストの実行基盤が動くことだけを確かめる。
describe('unit test harness', () => {
  it('runs', () => {
    assert.equal(1 + 1, 2);
  });
});
