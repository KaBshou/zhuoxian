# Batch v2: same clean server (5288) for every probe, one timestamp. ASCII only.
$ErrorActionPreference = 'Continue'
$ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = "F:\dsh-work\zhuoxian\tools\_probes-batch2-$stamp.txt"
$url = 'http://127.0.0.1:5288/'
"# BATCH2 START $ts URL=$url" | Set-Content $out -Encoding UTF8

$probes = @('battle','save','floor','breakdown','detail','marks','talent','skill','class')
foreach ($p in $probes) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $r = & node "F:\dsh-work\tools\probe-$p.mjs" $url 2>&1
  $code = $LASTEXITCODE
  $sw.Stop()
  $res = ($r | Select-String -Pattern ':' | Select-Object -Last 1).Line
  $line = "probe-$p EXIT=$code DUR=$([math]::Round($sw.Elapsed.TotalSeconds,1))s"
  Add-Content $out -Encoding UTF8 $line
  $r | Select-Object -Last 3 | Add-Content $out -Encoding UTF8
  $line
}
"# BATCH2 END $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))" | Add-Content $out -Encoding UTF8
"OUT=$out"
