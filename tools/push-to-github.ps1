# 把《浊仙》推到 GitHub —— 一条命令版（给第一次用 GitHub 的人）
#
# 用法（PowerShell 里）：
#   cd F:\dsh-work\zhuoxian
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\push-to-github.ps1
#
# 它会做五件事：
#   1. 本地检查（分支必须是 main、部署工作流必须在）
#   2. 自动探测本机代理并设好（不设连不上 github.com，实测直连超时）
#   3. 让你粘贴一次 Token（输入时不显示，粘贴后回车）
#   4. 推送
#   5. 把 Token 存进 git 凭据库，以后 push 不用再输
#
# 为什么用 Token 而不是弹浏览器登录：这台机器上浏览器的登录窗口会被别的窗口盖住，
# 而且登录进程自己也要走代理，容易卡住。Token 配一次，之后长期有效。

param(
  [string]$User = 'KaBshou',
  [string]$Repo = 'zhuoxian',
  [int[]]$ProxyPorts = @(7897, 7890, 10809, 10808, 1080)
)

$ErrorActionPreference = 'Stop'

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }

# ---------- 0. 定位项目 ----------
$proj = 'F:\dsh-work\zhuoxian'
if (-not (Test-Path $proj)) { throw "找不到项目目录 $proj" }
Set-Location $proj
Say "项目目录：$proj"

# ---------- 1. 本地检查 ----------
Say ''
Say '【1/5】本地检查' 'Cyan'

$branch = (git branch --show-current).Trim()
if ($branch -ne 'main') {
  Say "  分支是 '$branch'，改名成 'main'（部署工作流只认 main）" 'Yellow'
  git branch -M main
}
Say "  分支：$((git branch --show-current).Trim())"

if (-not (Test-Path '.github\workflows\deploy.yml')) {
  throw '缺少 .github/workflows/deploy.yml —— 没有它 GitHub 不会自动部署'
}
if (-not (Test-Path 'package-lock.json')) {
  throw '缺少 package-lock.json —— CI 里的 npm ci 会失败'
}
Say "  提交数：$((git rev-list --count HEAD).Trim())"
Say '  部署工作流、package-lock.json 都在'

# ---------- 2. 代理 ----------
Say ''
Say '【2/5】网络（github.com 在国内需要代理）' 'Cyan'

$proxy = $null
foreach ($port in $ProxyPorts) {
  $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
          Select-Object -First 1
  if ($conn) { $proxy = "http://127.0.0.1:$port"; break }
}

if ($proxy) {
  Say "  找到本机代理：$proxy"
  $env:HTTP_PROXY  = $proxy
  $env:HTTPS_PROXY = $proxy
  $env:NO_PROXY    = '127.0.0.1,localhost'
  # 只给 github.com 走代理，其它网站不受影响
  git config --global http.https://github.com.proxy $proxy
} else {
  Say '  没找到本机代理，按直连尝试（若失败请先打开你的代理软件）' 'Yellow'
}

$remoteUrl = "https://github.com/$User/$Repo.git"
Say '  测试能否连上仓库……'
$probe = git ls-remote --heads $remoteUrl 2>&1
if ($LASTEXITCODE -ne 0) {
  Say ''
  Say '  [X] 连不上 github.com' 'Red'
  Say '     1) 确认代理软件已打开（右下角托盘）'
  Say '     2) 确认仓库已创建：https://github.com/new （名字 zhuoxian，Public，三个勾都不勾）'
  Say "     3) 确认用户名拼写：当前是 $User"
  Say ''
  Say '  原始错误：'
  Say ($probe | Out-String)
  exit 1
}
$remoteHeads = ($probe | Where-Object { $_ -match '\S' } | Measure-Object).Count
Say "  连接正常（远端已有 $remoteHeads 个分支）"

# ---------- 3. Token ----------
Say ''
Say '【3/5】GitHub Token' 'Cyan'
Say '  需要一串以 ghp_ 开头的字符（创建方法见聊天里的说明）'
Say '  粘贴后按回车。输入时屏幕上不显示任何字符，这是正常的。'
$sec = Read-Host -AsSecureString '  Token'
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

