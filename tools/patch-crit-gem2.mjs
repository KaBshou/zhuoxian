// 一次性补丁：贯头 desc 更新为 flat 口径。跑完即弃。
import fs from 'node:fs';
const p = 'F:/dsh-work/zhuoxian/src/data/support-gems.ts';
let c = fs.readFileSync(p, 'utf8');
const old = "    desc: '破绽率（暴击率）提高。',";
const neu = "    desc: '破绽率（暴击率）+6 个百分点。',";
if (!c.includes(old)) { console.error('MISS'); process.exit(1); }
c = c.split(old).join(neu);
fs.writeFileSync(p, c, 'utf8');
console.log('OK');
