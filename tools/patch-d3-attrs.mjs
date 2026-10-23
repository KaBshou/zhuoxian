// 一次性补丁：D3 主属性换算（BALANCE v2 §10，shuzhi 定稿 2026-10-22）。跑完即弃。
// 体魄 +3 气血 +1 护体 / 灵巧 +0.25% 出手速度 / 神识 +2 真元 +0.15% 破绽率。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/data/classes.ts';
let c = fs.readFileSync(p, 'utf8');

const old = `    { stat: 'life', op: 'flat', value: body * 8, source: src },
    { stat: 'armor', op: 'flat', value: body * 3, source: src },
    { stat: 'attackSpeed', op: 'flat', value: agility * 0.01, source: src },
    { stat: 'critChance', op: 'flat', value: agility * 0.002, source: src },
    { stat: 'moveSpeed', op: 'flat', value: agility * 0.004, source: src },
    { stat: 'mana', op: 'flat', value: spirit * 6, source: src },
    { stat: 'area', op: 'flat', value: spirit * 0.005, source: src },
    { stat: 'castSpeed', op: 'flat', value: spirit * 0.008, source: src },`;
const neu = `    // D3 主属性换算（BALANCE v2 §10 最终口径，shuzhi 定稿 2026-10-22）：
    // 体魄 +3 气血 +1 护体 / 灵巧 +0.25% 出手速度 / 神识 +2 真元 +0.15% 破绽率。
    // 旧表（体魄 8/3、灵巧 0.01 攻速…）作废 —— 那套把 critChance/moveSpeed/area 也
    // 挂在属性上，主属性和灵纹抢同一条通道，60 点神识就给 +30% 破绽，超规格。
    { stat: 'life', op: 'flat', value: body * 3, source: src },
    { stat: 'armor', op: 'flat', value: body * 1, source: src },
    { stat: 'attackSpeed', op: 'flat', value: agility * 0.0025, source: src },
    { stat: 'mana', op: 'flat', value: spirit * 2, source: src },
    { stat: 'critChance', op: 'flat', value: spirit * 0.0015, source: src },`;

if (!c.includes(old)) { console.error('MISS'); process.exit(1); }
c = c.split(old).join(neu);
fs.writeFileSync(p, c, 'utf8');
console.log('OK');
