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
