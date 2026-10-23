// 一次性：段④ 度量落地（D57/D63）—— 满级后「仙品件数」与「数值 : 旗子」拆分。
// 起因：段④ 没有「长度」（满级后修为直接丢弃、层 46 封顶），唯一可计量的产出是装备；
// 之前的「满级后 512.4min」是假数（= 窗口 - 满级），必须换成产出口径。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/tools/session-runner.mjs';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let c = raw.replace(/\r\n/g, '\n');

const repl = (oldText, newText, tag) => {
  if (!c.includes(oldText)) throw new Error(`MISS ${tag}`);
  c = c.replace(oldText, newText);
  console.log(`ok ${tag}`);
};

// 1) 计数器声明（紧跟在 itemLandedTotal 之后）
repl(
  '  const seenGroundIds = new Set();',
  [
    '  const seenGroundIds = new Set();',
    '  // 段④ 度量（D57/D63）：满级之后的**仙品件数**。段④ 没有「长度」可量（修为直接丢弃、层 46 封顶），',
    '  // 唯一诚实的产出就是装备 —— 而且按 6 数值 : 3 旗子 分开记，因为「数值传奇」和「机制传奇」',
    '  // 对玩家的吸引力不同，混成一个数会看不出结构。',
    '  let postCapXian = 0;',
    '  let postCapFlagXian = 0;',
    '  const postCapXianByFloor = new Map();',
    "  const FLAG_LEGENDARY_IDS = new Set(['xueji', 'zhuopo', 'shuangying']);",
  ].join('\n'),
  'declare-counters',
);

// 2) 掉落扫描处计数
repl(
  [
    '      if (!seenGroundIds.has(g.id)) {',
    '        seenGroundIds.add(g.id);',
    '        itemLandedThisFrame += 1;',
    '      }',
  ].join('\n'),
  [
    '      if (!seenGroundIds.has(g.id)) {',
    '        seenGroundIds.add(g.id);',
    '        itemLandedThisFrame += 1;',
    '        // 段④：只统计**满级之后**落地的仙品（maxedAt 已定 = 已经过了满级那一帧）',
    '        if (Number.isFinite(maxedAt) && g.item.rarity === \'xian\') {',
    '          postCapXian += 1;',
    '          if (g.item.legendary && FLAG_LEGENDARY_IDS.has(g.item.legendary)) postCapFlagXian += 1;',
    '          postCapXianByFloor.set(s.floor, (postCapXianByFloor.get(s.floor) ?? 0) + 1);',
    '        }',
    '      }',
  ].join('\n'),
  'count-xian',
);

// 3) 返回值里加 postCap 块
repl(
  '    craftLog,\n    bandStats: [...bandStats.values()],',
  [
    '    craftLog,',
    '    /** 段④ 度量（D57/D63）：满级后的仙品产出。minutes = 满级后实际跑的分钟数 */',
    '    postCap: {',
    '      minutes: Number.isFinite(maxedAt) ? Math.max(0, t / 60 - maxedAt) : 0,',
    '      xian: postCapXian,',
    '      flagXian: postCapFlagXian,',
    '      byFloor: [...postCapXianByFloor.entries()].map(([floor, xian]) => ({ floor, xian })).sort((a, b) => a.floor - b.floor),',
    '    },',
    '    bandStats: [...bandStats.values()],',
  ].join('\n'),
  'return-postcap',
);

fs.writeFileSync(p, crlf ? c.replace(/\n/g, '\r\n') : c, 'utf8');
console.log(`done crlf=${crlf} ${raw.length} -> ${c.length}`);
