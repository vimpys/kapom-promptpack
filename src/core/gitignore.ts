export interface GitignoreRule {
  readonly negated: boolean;
  readonly directoryOnly: boolean;
  readonly pattern: RegExp;
}

const REGEXP_SPECIAL = /[.+^${}()|[\]\\]/gu;

function escapeLiteral(value: string): string {
  return value.replace(REGEXP_SPECIAL, '\\$&');
}

/**
 * Translates one gitignore glob into a regular expression.
 *
 * `*` deliberately stops at a slash while `**` crosses directories, which is
 * the distinction the format is built on.
 */
function globToRegExp(glob: string, anchored: boolean): RegExp {
  let body = '';
  let index = 0;

  while (index < glob.length) {
    const char = glob[index];

    if (char === '*') {
      const isDouble = glob[index + 1] === '*';

      if (isDouble) {
        const followedBySlash = glob[index + 2] === '/';

        body += followedBySlash ? '(?:.*/)?' : '.*';
        index += followedBySlash ? 3 : 2;

        continue;
      }

      body += '[^/]*';
      index += 1;

      continue;
    }

    if (char === '?') {
      body += '[^/]';
      index += 1;

      continue;
    }

    body += escapeLiteral(char ?? '');
    index += 1;
  }

  const prefix = anchored ? '^' : '^(?:.*/)?';

  return new RegExp(`${prefix}${body}$`, 'u');
}

/**
 * Parses the contents of a .gitignore file. Order is preserved because the
 * last rule that matches decides, which is what makes `!` re-inclusion work.
 */
export function parseGitignore(text: string): readonly GitignoreRule[] {
  const rules: GitignoreRule[] = [];

  for (const rawLine of text.split(/\r?\n/u)) {
    let line = rawLine.replace(/(?<!\\)\s+$/u, '');

    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }

    const negated = line.startsWith('!');

    if (negated) {
      line = line.slice(1);
    }

    if (line.startsWith('\\')) {
      line = line.slice(1);
    }

    const directoryOnly = line.endsWith('/');

    if (directoryOnly) {
      line = line.slice(0, -1);
    }

    const anchored = line.includes('/');

    if (line.startsWith('/')) {
      line = line.slice(1);
    }

    if (line.length === 0) {
      continue;
    }

    rules.push({ negated, directoryOnly, pattern: globToRegExp(line, anchored) });
  }

  return rules;
}

function normalise(relativePath: string): string {
  return relativePath.replace(/\\/gu, '/').replace(/^\.\//u, '').replace(/^\/+/u, '');
}

function decide(path: string, isDirectory: boolean, rules: readonly GitignoreRule[]): boolean {
  let ignored = false;

  for (const rule of rules) {
    if (rule.directoryOnly && !isDirectory) {
      continue;
    }

    if (rule.pattern.test(path)) {
      ignored = !rule.negated;
    }
  }

  return ignored;
}

/**
 * Reports whether git would ignore this path.
 *
 * Ancestors are checked first and win outright: git cannot re-include a file
 * whose parent directory is excluded, so a later `!` rule must not resurrect
 * it either.
 */
export function isIgnored(relativePath: string, rules: readonly GitignoreRule[]): boolean {
  if (rules.length === 0) {
    return false;
  }

  const path = normalise(relativePath);
  const segments = path.split('/');

  for (let depth = 1; depth < segments.length; depth += 1) {
    if (decide(segments.slice(0, depth).join('/'), true, rules)) {
      return true;
    }
  }

  return decide(path, false, rules);
}
