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

  test('every contributed command is registered', async () => {
    const commands = await vscode.commands.getCommands(true);

    for (const id of [
      'kapomPromptPack.packFiles',
      'kapomPromptPack.addToPanel',
      'kapomPromptPack.copyPrompt',
      'kapomPromptPack.clearContext',
    ]) {
      assert.ok(commands.includes(id), `${id} is not registered`);
    }
  });

  test('the panel view is contributed to its own activity bar container', () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);

    assert.ok(extension);

    const contributes = extension.packageJSON as {
      contributes: {
        viewsContainers: { activitybar: readonly { id: string; icon: string }[] };
        views: Record<string, readonly { id: string; type?: string }[]>;
      };
    };

    const container = contributes.contributes.viewsContainers.activitybar[0];

    assert.ok(container);
    assert.equal(container.id, 'kapomPromptPack');
    assert.match(container.icon, /\.svg$/u);

    const view = contributes.contributes.views['kapomPromptPack']?.[0];

    assert.ok(view);
    assert.equal(view.id, 'kapomPromptPack.panel');
    assert.equal(view.type, 'webview');
  });
});
