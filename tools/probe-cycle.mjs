/**
 * 周目探针（D36-A / D130）：`N` 键真的能轮回、边界真的在 step 80、且周目号真的入档。
 *
 * 为什么这条探针必须存在（单测 `tests/cycles.test.ts` 证明不了的三件事）：
 *   ① 键位真的挂在 `prestige` 上 —— 本项目踩过 `activatePanel` 漏分支（按 J 打开的是渊痕面板，
 *      tsc 与三十多条单测全绿，只有探针抓到）；
 *   ② 「未满级按 N 不改状态」必须是**前后快照相等**，不能只看返回值 false
 *      （函数返回 false 但先改了字段，是最常见的半成品形态）；
 *   ③ 周目号必须进存档 —— `marks` 那次事故（字段漏进 SerializedSave，刷新后归零）是同族风险。
 *
 * 判据纪律：
 * - **不写死产品常量**：倍率与名称一律从 `src/data/cycles.ts` 的导出现算（`cycleHpMul` / `cycleName`），
 *   探针只断言「钩子读到的 == 模块算出的」，产品调倍率时探针自动跟随；
 * - 边界层（79 / 80）单独断言 —— 这是 `prestigeReady` 最容易写错的地方；
 * - 跑之前必须新起 server（`tools\_serve.mjs` 是 `watch: null`，改源码不热更新），
 *   且 **server 启动时间 > src 最新 mtime**，否则整趟都在测旧代码；
 * - 端口独占：默认 9368（不要撞 9366/9367），残留 chrome 占了端口会连到旧页面（症状「钩子不存在」）。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = Number(process.env.PROBE_PORT ?? 9368);
const BASE_URL = process.env.PROBE_URL ?? process.argv[2] ?? 'http://127.0.0.1:5292/';
const PROBE_CLASS = process.env.PROBE_CLASS ?? 'yujian';
const URL = BASE_URL.includes('cls=')
  ? BASE_URL
  : `${BASE_URL}${BASE_URL.includes('?') ? '&' : '?'}cls=${PROBE_CLASS}`;

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' · ' + detail : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fetchJson(path) {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${PORT}${path}`, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(String(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)));
    }
    return r.result.value;
  }
  async key(code, keyName) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: keyName, windowsVirtualKeyCode: 0 });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: keyName, windowsVirtualKeyCode: 0 });
  }
}

/** 轮回前后要逐字段比对的「不该动」快照（只看返回值 false 是不够的）。 */
const SNAPSHOT = `(() => {
  const z = window.__zhuoxian;
  const s = z.session;
  return {
    cycle: z.cycleInfo().cycle,
    floor: s.floor,
    wave: s.wave,
    step: s.character.step,
    xp: s.character.xp,
    marks: s.character.marks ?? 0,
    bag: s.bag.length,
    equipped: Object.keys(s.character.equipment ?? {}).length,
    logLines: s.log.length,
  };
})()`;

