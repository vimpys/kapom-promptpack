export interface ScrubOptions {
  /** Absolute path to the user's home directory, replaced with `~`. */
  readonly homeDirectory?: string;
  /** Absolute path to the workspace root, replaced with `.`. */
  readonly workspaceRoot?: string;
}

/**
 * A root shorter than this is refused. Replacing `/` or `C:\` would rewrite
 * every path in the payload instead of just the private prefix.
 */
const MIN_ROOT_LENGTH = 4;

const SEPARATOR = /[/\\]+/u;
const TRAILING_SEPARATOR = /[/\\]+$/u;
const REGEXP_SPECIAL = /[.*+?^${}()|[\]\\]/gu;

function escapeRegExp(value: string): string {
  return value.replace(REGEXP_SPECIAL, '\\$&');
}

/**
 * Builds a matcher that accepts any separator style, so a single root matches
 * `C:\Users\me`, `C:/Users/me`, and the `C:\\Users\\me` form that shows up
 * inside JSON string literals.
 */
function toRootPattern(root: string): RegExp | undefined {
  const trimmed = root.replace(TRAILING_SEPARATOR, '');

  if (trimmed.length < MIN_ROOT_LENGTH) {
    return undefined;
  }

  const body = trimmed.split(SEPARATOR).map(escapeRegExp).join('[/\\\\]+');

  return new RegExp(body, 'giu');
}

/**
 * Strips absolute paths out of file *content*.
 *
 * Rendering already keeps headings relative, but the bytes inside a file
 * routinely carry absolute paths — committed logs, config, comments, stack
 * traces in fixtures — and on Windows those contain the account name.
 *
 * The workspace root is replaced first because it usually sits inside the home
 * directory; going the other way would leave `~/Projects/app/src/a.ts` where a
 * plain `./src/a.ts` was wanted. Only the matched prefix changes, so whatever
 * separator style the rest of the path used survives untouched.
 */
export function scrubPaths(content: string, options: ScrubOptions): string {
  let text = content;

  const workspace =
    options.workspaceRoot === undefined ? undefined : toRootPattern(options.workspaceRoot);

  if (workspace !== undefined) {
    text = text.replace(workspace, '.');
  }

  const home =
    options.homeDirectory === undefined ? undefined : toRootPattern(options.homeDirectory);

  if (home !== undefined) {
    text = text.replace(home, '~');
  }

  return text;
}
