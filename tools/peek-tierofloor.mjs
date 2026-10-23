// 一次性补丁：floorOfTier 在 27 层模型下的阶起点映射。跑完即弃。
// BALANCE v2：tierOfFloor 1~3→1、4~6→2、7+→3？不对——27 层分三阶应是 1~9/10~18/19~27。
// 检查 tierOfFloor 再决定；floorOfTier = 该阶第一层：1/10/19。
import fs from 'node:fs';

const p = 'src/data/monsters.ts';
let c = fs.readFileSync(p, 'utf8');
const i = c.indexOf('export function tierOfFloor');
console.log('tierOfFloor body:\n' + c.slice(i, i + 400));
