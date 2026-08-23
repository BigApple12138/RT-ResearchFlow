import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('今日看板一键复盘入口契约（方案 3）', () => {
  const decision = source('src/components/DecisionCenter/DecisionCenter.tsx')
  const readme = source('src/components/DecisionCenter/README.md')

  it('一键复盘常显：testid 在组合守卫外，可见文案为「一键复盘」', () => {
    const footerStart = decision.indexOf('data-testid="decision-command-footer"')
    const portfolioGuard = decision.indexOf('{isPortfolioView && (', footerStart)
    const oneClick = decision.indexOf('data-testid="decision-generate-daily-review"', footerStart)
    expect(footerStart).toBeGreaterThan(-1)
    expect(oneClick).toBeGreaterThan(footerStart)
    expect(portfolioGuard).toBeGreaterThan(oneClick)
    expect(decision).toContain('一键复盘')

    const buttonSlice = decision.slice(oneClick, oneClick + 900)
    expect(buttonSlice).toContain('一键复盘')
    expect(buttonSlice).not.toContain('生成今日复盘')
    expect(buttonSlice).toContain('handleGenerateDailyReview')
  })

  it('组合视图仍保留周报 / 历史复盘 / 判断记录在守卫内', () => {
    const footerStart = decision.indexOf('data-testid="decision-command-footer"')
    const portfolioGuard = decision.indexOf('{isPortfolioView && (', footerStart)
    const weekly = decision.indexOf('data-testid="decision-generate-weekly-review"', footerStart)
    const history = decision.indexOf('data-testid="decision-review-report-history"', footerStart)
    const judgment = decision.indexOf('data-testid="decision-judgment-history"', footerStart)
    expect(portfolioGuard).toBeGreaterThan(-1)
    expect(weekly).toBeGreaterThan(portfolioGuard)
    expect(history).toBeGreaterThan(portfolioGuard)
    expect(judgment).toBeGreaterThan(portfolioGuard)
  })

  it('复盘积压接到待复盘抽屉；看复盘仍接历史复盘', () => {
    expect(decision).toContain('decision-metric-review-backlog')
    expect(decision).toContain('decision-suggest-open-review')
    expect(decision).toContain('openCommandMetric')
    expect(decision).toContain("setReviewHintsTab('pending')")
    expect(decision).toContain('setReviewHintsOpen(true)')
    expect(decision).toContain('summary.unresolved')
    expect(decision).toContain('setReviewReportHistoryOpen(true)')
    expect(decision).toContain('review-hints-batch-resolve')
    expect(decision).toContain('有效收口')
    expect(decision).toContain('噪音忽略')
    expect(decision).toContain('decision-metric-high-priority')
    expect(decision).toContain('decision-metric-portfolio-risk')
    expect(decision).toContain('decision-metric-short-term')
    expect(decision).toMatch(/label:\s*'复盘积压'[\s\S]*?testId:\s*'decision-metric-review-backlog'|testId:\s*'decision-metric-review-backlog'[\s\S]*?label:\s*'复盘积压'/)
  })

  it('README 写明一键复盘常显、看复盘进历史、积压进待复盘', () => {
    expect(readme).toContain('一键复盘')
    expect(readme).toMatch(/看复盘.*历史复盘|历史复盘.*看复盘/)
    expect(readme).toMatch(/复盘积压.*待复盘|待复盘.*复盘积压/)
    expect(readme).toMatch(/四指标卡均可点|指挥区四卡均可点击/)
  })
})
