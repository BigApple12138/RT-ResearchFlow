import type { TodayBriefClue, TodayBriefModel } from './todayBriefModel'

export interface TodayBriefAiState {
  status: 'idle' | 'pending' | 'ready' | 'error'
  text: string | null
  errorMessage: string | null
  provider?: string
  model?: string
}

interface TodayBriefPanelProps {
  model: TodayBriefModel
  aiState: TodayBriefAiState
  aiBusy: boolean
  onRunAi: () => void
  onOpenDetailTab: () => void
  onOpenSignal: (signalId: number) => void
  onNavigateStock?: (tsCode: string, stockName: string | null) => void
}

function ClueRow({
  clue,
  onOpenSignal,
  onNavigateStock,
}: {
  clue: TodayBriefClue
  onOpenSignal: (signalId: number) => void
  onNavigateStock?: (tsCode: string, stockName: string | null) => void
}) {
  const canStock = Boolean(clue.tsCode && onNavigateStock)
  return (
    <article
      data-testid={`today-brief-clue-${clue.id}`}
      className="flex min-w-0 items-start justify-between gap-3 border-b border-slate-200 py-3 last:border-b-0 dark:border-slate-800"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{clue.meta}</div>
        <h4 className="mt-0.5 text-sm font-semibold leading-5 text-slate-900 dark:text-slate-100">{clue.title}</h4>
        <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-600 dark:text-slate-300">{clue.evidence || clue.summary}</p>
        {clue.conceptName && (
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">题材 {clue.conceptName}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">
        <button
          type="button"
          className="h-9 border border-slate-300 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          onClick={() => onOpenSignal(clue.signalId)}
        >
          看信号
        </button>
        {canStock && (
          <button
            type="button"
            className="h-9 border border-cyan-600/40 bg-cyan-50 px-2.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-100 dark:border-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200 dark:hover:bg-cyan-950/70"
            onClick={() => onNavigateStock?.(clue.tsCode!, clue.stockName)}
          >
            走势图
          </button>
        )}
      </div>
    </article>
  )
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[10px] border border-slate-200/90 bg-white/90 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/90">
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

export function TodayBriefPanel({
  model,
  aiState,
  aiBusy,
  onRunAi,
  onOpenDetailTab,
  onOpenSignal,
  onNavigateStock,
}: TodayBriefPanelProps) {
  return (
    <div data-testid="today-brief-panel" className="flex min-h-0 flex-col gap-3 pb-4">
      <header className="rounded-[10px] border border-slate-200/90 bg-slate-50/90 px-3 py-3 dark:border-slate-800 dark:bg-slate-950/60">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              今日提炼 · 本地事实优先
            </div>
            <h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">{model.headline}</h2>
          </div>
          <button
            type="button"
            data-testid="today-brief-run-ai"
            disabled={aiBusy}
            onClick={onRunAi}
            className="h-10 shrink-0 border border-cyan-600 bg-cyan-600 px-3 text-xs font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-cyan-500 dark:bg-cyan-600 dark:hover:bg-cyan-500"
          >
            {aiBusy ? 'AI 提炼中…' : aiState.status === 'ready' ? '重新 AI 提炼' : 'AI 提炼'}
          </button>
        </div>
        <ul className="mt-2 space-y-1.5">
          {model.bullets.map((bullet) => (
            <li key={bullet.id} className="flex gap-2 text-xs leading-5 text-slate-700 dark:text-slate-300">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-cyan-600 dark:bg-cyan-400" aria-hidden />
              <span>{bullet.text}</span>
            </li>
          ))}
        </ul>
        {(aiState.status === 'pending' || aiState.status === 'ready' || aiState.status === 'error') && (
          <div
            data-testid="today-brief-ai-block"
            className="mt-3 rounded-md border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-700 dark:bg-slate-900"
            aria-live="polite"
          >
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              AI 提炼
              {aiState.provider && aiState.model ? ` · ${aiState.provider}/${aiState.model}` : ''}
            </div>
            {aiState.status === 'pending' && (
              <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">正在基于上方本地线索生成…</p>
            )}
            {aiState.status === 'ready' && aiState.text && (
              <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-800 dark:text-slate-100">{aiState.text}</p>
            )}
            {aiState.status === 'error' && (
              <p className="mt-1 text-xs leading-5 text-red-700 dark:text-red-300">
                {aiState.errorMessage ?? 'AI 提炼失败'}
              </p>
            )}
          </div>
        )}
      </header>

      <Section title="持仓必看" subtitle="真实持仓相关 · 先处理再看市场">
        {model.portfolioClues.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">暂无持仓相关待办</p>
        ) : (
          model.portfolioClues.map((clue) => (
            <ClueRow
              key={clue.id}
              clue={clue}
              onOpenSignal={onOpenSignal}
              onNavigateStock={onNavigateStock}
            />
          ))
        )}
      </Section>

      <Section
        title="市场观察"
        subtitle="板块热度 · 短线线索 · 外围叙事（研究线索，非选股建议）"
      >
        {model.marketThemeLine && (
          <div
            data-testid="today-brief-market-theme"
            className="mb-2 rounded-md border border-amber-200/80 bg-amber-50/80 px-2.5 py-2 text-xs leading-5 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
          >
            板块/市场热度：{model.marketThemeLine}
          </div>
        )}
        {model.sectorClues.length === 0 && model.strategyClues.length === 0 && model.peripheralClues.length === 0 && !model.marketThemeLine ? (
          <p className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">
            暂无本地市场/策略/资讯事实可压缩
          </p>
        ) : (
          <>
            {model.sectorClues.map((clue) => (
              <ClueRow
                key={clue.id}
                clue={clue}
                onOpenSignal={onOpenSignal}
                onNavigateStock={onNavigateStock}
              />
            ))}
            {model.strategyClues.map((clue) => (
              <ClueRow
                key={clue.id}
                clue={clue}
                onOpenSignal={onOpenSignal}
                onNavigateStock={onNavigateStock}
              />
            ))}
            {model.peripheralClues.map((clue) => (
              <ClueRow
                key={clue.id}
                clue={clue}
                onOpenSignal={onOpenSignal}
                onNavigateStock={onNavigateStock}
              />
            ))}
          </>
        )}
      </Section>

      {model.noiseCount > 0 && (
        <section
          data-testid="today-brief-noise"
          className="flex items-center justify-between gap-3 rounded-[10px] border border-dashed border-slate-300 px-3 py-3 dark:border-slate-700"
        >
          <div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">噪音折叠</div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              另有 {model.noiseCount} 条未展开，不自动改状态
            </p>
          </div>
          <button
            type="button"
            data-testid="today-brief-open-detail"
            className="h-10 shrink-0 border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={onOpenDetailTab}
          >
            信号明细
          </button>
        </section>
      )}

      <p className="px-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{model.disclaimer}</p>
    </div>
  )
}
