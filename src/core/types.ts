export type SecretGuardMode = 'redact' | 'skipFile';

export type PreviewPolicy = 'always' | 'onWarning' | 'never';

export interface SourceFile {
  readonly relativePath: string;
  readonly content: string;
  readonly sizeBytes: number;
}

export type SkipReason =
  | 'deny-list'
  | 'secret-content'
  | 'binary'
  | 'too-large'
  | 'extension-filter'
  | 'ignored';

export interface SkippedFile {
  readonly relativePath: string;
  readonly reason: SkipReason;
  readonly detail?: string;
}

export interface Redaction {
  readonly line: number;
  readonly rule: string;
}

/**
 * A file that has already cleared the secret guard.
 *
 * The brand is a unique symbol that is never exported, so no other module can
 * build an object literal satisfying GuardedFile. The only way in is
 * markGuarded(), which makes "the guard is the last stage and cannot be
 * bypassed" a compiler rule rather than a matter of discipline.
 */
declare const guardedBrand: unique symbol;

export interface GuardedFile {
  readonly [guardedBrand]: true;
  readonly relativePath: string;
  readonly content: string;
  readonly redactions: readonly Redaction[];
}

/** Callable from core/secret-guard.ts only; enforced by ESLint. */
export function markGuarded(file: Omit<GuardedFile, typeof guardedBrand>): GuardedFile {
  return file as GuardedFile;
}

export interface RenderFile {
  readonly relativePath: string;
  readonly content: string;
  readonly languageTag: string;
  readonly tokenEstimate: number;
  readonly redactions: readonly Redaction[];
}

export interface PackSummary {
  readonly workspaceName: string;
  readonly fileCount: number;
  readonly totalTokens: number;
  readonly redactionCount: number;
  readonly skipped: readonly SkippedFile[];
}

export interface PackResult {
  readonly markdown: string;
  readonly summary: PackSummary;
}
