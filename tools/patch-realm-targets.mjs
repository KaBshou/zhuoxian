// 一次性：九境目标数组改成「按比例绑定满级目标」，不再硬编码 406 时代的老数字。
// 起因（ceshi 抓到，会让门禁**永远红**）：
//   `TARGET_REALM_MINUTES` 的末项仍是 406（旧满级目标），而 D64 已把 TARGET_MAX_MINUTES 改成 330
//   ⇒ 第 9 境拿实测 335.0 比 406 = −17.5% > ±15% ⇒ verdict.pass 恒 false、EXIT 恒 1。
//   谁跑都会以为「门禁没过」，其实是目标数组没跟着改 —— 这正是 D65 同一个病（重复常量）。
// 修法：保留**形状**（旧基准 406 时代的 9 个比例），末项由 TARGET_MAX_MINUTES 决定，
//   即「只维护满级一个数」。以后再有重标，这条曲线自动跟着走，不可能再漂。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/tools/run-timeline.mjs';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let c = raw.replace(/\r\n/g, '\n');
const before = c.length;

const oldText = 'const TARGET_REALM_MINUTES = [32, 47, 70, 104, 139, 179, 224, 304, 406];';
const newText = [
  '// 九境「圆满」到达目标。**末项必须等于 TARGET_MAX_MINUTES**（第 9 境圆满 = 满级）。',
  '// 曾经这里硬编码 406，D64 把满级目标改成 330 之后没同步 ⇒ 第 9 境拿 335.0 比 406 = −17.5%，',
  '// 门禁恒红、EXIT 恒 1，看起来像「数值退步」，其实是**目标数组漂了**（ceshi 抓到）。',
  '// 修法与 D65 同一原则：保留「形状」（406 时代的 9 个比例），末项由满级目标推出 ——',
  '// 只维护一个数，重标满级时这条曲线自动缩放，不可能再漂。',
  'const REALM_SHAPE = [32, 47, 70, 104, 139, 179, 224, 304, 406];',
  'const TARGET_REALM_MINUTES = REALM_SHAPE.map((x) => Math.round((x / REALM_SHAPE[REALM_SHAPE.length - 1]) * TARGET_MAX_MINUTES));',
  'if (TARGET_REALM_MINUTES[TARGET_REALM_MINUTES.length - 1] !== TARGET_MAX_MINUTES) {',
  "  throw new Error('九境目标末项与满级目标不一致（这条断言是为了防止再次漂移）');",
  '}',
].join('\n');

if (!c.includes(oldText)) throw new Error('MISS realm array');
c = c.replace(oldText, newText);
// 断言放在 TARGET_MAX_MINUTES 之后 —— 确认声明顺序合法
const iMax = c.indexOf('const TARGET_MAX_MINUTES = ');
const iRealm = c.indexOf('const REALM_SHAPE = ');
if (iMax < 0 || iRealm < 0 || iMax > iRealm) throw new Error('ORDER: TARGET_MAX_MINUTES must precede REALM_SHAPE');

fs.writeFileSync(p, crlf ? c.replace(/\n/g, '\r\n') : c, 'utf8');
console.log(`ok crlf=${crlf} ${before} -> ${c.length}`);
