import type Database from 'better-sqlite3'
import { listPortfolioStocks } from '../database/portfolioRepository'
import { INDUSTRY_CHAINS } from '../../../src/utils/industryChainData'

export type RelevanceKind = 'direct' | 'chain_peer'

export interface PortfolioRelevanceTerm {
  term: string
  kind: RelevanceKind
}

function normalizeCode(tsCode: string): string {
  return tsCode.trim().toUpperCase()
}

function sixDigit(tsCode: string): string {
  return normalizeCode(tsCode).replace(/\.(SH|SZ|BJ)$/i, '')
}

/** 构建持仓相关匹配词（含同产业链节点 peers） */
export function buildPortfolioRelevanceTerms(
  holdings: Array<{ tsCode: string; stockName: string }>,
): PortfolioRelevanceTerm[] {
  const out: PortfolioRelevanceTerm[] = []
  const seen = new Set<string>()
  const push = (term: string, kind: RelevanceKind) => {
    const key = term.trim()
    if (!key) return
    if (kind === 'direct' && key.length < 2 && !/^\d{6}$/.test(key) && !/\./.test(key)) return
    if (kind === 'chain_peer' && key.length < 2 && !/^\d{6}$/.test(key)) return
    const id = `${kind}:${key.toLowerCase()}`
    if (seen.has(id)) return
    seen.add(id)
    out.push({ term: key, kind })
  }

  const holdingCodes = new Set(holdings.map((h) => normalizeCode(h.tsCode)))
  for (const holding of holdings) {
    push(holding.stockName, 'direct')
    push(sixDigit(holding.tsCode), 'direct')
    push(normalizeCode(holding.tsCode), 'direct')
  }

  for (const chain of INDUSTRY_CHAINS) {
    for (const node of chain.nodes) {
      const stocks = node.stocks ?? []
      const hit = stocks.some((s) => holdingCodes.has(normalizeCode(s.tsCode)))
      if (!hit) continue
      for (const stock of stocks) {
        if (holdingCodes.has(normalizeCode(stock.tsCode))) continue
        push(stock.name, 'chain_peer')
        push(sixDigit(stock.tsCode), 'chain_peer')
      }
    }
  }
  return out
}

export function matchBriefingRelevance(
  input: { title: string; summary: string },
  terms: PortfolioRelevanceTerm[],
): { hits: string[]; kind: RelevanceKind } | null {
  const hay = `${input.title}\n${input.summary}`
  const hayLower = hay.toLowerCase()
  const directHits: string[] = []
  const peerHits: string[] = []
  for (const { term, kind } of terms) {
    const needle = term.toLowerCase()
    if (!needle) continue
    if (hayLower.includes(needle)) {
      if (kind === 'direct') directHits.push(term)
      else peerHits.push(term)
    }
  }
  if (directHits.length > 0) return { hits: directHits.slice(0, 3), kind: 'direct' }
  if (peerHits.length > 0) return { hits: peerHits.slice(0, 3), kind: 'chain_peer' }
  return null
}

export function loadPortfolioRelevanceTerms(db: Database.Database): PortfolioRelevanceTerm[] {
  return buildPortfolioRelevanceTerms(listPortfolioStocks(db))
}

/** SQL LIKE 安全：转义 % _ \ */
export function escapeLikePattern(raw: string): string {
  return raw.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}
