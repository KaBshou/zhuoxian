/**
 * D182 音量控制：契约与存档往返。
 *
 * 为什么单独一个文件：音量是「调一次、之后一直生效」的设置项，最容易出的事故是
 * **只改了引擎没进存档**（刷新后音量弹回去）或**存档里的脏值把引擎设成 NaN 静音**。
 * 这两类事故都不会报错，只在玩家耳边表现为「声音突然又变大了 / 没了」。
 *
 * 往返路径与产品一致：`sessionToSave` → `JSON.stringify` → `JSON.parse` → `deserialize`
 * → `sessionFromSave`。注意 `deserialize` **只收对象**（不吃字符串），JSON 解析是调用方的事。
 */
import { describe, expect, it } from 'vitest';
import { AFFIXES } from '../src/data/affixes';
import { ITEM_BASES } from '../src/data/bases';
import {
  DEFAULT_VOLUME,
  MAX_VOLUME,
  MIN_VOLUME,
  clampVolume,
  createAudioEngine,
} from '../src/core/audio';
import { createCharacter } from '../src/core/character';
import { deserialize } from '../src/core/save';
import { sessionFromSave, sessionToSave } from '../src/core/save-bridge';
import { createSession } from '../src/core/session';

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

function makeSession() {
  return createSession({ classId: 'yujian', seed: 2026, tables: TABLES });
}

/** 产品路径：存档对象 → 文本 → 解析回对象 → deserialize */
function roundTrip(session: ReturnType<typeof makeSession>) {
  const text = JSON.stringify(sessionToSave(session));
  return { text, restored: deserialize(JSON.parse(text)) };
}

/**
 * 最小假 AudioContext：只够 `play()` 走完不掉进 catch。
 * 不用 `as any`（项目禁止），用 `as unknown as` 明确声明「这是测试替身」。
 */
function fakeContext() {
  const node = () => ({
    connect() {
      /* 测试里不建图 */
    },
  });
  const param = () => ({
    value: 0,
    setValueAtTime() {
      /* noop */
    },
    linearRampToValueAtTime() {
      /* noop */
    },
    exponentialRampToValueAtTime() {
      /* noop */
    },
  });
  const ctx = {
    state: 'running',
    currentTime: 0,
    sampleRate: 44100,
    destination: node(),
    createOscillator: () => ({
      ...node(),
      type: 'sine',
      frequency: param(),
      start() {
        /* noop */
      },
      stop() {
        /* noop */
      },
    }),
    createGain: () => ({ ...node(), gain: param() }),
    createBufferSource: () => ({
      ...node(),
      buffer: null,
      start() {
        /* noop */
      },
    }),
    createBuffer: (_channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
    resume: () => Promise.resolve(),
  };
  return ctx as unknown as Parameters<typeof createAudioEngine>[0] extends
    | { createContext?: (() => infer T) | undefined }
    | undefined
    ? T
    : never;
}

describe('音量：引擎与默认值', () => {
  it('未指定时是默认音量（不是 0，0 是静音的另一件事）', () => {
    const a = createAudioEngine({});
    expect(a.volume).toBe(DEFAULT_VOLUME);
    expect(DEFAULT_VOLUME).toBeGreaterThan(0);
  });

  it('setVolume 夹到 0~1', () => {
    const a = createAudioEngine({});
    a.setVolume(5);
    expect(a.volume).toBe(MAX_VOLUME);
    a.setVolume(-3);
    expect(a.volume).toBe(MIN_VOLUME);
  });

  it('setVolume 吃脏值不把引擎搞成 NaN', () => {
    const a = createAudioEngine({ volume: 0.5 });
    a.setVolume(Number.NaN);
    expect(Number.isFinite(a.volume)).toBe(true);
    expect(a.volume).toBe(clampVolume(Number.NaN));
    a.setVolume('abc');
    expect(Number.isFinite(a.volume)).toBe(true);
    a.setVolume(null);
    expect(Number.isFinite(a.volume)).toBe(true);
  });

  it('静音与音量互相独立：音量为 1 但静音时一声都不播', () => {
    // Node 里没有 AudioContext，`ensureContext()` 会返回 null，`played` 永远不动 ——
    // 所以这条必须注入假上下文，否则测的是「Node 没声卡」而不是「静音逻辑」。
    const ctx = fakeContext();
    const a = createAudioEngine({ volume: 1, muted: true, createContext: () => ctx });
    a.unlock();
    a.play('hit');
    expect(a.played).toBe(0);
    a.setMuted(false);
    a.play('hit');
    expect(a.played).toBe(1);
  });
});

describe('音量：进存档', () => {
  it('角色上的 volume 会写进存档再读回来', () => {
    const session = makeSession();
    session.character = { ...session.character, volume: 0.7 };
    const { text, restored } = roundTrip(session);
    expect(text).toContain('"volume":0.7');
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.state.player.volume).toBe(0.7);

    const back = sessionFromSave(restored.state, { tables: TABLES });
    expect(back.character.volume).toBe(0.7);
  });

  it('没设过音量时不写字段（老档与新档都不该被塞一个假默认值）', () => {
    const session = makeSession();
    expect(session.character.volume).toBeUndefined();
    const { text, restored } = roundTrip(session);
    expect(text.includes('"volume"')).toBe(false);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.state.player.volume).toBeUndefined();
    const back = sessionFromSave(restored.state, { tables: TABLES });
    expect(back.character.volume).toBeUndefined();
  });

  it('存档里的越界音量读回来会被夹进 0~1（脏档不许把引擎设成 5 或 -2）', () => {
    const session = makeSession();
    const base = sessionToSave(session);
    const high = { ...base, player: { ...base.player, volume: 5 } };
    const r1 = deserialize(JSON.parse(JSON.stringify(high)));
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.state.player.volume).toBe(MAX_VOLUME);

    const low = { ...base, player: { ...base.player, volume: -2 } };
    const r2 = deserialize(JSON.parse(JSON.stringify(low)));
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.state.player.volume).toBe(MIN_VOLUME);
  });

  it('NaN 音量读回来是 undefined（当成没设过，用默认值）', () => {
    const session = makeSession();
    const base = sessionToSave(session);
    const hacked = { ...base, player: { ...base.player, volume: Number.NaN } };
    const restored = deserialize(JSON.parse(JSON.stringify(hacked)));
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.state.player.volume).toBeUndefined();
  });
});

describe('音量：与静音共存于同一份存档', () => {
  it('muted 与 volume 同时往返，互不覆盖', () => {
    const session = makeSession();
    session.character = { ...session.character, muted: true, volume: 0.3 };
    const { restored } = roundTrip(session);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    const back = sessionFromSave(restored.state, { tables: TABLES });
    expect(back.character.muted).toBe(true);
    expect(back.character.volume).toBe(0.3);
    // 建角色时的默认值不该被这两个字段污染
    const fresh = createCharacter('yujian');
    expect(fresh.muted).toBeUndefined();
    expect(fresh.volume).toBeUndefined();
  });
});
