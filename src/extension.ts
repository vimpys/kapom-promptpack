import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const hello = vscode.commands.registerCommand('kapomPromptPack.hello', async () => {
    await vscode.window.showInformationMessage('Kapom PromptPack is alive.');
  });

  context.subscriptions.push(hello);
}

export function deactivate(): void {
  // nothing to clean up yet
}
