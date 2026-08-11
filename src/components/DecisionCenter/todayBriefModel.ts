/**

 * FR-262: 今日提炼 — 本地派生模型（默认主表面，非荐股）。

 * Spec: docs/superpowers/specs/2026-08-11-today-brief-default-surface-design.md

 */

import type { DecisionSignalItem } from './SignalCard'

import { isPortfolioSignal, isRiskSignal, sortDecisionSignals } from './decisionSections'



export interface TodayBriefBullet {

  id: string

  text: string

}



export interface TodayBriefClue {

  id: string

  kind: 'portfolio' | 'sector' | 'strategy' | 'peripheral'

  title: string

  summary: string

  /** 供 AI/UI 使用的完整证据串（摘要 + 置信度 + 重复次数 + reason 关键字段） */

  evidence: string

  meta: string

  signalId: number

  tsCode: string | null

  stockName: string | null

  conceptName: string | null

  priority: number

  confidence: number | null

  occurrenceCount: number

}



export interface TodayBriefModel {

  generatedAt: number

  headline: string

  bullets: TodayBriefBullet[]

  portfolioClues: TodayBriefClue[]

  marketThemeLine: string | null

  sectorClues: TodayBriefClue[]

  strategyClues: TodayBriefClue[]

  peripheralClues: TodayBriefClue[]

  noiseCount: number

  disclaimer: string

  empty: boolean

}



const DISCLAIMER =

  '以上为本地信号提炼与研究线索，不构成投资建议，不含买卖点或收益承诺。'



const EVIDENCE_KEYS = [

  'changePct',

  'pctChg',

  'sectorChange',

  'sectorPctChg',

  'weightedChange',

  'mainNetInflow',

  'mainNetInflowRate',

  'turnoverDirectionStrength',

  'triggerPrice',

  'costPrice',

  'auctionChange',

  'limitUpCount',

] as const



function activeSignals(signals: DecisionSignalItem[]): DecisionSignalItem[] {

  return signals.filter((s) => s.status !== 'DISMISSED' && s.status !== 'EXPIRED')

}



function parseJson(raw: string | null): Record<string, unknown> | null {

  if (!raw) return null

  try {

    const value = JSON.parse(raw) as unknown

    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null

  } catch {

    return null

  }

}



function mergedContext(signal: DecisionSignalItem): Record<string, unknown> {

  return {

    ...(parseJson(signal.sourceRefJson) ?? {}),

    ...(parseJson(signal.reasonJson) ?? {}),

  }

}



function formatEvidenceValue(key: string, value: unknown): string | null {

  if (typeof value === 'number' && Number.isFinite(value)) {

    if (/rate|pct|chg|change/i.test(key)) return `${key}=${value.toFixed(2)}`

    if (Math.abs(value) >= 1e8) return `${key}=${(value / 1e8).toFixed(2)}亿`

    if (Math.abs(value) >= 1e4) return `${key}=${(value / 1e4).toFixed(2)}万`

    return `${key}=${Number.isInteger(value) ? value : value.toFixed(2)}`

  }

  if (typeof value === 'string' && value.trim()) return `${key}=${value.trim().slice(0, 40)}`

  if (typeof value === 'boolean') return `${key}=${value ? '是' : '否'}`

  return null

}



export function buildSignalEvidenceText(signal: DecisionSignalItem): string {

  const parts: string[] = []

  if (signal.summary?.trim()) parts.push(signal.summary.trim())

  if (signal.confidence != null && Number.isFinite(signal.confidence)) {

    parts.push(`置信度 ${Math.round(signal.confidence)}%`)

  }

  if ((signal.occurrenceCount ?? 1) > 1) {

    parts.push(`重复触发 ${signal.occurrenceCount} 次`)

  }

  if (signal.score != null && Number.isFinite(signal.score)) {

    parts.push(`评分 ${Math.round(signal.score)}`)

  }

  const ctx = mergedContext(signal)

  for (const key of EVIDENCE_KEYS) {

    if (!(key in ctx)) continue

    const formatted = formatEvidenceValue(key, ctx[key])

    if (formatted) parts.push(formatted)

  }

  return parts.join(' · ') || '（无附加证据字段）'

}



function sourceMeta(signal: DecisionSignalItem): string {

  const labels: Record<string, string> = {

    news: '资讯',

    ai: 'AI',

    short_term: '短线策略',

    trend: '趋势',

    market: '大盘',

    sector_flow: '板块资金',

    manual: '手动',

  }

  const source = labels[signal.sourceModule] ?? signal.sourceModule

  return `P${signal.priority} · ${source}`

}



function toClue(

  signal: DecisionSignalItem,

  kind: TodayBriefClue['kind'],

): TodayBriefClue {

  return {

    id: `clue-${kind}-${signal.id}`,

    kind,

    title: signal.title,

    summary: signal.summary,

    evidence: buildSignalEvidenceText(signal),

    meta: sourceMeta(signal),

    signalId: signal.id,

    tsCode: signal.tsCode,

    stockName: signal.stockName,

    conceptName: signal.conceptName,

    priority: signal.priority,

    confidence: signal.confidence,

    occurrenceCount: signal.occurrenceCount ?? 1,

  }

}



