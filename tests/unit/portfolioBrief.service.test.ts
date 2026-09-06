import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSession, getSessionMessages } from '../../electron/main/database/aiAnalysisSessionRepository'
import { runMigrations } from '../../electron/main/database/db'
import { addPortfolioStock } from '../../electron/main/database/portfolioRepository'
import { runDiscussionFollowUp } from '../../electron/main/services/discussionFollowUpService'
import {
  buildPortfolioBriefFacts,
  formatAiConfigCheckMessage,
  formatEmptyPortfolioMessage,
  formatPortfolioListMessage,
  formatPortfolioNewsDigestFacts,
  PORTFOLIO_NEWS_DIGEST_EMPTY,
  runPortfolioBrief,
} from '../../electron/main/services/portfolioBriefService'
import { getBeijingYmd } from '../../electron/main/services/marketSettlementPolicy'

const mocks = vi.hoisted(() => ({
  callWithFallback: vi.fn(),
  resolveProviderCredentials: vi.fn(),
  getPortfolioDashboard: vi.fn(),
}))

vi.mock('../../electron/main/services/aiFallbackService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../electron/main/services/aiFallbackService')>()
  return {
    ...actual,
    callWithFallback: mocks.callWithFallback,
    resolveProviderCredentials: mocks.resolveProviderCredentials,
  }
})

vi.mock('../../electron/main/services/portfolioDashboardService', () => ({
  getPortfolioDashboard: mocks.getPortfolioDashboard,
}))

