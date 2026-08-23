import { describe, expect, it } from 'vitest'
import { deriveTrendReviewSource } from '../../electron/main/services/trendStructureReviewTypes'

describe('deriveTrendReviewSource', () => {
  it('provider 与 model 皆空时为 gate，否则为 model', () => {
    expect(deriveTrendReviewSource(null, null)).toBe('gate')
    expect(deriveTrendReviewSource(undefined, undefined)).toBe('gate')
    expect(deriveTrendReviewSource('qwen', null)).toBe('model')
    expect(deriveTrendReviewSource(null, 'test-model')).toBe('model')
    expect(deriveTrendReviewSource('qwen', 'test-model')).toBe('model')
  })
})
