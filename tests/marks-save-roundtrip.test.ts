/**
 * 存档往返：渊痕（marks）与「到过的最高层」（maxFloorReached）不能丢。
 *
 * 为什么单独一份（不复用 `tests/marks.test.ts` / `tests/save-bridge.test.ts`）：
 *   - 那两个测的是**存储层之上**的语义（`deserialize` 之后再断言对象）。
 *     `deserialize` 是逐字段重建的，如果某个字段在 `serialize` 里没写进去，
 *     对象测法会「自动按 0 兜底」通过 —— 真正的 bug（漏写字段）抓不到。
 *   - 这里从**存档原文**（localStorage 里的那段 JSON 字符串）出发：
 *     先断言原始 JSON 里真的有这两个字段且值对，再走 `deserialize` + `sessionFromSave`
 *     断言恢复后的运行时值。任何一段掉链子都会红。
 *
 * 背景（D36-A）：满级后修为 1:1 转渊痕，渊痕是几十小时的积累物；
 * maxFloorReached 丢了会让选层上限倒退（深层进度永久丢失）。
 */
import { describe, expect, it, afterEach } from 'vitest';
import { createSession, startWave, tickSession, highestFloorReached, floorSelectableMax } from '../src/core/session';
import { sessionToSave, sessionFromSave } from '../src/core/save-bridge';
import { deserialize, type SaveState } from '../src/core/save';
import { createLocalStorageAdapter, createMemoryAdapter, SAVE_KEY } from '../src/core/storage';
import { ITEM_BASES } from '../src/data/bases';
import { AFFIXES } from '../src/data/affixes';

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

const makeSession = (seed = 4321) => {
  const s = createSession({ classId: 'yujian', seed, tables: TABLES });
  startWave(s);
  return s;
};

/** 存档原文（就是写进 localStorage 的那串字符） */
const rawOf = (s: ReturnType<typeof makeSession>): string => JSON.stringify(sessionToSave(s));

describe('存档往返 · 渊痕与最高层（从存档原文读）', () => {
  const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
  afterEach(() => {
    if (originalLocalStorage === undefined) {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    } else {
      (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
    }
  });

  /** 最小 localStorage 替身：只用 Map 记原始字符串，不参与任何序列化逻辑 */
  const installFakeLocalStorage = () => {
    const map = new Map<string, string>();
    const fake = {
      getItem: (k: string) => (map.has(k) ? map.get(k) : null),
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
    };
    (globalThis as { localStorage?: unknown }).localStorage = fake;
    return fake;
  };

  it('原文里真的有 player.marks 与 progress.maxFloorReached，且值不含糊', () => {
    const s = makeSession();
    s.character = { ...s.character, marks: 4_623_000 };
    s.floor = 27;
    s.maxFloorReached = 31;

    const raw = rawOf(s);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const player = parsed.player as Record<string, unknown>;
    const progress = parsed.progress as Record<string, unknown>;

    // 字段必须**存在**（不是 undefined、不是靠 deserialize 兜底出来的）
    expect(Object.prototype.hasOwnProperty.call(player, 'marks')).toBe(true);
    expect(player.marks).toBe(4_623_000);
    expect(Object.prototype.hasOwnProperty.call(progress, 'maxFloorReached')).toBe(true);
    expect(progress.maxFloorReached).toBe(31);
    // 7 位数不能被浮点弄成 4.623e6 之外的形状
    expect(Number.isInteger(player.marks)).toBe(true);
  });

  it('经真实 localStorage 适配器往返后：原文一致、恢复值一致', () => {
    installFakeLocalStorage();
    const storage = createLocalStorageAdapter();

    const s = makeSession(777);
    // 跑 30 秒让装备/背包/通货都有非空值（避免「全默认值所以碰巧相等」）
    for (let i = 0; i < 60 * 30; i++) tickSession(s, 1 / 60);
    s.character = { ...s.character, marks: 1_234_567 };
    s.floor = 24;
    s.maxFloorReached = 33;

    const raw = rawOf(s);
    storage.write(SAVE_KEY, raw);

    // —— 原文层：从 localStorage 里读回来的字符串必须一模一样
    const storedRaw = storage.read(SAVE_KEY);
    expect(storedRaw).toBe(raw);
    const stored = JSON.parse(storedRaw as string) as {
      player: { marks?: number };
      progress: { maxFloorReached?: number };
    };
    expect(stored.player.marks).toBe(1_234_567);
    expect(stored.progress.maxFloorReached).toBe(33);

    // —— 语义层：deserialize + 重建 session
    const back = deserialize(stored);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const r = sessionFromSave(back.state, { tables: TABLES });
    expect(r.character.marks).toBe(1_234_567);
    expect(r.maxFloorReached).toBe(33);
    // 选层上限不能倒退到当前层（24），必须是到过的最深一层
    expect(highestFloorReached(r)).toBe(33);
    expect(floorSelectableMax(r)).toBe(33);
  });

  it('老档（没有这两个字段）：marks 按 0、maxFloorReached 退回当前层，且不报错', () => {
    const s = makeSession(888);
    s.floor = 12;
    s.maxFloorReached = 12;
    s.character = { ...s.character, marks: 0 };

    // 模拟老档：把新字段从原文里删掉
    const parsed = JSON.parse(rawOf(s)) as {
      player: Record<string, unknown>;
      progress: Record<string, unknown>;
    };
    delete parsed.player.marks;
    delete parsed.progress.maxFloorReached;

    const back = deserialize(parsed);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const r = sessionFromSave(back.state, { tables: TABLES });
    expect(r.character.marks).toBe(0);
    expect(r.maxFloorReached).toBe(12);
    expect(highestFloorReached(r)).toBe(12);
  });

  it('memoryAdapter 也走同一条路（Node 测试环境无 localStorage 时的降级）', () => {
    const storage = createMemoryAdapter();
    const s = makeSession(999);
    s.character = { ...s.character, marks: 987_654 };
    s.floor = 5;
    s.maxFloorReached = 9;
    storage.write(SAVE_KEY, rawOf(s));

    const stored = JSON.parse(storage.read(SAVE_KEY) as string) as SaveState;
    const back = deserialize(stored);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const r = sessionFromSave(back.state, { tables: TABLES });
    expect(r.character.marks).toBe(987_654);
    expect(highestFloorReached(r)).toBe(9);
  });
});
