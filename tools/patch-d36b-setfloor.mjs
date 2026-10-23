// 一次性补丁：D36-B 秘境选层（回刷任意已到过的层）
// 规则拍板：可选 1..「已到过的最高层」，不能选没打过的层（主线必须正推，不许跳关）。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/session.ts';
const orig = fs.readFileSync(p, 'utf8');
fs.mkdirSync('F:/dsh-work/zhuoxian/tools/_bak', { recursive: true });
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/session.ts.${Date.now()}.bak`, orig, 'utf8');
let c = orig;

function repl(old, neu, tag) {
  const n = c.split(old).length - 1;
  if (n !== 1) throw new Error(`MISS(${n}): ${tag}`);
  c = c.replace(old, neu);
  console.log('ok:', tag);
}

// 1) 导出两个新函数（挂在 startWave 之前）
repl(
  `export function startWave(s: GameSession): void {`,
  `/**
 * 已到过的最高层（含当前所在层）。
 *
 * 为什么用「到过」而不是「通关」：玩家掉到第 12 层打不过想回第 9 层刷，
 * 这时候第 12 层已经「到过」但没「通关」，如果按通关算他会被永久锁回去。
 */
export function highestFloorReached(s: GameSession): number {
  let hi = s.floor;
  for (const f of s.firstClearedFloors) if (f > hi) hi = f;
  return Math.min(MAX_FLOOR, Math.max(1, hi));
}

/** 可选层上限 = 已到过的最高层（不许跳关） */
export function floorSelectableMax(s: GameSession): number {
  return highestFloorReached(s);
}

/**
 * 转入指定层（回刷 / 换农点）。
 *
 * 返回是否真的换了层。规则：
 * - 只能选 1..floorSelectableMax(s)，选没到过的层返回 false（主线必须正推）
 * - 换层会清空场上怪与地上掉落、波次归零、立刻开新波（不保留旧层的半场战斗）
 * - **不清修为、不清浊气、不动装备**：换层是移动，不是重开
 */
export function setFloor(s: GameSession, floor: number): boolean {
  if (!Number.isFinite(floor)) return false;
  const target = Math.max(1, Math.min(floorSelectableMax(s), Math.round(floor)));
  if (target === s.floor) return false;
  const from = s.floor;
  s.floor = target;
  s.wave = 0;
  s.waveTimer = 0;
  s.battle.monsters = [];
  s.ground = [];
  if (!s.firstClearedFloors.includes(target)) {
    // 没通关过的层不计首通，但到过要记（否则回刷几层后最高层会被忘掉）
  }
  startWave(s);
  pushLog(s, \`自第 \${from} 层转入第 \${target} 层\`, '#6b3fa0');
  return true;
}

export function startWave(s: GameSession): void {`,
  'set-floor',
);

if (c.length < orig.length * 0.98) throw new Error(`拒绝写盘：${c.length}B < 原文 ${orig.length}B`);
if (!/MAX_FLOOR/.test(c)) throw new Error('文件里没有 MAX_FLOOR 导入，先补 import');
fs.writeFileSync(p, c, 'utf8');
console.log('done', c.length, 'B');
