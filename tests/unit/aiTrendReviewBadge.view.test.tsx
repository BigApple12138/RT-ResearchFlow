import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AiTrendReviewBadge } from '../../src/components/TrendWatcher/AiTrendReviewBadge'
import type { TrendWorkbenchItem } from '../../src/components/TrendWatcher/trendWorkbenchTypes'

type TrendReview = NonNullable<TrendWorkbenchItem['structureReview']>

function review(partial: Partial<TrendReview> & Pick<TrendReview, 'verdict' | 'source'>): TrendReview {
  return {
    rationale: '',
    focusPoints: [],
    stale: false,
    scoreDate: '20260808',
    factsHash: 'a'.repeat(64),
    createdAt: 1,
    ...partial,
  }
}

describe('AiTrendReviewBadge 可见解释', () => {
  it('不悬停即可看到 rationale 与最多 3 条 focusPoints', () => {
    const output = renderToStaticMarkup(createElement(AiTrendReviewBadge, {
      stockCode: '600001',
      review: review({
        verdict: 'agree',
        source: 'model',
        rationale: '结构仍完整。',
        focusPoints: ['观察量价背离', '关注回撤', '第三点', '不应出现'],
      }),
    }))

    expect(output).toContain('data-testid="trend-ai-review-badge-600001"')
    expect(output).toContain('data-testid="trend-ai-review-rationale-600001"')
    expect(output).toContain('结构仍完整。')
    expect(output).toContain('data-testid="trend-ai-review-focus-600001-0"')
    expect(output).toContain('观察量价背离')
    expect(output).toContain('data-testid="trend-ai-review-focus-600001-2"')
    expect(output).not.toContain('不应出现')
    expect(output).not.toContain('data-testid="trend-ai-review-focus-600001-3"')
  })

  it('无 rationale 与 focusPoints 时仅保留徽章', () => {
    const output = renderToStaticMarkup(createElement(AiTrendReviewBadge, {
      stockCode: '600002',
      review: review({ verdict: 'agree', source: 'model', rationale: '  ', focusPoints: [] }),
    }))

    expect(output).toContain('data-testid="trend-ai-review-badge-600002"')
    expect(output).not.toContain('data-testid="trend-ai-review-explain-600002"')
    expect(output).not.toContain('data-testid="trend-ai-review-rationale-600002"')
  })

  it('need_more_data 本地门槛与 AI 第二意见前缀可区分', () => {
    const gate = renderToStaticMarkup(createElement(AiTrendReviewBadge, {
      stockCode: '600003',
      review: review({
        verdict: 'need_more_data',
        source: 'gate',
        rationale: '有效评分权重不足70%，暂不形成趋势结构判断。',
        focusPoints: ['补齐本地行情与评分事实后再复核'],
      }),
    }))
    expect(gate).toContain('需补数据')
    expect(gate).toContain('本地门槛：')
    expect(gate).not.toContain('AI 第二意见：')

    const model = renderToStaticMarkup(createElement(AiTrendReviewBadge, {
      stockCode: '600004',
      review: review({
        verdict: 'need_more_data',
        source: 'model',
        rationale: '证据不足以对抗本地结构标签。',
        focusPoints: [],
      }),
    }))
    expect(model).toContain('需补数据')
    expect(model).toContain('AI 第二意见：')
    expect(model).not.toContain('本地门槛：')
  })

  it('stale 显示需重核提示且保留原解释', () => {
    const output = renderToStaticMarkup(createElement(AiTrendReviewBadge, {
      stockCode: '600005',
      review: review({
        verdict: 'agree',
        source: 'model',
        stale: true,
        rationale: '旧意见。',
        focusPoints: ['旧关注点'],
      }),
    }))

    expect(output).toContain('需重核')
    expect(output).toContain('data-stale="true"')
    expect(output).toContain('事实已变化，请重新复核')
    expect(output).toContain('旧意见。')
    expect(output).toContain('旧关注点')
  })
})
