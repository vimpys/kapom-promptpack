import * as vscode from 'vscode';

const COPY = 'Copy to clipboard';
const CANCEL = 'Cancel';

/**
 * Opens the payload for review and waits for a decision.
 *
 * The document is opened first and the prompt is non-modal on purpose: a modal
 * dialog would sit on top of the very text the user is being asked to check.
 * Dismissing the notification counts as cancelling, because the safe default
 * when someone walks away is that nothing leaves the machine.
 */
export async function confirmPayload(
  markdown: string,
  reasons: readonly string[],
): Promise<boolean> {
  const document = await vscode.workspace.openTextDocument({
    content: markdown,
    language: 'markdown',
  });

  await vscode.window.showTextDocument(document, { preview: false });

  const detail = reasons.length === 0 ? '' : ` — ${reasons.join('; ')}`;
  const choice = await vscode.window.showWarningMessage(
    `Kapom PromptPack: review before copying${detail}`,
    COPY,
    CANCEL,
  );

  return choice === COPY;
}
