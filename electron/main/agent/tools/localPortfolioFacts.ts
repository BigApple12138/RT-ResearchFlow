import type Database from 'better-sqlite3'
import { getDb } from '../../database/db'
import { listPortfolioStocks } from '../../database/portfolioRepository'
import {
  buildPortfolioBriefFacts,
  type PortfolioBriefHoldingFact,
} from '../../services/portfolioBriefService'
import { getPortfolioDashboard } from '../../services/portfolioDashboardService'
import type { AgentSessionContext, ToolDefinition } from '../types'

export const LOCAL_PORTFOLIO_FACTS_TOOL_NAME = 'local.portfolio_facts'

export interface LocalPortfolioFactsArgs {
  limit?: number
  [key: string]: unknown
}

export interface LocalPortfolioFactsDeps {
  listHoldings: () => Array<{ tsCode: string; stockName: string; costPrice?: number | null }>
  loadDashboardFacts?: () => Promise<
    Map<string, { price: number | null; change: number | null; todaySignalCount: number }>
  >
}

export interface LocalPortfolioFactsResult {
  status: 'ready' | 'empty'
  holdings: PortfolioBriefHoldingFact[]
  total: number
  summary: string
  /** 明确声明不含成本价，便于审计与单测 */
  includesCostPrice: false
}

function clampLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 100
  return Math.max(1, Math.min(100, Math.round(value)))
}

export function createLocalPortfolioFactsTool(
  deps: LocalPortfolioFactsDeps,
): ToolDefinition<LocalPortfolioFactsArgs> {
  return {
    name: LOCAL_PORTFOLIO_FACTS_TOOL_NAME,
    description:
      '读取本地持仓事实摘要（代码、名称、价格/涨跌与今日信号数）。默认不含成本价；不发起网络请求。',
    sideEffect: 'read',
    parametersSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: '最多返回持仓条数，默认 100',
        },
      },
    },
    async execute(_ctx: AgentSessionContext, args: LocalPortfolioFactsArgs): Promise<LocalPortfolioFactsResult> {
      try {
        const limit = clampLimit(args?.limit)
        const holdingsRaw = deps.listHoldings().slice(0, limit)
        let dashboardByCode = new Map<string, { price: number | null; change: number | null; todaySignalCount: number }>()
        if (deps.loadDashboardFacts) {
          try {
            dashboardByCode = await deps.loadDashboardFacts()
          } catch {
            dashboardByCode = new Map()
          }
        }
        const holdings = buildPortfolioBriefFacts(holdingsRaw, dashboardByCode)
        if (holdings.length === 0) {
          return {
            status: 'empty',
            holdings: [],
            total: 0,
            summary: '当前本地持仓为空；尚未添加持仓股票。',
            includesCostPrice: false,
          }
        }
        return {
          status: 'ready',
          holdings,
          total: holdings.length,
          summary: `已读取 ${holdings.length} 只本地持仓事实（不含成本价）。`,
          includesCostPrice: false,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          status: 'empty',
          holdings: [],
          total: 0,
          summary: `读取本地持仓失败：${message}`,
          includesCostPrice: false,
        }
      }
    },
  }
}

export function createDefaultLocalPortfolioFactsDeps(
  dbProvider: () => Database.Database = getDb,
): LocalPortfolioFactsDeps {
  return {
    listHoldings: () => listPortfolioStocks(dbProvider()),
    loadDashboardFacts: async () => {
      const dashboard = await getPortfolioDashboard(dbProvider(), { limit: 200, offset: 0 })
      const map = new Map<string, { price: number | null; change: number | null; todaySignalCount: number }>()
      for (const item of dashboard.items) {
        const entry = {
          price: item.price ?? null,
          change: item.change ?? null,
          todaySignalCount: item.todaySignals?.count ?? 0,
        }
        map.set(item.tsCode.trim().toUpperCase(), entry)
        const bare = item.tsCode.trim().toUpperCase().replace(/\.(SH|SZ|BJ)$/i, '')
        if (bare) map.set(bare, entry)
      }
      return map
    },
  }
}
