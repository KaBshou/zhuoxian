/**
 * 自动存档 —— 把「什么时候存」和「存在哪」从业务代码里彻底分离。
 *
 * 【三层职责，不许混】
 * - session.ts：状态怎么变（完全不认识存档）
 * - save.ts / save-bridge.ts：状态 ↔ JSON（纯函数，不认识存储）
 * - 本文件：什么时候调上面那层、存到哪个 adapter（不认识 JSON 结构）
 *
 * 【为什么是 30 秒而不是每帧】
 * localStorage.setItem 是同步阻塞的，几 MB 的 JSON 序列化 + 写盘在低端手机上
 * 能卡 20~50ms。每帧存 = 每帧掉帧。30 秒 + 关键节点（切后台、关页面、死亡、突破）
 * 已经足够——挂机游戏最坏丢 30 秒进度，玩家感知不到。
 */
import type { StorageAdapter } from './storage';
import { SAVE_KEY } from './storage';
import type { GameSession } from './session';
import { sessionToSave, sessionFromSave } from './save-bridge';
import { deserialize } from './save';
import type { ItemBaseDef } from '../data/bases';
import type { AffixDef } from '../data/affix-def';

/** 自动存档间隔（秒） */
export const AUTOSAVE_INTERVAL = 30;

export interface SaveTables {
  readonly bases: readonly ItemBaseDef[];
  readonly affixes: readonly AffixDef[];
}

export interface LoadResult {
  readonly session: GameSession;
  /** 距上次存档过了多少秒（离线收益用） */
  readonly offlineSeconds: number;
}

/**
 * 自动存档器。
 *
 * 用法：`new Autosaver(adapter, () => session, tables)`，
 * 每帧 `autosaver.tick(dt)`，切后台/关页面时 `autosaver.saveNow()`。
 */
export class Autosaver {
  private acc = 0;
  private lastSavedAt = 0;
  private saveCount = 0;
  private lastError: string | null = null;

  constructor(
    private readonly adapter: StorageAdapter,
    private readonly getSession: () => GameSession,
    private readonly tables: SaveTables,
  ) {}

  /** 距上次成功存档过了多少秒（UI 用「已保存」提示） */
  get secondsSinceSave(): number {
    if (this.lastSavedAt === 0) return Number.POSITIVE_INFINITY;
    return (Date.now() - this.lastSavedAt) / 1000;
  }

  get saves(): number {
    return this.saveCount;
  }

  /** 上一次存档失败的原因（没有失败则为 null）。存档失败不该打断游戏，但要让 UI 能提示 */
  get error(): string | null {
    return this.lastError;
  }

  /** 每帧调用。到点自动存一次 */
  tick(dt: number): void {
    // 只挡 NaN/负数/Infinity，不夹小值：切后台回来可能一次给很大的 dt，
    // 那种情况应该「立刻存一次」，而不是被夹成 1 秒然后假装还在计时
    const d = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 3600) : 0;
    this.acc += d;
    if (this.acc < AUTOSAVE_INTERVAL) return;
    this.acc = 0;
    this.saveNow();
  }

  /** 立刻存档。返回是否成功（失败不抛异常：宁可丢一次存档也不能让游戏崩） */
  saveNow(): boolean {
    try {
      const state = sessionToSave(this.getSession());
      this.adapter.write(SAVE_KEY, JSON.stringify(state));
      this.lastSavedAt = Date.now();
      this.saveCount += 1;
      this.lastError = null;
      return true;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  /** 读档。没有档 / 档坏了 / 版本不兼容都返回 null（调用方建新档） */
  load(now = Date.now()): LoadResult | null {
    const raw = this.adapter.read(SAVE_KEY);
    if (!raw) return null;
    try {
      const parsed = deserialize(JSON.parse(raw));
      if (!parsed.ok) return null;
      const session = sessionFromSave(parsed.state, { tables: this.tables });
      const savedAt = parsed.state.savedAt;
      const offlineSeconds =
        Number.isFinite(savedAt) && savedAt > 0 ? Math.max(0, (now - savedAt) / 1000) : 0;
      return { session, offlineSeconds };
    } catch {
      return null;
    }
  }

  /** 删档（重置游戏 / 测试用） */
  clear(): void {
    this.adapter.remove(SAVE_KEY);
    this.lastSavedAt = 0;
  }
}
