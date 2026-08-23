import type { ResearchAgentRunSummaryView } from '../../../electron/main/services/researchAgentRunManager'

export type DeepResearchTurnProjection = {
  runId: string
  title: string
  statusLabel: string
  phaseLabel: string
  thinkingOpenDefault: boolean
  conclusionPreview: string | null
  isTerminal: boolean
}

const BASE_STATUS_META: Record<ResearchAgentRunSummaryView['status'], { label: string; tone: string }> = {
  queued: { label: '等待启动', tone: 'text-slate-600 dark:text-slate-300' },
  running: { label: '运行中', tone: 'text-cyan-700 dark:text-cyan-300' },
  paused: { label: '已暂停', tone: 'text-amber-700 dark:text-amber-300' },
  needs_attention: { label: '需处理', tone: 'text-red-700 dark:text-red-300' },
  succeeded: { label: '已完成', tone: 'text-emerald-700 dark:text-emerald-300' },
  failed: { label: '失败', tone: 'text-red-700 dark:text-red-300' },
  cancelled: { label: '已取消', tone: 'text-slate-500 dark:text-slate-400' },
}

const PHASE_LABEL: Record<ResearchAgentRunSummaryView['phase'], string> = {
  planning: '研究计划',
  tooling: '本地事实',
  synthesis: '证据门禁 / 综合',
  audit: '确定性审计',
  persist: '本地写回',
}

const MULTI_PERSPECTIVE_PHASE_LABEL: Record<ResearchAgentRunSummaryView['phase'], string> = {
  planning: '锁定证据',
  tooling: '正反研判',
  synthesis: '中立主持',
  audit: '引用审计',
  persist: '讨论写回',
}

const TERMINAL_STATUSES = new Set<ResearchAgentRunSummaryView['status']>([
  'succeeded',
  'failed',
  'cancelled',
])

export function researchRunStatusMeta(
  run: Pick<ResearchAgentRunSummaryView, 'status' | 'resultSemantics'>,
): { label: string; tone: string } {
  return { ...BASE_STATUS_META[run.status], label: run.resultSemantics.executionLabel }
}

export function researchConclusionMeta(
  run: Pick<ResearchAgentRunSummaryView, 'resultSemantics'>,
): { label: string; tone: string } {
  const tone = {
    pending: 'text-slate-500 dark:text-slate-400',
    complete: 'text-emerald-700 dark:text-emerald-300',
    limited: 'text-amber-700 dark:text-amber-300',
    blocked: 'text-red-700 dark:text-red-300',
    unavailable: 'text-slate-500 dark:text-slate-400',
  }[run.resultSemantics.conclusionCoverage]
  return { label: run.resultSemantics.conclusionLabel, tone }
}

export function researchPhaseLabel(
  runKind: ResearchAgentRunSummaryView['runKind'],
  phase: ResearchAgentRunSummaryView['phase'],
): string {
  return runKind === 'multi_perspective' ? MULTI_PERSPECTIVE_PHASE_LABEL[phase] : PHASE_LABEL[phase]
}

export function projectDeepResearchTurn(input: {
  run: Pick<ResearchAgentRunSummaryView, 'id' | 'status' | 'phase' | 'question' | 'runKind' | 'resultSemantics'>
  liveProgressMessage?: string | null
  streamDraft?: string | null
}): DeepResearchTurnProjection {
  const isTerminal = TERMINAL_STATUSES.has(input.run.status)
  const question = input.run.question.trim()
  const truncated = question.length > 48 ? `${question.slice(0, 48)}…` : question
  return {
    runId: input.run.id,
    title: truncated ? `深度研究 · ${truncated}` : '深度研究',
    statusLabel: researchRunStatusMeta(input.run).label,
    phaseLabel: researchPhaseLabel(input.run.runKind, input.run.phase),
    // ChatGPT 式：过程默认折叠，避免刷屏；用户按需展开
    thinkingOpenDefault: false,
    conclusionPreview: null,
    isTerminal,
  }
}
