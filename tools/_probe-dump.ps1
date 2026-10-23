# Dump full stdout of five probes to separate UTF-8 files. ASCII only.
$ErrorActionPreference = 'Continue'
$url = 'http://127.0.0.1:5288/'
foreach ($p in @('battle','save','marks','talent','skill')) {
  $o = "F:\dsh-work\zhuoxian\tools\_raw-$p.txt"
  & node "F:\dsh-work\tools\probe-$p.mjs" $url > $o 2>&1
  "probe-$p EXIT=$LASTEXITCODE -> $o"
}