const profile = `${process.env.TEMP}\\probe-cycle-${Date.now()}`;
fs.mkdirSync(profile, { recursive: true });
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--window-size=1000,620',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--hide-scrollbars',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let ws;
try {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    try {
      const list = await fetchJson('/json/list');
      target = list.find((t) => t.type === 'page');
    } catch {
      /* 等 chrome 起 */
    }
  }
  if (!target) throw new Error('CDP 没起来');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  const cdp = new Cdp(ws);

  const consoleErrors = [];
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
  });

  await cdp.send('Page.navigate', { url: URL });
  await sleep(1800);
  await cdp.eval('(()=>{window.__zhuoxian?.reset();return true})()');
  await sleep(2500);

  // 产品常量：从数据模块现算，探针里不写 1.35 / '初临'
  const dataMod = await cdp.eval(`(async () => {
    const c = await import('/src/data/cycles.ts');
    return {
      hp1: c.cycleHpMul(1), dmg1: c.cycleDmgMul(1), marks1: c.cycleMarksMul(1),
      name0: c.cycleName(0), name1: c.cycleName(1),
      hp0: c.cycleHpMul(0), dmg0: c.cycleDmgMul(0), marks0: c.cycleMarksMul(0),
    };
  })()`);

  // ── 1. 钩子三件 ────────────────────────────────────────────────────────
  const hooked = await cdp.eval(
    'Boolean(window.__zhuoxian && typeof window.__zhuoxian.cycleInfo === "function" && typeof window.__zhuoxian.prestige === "function" && window.__zhuoxian.session)',
  );
  check('调试钩子存在（cycleInfo / prestige / session）', hooked);
  if (!hooked) throw new Error('no hook');
  // 新号自带起手武器 ⇒ 「装备清空」不能断 0，只能断「回到开局那套」
  const starterEquipped = await cdp.eval('Object.keys(window.__zhuoxian.session.character.equipment ?? {}).length');

  // ── 2. 新号：第 0 周目、名称=cycleName(0)、不可轮回、倍率全 1 ────────────
  const c0 = await cdp.eval('(()=>window.__zhuoxian.cycleInfo())()');
  check(
    '新号 cycle=0 · 名称来自 cycleName(0) · ready=false',
    c0.cycle === 0 && c0.name === dataMod.name0 && c0.ready === false,
    `cycle=${c0.cycle} name=${c0.name} ready=${c0.ready}`,
  );
  check(
    '第 0 周目倍率全 1（hpMul/dmgMul/marksMul 与 cycles.ts 一致）',
    c0.hpMul === dataMod.hp0 && c0.dmgMul === dataMod.dmg0 && c0.marksMul === dataMod.marks0,
    `hp=${c0.hpMul} dmg=${c0.dmgMul} marks=${c0.marksMul}`,
  );

  // ── 3. 未满级 prestige() 返回 false，且**状态逐字段不变** ────────────────
  const before3 = await cdp.eval(SNAPSHOT);
  const ret3 = await cdp.eval('(()=>window.__zhuoxian.prestige())()');
  const after3 = await cdp.eval(SNAPSHOT);
  const same3 = JSON.stringify({ ...before3, logLines: 0 }) === JSON.stringify({ ...after3, logLines: 0 });
  check(
    '未满级 prestige() 返回 false 且 floor/wave/step/xp/marks/bag/装备 一个都没变',
    ret3 === false && same3,
    `ret=${ret3} · ${JSON.stringify(before3)} → ${JSON.stringify(after3)}`,
  );

  // ── 4. 边界：step 79 → ready=false；step 80 → ready=true；复活冷却中 step 80 也 false ──
  const setStep = (n) => cdp.eval(`(()=>{const z=window.__zhuoxian;z.session.character={...z.session.character,step:${n}};return z.cycleInfo().ready})()`);
  const ready79 = await setStep(79);
  const ready80 = await setStep(80);
  check('边界：step=79 → ready=false（差一步不算满级）', ready79 === false, `ready=${ready79}`);
  check('边界：step=80 → ready=true（isMaxStep 含端点）', ready80 === true, `ready=${ready80}`);
  // 死亡冷却中不许轮回：`prestigeReady = isMaxStep && reviveCooldown <= 0`
  const readyCd = await cdp.eval(
    '(()=>{const z=window.__zhuoxian;z.session.battle.reviveCooldown=3;const r=z.cycleInfo().ready;z.session.battle.reviveCooldown=0;return r})()',
  );
  check('边界：满级但 reviveCooldown>0 → ready=false（死亡冷却中不许轮回）', readyCd === false, `ready=${readyCd}`);

  // ── 4b. 真按 N → cycle+1、境界/层/波重置（先跑键位路径，再跑同帧钩子路径） ──
  // 顺序很重要：`prestige()` 会真的把周目 +1，所以「cycle 必须等于 1」这类断言只能排在
  // 键位路径这一段；同帧渊痕断言放在刷新之后（那时它把 1 → 2，不影响前面的断言）。
  const marksBefore = await cdp.eval('(()=>{const z=window.__zhuoxian;z.session.character={...z.session.character,step:80};z.session.battle.reviveCooldown=0;return z.session.character.marks??0})()');
  await cdp.key('KeyN', 'n');
  await sleep(900);
  const after5 = await cdp.eval(`(() => {
    const z = window.__zhuoxian;
    const s = z.session;
    return {
      info: z.cycleInfo(),
      step: s.character.step,
      floor: s.floor,
      wave: s.wave,
      marks: s.character.marks ?? 0,
      bag: s.bag.length,
      monsters: s.battle.monsters.length,
      monsterHp: s.battle.monsters.reduce((a, m) => a + m.maxHp, 0),
      lastLog: s.log.length ? s.log[s.log.length - 1].text : '',
      logTexts: s.log.map((l) => l.text),
    };
  })()`);
  check(
    '按 N 真的轮回：cycle 递增到 1（名称 = cycleName(1)）',
    after5.info.cycle === 1 && after5.info.name === dataMod.name1,
    `cycle=${after5.info.cycle} name=${after5.info.name}`,
  );
  check(
    '轮回后境界归零（step=0）· 层 1 · 波 1',
    after5.step === 0 && after5.floor === 1 && after5.wave === 1,
    `step=${after5.step} floor=${after5.floor} wave=${after5.wave}`,
  );
  check(
    '轮回后背包清空（bag=0），渊痕只增不减（跨帧只断方向，不断等值）',
    after5.bag === 0 && after5.marks >= marksBefore,
    `bag=${after5.bag} · marks ${marksBefore} → ${after5.marks}`,
  );
  check(
    '轮回后战斗态真的按新周目重建（怪 >0 且总血量 >0）',
    after5.monsters > 0 && after5.monsterHp > 0,
    `monsters=${after5.monsters} ΣmaxHp=${Math.round(after5.monsterHp)}`,
  );
  check(
    '轮回倍率按 cycles.ts 生效（hp=cycleHpMul(1) · dmg=cycleDmgMul(1) · marks=cycleMarksMul(1)）',
    after5.info.hpMul === dataMod.hp1 && after5.info.dmgMul === dataMod.dmg1 && after5.info.marksMul === dataMod.marks1,
    `hp=${after5.info.hpMul}/${dataMod.hp1} dmg=${after5.info.dmgMul}/${dataMod.dmg1} marks=${after5.info.marksMul}/${dataMod.marks1}`,
  );
  check(
    '轮回日志写进会话日志（含 cycleName(1)；不限「最后一条」，成就日志会插在后面）',
    Array.isArray(after5.logTexts) && after5.logTexts.some((t) => typeof t === 'string' && t.includes('轮回') && t.includes(dataMod.name1)),
    `命中「${(after5.logTexts ?? []).filter((t) => typeof t === 'string' && t.includes('轮回')).slice(-1)[0] ?? ''}」`,
  );

  // ── 6. 周目号入档：save → reload → cycle 仍是 1 ─────────────────────────
  await cdp.eval('(()=>{window.__zhuoxian.save();return true})()');
  await sleep(600);
  await cdp.send('Page.reload', { ignoreCache: false });
  await sleep(3200);
  const afterReload = await cdp.eval('(()=>{const z=window.__zhuoxian;return {cycle:z.cycleInfo().cycle,name:z.cycleInfo().name,step:z.session.character.step}})()');
  check(
    '刷新后周目号仍在（cycle=1，周目号已入档）',
    afterReload.cycle === 1 && afterReload.name === dataMod.name1,
    `cycle=${afterReload.cycle} name=${afterReload.name} step=${afterReload.step}`,
  );

  // ── 6b. 「渊痕必须保留」不能跨帧测（放在刷新之后：它把周目 1 → 2） ─────────
  // 真实 session 里每分钟都在产渊痕（`MARKS_PER_MINUTE`）且成就结算是异步的，隔 900ms 再读
  // marks 一定不等（第一版就在这里假红：1234567 → 1249567）。D102 的规矩同源：
  // 「某操作不该改变 X」必须让**操作与读数同帧**，所以这里用同步钩子 `prestige()` 一次算完。
  // 装备不按「清成 0」判 —— 新角色自带起手武器，正确判据是「回到新号那套装备（件数与开局相等）」。
  const marksKeep = await cdp.eval(`(() => {
    const z = window.__zhuoxian;
    const s = z.session;
    const marks = 1234567;
    s.character = { ...s.character, step: 80, marks };
    s.battle.reviveCooldown = 0;
    const before = { marks: s.character.marks ?? 0, equipped: Object.keys(s.character.equipment ?? {}).length, bag: s.bag.length };
    const ok = z.prestige();
    const after = { marks: s.character.marks ?? 0, equipped: Object.keys(s.character.equipment ?? {}).length, bag: s.bag.length, cycle: z.cycleInfo().cycle };
    return { ok, before, after };
  })()`);
  check(
    'prestige() 同帧：渊痕原样保留、装备回到新号那套、背包清空（不跨帧读 marks）',
    marksKeep.ok === true &&
      marksKeep.after.marks === marksKeep.before.marks &&
      marksKeep.after.bag === 0 &&
      marksKeep.after.equipped === starterEquipped,
    `ok=${marksKeep.ok} marks ${marksKeep.before.marks}→${marksKeep.after.marks} · 装备 ${marksKeep.before.equipped}→${marksKeep.after.equipped}（开局 ${starterEquipped}）· bag ${marksKeep.before.bag}→${marksKeep.after.bag} · cycle=${marksKeep.after.cycle}`,
  );

  // ── 7. 未满级按 N：不改状态 + 日志解释条件 ──────────────────────────────
  const before7 = await cdp.eval(SNAPSHOT);
  await cdp.key('KeyN', 'n');
  await sleep(700);
  const after7 = await cdp.eval(SNAPSHOT);
  const same7 =
    before7.cycle === after7.cycle &&
    before7.floor === after7.floor &&
    before7.step === after7.step &&
    before7.marks === after7.marks &&
    before7.bag === after7.bag;
  const lastLog7 = await cdp.eval('(()=>{const l=window.__zhuoxian.session.log;return l.length?l[l.length-1].text:""})()');
  check(
    '未满级按 N 不改状态（cycle/floor/step/marks/bag 全等）',
    same7,
    `${JSON.stringify(before7)} → ${JSON.stringify(after7)}`,
  );
  check(
    '未满级按 N 在日志里解释条件（含「轮回需先满级」）',
    typeof lastLog7 === 'string' && lastLog7.includes('轮回需先满级'),
    `「${lastLog7}」`,
  );

  // ── 8. 周目倍率随周目号单调（第 3 周目与 cycles.ts 现算值一致，含渊痕钳制） ──
  const c3 = await cdp.eval(`(async () => {
    const z = window.__zhuoxian;
    z.session.cycle = 3;
    const info = z.cycleInfo();
    const m = await import('/src/data/cycles.ts');
    return { info, hp3: m.cycleHpMul(3), dmg3: m.cycleDmgMul(3), marks3: m.cycleMarksMul(3), name3: m.cycleName(3) };
  })()`);
  check(
    '第 3 周目倍率与 cycles.ts 一致（hp/dmg 乘方 · marks 有钳制）',
    c3.info.hpMul === c3.hp3 && c3.info.dmgMul === c3.dmg3 && c3.info.marksMul === c3.marks3 && c3.info.name === c3.name3,
    `hp=${c3.info.hpMul}/${c3.hp3} dmg=${c3.info.dmgMul}/${c3.dmg3} marks=${c3.info.marksMul}/${c3.marks3} name=${c3.info.name}`,
  );

  // ── 9. 控制台零报错 ───────────────────────────────────────────────────
  check('控制台零报错', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
} catch (e) {
  check('探针自身没崩', false, String(e).slice(0, 200));
} finally {
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  chrome.kill();
  await sleep(300);
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} 通过 · EXIT=${passed === results.length ? 0 : 1}`);
process.exit(passed === results.length ? 0 : 1);
