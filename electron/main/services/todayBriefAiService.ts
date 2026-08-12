import type Database from 'better-sqlite3'
import { callWithFallback, resolveProviderCredentials, type AIFallbackResult } from './aiFallbackService'
import {
  REVIEW_AI_NARRATIVE_MAX_CHARS,
  sanitizeReviewAiNarrativeText,
  type ReviewAiNarrativeErrorCode,
} from './reviewAiNarrativeService'

export interface TodayBriefAiFactClue {
  kind: string
  title: string
  summary: string
  evidence: string
  meta: string
  tsCode: string | null
  stockName: string | null
  conceptName: string | null
  priority: number
  confidence: number | null
  occurrenceCount: number
}

export interface TodayBriefAiFacts {
  headline: string
  bullets: string[]
  marketThemeLine: string | null
  portfolioClues: TodayBriefAiFactClue[]
  sectorClues: TodayBriefAiFactClue[]
  strategyClues: TodayBriefAiFactClue[]
  peripheralClues: TodayBriefAiFactClue[]
  noiseCount: number
  disclaimer: string
}

export interface TodayBriefAiNarrative {
  status: 'pending' | 'ready' | 'error' | 'skipped'
  text: string | null
  generatedAt?: number
  provider?: string
  model?: string
  errorCode?: string
  errorMessage?: string
}

export interface GenerateTodayBriefAiResult {
  ok: boolean
  data?: TodayBriefAiNarrative
  error?: { code: ReviewAiNarrativeErrorCode; message: string }
}

const BRIEF_AI_SYSTEM_CONSTRAINTS = [
  '你是本地投研助手，只基于用户提供的「今日提炼本地事实」写一段简短中文研判。',
  '任务：把持仓必看、板块热度、短线线索与外围叙事压缩成可读要点，指出不确定与待验证处。',
  '必须引用事实清单中的具体数字与字段（如板块涨跌、置信度、重复触发次数）；禁止声称「本地未提供具体内容」——若某节为（无）可跳过该节，但不得否认已给出的证据行。',
  '必须使用风险、不确定、证据不足、待验证等语气；明确这是辅助研判，不能替代用户判断。',
  '禁止给出具体买卖点、加仓/减仓/仓位指令、目标价、收益或胜率承诺、荐股清单或自动交易暗示。',
  '禁止引入事实清单中未出现的股票代码、公司名或板块名。',
  '只输出一段连续中文纯文本（不要 Markdown 标题、不要分节编号）；不超过 700 字。',
].join('\n')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

function clueLines(clues: unknown[], limit = 8): string {
  const lines: string[] = []
  for (const item of clues.slice(0, limit)) {
    if (!isRecord(item)) continue
    const title = truncate(String(item.title ?? ''), 100)
    const evidence = truncate(String(item.evidence ?? item.summary ?? ''), 280)
    const meta = truncate(String(item.meta ?? ''), 48)
    const name = item.stockName ? String(item.stockName) : ''
    const code = item.tsCode ? String(item.tsCode) : ''
    const concept = item.conceptName ? String(item.conceptName) : ''
    const conf = item.confidence == null || !Number.isFinite(Number(item.confidence))
      ? ''
      : ` · 置信度${Math.round(Number(item.confidence))}%`
    const occ = Number(item.occurrenceCount)
    const occText = Number.isFinite(occ) && occ > 1 ? ` · 重复${occ}次` : ''
    lines.push(
      `- [${meta}${conf}${occText}] ${title}${name || code ? ` · ${name || code}` : ''}${concept ? ` · 题材 ${concept}` : ''}\n  证据：${evidence || '（无）'}`,
    )
  }
  if (clues.length > limit) lines.push(`- …另有 ${clues.length - limit} 条`)
  return lines.length > 0 ? lines.join('\n') : '- （无）'
}

