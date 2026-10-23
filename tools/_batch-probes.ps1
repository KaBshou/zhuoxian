# One-shot acceptance batch (ASCII only: Windows PowerShell 5 reads .ps1 as ANSI).
$ErrorActionPreference = 'Continue'
$ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = "F:\dsh-work\zhuoxian\tools\_probes-batch-$stamp.txt"

"# BATCH START $ts" | Set-Content $out -Encoding UTF8

$probes = @('battle','save','floor','breakdown','detail','marks','talent','skill','class')
foreach ($p in $probes) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $r = & node "F:\dsh-work\tools\probe-$p.mjs" 2>&1
  $code = $LASTEXITCODE
  $sw.Stop()
  $pass = ($r | Select-String -Pattern 'PASS|pass|/' | Select-Object -Last 1).Line
  $line = "===== probe-$p ===== EXIT=$code DUR=$([math]::Round($sw.Elapsed.TotalSeconds,1))s"
  Add-Content $out -Encoding UTF8 $line
  $r | Select-Object -Last 6 | Add-Content $out -Encoding UTF8
  "$line :: $pass"
}

$sw = [System.Diagnostics.Stopwatch]::StartNew()
& node "F:\dsh-work\zhuoxian\tools\run-timeline.mjs" --seeds=3 --minutes=1000 --post-cap --json="F:\dsh-work\zhuoxian\tools\_acc-timeline-3s.json" > "F:\dsh-work\zhuoxian\tools\_acc-timeline-3s.txt" 2>&1
$code = $LASTEXITCODE
$sw.Stop()
Add-Content $out -Encoding UTF8 "===== run-timeline ===== EXIT=$code DUR=$([math]::Round($sw.Elapsed.TotalSeconds,1))s"
"run-timeline EXIT=$code DUR=$([math]::Round($sw.Elapsed.TotalSeconds,1))s"

$sw = [System.Diagnostics.Stopwatch]::StartNew()
& node "F:\dsh-work\zhuoxian\tools\craft-econ.mjs" --minutes=120 --seeds=3 --json="F:\dsh-work\zhuoxian\tools\_acc-craft-econ.json" > "F:\dsh-work\zhuoxian\tools\_acc-craft-econ.txt" 2>&1
$code = $LASTEXITCODE
$sw.Stop()
Add-Content $out -Encoding UTF8 "===== craft-econ ===== EXIT=$code DUR=$([math]::Round($sw.Elapsed.TotalSeconds,1))s"
"craft-econ EXIT=$code DUR=$([math]::Round($sw.Elapsed.TotalSeconds,1))s"

"# BATCH END $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))" | Add-Content $out -Encoding UTF8
"OUT=$out"
