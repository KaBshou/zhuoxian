/**
 * 音效（D181）。
 *
 * 这里能测什么、不能测什么要先说清：
 * - **不能测**「好不好听」—— 那是耳朵的事，Node 里没有声卡；
 * - **能测**三件事：①配方完整（每个音效名都有声音，别加了个枚举忘了配方）
 *   ②节流/静音/异常兜底这些「不发声的逻辑」对不对
 *   ③**core 到底有没有把 cue 排出来** —— 这是最容易断的一环：
 *   音效引擎写得再好，session 里没有 pushCue 就等于全程静音，而所有既有测试都不会红。
 *
 * 所以假 AudioContext 不是「必要的恶」，它是唯一能看见「播了几次」的眼睛。
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VOLUME,
  MAX_CUES_PER_FRAME,
  SOUND_NAMES,
  SOUND_RECIPES,
  SOUND_THROTTLE_MS,
  clampVolume,
  createAudioEngine,
  type MinimalAudioContext,
  type SoundName,
} from '../src/core/audio';
import {
  createSession,
  drainSoundCues,
  prestige,
  pushCue,
  startWave,
  tickSession,
  type GameSession,
} from '../src/core/session';
import { AFFIXES } from '../src/data/affixes';
import { ITEM_BASES } from '../src/data/bases';

const TABLES = { bases: ITEM_BASES, affixes: AFFIXES };

interface Recorder {
  ctx: MinimalAudioContext;
  readonly started: { type: string; freq: number }[];
  readonly gains: number[];
  resumes: number;
}

/**
 * 一个只会记账的假 AudioContext。
 *
 * 必须实现引擎真正会碰到的每一个方法 —— 漏一个就会在 play 里抛，
 * 而引擎会把它吞进 `failed`，于是测试得到「播放次数 0」这种看不出原因的失败。
 */
function makeRecorder(state: 'running' | 'suspended' = 'running'): Recorder {
  const started: { type: string; freq: number }[] = [];
  const gains: number[] = [];
  const rec: Recorder = { started, gains, resumes: 0, ctx: null as unknown as MinimalAudioContext };
  const param = (store: number[]) => ({
    setValueAtTime(value: number) {
      store.push(value);
      return undefined;
    },
    linearRampToValueAtTime(value: number) {
      store.push(value);
      return undefined;
    },
    exponentialRampToValueAtTime(value: number) {
      store.push(value);
      return undefined;
    },
  });
  const node = () => ({
    connect() {
      return undefined;
    },
    disconnect() {
      return undefined;
    },
    start() {
      return undefined;
    },
    stop() {
      return undefined;
    },
  });
  const ctx = {
    currentTime: 0,
    state,
    destination: {},
    sampleRate: 48000,
    resume() {
      rec.resumes += 1;
      return Promise.resolve();
    },
    createOscillator() {
      const freqStore: number[] = [];
      const osc = {
        type: 'sine',
        frequency: param(freqStore),
        ...node(),
        start() {
          started.push({ type: osc.type, freq: freqStore[0] ?? 0 });
          return undefined;
        },
      };
      return osc;
    },
    createGain() {
      // 直接写进 rec.gains：音量断言要看的是「真正下发到 GainNode 的值」，
      // 存到局部数组里等于测了个寂寞（第一版就是这么假绿的）。
      return { gain: param(gains), ...node() };
    },
    createBufferSource() {
      return {
        buffer: null as unknown,
        ...node(),
      };
    },
    createBuffer(_ch: number, length: number) {
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    },
  };
  rec.ctx = ctx as unknown as MinimalAudioContext;
  return rec;
}

function makeSession(seed = 4321): GameSession {
  const s = createSession({ classId: 'yujian', seed, tables: TABLES });
  startWave(s);
  return s;
}

describe('音效配方（数据完整性）', () => {
  it('每个音效名都有配方，且没有多余配方', () => {
    const names = Object.keys(SOUND_RECIPES).sort();
    expect(names).toEqual([...SOUND_NAMES].sort());
  });

  it('音效名不重复', () => {
    expect(new Set(SOUND_NAMES).size).toBe(SOUND_NAMES.length);
  });

  it('每个配方都是可听的声音：时长 >0、音量 >0、频率 >0', () => {
    for (const name of SOUND_NAMES) {
      const layers = SOUND_RECIPES[name];
      expect(layers.length, name).toBeGreaterThan(0);
      for (const layer of layers) {
        expect(layer.dur, name).toBeGreaterThan(0);
        expect(layer.gain, name).toBeGreaterThan(0);
        expect(layer.freq, name).toBeGreaterThan(0);
        if (layer.toFreq !== undefined) expect(layer.toFreq, name).toBeGreaterThan(0);
      }
    }
  });

  it('节流表里只出现真实存在的音效名', () => {
    for (const key of Object.keys(SOUND_THROTTLE_MS)) {
      expect(SOUND_NAMES).toContain(key as SoundName);
      expect(SOUND_THROTTLE_MS[key as SoundName], key).toBeGreaterThan(0);
    }
  });
});

describe('音量', () => {
  it('正常值原样通过、越界被夹', () => {
    expect(clampVolume(0.3)).toBe(0.3);
    expect(clampVolume(2)).toBe(1);
    expect(clampVolume(-1)).toBe(0);
  });

  it('脏值回默认值（不让 NaN 进 GainNode）', () => {
    expect(clampVolume(Number.NaN)).toBe(DEFAULT_VOLUME);
    expect(clampVolume(Number.POSITIVE_INFINITY)).toBe(DEFAULT_VOLUME);
    expect(clampVolume('abc')).toBe(DEFAULT_VOLUME);
    expect(clampVolume(null)).toBe(DEFAULT_VOLUME);
  });
});

