/**
 * 音效：全部**现场合成**，零素材文件。
 *
 * 为什么不用音频文件：这个项目从第一天就定了「零运行时依赖 + 纯静态站点」，
 * 加一堆 .wav 会把仓库撑大、还要处理加载/解码/静音的异步错误。
 * WebAudio 用振荡器 + 噪声现场合成，一个字节都不用下载，而且音量/音高能随玩法变化。
 *
 * 为什么放在 core 而不是 render：音效是「发生了什么」的表达，不是「画成什么样」。
 * 但它**不认识 AudioContext** —— core 只往会话里塞一个 cue 名字，
 * 主循环（main.ts）drain 之后交给渲染侧播放。理由：
 * ①离线结算/数值模拟跑 session 时绝不能发声、绝不能创建 AudioContext；
 * ②core 里一旦出现 `new AudioContext()` 就无法在 Node 单测里跑（本仓 50+ 个测试文件都 import core）。
 *
 * 音量与静音必须入档：玩家关掉音效，刷新后不能自己又响起来（这是最招骂的一类小事）。
 */

/** 音效名。新增音效时必须同时补 `SOUND_RECIPES`，否则 tsc 会报缺 key。 */
export type SoundName =
  | 'hit'
  | 'crit'
  | 'kill'
  | 'boss'
  | 'drop'
  | 'currency'
  | 'gem'
  | 'legendary'
  | 'levelup'
  | 'ascend'
  | 'death'
  | 'turbid'
  | 'ui'
  | 'deny';

export const SOUND_NAMES: readonly SoundName[] = [
  'hit',
  'crit',
  'kill',
  'boss',
  'drop',
  'currency',
  'gem',
  'legendary',
  'levelup',
  'ascend',
  'death',
  'turbid',
  'ui',
  'deny',
];

export const DEFAULT_VOLUME = 0.45;
export const MIN_VOLUME = 0;
export const MAX_VOLUME = 1;

/** cue 队列上限：一帧内最多播这么多个（放置游戏一秒能杀十几只，否则会糊成白噪音）。 */
export const MAX_CUES_PER_FRAME = 6;

/** 音量钳制：脏值（NaN/字符串/Infinity）一律回默认值，不让它把 GainNode 搞崩。 */
export function clampVolume(value: unknown): number {
  // 先挡「缺失」再转数：`Number(null)` 是 0，会把「没设过音量」当成「静音」，
  // 玩家一进游戏就发现没声音还以为是 bug。0 是合法的音量（静音），null 不是。
  if (value === null || value === undefined || value === '') return DEFAULT_VOLUME;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_VOLUME;
  return Math.min(MAX_VOLUME, Math.max(MIN_VOLUME, n));
}

/** 一层声音：一个振荡器（或一段噪声）从 freq 滑到 toFreq，持续 dur 秒。 */
export interface SoundRecipe {
  readonly freq: number;
  readonly toFreq?: number;
  readonly dur: number;
  readonly type: OscillatorType;
  readonly gain: number;
  /** >0 时额外叠一层噪声（0~1 表示相对强度） */
  readonly noise?: number;
  /** 相对本次播放起点的延迟（秒），用来做琶音 */
  readonly delay?: number;
}

/**
 * 音色配方。
 *
 * 设计口径：
 * - 受击/暴击用方波（硬、有攻击性），掉落用三角波（亮、干净）；
 * - 上行的代表「得到」（掉落/突破），下行的代表「失去」（死亡）；
 * - 同一事件的多个音层用 `delay` 排成琶音，避免和弦听起来像报警器。
 */
