import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('AI followUp 停止生成契约', () => {
  it('UI / preload / IPC 暴露停止路径', () => {
    const ui = source('src/components/AIAnalysis/AIAnalysis.tsx')
    const preload = source('electron/preload/index.ts')
    const handlers = source('electron/main/ipc/aiHandlers.ts')
    expect(ui).toContain('data-testid="ai-followup-stop"')
    expect(ui).toContain('aria-label="停止生成"')
    expect(ui).toContain('followUpStop')
    expect(preload).toContain('followUpStop')
    expect(preload).toContain("type: 'start' | 'delta' | 'reset' | 'error' | 'stop'")
    expect(handlers).toContain("ipcMain.handle('ai:followUpStop'")
    expect(handlers).toContain('registerFollowUpAbort')
  })
})
