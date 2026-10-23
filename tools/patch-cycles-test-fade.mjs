// D134/D135：把周目曲线测试改成「深层层位 + 渐入」口径
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('.');
const p = 'tests/cycles.test.ts';
const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
const crlf = raw.includes('\r\n');
let t = raw.replace(/\r\n/g, '\n');

const oldBlock = `  it('同层同种怪：周目越高血与攻伐越大，且与曲线逐位吻合', () => {
    const def = getMonster('fangshi-yuanke');
    if (!def) throw new Error('数据表缺 fangshi-yuanke');
    const m0 = spawnMonster(def, 5, 1, 0, 0, 'normal', [], 0);
    const m1 = spawnMonster(def, 5, 1, 0, 0, 'normal', [], 1);
    const m2 = spawnMonster(def, 5, 1, 0, 0, 'normal', [], 2);
    // 每只怪各自 round 一次，所以比曲线时容差 1 点（差 2 点以上就是曲线写错）
    expect(Math.abs(m1.maxHp - m0.maxHp * CYCLE_HP_MUL)).toBeLessThanOrEqual(1);
    expect(Math.abs(m2.maxHp - m0.maxHp * CYCLE_HP_MUL * CYCLE_HP_MUL)).toBeLessThanOrEqual(2);
    expect(m1.damage).toBeCloseTo(m0.damage * CYCLE_DMG_MUL, 6);
    expect(m2.damage).toBeCloseTo(m0.damage * CYCLE_DMG_MUL * CYCLE_DMG_MUL, 6);
  });`;

const newBlock = `  it('深层（渐入满）：周目越高气血越大，与曲线逐位吻合', () => {
    const def = getMonster('fangshi-yuanke');
    if (!def) throw new Error('数据表缺 fangshi-yuanke');
    // 层 20：fade = min(1, (20-9)/9) = 1 ⇒ effCycle = 周目数
    const m0 = spawnMonster(def, 20, 1, 0, 0, 'normal', [], 0);
    const m1 = spawnMonster(def, 20, 1, 0, 0, 'normal', [], 1);
    const m2 = spawnMonster(def, 20, 1, 0, 0, 'normal', [], 2);
    // 每只怪各自 round 一次，所以比曲线时容差 1 点（差 2 点以上就是曲线写错）
    expect(Math.abs(m1.maxHp - m0.maxHp * CYCLE_HP_MUL)).toBeLessThanOrEqual(1);
    expect(Math.abs(m2.maxHp - m0.maxHp * CYCLE_HP_MUL * CYCLE_HP_MUL)).toBeLessThanOrEqual(2);
  });

  it('攻不再吃周目（D134）：任何周目、任何层，攻伐倍率恒为 1', () => {
    const def = getMonster('fangshi-yuanke');
    if (!def) throw new Error('数据表缺 fangshi-yuanke');
    const base = spawnMonster(def, 20, 1, 0, 0, 'normal', [], 0);
    for (const cycle of [1, 2, 5, 20]) {
      const m = spawnMonster(def, 20, 1, 0, 0, 'normal', [], cycle);
      expect(m.damage).toBe(base.damage);
    }
    expect(CYCLE_DMG_MUL).toBe(1);
  });

  it('渐入（D135）：层 1~9 完全不吃周目倍率，层 14 吃一半，层 18+ 吃满', () => {
    const def = getMonster('fangshi-yuanke');
    if (!def) throw new Error('数据表缺 fangshi-yuanke');
    // 层 5：fade = 0 ⇒ 与第 0 周目完全一致（不然「轮回后在层 1 被打死」）
    const early0 = spawnMonster(def, 5, 1, 0, 0, 'normal', [], 0);
    const early1 = spawnMonster(def, 5, 1, 0, 0, 'normal', [], 1);
    expect(early1.maxHp).toBe(early0.maxHp);
    expect(effectiveCycle(1, 5)).toBe(0);
    expect(effectiveCycle(1, 9)).toBe(0);
    // 层 14：fade = 5/9
    expect(effectiveCycle(1, 14)).toBeCloseTo(5 / 9, 10);
    const mid = spawnMonster(def, 14, 1, 0, 0, 'normal', [], 1);
    const mid0 = spawnMonster(def, 14, 1, 0, 0, 'normal', [], 0);
    const expectMid = mid0.maxHp * Math.pow(CYCLE_HP_MUL, 5 / 9);
    expect(Math.abs(mid.maxHp - expectMid)).toBeLessThanOrEqual(1);
    // 层 18 与 20 都吃满
    expect(effectiveCycle(1, 18)).toBe(1);
    expect(effectiveCycle(2, 40)).toBe(2);
    // 脏层号安静归到「最浅」（fade 0），不产生 NaN
    expect(effectiveCycle(3, Number.NaN)).toBe(0);
  });`;

if (!t.includes(oldBlock)) throw new Error('MISS block');
t = t.replace(oldBlock, newBlock);

// import 加 effectiveCycle
const oldImport = '  cycleDmgMul,';
if (!t.includes(oldImport)) throw new Error('MISS import');
t = t.replace(oldImport, '  cycleDmgMul,\n  effectiveCycle,');

if (t.length < raw.length) throw new Error('SHRINK');
fs.writeFileSync(path.join(ROOT, p), crlf ? t.replace(/\n/g, '\r\n') : t, 'utf8');
console.log(`patched ${p} (${raw.length} -> ${t.length})`);
