// 一次性补丁：给 session 加 autoTalents 开关（默认开），用途是"重建忠实度校验"和 ceshi 的 --talents 档
// 注意：repl 统一签名 (old, neu, tag)，且写盘前比对长度，防止再出现"整文件被替换"事故。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/session.ts';
const orig = fs.readFileSync(p, 'utf8');
let c = orig;

function repl(old, neu, tag) {
  const n = c.split(old).length - 1;
  if (n !== 1) throw new Error(`MISS(${n}): ${tag}`);
  c = c.replace(old, neu);
  console.log('ok:', tag);
}

repl(
  `  /** 初始天赋（talent 节点 id 列表；开关会被 switchOverridesFor 解析成运行时覆盖值） */
  readonly talentIds?: readonly string[];`,
  `  /** 初始天赋（talent 节点 id 列表；开关会被 switchOverridesFor 解析成运行时覆盖值） */
  readonly talentIds?: readonly string[];
  /**
   * 是否自动点天赋（默认 true）。
   *
   * 存在的唯一理由是**验收口径**：BALANCE 的天赋数值是按「自动点」标定的，
   * 但要做到「重建忠实度校验 / 无天赋基线对比」就必须能关掉它。
   * 关掉时玩家会攒着天赋点不花（等于少了一部分成长），只用于测量，不是给玩家的选项。
   */
  readonly autoTalents?: boolean;`,
  'option-field',
);

repl(
  `  /** 距下次自动打造还有多久（运行时态，不进存档） */
  craftTimer: number;`,
  `  /** 距下次自动打造还有多久（运行时态，不进存档） */
  craftTimer: number;
  /** 是否自动点天赋（见 SessionOptions.autoTalents） */
  readonly autoTalents: boolean;`,
  'session-field',
);

repl(
  `    firstClearedFloors: [],
    craftTimer: 0,
  };`,
  `    firstClearedFloors: [],
    craftTimer: 0,
    autoTalents: opts.autoTalents !== false,
  };`,
  'session-init',
);

// 两处调用点改成条件调用
repl(
  `        s.character = autoAllocateTalents(s.character, s.firstClearedFloors.length);
        syncBattleFromCharacter(s);`,
  `        if (s.autoTalents) s.character = autoAllocateTalents(s.character, s.firstClearedFloors.length);
        syncBattleFromCharacter(s);`,
  'breakthrough-gate',
);

repl(
  `          s.character = autoAllocateTalents(s.character, s.firstClearedFloors.length);
          syncBattleFromCharacter(s);`,
  `          if (s.autoTalents) s.character = autoAllocateTalents(s.character, s.firstClearedFloors.length);
          syncBattleFromCharacter(s);`,
  'firstclear-gate',
);

if (c.length < orig.length) throw new Error(`拒绝写盘：结果 ${c.length}B 比原文 ${orig.length}B 短`);
fs.writeFileSync(p, c, 'utf8');
console.log('done', c.length, 'B');
