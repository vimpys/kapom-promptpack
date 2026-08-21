/**
 * Maps a file to the fence tag a chat UI will recognise.
 *
 * Kept separate from the renderer so adding a language is a one-line change
 * that cannot break the document assembly.
 */
const BY_EXTENSION: Readonly<Record<string, string>> = {
  ts: 'ts',
  mts: 'ts',
  cts: 'ts',
  tsx: 'tsx',
  js: 'js',
  mjs: 'js',
  cjs: 'js',
  jsx: 'jsx',
  vue: 'vue',
  svelte: 'svelte',
  json: 'json',
  jsonc: 'jsonc',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  svg: 'xml',
  md: 'md',
  mdx: 'mdx',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  env: 'ini',
  sql: 'sql',
  cs: 'csharp',
  csproj: 'xml',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  php: 'php',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  ps1: 'powershell',
  psm1: 'powershell',
  bat: 'bat',
  cmd: 'bat',
  graphql: 'graphql',
  gql: 'graphql',
  proto: 'proto',
  prisma: 'prisma',
  tf: 'hcl',
  tfvars: 'hcl',
};

/** Files that carry their language in the name rather than an extension. */
const BY_NAME: Readonly<Record<string, string>> = {
  dockerfile: 'dockerfile',
  containerfile: 'dockerfile',
  makefile: 'makefile',
  gemfile: 'ruby',
  rakefile: 'ruby',
  procfile: 'bash',
  '.gitignore': 'gitignore',
  '.npmrc': 'ini',
  '.editorconfig': 'ini',
};

function baseName(relativePath: string): string {
  const parts = relativePath.split(/[/\\]/u);

  return parts[parts.length - 1] ?? relativePath;
}

/**
 * Returns the fence tag for a path, or an empty string when the language is
 * unknown. An empty tag is deliberate: a wrong tag makes a chat UI highlight
 * the file as the wrong language, which reads worse than no highlighting.
 */
export function languageTagFor(relativePath: string): string {
  const name = baseName(relativePath).toLowerCase();
  const byName = BY_NAME[name];

  if (byName !== undefined) {
    return byName;
  }

  const dot = name.lastIndexOf('.');

  if (dot < 0) {
    return '';
  }

  return BY_EXTENSION[name.slice(dot + 1)] ?? '';
}
