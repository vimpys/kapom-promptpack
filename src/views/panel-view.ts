import * as vscode from 'vscode';
import { estimateTokens } from '../core/token-estimator.js';
import type { ContextStore } from '../state/context-store.js';

export const PANEL_VIEW_ID = 'kapomPromptPack.panel';

interface PanelFile {
  readonly key: string;
  readonly path: string;
  readonly tokens: number;
  readonly live: boolean;
}

interface PanelState {
  readonly task: string;
  readonly files: readonly PanelFile[];
  readonly totalTokens: number;
}

interface InboundMessage {
  readonly type: string;
  readonly value?: string;
}

function nonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';

  for (let i = 0; i < 32; i += 1) {
    text += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }

  return text;
}

/**
 * The sidebar panel.
 *
 * It is a thin shell: every decision about what may be packed still belongs to
 * core, and copying goes through the same command as the explorer menu, so this
 * view cannot become a second route past the secret guard.
 */
export class PromptPanelView implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;

  private readonly decoder = new TextDecoder();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: ContextStore,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };
    view.webview.html = this.html(view.webview);

    view.webview.onDidReceiveMessage((message: InboundMessage) => {
      void this.handle(message);
    });

    void this.refresh();
  }

  /** Reveals the panel, so adding from the explorer shows what happened. */
  async reveal(): Promise<void> {
    if (this.view === undefined) {
      await vscode.commands.executeCommand(`${PANEL_VIEW_ID}.focus`);

      return;
    }

    this.view.show(true);
  }

  async refresh(): Promise<void> {
    const view = this.view;

    if (view === undefined) {
      return;
    }

    await this.measure();

    const snapshot = this.store.snapshot();
    const files: PanelFile[] = [
      ...snapshot.pinned.map((entry) => ({
        key: entry.uri.toString(),
        path: entry.relativePath,
        tokens: entry.tokenEstimate,
        live: false,
      })),
    ];

    if (snapshot.active !== undefined) {
      files.push({
        key: snapshot.active.uri.toString(),
        path: snapshot.active.relativePath,
        tokens: snapshot.active.tokenEstimate,
        live: true,
      });
    }

    const state: PanelState = {
      task: snapshot.task,
      files,
      totalTokens: snapshot.totalTokens,
    };

    await view.webview.postMessage({ type: 'state', state });
  }

  /** Token counts come from the real bytes, so the figure is not a guess. */
  private async measure(): Promise<void> {
    for (const uri of this.store.uris()) {
      const key = uri.toString();

      try {
        const bytes = await vscode.workspace.fs.readFile(uri);

        this.store.rememberTokens(key, estimateTokens(this.decoder.decode(bytes)));
      } catch {
        this.store.rememberTokens(key, 0);
      }
    }
  }

  private async handle(message: InboundMessage): Promise<void> {
    switch (message.type) {
      case 'task':
        this.store.setTask(message.value ?? '');

        return;

      case 'unpin':
        if (message.value !== undefined) {
          this.store.unpin(message.value);
        }

        return;

      case 'pinActive': {
        const active = vscode.window.activeTextEditor?.document.uri;

        if (active !== undefined) {
          this.store.pin([active]);
        }

        return;
      }

      case 'addFiles': {
        const picked = await vscode.window.showOpenDialog({
          canSelectMany: true,
          openLabel: 'Add to prompt',
        });

        if (picked !== undefined) {
          this.store.pin(picked);
        }

        return;
      }

      case 'clear':
        this.store.clear();

        return;

      case 'copy':
        await vscode.commands.executeCommand('kapomPromptPack.copyPrompt');

        return;

      default:
        return;
    }
  }

  private html(webview: vscode.Webview): string {
    const asset = (name: string): vscode.Uri =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', name));
    const key = nonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${key}';">
<link href="${asset('panel.css').toString()}" rel="stylesheet">
<title>Kapom PromptPack</title>
</head>
<body>
  <label class="label" for="task">Task</label>
  <textarea id="task" rows="4" placeholder="What should the model do with these files?"></textarea>

  <div class="row">
    <span class="label">Context</span>
    <span id="total" class="total"></span>
  </div>
  <ul id="files" class="files"></ul>
  <p id="empty" class="empty">Open a file, or add one below.</p>

  <div class="actions">
    <button id="pin" class="secondary" type="button">Pin active file</button>
    <button id="add" class="secondary" type="button">Add files…</button>
  </div>
  <button id="copy" class="primary" type="button">Copy prompt</button>
  <button id="clear" class="link" type="button">Clear</button>

  <script nonce="${key}" src="${asset('panel.js').toString()}"></script>
</body>
</html>`;
  }
}
