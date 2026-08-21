import assert from 'node:assert/strict';
import { renderPrompt } from '../../src/core/renderer.js';
import { guardFiles } from '../../src/core/secret-guard.js';
import type { GuardedFile, SourceFile } from '../../src/core/types.js';

function source(relativePath: string, content: string): SourceFile {
  return { relativePath, content, sizeBytes: content.length };
}

/**
 * The only way a test can obtain a GuardedFile is by running the guard, which
 * is the whole point of the branded type.
 */
function guard(...files: readonly SourceFile[]): readonly GuardedFile[] {
  return guardFiles(files, { mode: 'redact' }).guarded;
}

function render(files: readonly GuardedFile[], task?: string): string {
  return renderPrompt({ workspaceName: 'app', files, ...(task === undefined ? {} : { task }) })
    .markdown;
}

suite('renderer / document shape', () => {
  test('the overview reports workspace, file count and a token estimate', () => {
    const markdown = render(guard(source('src/a.ts', 'export const a = 1;\n')));

    assert.match(markdown, /# Project overview/u);
    assert.match(markdown, /- Workspace: app/u);
    assert.match(markdown, /- Files attached: 1/u);
    assert.match(markdown, /- Estimated tokens: \d[\d,]*/u);
  });

  test('the token estimate describes the whole payload, not just the files', () => {
    const result = renderPrompt({
      workspaceName: 'app',
      files: guard(source('src/a.ts', 'x'.repeat(400))),
    });

    assert.ok(result.summary.totalTokens > 100, 'file body alone is 100 tokens');
    assert.equal(result.summary.fileCount, 1);
  });

  test('every file is listed and then rendered in its own section', () => {
    const markdown = render(
      guard(source('src/a.ts', 'const a = 1;\n'), source('src/b.ts', 'const b = 2;\n')),
    );

    assert.match(markdown, /- `src\/a\.ts`/u);
    assert.match(markdown, /- `src\/b\.ts`/u);
    assert.match(markdown, /## src\/a\.ts/u);
    assert.match(markdown, /## src\/b\.ts/u);
  });

  test('the task section appears only when a task was given', () => {
    const withTask = render(guard(source('a.ts', 'x')), 'Explain this');
    const without = render(guard(source('a.ts', 'x')));

    assert.match(withTask, /# Task\n\nExplain this/u);
    assert.ok(!without.includes('# Task'));
  });

  test('a whitespace-only task is treated as no task', () => {
    assert.ok(!render(guard(source('a.ts', 'x')), '   \n  ').includes('# Task'));
  });

  test('an empty selection still produces a valid document', () => {
    const markdown = render([]);

    assert.match(markdown, /- Files attached: 0/u);
    assert.match(markdown, /_No files were included\._/u);
  });

  test('the document ends with exactly one newline', () => {
    const markdown = render(guard(source('a.ts', 'const a = 1;\n')));

    assert.ok(markdown.endsWith('\n'));
    assert.ok(!markdown.endsWith('\n\n'));
  });
});

suite('renderer / paths', () => {
  test('backslash paths are shown with forward slashes', () => {
    const markdown = render(guard(source('src\\core\\a.ts', 'x')));

    assert.match(markdown, /## src\/core\/a\.ts/u);
    assert.ok(!markdown.includes('src\\core'));
  });
});

suite('renderer / fences', () => {
  test('a language tag is chosen from the extension', () => {
    const markdown = render(
      guard(
        source('a.vue', '<template />'),
        source('b.cs', 'class A {}'),
        source('c.sql', 'select 1'),
      ),
    );

    assert.ok(markdown.includes('```vue'));
    assert.ok(markdown.includes('```csharp'));
    assert.ok(markdown.includes('```sql'));
  });

  test('an unknown extension gets a bare fence rather than a wrong tag', () => {
    const markdown = render(guard(source('a.weirdext', 'contents')));

    assert.match(markdown, /```\ncontents\n```/u);
  });

  test('a file containing a fence is wrapped in a longer one', () => {
    const content = ['# Doc', '', '```ts', 'const a = 1;', '```', ''].join('\n');
    const markdown = render(guard(source('README.md', content)));

    assert.ok(markdown.includes('````md'), 'should open with four backticks');
    assert.ok(markdown.includes('```ts'), 'inner fence survives untouched');
  });

  test('the fence keeps growing for longer runs', () => {
    const content = ['````', 'x', '````'].join('\n');
    const markdown = render(guard(source('a.md', content)));

    assert.ok(markdown.includes('`````md'));
  });

  test('indented fences inside the file are counted too', () => {
    const markdown = render(guard(source('a.md', '  ```\n  x\n  ```\n')));

    assert.ok(markdown.includes('````md'));
  });
});

suite('renderer / guard report', () => {
  test('a clean pack has no report section', () => {
    const markdown = render(guard(source('a.ts', 'const a = 1;\n')));

    assert.ok(!markdown.includes('Secret guard report'));
  });

  test('redacted lines are counted and attributed to their file', () => {
    const markdown = render(guard(source('config.ts', 'const password = "hunter2";\n')));

    assert.match(markdown, /# Secret guard report/u);
    assert.match(markdown, /1 line\(s\) in 1 file\(s\)/u);
    assert.match(markdown, /- `config\.ts` — 1 \(assigned-secret\)/u);
  });

  test('skipped files are listed with the reason', () => {
    const outcome = guardFiles(
      [source('src/a.ts', 'const a = 1;\n'), source('.env', 'TOKEN=abc\n')],
      { mode: 'redact' },
    );

    const result = renderPrompt({
      workspaceName: 'app',
      files: outcome.guarded,
      skipped: outcome.skipped,
    });

    assert.match(result.markdown, /Left out on purpose/u);
    assert.match(result.markdown, /- `\.env` — deny-list: dotenv/u);
    assert.equal(result.summary.skipped.length, 1);
  });
});

suite('renderer / output language', () => {
  test('Thai headings are used when asked for', () => {
    const markdown = renderPrompt({
      workspaceName: 'app',
      files: guard(source('a.ts', 'const a = 1;\n')),
      task: 'ช่วยรีวิวโค้ด',
      language: 'th',
    }).markdown;

    assert.match(markdown, /# งานที่ต้องการ/u);
    assert.match(markdown, /# ภาพรวมโปรเจกต์/u);
    assert.match(markdown, /- ไฟล์ที่แนบ: 1/u);
  });

  test('English is the default', () => {
    assert.match(render(guard(source('a.ts', 'x'))), /# Project overview/u);
  });
});

suite('renderer / end to end', () => {
  test('a secret in the source never reaches the payload', () => {
    const content = [
      'const config = {',
      '  host: "db1",',
      '  password: "hunter2",',
      '};',
    ].join('\n');

    const outcome = guardFiles([source('src/config.ts', content)], { mode: 'redact' });
    const result = renderPrompt({ workspaceName: 'app', files: outcome.guarded });

    assert.ok(!result.markdown.includes('hunter2'));
    assert.ok(result.markdown.includes('host: "db1"'));
    assert.ok(result.markdown.includes('<REDACTED:assigned-secret>'));
    assert.equal(result.summary.redactionCount, 1);
  });

  test('a denied file contributes nothing to the payload', () => {
    const outcome = guardFiles([source('.env', 'API_KEY=super-secret-value\n')], {
      mode: 'redact',
    });
    const result = renderPrompt({
      workspaceName: 'app',
      files: outcome.guarded,
      skipped: outcome.skipped,
    });

    assert.ok(!result.markdown.includes('super-secret-value'));
    assert.equal(result.summary.fileCount, 0);
  });
});
