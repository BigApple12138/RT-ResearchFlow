import { useEffect, useState, type ReactElement } from 'react'
import type {
  ResearchAgentRunDetailView,
  ResearchAgentRunSummaryView,
} from '../../../electron/main/services/researchAgentRunManager'
import { ResearchAgentRunDetail } from './ResearchAgentPanel'
import { projectDeepResearchTurn } from './deepResearchTurnModel'

function formatLiveProgressMessage(message: string): string {
  const trimmed = message.trim()
  if (!trimmed) return '进行中…'
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>
      if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message.trim()
      if (typeof parsed.phase === 'string' && parsed.phase.trim()) return `阶段：${parsed.phase}`
      if (parsed.action != null) return `进度：${String(parsed.action)}`
    } catch {
      // ignore
    }
    return '研究进度更新'
  }
  return trimmed
}

export interface DeepResearchTurnViewProps {
  run: ResearchAgentRunSummaryView
  liveProgress?: { runId: string; message: string; phase: string } | null
  streamDraft?: { runId: string; phase: string; accumulated: string } | null
  busy: string | null
  detail?: ResearchAgentRunDetailView | null
  onResume: () => void
  onCancel: () => void
  onStartReview: () => void
  onRetry?: () => void
  onDelete?: () => void
}

/**
 * 单次深度研究在聊天时间线中的呈现：过程折叠 + 结论/证据（复用 ResearchAgentRunDetail）。
 */
export function DeepResearchTurnView({
  run,
  liveProgress = null,
  streamDraft = null,
  busy,
  detail: detailProp = null,
  onResume,
  onCancel,
  onStartReview,
  onRetry,
  onDelete,
}: DeepResearchTurnViewProps): ReactElement {
  const [detail, setDetail] = useState<ResearchAgentRunDetailView | null>(detailProp)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    setDetail(detailProp)
  }, [detailProp])

  useEffect(() => {
    if (detailProp && detailProp.run.id === run.id) return
    let cancelled = false
    void window.api.researchAgent.getRun(run.id).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setLoadError(result.message)
        return
      }
      setLoadError(null)
      setDetail(result.data)
    })
    return () => { cancelled = true }
  }, [run.id, run.revision, detailProp])

  const projection = projectDeepResearchTurn({
    run,
    liveProgressMessage: liveProgress?.runId === run.id ? liveProgress.message : null,
    streamDraft: streamDraft?.runId === run.id ? streamDraft.accumulated : null,
  })
  const liveForRun = liveProgress?.runId === run.id ? liveProgress : null
  const draftForRun = streamDraft?.runId === run.id ? streamDraft : null

  const liveLine = liveForRun
    ? formatLiveProgressMessage(liveForRun.message)
    : projection.phaseLabel
  const isActive = run.status === 'queued' || run.status === 'running' || run.status === 'paused'

  return (
    <article
      data-testid={`deep-research-turn-${run.id}`}
      className={isActive
        ? 'min-w-0 px-0.5 py-1 text-xs'
        : 'rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-900'}
    >
      {isActive ? (
        <div data-testid="deep-research-status-scroll" className="space-y-0.5" aria-live="polite">
          <div className="truncate text-[11px] leading-5 text-slate-400 dark:text-slate-500">
            {projection.title}
          </div>
          <div className="truncate text-[11px] leading-5 text-slate-500 dark:text-slate-400">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-500 align-middle" />
            {liveLine}
          </div>
          <details
            data-testid="deep-research-thinking"
            className="text-[11px] text-slate-500 dark:text-slate-400"
            open={projection.thinkingOpenDefault}
          >
            <summary className="cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40">
              查看过程
            </summary>
            <div className="mt-1.5 space-y-2 border-l border-slate-200 pl-2 dark:border-slate-700">
              {liveForRun && (
                <div data-testid="research-agent-live-progress">{formatLiveProgressMessage(liveForRun.message)}</div>
              )}
              {draftForRun && (
                <div data-testid="research-agent-stream-draft" className="max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {draftForRun.accumulated || '生成中…'}
                </div>
              )}
              {run.errorMessage && <div>{run.errorMessage}</div>}
              {!liveForRun && !draftForRun && !run.errorMessage && (
                <div className="text-slate-400">等待进度…</div>
              )}
            </div>
          </details>
        </div>
      ) : (
        <>
          <header className="min-w-0">
            <div className="text-[11px] font-semibold text-cyan-700 dark:text-cyan-300">深度研究</div>
            <div className="mt-0.5 break-words text-sm font-medium text-slate-800 dark:text-slate-100">{projection.title}</div>
            <div className="mt-1 tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
              {projection.statusLabel} · {projection.phaseLabel}
            </div>
          </header>

          <details
            data-testid="deep-research-thinking"
            className="mt-3 border-t border-slate-200 pt-2 dark:border-slate-700"
            open={projection.thinkingOpenDefault}
          >
            <summary className="cursor-pointer select-none font-medium text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 dark:text-slate-300">
              过程
            </summary>
            <div className="mt-2 space-y-2 text-[11px] leading-5 text-slate-600 dark:text-slate-300">
              {run.errorMessage && (
                <div className="border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  {run.errorMessage}
                </div>
              )}
              {!run.errorMessage && (
                <div className="text-slate-400">过程已结束，可展开回看阶段。</div>
              )}
            </div>
          </details>
        </>
      )}

      {!isActive && (
        <div data-testid="deep-research-conclusion" className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
          {loadError && (
            <div role="alert" className="border-l-2 border-red-500 bg-red-50 px-3 py-2 text-red-700 dark:bg-red-950/30 dark:text-red-300">
              {loadError}
            </div>
          )}
          {!loadError && !detail && (
            <div className="text-slate-400">{projection.isTerminal ? '正在加载报告…' : '暂无报告'}</div>
          )}
          {detail && detail.run.id === run.id && (
            <ResearchAgentRunDetail
              detail={detail}
              busy={busy}
              liveProgress={null}
              streamDraft={null}
              embedded
              onResume={onResume}
              onCancel={onCancel}
              onStartReview={onStartReview}
              onRetry={onRetry}
              onDelete={onDelete}
            />
          )}
        </div>
      )}
      {isActive && (
        <div className="mt-1">
          <button
            type="button"
            className="text-[11px] text-red-600 hover:underline dark:text-red-300"
            onClick={onCancel}
            disabled={busy === `cancel:${run.id}`}
          >
            {busy === `cancel:${run.id}` ? '取消中…' : '取消'}
          </button>
        </div>
      )}
    </article>
  )
}
