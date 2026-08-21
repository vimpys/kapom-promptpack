import assert from 'node:assert/strict';
import { isIgnored, parseGitignore } from '../../src/core/gitignore.js';

function ignored(gitignore: string, path: string): boolean {
  return isIgnored(path, parseGitignore(gitignore));
}

suite('gitignore / parsing', () => {
  test('blank lines and comments are skipped', () => {
    const rules = parseGitignore(['', '# a comment', '   ', 'dist'].join('\n'));

    assert.equal(rules.length, 1);
  });

  test('no rules means nothing is ignored', () => {
    assert.equal(isIgnored('anything.ts', []), false);
  });

  test('trailing whitespace is trimmed', () => {
    assert.equal(ignored('dist   \n', 'dist/a.js'), true);
  });
});

suite('gitignore / matching', () => {
  test('a bare name matches at any depth', () => {
    assert.equal(ignored('node_modules', 'node_modules/a.js'), true);
    assert.equal(ignored('node_modules', 'packages/app/node_modules/a.js'), true);
  });

  test('a leading slash anchors the pattern to the root', () => {
    assert.equal(ignored('/dist', 'dist/a.js'), true);
    assert.equal(ignored('/dist', 'packages/app/dist/a.js'), false);
  });

  test('a trailing slash matches directories only', () => {
    assert.equal(ignored('build/', 'build/a.js'), true);
    assert.equal(ignored('build/', 'build'), false);
  });

  test('a star does not cross a slash', () => {
    assert.equal(ignored('*.log', 'debug.log'), true);
    assert.equal(ignored('*.log', 'logs/debug.log'), true);
    assert.equal(ignored('logs/*.log', 'logs/nested/debug.log'), false);
  });

  test('a double star crosses directories', () => {
    assert.equal(ignored('logs/**/debug.log', 'logs/a/b/debug.log'), true);
    assert.equal(ignored('logs/**/debug.log', 'logs/debug.log'), true);
  });

  test('a question mark matches a single character', () => {
    assert.equal(ignored('file?.ts', 'file1.ts'), true);
    assert.equal(ignored('file?.ts', 'file12.ts'), false);
  });

  test('paths with backslashes are normalised first', () => {
    assert.equal(ignored('dist', 'dist\\a.js'), true);
  });
});

suite('gitignore / negation', () => {
  test('a later rule can re-include a file', () => {
    assert.equal(ignored(['*.log', '!keep.log'].join('\n'), 'keep.log'), false);
    assert.equal(ignored(['*.log', '!keep.log'].join('\n'), 'other.log'), true);
  });

  test('order decides, so re-ignoring afterwards wins', () => {
    assert.equal(ignored(['*.log', '!keep.log', 'keep.log'].join('\n'), 'keep.log'), true);
  });

  test('a file inside an ignored directory cannot be re-included', () => {
    const gitignore = ['dist/', '!dist/keep.js'].join('\n');

    assert.equal(ignored(gitignore, 'dist/keep.js'), true);
  });
});

suite('gitignore / realistic file', () => {
  const gitignore = [
    '# deps',
    'node_modules/',
    '',
    '# build output',
    '/dist',
    'out/',
    '*.vsix',
    '',
    '# local',
    '.env',
    '.env.*',
    '!.env.example',
  ].join('\n');

  const cases: readonly { readonly path: string; readonly expected: boolean }[] = [
    { path: 'src/a.ts', expected: false },
    { path: 'node_modules/pkg/index.js', expected: true },
    { path: 'dist/extension.js', expected: true },
    { path: 'packages/app/dist/a.js', expected: false },
    { path: 'out/test/a.js', expected: true },
    { path: 'kapom-promptpack-0.0.1.vsix', expected: true },
    { path: '.env', expected: true },
    { path: '.env.local', expected: true },
    { path: '.env.example', expected: false },
  ];

  for (const { path, expected } of cases) {
    test(`${path} -> ${expected ? 'ignored' : 'kept'}`, () => {
      assert.equal(ignored(gitignore, path), expected);
    });
  }
});
