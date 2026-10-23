// 一次性：gearTrail 采样加「判据 C 的部位战力比」，好让 diag 脚本直接指出
// 「到底哪个部位在拖后腿」。起因：D61/D62/D63 之后 3 种子成型 2/3 达成，
// 其中 seed 20262034 成型时刻 353.4min > 满级 323.2min（结构性错误），
// 而 minPowerRatio 终值 1.046 —— 说明卡的是某一个部位，需要逐部位证据。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/tools/session-runner.mjs';
const raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let c = raw.replace(/\r\n/g, '\n');

const oldBlock = [
  '      gearTrail.push({ minute: Math.round(t / 60), baoPlus, xianCount, withAffix });',
].join('\n');

const newBlock = [
  '      // 判据 C 的逐部位战力比（itemPower / 同部位同灵蕴宝品中位）。',
  '      // 最小值就是「成型」的瓶颈部位 —— 记下来，否则报告里只能看到「未达成」，',
  '      // 看不出是 10 个部位都差一点，还是 9 个都过线、就一个部位在拖。',
  '      const ratios = {};',
  '      let worstSlot = null;',
  '      let worstRatio = Number.POSITIVE_INFINITY;',
  '      if (inventoryMod) {',
  '        for (const slot of EQUIP_SLOTS) {',
  '          const it = s.character.equipment[slot];',
  '          const kind = slot.startsWith(\'ring\') ? \'ring\' : slot;',
  '          const base = slotBasePower(kind, it ? it.ilvl : 1);',
  '          const ratio = it && base > 0 ? inventoryMod.itemPower(it) / base : 0;',
  '          ratios[slot] = Math.round(ratio * 1000) / 1000;',
  '          if (ratio < worstRatio) {',
  '            worstRatio = ratio;',
  '            worstSlot = slot;',
  '          }',
  '        }',
  '      }',
  '      gearTrail.push({ minute: Math.round(t / 60), baoPlus, xianCount, withAffix, ratios, worstSlot, worstRatio });',
].join('\n');

if (!c.includes(oldBlock)) throw new Error('MISS gearTrail push');
c = c.replace(oldBlock, newBlock);

if (!c.includes('const crlf')) void 0;

fs.writeFileSync(p, crlf ? c.replace(/\n/g, '\r\n') : c, 'utf8');
console.log(`ok crlf=${crlf} ${raw.length} -> ${c.length}`);
