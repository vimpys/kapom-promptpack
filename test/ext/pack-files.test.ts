import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { packFiles } from '../../src/commands/pack-files.js';
import type { PackSummary } from '../../src/core/types.js';
import type { DeliveryOutcome, DeliveryRequest, PromptProvider } from '../../src/providers/provider.js';

/** Captures the payload instead of touching the real clipboard. */
class CaptureProvider implements PromptProvider {
  readonly id = 'capture';

  readonly label = 'Capture';

  markdown = '';

  summary: PackSummary | undefined;

  deliver(request: DeliveryRequest): Promise<DeliveryOutcome> {
    this.markdown = request.markdown;
    this.summary = request.summary;

    return Promise.resolve({ status: 'delivered', detail: 'captured' });
  }
}

const encoder = new TextEncoder();

function folderUri(): vscode.Uri {
  const folder = vscode.workspace.workspaceFolders?.[0];

  assert.ok(folder, 'the test workspace folder must be open');

  return folder.uri;
}

function sandbox(...segments: readonly string[]): vscode.Uri {
  return vscode.Uri.joinPath(folderUri(), 'sandbox', ...segments);
}

async function write(relative: string, content: string): Promise<vscode.Uri> {
  const uri = sandbox(...relative.split('/'));

  await vscode.workspace.fs.writeFile(uri, encoder.encode(content));

  return uri;
}

async function pack(...selection: readonly vscode.Uri[]): Promise<CaptureProvider> {
  const provider = new CaptureProvider();

  await packFiles(selection[0], selection, { provider, confirm: () => Promise.resolve(true) });

  return provider;
}

