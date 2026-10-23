// D152：威胁封顶 4 → 3.75（为首撞层腾余量）；同步 threat.test.ts 的落定值断言，
// 并修掉 58-62 行那处「字符串里塞了字面量 \n」的排版事故（那一行原本把两条断言压成了一行字符串）。
import fs from 'node:fs';

const P = 'tests/threat.test.ts';
const raw = fs.readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');
const rep = (a, b, tag) => {
  if (!t.includes(a)) throw new Error('MISS[' + tag + ']');
  t = t.replace(a, b);
};

rep("  it('层 42 起钳在 DEEP_THREAT_MUL，再往深不继续涨（段④ 终点压力有上限）', () => {",
  "  it('钳位之后不再涨（段④ 终点压力有上限）', () => {", 'title');

// 那行把两条断言写进了同一个字符串字面量里（含字面量 \n），等于断言没生效 —— 拆成两行
const broken = [
  '    // D115：0.2 斜率 ⇒ 层 37 就到 ×4（= 1 + 0.2 × 15），之后恒 ×4\\n    expect(threatMul(37, false)).toBeCloseTo(DEEP_THREAT_MUL, 10);\\n    expect(threatMul(42, false)).toBeCloseTo(DEEP_THREAT_MUL, 10);',
].join('\n');
rep(broken, [
  '    // D152：0.2 斜率 + 封顶 3.75 ⇒ 层 22 起爬、层 36 到顶（1 + 0.2×14 = 3.8 > 3.75），之后恒为封顶值。',
  '    expect(threatMul(36, false)).toBeCloseTo(DEEP_THREAT_MUL, 10);',
  '    expect(threatMul(37, false)).toBeCloseTo(DEEP_THREAT_MUL, 10);',
  '    expect(threatMul(42, false)).toBeCloseTo(DEEP_THREAT_MUL, 10);',
].join('\n'), 'broken');

rep([
  "  it('倍率与开关的落定值（×4 封顶 / 镇守 ×1.5 / 开；D115）', () => {",
  '    expect(DEEP_THREAT_ENABLED).toBe(true);',
  '    expect(DEEP_THREAT_MUL).toBe(4);',
].join('\n'), [
  "  // D152：封顶 4 → 3.75。**这条断言是故意的死数**：威胁封顶直接决定「首撞层」余量，",
  '  // 是最容易被顺手改动的旋钮（删掉疾行后 c0 首撞从 46 掉到 38 就是它报警的）。',
  "  it('倍率与开关的落定值（×3.75 封顶 / 镇守 ×1.5 / 开；D152）', () => {",
  '    expect(DEEP_THREAT_ENABLED).toBe(true);',
  '    expect(DEEP_THREAT_MUL).toBe(3.75);',
].join('\n'), 'values');

fs.writeFileSync(P, crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log('patched', P);