export function assertTodayBriefAiFacts(raw: unknown): TodayBriefAiFacts {
  if (!isRecord(raw)) throw new Error('brief 无效')
  const bullets = Array.isArray(raw.bullets)
    ? raw.bullets.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 8)
    : []
  const asClues = (value: unknown): TodayBriefAiFactClue[] => {
    if (!Array.isArray(value)) return []
    return value.slice(0, 10).filter(isRecord).map((item) => ({
      kind: String(item.kind ?? ''),
      title: String(item.title ?? ''),
      summary: String(item.summary ?? ''),
      evidence: String(item.evidence ?? item.summary ?? ''),
      meta: String(item.meta ?? ''),
      tsCode: item.tsCode == null ? null : String(item.tsCode),
      stockName: item.stockName == null ? null : String(item.stockName),
      conceptName: item.conceptName == null ? null : String(item.conceptName),
      priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : 0,
      confidence: item.confidence == null || !Number.isFinite(Number(item.confidence))
        ? null
        : Number(item.confidence),
      occurrenceCount: Number.isFinite(Number(item.occurrenceCount))
        ? Math.max(1, Math.floor(Number(item.occurrenceCount)))
        : 1,
    }))
  }
  return {
    headline: truncate(String(raw.headline ?? ''), 200),
    bullets,
    marketThemeLine: raw.marketThemeLine == null ? null : truncate(String(raw.marketThemeLine), 400),
    portfolioClues: asClues(raw.portfolioClues),
    sectorClues: asClues(raw.sectorClues),
    strategyClues: asClues(raw.strategyClues),
    peripheralClues: asClues(raw.peripheralClues),
    noiseCount: Number.isFinite(Number(raw.noiseCount)) ? Math.max(0, Math.floor(Number(raw.noiseCount))) : 0,
    disclaimer: truncate(String(raw.disclaimer ?? ''), 200),
  }
}

export function buildTodayBriefAiPrompt(facts: TodayBriefAiFacts): string {
  const body = [
    `【本地标题】${facts.headline}`,
    `【要点】\n${facts.bullets.length > 0 ? facts.bullets.map((item) => `- ${item}`).join('\n') : '- （无）'}`,
    `【板块/市场热度一览】${facts.marketThemeLine ?? '（无）'}`,
    `【持仓必看】\n${clueLines(facts.portfolioClues)}`,
    `【板块资金/市场信号（须引用其证据数字）】\n${clueLines(facts.sectorClues)}`,
    `【短线策略线索（须引用其证据数字）】\n${clueLines(facts.strategyClues)}`,
    `【外围/资讯】\n${clueLines(facts.peripheralClues)}`,
    `【未展开噪音条数】${facts.noiseCount}`,
    `【免责声明原文】${facts.disclaimer}`,
  ].join('\n\n')
  return `${BRIEF_AI_SYSTEM_CONSTRAINTS}\n\n---\n今日提炼本地事实：\n${body}`
}

export async function generateTodayBriefAiNarrative(
  db: Database.Database,
  input: { brief: TodayBriefAiFacts },
  dependencies: {
    callAI?: typeof callWithFallback
    now?: number
  } = {},
): Promise<GenerateTodayBriefAiResult> {
  if (!resolveProviderCredentials(db)) {
    const message = '尚未配置可用的 AI。请打开配置中心 → AI 配置，填写厂商与模型后再试。'
    return {
      ok: false,
      error: { code: 'AI_NOT_CONFIGURED', message },
      data: {
        status: 'error',
        text: null,
        errorCode: 'AI_NOT_CONFIGURED',
        errorMessage: message,
      },
    }
  }

  const callAI = dependencies.callAI ?? callWithFallback
  const now = dependencies.now ?? Date.now()
  const prompt = buildTodayBriefAiPrompt(input.brief)

  try {
    // 不卡 maxTokens：现代模型上下文足够，由模型端自行决定输出长度
    const result: AIFallbackResult = await callAI(db, { prompt, omitOutputTokenLimit: true })
    const sanitized = sanitizeReviewAiNarrativeText(result.text)
    if (!sanitized.ok) {
      return {
        ok: false,
        error: { code: sanitized.code, message: sanitized.message },
        data: {
          status: 'error',
          text: null,
          generatedAt: now,
          provider: result.provider,
          model: result.model,
          errorCode: sanitized.code,
          errorMessage: sanitized.message,
        },
      }
    }
    return {
      ok: true,
      data: {
        status: 'ready',
        text: truncate(sanitized.text, REVIEW_AI_NARRATIVE_MAX_CHARS),
        generatedAt: now,
        provider: result.provider,
        model: result.model,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const code: ReviewAiNarrativeErrorCode = message === 'AI_NOT_CONFIGURED' ? 'AI_NOT_CONFIGURED' : 'AI_CALL_FAILED'
    const friendly = code === 'AI_NOT_CONFIGURED'
      ? '尚未配置可用的 AI。请打开配置中心 → AI 配置，填写厂商与模型后再试。'
      : message === 'AI_RESPONSE_EMPTY'
        ? '模型返回了空内容。请重试，或在 AI 配置里换一个能稳定输出正文的模型。'
        : `AI 提炼调用失败：${message}`
    return {
      ok: false,
      error: { code, message: friendly },
      data: {
        status: 'error',
        text: null,
        generatedAt: now,
        errorCode: code,
        errorMessage: friendly,
      },
    }
  }
}