suite('pack-files', () => {
  suiteSetup(async () => {
    await vscode.workspace.fs.createDirectory(sandbox());

    await write('src/a.ts', 'export const a = 1;\n');
    await write('src/b.ts', 'export const b = 2;\n');
    await write('src/config.ts', 'const password = "hunter2";\nexport const port = 8080;\n');
    await write('src/logpath.ts', `const log = "${folderUri().fsPath}/tmp/run.log";\n`);
    await write('.env', 'API_KEY=fake-value-for-testing\n');
    await write('secrets.json', '{ "note": "fake" }\n');
    await write('src/notes.txt', 'plain text, filtered out by extension\n');
    await write('node_modules/pkg/index.ts', 'export const dep = 1;\n');
    await write('ignored-by-git/hidden.ts', 'export const hidden = 1;\n');

    // Only the workspace-root .gitignore is read, so the fixture has to live
    // there rather than beside the files it covers.
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(folderUri(), '.gitignore'),
      encoder.encode('sandbox/ignored-by-git/\n'),
    );
  });

  suiteTeardown(async () => {
    await vscode.workspace.fs.delete(sandbox(), { recursive: true, useTrash: false });
    await vscode.workspace.fs.delete(vscode.Uri.joinPath(folderUri(), '.gitignore'), {
      useTrash: false,
    });
  });

  test('a plain file is packed with its contents', async () => {
    const provider = await pack(sandbox('src', 'a.ts'));

    assert.match(provider.markdown, /## sandbox\/src\/a\.ts/u);
    assert.match(provider.markdown, /export const a = 1;/u);
    assert.equal(provider.summary?.fileCount, 1);
  });

  test('a folder selection is expanded recursively', async () => {
    const provider = await pack(sandbox('src'));

    assert.match(provider.markdown, /## sandbox\/src\/a\.ts/u);
    assert.match(provider.markdown, /## sandbox\/src\/b\.ts/u);
  });

  test('SECURITY.md rule 1 — picking .env by hand still skips it', async () => {
    const provider = await pack(sandbox('.env'));

    assert.ok(!provider.markdown.includes('fake-value-for-testing'));
    assert.equal(provider.summary, undefined, 'nothing should have been delivered');
  });

  test('SECURITY.md rule 1 — a .env inside a packed folder never reaches the payload', async () => {
    const provider = await pack(sandbox());

    assert.ok(!provider.markdown.includes('fake-value-for-testing'));
    assert.ok(provider.markdown.includes('export const a = 1;'), 'the rest still packs');
  });

  test('a secret inside an ordinary file is redacted, not leaked', async () => {
    const provider = await pack(sandbox('src', 'config.ts'));

    assert.ok(!provider.markdown.includes('hunter2'));
    assert.match(provider.markdown, /<REDACTED:assigned-secret>/u);
    assert.match(provider.markdown, /export const port = 8080;/u);
  });

  test('absolute paths inside file contents are scrubbed', async () => {
    const provider = await pack(sandbox('src', 'logpath.ts'));

    assert.ok(!provider.markdown.includes(folderUri().fsPath));
    assert.match(provider.markdown, /tmp\/run\.log/u);
  });

  test('node_modules is not walked', async () => {
    const provider = await pack(sandbox());

    assert.ok(!provider.markdown.includes('export const dep = 1;'));
  });

  test('the extension filter drops files outside the list', async () => {
    const provider = await pack(sandbox());

    assert.ok(!provider.markdown.includes('plain text, filtered out'));
  });

  test('files the workspace .gitignore excludes are not packed', async () => {
    const provider = await pack(sandbox());

    assert.ok(!provider.markdown.includes('export const hidden = 1;'));
  });

  test('the guard report names what was left out', async () => {
    const provider = await pack(sandbox());

    // Asserted on the reason rather than the heading, which follows the
    // configured output language.
    assert.match(provider.markdown, /`sandbox\/secrets\.json` — deny-list/u);
  });

  test('an empty selection delivers nothing rather than an empty prompt', async () => {
    const provider = new CaptureProvider();

    await packFiles(undefined, [], { provider });

    assert.equal(provider.markdown, '');
  });

  test('a selection of only skipped files delivers nothing', async () => {
    const provider = await pack(sandbox('secrets.json'));

    assert.equal(provider.markdown, '');
  });
});

suite('pack-files / preview gate', () => {
  // Its own fixtures: the suite above removes the sandbox in its teardown.
  suiteSetup(async () => {
    await vscode.workspace.fs.createDirectory(sandbox());

    await write('src/a.ts', 'export const a = 1;\n');
    await write('src/config.ts', 'const password = "hunter2";\n');
  
  });

  suiteTeardown(async () => {
    await vscode.workspace.fs.delete(sandbox(), { recursive: true, useTrash: false });
  });

  test('a payload with redactions asks before copying', async () => {
    const provider = new CaptureProvider();
    let asked: readonly string[] | undefined;

    await packFiles(sandbox('src', 'config.ts'), [sandbox('src', 'config.ts')], {
      provider,
      confirm: (_markdown, reasons) => {
        asked = reasons;

        return Promise.resolve(true);
      },
    });

    assert.ok(asked, 'the user should have been asked');
    assert.ok(asked.some((reason) => reason.includes('masked')));
    assert.ok(provider.markdown.length > 0);
  });

  test('refusing the preview copies nothing at all', async () => {
    const provider = new CaptureProvider();

    await packFiles(sandbox('src', 'config.ts'), [sandbox('src', 'config.ts')], {
      provider,
      confirm: () => Promise.resolve(false),
    });

    assert.equal(provider.markdown, '');
    assert.equal(provider.summary, undefined);
  });

  test('a clean payload is copied without interrupting', async () => {
    const provider = new CaptureProvider();
    let asked = false;

    await packFiles(sandbox('src', 'a.ts'), [sandbox('src', 'a.ts')], {
      provider,
      confirm: () => {
        asked = true;

        return Promise.resolve(true);
      },
    });

    assert.equal(asked, false, 'nothing was masked or skipped, so no gate');
    assert.ok(provider.markdown.includes('export const a = 1;'));
  });

  test('the status bar is updated only after a successful copy', async () => {
    const updates: number[] = [];
    const statusBar = { update: (summary: { totalTokens: number }) => updates.push(summary.totalTokens) };

    await packFiles(sandbox('src', 'config.ts'), [sandbox('src', 'config.ts')], {
      provider: new CaptureProvider(),
      statusBar,
      confirm: () => Promise.resolve(false),
    });

    assert.deepEqual(updates, [], 'cancelled packs must not update the status bar');

    await packFiles(sandbox('src', 'a.ts'), [sandbox('src', 'a.ts')], {
      provider: new CaptureProvider(),
      statusBar,
      confirm: () => Promise.resolve(true),
    });

    assert.equal(updates.length, 1);
  });
});
