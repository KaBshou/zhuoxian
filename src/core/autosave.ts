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
import { SAVE_BACKUP_KEY, SAVE_KEY } from './storage';
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
  /**
   * true = 主档读不出来、这份是从备份恢复的（D201）。
   * 调用方必须**告诉玩家**：静默回退会让玩家以为「我明明练到 30 重怎么回到 27 了」。
   */
  readonly restoredFromBackup: boolean;
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
      const next = JSON.stringify(state);
      // 先搬旧档（顺序反了就等于没备份：新档会先覆盖旧档，备份里就变成新档）。
      // 旧档读不到（第一次存）时跳过 —— 写空备份会把「没有备份」伪装成「备份坏了」。
      const prev = this.adapter.read(SAVE_KEY);
      if (prev) this.adapter.write(SAVE_BACKUP_KEY, prev);
      this.adapter.write(SAVE_KEY, next);
      this.lastSavedAt = Date.now();
      this.saveCount += 1;
      this.lastError = null;
      return true;
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  /**
   * 读档。没有档 / 档坏了 / 版本不兼容都返回 null（调用方建新档）。
   *
   * 主档坏了会尝试备份（D201）。备份也坏才算真没档 —— 但**不删坏档**：
   * 玩家还能导出它，至少能亲眼确认「确实坏了」而不是「游戏把我清了」。
   */
  load(now = Date.now()): LoadResult | null {
    const main = this.tryLoadKey(SAVE_KEY, now);
    if (main) return { ...main, restoredFromBackup: false };
    const backup = this.tryLoadKey(SAVE_BACKUP_KEY, now);
    if (backup) return { ...backup, restoredFromBackup: true };
    return null;
  }

  /** 从指定键读一份存档；读不出来返回 null（不抛、不删） */
  private tryLoadKey(key: string, now: number): { session: GameSession; offlineSeconds: number } | null {
    const raw = this.adapter.read(key);
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
    // 备份也要清：`clear()` 只有一个语义是「重开新档」，留着备份会让玩家
    // 下一秒又回到旧进度（那正是 D201 之前「清了等于没清」的事故形状）。
    this.adapter.remove(SAVE_KEY);
    this.adapter.remove(SAVE_BACKUP_KEY);
    this.lastSavedAt = 0;
  }
}
