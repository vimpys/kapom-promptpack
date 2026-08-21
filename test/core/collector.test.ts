import assert from 'node:assert/strict';
import {
  collectFiles,
  looksBinary,
  pathSkipReason,
  type FilterRules,
} from '../../src/core/collector.js';
import { parseGitignore } from '../../src/core/gitignore.js';
import type { SourceFile } from '../../src/core/types.js';

const NUL = String.fromCharCode(0);
const REPLACEMENT = String.fromCharCode(0xfffd);

const RULES: FilterRules = {
  includeExtensions: ['ts', 'js', 'md'],
  ignorePatterns: ['node_modules', 'dist', '.git'],
  maxFileSizeKb: 200,
};

function file(relativePath: string, content = 'x', sizeBytes = content.length): SourceFile {
  return { relativePath, content, sizeBytes };
}

function rules(overrides: Partial<FilterRules> = {}): FilterRules {
  return { ...RULES, ...overrides };
}

suite('collector / ignore patterns', () => {
  test('a pattern matches any segment of the path', () => {
    assert.equal(pathSkipReason('node_modules/pkg/a.js', RULES), 'ignored');
    assert.equal(pathSkipReason('packages/app/node_modules/a.js', RULES), 'ignored');
    assert.equal(pathSkipReason('src/a.ts', RULES), undefined);
  });

  test('a partial name is not a match', () => {
    assert.equal(pathSkipReason('src/dist-helper/a.ts', RULES), undefined);
  });

  test('globs are supported', () => {
    const withGlob = rules({ ignorePatterns: ['*.min.js', 'build-*'] });

    assert.equal(pathSkipReason('vendor/jquery.min.js', withGlob), 'ignored');
    assert.equal(pathSkipReason('build-output/a.js', withGlob), 'ignored');
    assert.equal(pathSkipReason('src/a.js', withGlob), undefined);
  });

  test('backslash paths are split the same way', () => {
    assert.equal(pathSkipReason('node_modules\\pkg\\a.js', RULES), 'ignored');
  });
});

suite('collector / extension filter', () => {
  test('only listed extensions get through', () => {
    assert.equal(pathSkipReason('src/a.ts', RULES), undefined);
    assert.equal(pathSkipReason('src/a.png', RULES), 'extension-filter');
  });

  test('matching ignores case and a leading dot in the setting', () => {
    const withDots = rules({ includeExtensions: ['.TS'] });

    assert.equal(pathSkipReason('src/A.Ts', withDots), undefined);
  });

  test('an empty list allows every extension', () => {
    const anyExtension = rules({ includeExtensions: [] });

    assert.equal(pathSkipReason('src/a.png', anyExtension), undefined);
    assert.equal(pathSkipReason('Makefile', anyExtension), undefined);
  });

  test('a file with no extension is filtered out when a list is set', () => {
    assert.equal(pathSkipReason('Makefile', RULES), 'extension-filter');
  });

  test('a dotfile is not treated as an extension', () => {
    assert.equal(pathSkipReason('.gitignore', RULES), 'extension-filter');
  });
});

suite('collector / gitignore integration', () => {
  test('gitignore rules are applied when supplied', () => {
    const withGit = rules({ gitignore: parseGitignore('out/\n*.md\n') });

    assert.equal(pathSkipReason('out/a.js', withGit), 'ignored');
    assert.equal(pathSkipReason('README.md', withGit), 'ignored');
    assert.equal(pathSkipReason('src/a.ts', withGit), undefined);
  });

  test('no gitignore supplied means no gitignore filtering', () => {
    assert.equal(pathSkipReason('out/a.js', rules({ ignorePatterns: [] })), undefined);
  });
});

suite('collector / binary detection', () => {
  test('a NUL byte marks the content as binary', () => {
    assert.equal(looksBinary(`PNG${NUL}${NUL}IHDR`), true);
  });

  test('a scattering of replacement characters marks it binary too', () => {
    assert.equal(looksBinary(REPLACEMENT.repeat(20) + 'abc'), true);
  });

  test('ordinary source is not binary', () => {
    assert.equal(looksBinary('export const a = 1;\n'), false);
  });

  test('Thai text is not binary', () => {
    assert.equal(looksBinary('const label = "สวัสดีครับ";\n'), false);
  });

  test('a lone replacement character in a long file is tolerated', () => {
    assert.equal(looksBinary(`${REPLACEMENT}${'a'.repeat(500)}`), false);
  });

  test('empty content is not binary', () => {
    assert.equal(looksBinary(''), false);
  });
});

suite('collector / size limit', () => {
  test('a file over the limit is skipped and the size is reported', () => {
    const outcome = collectFiles([file('src/big.ts', 'x', 300 * 1024)], RULES);
    const skipped = outcome.skipped[0];

    assert.equal(outcome.kept.length, 0);
    assert.ok(skipped);
    assert.equal(skipped.reason, 'too-large');
    assert.equal(skipped.detail, '300 KB');
  });

  test('a file exactly on the limit is kept', () => {
    const outcome = collectFiles([file('src/edge.ts', 'x', 200 * 1024)], RULES);

    assert.equal(outcome.kept.length, 1);
  });

  test('a limit of zero disables the check', () => {
    const outcome = collectFiles(
      [file('src/big.ts', 'x', 10 * 1024 * 1024)],
      rules({ maxFileSizeKb: 0 }),
    );

    assert.equal(outcome.kept.length, 1);
  });
});

suite('collector / collectFiles', () => {
  test('a mixed batch is split with a reason for everything dropped', () => {
    const outcome = collectFiles(
      [
        file('src/a.ts', 'export const a = 1;\n'),
        file('node_modules/pkg/b.js', 'module.exports = 1;\n'),
        file('assets/logo.png', `PNG${NUL}data`),
        file('docs/notes.md', '# notes\n'),
        file('src/huge.ts', 'x', 999 * 1024),
      ],
      RULES,
    );

    assert.deepEqual(
      outcome.kept.map((entry) => entry.relativePath),
      ['src/a.ts', 'docs/notes.md'],
    );
    assert.deepEqual(
      outcome.skipped.map((entry) => [entry.relativePath, entry.reason]),
      [
        ['node_modules/pkg/b.js', 'ignored'],
        ['assets/logo.png', 'extension-filter'],
        ['src/huge.ts', 'too-large'],
      ],
    );
  });

  test('binary content is caught when the extension looks fine', () => {
    const outcome = collectFiles([file('src/blob.ts', `data${NUL}more`)], RULES);

    assert.equal(outcome.kept.length, 0);
    assert.equal(outcome.skipped[0]?.reason, 'binary');
  });

  test('the cheapest check runs first, so a path rule beats a size rule', () => {
    const outcome = collectFiles([file('dist/huge.ts', 'x', 999 * 1024)], RULES);

    assert.equal(outcome.skipped[0]?.reason, 'ignored');
  });

  test('an empty batch is not an error', () => {
    const outcome = collectFiles([], RULES);

    assert.deepEqual(outcome.kept, []);
    assert.deepEqual(outcome.skipped, []);
  });
});
