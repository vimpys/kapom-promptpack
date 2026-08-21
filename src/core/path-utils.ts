const SEPARATORS = /[/\\]/u;

/** Splits on either separator and drops empty segments. */
export function segmentsOf(relativePath: string): readonly string[] {
  return relativePath.split(SEPARATORS).filter((segment) => segment.length > 0);
}

export function baseName(relativePath: string): string {
  const segments = segmentsOf(relativePath);

  return segments[segments.length - 1] ?? relativePath;
}

/**
 * The extension without its dot, lowercased, or an empty string when there is
 * none. A leading dot does not count, so `.gitignore` has no extension rather
 * than an extension of `gitignore`.
 */
export function extensionOf(relativePath: string): string {
  const name = baseName(relativePath);
  const dot = name.lastIndexOf('.');

  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** Forward slashes everywhere, so a payload reads the same on any platform. */
export function toPosixPath(relativePath: string): string {
  return relativePath.split(SEPARATORS).join('/');
}
