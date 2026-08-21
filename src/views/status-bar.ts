import * as vscode from 'vscode';
import { formatTokenCount } from '../core/token-estimator.js';
import type { PackSummary } from '../core/types.js';

const PRIORITY = 100;

/**
 * Shows what the last pack cost, so the running total is visible without
 * having to pack again to find out.
 */
export class PackStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor(commandId: string) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, PRIORITY);
    this.item.command = commandId;
    this.item.name = 'Kapom PromptPack';
  }

  update(summary: PackSummary): void {
    const warning = summary.redactionCount > 0 || summary.skipped.length > 0;

    this.item.text = `$(clippy) ${formatTokenCount(summary.totalTokens)} tokens`;
    this.item.tooltip = [
      `Kapom PromptPack — last pack from ${summary.workspaceName}`,
      `${String(summary.fileCount)} file(s)`,
      `${String(summary.redactionCount)} value(s) masked`,
      `${String(summary.skipped.length)} file(s) left out`,
    ].join('\n');
    this.item.backgroundColor = warning
      ? new vscode.ThemeColor('statusBarItem.warningBackground')
      : undefined;
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
