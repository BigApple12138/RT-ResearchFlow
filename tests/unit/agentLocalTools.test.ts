import { describe, expect, it } from 'vitest'
import { emptySessionContext, createToolRegistry } from '../../electron/main/agent/toolRegistry'
import { registerBuiltinTools } from '../../electron/main/agent/registerBuiltinTools'
import {
  createLocalPortfolioFactsTool,
  LOCAL_PORTFOLIO_FACTS_TOOL_NAME,
  type LocalPortfolioFactsResult,
} from '../../electron/main/agent/tools/localPortfolioFacts'
import {
  createLocalMarketSnapshotTool,
  LOCAL_MARKET_SNAPSHOT_TOOL_NAME,
  type LocalMarketSnapshotResult,
} from '../../electron/main/agent/tools/localMarketSnapshot'
import {
  createLocalFundamentalsReadTool,
  LOCAL_FUNDAMENTALS_READ_TOOL_NAME,
  type LocalFundamentalsReadResult,
} from '../../electron/main/agent/tools/localFundamentalsRead'

describe('agentLocalTools', () => {
  const ctx = emptySessionContext({
    sessionId: 1,
    userGoal: '看看持仓',
    requestId: 'req-local-tools-1',
  })

  it('local.portfolio_facts 持仓事实不含成本价', async () => {
    const tool = createLocalPortfolioFactsTool({
      listHoldings: () => [
        { tsCode: '600519.SH', stockName: '贵州茅台', costPrice: 1400 },
        { tsCode: '000001.SZ', stockName: '平安银行', costPrice: 12 },
      ],
      loadDashboardFacts: async () => new Map([
        ['600519.SH', { price: 1500, change: 1.2, todaySignalCount: 2 }],
      ]),
    })

    expect(tool.sideEffect).toBe('read')
    expect(tool.name).toBe(LOCAL_PORTFOLIO_FACTS_TOOL_NAME)

    const result = await tool.execute(ctx, {}) as LocalPortfolioFactsResult
    expect(result.status).toBe('ready')
    expect(result.includesCostPrice).toBe(false)
    expect(result.holdings).toHaveLength(2)
    expect(JSON.stringify(result.holdings)).not.toMatch(/costPrice/i)
    expect(JSON.stringify(result.holdings)).not.toMatch(/\b1400\b/)
    expect(result.holdings[0]).toMatchObject({
      tsCode: '600519.SH',
      stockName: '贵州茅台',
      price: 1500,
      change: 1.2,
      todaySignalCount: 2,
    })
    expect(result.holdings[0]).not.toHaveProperty('costPrice')
    expect(Object.keys(result.holdings[0]).sort()).toEqual([
      'change', 'price', 'stockName', 'todaySignalCount', 'tsCode',
    ])
  })

  it('local.portfolio_facts 空持仓返回清晰摘要且不抛异常', async () => {
    const tool = createLocalPortfolioFactsTool({
      listHoldings: () => [],
    })
    const result = await tool.execute(ctx, {}) as LocalPortfolioFactsResult
    expect(result.status).toBe('empty')
    expect(result.summary).toMatch(/空|尚未/)
    expect(result.holdings).toEqual([])
  })

  it('local.market_snapshot 缓存缺失时返回缺失摘要', async () => {
    const tool = createLocalMarketSnapshotTool({
      lookupQuote: () => null,
    })
    expect(tool.sideEffect).toBe('read')

    const result = await tool.execute(ctx, { stockCode: '600519.SH' }) as LocalMarketSnapshotResult
    expect(result.status).toBe('missing')
    expect(result.quotes).toHaveLength(1)
    expect(result.quotes[0].source).toBe('missing')
    expect(result.quotes[0].missingReason).toMatch(/未找到|缓存/)
    expect(result.summary).toMatch(/缺失/)
  })

  it('local.market_snapshot 可读到本地缓存行情', async () => {
    const tool = createLocalMarketSnapshotTool({
      lookupQuote: (tsCode) => {
        if (!tsCode.includes('600519')) return null
        return {
          entry: {
            name: '贵州茅台',
            change: 1.5,
            price: 1600,
            amount: 1,
            preClose: 1576,
            open: 1580,
            high: 1610,
            low: 1570,
            vol: 100,
            bidPrice1: null,
            bidVolume1: null,
          },
          cachedAt: 1_700_000_000_000,
        }
      },
    })

    const result = await tool.execute(ctx, {
      stockCodes: ['600519.SH', '000001.SZ'],
    }) as LocalMarketSnapshotResult
    expect(result.status).toBe('partial')
    expect(result.quotes[0]).toMatchObject({
      tsCode: '600519.SH',
      price: 1600,
      change: 1.5,
      source: 'realtime',
    })
    expect(result.quotes[1].source).toBe('missing')
  })

  it('local.fundamentals_read 缺失时返回摘要不炸掉 turn', async () => {
    const tool = createLocalFundamentalsReadTool({
      readFundamentals: () => ({
        status: 'missing',
        warnings: ['截点内没有可用核心财务事实'],
        data: {
          stockCode: '600519',
          tsCode: '600519.SH',
          profile: null,
          latestFinancial: null,
          financialHistory: [],
        },
      }),
    })
    expect(tool.sideEffect).toBe('read')

    const result = await tool.execute(ctx, { stockCode: '600519.SH' }) as LocalFundamentalsReadResult
    expect(result.status).toBe('missing')
    expect(result.data).toBeNull()
    expect(result.summary).toMatch(/不可用|未缓存/)
  })

  it('local.fundamentals_read deps 抛错时仍返回缺失摘要', async () => {
    const tool = createLocalFundamentalsReadTool({
      readFundamentals: () => {
        throw new Error('DB_GONE')
      },
    })
    const result = await tool.execute(ctx, { stockCode: '600519.SH' }) as LocalFundamentalsReadResult
    expect(result.status).toBe('missing')
    expect(result.summary).toContain('DB_GONE')
  })

  it('registerBuiltinTools 注册三只本地只读工具', () => {
    const registry = createToolRegistry()
    registerBuiltinTools(registry, {
      getDb: () => {
        throw new Error('register 阶段不应立刻触库')
      },
    })
    const names = registry.listForPrompt().map((t) => t.name).sort()
    expect(names).toEqual([
      LOCAL_FUNDAMENTALS_READ_TOOL_NAME,
      LOCAL_MARKET_SNAPSHOT_TOOL_NAME,
      LOCAL_PORTFOLIO_FACTS_TOOL_NAME,
    ].sort())
    for (const name of names) {
      expect(registry.get(name).sideEffect).toBe('read')
    }
  })
})
