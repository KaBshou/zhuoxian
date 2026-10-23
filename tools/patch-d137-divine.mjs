// D137：定渊改成一次性解锁「锁层挂机」（不再跳级）—— 方案 d
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve('.');
function read(p) {
  const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
  return { text: raw.replace(/\r\n/g, '\n'), crlf: raw.includes('\r\n') };
}
function write(p, text, crlf) {
  fs.writeFileSync(path.join(ROOT, p), crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
}
function patch(p, edits) {
  const { text, crlf } = read(p);
  let t = text;
  for (const [tag, oldText, newText] of edits) {
    const at = t.indexOf(oldText);
    if (at < 0) throw new Error(`MISS ${p} :: ${tag}`);
    if (t.indexOf(oldText, at + 1) >= 0) throw new Error(`AMBIGUOUS ${p} :: ${tag}`);
    t = t.slice(0, at) + newText + t.slice(at + oldText.length);
  }
  if (t.length < text.length * 0.9) throw new Error(`SHRINK ${p}`);
  write(p, t, crlf);
  console.log(`patched ${p} (${text.length} -> ${t.length})`);
}

// 1) 角色存档字段：定渊已解锁
patch('src/core/character.ts', [
  [
    'diveLockUnlocked',
    '  readonly marks?: number;',
    [
      '  readonly marks?: number;',
      '  /**',
      '   * 定渊是否已解锁（D137 方案 d）。一次性永久：花 720k 渊痕解锁「锁层挂机」。',
      '   *',
      '   * 为什么不再是「跳层」：跳级会**买走时长**（24h 预算靠每轮 4~6h），而且全重置后',
      '   * 从深层起跑等于自杀（c2 已证明层 1 都能死）。实测携带 3000 万渊痕时长一动不动 ⇒',
      '   * 时长不由渊痕决定 ⇒ 渊痕的出口应服务「质量/效率」，不是「跳过量」。',
      '   */',
      '  readonly diveLockUnlocked?: boolean;',
    ].join('\n'),
  ],
]);

// 2) 定渊：一次性解锁
patch('src/core/marks-runtime.ts', [
  [
    'setStartFloor body',
    [
      "    case 'setStartFloor': {",
      '      // 定渊 = 立刻把人送到「到过的最深层」。它不产生战力，只省掉重新下潜的时间。',
      '      const target = highestFloorReached(s);',
      '      if (target <= s.floor) {',
      '        return { ok: false, reason: `已经在最深处（第 ${s.floor} 层）`, message: \'\' };',
      '      }',
      '      const moved = setFloor(s, target);',
      '      if (!moved) {',
      "        return { ok: false, reason: '这一层还下不去', message: '' };",
      '      }',
      '      const msg = `定渊：踏渊而下，直落第 ${target} 层`;',
      "      pushLog(s, msg, '#4fd1c5');",
      '      break;',
      '    }',
    ].join('\n'),
    [
      "    case 'setStartFloor': {",
      '      // 定渊（D137 方案 d）：**一次性永久解锁「锁层挂机」**，不是跳层。',
      '      //',
      '      // 旧实现是「送到 highestFloorReached」—— 但 prestige() 把 maxFloorReached 重置成 1，',
      '      // 于是新周目一开始就返回「已经在最深处（第 1 层）」，一分钱花不出去（实测 3000 万渊痕',
      '      // 只花在夺造化/聚灵上，时长一动不动）。而「跳层」本身也不该存在：它买走时长，',
      '      // 且全重置后从深层起跑等于自杀。',
      '      //',
      '      // 现在它能做的正是玩家真正需要的：**停在一层反复刷**（回层 21 刷修为、层 46 刷仙品、',
      '      // 层 76 刷装备）。按 L 开关，不跳级、不改「打过的层才算到过」的语义。',
      '      if (s.character.diveLockUnlocked) {',
      "        return { ok: false, reason: '定渊已开（按 L 开关锁层）', message: '' };",
      '      }',
      '      s.character = { ...s.character, diveLockUnlocked: true };',
      "      pushLog(s, '定渊：已通之层任你驻足（按 L 锁层挂机）', '#4fd1c5');",
      '      break;',
      '    }',
    ].join('\n'),
  ],
]);

// 3) session：diveLock 运行时开关 + 下潜分支
patch('src/core/session.ts', [
  [
    'diveLock field',
    '  /** 当前周目（D130） */
  cycle: number;',
    [
      '  /** 当前周目（D130） */
  cycle: number;',
      '  /**',
      '   * 锁层挂机（D137）：为 true 时清完一层不再下潜，停在本层反复刷。',
      '   * 需要先花渊痕开定渊（`character.diveLockUnlocked`）；运行时态，不入档。',
      '   */',
      '  diveLock: boolean;',
    ].join('\n'),
  ],
  [
    'init diveLock',
    '    cycle,',
    '    cycle,\n    diveLock: false,',
  ],
  [
    'descent guard',
    '      if (s.wave % BOSS_EVERY === 0 && s.floor < MAX_FLOOR) {',
    '      const lockHolding = s.diveLock && s.character.diveLockUnlocked === true && s.floor < MAX_FLOOR;\n      if (s.wave % BOSS_EVERY === 0 && s.floor < MAX_FLOOR && !lockHolding) {',
  ],
]);

// 4) save：持久化 diveLockUnlocked
patch('src/core/save.ts', [
  [
    'save field',
    '    readonly cycle?: number;',
    '    readonly cycle?: number;\n    /** D137：定渊是否已解锁（一次性永久） */\n    readonly diveLockUnlocked?: boolean;',
  ],
]);
console.log('done');
