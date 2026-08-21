import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { ClipboardProvider } from '../../src/providers/clipboard-provider.js';
import type { PackSummary } from '../../src/core/types.js';

const summary: PackSummary = {
  workspaceName: 'app',
  fileCount: 3,
  totalTokens: 12400,
  redactionCount: 0,
  skipped: [],
};

suite('clipboard-provider', () => {
  let original = '';

  suiteSetup(async () => {
    original = await vscode.env.clipboard.readText();
  });

  suiteTeardown(async () => {
    await vscode.env.clipboard.writeText(original);
  });

  test('the payload lands on the clipboard byte for byte', async () => {
    const markdown = '# Task\n\nreview this\n\n## src/a.ts\n\n```ts\nconst a = 1;\n```\n';
    const outcome = await new ClipboardProvider().deliver({ markdown, summary });

    assert.equal(outcome.status, 'delivered');
    assert.equal(await vscode.env.clipboard.readText(), markdown);
  });

  test('the detail line reports files and tokens for the notification', async () => {
    const outcome = await new ClipboardProvider().deliver({ markdown: 'x', summary });

    assert.ok(outcome.status === 'delivered');
    assert.equal(outcome.detail, '3 file(s), about 12,400 tokens');
  });

  test('an empty payload is refused rather than wiping the clipboard', async () => {
    const marker = 'keep-me';

    await vscode.env.clipboard.writeText(marker);

    const outcome = await new ClipboardProvider().deliver({ markdown: '', summary });

    assert.equal(outcome.status, 'failed');
    assert.equal(await vscode.env.clipboard.readText(), marker);
  });

  test('a large payload survives the round trip', async () => {
    const markdown = 'const a = 1;\n'.repeat(20000);
    const outcome = await new ClipboardProvider().deliver({ markdown, summary });

    assert.equal(outcome.status, 'delivered');
    assert.equal((await vscode.env.clipboard.readText()).length, markdown.length);
  });

  test('Thai text and CRLF survive the round trip', async () => {
    const markdown = 'สวัสดีครับ\r\nconst a = 1;\r\n';

    await new ClipboardProvider().deliver({ markdown, summary });

    assert.equal(await vscode.env.clipboard.readText(), markdown);
  });
});
