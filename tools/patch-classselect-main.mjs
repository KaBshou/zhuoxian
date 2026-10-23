// 一次性：main.ts 接「开局选道统」状态机（phase: select | play）
// 纪律：选道统期间不许存档（否则会把临时 yujian 会话写进新档）。
import fs from 'node:fs';

const P = 'F:/dsh-work/zhuoxian/src/main.ts';
let c = fs.readFileSync(P, 'utf8');
const before = c.length;

function repl(a, b, tag) {
  if (!c.includes(a)) throw new Error('MISS: ' + tag);
  const n = c.split(a).length - 1;
  if (n !== 1) throw new Error(`AMBIGUOUS(${n}): ${tag}`);
  c = c.replace(a, b);
  console.log('OK:', tag);
}

repl(
  `import { BattleRenderer } from './render/battle-renderer';`,
  `import { BattleRenderer } from './render/battle-renderer';
import { CLASSES, getClass, type ClassId } from './data/classes';
import { indexFromDigit, moveClassIndex } from './render/class-select';`,
  'imports',
);

repl(
  `const autosaver = new Autosaver(storage, () => session, TABLES);
const loaded = autosaver.load();

if (loaded) {
  session = loaded.session;
} else {
  startWave(session);
}`,
  `const autosaver = new Autosaver(storage, () => session, TABLES);
const loaded = autosaver.load();

/**
 * 两个阶段：新号先选道统（D1：6 职业，开局选一个、之后不能转职），有档直接进。
 *
 * 为什么阶段要显式写出来：选道统时那局占位会话还没开始，如果照着跑
 * 主循环 + 自动存档，会把一个 yujian 的空档写进新档 —— 玩家下次打开
 * 就"已经选过剑修了"，而他从没选过。
 */
type Phase = 'select' | 'play';

let phase: Phase = loaded ? 'play' : 'select';
let pickIndex = 0;
let selectTime = 0;

if (loaded) {
  session = loaded.session;
} else {
  startWave(session);
}

/** 确认道统：建真正的一局，落盘，进 play */
function confirmClass(): void {
  const def = CLASSES[Math.max(0, Math.min(CLASSES.length - 1, pickIndex))];
  session = createSession({
    classId: def.id as ClassId,
    seed: Date.now() & 0x7fffffff,
    tables: TABLES,
  });
  startWave(session);
  phase = 'play';
  session.log.push({ text: \`道统既定：\${def.name}　入九幽魔渊\`, color: '#d4a13c', age: 0 });
  autosaver.saveNow();
}`,
  'phase-state',
);

repl(
  `const loop = new Loop(
  (dt) => {
    tickSession(session, dt);
    autosaver.tick(dt);`,
  `const loop = new Loop(
  (dt) => {
    if (phase === 'select') {
      selectTime += dt;
      return;
    }
    tickSession(session, dt);
    autosaver.tick(dt);`,
  'loop-update',
);

repl(
  `  () => renderer.render(session),
);`,
  `  () => {
    if (phase === 'select') renderer.renderClassSelect(pickIndex, selectTime);
    else renderer.render(session);
  },
);`,
  'loop-render',
);

// 键盘：选道统阶段的键位要在战斗键位之前拦截
repl(
  `window.addEventListener('keydown', (e) => {
  // E = 法宝详情（"我身上这 9 件到底有什么灵纹"的答案）`,
  `window.addEventListener('keydown', (e) => {
  // ── 选道统阶段：方向键/数字键选，Enter 确认 ──
  if (phase === 'select') {
    const digit = indexFromDigit(e.code, CLASSES.length);
    if (digit !== null) {
      e.preventDefault();
      pickIndex = digit;
      return;
    }
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
      e.preventDefault();
      confirmClass();
      return;
    }
    if (e.code === 'ArrowLeft') {
      e.preventDefault();
      pickIndex = moveClassIndex(pickIndex, -1, 0);
      return;
    }
    if (e.code === 'ArrowRight') {
      e.preventDefault();
      pickIndex = moveClassIndex(pickIndex, 1, 0);
      return;
    }
    if (e.code === 'ArrowUp') {
      e.preventDefault();
      pickIndex = moveClassIndex(pickIndex, 0, -1);
      return;
    }
    if (e.code === 'ArrowDown') {
      e.preventDefault();
      pickIndex = moveClassIndex(pickIndex, 0, 1);
      return;
    }
    return;
  }
  // E = 法宝详情（"我身上这 9 件到底有什么灵纹"的答案）`,
  'keys',
);

// 存档守卫：选道统期间绝不写盘
repl(
  `function flush(): void {
  if (suppressFlush) return;
  autosaver.saveNow();
}`,
  `function flush(): void {
  if (suppressFlush) return;
  if (phase !== 'play') return;
  autosaver.saveNow();
}`,
  'flush-guard',
);

// 调试钩子：给探针读阶段、读候选项、确认
repl(
  `      /** 切换法宝详情面板（探针验收用） */
      toggleDetail(): boolean;`,
  `      /** 切换法宝详情面板（探针验收用） */
      toggleDetail(): boolean;
      /** 当前阶段（探针验收选道统用） */
      readonly phase: Phase;
      /** 选道统阶段的高亮下标 */
      readonly pickIndex: number;
      /** 六名候选道统的 id（顺序 = 卡片顺序） */
      classIds(): string[];
      /** 直接确认某个道统（探针免键盘路径用） */
      chooseClass(id: string): boolean;`,
  'hook-types',
);

repl(
  `    toggleBreakdown: () => renderer.toggleBreakdown(),
    toggleDetail: () => renderer.toggleDetail(),
  };`,
  `    toggleBreakdown: () => renderer.toggleBreakdown(),
    toggleDetail: () => renderer.toggleDetail(),
    get phase() {
      return phase;
    },
    get pickIndex() {
      return pickIndex;
    },
    classIds: () => CLASSES.map((d) => d.id),
    chooseClass: (id: string) => {
      if (phase !== 'select') return false;
      const idx = CLASSES.findIndex((d) => d.id === id);
      if (idx < 0) return false;
      pickIndex = idx;
      confirmClass();
      return true;
    },
  };`,
  'hook-impl',
);

if (c.length < before * 0.95) throw new Error('结果比原文短，拒绝写盘');
fs.writeFileSync(P, c, 'utf8');
console.log('written', before, '->', c.length);
