import * as vscode from 'vscode';
import {
  resolveSettings,
  type PromptPackSettings,
  type ResolvedSettings,
} from '../core/settings-schema.js';

export const CONFIGURATION_SECTION = 'kapomPromptPack';

const KEYS: readonly string[] = [
  'includeExtensions',
  'ignorePatterns',
  'respectGitignore',
  'maxFileSizeKb',
  'tokenWarningThreshold',
  'includeProjectOverview',
  'secretGuard.enabled',
  'secretGuard.mode',
  'secretGuard.extraPatterns',
  'previewBeforeCopy',
  'scrubAbsolutePaths',
  'outputLanguage',
];

/**
 * Reads the raw values only. Validation lives in core/settings-schema.ts so it
 * can be tested without an Extension Host.
 *
 * `scope` should be the file or folder being packed, so a multi-root workspace
 * gets the folder's own settings rather than the first folder's.
 */
export function readSettings(scope?: vscode.Uri): ResolvedSettings {
  const configuration = vscode.workspace.getConfiguration(CONFIGURATION_SECTION, scope ?? null);
  const raw: Record<string, unknown> = {};

  for (const key of KEYS) {
    const inspected = configuration.inspect(key);

    // Only pass through values the user actually set. Anything untouched falls
    // back to the schema defaults in core, which stay the single source.
    if (inspected !== undefined && hasUserValue(inspected)) {
      raw[key] = configuration.get<unknown>(key);
    }
  }

  return resolveSettings(raw);
}

function hasUserValue(inspected: {
  readonly globalValue?: unknown;
  readonly workspaceValue?: unknown;
  readonly workspaceFolderValue?: unknown;
}): boolean {
  return (
    inspected.globalValue !== undefined ||
    inspected.workspaceValue !== undefined ||
    inspected.workspaceFolderValue !== undefined
  );
}

/**
 * Surfaces bad settings instead of quietly falling back, so a typo in
 * settings.json does not silently change what gets packed.
 */
export function reportSettingsProblems(problems: readonly string[]): void {
  if (problems.length === 0) {
    return;
  }

  const summary =
    problems.length === 1
      ? problems[0]
      : `${String(problems.length)} settings were ignored: ${problems.join('; ')}`;

  void vscode.window.showWarningMessage(`Kapom PromptPack — ${summary ?? ''}`);
}

export type { PromptPackSettings };