if ([string]::IsNullOrWhiteSpace($token)) {
  Say '  没读到 Token，退出' 'Red'
  exit 1
}
$token = $token.Trim()
if ($token.Length -lt 20) {
  Say "  Token 只有 $($token.Length) 个字符，看着不像（GitHub 的通常 40 位左右）" 'Yellow'
}

# ---------- 4. 推送 ----------
Say ''
Say '【4/5】推送' 'Cyan'

$authUrl = 'https://' + $User + ':' + $token + '@github.com/' + $User + '/' + $Repo + '.git'
git remote remove origin 2>$null
git remote add origin $authUrl
Say '  开始上传（项目约 21MB，第一次会慢一点）……'

# 注意：不能用 $LASTEXITCODE 判成败。git push 在「没有新提交」时把
# "Everything up-to-date" 写到 stderr，PowerShell 会把它包装成 NativeCommandError，
# 于是看起来像失败（实测过：其实早推成功了）。判据改成「远端 HEAD 是否等于本地 HEAD」。
$pushOut = git push -u origin main 2>&1
$pushText = ($pushOut | Out-String)

# 无论成败，先把 Token 从 remote 地址里摘掉（不让它留在配置文件里）
git remote set-url origin $remoteUrl

$localHead = (git rev-parse HEAD).Trim()
$remoteHead = ''
try {
  $lsOut = git ls-remote origin refs/heads/main 2>$null
  if ($lsOut) { $remoteHead = ($lsOut -split '\s+')[0].Trim() }
} catch { $remoteHead = '' }

$pushOk = ($localHead.Length -gt 0) -and ($localHead -eq $remoteHead)

if (-not $pushOk) {
  Say ''
  Say '  [X] 推送失败（远端 main 和本地对不上）' 'Red'
  Say ("  本地 HEAD：" + $localHead)
  Say ("  远端 HEAD：" + $(if ($remoteHead) { $remoteHead } else { '（读不到）' }))
  Say ''
  Say '  git 输出：'
  Say $pushText
  Say '  常见原因：' 'Yellow'
  Say '   a) Token 复制不全 / 已过期 -> 重新生成一个'
  Say '   b) Token 没勾 repo 权限 -> 生成时把 repo 那一整行勾上'
  Say '   c) 建仓库时勾了 README -> 本地和远端历史冲突，在 GitHub 上删掉仓库重建（空仓库）'
  Say '   d) 网络断了 -> 重跑本脚本即可（不会重复上传）'
  exit 1
}

if ($pushText -match 'Everything up-to-date') {
  Say '  [OK] 远端已经是最新的（没有新提交要推，这不算失败）'
} else {
  Say '  [OK] 推送成功'
}

# ---------- 5. 记住凭据 ----------
Say ''
Say '【5/5】记住凭据（以后 push 不用再输）' 'Cyan'
git config --global credential.helper store
$lf = [char]10
$cred = 'protocol=https' + $lf + 'host=github.com' + $lf + 'username=' + $User + $lf + 'password=' + $token + $lf + $lf
$cred | git credential approve
Say '  已保存到用户目录下的 .git-credentials（明文，仅本机）'

# ---------- 收尾 ----------
$check = git ls-remote --heads origin 2>&1
Say ''
Say '远端现在的分支：'
Say ($check | Out-String)

Say ''
Say '============ 接下来在网页上做两件事 ============' 'Green'
Say ''
Say '① 打开 Pages 设置（只需一次）：'
Say "   https://github.com/$User/$Repo/settings/pages" 'Cyan'
Say '   Build and deployment -> Source 选 GitHub Actions'
Say ''
Say '② 看部署进度（2~3 分钟）：'
Say "   https://github.com/$User/$Repo/actions" 'Cyan'
Say ''
Say '绿勾之后，游戏网址是：'
Say "   https://$User.github.io/$Repo/" 'Green'
Say ''
Say '以后改了代码，只要三行：'
Say '   git add -A'
Say '   git commit -m "说明改了什么"'
Say '   git push'
Say '================================================'
