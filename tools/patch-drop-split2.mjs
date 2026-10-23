// 掉落三分类第二步：把 player-kill 的掉落点改成三分类。
// DROP_CHANCE（0.28 普通）是「总掉率 = 4 次/分 ÷ 13.98 杀/分」，里面已含三类份额，
// 所以掷中后按 CURRENCY_SHARE / GEM_SHARE 分流，剩下的才是法宝。
// 通货/玉简不落地（直接进袋），法宝才走 addGroundDrop —— 玉简/石头做成地上
// 光柱是纯视觉成本，第一版砍掉。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/session.ts';
let c = fs.readFileSync(p, 'utf8');
let miss = 0;
function repl(oldS, neu, tag) {
  if (!c.includes(oldS)) { console.error('MISS: ' + tag); miss++; return; }
  c = c.replace(oldS, neu);
  console.log('OK: ' + tag);
}

repl(
  `      // 掉落
      // killed.tier 实际存的是层（spawnMonster 的 floor），直接透传。
      // 之前包一层 tierOfFloor 会把层 1~9 全压成 ilvl 4，玄/地/天三档词缀永远洗不出。
      const item = rollMonsterDrop(
        killed.defId,
        killed.tier,
        killed.rarity,
        s.rng,
        s.tables,
      );
      if (item) {
        addGroundDrop(s, item, killed.x, killed.y);
        s.dropsFound += 1;
      }`,
  `      // 掉落三分类（BALANCE §5/§11.3）：法宝 40% / 通货 47.5% / 玉简 12.5%。
      // killed.tier 实际存的是层（spawnMonster 的 floor），直接透传。
      // 之前包一层 tierOfFloor 会把层 1~9 全压成 ilvl 4，玄/地/天三档词缀永远洗不出。
      s.dropsFound += 1;
      const curRoll = s.rng.float(0, 1);
      if (curRoll < CURRENCY_SHARE) {
        const cur = rollCurrency(s.rng, s.floor);
        if (cur) {
          s.pocket[cur.id] = (s.pocket[cur.id] ?? 0) + 1;
          pushLog(s, \`拾得 \${cur.name}\`, '#d4a13c');
        }
      } else if (curRoll < CURRENCY_SHARE + GEM_SHARE) {
        const gem = rollGemDrop(s.rng, s.character.step);
        s.gemPouch[gem.id] = (s.gemPouch[gem.id] ?? 0) + 1;
        pushLog(s, \`拾得玉简「\${gem.name}」\`, '#4fd1c5');
      } else {
        const item = rollMonsterDrop(
          killed.defId,
          killed.tier,
          killed.rarity,
          s.rng,
          s.tables,
        );
        if (item) {
          addGroundDrop(s, item, killed.x, killed.y);
        }
      }`,
  'kill drop split',
);

if (miss > 0) process.exit(1);
fs.writeFileSync(p, c, 'utf8');
console.log('written');
