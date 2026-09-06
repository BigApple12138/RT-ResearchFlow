import type Database from 'better-sqlite3'
import {
  getSession,
  updateSessionMessages,
  type ConversationMessage,
} from '../database/aiAnalysisSessionRepository'
import { getAIConfig, getConfiguredProviders } from '../database/aiConfigRepository'
import { listPortfolioStocks } from '../database/portfolioRepository'
import { listBriefings } from '../database/briefingRepository'
import { callWithFallback, resolveProviderCredentials } from './aiFallbackService'
import { getPortfolioDashboard } from './portfolioDashboardService'
import { startResearchDiscussion } from './researchDiscussionContextService'
import { withDiscussionSessionLock } from './discussionSessionLock'
import { getBeijingYmd } from './marketSettlementPolicy'

export type PortfolioBriefMode = 'analyze' | 'list' | 'checkConfig' | 'newsDigest'

export const PORTFOLIO_EMPTY_MESSAGE =
  '尚未添加持仓。左侧或个股页的「已缓存个股」不是持仓；请到走势图使用「+ 持仓」后再分析。'

export const PORTFOLIO_BRIEF_USER_PROMPT =
  '请基于下列本地持仓事实做简要研判：关注异动、证据缺口与需继续验证的点。不要给出买卖、目标价或仓位建议。若需深挖个股可提示用户手动启动深度研究。'

export const PORTFOLIO_NEWS_DIGEST_USER_PROMPT =
  '请基于下列「与持仓相关的今日资讯」做简要总结：按主题归类、标出需关注的持仓关联点与证据缺口。不要给出买卖、目标价或仓位建议。资讯不足时明确说明。'

export const PORTFOLIO_NEWS_DIGEST_EMPTY =
  '今日暂无与持仓直接相关的资讯（本地过滤）。可切换资讯页「全部」浏览，或稍后再试。'

export interface PortfolioBriefHoldingFact {
  tsCode: string
  stockName: string
  price: number | null
  change: number | null
  todaySignalCount: number
}

export function buildPortfolioBriefFacts(
  holdings: Array<{ tsCode: string; stockName: string; costPrice?: number | null }>,
  dashboardByCode: Map<string, { price: number | null; change: number | null; todaySignalCount: number }> = new Map(),
): PortfolioBriefHoldingFact[] {
  return holdings.map((holding) => {
    const dash = dashboardByCode.get(holding.tsCode.trim().toUpperCase())
      ?? dashboardByCode.get(holding.tsCode.trim().toUpperCase().replace(/\.(SH|SZ|BJ)$/i, ''))
    return {
      tsCode: holding.tsCode,
      stockName: holding.stockName,
      price: dash?.price ?? null,
      change: dash?.change ?? null,
      todaySignalCount: dash?.todaySignalCount ?? 0,
    }
  })
}

export function formatEmptyPortfolioMessage(): string {
  return PORTFOLIO_EMPTY_MESSAGE
}

export function formatPortfolioListMessage(
  holdings: Array<{ tsCode: string; stockName: string; costPrice?: number | null }>,
): string {
  if (holdings.length === 0) return formatEmptyPortfolioMessage()
  const lines = holdings.map((item, index) => `${index + 1}. ${item.stockName}（${item.tsCode}）`)
  return `当前持仓 ${holdings.length} 只（不含成本价）：\n${lines.join('\n')}`
}

export function formatAiConfigCheckMessage(input: {
  hasApiKey: boolean
  provider: string | null
  model: string | null
  configuredProviders: string[]
}): string {
  if (!input.hasApiKey) {
    return '尚未配置可用的 AI API Key。请打开配置中心 → AI 配置，为至少一个厂商填写 Key 与模型后再分析持仓。'
  }
  const extras = input.configuredProviders.length > 0
    ? `已配置厂商：${input.configuredProviders.join('、')}。`
    : ''
  return `AI 已配置。当前优先厂商 ${input.provider ?? '未知'}，模型 ${input.model ?? '未知'}。${extras}`
}

export function formatPortfolioNewsDigestFacts(
  items: Array<{ title: string; summary: string; impactRating: string; relevanceHits?: string[] }>,
): string {
  if (items.length === 0) return PORTFOLIO_NEWS_DIGEST_EMPTY
  return items.map((item, index) => {
    const hits = item.relevanceHits?.length ? `；命中：${item.relevanceHits.join('、')}` : ''
    const summary = item.summary.trim() ? item.summary.trim().slice(0, 200) : '无摘要'
    return `${index + 1}. [${item.impactRating}] ${item.title}\n   ${summary}${hits}`
  }).join('\n')
}

