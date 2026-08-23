/**
 * 走势预测证据包：分时量价主包 + Tushare 日频因子 ensure + grounding 文案。
 * Spec: docs/superpowers/specs/2026-08-11-forecast-grounded-intraday-design.md
 */

import type Database from 'better-sqlite3'
import { getStockMinuteByDate } from '../database/stockMinuteCacheRepository'
import { queryLatestFactor } from '../database/stkFactorCacheRepository'
import type { StockMinuteCacheRow } from '../database/types'
import { refreshStockMinuteOnce } from './schedulerService'
import { fetchIntradayData } from './tushareService'
import { loadStockFactorWithStaleRefresh } from './stkFactorEnsureService'
import { summarizeIntradayVolumeEnergy } from './volumeContextSummary'

/** FR-072: 默认今日预测提示（接地：不催模型假装联网终端） */
export const DEFAULT_TREND_TODAY_PROMPT =
  '我将提供给你以下信息：股票代码、今天大盘（上证指数）的分时走势数据、这支股票所属板块指数的分时走势数据、该股当日分时/分钟量价（含成交量，若有则含成交额），以及本地已准备的技术因子与其它摘要（若本包提供）。' +
  '请你**仅基于本消息已提供的数据**，综合分析并预测该股票今日剩余交易时段（至15:00收盘）的价格走势。' +
  '跳过11:30至13:00的午休时段。' +
  '当各指标出现矛盾信号时（如MACD趋势向上但RSI6或KDJ已进入超买区），必须明确指出矛盾并倾向于保守判断，不得凭借单一指标的信号主导结论。' +
  '不要编造未提供的基本面年报细节；若本包未给基本面字段，写「本包未提供」即可。'

/** FR-072: 默认明日预测提示 */
export const DEFAULT_TREND_MORROW_PROMPT =
  '我将提供给你以下信息：股票代码、今日分时/分钟量价、今日大盘及板块分时、近30日日线OHLCV与量能摘要，以及本地已准备的技术因子与其它摘要（若本包提供）。' +
  '请你**仅基于本消息已提供的数据**，综合预测明日09:30至15:00的价格走势。' +
  '跳过11:30至13:00的午休时段。' +
  '当各指标出现矛盾信号时（如MACD趋势向上但RSI6或KDJ已进入超买区），必须明确指出矛盾并倾向于保守判断，不得凭借单一指标的信号主导结论。' +
  '不要编造未提供的基本面年报细节；若本包未给基本面字段，写「本包未提供」即可。'

export const FORECAST_GROUNDING_RULES =
  '\n\n【分析硬约束·必读】\n' +
  '1. 只使用本消息中已给出的分时/分钟、大盘板块、日线、技术因子与其它摘要；禁止声称正在访问东方财富/同花顺等实时终端。\n' +
  '2. 理由中必须引用本包中的量价事实（成交量；若有成交额/换手/量比亦须讨论）；若某字段标注「本包未提供」，不得编造数值。\n' +
  '3. 技术因子若存在，须标明其为日频收盘口径，不得写成盘中秒级实时指标。\n' +
  '4. 禁止用「我无法联网所以只能…」开场后大段灌水基本面；缺数据就短写缺数，把篇幅留给量价与已给因子。\n'

export type ForecastFactorEnsureStatus = 'cached' | 'fetched' | 'missing' | 'disabled'

export interface ForecastIntradayEvidence {
  ok: true
  intradayLabel: string
  intradayJson: string
  volumeSummary: string
  dataPointCount: number
  dataLabel: string
}

export interface ForecastIntradayEvidenceFailure {
  ok: false
  error: { code: 'INTRADAY_EMPTY'; message: string }
}

function getBjTodayYmd(): string {
  const bj = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return (
    `${bj.getUTCFullYear()}` +
    `${String(bj.getUTCMonth() + 1).padStart(2, '0')}` +
    `${String(bj.getUTCDate()).padStart(2, '0')}`
  )
}

function getBjYesterdayYmd(): string {
  const bj = new Date(Date.now() + 8 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000)
  return (
    `${bj.getUTCFullYear()}` +
    `${String(bj.getUTCMonth() + 1).padStart(2, '0')}` +
    `${String(bj.getUTCDate()).padStart(2, '0')}`
  )
}

