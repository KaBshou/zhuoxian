# ASCII-only batch runner for the browser probe plate (PS5 reads non-ASCII .ps1 as ANSI).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tools\_plate.ps1
#
# DENOMINATOR NOTE (probe-detail is variable on purpose):
#   probe-detail now waits up to 60s for `equipped>=2`, and if the drop rate is unlucky it INJECTS
#   a second item (灵品 with 2 affixes) instead of skipping, so the denominator is normally 8.
#   It only prints SKIP when there is not even one template item to clone (fresh save bug).
#   Therefore report the plate as "25 scripts / N items (detail denom 7|8)" -- N is 376 when
#   detail is 7 and 377 when detail is 8 (D173 added probe-save-panel: 17 items).
#   Never lower a threshold to make it green; re-derive the threshold from the panel row count.
#
# probe-cycle-24h: 1 item, NOT a browser probe and deliberately SKIP-able: it only reads the four
#   `run-timeline --cycle=0..3` json artifacts (tmp/base-cN.json, ~15 min of simulation). When they
#   are missing it prints SKIP and exits 0 -> the summary counts it as SKIP (not in the denominator,
#   not red). A plate that hard-depends on a manual 15-min run would grow a meaningless red on any
#   clean checkout. Real check: `node tools/check-cycle-24h.mjs tmp/base-c0.json ... tmp/base-c3.json`.
#
# probe-touch: 23 items now; the two extra cover D137 dive lock from the KEYBOARD side (L is a
#   no-op before unlock; after unlock L really toggles `diveLock()` on/off). State machine and
#   save round-trip live in tests/divine-lock.test.ts -- the probe only proves the key is wired.
#
# probe-cycle: 19 items (D130 周目). It sets `session.character.step = 80` to reach the prestige
#   boundary and then presses N for real, so it leaves its own profile at cycle 3 -- harmless
#   (each probe resets its own save), just don't expect "cycle 0" in a screenshot after it runs.
#
# REPORT DISCIPLINE (lead m05590 + shuzhi): a red list must be split in two classes --
#   "未启用 (gate not active)" vs "真红 (gate active and failed)". Concretely, for run-timeline
#   verdict fields: `realmGateActive === false` means the gate was NOT evaluated (c>=1), so a
#   `realmMagnitudeOk === false` next to it is NOT a failure; only `realmGateActive === true &&
#   realmMagnitudeOk === false` is a real red. Never collapse "not evaluated" into "failed" --
#   that turns a non-gate into a permanent red nobody can fix.
#
# TWO INFRA PITFALLS (both cost a full plate run each, 2026-10-23):
#   1. CDP port exclusivity: every probe hardcodes its own debugging port (9333/9363/9364...).
#      If a previous chrome is still listening, the new chrome cannot bind, and the probe quietly
#      connects to the OLD chrome's OLD page. Symptom: "hook missing / new hook is not a function"
#      while the source clearly has it. Before a plate run, free those ports.
#   2. _serve.mjs uses `watch: null` => no hot reload: server start time MUST be later than the
#      newest src mtime, otherwise the whole plate tests old code. Report all three timestamps
#      (src newest / serve start / plate start) every time.
# probe-touch: 21 items, touch layer. It must NOT get `?cls=` -- the whole point is "tap a card to
#   pick a class", so passing PROBE_CLASS would skip what it verifies.
# probe-achievement: 23 items (D93, J panel); the "achievement must not grant xp" assertion uses
#   `__zhuoxian.syncAchievementsNow()` so that operation and reading happen in the SAME frame
#   (cross-frame deltas only prove "it changed", not "this change caused it"). Row count and total
#   reward are compared against `ACHIEVEMENT_TOTAL` / `ACHIEVEMENT_REWARD_TOTAL` (module exports),
#   never against literal 20 / 385000. D168 adds two: the `xianFound` fact axis must exist, and the
#   "累计仙品" row must actually unlock (+30000 marks, xp untouched) when that axis is set -- it must
#   match a row whose id starts with `xian-` AND whose desc contains 累计, because `xian-1`
#   「一仙在身」 reads `xianEquipped` (equipped count), not the cumulative counter.
# probe-codex: 23 items; variant unlock is tested on BOTH paths -- killing a real variant (product
#   path, 4-multiple wave at floor 28, 1 hp + high-damage player, real tickSession) and the
#   `unlockCodex(['variant'])` hook (boundary, after clearing codex). Deep-legendary detail asserts
#   `startsWith(desc)` + contains 层 ≥40 / 不是替换, never the whole sentence.
# probe-monster-affix: 22 items (D95 elite affixes + D160 variant). Needs a dev server (page-side
#   dynamic import of /src/core/battle.ts) and takes ~3.5 min because its real-page sampling window
#   is 180s (60s only sees ~16 spawns, too few to judge a ratio). A4 asserts the variant rules by
#   reading spawnRing(..., cycle, wave) results: exactly one `variant===true` per wave when
#   floor>=28 && wave%4===0, none otherwise/below floor, and its two affixes share one category.
# probe-marks-panel: 21 items, three concerns: (a) the read-only panel must not swallow
#   Digit1/2/3 (closed AND open: -360k, xi+1); (b) Escape must close it; (c) D137 dive lock --
#   setDiveLock is REFUSED before unlock, L changes nothing before unlock, the one-off unlock
#   really persists across a reload, and after unlock L really toggles active. No magic price
#   numbers: the spend assertions read the costs the product charges (360k is Digit1's price).
# probe-fragments: 15 items (D104 five-element fragments) -- lead's 10 plus 5 merged from the
#   duplicate copy (now archived at tools/_bak/): F only switches aim and never spends balance,
#   a real 1-hp boss killed through spawnMonster awards exactly 1 metal fragment, the
#   element->floor mapping is read from src/data/fragments.ts (no magic 28/3), and fragments
#   stay out of pocket (pocket keys must be exactly huang/mie/xi). The M-panel geometry is SCANNED
#   (longest continuous gold run along the panel's left edge), never hardcoded.
$ErrorActionPreference = 'Continue'
# PS5 decodes child stdout with the console codepage by default, which garbles UTF-8 Chinese
# in probe summaries ("总计 25/25 通过" -> "鎬昏 25/25 閫氳繃") and makes the keyword-based
# parsing below fail. Force UTF-8 both ways before spawning node.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
try { $OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$base = 'http://127.0.0.1:5292/'
# probe-dist serves `dist/` itself and resolves it from the **current directory**; every other probe
# takes the base URL. Pin the cwd so the plate gives the same result no matter where it is launched from.
Set-Location 'F:\dsh-work\zhuoxian'
$out = 'F:\dsh-work\zhuoxian\tools\_plate-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt'
Write-Output "== out=$out"

# PREFLIGHT: CDP port exclusivity (pitfall #1 above). A leftover headless chrome from a crashed
# probe keeps listening on its port; the next chrome cannot bind and the probe silently talks to
# the OLD page ("hook missing" while the source clearly has it). Probe every port the plate uses,
# print the owner, and kill it -- leftover chrome on a probe port is never legitimate.
$probePorts = @(9333, 9363, 9364, 9366, 9367, 9368)
foreach ($port in $probePorts) {
  $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($conn) {
    foreach ($owner in ($conn.OwningProcess | Select-Object -Unique)) {
      $proc = Get-Process -Id $owner -ErrorAction SilentlyContinue
      $pname = if ($proc) { $proc.ProcessName } else { '?' }
      $started = if ($proc) { $proc.StartTime.ToString('HH:mm:ss') } else { '?' }
      Write-Output "== PREFLIGHT port $port held by PID $owner ($pname, started $started) -> killing leftover"
      Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue
    }
  } else {
    Write-Output "== PREFLIGHT port $port free"
  }
}
Start-Sleep -Seconds 1
$newest = Get-ChildItem 'F:\dsh-work\zhuoxian\src' -Recurse -Include *.ts | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Output "== PREFLIGHT src newest = $($newest.Name) $($newest.LastWriteTime.ToString('HH:mm:ss')) (server must be started AFTER this)"

$probes = @(
  'F:\dsh-work\tools\probe-battle.mjs',
  'F:\dsh-work\tools\probe-save.mjs',
  'F:\dsh-work\tools\probe-floor.mjs',
  'F:\dsh-work\tools\probe-breakdown.mjs',
  'F:\dsh-work\tools\probe-detail.mjs',
  'F:\dsh-work\tools\probe-marks.mjs',
  'F:\dsh-work\tools\probe-talent.mjs',
  'F:\dsh-work\tools\probe-skill.mjs',
  'F:\dsh-work\tools\probe-class.mjs',
  'F:\dsh-work\tools\probe-onboarding.mjs',
  'F:\dsh-work\zhuoxian\tools\probe-legendary.mjs',
  'F:\dsh-work\zhuoxian\tools\probe-onboarding-indep.mjs',
  'F:\dsh-work\tools\probe-gem.mjs',
  'F:\dsh-work\tools\probe-codex.mjs',
  'F:\dsh-work\tools\probe-marks-panel.mjs',
  'F:\dsh-work\zhuoxian\tools\probe-touch.mjs',
  'F:\dsh-work\zhuoxian\tools\probe-achievement.mjs',
  'F:\dsh-work\tools\probe-monster-affix.mjs',
  'F:\dsh-work\zhuoxian\tools\probe-fragments.mjs',
  'F:\dsh-work\zhuoxian\tools\probe-death-mechanics.mjs',
  'F:\dsh-work\zhuoxian\tools\probe-cycle.mjs',
  'F:\dsh-work\zhuoxian\tools\probe-cycle-24h.mjs',
  # 24th: save transfer panel (D173). 17 items. It needs a dev server on the current code
  # (`_serve.mjs` is watch:null => restart it), and it prints EXIT=0/1 itself.
  # Two things it deliberately owns: the confirm button is clicked via `saveButtons()` rectangles
  # (never hardcoded coordinates) and "panel open + click outside" must NOT close the panel.
  'F:\dsh-work\zhuoxian\tools\probe-save-panel.mjs',
  # 25th: production build (serves dist/ on its own port, ignores the base URL; SKIPs when dist/ is
  # missing instead of going red -- a missing build artifact is not a regression).
  # 25th: audio engine + mute (D181) + volume axis (D182). 22 items.
  # Proves the *mechanism* (engine called, state saved, button highlighted) -- never "can you hear it":
  # a headless browser has no speakers and AudioContext still reports fine.
  'F:\dsh-work\zhuoxian\tools\probe-audio.mjs',
  # 26th: idle-grim style paperdoll on the main screen (D178). 9 items.
  # Reads cell geometry from paperdollCells(); the first version hardcoded coordinates and went 假红.
  'F:\dsh-work\zhuoxian\tools\probe-paperdoll.mjs',
  # 27th: boss HP bar width + percent text (D183). 8 items.
  # Sampling must multiply by viewport().ratio: after D175 canvas.width != 960, so logical coordinates
  # feed getImageData the wrong region.
  'F:\dsh-work\zhuoxian\tools\probe-boss-bar.mjs',
  # 28th: floor map (76-cell grid panel, D185). 13 items.
  # The probe reads cell geometry from floorMapCells() and asserts the FLOOR NUMBER really changed --
  # logging "jumped" proves nothing if setFloor rejected the move silently.
  'F:\dsh-work\zhuoxian\tools\probe-floormap.mjs',
  # 28th: bag panel (40-cell grid, D187). 15 items.
  # Geometry comes from bagCells(); the probe never hardcodes cell coordinates.
  'F:\dsh-work\zhuoxian\tools\probe-bag.mjs',
  # 29th: help panel (D190). 12 items. Opened by H / ? / the bottom-right "?" button;
  # asserts battle is NOT paused while it is open (a paused idle game is lost progress).
  'F:\dsh-work\zhuoxian\tools\probe-help.mjs',
  # 30th: screen shake (D199). 8 items. Asserts combat produces shake, decay direction,
  # NaN never reaches the renderer, and the HUD is not translated with the world layer.
  'F:\dsh-work\zhuoxian\tools\probe-shake.mjs',
  # 31st: stats panel (D200). 9 items. Opened by Y; asserts the panel is drawn (left gold bar),
  # playtime actually accumulates, and mutual exclusion with the other panels still holds.
  'F:\dsh-work\zhuoxian\tools\probe-stats.mjs',
  # 29th: production build (serves dist/ on its own port, ignores the base URL; SKIPs when dist/ is
  # missing instead of going red -- a missing build artifact is not a regression).
  'F:\dsh-work\zhuoxian\tools\probe-dist.mjs'
)
"# probe plate @ $(Get-Date -Format o) base=$base" | Out-File -FilePath $out -Encoding utf8
$total = 0
$passed = 0
foreach ($p in $probes) {
  $name = [System.IO.Path]::GetFileName($p)
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $o = & node $p $base 2>&1 | Out-String
  $sw.Stop()
  $code = $LASTEXITCODE
  $o | Out-File -FilePath $out -Encoding utf8 -Append
  # Parse ONLY the keyword summary lines. Do NOT scan every line for "<n>/<m>": failure details
  # contain things like "hp=152/152" and that once made the plate report 406/406 while
  # probe-battle was actually red (the ratio was read out of the failure text).
  # Note: PS5 chokes on [regex]::Match($null, ...) -> always coerce to a real string first.
  $text = [string]$o
  $patterns = @(
    '总计\s*(\d+)\s*/\s*(\d+)',
    '结果：\s*(\d+)\s*/\s*(\d+)',
    '通过\s+(\d+)\s*/\s*(\d+)',
    '(\d+)\s*/\s*(\d+)\s*通过'
  )
  $got = 'n/a'
  foreach ($pat in $patterns) {
    $ms = [regex]::Matches($text, $pat)
    if ($ms.Count -gt 0) {
      $last = $ms[$ms.Count - 1]
      $got = "$($last.Groups[1].Value)/$($last.Groups[2].Value)"
      $passed += [int]$last.Groups[1].Value
      $total += [int]$last.Groups[2].Value
      break
    }
  }
  $bad = $got -ne 'n/a' -and (($got -split '/')[0] -ne ($got -split '/')[1])
  $verdict = if ($code -ne 0 -or $bad) { 'RED' } else { 'ok' }
  $summary = "== $name exit=$code dur=$([math]::Round($sw.Elapsed.TotalSeconds,1))s [$verdict] $got"
  if ($code -ne 0) {
    $fail = ($text -split "`n" | Where-Object { $_ -match '^(FAIL|- |  - )' } | Select-Object -First 6) -join ' | '
    if ($fail) { $summary += "  失败项: $fail" }
  }
  $summary | Out-File -FilePath $out -Encoding utf8 -Append
  Write-Output $summary
}
Write-Output "== TOTAL $passed/$total"
"== TOTAL $passed/$total" | Out-File -FilePath $out -Encoding utf8 -Append
# PS5's own parsing above reports n/a for most probes (it decodes node's UTF-8 as ANSI), so the
# AUTHORITATIVE read is the Node side: it reads the UTF-8 evidence file and prints ASCII lines.
# This is also the number to quote in reports ("N/M · S/S scripts · RED=0 · UNPARSED=0").
& node 'F:\dsh-work\zhuoxian\tools\_plate-summary.mjs' $out
if ($LASTEXITCODE -ne 0) { Write-Output '== PLATE RED (see summary above)' } else { Write-Output '== PLATE GREEN' }
# probe-death-mechanics: 20 items (D110/D111/D113). NOT a browser probe: it runs the real modules
#   through vite ssrLoadModule (tools/vite-loader.mjs), so it needs no Chrome and no CDP port.
#   It pins MECHANICS ("die on wave 3 -> back to wave 1", "3 deaths in a row -> floor -1",
#   "death only costs 10% of the current step's xp") and deliberately does NOT pin absolute
#   death counts -- those belong to run-timeline's survival window and change with every tuning.