function parseMessages(raw: string | null): ConversationMessage[] {
  if (!raw) return []
  try {
    return JSON.parse(raw) as ConversationMessage[]
  } catch {
    return []
  }
}

async function ensureBriefSession(
  db: Database.Database,
  input: { requestId: string; sessionId?: number | null; initialQuestion: string },
): Promise<{ ok: true; sessionId: number } | { ok: false; code: string; message: string }> {
  if (input.sessionId != null) {
    const existing = getSession(db, input.sessionId)
    if (!existing) return { ok: false, code: 'NOT_FOUND', message: 'Session not found' }
    return { ok: true, sessionId: input.sessionId }
  }
  const started = startResearchDiscussion(db, {
    requestId: input.requestId,
    origin: { type: 'manual', id: null },
    projectId: null,
    initialQuestion: input.initialQuestion,
    mode: 'new',
    returnTarget: { tab: 'ai-analysis', subTab: 'records' },
  })
  return { ok: true, sessionId: started.session.id }
}

function appendExchange(
  db: Database.Database,
  sessionId: number,
  userContent: string,
  assistantContent: string,
): ConversationMessage[] {
  const session = getSession(db, sessionId)!
  const messages = parseMessages(session.messages)
  messages.push({ role: 'user', content: userContent })
  messages.push({ role: 'assistant', content: assistantContent })
  updateSessionMessages(db, sessionId, messages)
  return messages
}

async function runPortfolioBriefUnlocked(
  db: Database.Database,
  input: { requestId: string; sessionId?: number | null; mode?: PortfolioBriefMode },
): Promise<
  | { ok: true; sessionId: number; text: string }
  | { ok: false; code: string; message: string; sessionId?: number }
