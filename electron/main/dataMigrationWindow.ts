import { BrowserWindow } from 'electron'

function buildMigrationHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
  <title>正在迁移数据</title>
  <style>
    :root { color-scheme: light dark; font-family: "Microsoft YaHei UI", "PingFang SC", system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f8fafc; color: #0f172a; }
    .card { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 24px; text-align: center; }
    .spinner { width: 34px; height: 34px; border-radius: 50%; border: 3px solid #e2e8f0; border-top-color: #0891b2; animation: spin 0.9s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 2.4s; } }
    h1 { margin: 0; font-size: 16px; font-weight: 650; }
    p { margin: 0; color: #64748b; font-size: 12.5px; line-height: 1.7; }
    @media (prefers-color-scheme: dark) {
      body { background: #020617; color: #f8fafc; }
      .spinner { border-color: #1e293b; border-top-color: #22d3ee; }
      p { color: #94a3b8; }
    }
  </style>
</head>
<body>
  <div class="card" role="status" aria-live="polite">
    <div class="spinner" aria-hidden="true"></div>
    <h1>正在迁移数据</h1>
    <p>正在把本地数据复制到新的数据目录，请勿关闭应用。<br>数据量较大时可能需要几分钟，完成后会自动进入应用。</p>
  </div>
</body>
</html>`
}

/**
 * 数据根迁移期间的极简进度小窗：无框、不可交互，仅告知用户正在复制数据。
 * 复制完成（无论成败）后由调用方销毁。
 */
export function showDataMigrationProgressWindow(): BrowserWindow {
  const progressWindow = new BrowserWindow({
    width: 460,
    height: 220,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    title: '正在迁移数据',
    frame: false,
    show: false,
    backgroundColor: '#f8fafc',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  progressWindow.once('ready-to-show', () => progressWindow.show())
  void progressWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildMigrationHtml())}`)
  return progressWindow
}
