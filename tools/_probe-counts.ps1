# Pass counts for probes whose summary line fell outside last-3 capture. ASCII only.
$ErrorActionPreference = 'Continue'
$url = 'http://127.0.0.1:5288/'
$out = "F:\dsh-work\zhuoxian\tools\_probes-counts-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"
"# COUNTS $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') URL=$url" | Set-Content $out -Encoding UTF8
foreach ($p in @('battle','save','marks','talent','skill')) {
  $r = & node "F:\dsh-work\tools\probe-$p.mjs" $url 2>&1
  $code = $LASTEXITCODE
  $res = ($r | Select-String -Pattern '通过' | Select-Object -Last 1).Line
  $line = "probe-$p EXIT=$code :: $res"
  Add-Content $out -Encoding UTF8 $line
  $line
}
"OUT=$out"
