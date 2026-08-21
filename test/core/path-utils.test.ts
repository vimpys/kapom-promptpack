import assert from 'node:assert/strict';
import {
  baseName,
  extensionOf,
  segmentsOf,
  toPosixPath,
} from '../../src/core/path-utils.js';

suite('path-utils / segmentsOf', () => {
  test('splits on either separator', () => {
    assert.deepEqual(segmentsOf('src/core/a.ts'), ['src', 'core', 'a.ts']);
    assert.deepEqual(segmentsOf('src\\core\\a.ts'), ['src', 'core', 'a.ts']);
  });

  test('drops empty segments from doubled or leading separators', () => {
    assert.deepEqual(segmentsOf('/src//core/'), ['src', 'core']);
  });
});

suite('path-utils / baseName', () => {
  test('returns the last segment', () => {
    assert.equal(baseName('src/core/a.ts'), 'a.ts');
    assert.equal(baseName('src\\core\\a.ts'), 'a.ts');
  });

  test('a bare name is its own base name', () => {
    assert.equal(baseName('a.ts'), 'a.ts');
  });

  test('an empty path falls back to itself rather than throwing', () => {
    assert.equal(baseName(''), '');
  });
});

suite('path-utils / extensionOf', () => {
  test('returns the extension lowercased, without the dot', () => {
    assert.equal(extensionOf('src/a.TS'), 'ts');
    assert.equal(extensionOf('a.tar.gz'), 'gz');
  });

  test('a dotfile has no extension', () => {
    assert.equal(extensionOf('.gitignore'), '');
    assert.equal(extensionOf('src/.env'), '');
  });

  test('a file with no dot has no extension', () => {
    assert.equal(extensionOf('Makefile'), '');
  });

  test('a dot in a directory name is not the extension', () => {
    assert.equal(extensionOf('my.folder/Makefile'), '');
  });
});

suite('path-utils / toPosixPath', () => {
  test('backslashes become forward slashes', () => {
    assert.equal(toPosixPath('src\\core\\a.ts'), 'src/core/a.ts');
  });

  test('a posix path is left alone', () => {
    assert.equal(toPosixPath('src/core/a.ts'), 'src/core/a.ts');
  });
});
