import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DecisionReviewReportSnapshot } from '../../electron/main/database/types'
import {
  REVIEW_AI_SYSTEM_CONSTRAINTS,
  buildReviewAiNarrativePrompt,
  generateReviewAiNarrative,
  sanitizeReviewAiNarrativeText,
} from '../../electron/main/services/reviewAiNarrativeService'

const resolveProviderCredentialsMock = vi.hoisted(() => vi.fn())

vi.mock('../../electron/main/services/aiFallbackService', () => ({
  callWithFallback: vi.fn(),
  resolveProviderCredentials: resolveProviderCredentialsMock,
}))

function sampleReport(): DecisionReviewReportSnapshot {
  return {
    kind: 'daily',
    rangeDays: 1,
    generatedAt: Date.UTC(2026, 7, 10, 12),
    title: '2026-08-10 日复盘',
    headline: '持仓相关风险仍需验证',
    summary: {
      holdingCount: 2,
      portfolioSignalCount: 1,
      processedCount: 0,
      openRiskCount: 1,
      evidenceGapCount: 1,
      followUpCount: 0,
    },
    processed: [],
    openRisks: [{ stockName: '浦发银行', priority: 4, title: '跌破止损', status: 'NEW' }],
    evidenceGaps: [{ stockName: '平安银行', reason: '缺成本价' }],
    followUps: [],
    disclaimer: '仅供研究记录，不构成投资建议。',
    emptyDay: false,
  }
}

describe('reviewAiNarrativeService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prompt 含系统约束与本地事实，且禁止交易指令语气', () => {
    const prompt = buildReviewAiNarrativePrompt(sampleReport())
    expect(prompt).toContain(REVIEW_AI_SYSTEM_CONSTRAINTS.slice(0, 20))
    expect(prompt).toContain('持仓相关风险仍需验证')
    expect(prompt).toContain('跌破止损')
    expect(prompt).toContain('禁止给出具体买卖点')
    expect(prompt).toContain('【市场环境】')
    expect(prompt).toContain('【持仓走势】')
    expect(prompt).toContain('【今日关注】')
  })

  it('含买卖词的模型输出仍可通过；空串拒收', () => {
    expect(sanitizeReviewAiNarrativeText('建议买入并加仓').ok).toBe(true)
    expect(sanitizeReviewAiNarrativeText('证据不足，需继续观察开放风险。').ok).toBe(true)
    expect(sanitizeReviewAiNarrativeText('   ').ok).toBe(false)
    expect(sanitizeReviewAiNarrativeText('').ok).toBe(false)
  })

  it('未配置 AI 时软失败并返回 error narrative', async () => {
    resolveProviderCredentialsMock.mockReturnValue(null)
    const result = await generateReviewAiNarrative({} as never, { report: sampleReport() }, {
      callAI: vi.fn(),
      now: 1000,
    })
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('AI_NOT_CONFIGURED')
    expect(result.data).toMatchObject({ status: 'error', errorCode: 'AI_NOT_CONFIGURED' })
  })

  it('调用成功时返回 ready 单段落', async () => {
    resolveProviderCredentialsMock.mockReturnValue({ provider: 'qwen', model: 'qwen-plus', apiKey: 'x' })
    const callAI = vi.fn().mockResolvedValue({
      provider: 'qwen',
      model: 'qwen-plus',
      text: '当前证据不足，开放风险与成本缺口仍待验证。',
    })
    const result = await generateReviewAiNarrative({} as never, { report: sampleReport() }, {
      callAI,
      now: 2000,
    })
    expect(result.ok).toBe(true)
    expect(result.data).toEqual({
      status: 'ready',
      text: '当前证据不足，开放风险与成本缺口仍待验证。',
      generatedAt: 2000,
      provider: 'qwen',
      model: 'qwen-plus',
    })
    expect(callAI).toHaveBeenCalledTimes(1)
  })
})
