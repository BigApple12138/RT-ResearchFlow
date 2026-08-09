import type { TrendWorkbenchItem } from './trendWorkbenchTypes'

type TrendReview = NonNullable<TrendWorkbenchItem['structureReview']>

const VERDICT_META: Record<TrendReview['verdict'], { label: string; className: string }> = {
  trend_intact: {
    label: '趋势完整',
    className: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300',
  },
  trend_improving: {
    label: '趋势改善',
    className: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
  },
  trend_deteriorating: {
    label: '趋势走弱',
    className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  },
  trend_broken: {
    label: '趋势破坏',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  need_more_data: {
    label: '需补数据',
    className: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
}

export function AiTrendReviewBadge({ review, stockCode }: { review: TrendReview; stockCode: string }) {
  const meta = VERDICT_META[review.verdict]
  const label = review.stale ? '需重核' : meta.label
  const className = review.stale
    ? 'border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
    : meta.className

  return (
    <span
      data-testid={`trend-ai-review-badge-${stockCode}`}
      data-state={review.verdict}
      data-stale={review.stale ? 'true' : 'false'}
      title={review.stale ? '当前行情或评分事实已变化，请重新复核。' : review.rationale}
      aria-label={`AI复核：${label}`}
      className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-medium ${className}`}
    >
      AI · {label}
    </span>
  )
}
