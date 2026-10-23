/**
 * 浏览器文件交互（下载 / 选文件 / 复制到剪贴板）。
 *
 * 为什么单开一层：`src/core/` 里的东西要能被 `vite-node` 和单测直接跑（没有 document/window）。
 * 这几个函数是**唯一**碰 DOM 文件 API 的地方，测试里绕过它们、只测 `save-transfer.ts` 的纯逻辑。
 *
 * 三条实现注意：
 *   - 下载用 `Blob + <a download>`：手机上 Chrome/Safari 都会落到「下载」目录，玩家能找到。
 *   - 剪贴板 `navigator.clipboard` 只在 https 或 localhost 可用，失败要能安静返回 false
 *     （调用方据此只说「已下载」，而不谎报「已复制」）。
 *   - 选文件用隐藏 `<input type="file">`：用户取消时现代浏览器会派 `cancel` 事件，
 *     老浏览器没有 —— 所以再加一层 window focus 兜底，否则 Promise 永远不 resolve（内存与流程都卡住）。
 */

export function downloadText(fileName: string, text: string): boolean {
  try {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // 立刻 revoke 会让部分浏览器来不及取数据；给一个宽松的延迟。
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 落到下面的兜底
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function pickTextFile(): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      window.removeEventListener('focus', onFocus);
      resolve(value);
    };

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';

    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) {
        finish(null);
        return;
      }
      file
        .text()
        .then((text) => finish(text))
        .catch(() => finish(null));
    });
    // 标准做法（Chrome 113+ / Safari 16.4+）
    input.addEventListener('cancel', () => finish(null));

    // 兜底：用户取消后焦点会回到窗口；给一点时间让 change 先跑完。
    const onFocus = () => {
      window.setTimeout(() => {
        if (!settled && (!input.files || input.files.length === 0)) finish(null);
      }, 800);
    };
    window.addEventListener('focus', onFocus);

    document.body.appendChild(input);
    input.click();
  });
}
