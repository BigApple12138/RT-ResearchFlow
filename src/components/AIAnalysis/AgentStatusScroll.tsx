import type { ReactElement } from 'react'
import type { AgentStatusScrollView, AgentTimelineStep } from './agentTimelineModel'

interface Props {
  scroll: AgentStatusScrollView
  steps: AgentTimelineStep[]
  networkDisabledHint?: string | null
}

/**
 * Cursor 式状态滚动：默认只显示短状态行；明细折叠在 details 内。
 */
export function AgentStatusScroll({ scroll, steps, networkDisabledHint = null }: Props): ReactElement {
  const detailSteps = steps
    .filter((step) => step.kind === 'plan' || step.kind === 'status' || step.kind === 'tool' || step.kind === 'hitl')
    .slice(-12)

  return (
    <div data-testid="agent-timeline" className="mt-2 space-y-1">
      <div data-testid="agent-status-scroll" className="space-y-0.5 px-0.5" aria-live="polite">
        {scroll.secondary.map((line) => (
          <div key={line} className="truncate text-[11px] leading-5 text-slate-400 dark:text-slate-500">
            {line}
          </div>
        ))}
        <div
          className={`truncate text-[11px] leading-5 ${
            scroll.running
              ? 'text-slate-500 dark:text-slate-400'
              : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          {scroll.running && (
            <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-500 align-middle" />
          )}
          {scroll.primary}
        </div>
      </div>

      {networkDisabledHint && (
        <div data-testid="agent-network-hint" className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {networkDisabledHint}
        </div>
      )}

      {detailSteps.length > 0 && (
        <details className="text-[11px] text-slate-500 dark:text-slate-400">
          <summary className="cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40">
            查看明细 · {scroll.itemCount} 项
          </summary>
          <div className="mt-1.5 space-y-1 border-l border-slate-200 pl-2 dark:border-slate-700">
            {detailSteps.map((step) => (
              <div key={step.id} className="min-w-0">
                <div className={`truncate font-medium ${
                  step.tone === 'danger' ? 'text-red-700 dark:text-red-300'
                    : step.tone === 'warning' ? 'text-amber-700 dark:text-amber-300'
                      : step.tone === 'success' ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-slate-600 dark:text-slate-300'
                }`}>{step.title}</div>
                {step.detail && (
                  <div className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-slate-400 dark:text-slate-500">{step.detail}</div>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
