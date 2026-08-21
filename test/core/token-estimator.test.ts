import assert from 'node:assert/strict';
import {
  estimateTokens,
  formatTokenCount,
  sumTokens,
} from '../../src/core/token-estimator.js';

suite('token-estimator', () => {
  test('empty text costs nothing', () => {
    assert.equal(estimateTokens(''), 0);
  });

  test('exact multiples follow the formula', () => {
    assert.equal(estimateTokens('abcd'), 1);
    assert.equal(estimateTokens('abcdefgh'), 2);
  });

  test('always rounds up, never truncates', () => {
    assert.equal(estimateTokens('a'), 1);
    assert.equal(estimateTokens('abcde'), 2);
  });

  test('newlines and whitespace count too', () => {
    assert.equal(estimateTokens('a\nb\nc\n'), 2);
  });

  test('sumTokens adds up and treats an empty list as zero', () => {
    assert.equal(sumTokens([]), 0);
    assert.equal(sumTokens([1, 2, 3]), 6);
  });

  test('formatTokenCount groups thousands', () => {
    assert.equal(formatTokenCount(12400), '12,400');
    assert.equal(formatTokenCount(0), '0');
  });

  test('Thai text still follows the same formula (known limitation)', () => {
    const thai = 'สวัสดีครับ';

    assert.equal(estimateTokens(thai), Math.ceil(thai.length / 4));
  });
});
