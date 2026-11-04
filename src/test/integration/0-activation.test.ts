import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

const EXTENSION_ID = 'local.vscode-file-grouper';

describe('extension activation', () => {
  it('is found and can be activated', async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `${EXTENSION_ID} が見つからない`);
    await extension.activate();
    assert.equal(extension.isActive, true);
  });
});
