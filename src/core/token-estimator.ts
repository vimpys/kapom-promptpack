/**
 * ประมาณจำนวน token แบบหยาบด้วยสูตร chars / 4
 *
 * แยกเป็นโมดูลของตัวเองเพื่อให้เปลี่ยนไปใช้ tokenizer จริง (tiktoken / gpt-tokenizer)
 * ได้โดยไม่ต้องแก้ที่อื่น — จุดเรียกใช้ทุกที่ต้องผ่านฟังก์ชันในไฟล์นี้เท่านั้น
 *
 * ข้อจำกัดที่รู้อยู่: สูตรนี้ปรับมาสำหรับภาษาอังกฤษ ข้อความภาษาไทยกินจำนวน token
 * ต่ออักขระสูงกว่ามาก (บางโมเดลเกือบ 1 token ต่อ 1 อักขระ) ค่าที่ได้จึงต่ำกว่าจริง
 * สำหรับไฟล์ที่มีข้อความไทยเยอะ — ยอมรับได้ใน Phase 1 เพราะใช้เตือน ไม่ใช่ใช้เรียกเงิน
 */
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function sumTokens(counts: readonly number[]): number {
  return counts.reduce((total, count) => total + count, 0);
}

export function formatTokenCount(tokens: number): string {
  return tokens.toLocaleString('en-US');
}
