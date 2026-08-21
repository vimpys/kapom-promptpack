import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  resolveSettings,
  toFilterRules,
  toGuardOptions,
} from '../../src/core/settings-schema.js';

function settingsFrom(raw: Readonly<Record<string, unknown>>) {
  return resolveSettings(raw).settings;
}

function problemsFrom(raw: Readonly<Record<string, unknown>>): readonly string[] {
  return resolveSettings(raw).problems;
}

suite('settings-schema / defaults', () => {
  test('an empty configuration yields the documented defaults', () => {
    const resolved = resolveSettings({});

    assert.deepEqual(resolved.settings, DEFAULT_SETTINGS);
    assert.deepEqual(resolved.problems, []);
  });

  test('the secret guard is on by default and redacts rather than drops', () => {
    assert.equal(DEFAULT_SETTINGS.secretGuardEnabled, true);
    assert.equal(DEFAULT_SETTINGS.secretGuardMode, 'redact');
  });

  test('preview defaults to warning only, not never', () => {
    assert.equal(DEFAULT_SETTINGS.previewBeforeCopy, 'onWarning');
  });
});

suite('settings-schema / valid values', () => {
  test('user values replace the defaults', () => {
    const settings = settingsFrom({
      maxFileSizeKb: 50,
      respectGitignore: false,
      outputLanguage: 'en',
      'secretGuard.mode': 'skipFile',
      previewBeforeCopy: 'always',
    });

    assert.equal(settings.maxFileSizeKb, 50);
    assert.equal(settings.respectGitignore, false);
    assert.equal(settings.outputLanguage, 'en');
    assert.equal(settings.secretGuardMode, 'skipFile');
    assert.equal(settings.previewBeforeCopy, 'always');
  });

  test('string arrays are trimmed and blanks dropped', () => {
    const settings = settingsFrom({ includeExtensions: ['  ts  ', '', 'js', '   '] });

    assert.deepEqual(settings.includeExtensions, ['ts', 'js']);
  });

  test('an empty array is honoured rather than treated as unset', () => {
    assert.deepEqual(settingsFrom({ includeExtensions: [] }).includeExtensions, []);
  });

  test('zero is accepted where it means "no limit"', () => {
    const settings = settingsFrom({ maxFileSizeKb: 0, tokenWarningThreshold: 0 });

    assert.equal(settings.maxFileSizeKb, 0);
    assert.equal(settings.tokenWarningThreshold, 0);
  });
});

suite('settings-schema / bad values are reported, not swallowed', () => {
  test('a wrong type falls back and explains itself', () => {
    const resolved = resolveSettings({ maxFileSizeKb: 'big' });

    assert.equal(resolved.settings.maxFileSizeKb, DEFAULT_SETTINGS.maxFileSizeKb);
    assert.equal(resolved.problems.length, 1);
    assert.match(resolved.problems[0] ?? '', /maxFileSizeKb: expected a number/u);
  });

  test('a negative limit is refused', () => {
    assert.equal(settingsFrom({ maxFileSizeKb: -1 }).maxFileSizeKb, DEFAULT_SETTINGS.maxFileSizeKb);
    assert.equal(problemsFrom({ maxFileSizeKb: -1 }).length, 1);
  });

  test('NaN and Infinity are refused', () => {
    assert.equal(problemsFrom({ maxFileSizeKb: Number.NaN }).length, 1);
    assert.equal(problemsFrom({ tokenWarningThreshold: Number.POSITIVE_INFINITY }).length, 1);
  });

  test('an unknown enum value falls back and lists the allowed ones', () => {
    const resolved = resolveSettings({ 'secretGuard.mode': 'off' });

    assert.equal(resolved.settings.secretGuardMode, 'redact');
    assert.match(resolved.problems[0] ?? '', /one of redact \| skipFile/u);
  });

  test('a non-array where an array belongs falls back', () => {
    assert.deepEqual(
      settingsFrom({ ignorePatterns: 'node_modules' }).ignorePatterns,
      DEFAULT_SETTINGS.ignorePatterns,
    );
  });

  test('non-string entries inside an array are dropped and counted', () => {
    const resolved = resolveSettings({ includeExtensions: ['ts', 42, 'js', null] });

    assert.deepEqual(resolved.settings.includeExtensions, ['ts', 'js']);
    assert.match(resolved.problems[0] ?? '', /ignored 2 non-string/u);
  });

  test('several bad values each get their own report', () => {
    const problems = problemsFrom({ maxFileSizeKb: 'x', outputLanguage: 'fr', respectGitignore: 1 });

    assert.equal(problems.length, 3);
  });

  test('a bad value never leaves the setting undefined', () => {
    const settings = settingsFrom({ outputLanguage: 'fr', previewBeforeCopy: 'maybe' });

    assert.equal(settings.outputLanguage, 'th');
    assert.equal(settings.previewBeforeCopy, 'onWarning');
  });
});

suite('settings-schema / mapping to core options', () => {
  test('filter rules carry the file-selection settings across', () => {
    const rules = toFilterRules(settingsFrom({ maxFileSizeKb: 10, ignorePatterns: ['tmp'] }));

    assert.equal(rules.maxFileSizeKb, 10);
    assert.deepEqual(rules.ignorePatterns, ['tmp']);
  });

  test('guard options follow the configured mode and patterns', () => {
    const options = toGuardOptions(
      settingsFrom({ 'secretGuard.mode': 'skipFile', 'secretGuard.extraPatterns': ['ACME-\\d+'] }),
    );

    assert.equal(options.mode, 'skipFile');
    assert.equal(options.contentScanning, true);
    assert.deepEqual(options.extraPatterns, ['ACME-\\d+']);
  });

  test('disabling the guard only turns off content scanning', () => {
    const options = toGuardOptions(settingsFrom({ 'secretGuard.enabled': false }));

    assert.equal(options.contentScanning, false);
  });
});
