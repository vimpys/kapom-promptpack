import {
  markGuarded,
  type GuardedFile,
  type Redaction,
  type SecretGuardMode,
  type SkippedFile,
  type SourceFile,
} from './types.js';

export interface GuardOptions {
  readonly mode: SecretGuardMode;
  readonly extraPatterns?: readonly string[];
  /**
   * Turning this off skips the per-line scan only. The deny list still runs:
   * no setting may hand a .env or a private key to a chat window.
   */
  readonly contentScanning?: boolean;
}

export interface GuardOutcome {
  readonly guarded: readonly GuardedFile[];
  readonly skipped: readonly SkippedFile[];
}

interface NamedPattern {
  readonly rule: string;
  readonly pattern: RegExp;
}

/**
 * File names that never reach the payload, whatever the mode and however the
 * file was selected. Picking one of these by hand in the explorer still skips
 * it, because the guard runs after selection rather than before.
 */
const DENY_LIST: readonly NamedPattern[] = [
  { rule: 'dotenv', pattern: /^\.env(\..+)?$/iu },
  { rule: 'key-material', pattern: /\.(pem|key|p12|pfx|keystore|jks)$/iu },
  { rule: 'secrets-file', pattern: /^secrets/iu },
  { rule: 'credentials-file', pattern: /^credentials/iu },
  { rule: 'ssh-private-key', pattern: /^id_(rsa|dsa|ecdsa|ed25519)$/iu },
];

interface ContentRule extends NamedPattern {
  readonly isSecret?: (value: string) => boolean;
}

const NON_SECRET_LITERALS = new Set([
  'null',
  'true',
  'false',
  'undefined',
  'none',
  'nil',
  // Type annotations. `token: string` in an interface is a declaration, not a
  // credential, and mangling those would wreck most TypeScript files.
  'string',
  'number',
  'boolean',
  'object',
  'symbol',
  'bigint',
  'unknown',
  'never',
  'void',
  'date',
  'buffer',
  'promise',
  'array',
  'record',
  'readonly',
]);

/**
 * An unquoted value counts as a secret only when it looks like an opaque
 * string rather than an expression. Without this check a line such as
 * `const token = req.headers.authorization` would be redacted and the model
 * would lose the meaning of the code.
 */
function looksLikeBareSecret(value: string): boolean {
  if (value.length < 6) {
    return false;
  }

  if (NON_SECRET_LITERALS.has(value.toLowerCase())) {
    return false;
  }

  return !/[.()[\]${}<>]/u.test(value);
}

/**
 * Used where the secret word sits in the middle of a longer name
 * (`DJANGO_SECRET_KEY`, but also `tokens_used`). A bare number there is far
 * more likely a count, port or timestamp than a credential, so it is left
 * alone. A quoted number is still treated as a secret.
 */
function looksLikeBareSecretInCompoundKey(value: string): boolean {
  return looksLikeBareSecret(value) && !/^\d+$/u.test(value);
}

/**
 * `\b` is the wrong boundary here. An underscore is a word character, so
 * `\bpassword` never matches inside `db_password`, and the snake_case shapes
 * that carry most real secrets (`DJANGO_SECRET_KEY`, `JWT_SECRET`,
 * `aws_secret_access_key`) slipped straight through. Anything that is not
 * alphanumeric counts as a separator instead.
 */
const KEY_BOUNDARY = '(?<![A-Za-z0-9])';

/**
 * The key is exactly a secret word, with nothing joined to either side:
 * `password = ...`, `"token": ...`. A bare number here is taken at face value,
 * because `password = 123456` really is a password.
 */
const EXACT_KEY_PREFIX = '(?<![A-Za-z0-9_-])';
const EXACT_KEY_SUFFIX = '(?![A-Za-z0-9_-])';

/**
 * The secret word is part of a longer name, on either side: `max_tokens`,
 * `token_count`, `DJANGO_SECRET_KEY`. Numbers get the benefit of the doubt
 * here (see looksLikeBareSecretInCompoundKey).
 */
const COMPOUND_SEGMENTS = '(?:[_-][A-Za-z0-9]+)*';

const SECRET_KEYS = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'api[_-]?key',
  'apikey',
  'access[_-]?key',
  'account[_-]?key',
  'shared[_-]?access[_-]?key',
  'client[_-]?secret',
  'auth[_-]?token',
  'refresh[_-]?token',
  'private[_-]?key',
  'encryption[_-]?key',
  'signing[_-]?key',
  'authorization',
  'credential',
].join('|');

/**
 * camelCase needs its own pass: `dbPassword` has no non-alphanumeric separator
 * for KEY_BOUNDARY to find. Matching is case sensitive here on purpose, so the
 * capitalised form is what marks the start of the key.
 */
