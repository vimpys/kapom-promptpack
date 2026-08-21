import * as vscode from 'vscode';
import { packFiles, PACK_FILES_COMMAND } from './commands/pack-files.js';
import { PackStatusBar } from './views/status-bar.js';

export function activate(context: vscode.ExtensionContext): void {
  const statusBar = new PackStatusBar(PACK_FILES_COMMAND);

  context.subscriptions.push(
    statusBar,
    vscode.commands.registerCommand(
      PACK_FILES_COMMAND,
      (uri?: vscode.Uri, uris?: readonly vscode.Uri[]) => packFiles(uri, uris, { statusBar }),
    ),
    vscode.commands.registerCommand('kapomPromptPack.hello', async () => {
      await vscode.window.showInformationMessage('Kapom PromptPack is alive.');
    }),
  );
}

export function deactivate(): void {
  // nothing to clean up beyond the subscriptions
}