export const SOUND_RECIPES: Record<SoundName, readonly SoundRecipe[]> = {
  hit: [{ freq: 180, toFreq: 110, dur: 0.07, type: 'square', gain: 0.16 }],
  crit: [
    { freq: 320, toFreq: 170, dur: 0.09, type: 'square', gain: 0.14 },
    { freq: 640, toFreq: 520, dur: 0.07, type: 'triangle', gain: 0.08 },
  ],
  kill: [{ freq: 150, toFreq: 60, dur: 0.12, type: 'sawtooth', gain: 0.12 }],
  boss: [
    { freq: 95, toFreq: 42, dur: 0.4, type: 'sawtooth', gain: 0.18 },
    { freq: 60, dur: 0.3, type: 'square', gain: 0.08, noise: 0.25 },
  ],
  drop: [{ freq: 520, toFreq: 780, dur: 0.09, type: 'triangle', gain: 0.1 }],
  currency: [{ freq: 720, toFreq: 980, dur: 0.06, type: 'triangle', gain: 0.07 }],
  gem: [{ freq: 620, toFreq: 950, dur: 0.1, type: 'triangle', gain: 0.09 }],
  legendary: [
    { freq: 660, toFreq: 990, dur: 0.16, type: 'triangle', gain: 0.12 },
    { freq: 990, toFreq: 1320, dur: 0.16, type: 'triangle', gain: 0.08, delay: 0.06 },
  ],
  levelup: [
    { freq: 523, dur: 0.1, type: 'triangle', gain: 0.11 },
    { freq: 659, dur: 0.1, type: 'triangle', gain: 0.11, delay: 0.09 },
    { freq: 784, dur: 0.16, type: 'triangle', gain: 0.12, delay: 0.18 },
  ],
  ascend: [
    { freq: 523, dur: 0.12, type: 'triangle', gain: 0.1 },
    { freq: 659, dur: 0.12, type: 'triangle', gain: 0.1, delay: 0.1 },
    { freq: 784, dur: 0.12, type: 'triangle', gain: 0.1, delay: 0.2 },
    { freq: 1046, dur: 0.3, type: 'triangle', gain: 0.12, delay: 0.3 },
  ],
  death: [{ freq: 220, toFreq: 55, dur: 0.5, type: 'sawtooth', gain: 0.14 }],
  turbid: [
    { freq: 120, dur: 0.35, type: 'square', gain: 0.06, noise: 0.35 },
    { freq: 70, toFreq: 40, dur: 0.3, type: 'sawtooth', gain: 0.09 },
  ],
  ui: [{ freq: 440, toFreq: 520, dur: 0.05, type: 'triangle', gain: 0.06 }],
  deny: [{ freq: 200, toFreq: 150, dur: 0.08, type: 'square', gain: 0.08 }],
};

/** 同名音效的最小间隔（毫秒）。没有它，一秒杀 12 只怪会叠成噪音。 */
export const SOUND_THROTTLE_MS: Partial<Record<SoundName, number>> = {
  hit: 55,
  crit: 70,
  kill: 85,
  drop: 150,
  currency: 140,
  gem: 180,
  ui: 60,
};

/** 假 AudioContext 只需要这么点能力（单测里用它替身，不需要真声卡）。 */
interface MinimalParam {
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
}
interface MinimalNode {
  connect(target: unknown): unknown;
  disconnect?(): unknown;
  start?(time?: number): unknown;
  stop?(time?: number): unknown;
  setPeriodicWave?(wave: unknown): unknown;
}
export interface MinimalAudioContext {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: unknown;
  readonly sampleRate?: number;
  resume?(): Promise<unknown>;
  createOscillator(): { type: string; frequency: MinimalParam } & MinimalNode;
  createGain(): { gain: MinimalParam } & MinimalNode;
  createBufferSource?(): { buffer: unknown; loop?: boolean } & MinimalNode;
  createBuffer?(channels: number, length: number, sampleRate: number): { getChannelData(ch: number): Float32Array };
  createBiquadFilter?(): { type: string; frequency: MinimalParam } & MinimalNode;
}

export interface AudioEngine {
  readonly muted: boolean;
  readonly volume: number;
  setMuted(value: boolean): void;
  setVolume(value: unknown): void;
  /** 返回切换后的 muted 值 */
  toggleMute(): boolean;
  /** 用户手势后调用一次（浏览器策略要求音频由手势解锁） */
  unlock(): void;
  play(name: SoundName): void;
  /** 实际播放次数（不含被静音/节流挡掉的），探针与单测用 */
  readonly played: number;
  /** 被节流挡掉的次数 */
  readonly throttled: number;
  /** 浏览器拒绝/异常次数（不抛错，音效不值得让游戏崩） */
  readonly failed: number;
}

export interface AudioEngineOptions {
  readonly createContext?: () => MinimalAudioContext | null;
  readonly now?: () => number;
  readonly muted?: boolean;
  readonly volume?: number;
}

