import type Database from 'better-sqlite3'
import type { DecisionReviewAiNarrative, DecisionReviewReportSnapshot } from '../database/types'
import { callWithFallback, resolveProviderCredentials, type AIFallbackResult } from './aiFallbackService'

export const REVIEW_AI_NARRATIVE_MAX_CHARS = 2500

export const REVIEW_AI_SYSTEM_CONSTRAINTS = [
  '你是本地投研助手，只基于用户提供的「本地复盘事实」写一段简短研判。',
  '必须使用风险、不确定、证据不足、待验证等语气；明确这是辅助研判，不能替代用户判断。',
  '禁止给出具体买卖点、加仓/减仓/仓位指令、目标价、收益或胜率承诺、荐股清单或自动交易暗示。',
  '只输出一段连续中文纯文本（不要 Markdown 标题、不要分节编号）；不超过 800 字。',
].join('\n')

const FORBIDDEN_PATTERN =
  /(买入|卖出|加仓|减仓|建仓|清仓|目标价|必涨|稳赚|收益率承诺|建议买入|建议卖出|仓位应|止盈位|止损价)/

export type ReviewAiNarrativeErrorCode =
  | 'AI_NOT_CONFIGURED'
  | 'AI_CALL_FAILED'
  | 'INVALID_PARAM'
  | 'OUTPUT_REJECTED'

export interface GenerateReviewAiNarrativeInput {
  report: DecisionReviewReportSnapshot
}

export interface GenerateReviewAiNarrativeResult {
  ok: boolean
  data?: DecisionReviewAiNarrative
  error?: { code: ReviewAiNarrativeErrorCode; message: string }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

function excerptList(items: unknown[], mapFn: (item: Record<string, unknown>) => string, limit = 8): string {
  const lines: string[] = []
  for (const item of items.slice(0, limit)) {
    if (!isRecord(item)) continue
    const line = mapFn(item).trim()
    if (line) lines.push(`- ${truncate(line, 160)}`)
  }
  if (items.length > limit) lines.push(`- …另有 ${items.length - limit} 条`)
  return lines.length > 0 ? lines.join('\n') : '- （无）'
}

/** 仅从受信本地字段拼装 prompt，拒绝把任意 renderer 字符串当系统指令。 */
export function buildReviewAiNarrativePrompt(report: DecisionReviewReportSnapshot): string {
  const kindLabel = report.kind === 'weekly' ? '周复盘' : '日复盘'
  const summary = report.summary
  const facts = [
    `【报告】${report.title}（${kindLabel}，rangeDays=${report.rangeDays}）`,
    `【结论摘要】${truncate(report.headline, 400)}`,
    `【计数】持仓 ${summary.holdingCount} · 相关信号 ${summary.portfolioSignalCount} · 已处理 ${summary.processedCount} · 未处理风险 ${summary.openRiskCount} · 证据缺口 ${summary.evidenceGapCount} · 待验证 ${summary.followUpCount}`,
    `【已处理】\n${excerptList(report.processed, (item) => `${String(item.stockName ?? '')} · ${String(item.tagLabel ?? item.tag ?? '')} · ${String(item.title ?? '')} · ${String(item.note ?? '')}`)}`,
    `【未处理风险】\n${excerptList(report.openRisks, (item) => `${String(item.stockName ?? '')} · P${String(item.priority ?? '')} · ${String(item.title ?? '')} · ${String(item.status ?? '')}`)}`,
    `【证据缺口】\n${excerptList(report.evidenceGaps, (item) => `${String(item.stockName ?? '')} · ${String(item.reason ?? '')}`)}`,
    `【待验证】\n${excerptList(report.followUps, (item) => `${String(item.stockName ?? '')} · ${String(item.tagLabel ?? item.tag ?? '')} · ${String(item.title ?? '')} · ${String(item.note ?? '')}`)}`,
    `【免责声明原文】${truncate(report.disclaimer, 200)}`,
  ].join('\n\n')

  return `${REVIEW_AI_SYSTEM_CONSTRAINTS}\n\n---\n本地复盘事实：\n${facts}`
}

export function sanitizeReviewAiNarrativeText(raw: string): { ok: true; text: string } | { ok: false; code: ReviewAiNarrativeErrorCode; message: string } {
  const text = truncate(String(raw ?? '').replace(/\r\n/g, '\n').trim(), REVIEW_AI_NARRATIVE_MAX_CHARS)
  if (!text) {
    return { ok: false, code: 'OUTPUT_REJECTED', message: '模型未返回可用研判正文' }
  }
  if (FORBIDDEN_PATTERN.test(text)) {
    return { ok: false, code: 'OUTPUT_REJECTED', message: '模型输出含不当交易指令语气，已拒收' }
  }
  return { ok: true, text }
}

function stripAiForPrompt(report: DecisionReviewReportSnapshot): DecisionReviewReportSnapshot {
  const { aiNarrative: _ignored, ...rest } = report
  return rest
}

export async function generateReviewAiNarrative(
  db: Database.Database,
  input: GenerateReviewAiNarrativeInput,
  dependencies: {
    callAI?: typeof callWithFallback
    now?: number
  } = {},
): Promise<GenerateReviewAiNarrativeResult> {
  const report = input.report
  if (!report || (report.kind !== 'daily' && report.kind !== 'weekly')) {
    return { ok: false, error: { code: 'INVALID_PARAM', message: 'report 无效' } }
  }

  if (!resolveProviderCredentials(db)) {
    return {
      ok: false,
      error: {
        code: 'AI_NOT_CONFIGURED',
        message: '尚未配置可用的 AI。请打开配置中心 → AI 配置，填写厂商与模型后再试。',
      },
      data: {
        status: 'error',
        text: null,
        errorCode: 'AI_NOT_CONFIGURED',
        errorMessage: '尚未配置可用的 AI。请打开配置中心 → AI 配置，填写厂商与模型后再试。',
      },
    }
  }

  const callAI = dependencies.callAI ?? callWithFallback
  const now = dependencies.now ?? Date.now()
  const prompt = buildReviewAiNarrativePrompt(stripAiForPrompt(report))

  try {
    const result: AIFallbackResult = await callAI(db, { prompt, maxTokens: 900 })
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
        text: sanitized.text,
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
      : `AI 研判调用失败：${message}`
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
