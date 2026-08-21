import { isIgnored, type GitignoreRule } from './gitignore.js';
import { extensionOf, segmentsOf } from './path-utils.js';
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
// Built with fromCharCode rather than written literally: a raw NUL in the
// source would make this very file register as binary to grep and git.
const NUL = String.fromCharCode(0);
const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);
const REPLACEMENT_RATIO_LIMIT = 0.1;

/**
 * Compiled globs are cached because pathSkipReason runs once per file *and*
 * once per directory while walking a tree. Rebuilding the same handful of
 * patterns for every path was costing roughly five times the filter step
 * itself, measured over 20,000 paths.
 */
const segmentPatterns = new Map<string, RegExp>();

function toSegmentPattern(glob: string): RegExp {
  const cached = segmentPatterns.get(glob);

  if (cached !== undefined) {
    return cached;
  }

  const body = glob
    .replace(/\/+$/u, '')
    .replace(REGEXP_SPECIAL, '\\$&')
    .replace(/\*/gu, '[^/]*')
    .replace(/\?/gu, '[^/]');
  const pattern = new RegExp(`^${body}$`, 'iu');

  segmentPatterns.set(glob, pattern);

  return pattern;
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

/** Shared with the command layer, which checks size before spending a read. */
export function exceedsSizeLimit(sizeBytes: number, maxFileSizeKb: number): boolean {
  return maxFileSizeKb > 0 && sizeBytes > maxFileSizeKb * 1024;
}

export function describeSize(sizeBytes: number): string {
  return `${String(Math.round(sizeBytes / 1024))} KB`;
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

    if (exceedsSizeLimit(file.sizeBytes, rules.maxFileSizeKb)) {
      skipped.push({
        relativePath: file.relativePath,
        reason: 'too-large',
        detail: describeSize(file.sizeBytes),
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
