import assert from 'node:assert/strict';
import { guardFiles, type GuardOptions } from '../../src/core/secret-guard.js';
import type { SourceFile } from '../../src/core/types.js';

const REDACT: GuardOptions = { mode: 'redact' };
const SKIP_FILE: GuardOptions = { mode: 'skipFile' };

function file(relativePath: string, content: string): SourceFile {
  return { relativePath, content, sizeBytes: content.length };
}

function guardOne(source: SourceFile, options: GuardOptions = REDACT) {
  return guardFiles([source], options);
}

suite('secret-guard / deny list', () => {
  test('a .env picked by hand is skipped, not packed', () => {
    const outcome = guardOne(file('.env', 'API_KEY=abc123'));

    assert.equal(outcome.guarded.length, 0);
    assert.equal(outcome.skipped.length, 1);
    assert.equal(outcome.skipped[0]?.reason, 'deny-list');
  });

  test('deny list covers the documented name patterns', () => {
    const names = [
      '.env',
      '.env.local',
      '.env.production',
      'server.pem',
      'private.key',
      'cert.p12',
      'cert.pfx',
      'app.keystore',
      'secrets.json',
      'credentials.yml',
      'id_rsa',
      'config/.env.staging',
    ];

    for (const name of names) {
      const outcome = guardOne(file(name, 'anything'));

      assert.equal(outcome.guarded.length, 0, `${name} should be skipped`);
      assert.equal(outcome.skipped[0]?.reason, 'deny-list', `${name} reason`);
    }
  });

  test('deny list wins even when the file holds nothing secret', () => {
    const outcome = guardOne(file('.env', '# empty\n'));

    assert.equal(outcome.guarded.length, 0);
  });

  test('ordinary source files are not caught by the deny list', () => {
    const outcome = guardOne(file('src/env.ts', 'export const env = 1;\n'));

    assert.equal(outcome.guarded.length, 1);
    assert.equal(outcome.skipped.length, 0);
  });
});

suite('secret-guard / line redaction', () => {
  test('one secret line is redacted and the line count is unchanged', () => {
    const source = file(
      'appsettings.json',
      ['{', '  "name": "app",', '  "password": "hunter2",', '  "port": 8080', '}'].join('\n'),
    );

    const outcome = guardOne(source);
    const guarded = outcome.guarded[0];

    assert.ok(guarded);
    assert.equal(guarded.content.split('\n').length, source.content.split('\n').length);
    assert.ok(!guarded.content.includes('hunter2'));
    assert.ok(guarded.content.includes('<REDACTED:assigned-secret>'));
  });

  test('the key survives so the model still sees the setting exists', () => {
    const outcome = guardOne(file('config.yml', 'apiKey: "sk-abcdefghijklmnopqrst"\n'));
    const guarded = outcome.guarded[0];

    assert.ok(guarded);
    assert.ok(guarded.content.includes('apiKey'));
    assert.ok(!guarded.content.includes('sk-abcdefghijklmnopqrst'));
  });

  test('untouched lines stay byte for byte the same', () => {
    const outcome = guardOne(file('a.ts', 'const a = 1;\nconst password = "s3cret!";\nconst b = 2;\n'));
    const lines = outcome.guarded[0]?.content.split('\n');

    assert.deepEqual([lines?.[0], lines?.[2]], ['const a = 1;', 'const b = 2;']);
  });

  test('redactions report the 1-based line number and the rule that fired', () => {
    const outcome = guardOne(file('a.ts', 'ok\nAKIAIOSFODNN7EXAMPLE\n'));
    const redactions = outcome.guarded[0]?.redactions ?? [];
    const first = redactions[0];

    assert.equal(redactions.length, 1);
    assert.ok(first);
    assert.equal(first.line, 2);
    assert.equal(first.rule, 'aws-access-key');
  });

  test('a clean file passes through unchanged with no redactions', () => {
    const content = 'export function add(a: number, b: number) {\n  return a + b;\n}\n';
    const guarded = guardOne(file('add.ts', content)).guarded[0];

    assert.ok(guarded);
    assert.equal(guarded.content, content);
    assert.equal(guarded.redactions.length, 0);
  });

  test('CRLF line endings are preserved', () => {
    const outcome = guardOne(file('a.env.ts', 'const x = 1;\r\nconst token = "abcdefghijkl";\r\n'));
    const guarded = outcome.guarded[0];

    assert.ok(guarded);
    assert.ok(guarded.content.includes('\r\n'));
    assert.equal(guarded.content.split('\n').length, 3);
  });
});

