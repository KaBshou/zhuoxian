// 一次性补丁：drop.test.ts 的兼容包装断言（ilvlForTier 对应阶的第一层）。跑完即弃。
import fs from 'node:fs';

const p = 'tests/drop.test.ts';
let c = fs.readFileSync(p, 'utf8');

const old = "  it('一阶掉落灵蕴 4（99×1/27），对应黄阶灵纹', () => {\n    expect(ilvlForTier(1)).toBe(ilvlForFloor(1));\n    expect(ilvlForTier(2)).toBe(ilvlForFloor(2));\n    expect(ilvlForTier(3)).toBe(ilvlForFloor(3));\n  });";
const neu = "  it('兼容包装：ilvlForTier(tier) = 该阶第一层的 ilvlForFloor', () => {\n    expect(ilvlForTier(1)).toBe(ilvlForFloor(1));\n    expect(ilvlForTier(2)).toBe(ilvlForFloor(4));\n    expect(ilvlForTier(3)).toBe(ilvlForFloor(7));\n    // BALANCE v2 表 F：层 1 = 4、层 4 = 15（黄顶格）、层 27 = 99\n    expect(ilvlForFloor(1)).toBe(4);\n    expect(ilvlForFloor(4)).toBe(15);\n    expect(ilvlForFloor(27)).toBe(99);\n  });";

if (!c.includes(old)) {
  console.error('MISS');
  process.exit(1);
}
c = c.split(old).join(neu);
fs.writeFileSync(p, c, 'utf8');
console.log('OK');
