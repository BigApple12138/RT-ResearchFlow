import type { DailyDslBar, DailyDslBlock, DailyDslConditionEvaluationResult, DailyDslDataStatus } from './types'

export function numParam(block: DailyDslBlock, key: string, fallback: number): number {
  const value = block.params[key]
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

export function strParam(block: DailyDslBlock, key: string, fallback: string): string {
  const value = block.params[key]
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

export function result(
  block: DailyDslBlock,
  passed: boolean,
  score: number,
  message: string,
  evidence: Record<string, unknown> = {},
  dataStatus: DailyDslDataStatus = 'complete',
): DailyDslConditionEvaluationResult {
  return {
    blockId: block.id,
    type: block.type,
    name: block.name,
    passed,
    score,
    weight: block.weight,
    contribution: passed ? (score * block.weight) / 100 : 0,
    params: { ...block.params },
    hardRequired: block.hardRequired === true,
    dataStatus,
    message,
    evidence,
  }
}

export function insufficient(block: DailyDslBlock, message = '日线数据不足'): DailyDslConditionEvaluationResult {
  return result(block, false, 0, message, {}, 'data_insufficient')
}

/** 取截至 asOf（含）的尾部序列；asOf 为空则用最后一根。 */
export function sliceBarsAsOf(bars: DailyDslBar[], asOf?: string | null): DailyDslBar[] {
  if (!asOf) return bars
  return bars.filter((bar) => bar.tradeDate <= asOf)
}

export function smaClose(bars: DailyDslBar[], period: number): number | null {
  if (bars.length < period || period < 1) return null
  const window = bars.slice(-period)
  if (window.some((bar) => bar.close == null || !(bar.close > 0))) return null
  const sum = window.reduce((acc, bar) => acc + (bar.close as number), 0)
  return sum / period
}

export function evaluateDailyCondition(block: DailyDslBlock, bars: DailyDslBar[]): DailyDslConditionEvaluationResult {
  if (!block.enabled) return result(block, true, 100, '条件已停用')
  if (bars.length === 0) return insufficient(block)

  if (block.type === 'daily_pct_chg') {
    const lookback = Math.max(1, Math.floor(numParam(block, 'lookbackDays', 5)))
    const minPct = numParam(block, 'minPctChg', 3)
    if (bars.length < lookback + 1) return insufficient(block, `需要至少 ${lookback + 1} 根日线`)
    const end = bars[bars.length - 1]
    const start = bars[bars.length - 1 - lookback]
    if (end.close == null || start.close == null || !(start.close > 0)) {
      return insufficient(block, '收盘价缺失，无法计算累计涨跌幅')
    }
    const pct = ((end.close - start.close) / start.close) * 100
    const passed = pct >= minPct
    const score = Math.min(100, Math.max(0, (pct / Math.max(Math.abs(minPct), 0.01)) * 100))
    return result(block, passed, score, passed ? '累计涨跌幅达标' : '累计涨跌幅不足', {
      lookbackDays: lookback,
      startDate: start.tradeDate,
      endDate: end.tradeDate,
      startClose: start.close,
      endClose: end.close,
      actualPctChg: Number(pct.toFixed(4)),
      minPctChg: minPct,
    })
  }

  if (block.type === 'daily_ma_cross') {
    const period = Math.max(2, Math.floor(numParam(block, 'maPeriod', 20)))
    const side = strParam(block, 'side', 'above')
    const last = bars[bars.length - 1]
    if (last.close == null || !(last.close > 0)) return insufficient(block, '收盘价缺失')
    const ma = smaClose(bars, period)
    if (ma == null) return insufficient(block, `均线 SMA(${period}) 数据不足`)
    const above = last.close >= ma
    const passed = side === 'below' ? !above : above
    const distancePct = ((last.close - ma) / ma) * 100
    const score = Math.min(100, Math.max(0, 50 + distancePct * (side === 'below' ? -1 : 1) * 5))
    return result(block, passed, score, passed ? '均线位置达标' : '均线位置未达标', {
      maPeriod: period,
      side,
      close: last.close,
      ma: Number(ma.toFixed(4)),
      distancePct: Number(distancePct.toFixed(4)),
    })
  }

  if (block.type === 'daily_volume_ratio') {
    const baselineDays = Math.max(2, Math.floor(numParam(block, 'baselineDays', 5)))
    const minRatio = numParam(block, 'minRatio', 1.5)
    if (bars.length < baselineDays + 1) return insufficient(block, `需要至少 ${baselineDays + 1} 根日线`)
    const last = bars[bars.length - 1]
    if (last.vol == null || !(last.vol > 0)) return insufficient(block, '成交量缺失')
    const baseline = bars.slice(-(baselineDays + 1), -1)
    if (baseline.some((bar) => bar.vol == null || !(bar.vol >= 0))) {
      return insufficient(block, '均量基准日成交量缺失')
    }
    const avgVol = baseline.reduce((sum, bar) => sum + (bar.vol as number), 0) / baselineDays
    if (!(avgVol > 0)) return insufficient(block, '均量基准为 0')
    const ratio = last.vol / avgVol
    const passed = ratio >= minRatio
    const score = Math.min(100, Math.max(0, (ratio / Math.max(minRatio, 0.01)) * 100))
    return result(block, passed, score, passed ? '量比达标' : '量比不足', {
      baselineDays,
      lastVol: last.vol,
      avgVol: Number(avgVol.toFixed(2)),
      actualRatio: Number(ratio.toFixed(4)),
      minRatio,
    })
  }

  if (block.type === 'daily_turnover_min') {
    const minTurnover = numParam(block, 'minTurnoverRate', 1)
    const last = bars[bars.length - 1]
    if (last.turnoverRate == null || !Number.isFinite(last.turnoverRate)) {
      return insufficient(block, '换手率缺失')
    }
    const passed = last.turnoverRate >= minTurnover
    const score = Math.min(100, Math.max(0, (last.turnoverRate / Math.max(minTurnover, 0.01)) * 100))
    return result(block, passed, score, passed ? '换手率达标' : '换手率不足', {
      turnoverRate: last.turnoverRate,
      minTurnoverRate: minTurnover,
    })
  }

  return insufficient(block, `未知日线条件类型`)
}
