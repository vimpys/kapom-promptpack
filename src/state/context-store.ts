import * as vscode from 'vscode';

export interface ContextEntry {
  readonly uri: vscode.Uri;
  readonly relativePath: string;
  readonly tokenEstimate: number;
  /** True for the entry that follows the focused editor rather than being pinned. */
  readonly live: boolean;
}

export interface ContextSnapshot {
  readonly task: string;
  readonly active: ContextEntry | undefined;
  readonly pinned: readonly ContextEntry[];
  readonly totalTokens: number;
}

/**
 * What the panel is currently pointing at.
 *
 * The focused editor is tracked separately from the pinned list on purpose:
 * switching tabs should change what is offered, never discard a list the user
 * built up by hand.
 */
export class ContextStore {
  private readonly changed = new vscode.EventEmitter<void>();

  readonly onDidChange = this.changed.event;

  private task = '';

  private active: vscode.Uri | undefined;

  private readonly pinned = new Map<string, vscode.Uri>();

  private readonly tokens = new Map<string, number>();

  setTask(text: string): void {
    if (text === this.task) {
      return;
    }

    this.task = text;
    this.changed.fire();
  }

  getTask(): string {
    return this.task;
  }

  setActive(uri: vscode.Uri | undefined): void {
    if (uri?.toString() === this.active?.toString()) {
      return;
    }

    this.active = uri;
    this.changed.fire();
  }

  /** Pinning the focused file is what promotes it out of the live slot. */
  pin(uris: readonly vscode.Uri[]): void {
    let added = false;

    for (const uri of uris) {
      const key = uri.toString();

      if (!this.pinned.has(key)) {
        this.pinned.set(key, uri);
        added = true;
      }
    }

    if (added) {
      this.changed.fire();
    }
  }

  unpin(key: string): void {
    if (this.pinned.delete(key)) {
      this.changed.fire();
    }
  }

  clear(): void {
    if (this.pinned.size === 0 && this.task.length === 0) {
      return;
    }

    this.pinned.clear();
    this.task = '';
    this.changed.fire();
  }

  /** Every file the next pack would read, pinned first, active last. */
  uris(): readonly vscode.Uri[] {
    const all = [...this.pinned.values()];
    const active = this.active;

    if (active !== undefined && !this.pinned.has(active.toString())) {
      all.push(active);
    }

    return all;
  }

  rememberTokens(key: string, estimate: number): void {
    this.tokens.set(key, estimate);
  }

  snapshot(): ContextSnapshot {
    const entry = (uri: vscode.Uri, live: boolean): ContextEntry => ({
      uri,
      relativePath: vscode.workspace.asRelativePath(uri, false).replace(/\\/gu, '/'),
      tokenEstimate: this.tokens.get(uri.toString()) ?? 0,
      live,
    });

    const pinned = [...this.pinned.values()].map((uri) => entry(uri, false));
    const activeUri = this.active;
    const active =
      activeUri === undefined || this.pinned.has(activeUri.toString())
        ? undefined
        : entry(activeUri, true);

    const files = active === undefined ? pinned : [...pinned, active];
    const totalTokens = files.reduce((sum, file) => sum + file.tokenEstimate, 0);

    return { task: this.task, active, pinned, totalTokens };
  }

  dispose(): void {
    this.changed.dispose();
  }
}
