// 一次性：离线测试按 D46.1（闸前移）更新断言
// 旧断言按「每杀都分流」写：物件数 > 击杀 0.65、通货 > 法宝 2 倍。
// 新语义：只有 28% 的击杀出货 → 物件数 ≈ 击杀 0.28；通货/法宝 ≈ 1.19 倍。
import fs from 'node:fs';

const P = 'F:/dsh-work/zhuoxian/tests/offline-save.test.ts';
let c = fs.readFileSync(P, 'utf8');
const before = c.length;

const A = `    // 三分类：杀 < 0.475 通货 / < 0.6 玉简 / 其余走 rollMonsterDrop，
    // 而 rollMonsterDrop 内部还要过 DROP_CHANCE.normal(0.28) —— 所以法宝（装备）
    // 的真实份额是 40% × 28% ≈ 11.2%，不是 40%。这是刻意的：
    // 地上 60% 的法宝是凡品垃圾，如果每杀都掉一件，屏幕上会全是装备。
    expect(cur + gems + g.items.length).toBeGreaterThan(g.kills * 0.65);
    const share = g.items.length / g.kills;
    expect(share).toBeGreaterThan(0.06);
    expect(share).toBeLessThan(0.18);
    expect(cur).toBeGreaterThan(g.items.length * 2); // 通货远多于法宝`;

const B = `    // D46.1：**闸在分流之前** —— 先问「这一击掉不掉」（DROP_CHANCE.normal = 0.28），
    // 再问「掉哪一类」（通货 47.5% / 玉简 12.5% / 法宝 40%）。
    // 所以每杀平均只有 0.28 件物件，法宝份额 = 0.40 × 0.28 ≈ 11.2%。
    // 旧实现把分流放在闸前，通货/玉简各超发 3.57 倍（BALANCE §5.1 有反例注释）。
    const objects = cur + gems + g.items.length;
    expect(objects).toBeGreaterThan(g.kills * 0.22);
    expect(objects).toBeLessThan(g.kills * 0.34);
    const share = g.items.length / g.kills;
    expect(share).toBeGreaterThan(0.06);
    expect(share).toBeLessThan(0.18);
    // 通货份额 47.5% vs 法宝 40% → 通货略多于法宝，但不是压倒性的
    expect(cur).toBeGreaterThan(g.items.length);
    expect(cur).toBeLessThan(g.items.length * 2);`;

if (!c.includes(A)) throw new Error('MISS: 旧断言块');
c = c.replace(A, B);
if (c.length < before * 0.9) throw new Error('结果比原文短，拒绝写盘');
fs.writeFileSync(P, c, 'utf8');
console.log('written', before, '->', c.length);