function pickUnique(signals: DecisionSignalItem[], limit: number): DecisionSignalItem[] {

  const out: DecisionSignalItem[] = []

  const seen = new Set<number>()

  for (const signal of signals) {

    if (seen.has(signal.id)) continue

    seen.add(signal.id)

    out.push(signal)

    if (out.length >= limit) break

  }

  return out

}



export function buildTodayBriefModel(

  signals: DecisionSignalItem[],

  options?: { now?: number },

): TodayBriefModel {

  const now = options?.now ?? Date.now()

  const active = sortDecisionSignals(activeSignals(signals))

  const portfolioExpanded = pickUnique(

    [

      ...active.filter(isPortfolioSignal),

      ...active.filter((s) => isRiskSignal(s) && Boolean(s.tsCode) && isPortfolioSignal(s)),

    ],

    5,

  )

  const portfolioClues = portfolioExpanded.map((s) => toClue(s, 'portfolio'))



  const sectorPool = active.filter(

    (s) => s.sourceModule === 'sector_flow' || s.sourceModule === 'market',

  )

  const sectorTop = pickUnique(sectorPool, 5)

  const sectorClues = sectorTop.map((s) => toClue(s, 'sector'))

  const marketThemeLine =

    sectorClues.length === 0

      ? null

      : sectorClues

          .map((clue) => {

            const name = clue.conceptName || clue.stockName || clue.title

            const hint = clue.summary.trim().slice(0, 48)

            return hint ? `${name}（${hint}）` : name

          })

          .filter(Boolean)

          .slice(0, 5)

          .join(' · ')



  const strategyPool = active.filter(

    (s) =>

      s.sourceModule === 'short_term'

      || (s.sourceModule === 'trend' && !isPortfolioSignal(s) && s.priority >= 4),

  )

  const strategyClues = pickUnique(strategyPool, 5).map((s) => toClue(s, 'strategy'))



  const peripheralPool = active.filter(

    (s) =>

      (s.sourceModule === 'news' || s.sourceModule === 'ai')

      && !isPortfolioSignal(s),

  )

  const peripheralClues = pickUnique(peripheralPool, 5).map((s) => toClue(s, 'peripheral'))



  const covered = new Set<number>([

    ...portfolioClues.map((c) => c.signalId),

    ...sectorClues.map((c) => c.signalId),

    ...strategyClues.map((c) => c.signalId),

    ...peripheralClues.map((c) => c.signalId),

  ])

  const noiseCount = active.filter((s) => !covered.has(s.id)).length



  const bullets: TodayBriefBullet[] = []

  if (portfolioClues.length > 0) {

    bullets.push({

      id: 'b-portfolio',

      text: `持仓相关待看 ${portfolioClues.length} 条（优先风险与缺口）`,

    })

  } else {

    bullets.push({

      id: 'b-portfolio-empty',

      text: '当前筛选下暂无持仓相关待办',

    })

  }

  if (marketThemeLine) {

    bullets.push({

      id: 'b-theme',

      text: `板块/市场热度线索：${marketThemeLine}`,

    })

  } else {

    bullets.push({

      id: 'b-theme-empty',

      text: '暂无本地板块资金/大盘热度事实',

    })

  }

  if (strategyClues.length > 0) {

    bullets.push({

      id: 'b-strategy',

      text: `短线/策略可点线索 ${strategyClues.length} 条（含摘要与置信度）`,

    })

  }

  if (peripheralClues.length > 0) {

    bullets.push({

      id: 'b-news',

      text: `外围/资讯叙事压缩 ${peripheralClues.length} 条`,

    })

  }

  if (noiseCount > 0) {

    bullets.push({

      id: 'b-noise',

      text: `另有 ${noiseCount} 条未展开，可在「信号明细」查看`,

    })

  }



  const empty =

    portfolioClues.length === 0

    && sectorClues.length === 0

    && strategyClues.length === 0

    && peripheralClues.length === 0



  const headline = empty

    ? '今日暂无足够本地信号可提炼'

    : portfolioClues.length > 0

      ? '先看持仓相关，再扫市场热度与策略线索'

      : '持仓平稳：先扫市场热度与策略线索'



  return {

    generatedAt: now,

    headline,

    bullets: bullets.slice(0, 5),

    portfolioClues,

    marketThemeLine,

    sectorClues,

    strategyClues,

    peripheralClues,

    noiseCount,

    disclaimer: DISCLAIMER,

    empty,

  }

}



export function toTodayBriefAiFacts(model: TodayBriefModel) {

  const mapClue = (clue: TodayBriefClue) => ({

    kind: clue.kind,

    title: clue.title,

    summary: clue.summary,

    evidence: clue.evidence,

    meta: clue.meta,

    tsCode: clue.tsCode,

    stockName: clue.stockName,

    conceptName: clue.conceptName,

    priority: clue.priority,

    confidence: clue.confidence,

    occurrenceCount: clue.occurrenceCount,

  })

  return {

    headline: model.headline,

    bullets: model.bullets.map((item) => item.text),

    marketThemeLine: model.marketThemeLine,

    portfolioClues: model.portfolioClues.map(mapClue),

    sectorClues: model.sectorClues.map(mapClue),

    strategyClues: model.strategyClues.map(mapClue),

    peripheralClues: model.peripheralClues.map(mapClue),

    noiseCount: model.noiseCount,

    disclaimer: model.disclaimer,

  }

}


