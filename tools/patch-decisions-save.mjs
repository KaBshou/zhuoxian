// 一次性补丁：把本轮存档/离线/自动点天赋等决策写进 DECISIONS.md（跑完即弃）
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/docs/DECISIONS.md';
let c = fs.readFileSync(p, 'utf8');

const rows = [
  [
    '存档系统（D37）',
    '`SAVE_VERSION=1`，只存「关页面后还活着的最小集合」：角色/背包/层波/首通/通货袋/玉简袋/rngState。**派生值一律不入档**（`xpNext`、`maxHp`、战力、属性点余额都算得出来）',
    'idle-grim 的教训：老档存了 `xpNext`，改升级曲线后老档读回来仍是旧门槛（实测 LV60 存 508290 vs 新曲线 8237，差 61.7 倍）。**能从别的字段算出来的值入档 = 未来改数值时老档全部失效**',
  ],
  [
    '读档重建约定（D38）',
    '读档 = 「回到这一层的这一波开头」：满血满真元、浊气清零、场上重新撒一波怪、浮字/日志/战斗统计全部归零',
    '放置游戏惯例是「闭关」不是「续命」。接着上一帧继续会让玩家能靠反复刷新躲死亡；而且死亡惩罚在层内，续命等于把惩罚清零',
  ],
  [
    '自动存档节奏（D39）',
    '30 秒一次 + `visibilitychange(hidden)` + `pagehide` + `beforeunload` 各一次。**不每帧存**',
    '`localStorage.setItem` 是同步阻塞，几 MB JSON 序列化+写盘在低端手机上 20~50ms，每帧存=每帧掉帧。挂机游戏最坏丢 30 秒进度，玩家感知不到',
  ],
  [
    '离线收益（D40）',
    '闭式公式算击杀数（按层的击杀率表）× 真掷三分类掉落；**离线不推层**、**离线不死**；12 小时封顶，超出部分按 50% 折算（不归零）',
    '12 小时=259 万帧，每次读档跑一遍会卡几秒。不推层是因为「睡一觉直接通关」既破坏过程感又让玩家看不到进度；不归零是因为「多挂一天反而亏」是错的',
  ],
  [
    '时间偏移测离线（D41）',
    '自动化验收离线收益时，**不要改存档里的 `savedAt`**（旧页面 `pagehide` 会 flush 一次把它写回现在，篡改立刻被覆盖）。用 CDP `Page.addScriptToEvaluateOnNewDocument` 给新页面打 `Date.now` 偏移',
    '这是唯一能在真浏览器里复现「关了 3 小时」的办法。`tools/probe-save.mjs` 26 项全过，含「刚存完档立刻刷新不重复领闭关」这条防刷断言',
  ],
];

// 插到「## 三、本可自己定却问了的」之前
const anchor = '## 三、本可自己定却问了的（复盘用，下次不问）';
if (!c.includes(anchor)) throw new Error('MISS anchor');
const table = rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} |`).join('\n');
c = c.replace(anchor, `${table}\n\n${anchor}`);

fs.writeFileSync(p, c, 'utf8');
console.log('done, lines:', c.split(/\r?\n/).length);
