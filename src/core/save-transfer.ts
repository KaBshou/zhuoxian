/**
 * 存档搬家（导出 / 导入）—— 纯逻辑，不碰 DOM，不碰 Canvas。
 *
 * 为什么需要它：存档在 `localStorage`，而 `localStorage` 是**按域名隔离**的。
 * 于是下面这些情况玩家会直接丢档，而且丢得很安静（不是崩溃，是"打开一看是新的"）：
 *   - 换个网址进游戏（`xxx.github.io/zhuoxian` → 换成自定义域名）
 *   - 换设备 / 换浏览器
 *   - 清缓存、用无痕窗口、浏览器自动清理存储空间
 * 对一个 24 小时内容量的挂机游戏，丢档等于把整轮白玩。所以「能导出成一个文件、能再导回来」
 * 不是锦上添花，是这条产品线的基本盘。
 *
 * 三条设计纪律：
 *   1. **导出的是存档原文（`SaveState`），不是面板状态** —— 派生值、运行时态一律不入档（D37）。
 *   2. **外面套一层信封（magic + format + exportedAt）** —— 玩家可能误选任何 `.json` 文件，
 *      没有信封就只能靠 `deserialize` 的形状校验去猜，错误信息会变成"存档格式不对"这种没法排查的话。
 *   3. **导入必须打得过 `deserialize`** —— 版本不符 / 形状坏 / 职业未知，一律判否并说明原因，
 *      绝不做"尽力修复"：修坏一点比直接拒绝更难发现。
 */

import { deserialize, type LoadError, type SaveState } from './save';

/** 信封标识。故意不用中文，避免不同平台编码差异带来假失败。 */
export const TRANSFER_MAGIC = 'zhuoxian-save';
/** 信封格式版本。改了信封结构就 +1（与 `SAVE_VERSION` 是两件事：那是存档形状，这是文件包装）。 */
export const TRANSFER_FORMAT = 1;
/** 上限 512KB。当前真实存档约 8~20KB，留 25 倍余量；超了多半是选错文件或被人为塞大。 */
export const MAX_TRANSFER_BYTES = 512 * 1024;

export type TransferFail = 'too-large' | 'not-json' | 'wrong-app' | 'wrong-format' | 'bad-save';

export interface TransferEnvelope {
  readonly magic: string;
  readonly format: number;
  readonly exportedAt: number;
  readonly save: SaveState;
}

export type DecodeResult =
  | { readonly ok: true; readonly state: SaveState; readonly exportedAt: number }
  | { readonly ok: false; readonly error: TransferFail; readonly detail?: LoadError };

/** UTF-8 字节数。不能只看 `text.length`：中文在这里很少，但玩家手改的文本可能带中文注释。 */
export function transferBytes(text: string): number {
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length;
  return text.length;
}

export function encodeTransfer(state: SaveState, now = Date.now()): string {
  const envelope: TransferEnvelope = {
    magic: TRANSFER_MAGIC,
    format: TRANSFER_FORMAT,
    exportedAt: now,
    save: state,
  };
  return JSON.stringify(envelope, null, 2);
}

export function decodeTransfer(text: string): DecodeResult {
  if (typeof text !== 'string' || text.trim() === '') return { ok: false, error: 'not-json' };
  if (transferBytes(text) > MAX_TRANSFER_BYTES) return { ok: false, error: 'too-large' };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not-json' };
  }
  if (raw === null || typeof raw !== 'object') return { ok: false, error: 'not-json' };

  const env = raw as Record<string, unknown>;
  if (env.magic !== TRANSFER_MAGIC) return { ok: false, error: 'wrong-app' };
  if (env.format !== TRANSFER_FORMAT) return { ok: false, error: 'wrong-format' };

  const res = deserialize(env.save);
  if (!res.ok) return { ok: false, error: 'bad-save', detail: res.error };

  const exportedAt = typeof env.exportedAt === 'number' && Number.isFinite(env.exportedAt) ? env.exportedAt : 0;
  return { ok: true, state: res.state, exportedAt };
}

/** 失败原因要说人话。玩家看不懂的内部错误码只放在括号里，给他一个能行动的解释。 */
export function transferFailText(error: TransferFail, detail?: LoadError): string {
  switch (error) {
    case 'too-large':
      return '这个文件太大了（上限 512KB），多半不是存档文件。';
    case 'not-json':
      return '这里不是存档文件（读不出内容）。';
    case 'wrong-app':
      return '这不是《浊仙》的存档文件。';
    case 'wrong-format':
      return '存档文件版本不匹配，请用游戏里导出的文件。';
    case 'bad-save':
      if (detail === 'wrong-version') return '存档来自不同版本的游戏，暂时读不了。';
      if (detail === 'unknown-class') return '存档里的道统这一版没有，暂时读不了。';
      return '存档内容不完整，读不出来。';
    default:
      return '导入失败。';
  }
}

/**
 * 信封里写的导出时间（毫秒）。给面板显示「这份存档是哪年导出的」用 ——
 * 玩家可能隔年再导入，光看文件名（月日时）分不清年份。读不出就给 0。
 */
export function parseTransferYear(text: string): number {
  if (typeof text !== 'string' || text.trim() === '') return 0;
  try {
    const raw = JSON.parse(text) as unknown;
    if (raw === null || typeof raw !== 'object') return 0;
    const at = (raw as Record<string, unknown>).exportedAt;
    if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) return 0;
    return new Date(at).getFullYear();
  } catch {
    return 0;
  }
}

/** 文件名带时间戳：玩家可能导出好几份，覆盖了就没法比较。 */
export function transferFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
  return `zhuoxian-save-${stamp}.json`;
}

/**
 * 面板上显示的一行摘要 —— 让玩家在「确认覆盖」之前能认出这是不是他想要的那份存档。
 * 只报可辨认的四个量：境界 / 层 / 周目 / 渊痕。再多就是噪音。
 */
export function transferSummary(state: SaveState, formatRealmFn: (step: number) => string): string {
  const step = Number.isFinite(state.player?.step) ? state.player.step : 0;
  const floor = Number.isFinite(state.progress?.floor) ? state.progress.floor : 1;
  const cycle = Number.isFinite(state.progress?.cycle) ? (state.progress.cycle ?? 0) : 0;
  const marks = Number.isFinite(state.player?.marks) ? (state.player.marks ?? 0) : 0;
  const cycleText = cycle > 0 ? `第 ${cycle} 周目` : '初临';
  return `${formatRealmFn(step)}　第 ${floor} 层　${cycleText}　渊痕 ${marks}`;
}
