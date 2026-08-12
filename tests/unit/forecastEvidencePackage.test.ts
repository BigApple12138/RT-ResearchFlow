import { describe, expect, it } from 'vitest'
import {
  appendForecastGrounding,
  DEFAULT_TREND_TODAY_PROMPT,
  DEFAULT_TREND_MORROW_PROMPT,
  FORECAST_GROUNDING_RULES,
  serializeMinuteBarsForPrompt,
} from '../../electron/main/services/forecastEvidencePackage'
import { summarizeIntradayVolumeEnergy } from '../../electron/main/services/volumeContextSummary'

describe('forecastEvidencePackage grounding', () => {
  it('默认今日/明日提示不再催模型去东财同花顺收集基本面', () => {
    expect(DEFAULT_TREND_TODAY_PROMPT).not.toMatch(/东方财富|同花顺/)
    expect(DEFAULT_TREND_MORROW_PROMPT).not.toMatch(/东方财富|同花顺/)
    expect(DEFAULT_TREND_TODAY_PROMPT).toMatch(/仅基于本消息已提供的数据/)
  })

  it('appendForecastGrounding 追加硬约束且幂等', () => {
    const once = appendForecastGrounding('hello')
    expect(once).toContain('【分析硬约束·必读】')
    expect(once).toContain('成交量')
    expect(appendForecastGrounding(once)).toBe(once)
    expect(FORECAST_GROUNDING_RULES).toMatch(/禁止声称正在访问东方财富/)
  })

  it('serializeMinuteBarsForPrompt 含 v 且有 amount 时含 a', () => {
    const json = serializeMinuteBarsForPrompt([
      {
        stockCode: '002628',
        tradeDate: '20260811',
        tsMinute: '09:31',
        open: 5,
        high: 5.1,
        low: 4.9,
        close: 5.05,
        vol: 1200,
        amount: 600,
        fetchedAt: 1,
      },
    ])
    expect(json).toContain('"v":1200')
    expect(json).toContain('"a":600')
  })
})

describe('summarizeIntradayVolumeEnergy', () => {
  it('无量时诚实缺数', () => {
    expect(summarizeIntradayVolumeEnergy([{ volume: null }])).toMatch(/本包未提供成交量/)
  })

  it('有量时输出累计与近段相对全场', () => {
    const text = summarizeIntradayVolumeEnergy(
      [
        { volume: 100, amount: 10 },
        { volume: 200, amount: 20 },
        { volume: 300, amount: 30 },
        { volume: 400, amount: 40 },
        { volume: 500, amount: 50 },
      ],
      { lastN: 2 },
    )
    expect(text).toMatch(/累计成交量/)
    expect(text).toMatch(/累计成交额/)
    expect(text).toMatch(/近2根均量/)
  })
})
