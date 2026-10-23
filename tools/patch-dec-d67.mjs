// 一次性：落 D67（九境目标绑满级 + 段④ 产出表落地）
// 纪律：写盘前留 _bak 快照 + 长度断言，throw 前不写盘。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/docs/DECISIONS.md';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
const before = raw.replace(/\r\n/g, '\n');

const block = [
'',
'### D67 九境目标绑满级（否则门禁永远红）+ 段④ 产出表落地（2026-10-22，ceshi 抓到）',
'- **真 bug（会让整套门禁变成装饰）**：`tools/run-timeline.mjs` 的 `TARGET_REALM_MINUTES` 末项仍是 **406**',
'  （D64 之前的满级目标），而 `TARGET_MAX_MINUTES` 已是 **330** ⇒ 第 9 境拿实测 335.0 比 406 = **−17.5%**，',
'  超 ±15% ⇒ `verdict.pass` 恒 false、**EXIT 恒 1**。谁跑都会以为「数值退步」，其实是目标数组没跟着改。',
'  ceshi 报上来时把它归因成「满级门禁红」，实际满级那条是 PASS —— 一个漂移的常量能让整块输出说谎。',
'- **修法（与 D65 同一原则）**：保留**形状**（406 时代的 9 个比例），末项由满级目标推出：',
'  `REALM_SHAPE = [32,47,70,104,139,179,224,304,406]`、',
'  `TARGET_REALM_MINUTES = REALM_SHAPE.map(x => round(x / 406 * TARGET_MAX_MINUTES))`，',
'  并加**启动断言**「末项必须 === TARGET_MAX_MINUTES，否则 throw」。以后重标满级，这条曲线自动缩放，',
'  不可能再漂；真漂了也会在启动时炸，而不是静默把红盘伪装成绿盘（或反过来）。',
'- **副作用（已记录，待 shuzhi 判形状）**：等比缩放后第 1 境目标 26min 而实测 **31.6min（+21.6%）→ ✗**，',
'  第 2 境 +11.7%、第 3 境 +2.9%、第 8 境 +0.5%。即**早期三境偏慢**是老问题（不是这次改出来的），',
'  等比缩放只是把它显形了。九境行是记录项（不参与 `pass`），但形状该由 shuzhi 重给。',
'- **段④ 产出表落地（D57/D63 的度量口径终于有数）**：`session-runner` 新增 `postCap` 计数（扫 `s.ground`，',
'  只统计满级之后落地的仙品，并按 `xueji`/`zhuopo`/`shuangying` 三条旗子拆出「机制传奇」），',
'  `run-timeline` 新增 **表 2d · 段④ 产出**。实测（3 种子 900min `--post-cap`）：',
'  **仙品 8.0 件 / 3h**（设计参考 7.2，+11%）、旗子占 **28.6%**（设计 33.3%，样本 ~40 件属噪声）、',
'  按此 9 件全仙品 ≈ **10 小时**（层 46 口径；层 21 口径约 20h —— shuzhi 的 21h 是层 21 的数，两者不矛盾）。',
'- **为什么必须把它量出来**：「满级后 512.4min」这类数是假数（窗口 − 满级），跑 1200min 也验不出东西。',
'  段④ 没有「长度」，只有**产出**：既然满级后修为直接丢弃、层 46 封顶，能回答「满级后还有多少内容」的',
'  唯一指标就是「一晚上能刷到几件能换的东西」。现在这个数有了，段④ 才第一次可验收。',
'',
].join('\n');

const after = before.replace(/\s*$/, '\n') + block;
if (after.length < before.length + 800) throw new Error('ASSERT block too small');
if (!after.includes('### D67')) throw new Error('ASSERT block missing');

fs.mkdirSync('F:/dsh-work/zhuoxian/tools/_bak', { recursive: true });
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/DECISIONS.before-d67.${Date.now()}.md`, raw, 'utf8');
fs.writeFileSync(p, crlf ? after.replace(/\n/g, '\r\n') : after, 'utf8');
console.log(`ok crlf=${crlf} ${before.length} -> ${after.length} chars, decisions=${(after.match(/^### D\d+/gm) ?? []).length}`);