suite('secret-guard / credential shapes', () => {
  const cases: readonly { readonly label: string; readonly secret: string }[] = [
    { label: 'aws', secret: 'AKIAIOSFODNN7EXAMPLE' },
    { label: 'openai', secret: 'sk-abcdefghijklmnopqrstuvwx' },
    { label: 'github', secret: 'ghp_abcdefghijklmnopqrstuvwxyz0123456' },
    { label: 'google', secret: 'AIzaSyA00000000000000000000000000000000' },
    { label: 'slack', secret: 'xoxb-123456789012-abcdefghijkl' },
    {
      label: 'jwt',
      secret: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    },
    { label: 'mongodb', secret: 'mongodb://admin:pa55word@cluster0.example.net:27017/db' },
    { label: 'postgres', secret: 'postgres://user:pa55word@localhost:5432/app' },
  ];

  for (const { label, secret } of cases) {
    test(`${label} credentials are redacted`, () => {
      const outcome = guardOne(file('notes.md', `value: ${secret}\n`));
      const guarded = outcome.guarded[0];

      assert.ok(guarded);
      assert.ok(!guarded.content.includes(secret), `${label} leaked`);
      assert.ok(guarded.redactions.length > 0);
    });
  }

  test('an ADO.NET connection string loses only the password', () => {
    const outcome = guardOne(
      file('web.config', 'Server=db1;Database=app;User Id=sa;Password=P@ssw0rd!;\n'),
    );
    const guarded = outcome.guarded[0];

    assert.ok(guarded);
    assert.ok(guarded.content.includes('Server=db1'));
    assert.ok(guarded.content.includes('Database=app'));
    assert.ok(!guarded.content.includes('P@ssw0rd!'));
  });

  test('a private key block is redacted line by line, keeping the line count', () => {
    const content = [
      'const key = `',
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIEowIBAAKCAQEAxGZs1TlPXTGCiXyLbGGRk0000000000000000000000000',
      'AoGBAJ0000000000000000000000000000000000000000000000000000000',
      '-----END RSA PRIVATE KEY-----',
      '`;',
    ].join('\n');

    const outcome = guardOne(file('key.ts', content));
    const guarded = outcome.guarded[0];

    assert.ok(guarded);
    assert.equal(guarded.content.split('\n').length, 6);
    assert.ok(!guarded.content.includes('MIIEowIBAAKCAQEA'));
    assert.ok(!guarded.content.includes('BEGIN RSA PRIVATE KEY'));
    assert.equal(guarded.redactions.length, 4);
  });
});

suite('secret-guard / false positives', () => {
  const safeLines: readonly string[] = [
    'const token = req.headers.authorization;',
    'const apiKey = process.env.API_KEY;',
    'const password = getPassword();',
    'this.token = null;',
    'const secret = undefined;',
    'let credential = user.credential;',
  ];

  for (const line of safeLines) {
    test(`code expression is left alone: ${line}`, () => {
      const guarded = guardOne(file('a.ts', `${line}\n`)).guarded[0];

      assert.ok(guarded);
      assert.equal(guarded.content, `${line}\n`);
      assert.equal(guarded.redactions.length, 0);
    });
  }
});

suite('secret-guard / skipFile mode', () => {
  test('a file holding a secret is dropped whole', () => {
    const outcome = guardOne(file('config.ts', 'const password = "hunter2";\n'), SKIP_FILE);
    const skipped = outcome.skipped[0];

    assert.equal(outcome.guarded.length, 0);
    assert.ok(skipped);
    assert.equal(skipped.reason, 'secret-content');
    assert.equal(skipped.detail, 'assigned-secret');
  });

  test('a clean file still passes in skipFile mode', () => {
    const outcome = guardOne(file('a.ts', 'export const a = 1;\n'), SKIP_FILE);

    assert.equal(outcome.guarded.length, 1);
  });
});

