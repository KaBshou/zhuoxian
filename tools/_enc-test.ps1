chcp 65001 > $null
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
try { $OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$o = & node F:\dsh-work\tools\probe-floor.mjs http://127.0.0.1:5292/ 2>&1 | Out-String
$text = [string]$o
"len=" + $text.Length
$ms = [regex]::Matches($text, '(\d+)\s*/\s*(\d+)')
"matches=" + $ms.Count
foreach ($pat in @('??\s*(\d+)\s*/\s*(\d+)','???\s*(\d+)\s*/\s*(\d+)','??\s+(\d+)\s*/\s*(\d+)','(\d+)\s*/\s*(\d+)\s*??')) { $m2=[regex]::Matches($text,$pat); "PAT $pat -> $($m2.Count)" }
