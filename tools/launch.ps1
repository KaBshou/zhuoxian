# 启动《浊仙》：没开服务器就开一个，然后打开浏览器。
# 这个脚本由 play.vbs 无窗口调用，你一般不用直接跑它。

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

$project = 'F:\dsh-work\zhuoxian'
$port = 5274
$url = "http://127.0.0.1:$port/"

function Test-ServerUp {
  # 只看端口有没有人在听，比发 HTTP 请求快，也不受浏览器缓存影响
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

if (-not (Test-ServerUp)) {
  # 服务器没在跑，起一个。窗口隐藏，这样你看不到黑框，它也不会被误关。
  Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/c', 'npm run dev' `
    -WorkingDirectory $project `
    -WindowStyle Hidden

  # 等它起来。首次启动要编译，一般 1~2 秒，给足 30 秒余量。
  $ok = $false
  for ($i = 0; $i -lt 120; $i++) {
    Start-Sleep -Milliseconds 250
    if (Test-ServerUp) { $ok = $true; break }
  }

  if (-not $ok) {
    # 起不来就把原因摆到明面上，别让用户对着空气猜
    [System.Windows.Forms.MessageBox]::Show(
      "服务器没能启动。`n`n请手动打开终端，cd 到 $project，运行 npm run dev，把红字发给我。",
      "浊仙 · 启动失败"
    ) | Out-Null
    exit 1
  }

  # 端口通了不代表页面能访问，再等一小会儿让 vite 把首次编译做完
  Start-Sleep -Milliseconds 700
}

Start-Process $url
