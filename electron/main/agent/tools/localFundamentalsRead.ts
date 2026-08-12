import type Database from 'better-sqlite3'
import { getDb } from '../../database/db'
import { executeResearchFactTool } from '../../services/researchFactToolRegistry'
import type { AgentSessionContext, ToolDefinition } from '../types'

export const LOCAL_FUNDAMENTALS_READ_TOOL_NAME = 'local.fundamentals_read'

export interface LocalFundamentalsReadArgs {
  stockCode?: string
  asOf?: string | null
  financialLimit?: number
  [key: string]: unknown
}

export interface LocalFundamentalsReadResult {
  status: 'ready' | 'partial' | 'missing' | 'blocked' | 'invalid'
  stockCode: string | null
  tsCode: string | null
  summary: string
  warnings: string[]
  /** 截取后的基本面摘要；缺失时为 null */
  data: {
    profile: unknown
    latestFinancial: unknown
    financialHistoryCount: number
  } | null
}

export interface LocalFundamentalsReadDeps {
  readFundamentals: (input: {
    stockCode: string
    asOf: string | null
    financialLimit: number
  }) => {
    status: string
    warnings?: string[]
    data?: {
      stockCode?: string | null
      tsCode?: string | null
      profile?: unknown
      latestFinancial?: unknown
      financialHistory?: unknown[]
    } | null
  }
}

function clampFinancialLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 4
  return Math.max(1, Math.min(8, Math.round(value)))
}

export function createDefaultLocalFundamentalsReadDeps(
  dbProvider: () => Database.Database = getDb,
): LocalFundamentalsReadDeps {
  return {
    readFundamentals: ({ stockCode, asOf, financialLimit }) => {
      const envelope = executeResearchFactTool(dbProvider(), 'stock.fundamentals', {
        stockCode,
        asOf,
        financialLimit,
      })
      return {
        status: envelope.status,
        warnings: envelope.warnings,
        data: envelope.data,
      }
    },
  }
}

export function createLocalFundamentalsReadTool(
  deps: LocalFundamentalsReadDeps,
): ToolDefinition<LocalFundamentalsReadArgs> {
  return {
    name: LOCAL_FUNDAMENTALS_READ_TOOL_NAME,
    description:
      '只读本地已缓存的基本面（公司概况/核心财务）。不触发刷新联网；缺失时返回清晰摘要。',
    sideEffect: 'read',
    parametersSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        stockCode: {
          type: 'string',
          description: '六位 A 股代码或规范 ts_code',
        },
        asOf: {
          type: ['string', 'null'],
          description: '可选截点 YYYYMMDD；默认当前',
        },
        financialLimit: {
          type: 'integer',
          minimum: 1,
          maximum: 8,
          description: '财务历史条数上限，默认 4',
        },
      },
      required: ['stockCode'],
    },
    async execute(
      _ctx: AgentSessionContext,
      args: LocalFundamentalsReadArgs,
    ): Promise<LocalFundamentalsReadResult> {
      try {
        const stockCode = typeof args?.stockCode === 'string' ? args.stockCode.trim() : ''
        if (!stockCode) {
          return {
            status: 'invalid',
            stockCode: null,
            tsCode: null,
            summary: '缺少 stockCode；请提供六位 A 股代码或规范 ts_code。',
            warnings: [],
            data: null,
          }
        }

        const asOf = args?.asOf == null || args.asOf === ''
          ? null
          : String(args.asOf)
        const financialLimit = clampFinancialLimit(args?.financialLimit)
        const envelope = deps.readFundamentals({ stockCode, asOf, financialLimit })

        const status = envelope.status === 'ready'
          || envelope.status === 'partial'
          || envelope.status === 'missing'
          || envelope.status === 'blocked'
          ? envelope.status
          : 'missing'

        const data = envelope.data
        const history = Array.isArray(data?.financialHistory) ? data.financialHistory : []
        const hasProfile = data?.profile != null
        const hasFinancial = data?.latestFinancial != null

        if (status === 'blocked' || status === 'missing' || (!hasProfile && !hasFinancial)) {
          const warningHint = (envelope.warnings ?? []).filter(Boolean).join('；')
          return {
            status: status === 'blocked' ? 'blocked' : 'missing',
            stockCode: data?.stockCode ?? stockCode,
            tsCode: data?.tsCode ?? null,
            summary: warningHint
              ? `本地基本面不可用：${warningHint}`
              : `本地未缓存可用基本面（${stockCode}）；请先在其他模块完成基本面同步后再读。`,
            warnings: envelope.warnings ?? [],
            data: null,
          }
        }

        return {
          status,
          stockCode: data?.stockCode ?? stockCode,
          tsCode: data?.tsCode ?? null,
          summary: status === 'ready'
            ? `已读取 ${stockCode} 本地基本面。`
            : `已读取 ${stockCode} 本地基本面（部分字段缺失）。`,
          warnings: envelope.warnings ?? [],
          data: {
            profile: data?.profile ?? null,
            latestFinancial: data?.latestFinancial ?? null,
            financialHistoryCount: history.length,
          },
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          status: 'missing',
          stockCode: typeof args?.stockCode === 'string' ? args.stockCode : null,
          tsCode: null,
          summary: `读取本地基本面失败：${message}`,
          warnings: [],
          data: null,
        }
      }
    },
  }
}
