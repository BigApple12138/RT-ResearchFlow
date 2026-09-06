import { describe, expect, it } from 'vitest'
import { evaluateDailyCondition } from '../../electron/main/services/dailyDsl/dailyConditions'
import { evaluateDailyDslTemplate } from '../../electron/main/services/dailyDsl/dailyDslEvaluator'
import {
  createDefaultDailyDslTemplate,
  type DailyDslBar,
  type DailyDslBlock,
  type DailyDslGroup,
} from '../../electron/main/services/dailyDsl/types'

function bar(tradeDate: string, close: number, extras: Partial<DailyDslBar> = {}): DailyDslBar {
  return {
    tradeDate,
    open: close,
    high: close,
    low: close,
    close,
    pctChg: 0,
    vol: 1000,
    turnoverRate: 2,
    ...extras,
  }
}

function block(partial: Partial<DailyDslBlock> & Pick<DailyDslBlock, 'type' | 'params'>): DailyDslBlock {
  return {
    id: partial.id ?? partial.type,
    name: partial.name ?? partial.type,
    description: '',
    enabled: partial.enabled ?? true,
    weight: partial.weight ?? 10,
    hardRequired: partial.hardRequired,
    type: partial.type,
    params: partial.params,
  }
}

describe('dailyDsl', () => {
  it('daily_pct_chg 计算累计涨跌幅', () => {
    const bars = [
      bar('20260801', 100),
      bar('20260802', 102),
      bar('20260803', 105),
      bar('20260804', 108),
      bar('20260805', 110),
      bar('20260806', 112),
    ]
    const ok = evaluateDailyCondition(block({
      type: 'daily_pct_chg',
      params: { lookbackDays: 5, minPctChg: 10 },
    }), bars)
    expect(ok.passed).toBe(true)
    expect(ok.evidence.actualPctChg).toBeCloseTo(12, 1)

    const fail = evaluateDailyCondition(block({
      type: 'daily_pct_chg',
      params: { lookbackDays: 5, minPctChg: 20 },
    }), bars)
    expect(fail.passed).toBe(false)
  })

  it('缺收盘价标记 data_insufficient，不作 NOT 反证通过', () => {
    const bars = [bar('20260801', 10), { ...bar('20260802', 11), close: null }]
    const leaf = evaluateDailyCondition(block({
      type: 'daily_pct_chg',
      params: { lookbackDays: 1, minPctChg: 1 },
    }), bars)
    expect(leaf.dataStatus).toBe('data_insufficient')
    expect(leaf.passed).toBe(false)

    const root: DailyDslGroup = {
      id: 'root',
      operator: 'NOT',
      enabled: true,
      children: [block({
        type: 'daily_pct_chg',
        params: { lookbackDays: 1, minPctChg: 1 },
      })],
    }
    const template = {
      ...createDefaultDailyDslTemplate(),
      root,
      executionMode: 'strict' as const,
    }
    const evalResult = evaluateDailyDslTemplate(template, bars)
    expect(evalResult.dataStatus).toBe('data_insufficient')
    expect(evalResult.passed).toBe(false)
  })

  it('daily_ma_cross / volume_ratio / turnover', () => {
    const bars: DailyDslBar[] = []
    for (let i = 1; i <= 25; i += 1) {
      bars.push(bar(`202608${String(i).padStart(2, '0')}`, 100 + i, {
        vol: i === 25 ? 5000 : 1000,
        turnoverRate: i === 25 ? 3 : 0.5,
      }))
    }
    expect(evaluateDailyCondition(block({
      type: 'daily_ma_cross',
      params: { maPeriod: 20, side: 'above' },
    }), bars).passed).toBe(true)

    expect(evaluateDailyCondition(block({
      type: 'daily_volume_ratio',
      params: { baselineDays: 5, minRatio: 2 },
    }), bars).passed).toBe(true)

    expect(evaluateDailyCondition(block({
      type: 'daily_turnover_min',
      params: { minTurnoverRate: 2 },
    }), bars).passed).toBe(true)
  })

  it('默认模板 AND 组合可命中', () => {
    const bars: DailyDslBar[] = []
    for (let i = 1; i <= 30; i += 1) {
      bars.push(bar(`202607${String(Math.min(i, 31)).padStart(2, '0')}`, 90 + i * 0.5))
    }
    // fix dates to be monotonic YYYYMMDD
    const fixed = bars.map((item, index) => ({
      ...item,
      tradeDate: `202607${String(index + 1).padStart(2, '0')}`,
      close: 90 + index,
    }))
    const result = evaluateDailyDslTemplate(createDefaultDailyDslTemplate(), fixed)
    expect(result.flatConditions.length).toBe(2)
    expect(result.passed).toBe(true)
  })
})
