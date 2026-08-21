import * as vscode from 'vscode';
import { readSettings, reportSettingsProblems } from '../config/settings.js';
import { collectFiles, pathSkipReason } from '../core/collector.js';
import { parseGitignore, type GitignoreRule } from '../core/gitignore.js';
import { scrubPaths } from '../core/path-scrubber.js';
import { decidePreview } from '../core/preview-policy.js';
import { renderPrompt } from '../core/renderer.js';
import { guardFiles } from '../core/secret-guard.js';
import {
  toFilterRules,
  toGuardOptions,
  type PromptPackSettings,
} from '../core/settings-schema.js';
import { formatTokenCount } from '../core/token-estimator.js';
import type { PackResult, PackSummary, SkippedFile, SourceFile } from '../core/types.js';
import { ClipboardProvider } from '../providers/clipboard-provider.js';
import { confirmPayload } from '../views/preview.js';
import { describeError, type PromptProvider } from '../providers/provider.js';
import {
  expandSelection,
  homeDirectory,
  readGitignore,
  readSourceFile,
  sizeOf,
  type WorkspaceFileEntry,
} from '../workspace/workspace-files.js';

export const PACK_FILES_COMMAND = 'kapomPromptPack.packFiles';

interface PackContext {
  readonly folder: vscode.WorkspaceFolder;
  readonly settings: PromptPackSettings;
  readonly gitignore: readonly GitignoreRule[];
}

/**
 * Turns a selection into a finished payload.
 *
 * This is the single road from files to the renderer, and every stage below is
 * in the order SECURITY.md rule 1 lays out. The guard sits last because
 * renderPrompt only accepts GuardedFile: there is no second path to add, and
 * no way to bypass this one.
 */
async function buildPayload(
  entries: readonly WorkspaceFileEntry[],
  context: PackContext,
): Promise<PackResult> {
  const { settings, folder } = context;
  const sources: SourceFile[] = [];
  const skipped: SkippedFile[] = [];

  for (const entry of entries) {
    const bytes = await sizeOf(entry.uri);

    if (settings.maxFileSizeKb > 0 && bytes > settings.maxFileSizeKb * 1024) {
      skipped.push({
        relativePath: entry.relativePath,
        reason: 'too-large',
        detail: `${String(Math.round(bytes / 1024))} KB`,
      });

      continue;
    }

    sources.push(await readSourceFile(entry));
  }

  const collected = collectFiles(sources, {
    ...toFilterRules(settings),
    ...(context.gitignore.length > 0 ? { gitignore: context.gitignore } : {}),
  });

  const scrubbed = settings.scrubAbsolutePaths
    ? collected.kept.map((file) => ({
        ...file,
        content: scrubPaths(file.content, {
          workspaceRoot: folder.uri.fsPath,
          ...(homeDirectory() === undefined ? {} : { homeDirectory: homeDirectory() ?? '' }),
        }),
      }))
    : collected.kept;

  const guarded = guardFiles(scrubbed, toGuardOptions(settings));

  return renderPrompt({
    workspaceName: folder.name,
    files: guarded.guarded,
    skipped: [...skipped, ...collected.skipped, ...guarded.skipped],
    language: settings.outputLanguage,
  });
}

function resolveSelection(
  uri: vscode.Uri | undefined,
  uris: readonly vscode.Uri[] | undefined,
): readonly vscode.Uri[] {
  if (uris !== undefined && uris.length > 0) {
    return uris;
  }

  if (uri !== undefined) {
    return [uri];
  }

  const active = vscode.window.activeTextEditor?.document.uri;

  return active === undefined ? [] : [active];
}

function summarise(result: PackResult): string {
  const { fileCount, totalTokens, redactionCount, skipped } = result.summary;
  const parts = [
    `${String(fileCount)} file(s)`,
    `~${formatTokenCount(totalTokens)} tokens`,
  ];

  if (redactionCount > 0) {
    parts.push(`${String(redactionCount)} redacted`);
  }

  if (skipped.length > 0) {
    parts.push(`${String(skipped.length)} skipped`);
  }

  return parts.join(' · ');
}

export interface PackDependencies {
  readonly provider?: PromptProvider;
  readonly statusBar?: { update(summary: PackSummary): void };
  /** Injectable so tests can approve or refuse without a real dialog. */
  readonly confirm?: (markdown: string, reasons: readonly string[]) => Promise<boolean>;
}

export async function packFiles(
  uri?: vscode.Uri,
  uris?: readonly vscode.Uri[],
  dependencies: PackDependencies = {},
): Promise<void> {
  const provider = dependencies.provider ?? new ClipboardProvider();
  const confirm = dependencies.confirm ?? confirmPayload;
  const selection = resolveSelection(uri, uris);

  if (selection.length === 0) {
    void vscode.window.showWarningMessage(
      'Kapom PromptPack — select files or a folder in the explorer first.',
    );

    return;
  }

  const first = selection[0];
  const folder = first === undefined ? undefined : vscode.workspace.getWorkspaceFolder(first);

  if (folder === undefined) {
    void vscode.window.showWarningMessage(
      'Kapom PromptPack — the selection is outside any open workspace folder.',
    );

    return;
  }

  const { settings, problems } = readSettings(folder.uri);

  reportSettingsProblems(problems);

  const gitignore = settings.respectGitignore
    ? parseGitignore(await readGitignore(folder))
    : [];
  const rules = {
    ...toFilterRules(settings),
    ...(gitignore.length > 0 ? { gitignore } : {}),
  };

  try {
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: 'Kapom PromptPack: packing' },
      async () => {
        const entries = await expandSelection(selection, {
          // Directories are judged on ignore rules only; an extension filter
          // would reject every folder name and prune the whole tree.
          shouldEnterDirectory: (path) =>
            pathSkipReason(path, { ...rules, includeExtensions: [] }) === undefined,
          shouldReadFile: (path) => pathSkipReason(path, rules) === undefined,
        });

        return buildPayload(entries, { folder, settings, gitignore });
      },
    );

    if (result.summary.fileCount === 0) {
      void vscode.window.showWarningMessage(
        'Kapom PromptPack — nothing left to pack after filtering. Check the ignore and extension settings.',
      );

      return;
    }

    const decision = decidePreview(settings.previewBeforeCopy, {
      totalTokens: result.summary.totalTokens,
      tokenWarningThreshold: settings.tokenWarningThreshold,
      redactionCount: result.summary.redactionCount,
      skippedCount: result.summary.skipped.length,
    });

    if (decision.required && !(await confirm(result.markdown, decision.reasons))) {
      void vscode.window.showInformationMessage(
        'Kapom PromptPack — cancelled. Nothing was copied.',
      );

      return;
    }

    const outcome = await provider.deliver({
      markdown: result.markdown,
      summary: result.summary,
    });

    if (outcome.status === 'failed') {
      void vscode.window.showErrorMessage(`Kapom PromptPack — ${outcome.reason}`);

      return;
    }

    if (outcome.status === 'cancelled') {
      return;
    }

    dependencies.statusBar?.update(result.summary);

    const message = `Kapom PromptPack — copied ${summarise(result)}`;

    if (decision.reasons.length > 0) {
      void vscode.window.showWarningMessage(`${message} · ${decision.reasons.join('; ')}`);

      return;
    }

    void vscode.window.showInformationMessage(message);
  } catch (cause) {
    void vscode.window.showErrorMessage(`Kapom PromptPack — ${describeError(cause)}`);
  }
}
