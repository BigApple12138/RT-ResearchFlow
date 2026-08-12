import { getRtKCache, getRtKCachedAt, type SharedRtKEntry } from '../../services/sharedRtKCache'
import { resolveCanonicalTsCode, tsCodeLookupCandidates } from '../../utils/tsCodeLookup'
import type { AgentSessionContext, ToolDefinition } from '../types'

export const LOCAL_MARKET_SNAPSHOT_TOOL_NAME = 'local.market_snapshot'

export interface LocalMarketSnapshotArgs {
  stockCode?: string
  stockCodes?: string[]
  [key: string]: unknown
}

export interface LocalMarketQuoteSnapshot {
  stockCode: string
  tsCode: string
  name: string | null
  price: number | null
  change: number | null
  source: 'realtime' | 'missing'
  cachedAt: number | null
  missingReason: string | null
}

export interface LocalMarketSnapshotResult {
  status: 'ready' | 'partial' | 'missing' | 'invalid'
  quotes: LocalMarketQuoteSnapshot[]
  summary: string
}

export interface LocalMarketSnapshotDeps {
  lookupQuote: (tsCode: string) => { entry: SharedRtKEntry; cachedAt: number } | null
}

function normalizeCodes(args: LocalMarketSnapshotArgs): string[] {
  const raw: string[] = []
  if (typeof args?.stockCode === 'string' && args.stockCode.trim()) {
    raw.push(args.stockCode.trim())
  }
  if (Array.isArray(args?.stockCodes)) {
    for (const code of args.stockCodes) {
      if (typeof code === 'string' && code.trim()) raw.push(code.trim())
    }
  }
  const unique: string[] = []
  const seen = new Set<string>()
  for (const code of raw) {
    const canonical = resolveCanonicalTsCode(code)
    const key = canonical.toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(canonical)
  }
  return unique.slice(0, 20)
}

function lookupInCache(
  tsCode: string,
  cache: Map<string, SharedRtKEntry> | null,
  cachedAt: number,
): { entry: SharedRtKEntry; cachedAt: number } | null {
  if (!cache || cache.size === 0) return null
  for (const candidate of tsCodeLookupCandidates(tsCode)) {
    const entry = cache.get(candidate)
    if (entry) return { entry, cachedAt }
  }
  return null
}

export function createDefaultLocalMarketSnapshotDeps(): LocalMarketSnapshotDeps {
  return {
    lookupQuote: (tsCode) => lookupInCache(tsCode, getRtKCache(), getRtKCachedAt()),
  }
}

export function createLocalMarketSnapshotTool(
  deps: LocalMarketSnapshotDeps = createDefaultLocalMarketSnapshotDeps(),
): ToolDefinition<LocalMarketSnapshotArgs> {
  return {
    name: LOCAL_MARKET_SNAPSHOT_TOOL_NAME,
    description:
      '读取本地已缓存的行情快照（rt_k 等）。不刷新、不联网；找不到时返回缺失摘要。',
    sideEffect: 'read',
    parametersSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        stockCode: {
          type: 'string',
          description: '单只股票代码（六位或带交易所后缀）',
        },
        stockCodes: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 20,
          description: '多只股票代码，最多 20 只',
        },
      },
    },
    async execute(
      _ctx: AgentSessionContext,
      args: LocalMarketSnapshotArgs,
    ): Promise<LocalMarketSnapshotResult> {
      try {
        const codes = normalizeCodes(args ?? {})
        if (codes.length === 0) {
          return {
            status: 'invalid',
            quotes: [],
            summary: '缺少 stockCode / stockCodes；请提供至少一只股票代码。',
          }
        }

        const quotes: LocalMarketQuoteSnapshot[] = codes.map((tsCode) => {
          const stockCode = tsCode.replace(/\.(SH|SZ|BJ)$/i, '')
          try {
            const hit = deps.lookupQuote(tsCode)
            if (!hit) {
              return {
                stockCode,
                tsCode,
                name: null,
                price: null,
                change: null,
                source: 'missing' as const,
                cachedAt: null,
                missingReason: '本地行情缓存中未找到该标的（可能尚未拉取 rt_k 或代码无效）',
              }
            }
            return {
              stockCode,
              tsCode,
              name: hit.entry.name,
              price: hit.entry.price,
              change: hit.entry.change,
              source: 'realtime' as const,
              cachedAt: hit.cachedAt || null,
              missingReason: null,
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return {
              stockCode,
              tsCode,
              name: null,
              price: null,
              change: null,
              source: 'missing' as const,
              cachedAt: null,
              missingReason: `读取行情缓存失败：${message}`,
            }
          }
        })

        const ready = quotes.filter((q) => q.source === 'realtime').length
        const missing = quotes.length - ready
        if (ready === 0) {
          return {
            status: 'missing',
            quotes,
            summary: `本地行情均缺失（请求 ${quotes.length} 只，可用 0）。`,
          }
        }
        if (missing > 0) {
          return {
            status: 'partial',
            quotes,
            summary: `本地行情部分可用（${ready}/${quotes.length}）。`,
          }
        }
        return {
          status: 'ready',
          quotes,
          summary: `已读取 ${ready} 只本地行情快照。`,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          status: 'missing',
          quotes: [],
          summary: `读取本地行情快照失败：${message}`,
        }
      }
    },
  }
}
