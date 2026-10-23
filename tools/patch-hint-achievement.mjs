// 底部提示行加「J 成就」（该行是模板字符串，含反引号，必须走脚本而不是 PowerShell 双引号）
import fs from 'node:fs';

const P = 'F:/dsh-work/zhuoxian/src/render/battle-renderer.ts';
let raw = fs.readFileSync(P, 'utf8');
const crlf = raw.includes('\r\n');
const nl = crlf ? '\r\n' : '\n';
raw = raw.replace(/\r\n/g, '\n');
const before = raw.length;

const oldText = 'K 图鉴　M 渊痕';
const newText = 'K 图鉴　J 成就　M 渊痕';
if (!raw.includes(oldText)) throw new Error('MISS 底部提示行');
raw = raw.replace(oldText, newText);

if (raw.length < before) throw new Error('长度断言失败');
if (crlf) raw = raw.replace(/\n/g, nl);
fs.mkdirSync('F:/dsh-work/zhuoxian/tools/_bak', { recursive: true });
fs.writeFileSync(`F:/dsh-work/zhuoxian/tools/_bak/battle-renderer.ts.${Date.now()}.bak`, fs.readFileSync(P));
fs.writeFileSync(P, raw);
console.log(`hint patched: ${before} -> ${raw.length}`);
