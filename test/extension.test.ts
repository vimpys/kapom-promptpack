import assert from 'node:assert/strict';
import * as vscode from 'vscode';

const EXTENSION_ID = 'kapom-soft.kapom-promptpack';

suite('kapom-promptpack', () => {
  test('extension is installed and activates', async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);

    assert.ok(extension, `extension ${EXTENSION_ID} not found`);

    await extension.activate();

    assert.equal(extension.isActive, true);
  });

  test('hello command is registered', async () => {
    const commands = await vscode.commands.getCommands(true);

    assert.ok(commands.includes('kapomPromptPack.hello'));
  });
});
