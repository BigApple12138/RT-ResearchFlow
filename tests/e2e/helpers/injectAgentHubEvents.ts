import type { ElectronApplication } from '@playwright/test'

const DEMO_AGENT_REQUEST_ID = '00000000-0000-4000-8000-000000000501'

/** 向当前窗口注入 Agent Hub 时间线事件（仅演示，不触发真实 agentTurn）。 */
export async function injectAgentHubTimeline(
  app: ElectronApplication,
  sessionId: number,
  options: { hitl?: boolean } = {},
): Promise<void> {
  const now = Date.now()
  await app.evaluate(({ BrowserWindow }, payload) => {
    const wc = BrowserWindow.getAllWindows()[0]?.webContents
    if (!wc) throw new Error('E2E_WEB_CONTENTS_UNAVAILABLE')
    const emit = (event: Record<string, unknown>) => {
      wc.send('ai:agentEvent', event)
    }
    const base = { requestId: payload.requestId, sessionId: payload.sessionId }
    emit({ ...base, type: 'start', at: payload.now })
    emit({
      ...base,
      type: 'plan',
      at: payload.now + 40,
      payload: {
        revision: 1,
        steps: [
          { title: '读取本地趋势事实' },
          { title: '对照板块资金与竞价' },
          { title: '整理可验证结论' },
        ],
      },
    })
    emit({
      ...base,
      type: 'status',
      at: payload.now + 80,
      payload: { message: '正在核对本地事实与证据边界…' },
    })
    emit({
      ...base,
      type: 'tool_call',
      at: payload.now + 120,
      payload: { name: 'trend.score', args: { tsCode: '600522.SH' } },
    })
    emit({
      ...base,
      type: 'tool_result',
      at: payload.now + 160,
      payload: { name: 'trend.score', ok: true, summary: '本地趋势评分 82，较近 5 日抬升' },
    })
    if (payload.hitl) {
      emit({
        ...base,
        type: 'hitl',
        at: payload.now + 200,
        payload: {
          hitlRequestId: '00000000-0000-4000-8000-000000000502',
          toolName: 'research.increment_apply',
          summary: '将 2 条语义变更写入产业项目（需你确认）',
        },
      })
    }
  }, {
    requestId: DEMO_AGENT_REQUEST_ID,
    sessionId,
    now,
    hitl: options.hitl ?? false,
  })
}

/** 在已有 Agent 时间线上追加 HITL 确认条（避免重复注入完整时间线）。 */
export async function injectAgentHubHitl(
  app: ElectronApplication,
  sessionId: number,
): Promise<void> {
  const now = Date.now()
  await app.evaluate(({ BrowserWindow }, payload) => {
    const wc = BrowserWindow.getAllWindows()[0]?.webContents
    if (!wc) throw new Error('E2E_WEB_CONTENTS_UNAVAILABLE')
    wc.send('ai:agentEvent', {
      requestId: payload.requestId,
      sessionId: payload.sessionId,
      type: 'hitl',
      at: payload.now,
      payload: {
        hitlRequestId: '00000000-0000-4000-8000-000000000502',
        toolName: 'research.increment_apply',
        summary: '将 2 条语义变更写入产业项目（需你确认）',
      },
    })
  }, { requestId: DEMO_AGENT_REQUEST_ID, sessionId, now })
}
