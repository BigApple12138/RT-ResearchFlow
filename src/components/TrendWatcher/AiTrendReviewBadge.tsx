import React from 'react'
import type { TrendWorkbenchItem } from './trendWorkbenchTypes'

type TrendReview = NonNullable<TrendWorkbenchItem['structureReview']>

const VERDICT_META: Record<TrendReview['verdict'], { label: string; className: string }> = {
  agree: {
    label: '与本地一致',
    className: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300',
  },
  possible_false_break: {
    label: '可能假破位',
    className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  },
  possible_false_hold: {
    label: '可能假守住',
    className: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
  },
  evidence_weak: {
    label: '证据偏弱',
    className: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  need_more_data: {
    label: '需补数据',
    className: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
}

function rationalePrefix(review: TrendReview): string {
  if (review.verdict !== 'need_more_data') return ''
  return review.source === 'gate' ? '本地门槛：' : 'AI 第二意见：'
}

function displayRationale(review: TrendReview): string | null {
  const trimmed = review.rationale.trim()
  if (!trimmed) return null
  return `${rationalePrefix(review)}${trimmed}`
}

function formatSignedDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta)
}

function scoreDeltaLabel(review: TrendReview): string | null {
  if (review.aiScoreStatus !== 'scored' || review.localScore == null || review.impliedScore == null || review.aiScoreDelta == null) {
    return null
  }
  return `本地 ${review.localScore} · AI ${review.impliedScore}（${formatSignedDelta(review.aiScoreDelta)}）`
}

export function AiTrendReviewBadge({ review, stockCode }: { review: TrendReview; stockCode: string }) {
  const meta = VERDICT_META[review.verdict]
  const label = review.stale ? '需重核' : meta.label
  const className = review.stale
    ? 'border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
    : meta.className
  const rationaleText = displayRationale(review)
  const focusPoints = review.focusPoints.filter((point) => point.trim().length > 0).slice(0, 3)
  const scoreLabel = scoreDeltaLabel(review)
  const scoreRationale = review.aiScoreStatus === 'scored' ? review.aiScoreRationale?.trim() || null : null
  const showUnscoredHint = review.aiScoreStatus === 'skipped' || review.aiScoreStatus === 'invalid'
  const title = review.stale
    ? '当前行情或评分事实已变化，请重新复核。'
    : (scoreLabel ?? rationaleText ?? undefined)
  const hasExplain = Boolean(rationaleText)
    || focusPoints.length > 0
    || review.stale
    || Boolean(scoreLabel)
    || showUnscoredHint

  return (
    <span className="inline-flex max-w-[16rem] flex-col gap-0.5 align-top">
      <span
        data-testid={`trend-ai-review-badge-${stockCode}`}
        data-state={review.verdict}
        data-stale={review.stale ? 'true' : 'false'}
        data-source={review.source}
        data-ai-score-status={review.aiScoreStatus}
        title={title}
        aria-label={`AI复核：${label}${scoreLabel ? `；模型意见 ${scoreLabel}` : ''}${rationaleText ? `；${rationaleText}` : ''}`}
        className={`inline-flex w-fit rounded border px-2 py-0.5 text-[11px] font-medium ${className}`}
      >
        AI · {label}
      </span>
      {scoreLabel && (
        <span
          data-testid={`trend-ai-score-delta-${stockCode}`}
          title={scoreRationale ?? '模型锚定偏差意见，非投资建议'}
          className="inline-flex w-fit rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
        >
          模型意见 · {scoreLabel}
        </span>
      )}
      {hasExplain && (
        <span
          data-testid={`trend-ai-review-explain-${stockCode}`}
          className="flex flex-col gap-0.5 text-[10px] leading-snug text-slate-500 dark:text-slate-400"
        >
          {review.stale && (
            <span data-testid={`trend-ai-review-stale-hint-${stockCode}`}>
              事实已变化，请重新复核
            </span>
          )}
          {showUnscoredHint && !scoreLabel && (
            <span data-testid={`trend-ai-score-unscored-${stockCode}`}>
              偏差未评
            </span>
          )}
          {scoreRationale && (
            <span
              data-testid={`trend-ai-score-rationale-${stockCode}`}
              title={scoreRationale}
              className="line-clamp-1"
            >
              {scoreRationale}
            </span>
          )}
          {rationaleText && (
            <span
              data-testid={`trend-ai-review-rationale-${stockCode}`}
              title={rationaleText}
              className="line-clamp-1"
            >
              {rationaleText}
            </span>
          )}
          {focusPoints.length > 0 && (
            <ul className="m-0 list-none space-y-0.5 p-0">
              {focusPoints.map((point, index) => (
                <li
                  key={`${index}-${point}`}
                  data-testid={`trend-ai-review-focus-${stockCode}-${index}`}
                  title={point}
                  className="line-clamp-1 before:content-['·_']"
                >
                  {point}
                </li>
              ))}
            </ul>
          )}
        </span>
      )}
    </span>
  )
}
