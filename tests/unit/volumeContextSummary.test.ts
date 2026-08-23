import { describe, expect, it } from 'vitest'
import {
  formatAmountQian,
  formatDailyCsvVolumeCell,
  formatVolumeHand,
  summarizeVolumeEnergy,
} from '../../electron/main/services/volumeContextSummary'

describe('volumeContextSummary', () => {
  it('摘要以成交量(手)为主，近5日量能基于 vol，并声明观察事实非买卖信号', () => {
    const bars = [
      ...Array.from({ length: 5 }, (_, i) => ({
        tradeDate: `2026010${i + 1}`,
        volume: 100,
        amount: 1000,
        close: 10,
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        tradeDate: `2026011${i}`,
        volume: 150,
        amount: 9999,
        close: 11,
      })),
    ]
    const text = summarizeVolumeEnergy(bars)
    expect(text).toContain('成交量')
    expect(text).toContain('手')
    expect(text).toMatch(/近5日量能/)
    expect(text).toContain('+50.00%')
    expect(text).toContain('观察事实')
    expect(text).toContain('非买卖信号')
    // 有限 amount 才附带额；量能仍以成交量为主
    expect(text).toMatch(/成交额：\d/)
  })

  it('缺量写 --，不用 0 冒充', () => {
    const text = summarizeVolumeEnergy([
      { tradeDate: '20260101', volume: null, amount: null, close: 10 },
    ])
    expect(text).toContain('成交量：--')
    expect(text).not.toMatch(/成交量：0(?:\s|手)/)
  })

  it('formatVolumeHand / CSV 单元格一致', () => {
    expect(formatVolumeHand(12345.6)).toBe('12345.6')
    expect(formatVolumeHand(null)).toBe('--')
    expect(formatDailyCsvVolumeCell(100)).toBe('100')
    expect(formatDailyCsvVolumeCell(undefined)).toBe('')
  })

  it('formatAmountQian 缺失为 --', () => {
    expect(formatAmountQian(null)).toBe('--')
    expect(formatAmountQian(1234.5)).toBe('1234.5')
  })
})
