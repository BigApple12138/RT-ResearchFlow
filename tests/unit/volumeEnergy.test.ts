import { describe, expect, it } from 'vitest'
import {
  computeNear5dVolumeChangePercent,
  computeVolumeRatioVsPrior20,
} from '../../src/utils/volumeEnergy'

describe('volumeEnergy', () => {
  it('近5日量能变化：近5日 vol 均值相对前5日均值上涨', () => {
    // 前5日均量 100，近5日均量 150 → +50%
    const volumes = [100, 100, 100, 100, 100, 150, 150, 150, 150, 150]
    expect(computeNear5dVolumeChangePercent(volumes)).toBeCloseTo(50, 5)
  })

  it('近5日量能变化：缩量返回负值', () => {
    const volumes = [200, 200, 200, 200, 200, 100, 100, 100, 100, 100]
    expect(computeNear5dVolumeChangePercent(volumes)).toBeCloseTo(-50, 5)
  })

  it('近5日量能变化：样本不足返回 null', () => {
    expect(computeNear5dVolumeChangePercent([1, 2, 3, 4, 5])).toBeNull()
    expect(computeNear5dVolumeChangePercent([])).toBeNull()
  })

  it('近5日量能变化：窗内有效样本不足3个则 null，且不用0冒充缺失', () => {
    const volumes = [
      null, null, null, null, null,
      100, 100, 100, 100, 100,
    ]
    expect(computeNear5dVolumeChangePercent(volumes)).toBeNull()
  })

  it('近5日量能变化：忽略 null，仅用有限样本；不受 amount 影响（输入仅为 vol）', () => {
    // 前5：100×4 有效；近5：200×4 有效 → +100%
    const volumes = [
      100, 100, 100, 100, null,
      200, 200, 200, 200, null,
    ]
    expect(computeNear5dVolumeChangePercent(volumes)).toBeCloseTo(100, 5)
  })

  it('量比：最新 vol / 近20日（不含当日）均量', () => {
    const prior = Array.from({ length: 20 }, () => 100)
    const volumes = [...prior, 200]
    expect(computeVolumeRatioVsPrior20(volumes)).toBeCloseTo(2, 5)
  })

  it('量比：先验样本不足20则 null', () => {
    const volumes = Array.from({ length: 20 }, () => 100)
    expect(computeVolumeRatioVsPrior20(volumes)).toBeNull()
  })

  it('量比：最新缺失或先验均量为0则 null', () => {
    const prior = Array.from({ length: 20 }, () => 0)
    expect(computeVolumeRatioVsPrior20([...prior, 100])).toBeNull()
    expect(computeVolumeRatioVsPrior20([...Array.from({ length: 20 }, () => 100), null])).toBeNull()
  })
})
