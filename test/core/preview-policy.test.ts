import assert from 'node:assert/strict';
import { decidePreview, type PreviewSignals } from '../../src/core/preview-policy.js';

const CLEAN: PreviewSignals = {
  totalTokens: 1000,
  tokenWarningThreshold: 100000,
  redactionCount: 0,
  skippedCount: 0,
};

function signals(overrides: Partial<PreviewSignals> = {}): PreviewSignals {
  return { ...CLEAN, ...overrides };
}

suite('preview-policy / onWarning', () => {
  test('a clean payload goes straight through', () => {
    const decision = decidePreview('onWarning', signals());

    assert.equal(decision.required, false);
    assert.deepEqual(decision.reasons, []);
  });

  test('a masked value is enough to ask first', () => {
    const decision = decidePreview('onWarning', signals({ redactionCount: 2 }));

    assert.equal(decision.required, true);
    assert.match(decision.reasons[0] ?? '', /2 value\(s\) were masked/u);
  });

  test('a skipped file is enough to ask first', () => {
    const decision = decidePreview('onWarning', signals({ skippedCount: 1 }));

    assert.equal(decision.required, true);
    assert.match(decision.reasons[0] ?? '', /1 file\(s\) were left out/u);
  });

  test('passing the token threshold is enough to ask first', () => {
    const decision = decidePreview('onWarning', signals({ totalTokens: 100001 }));

    assert.equal(decision.required, true);
    assert.match(decision.reasons[0] ?? '', /over your 100,000 warning threshold/u);
  });

  test('sitting exactly on the threshold is not over it', () => {
    assert.equal(decidePreview('onWarning', signals({ totalTokens: 100000 })).required, false);
  });

  test('a zero threshold disables the size check', () => {
    const decision = decidePreview(
      'onWarning',
      signals({ totalTokens: 9999999, tokenWarningThreshold: 0 }),
    );

    assert.equal(decision.required, false);
  });

  test('every reason is listed, size first', () => {
    const decision = decidePreview(
      'onWarning',
      signals({ totalTokens: 200000, redactionCount: 1, skippedCount: 3 }),
    );

    assert.equal(decision.reasons.length, 3);
    assert.match(decision.reasons[0] ?? '', /threshold/u);
  });
});

suite('preview-policy / always and never', () => {
  test('always asks even when there is nothing to flag', () => {
    const decision = decidePreview('always', signals());

    assert.equal(decision.required, true);
    assert.deepEqual(decision.reasons, []);
  });

  test('never skips the gate even when values were masked', () => {
    const decision = decidePreview('never', signals({ redactionCount: 5 }));

    assert.equal(decision.required, false);
  });

  test('never still reports the reasons, so the user is told rather than left guessing', () => {
    const decision = decidePreview('never', signals({ redactionCount: 5, skippedCount: 2 }));

    assert.equal(decision.reasons.length, 2);
  });
});
