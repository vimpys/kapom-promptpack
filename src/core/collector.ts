import { isIgnored, type GitignoreRule } from './gitignore.js';
import type { SkipReason, SkippedFile, SourceFile } from './types.js';

export interface FilterRules {
  /** Extensions without the dot. An empty list means every extension is fine. */
  readonly includeExtensions: readonly string[];
  /** Directory names or globs, matched against any segment of the path. */
  readonly ignorePatterns: readonly string[];
  readonly maxFileSizeKb: number;
  readonly gitignore?: readonly GitignoreRule[];
}

export interface FilterOutcome {
  readonly kept: readonly SourceFile[];
  readonly skipped: readonly SkippedFile[];
}

const REGEXP_SPECIAL = /[.+^${}()|[\]\\]/gu;
const BINARY_SAMPLE_CHARS = 8000;
// Written as escapes on purpose: a literal NUL would make this very file
// register as binary to grep, git diff and most editors.
const NUL = '\u0000';
const REPLACEMENT_CHAR = '\uFFFD';
const REPLACEMENT_RATIO_LIMIT = 0.1;

function toSegmentPattern(glob: string): RegExp {
  const body = glob
    .replace(/\/+$/u, '')
    .replace(REGEXP_SPECIAL, '\\$&')
    .replace(/\*/gu, '[^/]*')
    .replace(/\?/gu, '[^/]');

  return new RegExp(`^${body}$`, 'iu');
}

function segmentsOf(relativePath: string): readonly string[] {
  return relativePath.split(/[/\\]/u).filter((segment) => segment.length > 0);
}

function extensionOf(relativePath: string): string {
  const segments = segmentsOf(relativePath);
  const name = segments[segments.length - 1] ?? relativePath;
  const dot = name.lastIndexOf('.');

  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * Detects content that would be noise in a prompt.
 *
 * A decoded binary file gives itself away twice over: embedded NUL characters,
 * and a scattering of U+FFFD left behind wherever the UTF-8 decoder gave up.
 */
export function looksBinary(content: string): boolean {
  const sample = content.slice(0, BINARY_SAMPLE_CHARS);

  if (sample.includes(NUL)) {
    return true;
  }

  if (sample.length === 0) {
    return false;
  }

  let replacements = 0;

  for (const char of sample) {
    if (char === REPLACEMENT_CHAR) {
      replacements += 1;
    }
  }

  return replacements / sample.length > REPLACEMENT_RATIO_LIMIT;
}

/**
 * Path-only verdict, so callers can drop a file before spending a read on it.
 * Returns the reason to skip, or undefined when the path is worth reading.
 */
export function pathSkipReason(
  relativePath: string,
  rules: FilterRules,
): SkipReason | undefined {
  const segments = segmentsOf(relativePath);

  for (const glob of rules.ignorePatterns) {
    const pattern = toSegmentPattern(glob);

    if (segments.some((segment) => pattern.test(segment))) {
      return 'ignored';
    }
  }

  if (rules.gitignore !== undefined && isIgnored(relativePath, rules.gitignore)) {
    return 'ignored';
  }

  if (rules.includeExtensions.length > 0) {
    const extension = extensionOf(relativePath);
    const allowed = rules.includeExtensions.some(
      (candidate) => candidate.replace(/^\./u, '').toLowerCase() === extension,
    );

    if (!allowed) {
      return 'extension-filter';
    }
  }

  return undefined;
}

function sizeSkipReason(file: SourceFile, rules: FilterRules): SkipReason | undefined {
  if (rules.maxFileSizeKb <= 0) {
    return undefined;
  }

  return file.sizeBytes > rules.maxFileSizeKb * 1024 ? 'too-large' : undefined;
}

/**
 * Applies every filter that comes before the secret guard.
 *
 * Order is cheapest first: path rules, then size, then a look at the content.
 * Nothing here is a security control — the guard runs after this and overrides
 * whatever survives.
 */
export function collectFiles(
  candidates: readonly SourceFile[],
  rules: FilterRules,
): FilterOutcome {
  const kept: SourceFile[] = [];
  const skipped: SkippedFile[] = [];

  for (const file of candidates) {
    const pathReason = pathSkipReason(file.relativePath, rules);

    if (pathReason !== undefined) {
      skipped.push({ relativePath: file.relativePath, reason: pathReason });

      continue;
    }

    const sizeReason = sizeSkipReason(file, rules);

    if (sizeReason !== undefined) {
      skipped.push({
        relativePath: file.relativePath,
        reason: sizeReason,
        detail: `${String(Math.round(file.sizeBytes / 1024))} KB`,
      });

      continue;
    }

    if (looksBinary(file.content)) {
      skipped.push({ relativePath: file.relativePath, reason: 'binary' });

      continue;
    }

    kept.push(file);
  }

  return { kept, skipped };
}
