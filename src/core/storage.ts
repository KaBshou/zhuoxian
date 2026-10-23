/**
 * 存储层 —— 业务代码访问持久化的**唯一入口**。
 *
 * 【为什么要有这一层，而不是直接调 localStorage】
 * 1. 将来要换云存档 / IndexedDB / 微信小游戏的 storage，业务代码一行都不用改。
 * 2. localStorage 在 Safari 无痕模式、存储写满时会**抛异常**，裸调会让整个游戏白屏；
 *    这里统一 try/catch，写失败只是"这次没存上"，不能让游戏崩。
 * 3. 测试要能在 Node 里跑（没有 localStorage），用 memoryAdapter 替换。
 *
 * 【纪律】src/ 下除本文件外，任何地方都不许出现 `localStorage` 四个字。
 * 这是 GDD 9.2 定的：为云存档留口子，改的时候只改这一个文件。
 */

/** 存储适配器接口。同步语义（localStorage 就是同步的，云存档将来走异步队列） */
export interface StorageAdapter {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

/** 存档在存储里的键。带版本号，版本不兼容时换 key 而不是覆盖老档 */
export const SAVE_KEY = 'zhuoxian.save.v1';

/** 浏览器 localStorage 适配器。任何异常都吞掉（写满/无痕模式/被禁用） */
export function createLocalStorageAdapter(): StorageAdapter {
  const safe = (): Storage | null => {
    try {
      if (typeof localStorage === 'undefined') return null;
      // 探针写一次：Safari 无痕模式下 localStorage 存在但 setItem 会抛
      const probe = '__zhuoxian_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return localStorage;
    } catch {
      return null;
    }
  };
  return {
    read(key) {
      try {
        return safe()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    write(key, value) {
      try {
        safe()?.setItem(key, value);
      } catch {
        // 写不进去就算了：宁可丢一次自动存档，也不能让游戏崩在存档里
      }
    },
    remove(key) {
      try {
        safe()?.removeItem(key);
      } catch {
        /* 同上 */
      }
    },
  };
}

/** 内存适配器。测试与「无痕模式降级」都用它：本次会话能存档，关掉就没了 */
export function createMemoryAdapter(initial?: Readonly<Record<string, string>>): StorageAdapter {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    read: (key) => map.get(key) ?? null,
    write: (key, value) => {
      map.set(key, value);
    },
    remove: (key) => {
      map.delete(key);
    },
  };
}
