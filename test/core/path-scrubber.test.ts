import assert from 'node:assert/strict';
import { scrubPaths, type ScrubOptions } from '../../src/core/path-scrubber.js';

const HOME = 'C:\\Users\\Kapom';
const WORKSPACE = 'C:\\Users\\Kapom\\Projects\\app';
const BOTH: ScrubOptions = { homeDirectory: HOME, workspaceRoot: WORKSPACE };

suite('path-scrubber / home directory', () => {
  test('the home prefix becomes a tilde', () => {
    const text = scrubPaths('log: C:\\Users\\Kapom\\Downloads\\a.txt', { homeDirectory: HOME });

    assert.equal(text, 'log: ~\\Downloads\\a.txt');
  });

  test('the account name is gone from the result', () => {
    const text = scrubPaths('C:\\Users\\Kapom\\notes.md', { homeDirectory: HOME });

    assert.ok(!text.includes('Kapom'));
  });

  test('POSIX home directories work too', () => {
    const text = scrubPaths('at /home/kapom/app/index.js:12', { homeDirectory: '/home/kapom' });

    assert.equal(text, 'at ~/app/index.js:12');
  });

  test('every occurrence is replaced, not just the first', () => {
    const text = scrubPaths(
      'from C:\\Users\\Kapom\\a to C:\\Users\\Kapom\\b',
      { homeDirectory: HOME },
    );

    assert.equal(text, 'from ~\\a to ~\\b');
  });
});

suite('path-scrubber / separator styles', () => {
  test('forward slashes match a backslash root', () => {
    const text = scrubPaths('C:/Users/Kapom/x.ts', { homeDirectory: HOME });

    assert.equal(text, '~/x.ts');
  });

  test('the escaped form inside JSON string literals is caught', () => {
    const text = scrubPaths('{"cwd":"C:\\\\Users\\\\Kapom\\\\app"}', { homeDirectory: HOME });

    assert.ok(!text.includes('Kapom'));
    assert.ok(text.includes('~'));
  });

  test('matching ignores case, the way Windows paths behave', () => {
    const text = scrubPaths('c:\\users\\kapom\\x', { homeDirectory: HOME });

    assert.equal(text, '~\\x');
  });
});

suite('path-scrubber / workspace root', () => {
  test('the workspace root becomes a dot', () => {
    const text = scrubPaths('C:\\Users\\Kapom\\Projects\\app\\src\\a.ts', BOTH);

    assert.equal(text, '.\\src\\a.ts');
  });

  test('the workspace root wins over the home directory it sits inside', () => {
    const text = scrubPaths('C:\\Users\\Kapom\\Projects\\app\\src\\a.ts', BOTH);

    assert.ok(!text.startsWith('~'));
  });

  test('paths outside the workspace still fall back to the home rule', () => {
    const text = scrubPaths('C:\\Users\\Kapom\\Desktop\\note.txt', BOTH);

    assert.equal(text, '~\\Desktop\\note.txt');
  });

  test('a trailing separator on the configured root is tolerated', () => {
    const text = scrubPaths('C:\\Users\\Kapom\\Projects\\app\\src', {
      workspaceRoot: 'C:\\Users\\Kapom\\Projects\\app\\',
    });

    assert.equal(text, '.\\src');
  });
});

suite('path-scrubber / safety', () => {
  test('no options leaves the content alone', () => {
    const content = 'C:\\Users\\Kapom\\a.ts';

    assert.equal(scrubPaths(content, {}), content);
  });

  test('a dangerously short root is refused rather than applied', () => {
    const content = 'C:\\Users\\Kapom\\a.ts and /etc/hosts';

    assert.equal(scrubPaths(content, { homeDirectory: 'C:\\' }), content);
    assert.equal(scrubPaths(content, { homeDirectory: '/' }), content);
  });

  test('regex metacharacters in a path are treated literally', () => {
    const text = scrubPaths('/home/a+b(c)/x.ts', { homeDirectory: '/home/a+b(c)' });

    assert.equal(text, '~/x.ts');
  });

  test('content without any absolute path is untouched', () => {
    const content = 'export const a = 1;\nimport b from "./b.js";\n';

    assert.equal(scrubPaths(content, BOTH), content);
  });

  test('line count never changes', () => {
    const content = 'a\nC:\\Users\\Kapom\\x\nb\n';

    assert.equal(scrubPaths(content, BOTH).split('\n').length, content.split('\n').length);
  });
});

suite('path-scrubber / acceptance', () => {
  test('the payload carries no trace of the home directory', () => {
    const payload = [
      '# Files',
      '',
      '## src/a.ts',
      '',
      '// built from C:\\Users\\Kapom\\Projects\\app',
      'const log = "C:/Users/Kapom/AppData/Local/Temp/run.log";',
      '{"root":"C:\\\\Users\\\\Kapom"}',
    ].join('\n');

    const text = scrubPaths(payload, BOTH);

    assert.ok(!text.includes('Kapom'));
    assert.ok(!/[Cc]:[/\\]+[Uu]sers/u.test(text));
  });
});
