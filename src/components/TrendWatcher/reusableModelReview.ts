import type { TrendWorkbenchItem } from './trendWorkbenchTypes'

/** 可复用本地模型复核：未 stale 且 source=model（有 provider/model）。 */
export function isReusableModelStructureReview(
  review: TrendWorkbenchItem['structureReview'] | null | undefined,
): boolean {
  return Boolean(review && !review.stale && review.source === 'model')
}

export function countReusableModelReviews(
  items: Array<Pick<TrendWorkbenchItem, 'tsCode' | 'structureReview'>>,
  tsCodes: string[],
): number {
  const byCode = new Map(items.map((item) => [item.tsCode, item]))
  let count = 0
  for (const code of tsCodes) {
    const item = byCode.get(code)
    if (item && isReusableModelStructureReview(item.structureReview)) count += 1
  }
  return count
}
