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
 * ไฟล์ที่ผ่าน secret guard มาแล้วเท่านั้น
 *
 * brand เป็น unique symbol ที่ไม่ export ออกไป โมดูลอื่นจึงสร้าง object literal
 * ที่เป็น GuardedFile เองไม่ได้ ต้องผ่าน markGuarded() เท่านั้น —
 * เป็นการบังคับ SECURITY.md กฎที่ 1 ด้วย type system ไม่ใช่ด้วยวินัย
 */
declare const guardedBrand: unique symbol;

export interface GuardedFile {
  readonly [guardedBrand]: true;
  readonly relativePath: string;
  readonly content: string;
  readonly redactions: readonly Redaction[];
}

/** เรียกได้จาก core/secret-guard.ts เท่านั้น — ESLint บังคับไว้ */
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
