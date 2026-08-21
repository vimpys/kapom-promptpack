import assert from 'node:assert/strict';
import {
  estimateTokens,
  formatTokenCount,
  sumTokens,
} from '../../src/core/token-estimator.js';

suite('token-estimator', () => {
  test('ข้อความว่างได้ 0', () => {
    assert.equal(estimateTokens(''), 0);
  });

  test('หารลงตัวได้ผลตรงตามสูตร', () => {
    assert.equal(estimateTokens('abcd'), 1);
    assert.equal(estimateTokens('abcdefgh'), 2);
  });

  test('ปัดขึ้นเสมอ ไม่ปัดทิ้ง', () => {
    assert.equal(estimateTokens('a'), 1);
    assert.equal(estimateTokens('abcde'), 2);
  });

  test('นับ newline และ whitespace ด้วย', () => {
    assert.equal(estimateTokens('a\nb\nc\n'), 2);
  });

  test('sumTokens รวมค่าได้ และ array ว่างได้ 0', () => {
    assert.equal(sumTokens([]), 0);
    assert.equal(sumTokens([1, 2, 3]), 6);
  });

  test('formatTokenCount ใส่ตัวคั่นหลักพัน', () => {
    assert.equal(formatTokenCount(12400), '12,400');
    assert.equal(formatTokenCount(0), '0');
  });

  test('ข้อความไทยยังคืนค่าตามสูตรเดิม (ข้อจำกัดที่รู้อยู่)', () => {
    const thai = 'สวัสดีครับ';

    assert.equal(estimateTokens(thai), Math.ceil(thai.length / 4));
  });
});
