/**
 * AI / Markdown 量能上下文摘要（主口径 = 成交量手）。
 * 计算委托 src/utils/volumeEnergy，避免与结构洞察公式漂移。
 */

import {
  computeNear5dVolumeChangePercent,
  computeVolumeRatioVsPrior20,
} from '../../../src/utils/volumeEnergy'

export interface VolumeContextBar {
  tradeDate: string
  volume: number | null | undefined
  amount?: number | null | undefined
  close?: number | null | undefined
}

function finite(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value)
}

export function formatVolumeHand(value: number | null | undefined): string {
  if (!finite(value)) return '--'
  return Number(value.toFixed(3)).toString()
}

export function formatAmountQian(value: number | null | undefined): string {
  if (!finite(value)) return '--'
  return Number(value.toFixed(3)).toString()
}

/** 日线 CSV「量」列：缺失写空串（与现有 forecast CSV 兼容），有值写数字。 */
export function formatDailyCsvVolumeCell(volume: number | null | undefined): string {
  if (!finite(volume)) return ''
  return Number(volume.toFixed(3)).toString()
}

function formatSignedPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '--'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

/**
 * 紧凑量能事实，供 Round2 / 事实底稿 / 预测 prompt 旁注。
 * 量能 = 成交量(手)；成交额(千元)可选附带。
 */
export function summarizeVolumeEnergy(bars: VolumeContextBar[]): string {
  const volumes = bars.map((bar) => bar.volume)
  const latest = bars.at(-1)
  const latestVol = latest?.volume
  const latestAmount = latest?.amount
  const change = computeNear5dVolumeChangePercent(volumes)
  const ratio = computeVolumeRatioVsPrior20(volumes)

  const lines = [
    `- 量能摘要（成交量/手，观察事实、非买卖信号）：最新成交量：${formatVolumeHand(latestVol)}手` +
      (finite(latestAmount)
        ? `；最新成交额：${formatAmountQian(latestAmount)}千元`
        : ''),
    `- 近5日量能变化（近5日成交量均值 vs 前5日）：${formatSignedPercent(change)}`,
  ]
  if (ratio != null) {
    lines.push(`- 量比观察（最新成交量/近20日均量，不含当日）：${ratio.toFixed(2)}`)
  }
  return lines.join('\n')
}

export interface IntradayVolumeBar {
  volume: number | null | undefined
  amount?: number | null | undefined
}

/**
 * 盘中分时/分钟量能摘要（成交量手；成交额千元可选）。
 * 近5根均量 vs 全场均量，仅作观察事实。
 */
export function summarizeIntradayVolumeEnergy(bars: IntradayVolumeBar[], options?: { lastN?: number }): string {
  const lastN = options?.lastN ?? 5
  const vols = bars.map((bar) => (finite(bar.volume) ? bar.volume : null))
  const valid = vols.filter((v): v is number => v != null)
  if (valid.length === 0) {
    return '- 盘中量能摘要：本包未提供成交量'
  }
  const totalVol = valid.reduce((s, v) => s + v, 0)
  const amounts = bars.map((bar) => (finite(bar.amount) ? bar.amount : null)).filter((v): v is number => v != null)
  const totalAmount = amounts.length > 0 ? amounts.reduce((s, v) => s + v, 0) : null
  const sessionAvg = totalVol / valid.length
  const tail = valid.slice(-Math.min(lastN, valid.length))
  const tailAvg = tail.reduce((s, v) => s + v, 0) / tail.length
  const vsSession = sessionAvg > 0 ? ((tailAvg / sessionAvg) - 1) * 100 : null

  const lines = [
    `- 盘中量能摘要（成交量/手，观察事实、非买卖信号）：累计成交量：${formatVolumeHand(totalVol)}手` +
      (totalAmount != null ? `；累计成交额：${formatAmountQian(totalAmount)}千元` : ''),
    `- 近${tail.length}根均量：${formatVolumeHand(tailAvg)}手；全场均量：${formatVolumeHand(sessionAvg)}手` +
      (vsSession != null ? `；近段相对全场：${formatSignedPercent(vsSession)}` : ''),
  ]
  return lines.join('\n')
}
