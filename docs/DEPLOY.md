# 《浊仙》部署说明

一页纸，写给「三个月后回来发布」的自己。所有命令都在 `F:\dsh-work\zhuoxian\` 下执行。

---

## 0. 一条命令走完所有门禁

```bash
node tools/gate.mjs
```

依次跑：`tsc --noEmit` → `vitest run` → `vite build` → `probe-dist.mjs`，任何一步红就停并打印它是哪一步。
**这条命令 EXIT=0 才允许发布** —— 别手打四条命令，手打就会漏一条（漏的通常是最后那条 `probe-dist`）。

## 1. 构建

```bash
npx tsc --noEmit          # 必须 EXIT=0
npx vitest run            # 必须全绿（当前 744 passed / 49 files）
npx vite build            # 产物在 dist/
node tools/probe-dist.mjs # 必须在子路径下 14/14（见第 3 节，为什么这条不能省）
```

`dist/` 是**纯静态**目录（`index.html` + `assets/*`），没有任何服务端依赖。
存档在浏览器 `localStorage`，键 `zhuoxian.save.v1` —— **换域名 = 换存档**，别指望自动迁
（存档面板里有导出/导入，换设备靠它）。

## 2. 三条硬约束（都是踩过的）

| 约束 | 为什么 | 在哪守 |
|---|---|---|
| `base: './'` 不能改回 `'/'` | 站要挂在 `/zhuoxian/` 这种子路径下，`'/'` 会让资源去根目录找，部署后**白屏** | `vite.config.ts` |
| 不能改成需要 node 的服务端渲染 | 目标就是「发个链接给朋友，手机点开就能玩」 | 全项目零后端 |
| 生产构建**故意**不挂 `window.__zhuoxian` | 那是探针钩子，能直接改存档；玩家不该有 | `src/main.ts` 的 `if (import.meta.env.DEV)` |

## 3. 为什么必须跑 `probe-dist.mjs`

`vite dev` 下的资源路径是 `/src/main.ts`，**部署路径的问题在 dev 里永远暴露不出来**。
`probe-dist.mjs` 做的事：把 `dist/` 用本地 HTTP 挂在 `/zhuoxian/` 子路径下（**故意不做 SPA 回退**，回退会掩盖路径错），用无头 Chrome 真打开，逐项验：

1. `index.html` 能打开；2. 资源 URL 都带子路径前缀；3. 没有任何 4xx；
4. canvas 真画了东西（不是白屏）；5. 生产构建没暴露调试钩子；
6. 按 Enter 能进入战斗；7. 画面在变（循环在跑）；
8. 写出了 `zhuoxian.save.v1`；9. reload 后存档还在；10. 存储键不越界；
11. 控制台零报错；12~14. **手机路径**：点屏幕能选道统进战斗、战斗真在跑、起点确实是选道统界面。

这就是「发给朋友之前」的最后一道门。共 14 项。

## 4. 发布到 GitHub Pages（推荐，已配好 Actions）

仓库里已经写好 `.github/workflows/deploy.yml`：**推 main 分支 → 自动跑门禁 → 自动部署**。
手上有绿门禁才可能上线（`probe-dist` 也在 CI 里跑，部署不绿就不发）。

首次发布（只做一次）：

```bash
cd F:\dsh-work\zhuoxian
git init                      # 若还没有仓库
git add -A
git commit -m "浊仙 v1：24h 内容量，全门禁绿"
# 在 GitHub 建一个空仓库 zhuoxian，然后：
git remote add origin https://github.com/<用户名>/zhuoxian.git
git branch -M main
git push -u origin main
```

然后在 GitHub 仓库：**Settings → Pages → Source 选 `GitHub Actions`**。
地址是 `https://<用户名>.github.io/zhuoxian/` —— **这正是 `probe-dist.mjs` 模拟的那个形状**。

- 公开仓库免费；私有仓库要 Pro 才能开 Pages（游戏代码会公开，介意就别用这条）。
- 之后每次发布 = `git push`，不用手动 build。

## 5. 发布到 Cloudflare Pages（不需要 Git，最快）

1. 注册 Cloudflare → Workers & Pages → Create → Pages → **Upload assets**；
2. 把 `dist/` 整个目录拖进去；
3. 项目名取 `zhuoxian` → 得到 `https://zhuoxian.pages.dev`（根路径，`base:'./'` 同样能用）；
4. 自定义域名随意（**存档会跟着域名换**，别在朋友玩到一半时换）。

## 6. 本地给别人试（同一个局域网）

```bash
npx vite preview --host 0.0.0.0 --port 4173   # 用 dist 产物，不要用 dev
```

然后让对方开 `http://<你的局域网 IP>:4173/`。`--host 0.0.0.0` 是必须的，
默认只监听 `127.0.0.1`，别人连不上（这个坑 90% 的人第一次都会踩）。

## 7. 发布前检查清单

- [ ] `node tools/gate.mjs` EXIT=0（类型 + 单测 + 构建 + 产物自检 四合一）
- [ ] `node tools/run-timeline.mjs --seeds=6 --minutes=900 --post-cap --talents=off` EXIT=0（数值门禁）
- [ ] 探针盘子全绿（`tools/_plate.ps1`，24 脚本 / 360 项）
- [ ] 手机上真机点一次（触摸、分辨率、缩放；canvas 是 960×540 固定尺寸）
- [ ] 发链接前自己用**无痕窗口**开一次（确认新号流程：选道统 → 引导 → 打完第一层）
- [ ] 用游戏内「存档」面板导出一次存档，确认能导回来（防清缓存丢档）
