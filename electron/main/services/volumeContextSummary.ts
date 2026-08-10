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
