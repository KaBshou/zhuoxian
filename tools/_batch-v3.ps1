# Batch v3: all probes (incl output slot), env PROBE_CLASS default. ASCII only.
$ErrorActionPreference = 'Continue'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = "F:\dsh-work\zhuoxian\tools\_probes-v3-$stamp.txt"
$dir = "F:\dsh-work\zhuoxian\tools\_v3raw"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$url = $args[0]
if (-not $url) { $url = 'http://127.0.0.1:5288/' }
"# BATCH3 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') URL=$url" | Set-Content $out -Encoding UTF8

$probes = @('battle','save','floor','breakdown','detail','marks','talent','skill','class','onboarding')
foreach ($p in $probes) {
  $raw = Join-Path $dir "$p.txt"
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  & node "F:\dsh-work\tools\probe-$p.mjs" $url > $raw 2>&1
  $code = $LASTEXITCODE
  $sw.Stop()
  "probe-$p EXIT=$code DUR=$([math]::Round($sw.Elapsed.TotalSeconds,1))s RAW=$raw" | Add-Content $out -Encoding UTF8
  "probe-$p EXIT=$code DUR=$([math]::Round($sw.Elapsed.TotalSeconds,1))s"
}
"# BATCH3 END $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))" | Add-Content $out -Encoding UTF8
"OUT=$out"
