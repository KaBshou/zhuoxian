// 在开新波前插入一次性波末回气（第二段：isCleared 分支的 startWave 调用处）。
import fs from 'node:fs';

const p = 'F:/dsh-work/zhuoxian/src/core/session.ts';
let c = fs.readFileSync(p, 'utf8');

const oldS = `      startWave(s);
    }
  } else {`;
const neu = `      // 回气在这里给：一次性 25%，死亡重开（deathCleanup）不给。
      if (!s.battle.deathCleanup) {
        const p = s.battle.player;
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * WAVE_END_REGEN);
      }
      startWave(s);
    }
  } else {`;

if (!c.includes(oldS)) { console.error('MISS insert'); process.exit(1); }
c = c.replace(oldS, neu);
fs.writeFileSync(p, c, 'utf8');
console.log('OK insert');
