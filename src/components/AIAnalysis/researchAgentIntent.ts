export type ResearchAgentChatIntent = 'deep_research' | 'industry_research' | null

const DEEP_RESEARCH_PATTERN = /深挖|深度研究|深入研究|全面调研|启动深度研究|做个深度/
const INDUSTRY_RESEARCH_PATTERN = /产业研究|产业链研究|行业深度|启动产业研究/

/** 识别主聊天是否应调度研究 subagent（启发式，非模型路由）。 */
export function detectResearchAgentIntent(text: string): ResearchAgentChatIntent {
  const normalized = text.trim()
  if (!normalized) return null
  if (INDUSTRY_RESEARCH_PATTERN.test(normalized)) return 'industry_research'
  if (DEEP_RESEARCH_PATTERN.test(normalized)) return 'deep_research'
  return null
}

export function isSessionResearchBusy(
  runs: Array<{ status: string }>,
): boolean {
  return runs.some((run) => run.status === 'queued' || run.status === 'running' || run.status === 'paused')
}

export function isGlobalResearchBusy(
  runs: Array<{ status: string }>,
): boolean {
  return runs.some((run) => run.status === 'queued' || run.status === 'running')
}

export interface AutoDeepResearchLaunchInput {
  seedQuestion: string
  stockLabels: string[]
  recentUserMessages?: string[]
  corpusTexts?: string[]
}

export interface ExtractedStockSubject {
  kind: 'stock'
  tsCode: string
  label: string | null
}

/** 从任意文本中提取 A 股 tsCode（支持「节能风电(601016)」「601016.SH」）。 */
export function extractTsCodesFromText(text: string): ExtractedStockSubject[] {
  const subjects: ExtractedStockSubject[] = []
  const seen = new Set<string>()
  for (const match of text.matchAll(/(?<!\d)(\d{6})(?:\.(SH|SZ|BJ))?/gi)) {
    const code = match[1]!
    const explicit = match[2]?.toUpperCase()
    const market = explicit
      || (/^(4|8|92)/.test(code) ? 'BJ' : /^(5|6|9)/.test(code) ? 'SH' : 'SZ')
    if (explicit && explicit !== market) continue
    const tsCode = `${code}.${market}`
    if (seen.has(tsCode)) continue
    seen.add(tsCode)
    subjects.push({ kind: 'stock', tsCode, label: null })
    if (subjects.length >= 5) break
  }
  return subjects
}

/** 将短意图句扩成可提交的研究问题（≥10 字）。 */
export function buildAutoDeepResearchQuestion(input: AutoDeepResearchLaunchInput): string {
  const seed = input.seedQuestion.trim()
  if (seed.length >= 10) return seed.slice(0, 4000)
  const stockPart = (input.stockLabels[0] || '').trim() || '标的'
  const clause = seed || '综合研判'
  let question = `对${stockPart}做深度研究：${clause}。结合本地行情、基本面与受信证据，给出可验证结论与缺口。`
  if (question.length < 10) {
    const extra = (input.recentUserMessages ?? []).map((item) => item.trim()).find(Boolean)?.slice(0, 200) ?? ''
    question = `${question}${extra}`
  }
  return question.slice(0, 4000)
}

/** 合并预检建议与会话正文中的股票；会话提取优先（更贴近当前讨论）。 */
export function resolveAutoDeepResearchStocks(input: {
  preflightStocks: ExtractedStockSubject[]
  corpusTexts: string[]
}): ExtractedStockSubject[] {
  const fromCorpus = extractTsCodesFromText(input.corpusTexts.join('\n'))
  if (fromCorpus.length > 0) return fromCorpus
  return input.preflightStocks.slice(0, 5)
}

export function decideAutoDeepResearchStart(input: {
  preflightReady: boolean
  stockCount: number
  projectCount: number
}): { auto: true } | { auto: false; reason: string } {
  if (!input.preflightReady) return { auto: false, reason: '预检未就绪，暂无法启动深度研究' }
  if (input.stockCount < 1 && input.projectCount < 1) {
    return { auto: false, reason: '会话中未识别到可研究的A股代码或产业项目' }
  }
  return { auto: true }
}
