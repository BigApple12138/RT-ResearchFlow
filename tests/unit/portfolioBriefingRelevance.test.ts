import { describe, expect, it } from 'vitest'
import {
  buildPortfolioRelevanceTerms,
  escapeLikePattern,
  matchBriefingRelevance,
} from '../../electron/main/services/portfolioBriefingRelevance'

describe('portfolioBriefingRelevance', () => {
  it('builds name / six-digit / tsCode terms and skips short names', () => {
    const terms = buildPortfolioRelevanceTerms([
      { tsCode: '600519.SH', stockName: '贵州茅台' },
      { tsCode: '000001.SZ', stockName: 'A' },
    ])
    const direct = terms.filter((t) => t.kind === 'direct').map((t) => t.term)
    expect(direct).toContain('贵州茅台')
    expect(direct).toContain('600519')
    expect(direct).toContain('600519.SH')
    expect(direct).not.toContain('A')
  })

  it('matches direct hits before chain peers', () => {
    const terms = buildPortfolioRelevanceTerms([{ tsCode: '300750.SZ', stockName: '宁德时代' }])
    const direct = matchBriefingRelevance(
      { title: '宁德时代扩产', summary: '动力电池' },
      terms,
    )
    expect(direct?.kind).toBe('direct')
    expect(direct?.hits[0]).toBe('宁德时代')

    const peerOnly = matchBriefingRelevance(
      { title: '产业链观察', summary: terms.find((t) => t.kind === 'chain_peer')?.term ?? '无' },
      terms.filter((t) => t.kind === 'chain_peer'),
    )
    if (terms.some((t) => t.kind === 'chain_peer')) {
      expect(peerOnly?.kind).toBe('chain_peer')
    }
  })

  it('returns null for unrelated text', () => {
    const terms = buildPortfolioRelevanceTerms([{ tsCode: '600519.SH', stockName: '贵州茅台' }])
    expect(matchBriefingRelevance({ title: '天气转暖', summary: '出行增加' }, terms)).toBeNull()
  })

  it('escapes LIKE wildcards', () => {
    expect(escapeLikePattern('100%_a\\b')).toBe('100\\%\\_a\\\\b')
  })
})
