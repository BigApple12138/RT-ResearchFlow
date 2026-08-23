import { describe, expect, it } from 'vitest'
import { countReusableModelReviews, isReusableModelStructureReview } from '../../src/components/TrendWatcher/reusableModelReview'
import type { TrendWorkbenchItem } from '../../src/components/TrendWatcher/trendWorkbenchTypes'

function review(
  overrides: Partial<NonNullable<TrendWorkbenchItem['structureReview']>> = {},
): NonNullable<TrendWorkbenchItem['structureReview']> {
  return {
    verdict: 'agree',
    rationale: '结构完整',
    focusPoints: [],
    stale: false,
    scoreDate: '20260808',
    factsHash: 'a'.repeat(64),
    createdAt: 1_000,
    source: 'model',
    ...overrides,
  }
}

describe('reusableModelReview', () => {
  it('仅未 stale 的 model 结论算可复用', () => {
    expect(isReusableModelStructureReview(review())).toBe(true)
    expect(isReusableModelStructureReview(review({ stale: true }))).toBe(false)
    expect(isReusableModelStructureReview(review({ source: 'gate' }))).toBe(false)
    expect(isReusableModelStructureReview(null)).toBe(false)
  })

  it('批量只统计选中且可复用的只数', () => {
    const items = [
      { tsCode: '600000.SH', structureReview: review() },
      { tsCode: '600001.SH', structureReview: review({ source: 'gate' }) },
      { tsCode: '600002.SH', structureReview: review({ stale: true }) },
      { tsCode: '600003.SH', structureReview: null },
    ]
    expect(countReusableModelReviews(items, ['600000.SH', '600001.SH', '600002.SH', '600003.SH'])).toBe(1)
    expect(countReusableModelReviews(items, ['600001.SH', '600002.SH'])).toBe(0)
  })
})
