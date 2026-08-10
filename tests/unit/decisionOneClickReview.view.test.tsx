import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  CommandMetric,
  PortfolioRiskMiniPanel,
} from '../../src/components/DecisionCenter/DecisionCenter'

describe('一键复盘相关视图语义', () => {
  it('CommandMetric：有 onClick 时渲染可点 button 与 testid', () => {
    const onClick = vi.fn()
    const output = renderToStaticMarkup(createElement(CommandMetric, {
      label: '复盘积压',
      value: 3,
      hint: '近 30 日待收口',
      tone: 'amber',
      tag: '30日',
      testId: 'decision-metric-review-backlog',
      onClick,
    }))
    expect(output).toContain('data-testid="decision-metric-review-backlog"')
    expect(output).toContain('aria-label="打开历史复盘"')
    expect(output).toMatch(/<button[^>]*type="button"/)
    expect(output).toContain('复盘积压')
  })

  it('CommandMetric：无 onClick 时保持只读 div', () => {
    const output = renderToStaticMarkup(createElement(CommandMetric, {
      label: '高优先级',
      value: 1,
      hint: 'P4+ 未读优先处理',
      tone: 'red',
      tag: 'P4+',
    }))
    expect(output).not.toContain('<button')
    expect(output).toContain('高优先级')
    expect(output).not.toContain('aria-label="打开历史复盘"')
  })

  it('PortfolioRiskMiniPanel：看复盘可点；补成本价不可点开历史', () => {
    const onOpen = vi.fn()
    const lookReview = renderToStaticMarkup(createElement(PortfolioRiskMiniPanel, {
      data: {
        rangeDays: 30,
        totalPortfolio: 1,
        missingCostPrice: 0,
        withRiskSignals: 1,
        unresolvedRiskSignals: 1,
        repeatedRiskSignals: 0,
        items: [],
      },
      loading: false,
      error: null,
      rangeDays: 30,
      onReload: () => {},
      onRangeChange: () => {},
      onOpenReviewHistory: onOpen,
    }))
    expect(lookReview).toContain('看复盘')
    expect(lookReview).toContain('data-testid="decision-suggest-open-review"')
    expect(lookReview).toMatch(/<button[^>]*data-testid="decision-suggest-open-review"/)

    const fillCost = renderToStaticMarkup(createElement(PortfolioRiskMiniPanel, {
      data: {
        rangeDays: 30,
        totalPortfolio: 2,
        missingCostPrice: 2,
        withRiskSignals: 0,
        unresolvedRiskSignals: 0,
        repeatedRiskSignals: 0,
        items: [],
      },
      loading: false,
      error: null,
      rangeDays: 30,
      onReload: () => {},
      onRangeChange: () => {},
      onOpenReviewHistory: onOpen,
    }))
    expect(fillCost).toContain('补成本价')
    expect(fillCost).not.toContain('data-testid="decision-suggest-open-review"')
  })
})
