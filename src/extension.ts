import * as vscode from 'vscode';
import { packFiles, PACK_FILES_COMMAND } from './commands/pack-files.js';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      PACK_FILES_COMMAND,
      (uri?: vscode.Uri, uris?: readonly vscode.Uri[]) => packFiles(uri, uris),
    ),
    vscode.commands.registerCommand('kapomPromptPack.hello', async () => {
      await vscode.window.showInformationMessage('Kapom PromptPack is alive.');
    }),
  );
}

export function deactivate(): void {
  // nothing to clean up yet
}