/** 分钟行序列化：v=成交量手，a=成交额千元（有则带） */
export function serializeMinuteBarsForPrompt(rows: StockMinuteCacheRow[]): string {
  return JSON.stringify(
    rows.map((r) => {
      const point: Record<string, string | number | null> = {
        t: r.tsMinute,
        o: r.open,
        h: r.high,
        l: r.low,
        c: r.close,
        v: r.vol,
      }
      if (r.amount != null && Number.isFinite(r.amount)) point.a = r.amount
      return point
    }),
  )
}

export function appendForecastGrounding(prompt: string): string {
  if (prompt.includes('【分析硬约束·必读】')) return prompt
  return `${prompt.trimEnd()}${FORECAST_GROUNDING_RULES}`
}

/**
 * 预测前 ensure 日频技术因子：缓存已追上期望交易日则跳过；否则 Tushare 补拉。
 */
export async function ensureStkFactorForForecast(
  db: Database.Database,
  tsCode: string,
): Promise<ForecastFactorEnsureStatus> {
  const marketLatest = (() => {
    try {
      const row = db
        .prepare('SELECT MAX(trade_date) AS d FROM limit_list_daily')
        .get() as { d: string | null } | undefined
      if (row?.d) return row.d
    } catch {
      /* empty */
    }
    return getBjYesterdayYmd()
  })()

  const latest = queryLatestFactor(db, tsCode)
  const result = await loadStockFactorWithStaleRefresh(db, tsCode, undefined, {
    marketLatestTradeDate: marketLatest,
  })
  if (result.ok) {
    if (result.refreshed) return 'fetched'
    return latest ? 'cached' : 'fetched'
  }
  if (result.code === 'TUSHARE_DISABLED') return latest ? 'cached' : 'disabled'
  return latest ? 'cached' : 'missing'
}

export function technicalFactorAbsenceNote(status: ForecastFactorEnsureStatus): string {
  if (status === 'disabled') {
    return '[技术因子摘要] 本包未提供（未启用 Tushare 且本地无缓存）'
  }
  return '[技术因子摘要] 本包未提供（无本地缓存或拉取失败/无权限）'
}

export const TECHNICAL_FACTOR_EOD_NOTE =
  '（说明：以上技术因子为日频收盘口径，非盘中秒级实时。）'

/**
 * 刷新并组装分时主证据：优先分钟 OHLCV 落库；否则东财 5 分钟价量（含 volume）。
 */
export async function prepareForecastIntradayEvidence(
  db: Database.Database,
  stockCode: string,
): Promise<ForecastIntradayEvidence | ForecastIntradayEvidenceFailure> {
  const code = stockCode.trim().replace(/\.(SH|SZ|BJ)$/i, '')
  try {
    await refreshStockMinuteOnce(code)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[forecastEvidence] minute refresh ${code} failed: ${msg}`)
  }

  const bjToday = getBjTodayYmd()
  const minuteRows = getStockMinuteByDate(db, code, bjToday)
  if (minuteRows.length > 0) {
    return {
      ok: true,
      intradayLabel: '今日1分钟K线（t=时间,o=开,h=高,l=低,c=收,v=成交量手,a=成交额千元可选）',
      intradayJson: serializeMinuteBarsForPrompt(minuteRows),
      volumeSummary: summarizeIntradayVolumeEnergy(
        minuteRows.map((r) => ({ volume: r.vol, amount: r.amount })),
      ),
      dataPointCount: minuteRows.length,
      dataLabel: '今日1分钟K线（含量额）',
    }
  }

  const stockItems = await fetchIntradayData(code)
  if (stockItems.length === 0) {
    return {
      ok: false,
      error: { code: 'INTRADAY_EMPTY', message: '当日暂无分时数据' },
    }
  }

  return {
    ok: true,
    intradayLabel: '东财5分钟分时（time,price,volume=成交量手；无完整OHLC）',
    intradayJson: JSON.stringify(
      stockItems.map((i) => ({ time: i.time, price: i.price, volume: i.volume })),
    ),
    volumeSummary: summarizeIntradayVolumeEnergy(
      stockItems.map((i) => ({ volume: i.volume, amount: null })),
    ),
    dataPointCount: stockItems.length,
    dataLabel: '东财5分钟分时（价+量）',
  }
}
