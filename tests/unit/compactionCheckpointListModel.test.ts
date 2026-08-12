import { describe, expect, it } from 'vitest'
import { buildCompactionCheckpointListModel } from '../../src/components/AIAnalysis/compactionCheckpointListModel'

describe('buildCompactionCheckpointListModel', () => {
  it('首条为可恢复最新，其余只读', () => {
    const model = buildCompactionCheckpointListModel([
      { id: 'a', sourceStartSequence: 1, coveredThroughSequence: 18, summary: 's1', createdAt: 200 },
      { id: 'b', sourceStartSequence: 1, coveredThroughSequence: 12, summary: 's2', createdAt: 100 },
    ])
    expect(model[0]).toMatchObject({ id: 'a', isLatest: true, canRestore: true })
    expect(model[1]).toMatchObject({ id: 'b', isLatest: false, canRestore: false })
  })

  it('空列表返回空', () => {
    expect(buildCompactionCheckpointListModel([])).toEqual([])
  })
})