describe('音效引擎', () => {
  it('会真的往音频上下文里塞声音', () => {
    const rec = makeRecorder();
    const engine = createAudioEngine({ createContext: () => rec.ctx, now: () => 0 });
    engine.play('hit');
    expect(engine.played).toBe(1);
    expect(rec.started.length).toBeGreaterThan(0);
    expect(rec.started[0]?.type).toBe('square');
  });

  it('静音时不播（但也不报错）', () => {
    const rec = makeRecorder();
    const engine = createAudioEngine({ createContext: () => rec.ctx, now: () => 0, muted: true });
    engine.play('hit');
    engine.play('crit');
    expect(engine.played).toBe(0);
    expect(rec.started.length).toBe(0);
    // 关静音之后必须立刻能响
    expect(engine.toggleMute()).toBe(false);
    engine.play('hit');
    expect(engine.played).toBe(1);
  });

  it('同名音效有节流，不同名互不影响', () => {
    const rec = makeRecorder();
    let t = 0;
    const engine = createAudioEngine({ createContext: () => rec.ctx, now: () => t });
    engine.play('hit'); // t=0 第一条
    t = 10; // 小于 55ms 闸
    engine.play('hit');
    expect(engine.throttled).toBe(1);
    expect(engine.played).toBe(1);
    // 不同名不受影响
    engine.play('kill');
    expect(engine.played).toBe(2);
    // 过了闸就能再响
    t = 100;
    engine.play('hit');
    expect(engine.played).toBe(3);
  });

  it('没有音频能力时安静降级（Node 里就是这条路径）', () => {
    const engine = createAudioEngine({ createContext: () => null, now: () => 0 });
    expect(() => engine.play('hit')).not.toThrow();
    expect(engine.played).toBe(0);
    expect(engine.failed).toBe(0);
  });

  it('创建上下文抛异常也不崩，记一次 failed', () => {
    const engine = createAudioEngine({
      createContext: () => {
        throw new Error('no audio device');
      },
      now: () => 0,
    });
    expect(() => engine.play('hit')).not.toThrow();
    expect(engine.played).toBe(0);
    expect(engine.failed).toBe(1);
  });

  it('suspended 状态会尝试 resume（浏览器策略要求手势）', () => {
    const rec = makeRecorder('suspended');
    const engine = createAudioEngine({ createContext: () => rec.ctx, now: () => 0 });
    engine.play('hit');
    expect(rec.resumes).toBeGreaterThan(0);
  });

  it('音量可以调，且落进 GainNode', () => {
    const rec = makeRecorder();
    const engine = createAudioEngine({ createContext: () => rec.ctx, now: () => 0 });
    engine.setVolume(0.1);
    expect(engine.volume).toBe(0.1);
    engine.play('hit');
    // 第一层音的 gain 峰值 = layer.gain * volume
    expect(rec.gains.some((g) => Math.abs(g - 0.16 * 0.1) < 1e-6)).toBe(true);
  });
});

describe('会话里的音效 cue（最容易断的一环）', () => {
  it('打起来会排出音效 cue', () => {
    const s = makeSession();
    let total = 0;
    for (let sec = 0; sec < 20; sec++) {
      tickSession(s, 1);
      total += drainSoundCues(s).length;
    }
    expect(total).toBeGreaterThan(0);
  });

  it('drain 之后队列清空（不重复播）', () => {
    const s = makeSession();
    pushCue(s, 'hit');
    expect(drainSoundCues(s)).toEqual(['hit']);
    expect(drainSoundCues(s)).toEqual([]);
  });

  it('队列有上限，超了丢新的、保留先到的', () => {
    const s = makeSession();
    for (let i = 0; i < MAX_CUES_PER_FRAME + 5; i++) pushCue(s, i === 0 ? 'boss' : 'hit');
    const cues = drainSoundCues(s);
    expect(cues.length).toBe(MAX_CUES_PER_FRAME);
    // 第一条是「大事」，必须保住
    expect(cues[0]).toBe('boss');
  });

  it('死亡会排 death', () => {
    const s = makeSession();
    // 把怪堆到玩家身上并让玩家只剩 1 血，逼出一次真实死亡
    s.character = { ...s.character, step: 0 };
    s.battle.player.hp = 1;
    // MonsterInPlay 的 damage/attackInterval 是 readonly：整体替换而不是原地改
    s.battle.monsters = s.battle.monsters.map((m) => ({
      ...m,
      x: s.battle.player.x,
      y: s.battle.player.y,
      damage: 999,
      attackInterval: 0.1,
      cooldown: 0,
    }));
    drainSoundCues(s);
    let seen = false;
    for (let i = 0; i < 600 && !seen; i++) {
      tickSession(s, 1 / 60);
      if (drainSoundCues(s).includes('death')) seen = true;
    }
    expect(seen).toBe(true);
  });

  it('轮回会排 ascend，且不残留上一帧的 cue', () => {
    const s = makeSession();
    s.character = { ...s.character, step: 80 };
    s.battle.reviveCooldown = 0;
    pushCue(s, 'hit');
    expect(prestige(s)).toBe(true);
    expect(drainSoundCues(s)).toEqual(['ascend']);
  });
});