suite('secret-guard / custom patterns', () => {
  test('extraPatterns from settings are applied', () => {
    const guarded = guardOne(file('a.ts', 'const id = "INTERNAL-9931";\n'), {
      mode: 'redact',
      extraPatterns: ['INTERNAL-\\d+'],
    }).guarded[0];

    assert.ok(guarded);
    assert.ok(!guarded.content.includes('INTERNAL-9931'));
    assert.equal(guarded.redactions[0]?.rule, 'custom-1');
  });

  test('an invalid pattern throws instead of failing silently', () => {
    assert.throws(
      () => guardOne(file('a.ts', 'x'), { mode: 'redact', extraPatterns: ['('] }),
      /not a valid regular expression/u,
    );
  });
});

suite('secret-guard / batch behaviour', () => {
  test('a mixed batch splits into guarded and skipped', () => {
    const outcome = guardFiles(
      [
        file('src/a.ts', 'export const a = 1;\n'),
        file('.env', 'TOKEN=abc\n'),
        file('src/b.ts', 'const password = "hunter2";\n'),
      ],
      REDACT,
    );

    assert.deepEqual(
      outcome.guarded.map((entry) => entry.relativePath),
      ['src/a.ts', 'src/b.ts'],
    );
    assert.deepEqual(
      outcome.skipped.map((entry) => entry.relativePath),
      ['.env'],
    );
  });

  test('an empty batch is not an error', () => {
    const outcome = guardFiles([], REDACT);

    assert.deepEqual(outcome.guarded, []);
    assert.deepEqual(outcome.skipped, []);
  });
});

suite('secret-guard / keys inside longer names', () => {
  const compoundKeys: readonly string[] = [
    'api_key',
    'my_api_key',
    'aws_secret_access_key',
    'db_password',
    'DJANGO_SECRET_KEY',
    'JWT_SECRET',
    'STRIPE_SECRET_KEY',
    'X-Api-Token',
    'client_secret',
    'refresh_token',
  ];

  for (const key of compoundKeys) {
    test(`${key} is caught`, () => {
      const guarded = guardOne(file('compose.yml', `${key} = abcdef123456\n`)).guarded[0];

      assert.ok(guarded);
      assert.ok(!guarded.content.includes('abcdef123456'), `${key} leaked`);
    });
  }

  test('camelCase keys are caught too', () => {
    const guarded = guardOne(file('a.ts', 'const dbPassword = "abcdef123456";\n')).guarded[0];

    assert.ok(guarded);
    assert.ok(!guarded.content.includes('abcdef123456'));
  });

  test('an exact key still redacts a bare number', () => {
    const guarded = guardOne(file('a.yml', 'password: 12345678\n')).guarded[0];

    assert.ok(guarded);
    assert.ok(!guarded.content.includes('12345678'));
  });
});

