import { normalizeAshareTsCode } from '../../utils/normalizeAshareTsCode'

export const BRIEFING_RELATED_STOCKS_LIMIT = 12

export interface BriefingRelatedStock {
  code: string
  tsCode: string
  name: string | null
}

/** 从任意文本抽取六位 A 股代码（不去交易所后缀匹配） */
export function extractSixDigitStockCodes(text: string): string[] {
  if (!text) return []
  const codes: string[] = []
  for (const match of text.matchAll(/(?<!\d)(\d{6})(?!\d)/g)) {
    codes.push(match[1])
  }
  return Array.from(new Set(codes))
}

/** 解析 AI prompt/response 中的 STOCK_CODES: 行 */
export function extractStockCodesFromProtocol(text: string): string[] {
  if (!text) return []
  const codes: string[] = []
  for (const match of text.matchAll(/STOCK_CODES:\s*([^\n]+)/gi)) {
    for (const entry of match[1].split(',')) {
      const raw = entry.trim().split('|')[0].trim().replace(/\.(SH|SZ|BJ)$/i, '')
      if (/^\d{6}$/.test(raw)) codes.push(raw)
    }
  }
  return Array.from(new Set(codes))
}

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface MergeInput {
  protocolTexts?: string[]
  candidateStocks?: Array<{ code: string; name?: string | null }>
  freeTexts?: string[]
  limit?: number
}

/**
 * 合并股票线索：协议/候选优先于正文扫码；同 code 保留先出现的名称。
 */
export function mergeBriefingRelatedStocks(input: MergeInput): BriefingRelatedStock[] {
  const limit = input.limit ?? BRIEFING_RELATED_STOCKS_LIMIT
  const byCode = new Map<string, BriefingRelatedStock>()

  const upsert = (rawCode: string, name: string | null) => {
    const digits = rawCode.trim().replace(/\.(SH|SZ|BJ)$/i, '')
    if (!/^\d{6}$/.test(digits)) return
    if (byCode.has(digits)) {
      const existing = byCode.get(digits)!
      if (!existing.name && name) existing.name = name
      return
    }
    byCode.set(digits, {
      code: digits,
      tsCode: normalizeAshareTsCode(digits),
      name,
    })
  }

  for (const text of input.protocolTexts ?? []) {
    for (const code of extractStockCodesFromProtocol(text)) upsert(code, null)
  }

  for (const stock of input.candidateStocks ?? []) {
    upsert(stock.code, stock.name ?? null)
  }

  for (const text of input.freeTexts ?? []) {
    for (const code of extractSixDigitStockCodes(text)) upsert(code, null)
  }

  return Array.from(byCode.values()).slice(0, limit)
}
