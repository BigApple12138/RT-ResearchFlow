import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { runMigrations } from '../../electron/main/database/db'
import { addPortfolioStock } from '../../electron/main/database/portfolioRepository'
import { upsertDailyClose } from '../../electron/main/database/dailyCloseCacheRepository'
import { createDailyDslDraft, createTwoPhaseDraft, ensureDefaultStrategyLabStrategies, listStrategyLabStrategies, saveStrategyLabStrategy, createDefaultRunConfig, createDefaultActions } from '../../electron/main/services/strategyLabService'
import { runStrategyLabStrategy } from '../../electron/main/services/strategyLabRunService'

describe('strategyLab dailyDsl / twoPhase', () => {
  it('内置日线 DSL 与两阶段模板可写入', () => {
    const db = new Database(':memory:')
    try {
      runMigrations(db)
      ensureDefaultStrategyLabStrategies(db)
      const list = listStrategyLabStrategies(db)
      expect(list.some((item) => item.strategyKey === 'builtin-daily-dsl')).toBe(true)
      expect(list.some((item) => item.strategyKey === 'builtin-two-phase')).toBe(true)
    } finally {
      db.close()
    }
  })

  it('日线 DSL 运行可命中持仓', async () => {
    const db = new Database(':memory:')
    try {
      runMigrations(db)
      addPortfolioStock(db, '600519.SH', '贵州茅台')
      const rows = []
      for (let i = 1; i <= 30; i += 1) {
        const day = String(i).padStart(2, '0')
        rows.push({
          tsCode: '600519.SH',
          tradeDate: `202607${day}`,
          open: 90 + i,
          high: 91 + i,
          low: 89 + i,
          close: 90 + i,
          pctChg: 1,
          vol: 1000,
          turnoverRate: 2,
        })
      }
      upsertDailyClose(db, rows, { dataSource: 'tushare' })
      const saved = saveStrategyLabStrategy(db, {
        name: '测试日线DSL',
        source: 'custom',
        status: 'ready',
        enabled: true,
        ruleDraft: createDailyDslDraft(),
        runConfig: { ...createDefaultRunConfig(), dateEnd: '20260730', lookbackDays: 60 },
        actions: createDefaultActions(),
      })
      const result = await runStrategyLabStrategy(db, saved.id)
      expect(result.summary.engine).toBe('dailyDsl')
      expect(result.matchedCount).toBeGreaterThanOrEqual(1)
    } finally {
      db.close()
    }
  })

  it('两阶段无日线命中时分钟匹配为 0', async () => {
    const db = new Database(':memory:')
    try {
      runMigrations(db)
      addPortfolioStock(db, '600519.SH', '贵州茅台')
      // 仅 2 根日线 → DSL 数据不足 → 不命中
      upsertDailyClose(db, [
        {
          tsCode: '600519.SH',
          tradeDate: '20260729',
          open: 100, high: 100, low: 100, close: 100, pctChg: 0, vol: 100, turnoverRate: 1,
        },
        {
          tsCode: '600519.SH',
          tradeDate: '20260730',
          open: 100, high: 100, low: 100, close: 100, pctChg: 0, vol: 100, turnoverRate: 1,
        },
      ], { dataSource: 'tushare' })
      const draft = createTwoPhaseDraft()
      const saved = saveStrategyLabStrategy(db, {
        name: '测试两阶段',
        source: 'custom',
        status: 'ready',
        enabled: true,
        ruleDraft: draft,
        runConfig: { ...createDefaultRunConfig(), scanMode: 'twoPhase', dateEnd: '20260730', lookbackDays: 60 },
        actions: createDefaultActions(),
      })
      const result = await runStrategyLabStrategy(db, saved.id)
      expect(result.summary.engine).toBe('twoPhase')
      expect(result.matchedCount).toBe(0)
    } finally {
      db.close()
    }
  })

  it('持仓非空时 allMarket 仍会并入扫描池（回归：不静默退化为仅持仓）', async () => {
    const db = new Database(':memory:')
    try {
      runMigrations(db)
      addPortfolioStock(db, '600519.SH', '贵州茅台')
      // 全市场另一只有完整日线的股票
      const otherRows = []
      for (let i = 1; i <= 30; i += 1) {
        const day = String(i).padStart(2, '0')
        otherRows.push({
          tsCode: '000001.SZ',
          tradeDate: `202607${day}`,
          open: 10 + i,
          high: 11 + i,
          low: 9 + i,
          close: 10 + i,
          pctChg: 1,
          vol: 1000,
          turnoverRate: 2,
        })
      }
      upsertDailyClose(db, otherRows, { dataSource: 'tushare' })
      const saved = saveStrategyLabStrategy(db, {
        name: '测试全市场并入',
        source: 'custom',
        status: 'ready',
        enabled: true,
        ruleDraft: createDailyDslDraft(),
        runConfig: { ...createDefaultRunConfig(), dateEnd: '20260730', lookbackDays: 60 },
        actions: createDefaultActions(),
      })
      const result = await runStrategyLabStrategy(db, saved.id)
      expect(result.summary.engine).toBe('dailyDsl')
      expect(result.summary.totalStocks).toBeGreaterThanOrEqual(2)
    } finally {
      db.close()
    }
  })
})
