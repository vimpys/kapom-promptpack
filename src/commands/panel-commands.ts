import * as vscode from 'vscode';
import { packContext, type PackDependencies } from './pack-files.js';
import type { ContextStore } from '../state/context-store.js';
import type { PromptPanelView } from '../views/panel-view.js';

export const ADD_TO_PANEL_COMMAND = 'kapomPromptPack.addToPanel';
export const COPY_PROMPT_COMMAND = 'kapomPromptPack.copyPrompt';
export const CLEAR_CONTEXT_COMMAND = 'kapomPromptPack.clearContext';

/**
 * Adds an explorer selection to the panel rather than copying straight away.
 *
 * Files land in the pinned list, which is what stops them disappearing when the
 * focused editor changes.
 */
export function addToPanel(
  store: ContextStore,
  panel: PromptPanelView,
): (uri?: vscode.Uri, uris?: readonly vscode.Uri[]) => Promise<void> {
  return async (uri, uris) => {
    const selection = uris !== undefined && uris.length > 0 ? uris : uri === undefined ? [] : [uri];
    const chosen =
      selection.length > 0
        ? selection
        : (() => {
            const active = vscode.window.activeTextEditor?.document.uri;

            return active === undefined ? [] : [active];
          })();

    if (chosen.length === 0) {
      void vscode.window.showWarningMessage(
        'Kapom PromptPack — select files or a folder in the explorer first.',
      );

      return;
    }

    store.pin(chosen);

    await panel.reveal();
  };
}

export function copyPrompt(
  store: ContextStore,
  dependencies: PackDependencies,
): () => Promise<void> {
  return async () => {
    const uris = store.uris();

    if (uris.length === 0) {
      void vscode.window.showWarningMessage(
        'Kapom PromptPack — the prompt has no files yet. Open a file or add one from the panel.',
      );

      return;
    }

    await packContext(uris, store.getTask(), dependencies);
  };
}

export function clearContext(store: ContextStore): () => void {
  return () => {
    store.clear();
  };
}