suite('secret-guard / auth headers and URLs', () => {
  test('an opaque bearer token is redacted', () => {
    const guarded = guardOne(file('a.http', 'Authorization: Bearer a1b2c3d4e5f6g7h8\n')).guarded[0];

    assert.ok(guarded);
    assert.ok(!guarded.content.includes('a1b2c3d4e5f6g7h8'));
    assert.ok(guarded.content.includes('Authorization'));
  });

  test('a basic auth header is redacted', () => {
    const guarded = guardOne(file('a.http', 'Authorization: Basic dXNlcjpwYXNz\n')).guarded[0];

    assert.ok(guarded);
    assert.ok(!guarded.content.includes('dXNlcjpwYXNz'));
  });

  test('basic auth inside an http URL loses only the password', () => {
    const guarded = guardOne(
      file('a.ts', 'const api = "https://svc:P4ssw0rd@internal.corp.co.th/v1";\n'),
    ).guarded[0];

    assert.ok(guarded);
    assert.ok(!guarded.content.includes('P4ssw0rd'));
    assert.ok(guarded.content.includes('https://svc:'));
    assert.ok(guarded.content.includes('@internal.corp.co.th/v1'));
  });

  test('a plain URL with no credentials is left alone', () => {
    const line = 'const url = "https://example.com/a/b?c=1";\n';
    const guarded = guardOne(file('a.ts', line)).guarded[0];

    assert.ok(guarded);
    assert.equal(guarded.content, line);
  });

  test('an azure storage account key is redacted', () => {
    const guarded = guardOne(
      file('a.config', 'DefaultEndpointsProtocol=https;AccountKey=abcd1234efgh5678ijkl==;\n'),
    ).guarded[0];

    assert.ok(guarded);
    assert.ok(!guarded.content.includes('abcd1234efgh5678ijkl=='));
    assert.ok(guarded.content.includes('DefaultEndpointsProtocol=https'));
  });
});

suite('secret-guard / compound keys that are not secrets', () => {
  const keptLines: readonly string[] = [
    'const tokens_used = 12345678;',
    'token_count = 4096',
    'max_tokens = 100000',
    'const accessKeyId = row.id;',
    'secret_santa_year = 2026',
    'api_key_rotation_days = 90',
    'const tokenizer = new Tokenizer();',
    'const passwordStrength = score(input);',
    'authorization_code_lifetime = 600',
    'const privateKeyPath = "./keys/id.pem";',
    'interface Credentials { token: string; }',
    'type Auth = { accessToken: string; refreshToken: string };',
  ];

  for (const line of keptLines) {
    test(`kept: ${line}`, () => {
      const guarded = guardOne(file('a.ts', `${line}\n`)).guarded[0];

      assert.ok(guarded);
      assert.equal(guarded.content, `${line}\n`);
    });
  }
});

suite('secret-guard / overlapping rules', () => {
  test('one secret on one line is reported once, not once per matching rule', () => {
    const guarded = guardOne(file('config.ts', 'const password = "hunter2";\n')).guarded[0];

    assert.ok(guarded);
    assert.equal(guarded.redactions.length, 1);
  });

  test('a placeholder is never masked again', () => {
    const guarded = guardOne(file('config.ts', 'const password = "hunter2";\n')).guarded[0];

    assert.ok(guarded);
    assert.equal(guarded.content, 'const password = "<REDACTED:assigned-secret>";\n');
    assert.ok(!guarded.content.includes('<REDACTED:<REDACTED:'));
  });

  test('two different secrets on one line are both reported', () => {
    const guarded = guardOne(
      file('a.ts', 'const c = { password: "hunter2", awsKey: "AKIAIOSFODNN7EXAMPLE" };\n'),
    ).guarded[0];

    assert.ok(guarded);
    assert.ok(!guarded.content.includes('hunter2'));
    assert.ok(!guarded.content.includes('AKIAIOSFODNN7EXAMPLE'));
    assert.equal(guarded.redactions.length, 2);
  });
});

suite('secret-guard / content scanning switched off', () => {
  const NO_SCAN: GuardOptions = { mode: 'redact', contentScanning: false };

  test('the deny list still runs — a setting cannot release a .env', () => {
    const outcome = guardOne(file('.env', 'API_KEY=super-secret-value\n'), NO_SCAN);

    assert.equal(outcome.guarded.length, 0);
    assert.equal(outcome.skipped[0]?.reason, 'deny-list');
  });

  test('key material is still skipped by name', () => {
    const outcome = guardOne(file('server.pem', 'anything\n'), NO_SCAN);

    assert.equal(outcome.guarded.length, 0);
  });

  test('file contents are passed through untouched', () => {
    const content = 'const password = "hunter2";\n';
    const guarded = guardOne(file('config.ts', content), NO_SCAN).guarded[0];

    assert.ok(guarded);
    assert.equal(guarded.content, content);
    assert.equal(guarded.redactions.length, 0);
  });
});
