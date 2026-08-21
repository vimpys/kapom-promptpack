import type { FilterRules } from './collector.js';
import type { GuardOptions } from './secret-guard.js';
import type { OutputLanguage, PreviewPolicy, SecretGuardMode } from './types.js';

export interface PromptPackSettings {
  readonly includeExtensions: readonly string[];
  readonly ignorePatterns: readonly string[];
  readonly respectGitignore: boolean;
  readonly maxFileSizeKb: number;
  readonly tokenWarningThreshold: number;
  readonly includeProjectOverview: boolean;
  readonly secretGuardEnabled: boolean;
  readonly secretGuardMode: SecretGuardMode;
  readonly secretGuardExtraPatterns: readonly string[];
  readonly previewBeforeCopy: PreviewPolicy;
  readonly scrubAbsolutePaths: boolean;
  readonly outputLanguage: OutputLanguage;
}

export interface ResolvedSettings {
  readonly settings: PromptPackSettings;
  /** One entry per value that was rejected. Never swallowed silently. */
  readonly problems: readonly string[];
}

export const DEFAULT_SETTINGS: PromptPackSettings = {
  includeExtensions: [
    'ts',
    'tsx',
    'vue',
    'js',
    'jsx',
    'json',
    'css',
    'scss',
    'sql',
    'cs',
    'md',
  ],
  ignorePatterns: ['node_modules', 'dist', 'build', 'out', 'coverage', '.git'],
  respectGitignore: true,
  maxFileSizeKb: 200,
  tokenWarningThreshold: 100000,
  includeProjectOverview: true,
  secretGuardEnabled: true,
  secretGuardMode: 'redact',
  secretGuardExtraPatterns: [],
  previewBeforeCopy: 'onWarning',
  scrubAbsolutePaths: true,
  outputLanguage: 'th',
};

const GUARD_MODES: readonly SecretGuardMode[] = ['redact', 'skipFile'];
const PREVIEW_POLICIES: readonly PreviewPolicy[] = ['always', 'onWarning', 'never'];
const OUTPUT_LANGUAGES: readonly OutputLanguage[] = ['th', 'en'];

class Reader {
  private readonly raw: Readonly<Record<string, unknown>>;

  readonly problems: string[] = [];

  constructor(raw: Readonly<Record<string, unknown>>) {
    this.raw = raw;
  }

  private reject(key: string, value: unknown, expected: string, fallback: unknown): void {
    this.problems.push(
      `${key}: expected ${expected} but found ${JSON.stringify(value)}; using ${JSON.stringify(fallback)}`,
    );
  }

  boolean(key: string, fallback: boolean): boolean {
    const value = this.raw[key];

    if (value === undefined) {
      return fallback;
    }

    if (typeof value !== 'boolean') {
      this.reject(key, value, 'a boolean', fallback);

      return fallback;
    }

    return value;
  }

  /** Rejects NaN and negatives, which would silently disable the limits. */
  number(key: string, fallback: number, minimum: number): number {
    const value = this.raw[key];

    if (value === undefined) {
      return fallback;
    }

    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
      this.reject(key, value, `a number >= ${String(minimum)}`, fallback);

      return fallback;
    }

    return value;
  }

  stringArray(key: string, fallback: readonly string[]): readonly string[] {
    const value = this.raw[key];

    if (value === undefined) {
      return fallback;
    }

    if (!Array.isArray(value)) {
      this.reject(key, value, 'an array of strings', fallback);

      return fallback;
    }

    const entries = value.filter((entry): entry is string => typeof entry === 'string');

    if (entries.length !== value.length) {
      this.problems.push(`${key}: ignored ${String(value.length - entries.length)} non-string entr(ies)`);
    }

    return entries.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  }

  choice<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
    const value = this.raw[key];

    if (value === undefined) {
      return fallback;
    }

    const match = allowed.find((option) => option === value);

    if (match === undefined) {
      this.reject(key, value, `one of ${allowed.join(' | ')}`, fallback);

      return fallback;
    }

    return match;
  }
}

/**
 * Turns whatever the user put in settings.json into values the core can trust.
 *
 * Everything here arrives as `unknown` on purpose: VS Code hands back what the
 * JSON contained, not what the schema promised, and a hand-edited settings
 * file is the normal case rather than the exception.
 */
export function resolveSettings(raw: Readonly<Record<string, unknown>>): ResolvedSettings {
  const reader = new Reader(raw);
  const defaults = DEFAULT_SETTINGS;

  const settings: PromptPackSettings = {
    includeExtensions: reader.stringArray('includeExtensions', defaults.includeExtensions),
    ignorePatterns: reader.stringArray('ignorePatterns', defaults.ignorePatterns),
    respectGitignore: reader.boolean('respectGitignore', defaults.respectGitignore),
    maxFileSizeKb: reader.number('maxFileSizeKb', defaults.maxFileSizeKb, 0),
    tokenWarningThreshold: reader.number(
      'tokenWarningThreshold',
      defaults.tokenWarningThreshold,
      0,
    ),
    includeProjectOverview: reader.boolean(
      'includeProjectOverview',
      defaults.includeProjectOverview,
    ),
    secretGuardEnabled: reader.boolean('secretGuard.enabled', defaults.secretGuardEnabled),
    secretGuardMode: reader.choice('secretGuard.mode', GUARD_MODES, defaults.secretGuardMode),
    secretGuardExtraPatterns: reader.stringArray(
      'secretGuard.extraPatterns',
      defaults.secretGuardExtraPatterns,
    ),
    previewBeforeCopy: reader.choice(
      'previewBeforeCopy',
      PREVIEW_POLICIES,
      defaults.previewBeforeCopy,
    ),
    scrubAbsolutePaths: reader.boolean('scrubAbsolutePaths', defaults.scrubAbsolutePaths),
    outputLanguage: reader.choice('outputLanguage', OUTPUT_LANGUAGES, defaults.outputLanguage),
  };

  return { settings, problems: reader.problems };
}

export function toFilterRules(settings: PromptPackSettings): FilterRules {
  return {
    includeExtensions: settings.includeExtensions,
    ignorePatterns: settings.ignorePatterns,
    maxFileSizeKb: settings.maxFileSizeKb,
  };
}

/**
 * `secretGuard.enabled: false` only turns off *content* scanning. The deny
 * list keeps running, because SECURITY.md rule 1 says no setting may hand a
 * .env or a private key to a chat window.
 */
export function toGuardOptions(settings: PromptPackSettings): GuardOptions {
  if (!settings.secretGuardEnabled) {
    return { mode: 'redact', extraPatterns: [], contentScanning: false };
  }

  return {
    mode: settings.secretGuardMode,
    extraPatterns: settings.secretGuardExtraPatterns,
    contentScanning: true,
  };
}
