import * as vscode from 'vscode';
import type { SourceFile } from '../core/types.js';

export interface WorkspaceFileEntry {
  readonly uri: vscode.Uri;
  readonly relativePath: string;
}

export interface WalkPredicates {
  /** Pruning a directory here avoids descending into it at all. */
  readonly shouldEnterDirectory: (relativePath: string) => boolean;
  readonly shouldReadFile: (relativePath: string) => boolean;
}

const decoder = new TextDecoder();

function relativePathOf(uri: vscode.Uri): string {
  return vscode.workspace.asRelativePath(uri, false).replace(/\\/gu, '/');
}

/**
 * Expands a selection into concrete files.
 *
 * Directories are pruned on the way down rather than filtered afterwards: not
 * walking node_modules at all is the difference between a snappy command and
 * one that stalls on a big repo.
 */
export async function expandSelection(
  selection: readonly vscode.Uri[],
  predicates: WalkPredicates,
): Promise<readonly WorkspaceFileEntry[]> {
  const found = new Map<string, WorkspaceFileEntry>();

  const visit = async (uri: vscode.Uri, isKnownDirectory: boolean): Promise<void> => {
    const relativePath = relativePathOf(uri);
    const type = isKnownDirectory
      ? vscode.FileType.Directory
      : (await vscode.workspace.fs.stat(uri)).type;

    if (type === vscode.FileType.Directory) {
      if (!predicates.shouldEnterDirectory(relativePath)) {
        return;
      }

      const children = await vscode.workspace.fs.readDirectory(uri);

      for (const [name, childType] of children) {
        const child = vscode.Uri.joinPath(uri, name);

        if (childType === vscode.FileType.Directory) {
          await visit(child, true);
        } else if (childType === vscode.FileType.File) {
          await visit(child, false);
        }
      }

      return;
    }

    if (type !== vscode.FileType.File || !predicates.shouldReadFile(relativePath)) {
      return;
    }

    found.set(uri.toString(), { uri, relativePath });
  };

  for (const uri of selection) {
    await visit(uri, false);
  }

  return [...found.values()];
}

export async function sizeOf(uri: vscode.Uri): Promise<number> {
  return (await vscode.workspace.fs.stat(uri)).size;
}

/**
 * Reads a file as text. Binary content decodes into U+FFFD runs, which the
 * collector recognises, so nothing needs to guess from the extension alone.
 */
export async function readSourceFile(entry: WorkspaceFileEntry): Promise<SourceFile> {
  const bytes = await vscode.workspace.fs.readFile(entry.uri);

  return {
    relativePath: entry.relativePath,
    content: decoder.decode(bytes),
    sizeBytes: bytes.byteLength,
  };
}

export async function readGitignore(folder: vscode.WorkspaceFolder): Promise<string> {
  try {
    const bytes = await vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(folder.uri, '.gitignore'),
    );

    return decoder.decode(bytes);
  } catch {
    // A missing .gitignore is the normal case, not a failure worth reporting.
    return '';
  }
}

/**
 * The home directory as the extension host sees it, which over Remote SSH is
 * the remote home rather than the local one. Read from the environment instead
 * of node:os so a future web build does not break on the import.
 */
export function homeDirectory(): string | undefined {
  const home = process.env['HOME'] ?? process.env['USERPROFILE'];

  return home === undefined || home.length === 0 ? undefined : home;
}
