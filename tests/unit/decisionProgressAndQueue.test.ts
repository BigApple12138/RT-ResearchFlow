import { describe, expect, it } from 'vitest'
import { buildDecisionActionQueue } from '../../src/components/DecisionCenter/decisionActionQueue'
import { buildDecisionProgressModel } from '../../src/components/DecisionCenter/decisionProgressModel'
import type { DecisionSignalItem } from '../../src/components/DecisionCenter/SignalCard'

function signal(partial: Partial<DecisionSignalItem> & Pick<DecisionSignalItem, 'id' | 'status'>): DecisionSignalItem {
  return {
    id: partial.id,
    tsCode: partial.tsCode ?? null,
    stockName: partial.stockName ?? null,
    conceptCode: null,
    conceptName: partial.conceptName ?? '题材',
    sourceModule: partial.sourceModule ?? 'sector_flow',
    strategyKey: partial.strategyKey ?? 'sectorFlow.auctionWatch',
    signalType: partial.signalType ?? 'OPPORTUNITY',
    direction: partial.direction ?? 'BULLISH',
    priority: partial.priority ?? 4,
    score: null,
    confidence: null,
    title: partial.title ?? '测试信号',
    summary: partial.summary ?? '',
    reasonJson: null,
    sourceRefJson: null,
    status: partial.status,
    signalTime: partial.signalTime ?? Date.now(),
    occurrenceCount: 1,
    resolvedAt: partial.resolvedAt ?? null,
    resolution: partial.resolution ?? null,
  }
}

describe('buildDecisionProgressModel', () => {
  it('counts only NEW as pending; watching is separate', () => {
    const model = buildDecisionProgressModel([
      signal({ id: 1, status: 'NEW' }),
      signal({ id: 2, status: 'NEW' }),
      signal({ id: 3, status: 'WATCHING' }),
      signal({ id: 4, status: 'READ' }),
    ])
    expect(model.pending).toBe(2)
    expect(model.watching).toBe(1)
    expect(model.read).toBe(1)
  })

  it('decrements pending when a NEW signal becomes WATCHING', () => {
    const before = buildDecisionProgressModel([
      signal({ id: 1, status: 'NEW' }),
      signal({ id: 2, status: 'NEW' }),
    ])
    const after = buildDecisionProgressModel([
      signal({ id: 1, status: 'WATCHING' }),
      signal({ id: 2, status: 'NEW' }),
    ])
    expect(before.pending).toBe(2)
    expect(after.pending).toBe(1)
    expect(after.watching).toBe(1)
  })
})

describe('buildDecisionActionQueue', () => {
  it('only keeps NEW signals in the navigation queue', () => {
    const queue = buildDecisionActionQueue([
      signal({ id: 1, status: 'NEW', title: '未读A' }),
      signal({ id: 2, status: 'WATCHING', title: '关注中' }),
      signal({ id: 3, status: 'READ', title: '已读' }),
      signal({ id: 4, status: 'NEW', title: '未读B' }),
    ], 5)
    expect(queue.map((item) => item.signal.id).sort((a, b) => a - b)).toEqual([1, 4])
    expect(queue.every((item) => item.signal.status === 'NEW')).toBe(true)
  })
})
