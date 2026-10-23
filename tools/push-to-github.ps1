# 一条命令把《浊仙》推到 GitHub（给没用过 GitHub 的人用）
#
# 用法（在 PowerShell 里，把 你的GitHub用户名 换掉）：
#   cd F:\dsh-work\zhuoxian
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\push-to-github.ps1 -User 你的GitHub用户名
#
# 它做四件事：
#   1. 确认当前分支叫 main（GitHub 的 Actions 配的是 main，名字不对就不触发部署）
#   2. 配好 remote（远端仓库地址）——已经有了就改地址，不会重复加
#   3. push（把本地 6 个提交传上去）
#   4. 打印之后的两个网址（Actions 页面 / 游戏网址）
#
# 注意：第一次 push 会弹出浏览器让你登录 GitHub（Windows 自带的登录器），
# 点「Sign in with your browser」登录一次就好，之后会把凭据存在电脑上。

param(
  [Parameter(Mandatory = $true)][string]$User,
  [string]$Repo = 'zhuoxian'
)

$ErrorActionPreference = 'Stop'
$proj = 'F:\dsh-work\zhuoxian'
if (-not (Test-Path $proj)) { throw "找不到项目目录 $proj" }
Set-Location $proj

# 1. 分支名
$branch = (git branch --show-current).Trim()
if ($branch -ne 'main') {
  Write-Host "分支是 '$branch'，改名成 'main'（部署工作流只认 main）" -ForegroundColor Yellow
  git branch -M main
}

# 2. remote
$url = "https://github.com/$User/$Repo.git"
$existing = (git remote 2>$null)
if ($existing -contains 'origin') {
  Write-Host "已经配过 origin，改成 $url" -ForegroundColor Yellow
  git remote set-url origin $url
} else {
  git remote add origin $url
  Write-Host "已配 origin = $url"
}

# 3. 本地状态自检（防止推上去一个必定失败的版本）
Write-Host "`n本地自检：" -ForegroundColor Cyan
$dirty = (git status --porcelain | Measure-Object).Count
if ($dirty -gt 0) { Write-Host "  ⚠ 还有 $dirty 个文件没提交（这不影响推送，但可能和本地不一致）" -ForegroundColor Yellow }
$commits = (git rev-list --count HEAD).Trim()
Write-Host "  分支 $((git branch --show-current).Trim())，共 $commits 个提交"
if (-not (Test-Path '.github\workflows\deploy.yml')) { throw "缺少 .github/workflows/deploy.yml，Actions 不会部署" }
if (-not (Test-Path 'package-lock.json')) { throw "缺少 package-lock.json，CI 里的 npm ci 会失败" }
Write-Host "  部署工作流与 package-lock.json 都在 ✅"

# 4. push
Write-Host "`n开始推送（第一次会弹浏览器登录 GitHub，登录一次即可）……" -ForegroundColor Cyan
git push -u origin main
if ($LASTEXITCODE -ne 0) {
  Write-Host "`n❌ 推送失败。常见原因：" -ForegroundColor Red
  Write-Host "  1) 用户名或仓库名写错 → 仓库地址应为 https://github.com/<用户名>/<仓库名>"
  Write-Host "  2) 仓库还没在 GitHub 上创建（要先手动 New repository，见聊天里的第 2 步）"
  Write-Host "  3) 没登录 / 没有这个仓库的写权限"
  exit 1
}

# 5. 打印后续地址
Write-Host "`n✅ 推送成功" -ForegroundColor Green
Write-Host "  Actions（看部署是否成功）：https://github.com/$User/$Repo/actions"
Write-Host "  设置 Pages（只需做一次）：  https://github.com/$User/$Repo/settings/pages"
Write-Host "  游戏网址（Pages 部署成功后才生效）：https://$User.github.io/$Repo/"
Write-Host "`n下一步：打开上面第二个链接，把 Source 选成 'GitHub Actions'，然后等 Actions 跑绿。" -ForegroundColor Cyan
