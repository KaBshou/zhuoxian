// 一次性排查：probe-battle「掉落了法宝 PASS / 背包没收到 FAIL」——
// 验证假设：dropsFound 是「掷骰过闸」次数，掉落物要先落地（PICKUP_DELAY 0.9s + 拾取半径），
// 固定时刻采样会拍到「已掷骰但还没进背包」的中间态。
// 跑法：node tools\_drop-lag-check.mjs http://127.0.0.1:5292/
import { withPage } from './probe/harness.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:5292/';
const url = base.includes('cls=') ? base : `${base}${base.includes('?') ? '&' : '?'}cls=yujian`;

await withPage(async (page) => {
  await page.navigate(url);
  await page.waitFor('!!(window.__zhuoxian && window.__zhuoxian.session)', 20000);
  const read = `(() => {
    const z = window.__zhuoxian; const s = z.session;
    return { t: s.battle.time, kills: s.battle.kills, dropsFound: s.dropsFound,
             bag: s.bag.length, equip: Object.keys(s.character.equipment).length,
             pocket: Object.values(s.pocket).reduce((a,b)=>a+b,0),
             gem: Object.values(s.gemPouch).reduce((a,b)=>a+b,0),
             ground: s.ground.length };
  })()`;
  const t0 = Date.now();
  let firstDropAt = null;
  for (let i = 0; i < 120; i += 1) {
    const s = await page.eval(read);
    const at = ((Date.now() - t0) / 1000).toFixed(1);
    const got = s.bag + (s.equip - 1) + s.pocket + s.gem;
    console.log(`t=${at}s battle.t=${s.t.toFixed(1)} kills=${s.kills} dropsFound=${s.dropsFound} ground=${s.ground} bag=${s.bag} equip=${s.equip} pocket=${s.pocket} gem=${s.gem}`);
    if (firstDropAt === null && s.dropsFound > 0) firstDropAt = at;
    if (firstDropAt !== null && got > 0) {
      console.log(`→ 掷骰 ≥1 之后 ${(Number(at) - Number(firstDropAt)).toFixed(1)}s 背包/口袋才非空（第一次 dropsFound>0 在 t=${firstDropAt}s）`);
      break;
    }
    await page.waitMs(700);
  }
});
