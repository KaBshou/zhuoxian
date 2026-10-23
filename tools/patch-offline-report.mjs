// 一次性补丁：GameSession 加「离线报告」运行时段（不入档），给渲染层显示闭关结果（跑完即弃）
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/session.ts';
let c = fs.readFileSync(p, 'utf8');

function repl(old, neu, tag) {
  const n = c.split(old).length - 1;
  if (n !== 1) throw new Error(`MISS(${n}): ${tag}`);
  c = c.replace(old, neu);
  console.log('ok:', tag);
}

repl(
  `  /** 距下次自动打造还有多久（运行时态，不进存档） */
  craftTimer: number;
}`,
  `  /** 距下次自动打造还有多久（运行时态，不进存档） */
  craftTimer: number;
  /**
   * 上一次闭关（离线）的结算摘要 —— **纯运行时态，不进存档**。
   * 只用来在界面上显示「闭关 6 小时：击杀 3 210 / 修为 8 400 / 出货 42 件」，
   * 显示过一次就该由 UI 侧清掉（渲染器只看 age，不负责删）。
   */
  offlineReport?: OfflineReport;
}

/** 离线结算摘要（显示用，数值全部来自 offline.OfflineGain） */
export interface OfflineReport {
  /** 实际结算时长（分钟） */
  readonly minutes: number;
  readonly kills: number;
  readonly xp: number;
  readonly items: number;
  readonly currency: number;
  readonly gems: number;
  /** 是否被 12 小时上限截断 */
  readonly capped: boolean;
  /** 显示计时（秒），渲染器用它做淡出 */
  age: number;
}`,
  'offline-report',
);

fs.writeFileSync(p, c, 'utf8');
console.log('done');
