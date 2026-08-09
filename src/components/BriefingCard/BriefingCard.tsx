import { formatBjDateTime } from './dateFormat'
import type { Briefing } from '../../../electron/main/database/types'

interface Props {
  briefing: Briefing
  isSelected: boolean
  onClick: () => void
  /** 点击「产业链」按钮的回调，传入标题+摘要文本；非 GENERAL 资讯时显示按钮 */
  onChainClick?: (text: string) => void
}

export function BriefingCard({ briefing, isSelected, onClick, onChainClick }: Props) {
  const isHighImpact = briefing.impactRating === 'CRITICAL' || briefing.impactRating === 'IMPORTANT'
  const impactText = briefing.impactRating === 'CRITICAL' ? '重大' : briefing.impactRating === 'IMPORTANT' ? '重要' : '一般'
  const timeStatusText = briefing.publicationTimeStatus === 'date_only'
    ? '日期可确认'
    : briefing.publicationTimeStatus === 'collected_fallback'
      ? '发布时间待校时'
      : null

  return (
    <article
      className={[
        'group cursor-pointer rounded-md border bg-white px-3 py-3 shadow-sm transition-all dark:bg-slate-900/90',
        'hover:border-cyan-200 hover:shadow-md hover:shadow-slate-200/50 dark:hover:border-cyan-400/35 dark:hover:shadow-black/20',
        !briefing.isRead ? 'border-cyan-200/90 dark:border-cyan-400/30' : 'border-slate-200/80 dark:border-slate-800',
        !briefing.isRead ? 'briefing-card-unread' : '',
        isHighImpact ? 'briefing-card-priority' : '',
        isSelected ? 'border-cyan-400 bg-cyan-50/50 shadow-md shadow-cyan-100/60 dark:border-cyan-400 dark:bg-cyan-400/10 dark:shadow-black/20' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <span className={[
          'rounded px-2 py-0.5 text-[11px] font-semibold',
          briefing.impactRating === 'CRITICAL'
            ? 'bg-red-50 text-red-600 dark:bg-red-400/10 dark:text-red-200'
            : briefing.impactRating === 'IMPORTANT'
              ? 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200'
              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
        ].join(' ')}>{impactText}</span>
        {isHighImpact && <span className="rounded bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700 dark:bg-teal-400/15 dark:text-teal-200">需验证</span>}
        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">{briefing.sourceName}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
          {timeStatusText && (
            <span className={briefing.publicationTimeStatus === 'collected_fallback' ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300'}>
              {timeStatusText}
            </span>
          )}
          <span>{briefing.publicationTimeStatus === 'date_only' ? briefing.publishedDateBJ : formatBjDateTime(briefing.publishedAt)}</span>
        </span>
      </div>

      <h3
        className={[
          'line-clamp-2 text-sm leading-snug',
          !briefing.isRead ? 'font-semibold text-slate-950 dark:text-white' : 'text-slate-700 dark:text-slate-300'
        ].join(' ')}
      >
        {briefing.title}
      </h3>

      {briefing.summary && (
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{briefing.summary}</p>
      )}

      {briefing.relevanceHits && briefing.relevanceHits.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1" data-testid="briefing-relevance-hits">
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            {briefing.relevanceKind === 'chain_peer' ? '产业链邻近' : '命中'}
          </span>
          {briefing.relevanceHits.slice(0, 2).map((hit) => (
            <span
              key={hit}
              className="rounded border border-teal-200/80 bg-teal-50/80 px-1.5 py-0.5 text-[10px] font-medium text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200"
            >
              {hit}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        <span className="text-[11px] text-slate-400 dark:text-slate-500">影响分 {Math.round(briefing.impactRatingScore ?? 0)}</span>
        {onChainClick && briefing.impactRating !== 'GENERAL' && (
          <button
            type="button"
            className="rounded px-2 py-0.5 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-50 hover:text-teal-900 dark:text-teal-300 dark:hover:bg-teal-400/10 dark:hover:text-teal-100"
            onClick={e => {
              e.stopPropagation()
              onChainClick(`${briefing.title} ${briefing.summary ?? ''}`.trim())
            }}
          >
            产业链
          </button>
        )}
        {!briefing.isRead && (
          <span className="ml-auto h-2 w-2 rounded-full bg-cyan-500" />
        )}
      </div>
    </article>
  )
}
