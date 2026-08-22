import * as vscode from 'vscode';
import { packFiles, PACK_FILES_COMMAND } from './commands/pack-files.js';
import {
  addToPanel,
  clearContext,
  copyPrompt,
  ADD_TO_PANEL_COMMAND,
  CLEAR_CONTEXT_COMMAND,
  COPY_PROMPT_COMMAND,
} from './commands/panel-commands.js';
import { ContextStore } from './state/context-store.js';
import { PromptPanelView, PANEL_VIEW_ID } from './views/panel-view.js';
import { PackStatusBar } from './views/status-bar.js';

export function activate(context: vscode.ExtensionContext): void {
  const store = new ContextStore();
  const statusBar = new PackStatusBar(COPY_PROMPT_COMMAND);
  const panel = new PromptPanelView(context.extensionUri, store);

  store.setActive(vscode.window.activeTextEditor?.document.uri);

  context.subscriptions.push(
    store,
    statusBar,
    vscode.window.registerWebviewViewProvider(PANEL_VIEW_ID, panel, {
      // Keep the task text while the panel is hidden; retyping it would be the
      // fastest way to make the panel annoying.
      webviewOptions: { retainContextWhenHidden: true },
    }),
    store.onDidChange(() => {
      void panel.refresh();
    }),
    // The panel's top entry follows whatever is focused, so it has to react to
    // tab switches rather than only to explicit commands.
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      store.setActive(editor?.document.uri);
    }),
    vscode.commands.registerCommand(ADD_TO_PANEL_COMMAND, addToPanel(store, panel)),
    vscode.commands.registerCommand(COPY_PROMPT_COMMAND, copyPrompt(store, { statusBar })),
    vscode.commands.registerCommand(CLEAR_CONTEXT_COMMAND, clearContext(store)),
    vscode.commands.registerCommand(
      PACK_FILES_COMMAND,
      (uri?: vscode.Uri, uris?: readonly vscode.Uri[]) => packFiles(uri, uris, { statusBar }),
    ),
  );
}

export function deactivate(): void {
  // nothing to clean up beyond the subscriptions
}