/**
 * 建一个音效引擎。
 *
 * 关键取舍：
 * - **AudioContext 懒创建**：构造时创建在 Chrome 上会立刻进入 `suspended` 并打印警告，
 *   而且如果页面还没被点击过，创建了也发不出声；所以等第一次真要播（或 unlock）时才建。
 * - **任何异常都吞掉**：没有音频设备、被浏览器策略拦、并发上限都会抛；音效坏了不该让游戏停。
 */
export function createAudioEngine(opts: AudioEngineOptions = {}): AudioEngine {
  const createContext = opts.createContext ?? defaultCreateContext;
  const now = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));

  let ctx: MinimalAudioContext | null = null;
  let ctxTried = false;
  let muted = opts.muted === true;
  let volume = clampVolume(opts.volume ?? DEFAULT_VOLUME);
  const lastAt = new Map<SoundName, number>();
  let played = 0;
  let throttled = 0;
  let failed = 0;

  function ensureContext(): MinimalAudioContext | null {
    if (ctx) return ctx;
    if (ctxTried) return null;
    ctxTried = true;
    try {
      ctx = createContext();
    } catch {
      failed += 1;
      ctx = null;
    }
    return ctx;
  }

  function spawnNoise(context: MinimalAudioContext, c: MinimalAudioContext['destination'], start: number, dur: number, strength: number): void {
    const makeSource = context.createBufferSource;
    const makeBuffer = context.createBuffer;
    if (!makeSource || !makeBuffer) return;
    try {
      const length = Math.max(1, Math.floor((context.sampleRate ?? 44100) * dur));
      const buffer = makeBuffer.call(context, 1, length, context.sampleRate ?? 44100);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * strength;
      const src = makeSource.call(context);
      src.buffer = buffer;
      const gain = context.createGain();
      gain.gain.setValueAtTime(strength * volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      src.connect(gain);
      gain.connect(c);
      src.start?.(start);
      src.stop?.(start + dur + 0.02);
    } catch {
      failed += 1;
    }
  }

  function playLayer(context: MinimalAudioContext, layer: SoundRecipe, base: number): void {
    const start = base + (layer.delay ?? 0);
    const osc = context.createOscillator();
    osc.type = layer.type;
    const gain = context.createGain();
    osc.frequency.setValueAtTime(layer.freq, start);
    if (layer.toFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, layer.toFreq), start + layer.dur);
    // attack 很短（5ms）避免爆音；用指数衰减到 0.0001（指数不能到 0）
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(layer.gain * volume, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + layer.dur);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start?.(start);
    osc.stop?.(start + layer.dur + 0.02);
    if (layer.noise) spawnNoise(context, context.destination, start, layer.dur, layer.noise);
  }

  return {
    get muted() {
      return muted;
    },
    get volume() {
      return volume;
    },
    get played() {
      return played;
    },
    get throttled() {
      return throttled;
    },
    get failed() {
      return failed;
    },
    setMuted(value: boolean) {
      muted = value === true;
    },
    setVolume(value: unknown) {
      volume = clampVolume(value);
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    unlock() {
      const context = ensureContext();
      if (!context) return;
      try {
        void context.resume?.();
      } catch {
        failed += 1;
      }
    },
    play(name: SoundName) {
      if (muted) return;
      const recipes = SOUND_RECIPES[name];
      if (!recipes || recipes.length === 0) return;
      const t = now();
      const gap = SOUND_THROTTLE_MS[name];
      if (gap !== undefined) {
        const prev = lastAt.get(name);
        if (prev !== undefined && t - prev < gap) {
          throttled += 1;
          return;
        }
      }
      const context = ensureContext();
      if (!context) return;
      if (context.state === 'suspended') {
        try {
          void context.resume?.();
        } catch {
          // 忽略：下一帧还能再试
        }
      }
      lastAt.set(name, t);
      const base = context.currentTime + 0.001;
      try {
        for (const layer of recipes) playLayer(context, layer, base);
        played += 1;
      } catch {
        failed += 1;
      }
    },
  };
}

/** 默认实现：浏览器里用真 WebAudio，Node 里返回 null（单测不该建 AudioContext）。 */
function defaultCreateContext(): MinimalAudioContext | null {
  const g = globalThis as unknown as {
    AudioContext?: new () => MinimalAudioContext;
    webkitAudioContext?: new () => MinimalAudioContext;
  };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}
