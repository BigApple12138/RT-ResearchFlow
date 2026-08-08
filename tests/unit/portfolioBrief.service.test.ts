import { describe, expect, it } from 'vitest'
import {
  buildPortfolioBriefFacts,
  formatAiConfigCheckMessage,
  formatEmptyPortfolioMessage,
  formatPortfolioListMessage,
} from '../../electron/main/services/portfolioBriefService'

describe('portfolioBriefService', () => {
  it('持仓事实包不包含成本价', () => {
    const facts = buildPortfolioBriefFacts(
      [{ tsCode: '600519.SH', stockName: '贵州茅台', costPrice: 1400 }],
      new Map([['600519.SH', { price: 1500, change: 1.2, todaySignalCount: 2 }]]),
    )
    expect(facts).toEqual([{
      tsCode: '600519.SH',
      stockName: '贵州茅台',
      price: 1500,
      change: 1.2,
      todaySignalCount: 2,
    }])
    expect(JSON.stringify(facts)).not.toMatch(/costPrice/i)
  })

  it('空持仓文案区分已缓存与持仓', () => {
    const text = formatEmptyPortfolioMessage()
    expect(text).toContain('尚未添加持仓')
    expect(text).toContain('已缓存个股')
    expect(text).toContain('+ 持仓')
  })

  it('列持仓不输出成本价', () => {
    const text = formatPortfolioListMessage([
      { tsCode: '000001.SZ', stockName: '平安银行', costPrice: 12 },
    ])
    expect(text).toContain('平安银行')
    expect(text).toContain('000001.SZ')
    expect(text).not.toContain('costPrice')
    expect(text).not.toMatch(/\b12\b/)
  })

  it('配置检查反映是否已配置 Key', () => {
    expect(formatAiConfigCheckMessage({
      hasApiKey: false,
      provider: null,
      model: null,
      configuredProviders: [],
    })).toContain('尚未配置')
    expect(formatAiConfigCheckMessage({
      hasApiKey: true,
      provider: 'chatgpt',
      model: 'gpt-5.6-sol',
      configuredProviders: ['chatgpt'],
    })).toContain('AI 已配置')
  })
})