describe('portfolioBriefService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveProviderCredentials.mockReturnValue({ provider: 'qwen' })
    mocks.getPortfolioDashboard.mockResolvedValue({
      items: [{
        tsCode: '600519.SH',
        price: 1_500,
        change: 1.2,
        todaySignals: { count: 2 },
      }],
    })
  })

  it('持仓事实包不包含成本价', () => {
    const facts = buildPortfolioBriefFacts(
      [{ tsCode: '600519.SH', stockName: '贵州茅台', costPrice: 1400 }],
      new Map([['600519.SH', { price: 1500, change: 1.2, todaySignalCount: 2 }]]),
    )
    expect(facts).toEqual([{
      tsCode: '600519.SH',
      stockName: '贵州茅台',
      price: 1500,
      change: 1.2,
      todaySignalCount: 2,
    }])
    expect(JSON.stringify(facts)).not.toMatch(/costPrice/i)
  })

  it('空持仓文案区分已缓存与持仓', () => {
    const text = formatEmptyPortfolioMessage()
    expect(text).toContain('尚未添加持仓')
    expect(text).toContain('已缓存个股')
    expect(text).toContain('+ 持仓')
  })

  it('列持仓不输出成本价', () => {
    const text = formatPortfolioListMessage([
      { tsCode: '000001.SZ', stockName: '平安银行', costPrice: 12 },
    ])
    expect(text).toContain('平安银行')
    expect(text).toContain('000001.SZ')
    expect(text).not.toContain('costPrice')
    expect(text).not.toMatch(/\b12\b/)
  })

  it('配置检查反映是否已配置 Key', () => {
    expect(formatAiConfigCheckMessage({
      hasApiKey: false,
      provider: null,
      model: null,
      configuredProviders: [],
    })).toContain('尚未配置')
    expect(formatAiConfigCheckMessage({
      hasApiKey: true,
      provider: 'chatgpt',
      model: 'gpt-5.6-sol',
      configuredProviders: ['chatgpt'],
    })).toContain('AI 已配置')
  })

  it('持仓简报与 follow-up 通过同一 session lock 保持完整轮次顺序', async () => {
    const db = new Database(':memory:')
    try {
      runMigrations(db)
      addPortfolioStock(db, '600519.SH', '贵州茅台')
      const sessionId = createSession(db, {
        provider: 'qwen', model: 'test-model', articleUrls: [], promptSent: '', response: null,
        scanRunId: null, isError: false, messages: [],
      })
      let releaseBrief!: () => void
      let markBriefStarted!: () => void
      const briefStarted = new Promise<void>((resolve) => { markBriefStarted = resolve })
      const briefGate = new Promise<void>((resolve) => { releaseBrief = resolve })
      mocks.callWithFallback
        .mockImplementationOnce(async () => {
          markBriefStarted()
          await briefGate
          return { provider: 'qwen', model: 'test-model', text: '持仓简报回答' }
        })
        .mockResolvedValueOnce({ provider: 'qwen', model: 'test-model', text: '排队追问回答' })

      const brief = runPortfolioBrief(db, {
        requestId: '00000000-0000-4000-8000-000000000401',
        sessionId,
        mode: 'analyze',
      })
      await briefStarted
      const followUp = runDiscussionFollowUp(db, {
        requestId: '00000000-0000-4000-8000-000000000402',
        sessionId,
        message: '排队追问',
      }, { isBusy: () => false })
      await Promise.resolve()
      const callsBeforeRelease = mocks.callWithFallback.mock.calls.length

      releaseBrief()
      await expect(brief).resolves.toMatchObject({ ok: true, text: '持仓简报回答' })
      await expect(followUp).resolves.toMatchObject({ text: '排队追问回答' })

      expect(callsBeforeRelease).toBe(1)
      expect(getSessionMessages(db, sessionId).map((message) => message.content)).toEqual([
        expect.stringContaining('请基于下列本地持仓事实做简要研判'),
        '持仓简报回答',
        expect.stringContaining('排队追问'),
        '排队追问回答',
      ])
    } finally {
      db.close()
    }
  })

  it('资讯摘要空列表文案诚实', () => {
    expect(formatPortfolioNewsDigestFacts([])).toBe(PORTFOLIO_NEWS_DIGEST_EMPTY)
    const text = formatPortfolioNewsDigestFacts([{
      title: '贵州茅台提价',
      summary: '渠道调研',
      impactRating: 'IMPORTANT',
      relevanceHits: ['贵州茅台'],
    }])
    expect(text).toContain('贵州茅台提价')
    expect(text).toContain('命中：贵州茅台')
  })

  it('newsDigest 无相关资讯不调 AI', async () => {
    const db = new Database(':memory:')
    try {
      runMigrations(db)
      addPortfolioStock(db, '600519.SH', '贵州茅台')
      const result = await runPortfolioBrief(db, {
        requestId: '00000000-0000-4000-8000-000000000501',
        mode: 'newsDigest',
      })
      expect(result.ok).toBe(true)
      expect(result.text).toBe(PORTFOLIO_NEWS_DIGEST_EMPTY)
      expect(mocks.callWithFallback).not.toHaveBeenCalled()
    } finally {
      db.close()
    }
  })

  it('newsDigest 有相关资讯时调用 AI', async () => {
    const db = new Database(':memory:')
    try {
      runMigrations(db)
      addPortfolioStock(db, '600519.SH', '贵州茅台')
      const todayYmd = getBeijingYmd()
      const today = `${todayYmd.slice(0, 4)}-${todayYmd.slice(4, 6)}-${todayYmd.slice(6, 8)}`
      const now = Date.now()
      db.prepare(`
        INSERT INTO sources (
          nameCN, nameEN, url, feedUrl, category, authorityWeight,
          isBuiltIn, isEnabled, status, successRate, parseStrategy
        ) VALUES ('测源', 'Test', 'https://example.com', NULL, 'FINANCIAL_PRESS', 5, 0, 1, 'ACTIVE', 1, 'RSS')
      `).run()
      const source = db.prepare('SELECT id FROM sources ORDER BY id LIMIT 1').get() as { id: number }
      db.prepare(`
        INSERT INTO briefings (
          sourceId, sourceName, originalUrl, title, summary, fullContent,
          publishedAt, publishedDateBJ, publicationTimeStatus, collectedAt, impactRating,
          impactRatingScore, deduplicationHash, titleSimhash,
          isRead, readAt, scanRunId, isCatchUp
        ) VALUES (?, '测源', ?, ?, ?, NULL, ?, ?, 'exact', ?, 'IMPORTANT', 70, ?, ?, 0, NULL, NULL, 0)
      `).run(
        source.id,
        `https://example.com/news-digest-${now}`,
        '贵州茅台提价观察',
        '渠道调研摘要',
        now,
        today,
        now,
        `h-news-digest-${now}`,
        `${now}`,
      )
      mocks.callWithFallback.mockResolvedValueOnce({
        provider: 'qwen',
        model: 'test-model',
        text: '今日持仓资讯摘要',
      })
      const result = await runPortfolioBrief(db, {
        requestId: '00000000-0000-4000-8000-000000000502',
        mode: 'newsDigest',
      })
      expect(result).toMatchObject({ ok: true, text: '今日持仓资讯摘要' })
      expect(mocks.callWithFallback).toHaveBeenCalledTimes(1)
      const userContent = mocks.callWithFallback.mock.calls[0][1].messages.at(-1).content as string
      expect(userContent).toContain('与持仓相关的今日资讯')
      expect(userContent).toContain('贵州茅台提价观察')
      expect(userContent).toContain('不要给出买卖、目标价或仓位建议')
    } finally {
      db.close()
    }
  })
})
