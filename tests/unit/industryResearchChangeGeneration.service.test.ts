import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSession, getSession, updateSessionMessages } from '../../electron/main/database/aiAnalysisSessionRepository'
import { runMigrations } from '../../electron/main/database/db'
import { archiveDiscussionMessages, loadFullDiscussionMessages } from '../../electron/main/database/discussionMessageArchiveRepository'
import { insertDiscussionCompaction } from '../../electron/main/database/discussionCompactionRepository'
import { createResearchDiscussionContext, getResearchDiscussionContext } from '../../electron/main/database/researchDiscussionRepository'
import { prepareDiscussionChanges } from '../../electron/main/services/industryResearchChangeGenerationService'

describe('讨论语义变更包生成服务', () => {
  let db: Database.Database
  let sessionId: number

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
    sessionId = createSession(db, {
      provider: 'qwen', model: 'test-model', articleUrls: [], promptSent: '', response: null, scanRunId: null, isError: false,
      messages: [{ role: 'user', content: '讨论供给拐点' }, { role: 'assistant', content: '需要区分规划产能和有效供给' }],
    })
    createResearchDiscussionContext(db, {
      sessionId, requestId: '00000000-0000-4000-8000-000000000030', originType: 'manual', originId: null,
      originTitle: '主动研究问题', originOccurredAt: null, originContentHash: 'context-hash',
      contextSnapshotJson: JSON.stringify({ question: '光纤供给拐点' }), contextKeysJson: '["question"]', includedContextKeysJson: '["question"]',
      returnTargetJson: JSON.stringify({ tab: 'ai-analysis' }), projectId: null, baseSnapshotId: null, baseSelectionReason: 'unassigned',
    })
  })

  it('模型返回十个主题和50项候选时聚合为七个语义包', async () => {
    const modelChangeSets = Array.from({ length: 10 }, (_, setIndex) => ({
      title: `主题 ${setIndex}`, summary: '摘要', impact: '影响研究判断', action: 'revise', risk: 'low',
      affectedObjects: [{ type: 'graph', id: null, label: `主题 ${setIndex}` }], evidenceSummary: [],
      confidenceBoundary: '来自讨论，保持估算', requiresExpandedReview: false,
      candidates: Array.from({ length: 5 }, (_, candidateIndex) => ({
        kind: 'node', action: 'add', externalRef: `N-${setIndex}-${candidateIndex}`,
        sourceLocator: `discussion:message:${candidateIndex}`, statementType: 'estimate', primarySource: false,
        payload: { name: `节点 ${setIndex}-${candidateIndex}`, type: 'product' }, conflicts: [], warnings: [],
      })),
    }))
    const callAI = vi.fn(async () => ({ provider: 'qwen' as const, model: 'test-model', text: JSON.stringify({ noMaterialChange: false, summary: '已整理', changeSets: modelChangeSets }) }))

    const result = await prepareDiscussionChanges(db, {
      requestId: '00000000-0000-4000-8000-000000000031', sessionId, throughMessageIndex: 1,
    }, callAI)

    expect(result.changeSets).toHaveLength(7)
    expect(result.batch).toMatchObject({ changeSetCount: 7, candidateCount: 50 })
    expect(result.changeSets.find((item) => item.title === '其他相关研究增量')).toMatchObject({ candidateCount: 20 })
  })

  it('按 message sequence 从归档和热尾部恢复完整原文，并只推进 sequence 游标', async () => {
    const messages = [
      { role: 'user' as const, content: '旧归档问题', sequence: 3 },
      { role: 'assistant' as const, content: '旧归档回答', sequence: 4 },
      { role: 'user' as const, content: '热问题', sequence: 5 },
      { role: 'assistant' as const, content: '热回答', sequence: 6 },
    ]
    updateSessionMessages(db, sessionId, messages)
    const stored = JSON.parse(getSession(db, sessionId)!.messages!) as Array<{ sequence: number; role: string; content: string }>
    const compaction = insertDiscussionCompaction(db, {
      sessionId,
      requestId: '00000000-0000-4000-8000-000000000034',
      sourceStartSequence: 3,
      coveredThroughSequence: 4,
      sourceMessagesHash: 'c'.repeat(64),
      summary: '累计摘要',
      summaryHash: 'd'.repeat(64),
      provider: 'qwen',
      model: 'test-model',
    })
    archiveDiscussionMessages(db, {
      sessionId,
      compactionId: compaction.id,
      messages: stored.slice(0, 2),
    })
    updateSessionMessages(db, sessionId, stored.slice(2))
    expect(JSON.parse(getSession(db, sessionId)!.messages!).map((item: { sequence: number }) => item.sequence)).toEqual([5, 6])
    expect(loadFullDiscussionMessages(db, sessionId, JSON.parse(getSession(db, sessionId)!.messages!))
      .map((item) => item.content)).toEqual(['旧归档问题', '旧归档回答', '热问题', '热回答'])

    let prompt = ''
    const callAI = vi.fn(async (_db: Database.Database, { prompt: value }: { prompt: string }) => {
      prompt = value
      return { provider: 'qwen' as const, model: 'test-model', text: JSON.stringify({ noMaterialChange: true, summary: '无变化', changeSets: [] }) }
    })
    await prepareDiscussionChanges(db, {
      requestId: '00000000-0000-4000-8000-000000000035',
      sessionId,
      throughMessageSequence: 6,
    }, callAI)

    expect(prompt).toContain('旧归档问题')
    expect(prompt).toContain('旧归档回答')
    expect(prompt).toContain('热问题')
    expect(prompt).toContain('热回答')
    expect(getResearchDiscussionContext(db, sessionId)).toMatchObject({
      summarized_through_message_sequence: 6,
      summarized_through_message_index: null,
    })
  })

  it('相同消息范围和上下文哈希幂等复用结果', async () => {
    const callAI = vi.fn(async () => ({ provider: 'qwen' as const, model: 'test-model', text: JSON.stringify({
      noMaterialChange: false,
      changeSets: [{ title: '新增假设', summary: '摘要', impact: '影响', action: 'add', risk: 'low', candidates: [{ kind: 'hypothesis', action: 'add', sourceLocator: 'discussion:message:1', statementType: 'hypothesis', payload: { statement: '价格上涨来自有效供给偏紧' } }] }],
    }) }))
    const input = { requestId: '00000000-0000-4000-8000-000000000032', sessionId, throughMessageIndex: 1 }
    const first = await prepareDiscussionChanges(db, input, callAI)
    const second = await prepareDiscussionChanges(db, { ...input, requestId: '00000000-0000-4000-8000-000000000033' }, callAI)

    expect(second.batch?.id).toBe(first.batch?.id)
    expect(callAI).toHaveBeenCalledTimes(1)
  })
})