> {
  const mode: PortfolioBriefMode = input.mode ?? 'analyze'

  if (mode === 'checkConfig') {
    const row = getAIConfig(db)
    const configured = getConfiguredProviders(db)
    const text = formatAiConfigCheckMessage({
      hasApiKey: configured.length > 0,
      provider: row.provider,
      model: row.model,
      configuredProviders: configured,
    })
    const ensured = await ensureBriefSession(db, {
      requestId: input.requestId,
      sessionId: input.sessionId,
      initialQuestion: '检查 AI 配置',
    })
    if (!ensured.ok) return ensured
    appendExchange(db, ensured.sessionId, '检查 AI 配置', text)
    return { ok: true, sessionId: ensured.sessionId, text }
  }

  const holdings = listPortfolioStocks(db)

  if (mode === 'list') {
    const text = formatPortfolioListMessage(holdings)
    const ensured = await ensureBriefSession(db, {
      requestId: input.requestId,
      sessionId: input.sessionId,
      initialQuestion: '我有哪些持仓',
    })
    if (!ensured.ok) return ensured
    appendExchange(db, ensured.sessionId, '我有哪些持仓', text)
    return { ok: true, sessionId: ensured.sessionId, text }
  }

  if (mode === 'newsDigest') {
    const ensured = await ensureBriefSession(db, {
      requestId: input.requestId,
      sessionId: input.sessionId,
      initialQuestion: '相对持仓总结今日资讯',
    })
    if (!ensured.ok) return ensured
    const sessionId = ensured.sessionId
    if (holdings.length === 0) {
      const text = formatEmptyPortfolioMessage()
      appendExchange(db, sessionId, '相对持仓总结今日资讯', text)
      return { ok: true, sessionId, text }
    }
    const todayYmd = getBeijingYmd()
    const today = /^\d{8}$/.test(todayYmd)
      ? `${todayYmd.slice(0, 4)}-${todayYmd.slice(4, 6)}-${todayYmd.slice(6, 8)}`
      : todayYmd
    const listed = listBriefings({
      date: today,
      relevance: 'portfolio',
      limit: 20,
      offset: 0,
    }, db)
    const factsText = formatPortfolioNewsDigestFacts(
      listed.items.map((item) => ({
        title: item.title,
        summary: item.summary ?? '',
        impactRating: item.impactRating,
        relevanceHits: item.relevanceHits,
      })),
    )
    if (listed.items.length === 0) {
      appendExchange(db, sessionId, '相对持仓总结今日资讯', factsText)
      return { ok: true, sessionId, text: factsText }
    }
    if (!resolveProviderCredentials(db)) {
      const text = formatAiConfigCheckMessage({
        hasApiKey: false,
        provider: null,
        model: null,
        configuredProviders: [],
      })
      appendExchange(db, sessionId, '相对持仓总结今日资讯', text)
      return { ok: false, code: 'AI_NOT_CONFIGURED', message: text, sessionId }
    }
    const session = getSession(db, sessionId)!
    const messages = parseMessages(session.messages)
    const userContent = `${PORTFOLIO_NEWS_DIGEST_USER_PROMPT}\n\n【今日相关资讯 ${listed.items.length} 条 · ${today}】\n${factsText}`
    messages.push({ role: 'user', content: userContent })
    try {
      const result = await callWithFallback(db, {
        messages: messages.map((message) => ({ role: message.role, content: message.content })),
      })
      messages.push({ role: 'assistant', content: result.text, webSearchTrace: result.webSearchTrace })
      updateSessionMessages(db, sessionId, messages)
      return { ok: true, sessionId, text: result.text }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const text = `资讯总结失败：${message}`
      messages.push({ role: 'assistant', content: text })
      updateSessionMessages(db, sessionId, messages)
      return { ok: false, code: 'AI_CALL_FAILED', message: text, sessionId }
    }
  }

  const ensured = await ensureBriefSession(db, {
    requestId: input.requestId,
    sessionId: input.sessionId,
    initialQuestion: PORTFOLIO_BRIEF_USER_PROMPT,
  })
  if (!ensured.ok) return ensured
  const sessionId = ensured.sessionId

  if (holdings.length === 0) {
    const text = formatEmptyPortfolioMessage()
    appendExchange(db, sessionId, '分析我的持仓', text)
    return { ok: true, sessionId, text }
  }
  if (!resolveProviderCredentials(db)) {
    const text = formatAiConfigCheckMessage({
      hasApiKey: false,
      provider: null,
      model: null,
      configuredProviders: [],
    })
    appendExchange(db, sessionId, '分析我的持仓', text)
    return { ok: false, code: 'AI_NOT_CONFIGURED', message: text, sessionId }
  }

  const dashboard = await getPortfolioDashboard(db, { limit: 200, offset: 0 })
  const dashboardByCode = new Map<string, { price: number | null; change: number | null; todaySignalCount: number }>()
  for (const item of dashboard.items) {
    dashboardByCode.set(item.tsCode.trim().toUpperCase(), {
      price: item.price,
      change: item.change,
      todaySignalCount: item.todaySignals.count,
    })
  }
  const facts = buildPortfolioBriefFacts(holdings, dashboardByCode)
  const serialized = JSON.stringify(facts)
  if (/"costPrice"/i.test(serialized)) {
    const text = '持仓简报不得包含成本价，已中止本次分析。'
    appendExchange(db, sessionId, '分析我的持仓', text)
    return { ok: false, code: 'PRIVACY_GUARD', message: text, sessionId }
  }

  const session = getSession(db, sessionId)!
  const messages = parseMessages(session.messages)
  const userContent = `${PORTFOLIO_BRIEF_USER_PROMPT}\n\n【本地持仓事实】\n${serialized}`
  messages.push({ role: 'user', content: userContent })

  try {
    const result = await callWithFallback(db, {
      messages: messages.map((message) => ({ role: message.role, content: message.content })),
    })
    messages.push({ role: 'assistant', content: result.text, webSearchTrace: result.webSearchTrace })
    updateSessionMessages(db, sessionId, messages)
    return { ok: true, sessionId, text: result.text }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const text = `持仓分析失败：${message}`
    messages.push({ role: 'assistant', content: text })
    updateSessionMessages(db, sessionId, messages)
    return { ok: false, code: 'AI_CALL_FAILED', message: text, sessionId }
  }
}

export async function runPortfolioBrief(
  db: Database.Database,
  input: { requestId: string; sessionId?: number | null; mode?: PortfolioBriefMode },
): Promise<Awaited<ReturnType<typeof runPortfolioBriefUnlocked>>> {
  if (input.sessionId != null) {
    return withDiscussionSessionLock(input.sessionId, () => runPortfolioBriefUnlocked(db, input))
  }

  const mode = input.mode ?? 'analyze'
  const initialQuestion = mode === 'list'
    ? '我有哪些持仓'
    : mode === 'checkConfig'
      ? '检查 AI 配置'
      : mode === 'newsDigest'
        ? '相对持仓总结今日资讯'
        : PORTFOLIO_BRIEF_USER_PROMPT
  const ensured = await ensureBriefSession(db, {
    requestId: input.requestId,
    sessionId: null,
    initialQuestion,
  })
  if (!ensured.ok) return ensured
  return withDiscussionSessionLock(ensured.sessionId, () => runPortfolioBriefUnlocked(db, {
    ...input,
    sessionId: ensured.sessionId,
  }))
}