const CAMEL_SECRET_KEYS = [
  'Password',
  'Passwd',
  'Pwd',
  'Secret',
  'Token',
  'ApiKey',
  'AccessKey',
  'AccountKey',
  'PrivateKey',
  'Credential',
  'Authorization',
].join('|');

const EXACT_KEY = `${EXACT_KEY_PREFIX}(?:${SECRET_KEYS})s?${EXACT_KEY_SUFFIX}`;
const COMPOUND_KEY = `${KEY_BOUNDARY}(?:${SECRET_KEYS})s?${COMPOUND_SEGMENTS}`;

const CONTENT_RULES: readonly ContentRule[] = [
  { rule: 'aws-access-key', pattern: /\b(AKIA[0-9A-Z]{16})\b/gu },
  { rule: 'openai-key', pattern: /\b(sk-[A-Za-z0-9_-]{16,})/gu },
  { rule: 'github-token', pattern: /\b((?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,})/gu },
  { rule: 'github-pat', pattern: /\b(github_pat_[A-Za-z0-9_]{20,})/gu },
  { rule: 'google-api-key', pattern: /\b(AIza[0-9A-Za-z_-]{35})/gu },
  { rule: 'slack-token', pattern: /\b(xox[baprs]-[A-Za-z0-9-]{10,})/gu },
  {
    rule: 'jwt',
    pattern: /\b(eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/gu,
  },
  {
    rule: 'connection-string',
    pattern: /\b((?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqps?):\/\/[^\s"'<>]+)/giu,
  },
  {
    rule: 'connection-string-password',
    pattern: new RegExp(`${KEY_BOUNDARY}(?:password|pwd)\\s*=\\s*([^;"'\\s]+)`, 'giu'),
    isSecret: looksLikeBareSecret,
  },
  // Basic auth credentials embedded in an http(s) URL. The database schemes are
  // already covered above, but an internal service URL is just as sensitive.
  {
    rule: 'url-basic-auth',
    pattern: /(?<=https?:\/\/[^\s:@"'<>]{1,128}:)([^\s@"'<>]+)(?=@)/giu,
  },
  {
    rule: 'bearer-token',
    pattern: /(?<![A-Za-z0-9])Bearer\s+([A-Za-z0-9._~+/=-]{8,})/giu,
  },
  {
    rule: 'basic-auth-header',
    pattern: /(?<![A-Za-z0-9])Basic\s+([A-Za-z0-9+/=]{8,})/giu,
  },
  // The optional quote after the key matters: `"password": "x"` in JSON is the
  // single most common shape this guard has to catch.
  {
    rule: 'assigned-secret',
    pattern: new RegExp(`${EXACT_KEY}["']?\\s*[:=]\\s*["']([^"']+)["']`, 'giu'),
  },
  {
    rule: 'assigned-secret',
    pattern: new RegExp(`${EXACT_KEY}["']?\\s*[:=]\\s*([^\\s,;)"']+)`, 'giu'),
    isSecret: looksLikeBareSecret,
  },
  // The secret word can sit anywhere inside a longer name: `DJANGO_SECRET_KEY`,
  // `aws_secret_access_key`, `max_tokens`. Without consuming the surrounding
  // segments the `[:=]` never lines up and the whole line is missed.
  {
    rule: 'assigned-secret',
    pattern: new RegExp(`${COMPOUND_KEY}["']?\\s*[:=]\\s*["']([^"']+)["']`, 'giu'),
  },
  {
    rule: 'assigned-secret',
    pattern: new RegExp(`${COMPOUND_KEY}["']?\\s*[:=]\\s*([^\\s,;)"']+)`, 'giu'),
    isSecret: looksLikeBareSecretInCompoundKey,
  },
  {
    rule: 'assigned-secret',
    pattern: new RegExp(`(?<=[a-z])(?:${CAMEL_SECRET_KEYS})s?["']?\\s*[:=]\\s*["']([^"']+)["']`, 'gu'),
  },
  {
    rule: 'assigned-secret',
    pattern: new RegExp(`(?<=[a-z])(?:${CAMEL_SECRET_KEYS})s?["']?\\s*[:=]\\s*([^\\s,;)"']+)`, 'gu'),
    isSecret: looksLikeBareSecretInCompoundKey,
  },
];

const PRIVATE_KEY_BEGIN = /-----BEGIN [A-Z ]*PRIVATE KEY-----/u;
const PRIVATE_KEY_END = /-----END [A-Z ]*PRIVATE KEY-----/u;

const PLACEHOLDER_PREFIX = '<REDACTED:';

function placeholder(rule: string): string {
  return `${PLACEHOLDER_PREFIX}${rule}>`;
}

function baseName(relativePath: string): string {
  const parts = relativePath.split(/[/\\]/u);

  return parts[parts.length - 1] ?? relativePath;
}

function compileExtraPatterns(patterns: readonly string[]): readonly ContentRule[] {
  return patterns.map((source, index) => {
    try {
      return { rule: `custom-${String(index + 1)}`, pattern: new RegExp(source, 'gu') };
    } catch (cause) {
      throw new Error(
        `secretGuard.extraPatterns[${String(index)}] is not a valid regular expression: ${source}`,
        { cause },
      );
    }
  });
}

interface AppliedRule {
  readonly text: string;
  readonly hit: boolean;
}

/** Replaces the captured value in place, leaving the surrounding text intact. */
function applyRule(line: string, rule: ContentRule): AppliedRule {
  let hit = false;

  const text = line.replace(rule.pattern, (match: string, ...rest: unknown[]): string => {
    const captured = rest[0];
    const value = typeof captured === 'string' ? captured : match;

    // Rules overlap by design, so a later rule will happily match the
    // placeholder an earlier one just wrote. Masking a mask changes nothing on
    // screen but inflates the count the user is shown.
    if (value.startsWith(PLACEHOLDER_PREFIX)) {
      return match;
    }

    if (rule.isSecret !== undefined && !rule.isSecret(value)) {
      return match;
    }

    hit = true;

    const at = match.lastIndexOf(value);

    if (at < 0) {
      return placeholder(rule.rule);
    }

    return match.slice(0, at) + placeholder(rule.rule) + match.slice(at + value.length);
  });

  return { text, hit };
}

interface RedactedContent {
  readonly content: string;
  readonly redactions: readonly Redaction[];
}

/**
 * Redacts secrets line by line. The line count never changes, so any line
 * number the model quotes back still lines up with the real file.
 */
function redactContent(content: string, extraRules: readonly ContentRule[]): RedactedContent {
  const rules = [...CONTENT_RULES, ...extraRules];
  const redactions: Redaction[] = [];
  const output: string[] = [];
  let insidePrivateKey = false;

  content.split('\n').forEach((raw, index) => {
    const hasCarriageReturn = raw.endsWith('\r');
    const line = hasCarriageReturn ? raw.slice(0, -1) : raw;
    const lineNumber = index + 1;
    const emit = (text: string): void => {
      output.push(hasCarriageReturn ? `${text}\r` : text);
    };

    if (insidePrivateKey) {
      redactions.push({ line: lineNumber, rule: 'private-key' });
      insidePrivateKey = !PRIVATE_KEY_END.test(line);
      emit(placeholder('private-key'));

      return;
    }

    if (PRIVATE_KEY_BEGIN.test(line)) {
      insidePrivateKey = !PRIVATE_KEY_END.test(line);
      redactions.push({ line: lineNumber, rule: 'private-key' });
      emit(placeholder('private-key'));

      return;
    }

    let text = line;
    const firedOnThisLine = new Set<string>();

    for (const rule of rules) {
      const applied = applyRule(text, rule);

      text = applied.text;

      // Several rules can describe the same secret. Report it once per line.
      if (applied.hit && !firedOnThisLine.has(rule.rule)) {
        firedOnThisLine.add(rule.rule);
        redactions.push({ line: lineNumber, rule: rule.rule });
      }
    }

    emit(text);
  });

  return { content: output.join('\n'), redactions };
}

/**
 * The only way to produce a GuardedFile.
 *
 * Every file bound for the renderer passes through here, whichever entry point
 * selected it, and nothing downstream can opt out.
 */
export function guardFiles(files: readonly SourceFile[], options: GuardOptions): GuardOutcome {
  const extraRules = compileExtraPatterns(options.extraPatterns ?? []);
  const guarded: GuardedFile[] = [];
  const skipped: SkippedFile[] = [];

  for (const file of files) {
    const denied = DENY_LIST.find((entry) => entry.pattern.test(baseName(file.relativePath)));

    if (denied !== undefined) {
      skipped.push({
        relativePath: file.relativePath,
        reason: 'deny-list',
        detail: denied.rule,
      });

      continue;
    }

    const { content, redactions } =
      options.contentScanning === false
        ? { content: file.content, redactions: [] as readonly Redaction[] }
        : redactContent(file.content, extraRules);

    if (options.mode === 'skipFile' && redactions.length > 0) {
      skipped.push({
        relativePath: file.relativePath,
        reason: 'secret-content',
        detail: [...new Set(redactions.map((entry) => entry.rule))].join(', '),
      });

      continue;
    }

    guarded.push(markGuarded({ relativePath: file.relativePath, content, redactions }));
  }

  return { guarded, skipped };
}
