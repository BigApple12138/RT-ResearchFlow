/**
 * 量能（成交量）纯计算 — 结构洞察与 AI 摘要共用。
 * 「量能」主度量 = vol/volume（手）；禁止用 0 冒充缺失。
 */

function finite(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value)
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * 近 5 日成交量均值相对前 5 日成交量均值的变化百分比。
 * 各窗至少 3 个有限样本；前窗均量须 > 0。
 */
export function computeNear5dVolumeChangePercent(
  volumes: Array<number | null | undefined>,
): number | null {
  if (volumes.length < 6) return null
  const latest = volumes.slice(-5).filter(finite)
  const previous = volumes.slice(-10, -5).filter(finite)
  if (latest.length < 3 || previous.length < 3) return null
  const latestAverage = average(latest)
  const previousAverage = average(previous)
  return latestAverage != null && previousAverage != null && previousAverage > 0
    ? (latestAverage - previousAverage) / previousAverage * 100
    : null
}

/**
 * 量比观察：最新成交量 / 近 20 日（不含当日）有限均量。
 * 先验窗须满 20 个有限样本；均量须 > 0；最新须有限。
 */
export function computeVolumeRatioVsPrior20(
  volumes: Array<number | null | undefined>,
): number | null {
  if (volumes.length < 21) return null
  const latest = volumes[volumes.length - 1]
  if (!finite(latest)) return null
  const prior = volumes.slice(-21, -1).filter(finite)
  if (prior.length < 20) return null
  const priorAverage = average(prior)
  if (priorAverage == null || priorAverage <= 0) return null
  return latest / priorAverage
}
